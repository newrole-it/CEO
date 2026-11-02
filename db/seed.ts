import { PrismaClient } from "@prisma/client"
import { SecurePassword } from "@blitzjs/auth/secure-password"
import { seedBoards } from "../config/seed-boards"
import { canonicalUrl } from "../src/server/jobs/dedupe"
import { normalizeCompanyName } from "../src/server/jobs/normalize"
import { assertSafeProductionEnv } from "../src/server/security/env-check"

const db = new PrismaClient()

const SOURCES = [
  {
    sourceName: "greenhouse",
    sourceType: "GREENHOUSE",
    sourceUrl: "https://developers.greenhouse.io/job-board.html",
    termsUrl: "https://www.greenhouse.com/legal/terms-of-service",
  },
  {
    sourceName: "lever",
    sourceType: "LEVER",
    sourceUrl: "https://github.com/lever/postings-api",
    termsUrl: "https://www.lever.co/terms-of-service/",
  },
  {
    sourceName: "ashby",
    sourceType: "ASHBY",
    sourceUrl: "https://developers.ashbyhq.com/docs/public-job-posting-api",
    termsUrl: "https://www.ashbyhq.com/terms",
  },
  {
    sourceName: "workable",
    sourceType: "WORKABLE",
    sourceUrl: "https://apply.workable.com/api/v1/widget/accounts/{account}",
    termsUrl: "https://www.workable.com/terms",
  },
  {
    sourceName: "smartrecruiters",
    sourceType: "SMARTRECRUITERS",
    sourceUrl: "https://developers.smartrecruiters.com/docs/posting-api",
    termsUrl: "https://www.smartrecruiters.com/legal/terms-of-use/",
  },
  {
    sourceName: "web_search",
    sourceType: "WEB_SEARCH",
    sourceUrl: "https://brave.com/search/api/",
    termsUrl: "https://brave.com/terms-of-use/",
  },
  {
    sourceName: "traffit",
    sourceType: "TRAFFIT",
    sourceUrl: "https://api.traffit.com/",
    termsUrl: "https://www.traffit.com/en/terms-of-service/",
  },
  {
    sourceName: "recruitee",
    sourceType: "RECRUITEE",
    sourceUrl: "https://docs.recruitee.com/reference/offers",
    termsUrl: "https://recruitee.com/terms",
  },
  {
    sourceName: "teamtailor",
    sourceType: "TEAMTAILOR",
    sourceUrl: "https://support.teamtailor.com/en/articles/11171756-rss-feed-how-to-guide",
    termsUrl: "https://www.teamtailor.com/terms/",
  },
  {
    sourceName: "personio",
    sourceType: "PERSONIO",
    sourceUrl: "https://developer.personio.de/v1.0/reference/get_xml",
    termsUrl: "https://www.personio.com/legal/terms-conditions/",
  },
  {
    sourceName: "pinpoint",
    sourceType: "PINPOINT",
    sourceUrl: "https://developers.pinpointhq.com/docs/jobs-json-endpoint",
    termsUrl: "https://www.pinpointhq.com/terms",
  },
  {
    sourceName: "breezy",
    sourceType: "BREEZY",
    sourceUrl: "https://{company}.breezy.hr/json",
    termsUrl: "https://breezy.hr/terms",
  },
  {
    sourceName: "bamboohr",
    sourceType: "BAMBOOHR",
    sourceUrl: "https://{company}.bamboohr.com/careers/list",
    termsUrl: "https://www.bamboohr.com/terms-of-service.php",
  },
  {
    sourceName: "successfactors",
    sourceType: "SUCCESSFACTORS",
    sourceUrl: "https://jobs.gft.com/sitemap.xml",
    termsUrl: "https://www.gft.com/us/en/legal-disclaimer",
  },
  {
    sourceName: "workday",
    sourceType: "WORKDAY",
    sourceUrl: "https://www.workday.com/en-us/legal/site-terms.html",
    termsUrl: "https://www.workday.com/en-us/legal/site-terms.html",
  },
  {
    sourceName: "career_site",
    sourceType: "CAREER_SITE",
    sourceUrl: "https://www.pracujwgp.pl/jobs.feed.json",
    termsUrl: "https://www.pracujwgp.pl/",
  },
]

async function main() {
  // Keeps the old project name: a new default would create a second owner on existing installs.
  const email = (process.env.OWNER_EMAIL || "owner@nowarola.local").toLowerCase()
  const password = process.env.OWNER_PASSWORD || "jobscanner-local"
  // The owner row keeps its first password, so a public server must not create it with the sample.
  assertSafeProductionEnv({ ...process.env, OWNER_PASSWORD: password })
  const name = process.env.OWNER_NAME || "Owner"
  if (password.length < 10) throw new Error("OWNER_PASSWORD must be at least 10 characters")
  const hashedPassword = await SecurePassword.hash(password)
  const existing = await db.user.findUnique({ where: { email } })
  if (!existing) {
    await db.user.create({
      data: { email, name, hashedPassword, role: "ADMIN", timezone: "Europe/Warsaw", locale: "pl" },
    })
    console.log(`Created owner ${email}`)
  } else if (existing.role !== "ADMIN") {
    await db.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } })
    console.log(`Promoted owner ${email} to admin`)
  } else {
    console.log(`Owner ${email} already exists`)
  }

  for (const source of SOURCES) {
    await db.discoverySource.upsert({
      where: { sourceName: source.sourceName },
      update: {
        sourceUrl: source.sourceUrl,
        termsUrl: source.termsUrl,
        sourceType: source.sourceType,
      },
      create: { ...source, enabled: true, rateLimitConfig: { minIntervalMs: 400, maxRetries: 3 } },
    })
  }

  for (const board of seedBoards) {
    const normalizedName = normalizeCompanyName(board.companyName)
    const company = await db.company.upsert({
      where: { normalizedName },
      update: {},
      create: { name: board.companyName, normalizedName },
    })
    await db.careerPage.upsert({
      where: {
        provider_providerBoardId: { provider: board.provider, providerBoardId: board.boardId },
      },
      update: { url: board.careersUrl, companyId: company.id },
      create: {
        companyId: company.id,
        url: board.careersUrl,
        normalizedUrl: canonicalUrl(board.careersUrl),
        provider: board.provider,
        providerBoardId: board.boardId,
        resolutionStatus: "RESOLVED_ATS",
        confidence: 1,
      },
    })
  }
  await db.careerPage.updateMany({
    where: { provider: "SMARTRECRUITERS", providerBoardId: { in: ["Allegro", "allegro"] } },
    data: { enabled: false },
  })
  console.log(`Seeded ${seedBoards.length} career pages`)
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await db.$disconnect()
    process.exit(1)
  })
