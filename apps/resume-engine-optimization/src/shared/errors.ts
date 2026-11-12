/**
 * The errors resolvers throw and the interface tells apart, with the names and status codes Blitz
 * gave them. A resolver's error reaches the browser as { name, message } (src/app/rpc.ts) and is
 * rebuilt there as the same class, so `instanceof` and `error.name` work on both sides.
 */

export class AuthenticationError extends Error {
  name = "AuthenticationError"
  statusCode = 401
  constructor(message = "You must be logged in to access this") {
    super(message)
  }
}

export class AuthorizationError extends Error {
  name = "AuthorizationError"
  statusCode = 403
  constructor(message = "You are not authorized to access this") {
    super(message)
  }
}

export class NotFoundError extends Error {
  name = "NotFoundError"
  statusCode = 404
  constructor(message = "This could not be found") {
    super(message)
  }
}

const KNOWN: Record<string, new (message?: string) => Error> = {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
}

/** An error as it crosses from the server to the browser. */
export type WireError = { name: string; message: string; code?: unknown; statusCode?: number }

export function toWireError(error: unknown): WireError {
  const e = error as { name?: unknown; message?: unknown; code?: unknown; statusCode?: unknown }
  return {
    name: typeof e?.name === "string" ? e.name : "Error",
    message: typeof e?.message === "string" ? e.message : "",
    ...(e?.code !== undefined ? { code: e.code } : {}),
    ...(typeof e?.statusCode === "number" ? { statusCode: e.statusCode } : {}),
  }
}

export function fromWireError(wire: WireError): Error {
  const Known = KNOWN[wire.name]
  const error = Known ? new Known(wire.message) : new Error(wire.message)
  error.name = wire.name
  if (wire.code !== undefined) Object.assign(error, { code: wire.code })
  if (wire.statusCode !== undefined) Object.assign(error, { statusCode: wire.statusCode })
  return error
}
