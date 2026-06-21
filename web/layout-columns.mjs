const DEFAULT_RATIO = [0.25, 0.5, 0.25];
const MIN_TRACK = 0.18;

export function normalizeColumnRatio(value) {
  let ratio = value;
  if (typeof value === 'string') {
    try { ratio = JSON.parse(value); } catch { return [...DEFAULT_RATIO]; }
  }
  if (!Array.isArray(ratio) || ratio.length !== 3 || ratio.some((item) => !Number.isFinite(item) || item <= 0)) {
    return [...DEFAULT_RATIO];
  }
  const total = ratio.reduce((sum, item) => sum + item, 0);
  return ratio.map((item) => item / total);
}

export function dragBoundary(value, boundaryIndex, delta) {
  const ratio = normalizeColumnRatio(value);
  if (![0, 1].includes(boundaryIndex) || !Number.isFinite(delta)) return ratio;
  const left = boundaryIndex;
  const right = boundaryIndex + 1;
  const boundedDelta = Math.max(MIN_TRACK - ratio[left], Math.min(delta, ratio[right] - MIN_TRACK));
  ratio[left] = Number((ratio[left] + boundedDelta).toFixed(6));
  ratio[right] = Number((ratio[right] - boundedDelta).toFixed(6));
  return ratio;
}
