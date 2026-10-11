import Link from "next/link"
import { indexBigNumber, indexCountLabel } from "src/shared/index-count"
import { copy, type Locale } from "src/app/i18n/copy"
import { LinkedInMark } from "../site/Brand"
import { HeroSearch } from "./HeroSearch"

const WEIGHTS = [
  ["partTitle", 30],
  ["partLocation", 25],
  ["partSeniority", 15],
  ["partSalary", 15],
  ["partFresh", 10],
  ["partSource", 5],
] as const

const PLATFORMS = [
  "Greenhouse",
  "Lever",
  "Ashby",
  "Workable",
  "SmartRecruiters",
  "Teamtailor",
  "Recruitee",
  "Personio",
]

export function Landing({
  locale,
  signedIn,
  indexed,
  searches,
  preview,
}: {
  locale: Locale
  signedIn: boolean
  indexed: number
  searches: { id: string; phrase: string; newJobs: number }[]
  preview: { id: string; title: string; company: string; location: string }[]
}) {
  const t = copy(locale)
  const pill = indexCountLabel(indexed, locale)
  const big = indexBigNumber(indexed, locale)
  return (
    <main id="main">
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero-inner hero-enter">
          <p className="index-pill">
            <span className="live-dot" aria-hidden="true" />
            <span>
              <strong>{pill.strong}</strong> {pill.rest}
            </span>
          </p>
          <h1 className="display" id="hero-title">
            {t.heroTitleBefore} <em>{t.heroTitleEm}</em>
          </h1>
          <p className="lede">{t.heroLede}</p>
          <HeroSearch signedIn={signedIn} searches={searches} />
        </div>
        {preview.length ? (
          <div className="container preview-wrap">
            <figure className="preview" aria-labelledby="preview-cap">
              <div className="preview-list">
                {preview.map((item) => (
                  <div className="result" key={item.id}>
                    <div>
                      <p className="result-company">{item.company}</p>
                      <h3 className="h3 result-title">{item.title}</h3>
                      <p className="facts">
                        <span>{item.location}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <figcaption className="preview-caption" id="preview-cap">
                {t.previewCaption}
              </figcaption>
            </figure>
          </div>
        ) : null}
      </section>
      <hr className="section-rule" />
      <section className="section" id="jak-to-dziala" aria-labelledby="how-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">{t.howEyebrow}</p>
            <h2 className="h2" id="how-title">
              {t.howTitleBefore} <em>{t.howTitleEm}</em>
            </h2>
          </div>
          <ol className="steps">
            <li className="step">
              <span className="step-num" aria-hidden="true">
                01
              </span>
              <h3 className="h3">{t.step1Title}</h3>
              <p>{t.step1Body}</p>
            </li>
            <li className="step">
              <span className="step-num" aria-hidden="true">
                02
              </span>
              <h3 className="h3">{t.step2Title}</h3>
              <p>{t.step2Body}</p>
              <div className="step-visual" aria-hidden="true">
                <div className="flow">
                  <div className="flow-row">
                    <span className="tag">{t.flowCareer}</span>
                    <span className="tag">Jobscanner</span>
                  </div>
                  <div className="flow-row">
                    <span className="tag">{t.flowAts}</span>
                    <span className="tag">Jobscanner</span>
                  </div>
                  <div className="flow-row">
                    <span className="tag off">{t.flowPortal}</span>
                    <span className="small muted">{t.flowLinkOnly}</span>
                  </div>
                </div>
              </div>
            </li>
            <li className="step">
              <span className="step-num" aria-hidden="true">
                03
              </span>
              <h3 className="h3">{t.step3Title}</h3>
              <p>{t.step3Body}</p>
            </li>
          </ol>
        </div>
      </section>
      <hr className="section-rule" />
      <section className="section" id="zrodla" aria-labelledby="sources-title">
        <div className="container sources">
          <div>
            <p className="eyebrow">{t.sourcesEyebrow}</p>
            <p className="bignum">{big}</p>
            <p className="bignum-label">{t.bignumLabel}</p>
            <h2 className="h2" id="sources-title">
              {t.sourcesTitleBefore} <em>{t.sourcesTitleEm}</em>
            </h2>
          </div>
          <ul className="facts-list">
            <li>
              <div>
                <h3>{t.fact1Title}</h3>
                <p>{t.fact1Body}</p>
                <div className="platforms">
                  {PLATFORMS.map((name) => (
                    <span className="chip chip-sm is-static" key={name}>
                      {name}
                    </span>
                  ))}
                  <span className="chip chip-sm is-static">{t.platformsMore}</span>
                </div>
              </div>
            </li>
            <li>
              <div>
                <h3>{t.fact2Title}</h3>
                <p>{t.fact2Body}</p>
              </div>
            </li>
            <li>
              <div>
                <h3>{t.fact3Title}</h3>
                <p>{t.fact3Body}</p>
              </div>
            </li>
            <li>
              <div>
                <h3>{t.fact4Title}</h3>
                <p>{t.fact4Body}</p>
                <p style={{ marginTop: "var(--space-3)" }}>
                  <Link className="text-link" href="/sources">
                    {t.sourcesLink}
                  </Link>
                </p>
              </div>
            </li>
          </ul>
        </div>
      </section>
      <hr className="section-rule" />
      <section className="section" id="dopasowanie" aria-labelledby="match-title">
        <div className="container match">
          <div>
            <p className="eyebrow">{t.matchEyebrow}</p>
            <h2 className="h2" id="match-title">
              {t.matchTitleBefore} <em>{t.matchTitleEm}</em>
            </h2>
            <p className="lede">{t.matchLede}</p>
            <ul className="checks">
              <li>{t.matchCheck1}</li>
              <li>{t.matchCheck2}</li>
              <li>{t.matchCheck3}</li>
            </ul>
            <div className="cta-row">
              {signedIn ? (
                <>
                  <Link className="btn btn-primary btn-lg" href="/profile/audit">
                    {t.authAuditCta}
                  </Link>
                  <Link className="text-link" href="/profile">
                    {t.authReimport}
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    className="btn btn-primary btn-lg btn-linkedin"
                    href="/api/auth/linkedin/start"
                  >
                    <LinkedInMark />
                    {t.signinLinkedIn}
                  </Link>
                  <Link className="text-link" href="/login">
                    {t.magicLink}
                  </Link>
                </>
              )}
            </div>
          </div>
          <figure className="score-card" aria-labelledby="sc-title">
            <header>
              <div className="t">
                <h3 className="h3" id="sc-title">
                  {t.weightsTitle}
                </h3>
              </div>
            </header>
            <div className="bars" role="list">
              {WEIGHTS.map(([key, weight]) => (
                <div className="bar-row" role="listitem" key={key}>
                  <span>{t[key]}</span>
                  <span className="track" aria-hidden="true">
                    <i style={{ ["--w" as string]: "100%" }} />
                  </span>
                  <span className="v">
                    <b>{weight}</b>
                  </span>
                </div>
              ))}
            </div>
            <figcaption className="sc-foot">{t.weightsFoot}</figcaption>
          </figure>
        </div>
      </section>
      <section className="cta-band" aria-labelledby="cta-title">
        <div className="container">
          <div className="cta-panel">
            <h2 className="h2" id="cta-title">
              {t.ctaTitleBefore} <em>{t.ctaTitleEm}</em>
            </h2>
            <p>{t.ctaBody}</p>
            <div className="cta-row">
              <a className="btn btn-light btn-lg" href="#q">
                {t.ctaSearch}
              </a>
              {signedIn && searches[0] ? (
                <Link className="btn btn-line btn-lg" href={`/searches/${searches[0].id}/triage`}>
                  {t.ctaTriage}
                </Link>
              ) : (
                <Link className="btn btn-line btn-lg" href="/api/auth/linkedin/start">
                  {t.signinLinkedIn}
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
