'use strict';

/**
 * Application error with an HTTP status and a machine-readable code.
 * The message is shown to the user, so it is worded in English.
 */
class AppError extends Error {
  constructor(message, { status = 500, code = 'internal_error', details = null } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = status < 500;
  }
}

/** Error when invoking the ntfy CLI. */
class NtfyError extends AppError {
  constructor(message, { status = 502, code = 'ntfy_error', details = null, stderr = '' } = {}) {
    super(message, { status, code, details });
    this.name = 'NtfyError';
    this.stderr = stderr;
  }
}

function badRequest(message, code = 'bad_request', details = null) {
  return new AppError(message, { status: 400, code, details });
}

function unauthorized(message = 'Authentication required') {
  return new AppError(message, { status: 401, code: 'unauthenticated' });
}

function forbidden(message = 'Insufficient permissions') {
  return new AppError(message, { status: 403, code: 'forbidden' });
}

function notFound(message = 'Object not found') {
  return new AppError(message, { status: 404, code: 'not_found' });
}

function conflict(message, code = 'conflict') {
  return new AppError(message, { status: 409, code });
}

module.exports = {
  AppError,
  NtfyError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
};
