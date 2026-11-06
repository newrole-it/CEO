-- A version can keep its PDF: the uploaded original (number 0) or a PDF that left the app.
ALTER TABLE "CvVersion" ADD COLUMN "pdf" BYTEA;
ALTER TABLE "CvVersion" ADD COLUMN "pdfName" TEXT;
