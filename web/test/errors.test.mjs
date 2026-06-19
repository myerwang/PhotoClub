import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError, asAppError, errorPayload } from '../lib/errors.mjs';

test('serializes a safe structured error', () => {
  const payload = errorPayload(
    new AppError('STYLE_INVALID', '风格配置无效', 422, { styleId: 'sticker' }),
  );

  assert.deepEqual(payload, {
    error: {
      code: 'STYLE_INVALID',
      message: '风格配置无效',
      details: { styleId: 'sticker' },
    },
  });
});

test('maps unknown errors without exposing their details', () => {
  const source = new Error('secret filesystem detail');
  const error = asAppError(source);

  assert.equal(error.code, 'INTERNAL_ERROR');
  assert.equal(error.status, 500);
  assert.deepEqual(errorPayload(error), {
    error: {
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    },
  });
});
