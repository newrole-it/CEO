import {enhancePrisma} from "blitz"
import {PrismaClient} from "@prisma/client"

const EnhancedPrisma = enhancePrisma(PrismaClient)

export * from "@prisma/client"

const globalForPrisma = globalThis as unknown as {jobscannerDb?: PrismaClient}

const db = globalForPrisma.jobscannerDb ?? new EnhancedPrisma()

if (process.env.NODE_ENV !== "production") globalForPrisma.jobscannerDb = db

export default db
