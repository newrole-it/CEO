ALTER TABLE "Company" ADD COLUMN "isTech" BOOLEAN;

ALTER TABLE "Job" ADD COLUMN "seniorityLevel" TEXT;
ALTER TABLE "Job" ADD COLUMN "isTechRole" BOOLEAN;
ALTER TABLE "Job" ADD COLUMN "classifiedAt" TIMESTAMP(3);

CREATE INDEX "Job_status_classifiedAt_idx" ON "Job"("status", "classifiedAt");
