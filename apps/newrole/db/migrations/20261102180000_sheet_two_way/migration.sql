-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "origin" TEXT;

-- AlterTable
ALTER TABLE "SheetLink" ADD COLUMN     "tabName" TEXT NOT NULL DEFAULT 'Aplikacje';

-- CreateTable
CREATE TABLE "SheetRow" (
    "applicationId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetRow_pkey" PRIMARY KEY ("applicationId")
);

-- AddForeignKey
ALTER TABLE "SheetRow" ADD CONSTRAINT "SheetRow_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

