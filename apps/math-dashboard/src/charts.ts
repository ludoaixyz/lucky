export interface ChartDatum {
  readonly label: string;
  readonly value: number;
  readonly displayValue?: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string | number>> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function textNode(value: string, x: number, y: number, className: string): SVGTextElement {
  const node = svgElement('text', { x, y, class: className });
  node.textContent = value;
  return node;
}

export function renderBarChart(container: HTMLElement, data: readonly ChartDatum[]): void {
  container.replaceChildren();
  const width = 640;
  const height = 260;
  const margin = { top: 18, right: 16, bottom: 58, left: 54 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maximum = Math.max(...data.map((item) => item.value), 0.000001);
  const gap = 14;
  const barWidth = Math.max(18, (plotWidth - gap * (data.length + 1)) / data.length);
  const svg = svgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': data
      .map((item) => `${item.label}: ${item.displayValue ?? item.value}`)
      .join(', '),
  });
  svg.append(
    svgElement('line', {
      x1: margin.left,
      y1: margin.top + plotHeight,
      x2: width - margin.right,
      y2: margin.top + plotHeight,
      class: 'axis',
    }),
  );
  data.forEach((item, index) => {
    const barHeight = (item.value / maximum) * plotHeight;
    const x = margin.left + gap + index * (barWidth + gap);
    const y = margin.top + plotHeight - barHeight;
    svg.append(
      svgElement('rect', {
        x,
        y,
        width: barWidth,
        height: barHeight,
        rx: 5,
        class: `bar bar-${index % 3}`,
      }),
    );
    svg.append(
      textNode(
        item.displayValue ?? String(item.value),
        x + barWidth / 2,
        Math.max(14, y - 7),
        'value-label',
      ),
    );
    svg.append(textNode(item.label, x + barWidth / 2, margin.top + plotHeight + 24, 'axis-label'));
  });
  container.append(svg);
}

export function renderConfidenceChart(
  container: HTMLElement,
  estimate: number,
  interval: readonly [number, number],
  target: readonly [number, number],
  labels: {
    readonly ariaLabel: string;
    readonly estimate: string;
    readonly low: string;
    readonly high: string;
    readonly targetBand: string;
  },
): void {
  container.replaceChildren();
  const width = 640;
  const height = 180;
  const low = Math.min(interval[0], target[0]) - 0.01;
  const high = Math.max(interval[1], target[1]) + 0.01;
  const scale = (value: number): number => 48 + ((value - low) / (high - low)) * (width - 96);
  const svg = svgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': labels.ariaLabel,
  });
  svg.append(
    svgElement('rect', {
      x: scale(target[0]),
      y: 55,
      width: scale(target[1]) - scale(target[0]),
      height: 42,
      rx: 8,
      class: 'target-band',
    }),
  );
  svg.append(
    svgElement('line', {
      x1: scale(interval[0]),
      y1: 76,
      x2: scale(interval[1]),
      y2: 76,
      class: 'confidence-line',
    }),
  );
  svg.append(svgElement('circle', { cx: scale(estimate), cy: 76, r: 9, class: 'estimate-point' }));
  svg.append(textNode(labels.low, scale(interval[0]), 125, 'axis-label'));
  svg.append(textNode(labels.estimate, scale(estimate), 30, 'value-label'));
  svg.append(textNode(labels.high, scale(interval[1]), 125, 'axis-label'));
  svg.append(textNode(labels.targetBand, width / 2, 160, 'chart-note'));
  container.append(svg);
}

export function renderConvergenceChart(
  container: HTMLElement,
  points: readonly {
    readonly label: string;
    readonly spins: number;
    readonly rtp: number;
    readonly spinsDisplay: string;
    readonly compactSpinsDisplay: string;
    readonly rtpDisplay: string;
    readonly ariaLabel: string;
  }[],
): void {
  container.replaceChildren();
  const sorted = [...points].sort((a, b) => a.spins - b.spins);
  const width = 720;
  const height = 250;
  const margin = { top: 25, right: 26, bottom: 52, left: 66 };
  const xMin = Math.log10(Math.max(1, sorted[0]?.spins ?? 1));
  const xMax = Math.log10(Math.max(10, sorted.at(-1)?.spins ?? 10));
  const values = sorted.map((point) => point.rtp);
  const yMin = Math.min(...values, 0.94) - 0.01;
  const yMax = Math.max(...values, 0.97) + 0.01;
  const x = (spins: number): number =>
    margin.left +
    ((Math.log10(spins) - xMin) / Math.max(1, xMax - xMin)) * (width - margin.left - margin.right);
  const y = (rtp: number): number =>
    margin.top + ((yMax - rtp) / (yMax - yMin)) * (height - margin.top - margin.bottom);
  const svg = svgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': sorted.map((point) => point.ariaLabel).join(', '),
  });
  svg.append(
    svgElement('line', {
      x1: margin.left,
      y1: height - margin.bottom,
      x2: width - margin.right,
      y2: height - margin.bottom,
      class: 'axis',
    }),
  );
  if (sorted.length > 1) {
    const path = sorted
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.spins)} ${y(point.rtp)}`)
      .join(' ');
    svg.append(svgElement('path', { d: path, class: 'convergence-line' }));
  }
  for (const point of sorted) {
    svg.append(
      svgElement('circle', { cx: x(point.spins), cy: y(point.rtp), r: 7, class: 'estimate-point' }),
    );
    svg.append(textNode(point.rtpDisplay, x(point.spins), y(point.rtp) - 13, 'value-label'));
    svg.append(textNode(point.compactSpinsDisplay, x(point.spins), height - 22, 'axis-label'));
  }
  container.append(svg);
}

export function renderCheckpointConvergenceChart(
  container: HTMLElement,
  points: readonly {
    readonly bets: number;
    readonly simulatedRtp: number;
    readonly theoreticalRtp: number;
    readonly axisLabel: string;
    readonly rtpDisplay: string;
    readonly tooltip: string;
  }[],
  theoreticalLabel: string,
): void {
  container.replaceChildren();
  if (points.length === 0) return;
  const width = 760;
  const height = 285;
  const margin = { top: 34, right: 34, bottom: 58, left: 58 };
  const values = points.flatMap((point) => [point.simulatedRtp, point.theoreticalRtp]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max(0.01, (maximum - minimum) * 0.18);
  const yMinimum = minimum - padding;
  const yMaximum = maximum + padding;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const x = (index: number): number =>
    margin.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const y = (value: number): number =>
    margin.top + ((yMaximum - value) / (yMaximum - yMinimum)) * plotHeight;
  const theoretical = points[0]?.theoreticalRtp ?? 0;
  const svg = svgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': points.map((point) => point.tooltip).join(', '),
  });
  svg.append(
    svgElement('line', {
      x1: margin.left,
      y1: height - margin.bottom,
      x2: width - margin.right,
      y2: height - margin.bottom,
      class: 'axis',
    }),
    svgElement('line', {
      x1: margin.left,
      y1: y(theoretical),
      x2: width - margin.right,
      y2: y(theoretical),
      class: 'theoretical-line',
    }),
    textNode(theoreticalLabel, width - margin.right, 18, 'theoretical-label'),
  );
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point.simulatedRtp)}`)
    .join(' ');
  svg.append(svgElement('path', { d: path, class: 'convergence-line' }));
  points.forEach((point, index) => {
    const marker = svgElement('circle', {
      cx: x(index),
      cy: y(point.simulatedRtp),
      r: 7,
      class: 'estimate-point checkpoint-point',
    });
    const title = svgElement('title');
    title.textContent = point.tooltip;
    marker.append(title);
    svg.append(
      marker,
      textNode(point.rtpDisplay, x(index), y(point.simulatedRtp) - 13, 'value-label'),
      textNode(point.axisLabel, x(index), height - 24, 'axis-label'),
    );
  });
  container.append(svg);
}
