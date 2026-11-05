import { invoke } from "src/app/blitz-server"
import { GITHUB_ISSUES } from "src/app/components/site/links"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import type { Locale } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { operator } from "src/server/operator"

export const metadata = { title: "NewRoleBot" }

const en = {
  lede: "NewRoleBot reads a public job posting when a person adds its link to newrole.it, so they can tailor their CV and cover letter to it and apply on the employer's own site. The software is open source and runs on people's own computers, for their own job search, unless its User-Agent says otherwise.",
  rulesTitle: "How it behaves",
  rules: [
    "On career pages it reads robots.txt first and obeys it, for * and for NewRoleBot. Rules written for its earlier names, NowaRolaBot and JobscannerBot, still apply.",
    "Boards with a documented public API are read through that API.",
    "It reads only the postings people add, one at a time, never a whole site. It waits at least 1 second between requests to a host (longer when robots.txt sets a Crawl-delay) and reads at most 200 job pages per host per day.",
    "It does not log in or get around bot walls. A posting on a job board or LinkedIn is read only when a person tailors a CV or a letter to it, under robots.txt, and its text is not stored.",
    "It keeps the title, company, place, salary and the link, and the posting's text for the person who added it, in their own account. Names, e-mails and phone numbers of recruiters are removed. Every offer links to the original posting.",
    "A page that opts out of AI input or training is not passed to a language model by this software.",
  ],
  stopTitle: "How to make it stop",
  robots:
    "On a career page, add this to robots.txt. A copy applies it the next time it reads your site:",
  report: "For anything else, including a board read through an API:",
  issue: "open an issue",
  noCrawl: "It runs no crawler: nothing is read until a person adds a link.",
}

const pl: typeof en = {
  lede: "NewRoleBot czyta publiczne ogłoszenie, gdy ktoś doda jego link do newrole.it, żeby dopasować do niego CV i list motywacyjny, a potem aplikować na stronie pracodawcy. To otwarte oprogramowanie, które działa na komputerach ludzi, na potrzeby ich własnego szukania pracy, chyba że jego User-Agent mówi inaczej.",
  rulesTitle: "Jak działa",
  rules: [
    "Na stronach kariery najpierw czyta robots.txt i go przestrzega, dla * i dla NewRoleBot. Reguły zapisane dla jego wcześniejszych nazw, NowaRolaBot i JobscannerBot, nadal obowiązują.",
    "Tablice z udokumentowanym publicznym API czyta przez to API.",
    "Czyta tylko ogłoszenia, które ktoś doda, po jednym, nigdy całej strony. Czeka co najmniej 1 sekundę między żądaniami do hosta (dłużej, gdy robots.txt podaje Crawl-delay) i czyta najwyżej 200 stron ofert na host dziennie.",
    "Nie loguje się i nie obchodzi zabezpieczeń przed botami. Ogłoszenie z portalu z ofertami albo z LinkedIn czyta tylko wtedy, gdy ktoś dopasowuje do niego CV albo list, zgodnie z robots.txt, i nie zapisuje jego treści.",
    "Zapisuje stanowisko, firmę, miejsce, wynagrodzenie i link, a treść ogłoszenia tylko dla osoby, która je dodała, na jej koncie. Nazwiska, e-maile i telefony rekruterów są usuwane. Każda oferta prowadzi do oryginalnego ogłoszenia.",
    "Strona, która zastrzega się przed użyciem przez AI, nie trafia z tego oprogramowania do modelu językowego.",
  ],
  stopTitle: "Jak to zatrzymać",
  robots:
    "Na stronie kariery dodaj to do robots.txt. Każda kopia zastosuje to przy następnym czytaniu Twojej strony:",
  report: "W każdej innej sprawie, także tablicy czytanej przez API:",
  issue: "otwórz zgłoszenie",
  noCrawl: "Nie uruchamia crawlera: nic nie jest czytane, dopóki ktoś nie doda linku.",
}

function body(locale: Locale) {
  return locale === "pl" ? pl : en
}

export default async function BotPage() {
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  const page = body(locale)
  const contact = operator()?.contact
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <article className="prose">
        <p className="eyebrow">NewRoleBot</p>
        <h1>NewRoleBot</h1>
        <p className="lede">{page.lede}</p>
        <p>{page.noCrawl}</p>
        <h2>{page.rulesTitle}</h2>
        <ul>
          {page.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <h2>{page.stopTitle}</h2>
        <p>{page.robots}</p>
        <pre>{"User-agent: NewRoleBot\nDisallow: /"}</pre>
        <p>
          {page.report}{" "}
          {contact ? (
            contact
          ) : (
            <a className="text-link" href={GITHUB_ISSUES} target="_blank" rel="noreferrer noopener">
              {page.issue}
            </a>
          )}
          .
        </p>
      </article>
    </SiteFrame>
  )
}
