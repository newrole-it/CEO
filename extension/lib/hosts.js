/** Address lists shared by wxt.config.ts and the content script entrypoints. */

export const APP_HOSTS = ["http://127.0.0.1:43123/*", "http://localhost:43123/*"]

export const ATS_MATCHES = [
  "https://boards.greenhouse.io/*",
  "https://job-boards.greenhouse.io/*",
  "https://job-boards.eu.greenhouse.io/*",
  "https://jobs.lever.co/*",
  "https://jobs.eu.lever.co/*",
  "https://jobs.ashbyhq.com/*",
  "https://apply.workable.com/*",
  "https://*.teamtailor.com/*",
  "https://*.recruitee.com/*",
  "https://jobs.smartrecruiters.com/*",
  "https://*.jobs.personio.de/*",
  "https://*.jobs.personio.com/*",
  "https://*.bamboohr.com/*",
  "https://*.breezy.hr/*",
  "https://*.pinpointhq.com/*",
  "https://*.traffit.com/*",
  "https://jobs.jobvite.com/*",
  "https://*.myworkdayjobs.com/*",
  "https://*.icims.com/*",
]

/** Job boards: people read offers here, so only the "already applied" check runs on them. */
export const JOB_BOARD_MATCHES = [
  "https://*.justjoin.it/*",
  "https://*.nofluffjobs.com/*",
  "https://*.pracuj.pl/*",
  "https://*.theprotocol.it/*",
  "https://*.bulldogjob.pl/*",
  "https://*.bulldogjob.com/*",
]

/**
 * The profile audit and the "already applied" check on offers. The whole site, not /in/* or
 * /jobs/*: LinkedIn moves between pages without a load, so a script matched on one path alone
 * would miss "View profile" from the feed.
 */
export const LINKEDIN_MATCHES = ["https://www.linkedin.com/*"]

export const PAIR_MATCHES = [
  "http://127.0.0.1:43123/connect/extension*",
  "http://127.0.0.1:43123/setup*",
  "http://localhost:43123/connect/extension*",
  "http://localhost:43123/setup*",
]
