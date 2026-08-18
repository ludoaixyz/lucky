import { normalizeImportedReport, type NormalizationResult } from '../reports/report-normalizer.js';
import { normalizeStoredWorkbenchAnalysis } from '../reports/spin-history-csv.js';
import type { DashboardAnalysisReport } from '../types/simulation-report.js';

export const SIMULATION_WORKSPACE_STORAGE_KEY = 'lucky888.dashboard.simulation-workspace.v1';
export const MAX_SIMULATION_SETS = 3;
export type WorkspaceViewMode = 'compare' | 'detail';
export type ImportStatus = 'loaded' | 'rejected' | null;

export interface SimulationSet {
  readonly id: string;
  readonly label: string;
  readonly report: DashboardAnalysisReport | null;
  readonly sourceName?: string;
  readonly loadedAt?: string;
  readonly validationStatus: 'empty' | 'valid';
  readonly lastImportStatus: ImportStatus;
  readonly validationErrors: readonly string[];
}

export interface SimulationWorkspace {
  readonly sets: readonly SimulationSet[];
  readonly selectedSetId: string;
  readonly baselineSetId: string | null;
  readonly viewMode: WorkspaceViewMode;
}

const emptySet = (index: number): SimulationSet => ({
  id: `sim-${index}`,
  label: `Sim ${index}`,
  report: null,
  validationStatus: 'empty',
  lastImportStatus: null,
  validationErrors: [],
});

export function createWorkspace(): SimulationWorkspace {
  return Object.freeze({
    sets: Object.freeze([emptySet(1), emptySet(2), emptySet(3)]),
    selectedSetId: 'sim-1',
    baselineSetId: null,
    viewMode: 'compare',
  });
}

function updateSet(
  workspace: SimulationWorkspace,
  setId: string,
  updater: (set: SimulationSet) => SimulationSet,
): SimulationWorkspace {
  if (!workspace.sets.some((set) => set.id === setId)) return workspace;
  return {
    ...workspace,
    sets: workspace.sets.map((set) => (set.id === setId ? updater(set) : set)),
  };
}

export function importIntoSet(
  workspace: SimulationWorkspace,
  setId: string,
  result: NormalizationResult,
  sourceName: string,
  loadedAt = new Date().toISOString(),
): SimulationWorkspace {
  return updateSet(workspace, setId, (current) => {
    if (!result.ok) {
      return {
        ...current,
        lastImportStatus: 'rejected',
        validationErrors: result.errors.map((error) => error.message),
      };
    }
    return {
      ...current,
      report: result.report,
      sourceName,
      loadedAt,
      validationStatus: 'valid',
      lastImportStatus: 'loaded',
      validationErrors: [],
    };
  });
}

export function removeSetReport(
  workspace: SimulationWorkspace,
  setId: string,
): SimulationWorkspace {
  const updated = updateSet(workspace, setId, (current) => ({
    id: current.id,
    label: current.label,
    report: null,
    validationStatus: 'empty',
    lastImportStatus: null,
    validationErrors: [],
  }));
  return updated.baselineSetId === setId ? { ...updated, baselineSetId: null } : updated;
}

export function renameSet(
  workspace: SimulationWorkspace,
  setId: string,
  label: string,
): SimulationWorkspace {
  const clean = label.trim().slice(0, 40);
  return clean ? updateSet(workspace, setId, (set) => ({ ...set, label: clean })) : workspace;
}

export function selectSet(workspace: SimulationWorkspace, setId: string): SimulationWorkspace {
  return workspace.sets.some((set) => set.id === setId)
    ? { ...workspace, selectedSetId: setId }
    : workspace;
}

export function setViewMode(
  workspace: SimulationWorkspace,
  viewMode: WorkspaceViewMode,
): SimulationWorkspace {
  return { ...workspace, viewMode };
}

export function setBaseline(
  workspace: SimulationWorkspace,
  setId: string | null,
): SimulationWorkspace {
  const valid = setId === null || workspace.sets.some((set) => set.id === setId && set.report);
  return valid ? { ...workspace, baselineSetId: setId } : { ...workspace, baselineSetId: null };
}

export function findSet(workspace: SimulationWorkspace, setId: string): SimulationSet | null {
  return workspace.sets.find((set) => set.id === setId) ?? null;
}

export interface SetWarning {
  readonly setId: string;
  readonly kind: 'duplicate' | 'versionMismatch' | 'gameMismatch';
  readonly relatedSetIds: readonly string[];
}

const reportIdentity = (report: DashboardAnalysisReport): string =>
  [
    report.metadata.configurationId,
    report.metadata.generatedAt,
    report.simulation.seed,
    report.metrics.totalSpins,
  ].join('|');

export function workspaceWarnings(workspace: SimulationWorkspace): SetWarning[] {
  const valid = workspace.sets.filter(
    (set): set is SimulationSet & { report: DashboardAnalysisReport } => set.report !== null,
  );
  const warnings: SetWarning[] = [];
  for (const set of valid) {
    const duplicates = valid
      .filter(
        (other) =>
          other.id !== set.id && reportIdentity(other.report) === reportIdentity(set.report),
      )
      .map((other) => other.id);
    if (duplicates.length)
      warnings.push({ setId: set.id, kind: 'duplicate', relatedSetIds: duplicates });
    const versions = valid
      .filter(
        (other) =>
          other.id !== set.id &&
          other.report.metadata.gameVersion !== set.report.metadata.gameVersion,
      )
      .map((other) => other.id);
    if (versions.length)
      warnings.push({ setId: set.id, kind: 'versionMismatch', relatedSetIds: versions });
    const games = valid
      .filter(
        (other) =>
          other.id !== set.id && other.report.metadata.gameId !== set.report.metadata.gameId,
      )
      .map((other) => other.id);
    if (games.length) warnings.push({ setId: set.id, kind: 'gameMismatch', relatedSetIds: games });
  }
  return warnings;
}

export function persistWorkspace(
  storage: Pick<Storage, 'setItem'> | undefined,
  workspace: SimulationWorkspace,
): void {
  try {
    storage?.setItem(SIMULATION_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  } catch {
    /* Persistence is optional. */
  }
}

export function restoreWorkspace(
  storage: Pick<Storage, 'getItem'> | undefined,
): SimulationWorkspace | null {
  try {
    const raw = storage?.getItem(SIMULATION_WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const sets = record.sets;
    if (!Array.isArray(sets) || sets.length !== MAX_SIMULATION_SETS) return null;
    let restored = createWorkspace();
    sets.forEach((candidate: unknown, index: number) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return;
      const setRecord = candidate as Record<string, unknown>;
      const id = `sim-${index + 1}`;
      const label =
        typeof setRecord.label === 'string' && setRecord.label.trim()
          ? setRecord.label
          : `Sim ${index + 1}`;
      restored = renameSet(restored, id, label);
      if (setRecord.report) {
        const result =
          (setRecord.report as { sourceType?: unknown }).sourceType === 'workbench-session'
            ? normalizeStoredWorkbenchAnalysis(setRecord.report)
            : normalizeImportedReport(setRecord.report);
        const sourceName =
          typeof setRecord.sourceName === 'string' ? setRecord.sourceName : 'restored report';
        const loadedAt =
          typeof setRecord.loadedAt === 'string' ? setRecord.loadedAt : new Date(0).toISOString();
        if (result.ok) restored = importIntoSet(restored, id, result, sourceName, loadedAt);
      }
    });
    const selected =
      typeof record.selectedSetId === 'string' &&
      restored.sets.some((set) => set.id === record.selectedSetId)
        ? record.selectedSetId
        : 'sim-1';
    restored = selectSet(restored, selected);
    restored = setViewMode(restored, record.viewMode === 'detail' ? 'detail' : 'compare');
    restored = setBaseline(
      restored,
      typeof record.baselineSetId === 'string' ? record.baselineSetId : null,
    );
    return restored;
  } catch {
    return null;
  }
}
