import { Check, CircleAlert, FileUp, Link2 } from "lucide-react"
import { redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { ButtonLink } from "@newrole/ui/Button"
import { EmptyState, LinkTabs } from "@newrole/ui/primitives"
import { relativeTime } from "@newrole/ui/time"
import { SKILLS_LEAST, type LinkedInComparison } from "@newrole/cv-engine/linkedin-sync"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator, type T } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { linkedInSyncView } from "src/server/profile/linkedin-sync"
import { LinkedInTextsPanel } from "./LinkedInTextsPanel"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("li.title") }
}

/** "LinkedIn i CV": the default CV against the LinkedIn profile kept here, and texts to paste. */
export default async function LinkedInSyncPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  if (!user || user.role === "GUEST") redirect("/login?returnTo=/profile/linkedin")
  const t = translator(locale)
  const view = await linkedInSyncView(user.id)
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <header className="page-head">
        <h1 className="t-h1">{t("pr.title")}</h1>
        <p>{t("li.sub")}</p>
      </header>
      <div style={{ marginBottom: 24 }}>
        <LinkTabs
          label={t("pr.title")}
          items={[
            { href: "/profile", label: t("pr.tabProfile"), current: false },
            { href: "/profile/details", label: t("apl.tab"), current: false },
            { href: "/profile/audit", label: t("pr.tabAudit"), current: false },
            { href: "/profile/linkedin", label: t("li.tab"), current: true },
          ]}
        />
      </div>
      {view.cv ? (
        <div className="stack-lg">
          <p className="t-sm muted">
            {t("li.cv", { title: view.cv.title })}{" "}
            <a className="link" href={`/cv/${view.cv.id}`}>
              {t("li.openCv")}
            </a>
          </p>
          {view.comparison && view.readAt ? (
            <>
              <p className="t-sm muted">
                {t(view.source === "extension" ? "li.read.extension" : "li.read.import", {
                  when: relativeTime(view.readAt, t) ?? "",
                })}
              </p>
              <Comparison t={t} comparison={view.comparison} />
            </>
          ) : (
            <EmptyState icon={<Link2 />} title={t("li.none.title")} body={t("li.none.body")}>
              <ButtonLink href="/start/linkedin" variant="outline">
                {t("li.none.cta")}
              </ButtonLink>
            </EmptyState>
          )}
          <LinkedInTextsPanel language={view.language} />
        </div>
      ) : (
        <EmptyState icon={<FileUp />} title={t("li.noCv.title")} body={t("li.noCv.body")}>
          <ButtonLink href="/cv" variant="primary">
            {t("li.noCv.cta")}
          </ButtonLink>
        </EmptyState>
      )}
    </SiteFrame>
  )
}

function Comparison({ t, comparison }: { t: T; comparison: LinkedInComparison }) {
  const { roles, onlyOnLinkedIn, skillsMissing, headline, aboutChars, linkedInSkills } = comparison
  return (
    <section className="card card--pad stack" aria-labelledby="li-cmp">
      <h2 className="t-h3" id="li-cmp">
        {t("li.cmp.title")}
      </h2>

      <div className="stack-sm">
        <h3 className="t-label">{t("li.cmp.roles")}</h3>
        <ul className="mt-checks">
          {roles.map((role) => {
            const same = Boolean(role.linkedIn && role.titleSame && role.yearsSame)
            return (
              <li key={role.item} className="mt-check" data-ok={same}>
                {same ? <Check aria-hidden /> : <CircleAlert aria-hidden />}
                <span>
                  <strong>{t("li.cmp.role", { role: role.role, company: role.company })}</strong>
                  <br />
                  <span className="t-sm muted">
                    {!role.linkedIn
                      ? t("li.cmp.missing")
                      : !role.titleSame
                      ? t("li.cmp.titleDiff", { title: role.linkedIn.title })
                      : !role.yearsSame
                      ? t("li.cmp.yearsDiff", { subtitle: role.linkedIn.subtitle })
                      : t("li.cmp.same")}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {onlyOnLinkedIn.length ? (
        <div className="stack-sm">
          <h3 className="t-label">{t("li.cmp.onlyLinkedIn")}</h3>
          <ul className="mt-plain">
            {onlyOnLinkedIn.map((position) => (
              <li key={`${position.title}-${position.subtitle}`}>
                {t("li.cmp.role", { role: position.title, company: position.subtitle })}
              </li>
            ))}
          </ul>
          <p className="t-sm muted">{t("li.cmp.onlyLinkedInHint")}</p>
        </div>
      ) : null}

      <div className="stack-sm">
        <h3 className="t-label">{t("li.cmp.skills")}</h3>
        {skillsMissing.length ? (
          <ul className="chips">
            {skillsMissing.map((skill) => (
              <li key={skill} className="chip chip--sm">
                {skill}
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-sm muted">{t("li.cmp.skillsNone")}</p>
        )}
        {linkedInSkills < SKILLS_LEAST ? (
          <p className="t-sm muted">{t("li.cmp.skillsCount", { n: linkedInSkills })}</p>
        ) : null}
      </div>

      <div className="stack-sm">
        <h3 className="t-label">{t("li.cmp.headline")}</h3>
        <p className="t-sm">{t("li.cmp.headlineCv", { text: headline.cv })}</p>
        <p className="t-sm">
          {headline.linkedIn
            ? t("li.cmp.headlineLinkedIn", { text: headline.linkedIn })
            : t("li.cmp.headlineNone")}
        </p>
      </div>

      <div className="stack-sm">
        <h3 className="t-label">{t("li.cmp.about")}</h3>
        <p className="t-sm">
          {aboutChars == null ? t("li.cmp.aboutNone") : t("li.cmp.aboutChars", { n: aboutChars })}
        </p>
      </div>
    </section>
  )
}
