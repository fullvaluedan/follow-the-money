/** SVG sparkline path builder from price points. */

export interface Sparkline {
  path: string;
  area: string;
  up: boolean;
  changePct: number;
}

/** Build a normalized polyline path for the last `points` closes. */
export function buildSparkline(
  closes: Array<{ date: string; close: number }>,
  width = 72,
  height = 28,
): Sparkline | null {
  if (closes.length < 2) return null;
  const vals = closes.map((c) => c.close);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const step = width / (vals.length - 1);
  const pts = vals.map((v, i) => {
    const x = (i * step).toFixed(1);
    const y = (height - 2 - ((v - min) / range) * (height - 4)).toFixed(1);
    return `${x},${y}`;
  });
  const path = 'M' + pts.join(' L');
  const area = path + ` L${width},${height} L0,${height} Z`;
  const first = vals[0];
  const last = vals[vals.length - 1];
  return {
    path,
    area,
    up: last >= first,
    changePct: Number((((last - first) / first) * 100).toFixed(1)),
  };
}
