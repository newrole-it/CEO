import { NotFoundError } from "src/shared/errors"
import { CvError } from "src/server/cv/service"

/** Maps CV domain errors to errors the client understands (the message carries the code). */
export function rethrowCv(error: unknown): never {
  if (error instanceof CvError) {
    if (error.code === "not-found") throw new NotFoundError(error.message)
    throw new Error(error.code)
  }
  throw error
}
