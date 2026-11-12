import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "./client"

export * from "@prisma/client"

const globalForPrisma = globalThis as unknown as { jobscannerDb?: PrismaClient }

const db = globalForPrisma.jobscannerDb ?? new PrismaClient({ adapter: pgAdapter() })

if (process.env.NODE_ENV !== "production") globalForPrisma.jobscannerDb = db

export default db
