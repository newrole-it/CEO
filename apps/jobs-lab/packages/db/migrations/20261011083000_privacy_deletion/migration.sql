-- CV and search prompts must be removable with the account that created them.
ALTER TABLE "LlmCache" ADD COLUMN "userId" INTEGER;

CREATE INDEX "LlmCache_userId_idx" ON "LlmCache"("userId");

ALTER TABLE "LlmCache" ADD CONSTRAINT "LlmCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A deleted search used to leave its web query behind with a null search run.
DELETE FROM "DiscoveryRun" WHERE "searchRunId" IS NULL;

ALTER TABLE "DiscoveryRun" DROP CONSTRAINT "DiscoveryRun_searchRunId_fkey";

ALTER TABLE "DiscoveryRun" ADD CONSTRAINT "DiscoveryRun_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
