import Link from "next/link"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { featuresContent } from "src/app/i18n/copy-features"

export async function generateMetadata() {
  const page = featuresContent(await getLocale())
  return { title: page.title, description: page.lead }
}

/**
 * Every feature of newrole.it and its Chrome extension, and what each button and switch does.
 * Public: it is the page to read before installing, too. Text lives in src/app/i18n/copy-features.ts.
 */
export default async function FeaturesPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  const page = featuresContent(locale)
  return (
    <SiteFrame user={user} locale={locale}>
      <header className="page-head features-head">
        <h1 className="t-h1">{page.title}</h1>
        <p>{page.lead}</p>
      </header>
      <div className="features">
        <nav className="features-toc" aria-label={page.toc}>
          <p className="features-toc__title">{page.toc}</p>
          <ol>
            {page.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="features-body">
          {page.sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="card features-section"
              aria-labelledby={`${section.id}-title`}
            >
              <div className="features-section__head">
                <h2 id={`${section.id}-title`} className="t-h2">
                  {section.title}
                </h2>
                {section.where ? (
                  <Link className="link t-sm" href={section.where.href}>
                    {section.where.label} →
                  </Link>
                ) : null}
              </div>
              <p className="features-section__lead">{section.lead}</p>
              {section.groups.map((group) => (
                <div key={group.title ?? section.id} className="features-group">
                  {group.title ? <h3 className="features-group__title">{group.title}</h3> : null}
                  <dl className="features-list">
                    {group.items.map((item) => (
                      <div key={item.label} id={item.id} className="features-item">
                        <dt>
                          <span className="features-item__label">{item.label}</span>
                          {item.state ? (
                            <span className="features-item__state">{item.state}</span>
                          ) : null}
                        </dt>
                        <dd>{item.body}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </SiteFrame>
  )
}
