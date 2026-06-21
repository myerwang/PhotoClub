import test from 'node:test';
import assert from 'node:assert/strict';
import { dragBoundary, normalizeColumnRatio } from '../layout-columns.mjs';

test('defaults to a normalized 2:4:2 ratio', () => {
  assert.deepEqual(normalizeColumnRatio(null), [0.25, 0.5, 0.25]);
  assert.deepEqual(normalizeColumnRatio('[2,4,2]'), [0.25, 0.5, 0.25]);
  assert.deepEqual(normalizeColumnRatio('broken'), [0.25, 0.5, 0.25]);
});

test('moves one boundary while preserving total and minimum tracks', () => {
  assert.deepEqual(dragBoundary([0.25, 0.5, 0.25], 0, 0.1), [0.35, 0.4, 0.25]);
  assert.deepEqual(dragBoundary([0.25, 0.5, 0.25], 1, 0.5), [0.25, 0.57, 0.18]);
});
