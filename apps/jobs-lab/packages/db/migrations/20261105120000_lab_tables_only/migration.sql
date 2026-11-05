-- The lab's first migration of its own. Everything before it is newrole.it's history, copied as it
-- was so a lab database migrated with newrole.it's migrations carries on. This drops the tables only
-- newrole.it uses; the offer index keeps its own (schema.prisma).
-- Generated with: prisma migrate diff --from-schema-datamodel apps/resume-engine-optimization/db/schema.prisma --to-schema-datamodel apps/jobs-lab/packages/db/schema.prisma --script

-- Stop before dropping anything when a table that holds a person's records (sign-in, CVs,
-- applications, answers, links, mail) has rows: the lab never writes them, so this would be
-- newrole.it's own data or a copy of it. Nothing is changed then. ServiceHeartbeat and LlmCall
-- hold only service state and counts, with no user, and go either way.
DO $$
DECLARE
  tbl text;
  found boolean;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['Session', 'Token', 'LoginLink', 'AuthRateLimit', 'ProfileAuditRun', 'LlmCache', 'AuditEvent', 'Application', 'ApplicationEvent', 'CvDocument', 'UserOffer', 'CvVersion', 'Answer', 'ApiToken', 'SheetLink', 'SheetRow', 'GmailLink', 'MailEvent'] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', tbl) INTO found;
    IF found THEN
      RAISE EXCEPTION 'jobs lab: table "%" holds rows, so this is not a lab database; nothing was dropped', tbl;
    END IF;
  END LOOP;
END $$;

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "Token" DROP CONSTRAINT "Token_userId_fkey";

-- DropForeignKey
ALTER TABLE "ProfileAuditRun" DROP CONSTRAINT "ProfileAuditRun_userId_fkey";

-- DropForeignKey
ALTER TABLE "LlmCache" DROP CONSTRAINT "LlmCache_userId_fkey";

-- DropForeignKey
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_userId_fkey";

-- DropForeignKey
ALTER TABLE "Application" DROP CONSTRAINT "Application_userId_fkey";

-- DropForeignKey
ALTER TABLE "Application" DROP CONSTRAINT "Application_jobId_fkey";

-- DropForeignKey
ALTER TABLE "Application" DROP CONSTRAINT "Application_cvDocumentId_fkey";

-- DropForeignKey
ALTER TABLE "ApplicationEvent" DROP CONSTRAINT "ApplicationEvent_applicationId_fkey";

-- DropForeignKey
ALTER TABLE "CvDocument" DROP CONSTRAINT "CvDocument_userId_fkey";

-- DropForeignKey
ALTER TABLE "CvDocument" DROP CONSTRAINT "CvDocument_jobId_fkey";

-- DropForeignKey
ALTER TABLE "CvDocument" DROP CONSTRAINT "CvDocument_baseCvId_fkey";

-- DropForeignKey
ALTER TABLE "UserOffer" DROP CONSTRAINT "UserOffer_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserOffer" DROP CONSTRAINT "UserOffer_jobId_fkey";

-- DropForeignKey
ALTER TABLE "CvVersion" DROP CONSTRAINT "CvVersion_documentId_fkey";

-- DropForeignKey
ALTER TABLE "Answer" DROP CONSTRAINT "Answer_userId_fkey";

-- DropForeignKey
ALTER TABLE "Answer" DROP CONSTRAINT "Answer_applicationId_fkey";

-- DropForeignKey
ALTER TABLE "ApiToken" DROP CONSTRAINT "ApiToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "SheetLink" DROP CONSTRAINT "SheetLink_userId_fkey";

-- DropForeignKey
ALTER TABLE "SheetRow" DROP CONSTRAINT "SheetRow_applicationId_fkey";

-- DropForeignKey
ALTER TABLE "GmailLink" DROP CONSTRAINT "GmailLink_userId_fkey";

-- DropForeignKey
ALTER TABLE "MailEvent" DROP CONSTRAINT "MailEvent_userId_fkey";

-- DropForeignKey
ALTER TABLE "MailEvent" DROP CONSTRAINT "MailEvent_applicationId_fkey";

-- DropTable
DROP TABLE "Session";

-- DropTable
DROP TABLE "Token";

-- DropTable
DROP TABLE "LoginLink";

-- DropTable
DROP TABLE "AuthRateLimit";

-- DropTable
DROP TABLE "ProfileAuditRun";

-- DropTable
DROP TABLE "LlmCache";

-- DropTable
DROP TABLE "LlmCall";

-- DropTable
DROP TABLE "AuditEvent";

-- DropTable
DROP TABLE "Application";

-- DropTable
DROP TABLE "ApplicationEvent";

-- DropTable
DROP TABLE "CvDocument";

-- DropTable
DROP TABLE "UserOffer";

-- DropTable
DROP TABLE "CvVersion";

-- DropTable
DROP TABLE "Answer";

-- DropTable
DROP TABLE "ApiToken";

-- DropTable
DROP TABLE "ServiceHeartbeat";

-- DropTable
DROP TABLE "SheetLink";

-- DropTable
DROP TABLE "SheetRow";

-- DropTable
DROP TABLE "GmailLink";

-- DropTable
DROP TABLE "MailEvent";

