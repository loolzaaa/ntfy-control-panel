'use strict';

/**
 * Express error handler. Normalizes any errors to a single JSON format.
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = Number.isInteger(err.status) && err.status >= 400 ? err.status : 500;
  const code = err.code || 'internal_error';
  const expose = err.expose === true || status < 500;
  const message = expose && err.message ? err.message : 'Internal server error';

  if (status >= 500) {
    // Write technical details only to the server log, do not send them to the client.
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message);
    if (err.stderr) {
      console.error('[error] ntfy stderr:', err.stderr);
    }
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}

function apiNotFoundHandler(req, res, next) {
  if (req.path.startsWith('/api/') || req.path === '/api') {
    return res.status(404).json({
      error: { code: 'not_found', message: 'Requested route not found' },
    });
  }
  return next();
}

module.exports = { errorHandler, apiNotFoundHandler };
