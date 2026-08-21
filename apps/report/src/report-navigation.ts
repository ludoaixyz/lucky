export interface ReportSection {
  readonly id: string;
  readonly label: string;
}

const sectionPattern = /^(?:[1-3]\.\s|[A-E]\.\s)/u;

export function buildReportNavigation(root: HTMLElement): ReportSection[] {
  const sections: ReportSection[] = [];
  const seen = new Set<string>();
  root.querySelectorAll<HTMLElement>('p, h1, h2, h3').forEach((node) => {
    const label = node.textContent?.trim() ?? '';
    if (!sectionPattern.test(label) || label.length > 80 || seen.has(label)) return;
    seen.add(label);
    const id = `report-section-${String(sections.length + 1).padStart(2, '0')}`;
    node.id = id;
    node.classList.add('report-anchor');
    sections.push({ id, label });
  });
  return sections;
}

export function renderContents(container: HTMLElement, sections: readonly ReportSection[]): void {
  const list = document.createElement('ol');
  for (const section of sections) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${section.id}`;
    link.textContent = section.label;
    item.append(link);
    list.append(item);
  }
  container.replaceChildren(list);
}
