import test from 'node:test';
import assert from 'node:assert/strict';

import {
  setStyleChecked,
  toggleAllVisible,
  visibleStyles,
} from '../style-selection.mjs';

test('setStyleChecked keeps first-seen order, removes unchecked ids, and appends reselected ids to the end', () => {
  const selected = ['film', 'sticker', 'film'];

  const checked = setStyleChecked(selected, 'film', true);
  assert.deepEqual(checked, ['film', 'sticker']);
  assert.deepEqual(selected, ['film', 'sticker', 'film']);

  const unchecked = setStyleChecked(checked, 'film', false);
  assert.deepEqual(unchecked, ['sticker']);

  const reselected = setStyleChecked(unchecked, 'film', true);
  assert.deepEqual(reselected, ['sticker', 'film']);
  assert.deepEqual(unchecked, ['sticker']);
});

test('setStyleChecked keeps valid ids and rejects whitespace, punctuation, and path-like ids', () => {
  const selected = [' film ', 'ABC123', 'カメラ', 'ABC123', '中文123', 'a-b', 'under_score', '../x'];

  const checked = setStyleChecked(selected, '日本語9', true);
  assert.deepEqual(checked, ['ABC123', 'カメラ', '中文123', '日本語9']);
  assert.deepEqual(selected, [' film ', 'ABC123', 'カメラ', 'ABC123', '中文123', 'a-b', 'under_score', '../x']);

  assert.deepEqual(setStyleChecked(checked, ' film ', true), ['ABC123', 'カメラ', '中文123', '日本語9']);
  assert.deepEqual(setStyleChecked(checked, 'a-b', true), ['ABC123', 'カメラ', '中文123', '日本語9']);
  assert.deepEqual(setStyleChecked(checked, '../x', true), ['ABC123', 'カメラ', '中文123', '日本語9']);
  assert.deepEqual(setStyleChecked(checked, 'under_score', true), ['ABC123', 'カメラ', '中文123', '日本語9']);
  assert.deepEqual(setStyleChecked(null, '中文123', true), ['中文123']);
});

test('toggleAllVisible keeps valid visible ids and ignores invalid visible ids', () => {
  const hiddenSelected = ['hidden', 'カメラ', '中文123'];

  const added = toggleAllVisible(hiddenSelected, [' カメラ', 'カメラ', '../x', '中文123', '日本語9', 'under_score']);
  assert.deepEqual(added, ['hidden', 'カメラ', '中文123', '日本語9']);
  assert.deepEqual(hiddenSelected, ['hidden', 'カメラ', '中文123']);

  const removed = toggleAllVisible(added, ['カメラ', '../x', '中文123', '日本語9']);
  assert.deepEqual(removed, ['hidden']);

  const reordered = toggleAllVisible(['hidden', '中文123'], ['カメラ', '中文123', '日本語9']);
  assert.deepEqual(reordered, ['hidden', '中文123', 'カメラ', '日本語9']);
});

test('toggleAllVisible ignores invalid input and preserves hidden selections', () => {
  const selected = ['hidden'];

  assert.deepEqual(toggleAllVisible(selected, []), ['hidden']);
  assert.deepEqual(toggleAllVisible(selected, null), ['hidden']);
  assert.deepEqual(toggleAllVisible(null, ['film']), ['film']);
  assert.deepEqual(selected, ['hidden']);
});

test('visibleStyles returns only styles where generated is not true when onlyUngenerated is true', () => {
  const styles = [
    { id: 'film', generated: true },
    { id: 'sticker', generated: false },
    { id: 'paper' },
  ];

  const visible = visibleStyles(styles, true);
  assert.deepEqual(visible, [
    { id: 'sticker', generated: false },
    { id: 'paper' },
  ]);
  assert.notEqual(visible, styles);
  assert.deepEqual(styles, [
    { id: 'film', generated: true },
    { id: 'sticker', generated: false },
    { id: 'paper' },
  ]);
});

test('visibleStyles returns a fresh full list when onlyUngenerated is false', () => {
  const styles = [{ id: 'film', generated: true }];

  const visible = visibleStyles(styles, false);
  assert.deepEqual(visible, styles);
  assert.notEqual(visible, styles);
  assert.deepEqual(visibleStyles(null, false), []);
});
