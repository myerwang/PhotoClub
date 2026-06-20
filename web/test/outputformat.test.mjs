import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../lib/errors.mjs';
import { CUSTOM_FORMAT_ID, orientFormat, resolveCustomFormat } from '../lib/outputformat.mjs';

function assertAppError(error, code, status = 400) {
  assert.ok(error instanceof AppError, 'expected an AppError');
  assert.equal(error.code, code);
  assert.equal(error.status, status);
}

test('exports the custom format id', () => {
  assert.equal(CUSTOM_FORMAT_ID, 'custom');
});

test('orients a preset format to portrait and landscape without mutating the input', () => {
  const preset = {
    id: 'preset_1200x1800',
    label: 'Preset',
    width: 1200,
    height: 1800,
    source: 'registry',
  };
  const snapshot = structuredClone(preset);

  const portrait = orientFormat(preset, 'portrait');
  const landscape = orientFormat(preset, 'landscape');

  assert.deepEqual(portrait, {
    id: 'preset_1200x1800',
    label: 'Preset',
    width: 1200,
    height: 1800,
    source: 'registry',
  });
  assert.deepEqual(landscape, {
    id: 'preset_1200x1800',
    label: 'Preset',
    width: 1800,
    height: 1200,
    source: 'registry',
  });
  assert.notStrictEqual(portrait, preset);
  assert.notStrictEqual(landscape, preset);
  assert.deepEqual(preset, snapshot);
});

test('rejects an invalid orientation', () => {
  assert.throws(() => orientFormat({ width: 1200, height: 1800 }, 'square'), (error) => {
    assertAppError(error, 'ORIENTATION_INVALID');
    return true;
  });
});

test('rejects invalid preset dimensions', () => {
  for (const preset of [
    { width: 0, height: 1800 },
    { width: -1, height: 1800 },
    { width: 1200.5, height: 1800 },
    { width: Number.NaN, height: 1800 },
    { width: Number.POSITIVE_INFINITY, height: 1800 },
    { width: Number.NEGATIVE_INFINITY, height: 1800 },
    { width: '1200', height: 1800 },
    { width: 1200, height: 0 },
    { width: 1200, height: -1 },
    { width: 1200, height: 1800.5 },
    { width: 1200, height: Number.NaN },
    { width: 1200, height: Number.POSITIVE_INFINITY },
    { width: 1200, height: Number.NEGATIVE_INFINITY },
    { width: 1200, height: '1800' },
    {},
    { width: 1200 },
    { height: 1800 },
    null,
    'preset',
    [],
  ]) {
    assert.throws(() => orientFormat(preset, 'portrait'), (error) => {
      assertAppError(error, 'CUSTOM_FORMAT_INVALID');
      return true;
    });
  }
});

test('rejects invalid orientation through resolveCustomFormat', () => {
  assert.throws(() => resolveCustomFormat({ shortEdge: 256, longEdge: 512 }, 'square'), (error) => {
    assertAppError(error, 'ORIENTATION_INVALID');
    return true;
  });
});

test('returns portrait and landscape custom formats', () => {
  assert.deepEqual(resolveCustomFormat({ shortEdge: 256, longEdge: 256 }, 'portrait'), {
    id: 'custom_256x256',
    label: 'Custom 256 x 256',
    width: 256,
    height: 256,
  });

  assert.deepEqual(resolveCustomFormat({ shortEdge: 256, longEdge: 512 }, 'landscape'), {
    id: 'custom_256x512',
    label: 'Custom 256 x 512',
    width: 512,
    height: 256,
  });
});

test('accepts the largest long edge when the area stays within 40 million pixels', () => {
  assert.deepEqual(resolveCustomFormat({ shortEdge: 4882, longEdge: 8192 }, 'portrait'), {
    id: 'custom_4882x8192',
    label: 'Custom 4882 x 8192',
    width: 4882,
    height: 8192,
  });

  assert.throws(() => resolveCustomFormat({ shortEdge: 4883, longEdge: 8192 }, 'portrait'), (error) => {
    assertAppError(error, 'CUSTOM_FORMAT_INVALID');
    return true;
  });
});

test('accepts exactly 40 million pixels and rejects anything larger', () => {
  assert.deepEqual(resolveCustomFormat({ shortEdge: 5000, longEdge: 8000 }, 'portrait'), {
    id: 'custom_5000x8000',
    label: 'Custom 5000 x 8000',
    width: 5000,
    height: 8000,
  });

  assert.throws(() => resolveCustomFormat({ shortEdge: 5000, longEdge: 8001 }, 'portrait'), (error) => {
    assertAppError(error, 'CUSTOM_FORMAT_INVALID');
    return true;
  });
});

test('rejects missing custom format payloads', () => {
  for (const customFormat of [undefined, null, []]) {
    assert.throws(() => resolveCustomFormat(customFormat, 'portrait'), (error) => {
      assertAppError(error, 'CUSTOM_FORMAT_REQUIRED');
      return true;
    });
  }
});

test('rejects primitive custom format payloads', () => {
  for (const customFormat of ['custom', 0, 1, false, true, Symbol('custom')]) {
    assert.throws(() => resolveCustomFormat(customFormat, 'portrait'), (error) => {
      assertAppError(error, 'CUSTOM_FORMAT_REQUIRED');
      return true;
    });
  }
});

test('rejects custom payloads with missing edges', () => {
  for (const customFormat of [
    {},
    { shortEdge: 256 },
    { longEdge: 256 },
    { shortEdge: undefined, longEdge: 256 },
    { shortEdge: 256, longEdge: undefined },
    { shortEdge: null, longEdge: 256 },
    { shortEdge: 256, longEdge: null },
  ]) {
    assert.throws(() => resolveCustomFormat(customFormat, 'portrait'), (error) => {
      assertAppError(error, 'CUSTOM_FORMAT_REQUIRED');
      return true;
    });
  }
});

test('rejects invalid custom dimensions and reversed edges', () => {
  for (const customFormat of [
    { shortEdge: '256', longEdge: 512 },
    { shortEdge: 256, longEdge: '512' },
    { shortEdge: Number.NaN, longEdge: 512 },
    { shortEdge: 256, longEdge: Number.NaN },
    { shortEdge: 256.5, longEdge: 512 },
    { shortEdge: 256, longEdge: 512.5 },
    { shortEdge: 0, longEdge: 512 },
    { shortEdge: 256, longEdge: 0 },
    { shortEdge: 255, longEdge: 512 },
    { shortEdge: 256, longEdge: 8193 },
    { shortEdge: 512, longEdge: 256 },
  ]) {
    assert.throws(() => resolveCustomFormat(customFormat, 'portrait'), (error) => {
      assertAppError(error, 'CUSTOM_FORMAT_INVALID');
      return true;
    });
  }
});
