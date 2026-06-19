export class AppError extends Error {
  constructor(code, message, status = 500, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function asAppError(error) {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError('INTERNAL_ERROR', '服务器内部错误', 500);
}

export function errorPayload(error) {
  const safeError = asAppError(error);
  const payload = {
    code: safeError.code,
    message: safeError.message,
  };

  if (safeError.details !== undefined) {
    payload.details = safeError.details;
  }

  return { error: payload };
}
