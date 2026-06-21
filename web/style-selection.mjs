function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const SAFE_STYLE_ID = /^[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]+$/u;

function isStyleId(value) {
  return typeof value === 'string' && SAFE_STYLE_ID.test(value);
}

function uniqueStyles(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!isStyleId(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function setStyleChecked(selected, id, checked) {
  const current = uniqueStyles(asArray(selected));
  if (!isStyleId(id) || typeof checked !== 'boolean') return current;
  if (checked) {
    return current.includes(id) ? current : [...current, id];
  }
  return current.filter((item) => item !== id);
}

export function toggleAllVisible(selected, visibleIds) {
  const current = uniqueStyles(asArray(selected));
  const visible = uniqueStyles(asArray(visibleIds));
  if (!visible.length) return current;

  const visibleSet = new Set(visible);
  const allVisibleSelected = visible.every((id) => current.includes(id));
  if (allVisibleSelected) {
    return current.filter((id) => !visibleSet.has(id));
  }

  const result = [...current];
  for (const id of visible) {
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

export function visibleStyles(styles, onlyUngenerated) {
  const current = asArray(styles).slice();
  if (onlyUngenerated !== true) return current;
  return current.filter((style) => style?.generated !== true);
}
