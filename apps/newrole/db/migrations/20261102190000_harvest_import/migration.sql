-- CreateTable
CREATE TABLE "HarvestImport" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "branches" JSONB NOT NULL DEFAULT '[]',
    "applied" JSONB NOT NULL DEFAULT '[]',
    "boards" INTEGER NOT NULL DEFAULT 0,
    "stored" INTEGER NOT NULL DEFAULT 0,
    "closed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "HarvestImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HarvestImport_startedAt_idx" ON "HarvestImport"("startedAt");
