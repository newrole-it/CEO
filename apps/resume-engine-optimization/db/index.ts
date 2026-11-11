import { enhancePrisma } from "blitz"
import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "./client"

const EnhancedPrisma = enhancePrisma(PrismaClient)
type DbClient = InstanceType<typeof EnhancedPrisma>

export * from "@prisma/client"

const globalForPrisma = globalThis as unknown as { jobscannerDb?: DbClient }

const db = globalForPrisma.jobscannerDb ?? new EnhancedPrisma({ adapter: pgAdapter() })

if (process.env.NODE_ENV !== "production") globalForPrisma.jobscannerDb = db

export default db
