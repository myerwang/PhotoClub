import { AppError } from './errors.mjs';

export const CUSTOM_FORMAT_ID = 'custom';

function invalidCustomFormat(message, details) {
  return new AppError('CUSTOM_FORMAT_INVALID', message, 400, details);
}

function requireCustomFormat(message, details) {
  return new AppError('CUSTOM_FORMAT_REQUIRED', message, 400, details);
}

function assertOrientation(orientation) {
  if (orientation !== 'portrait' && orientation !== 'landscape') {
    throw new AppError('ORIENTATION_INVALID', '照片方向必须是纵向或横向', 400);
  }
}

function assertValidDimensions(format) {
  if (
    format === null
    || typeof format !== 'object'
    || Array.isArray(format)
    || !Number.isFinite(format.width)
    || !Number.isFinite(format.height)
    || !Number.isInteger(format.width)
    || !Number.isInteger(format.height)
    || format.width <= 0
    || format.height <= 0
  ) {
    throw invalidCustomFormat('输出格式尺寸无效');
  }
}

export function orientFormat(format, orientation) {
  assertOrientation(orientation);
  assertValidDimensions(format);

  const shortEdge = Math.min(format.width, format.height);
  const longEdge = Math.max(format.width, format.height);
  const isLandscape = orientation === 'landscape';

  return {
    ...format,
    width: isLandscape ? longEdge : shortEdge,
    height: isLandscape ? shortEdge : longEdge,
  };
}

export function resolveCustomFormat(customFormat, orientation) {
  if (
    customFormat === null
    || typeof customFormat !== 'object'
    || Array.isArray(customFormat)
    || customFormat.shortEdge === undefined
    || customFormat.longEdge === undefined
    || customFormat.shortEdge === null
    || customFormat.longEdge === null
  ) {
    throw requireCustomFormat('自定义输出格式必需');
  }

  const { shortEdge, longEdge } = customFormat;
  if (
    !Number.isInteger(shortEdge)
    || !Number.isInteger(longEdge)
    || shortEdge < 256
    || longEdge < 256
    || shortEdge > 8192
    || longEdge > 8192
    || shortEdge > longEdge
    || shortEdge * longEdge > 40_000_000
  ) {
    throw invalidCustomFormat('自定义输出格式尺寸无效');
  }

  return orientFormat({
    id: `${CUSTOM_FORMAT_ID}_${shortEdge}x${longEdge}`,
    label: `Custom ${shortEdge} x ${longEdge}`,
    width: shortEdge,
    height: longEdge,
  }, orientation);
}
