/**
 * Typed error taxonomy for airplex. Each error maps to an HTTP-ish intent
 * that API routes and server components can translate to a response.
 */

export type AirplexErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'upstream_error'
  | 'internal';

const codeToStatus: Record<AirplexErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  upstream_error: 502,
  internal: 500,
};

export class AirplexError extends Error {
  readonly code: AirplexErrorCode;
  readonly status: number;
  readonly detail?: unknown;

  constructor(code: AirplexErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = 'AirplexError';
    this.code = code;
    this.status = codeToStatus[code];
    this.detail = detail;
  }
}

export const badRequest = (m: string, d?: unknown) => new AirplexError('bad_request', m, d);
export const unauthorized = (m = 'unauthorized', d?: unknown) =>
  new AirplexError('unauthorized', m, d);
export const forbidden = (m = 'forbidden', d?: unknown) => new AirplexError('forbidden', m, d);
export const notFound = (m = 'not found', d?: unknown) => new AirplexError('not_found', m, d);
export const conflict = (m: string, d?: unknown) => new AirplexError('conflict', m, d);
export const rateLimited = (m = 'rate limited', d?: unknown) =>
  new AirplexError('rate_limited', m, d);
export const upstreamError = (m: string, d?: unknown) => new AirplexError('upstream_error', m, d);
export const internalError = (m = 'internal error', d?: unknown) =>
  new AirplexError('internal', m, d);

export function isAirplexError(e: unknown): e is AirplexError {
  return e instanceof AirplexError;
}

export function toJsonResponse(err: unknown): {
  status: number;
  body: { error: string; code: AirplexErrorCode; detail?: unknown };
} {
  if (isAirplexError(err)) {
    return {
      status: err.status,
      body: { error: err.message, code: err.code, detail: err.detail },
    };
  }
  return {
    status: 500,
    body: { error: 'internal error', code: 'internal' },
  };
}
