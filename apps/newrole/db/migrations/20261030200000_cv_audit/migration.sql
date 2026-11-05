-- The latest audit of a CV, shown on the sheet in the editor.
ALTER TABLE "CvDocument" ADD COLUMN "audit" JSONB;
