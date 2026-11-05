-- CreateTable
CREATE TABLE "UserOffer" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "jobId" TEXT NOT NULL,
    "text" TEXT,
    "textOrigin" TEXT,
    "textReadAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserOffer_userId_createdAt_idx" ON "UserOffer"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserOffer_userId_jobId_key" ON "UserOffer"("userId", "jobId");

-- AddForeignKey
ALTER TABLE "UserOffer" ADD CONSTRAINT "UserOffer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOffer" ADD CONSTRAINT "UserOffer_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
