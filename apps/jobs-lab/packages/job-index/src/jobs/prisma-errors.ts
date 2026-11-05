import { Prisma } from "@newrole/jobs-lab-db"

/** A create raced another writer on a unique key. Callers re-read the row instead of failing. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}
