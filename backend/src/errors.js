import { ZodError } from 'zod';
import { fieldErrors } from './validation.js';

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (message, extra) => new HttpError(400, 'bad_request', message, extra);
export const unauthorized = () => new HttpError(401, 'unauthenticated', 'Please sign in first.');
export const forbidden = (message = 'You are not allowed to do that.') => new HttpError(403, 'forbidden', message);
export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found.`);
export const conflict = (code, message) => new HttpError(409, code, message);

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'not_found', message: 'No such API endpoint.' });
}

// Last middleware: turns every error into a JSON response. Never echoes SQL or stack traces.
export function errorHandler(log) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'validation_failed',
        message: 'Please fix the highlighted fields.',
        fields: fieldErrors(err),
      });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid_json', message: 'Request body is not valid JSON.' });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'too_large', message: 'Request body is too large.' });
    }
    // PostgreSQL constraint errors that slipped past the application checks
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'duplicate', message: 'That would create a duplicate record.' });
    }
    if (err?.code === '23514' || err?.code === '23503') {
      return res.status(409).json({ error: 'constraint', message: 'That change breaks a data rule.' });
    }
    log(`ERROR ${req.method} ${req.path}: ${err?.code || ''} ${err?.message || err}`);
    return res.status(500).json({ error: 'internal', message: 'Something went wrong on our side.' });
  };
}
