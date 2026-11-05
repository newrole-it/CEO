-- What was answered in one application form, and the salary stated in it.
ALTER TABLE "Application" ADD COLUMN "statedSalary" TEXT;
ALTER TABLE "Application" ADD COLUMN "formAnswers" JSONB NOT NULL DEFAULT '[]';
