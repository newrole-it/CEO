-- A person's reusable interview stories (situation, task, action, result, reflection).
CREATE TABLE "InterviewStory" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "situation" TEXT NOT NULL DEFAULT '',
    "task" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL DEFAULT '',
    "reflection" TEXT NOT NULL DEFAULT '',
    "themes" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'SAVED',
    "checks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewStory_pkey" PRIMARY KEY ("id")
);

-- The latest interview preparation of a person for one offer.
CREATE TABLE "InterviewPrep" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "jobId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "reader" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewPrep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewStory_userId_status_updatedAt_idx" ON "InterviewStory"("userId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewPrep_userId_jobId_key" ON "InterviewPrep"("userId", "jobId");

-- AddForeignKey
ALTER TABLE "InterviewStory" ADD CONSTRAINT "InterviewStory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPrep" ADD CONSTRAINT "InterviewPrep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPrep" ADD CONSTRAINT "InterviewPrep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
