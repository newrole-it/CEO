import { invoke } from "src/app/blitz-server"
import { GITHUB_ISSUES } from "src/app/components/site/links"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import type { Locale } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { offerIndexEnabled } from "src/server/offer-index"
import { operator } from "src/server/operator"

export const metadata = { title: "NowaRolaBot" }

const en = {
  lede: "NowaRolaBot reads public job postings on employers' career pages and ATS boards, so that people can find them and apply on the employer's own site. The software is open source and runs on people's own computers, for their own job search, unless its User-Agent says otherwise.",
  rulesTitle: "How it behaves",
  rules: [
    "On career pages it reads robots.txt first and obeys it, for * and for NowaRolaBot.",
    "Boards with a documented public API are read through that API.",
    "It waits at least 5 seconds between requests to a host and reads at most 200 job pages per host per day.",
    "It does not log in, get around bot walls, or read LinkedIn or the Polish job boards.",
    "It stores the title, company, place, salary, a short excerpt and the link. Names, e-mails and phone numbers of recruiters are removed. Every result links to the original posting.",
    "A page that opts out of AI input or training is not passed to a language model by this software.",
  ],
  stopTitle: "How to make it stop",
  robots:
    "On a career page, add this to robots.txt. A copy applies it the next time it reads your site:",
  report: "For anything else, including a board read through an API:",
  issue: "open an issue",
  noCrawl: "This server runs no crawler. It holds only the records of the people who use it.",
}

const pl: typeof en = {
  lede: "NowaRolaBot czyta publiczne ogłoszenia na stronach kariery pracodawców i w systemach ATS, żeby ludzie mogli je znaleźć i aplikować na stronie pracodawcy. To otwarte oprogramowanie, które działa na komputerach ludzi, na potrzeby ich własnego szukania pracy, chyba że jego User-Agent mówi inaczej.",
  rulesTitle: "Jak działa",
  rules: [
    "Na stronach kariery najpierw czyta robots.txt i go przestrzega, dla * i dla NowaRolaBot.",
    "Tablice z udokumentowanym publicznym API czyta przez to API.",
    "Czeka co najmniej 5 sekund między żądaniami do hosta i czyta najwyżej 200 stron ofert na host dziennie.",
    "Nie loguje się, nie obchodzi zabezpieczeń przed botami, nie czyta LinkedIn ani polskich agregatorów.",
    "Zapisuje stanowisko, firmę, miejsce, wynagrodzenie, krótki fragment i link. Nazwiska, e-maile i telefony rekruterów są usuwane. Każdy wynik prowadzi do oryginalnego ogłoszenia.",
    "Strona, która zastrzega się przed użyciem przez AI, nie trafia z tego oprogramowania do modelu językowego.",
  ],
  stopTitle: "Jak to zatrzymać",
  robots:
    "Na stronie kariery dodaj to do robots.txt. Każda kopia zastosuje to przy następnym czytaniu Twojej strony:",
  report: "W każdej innej sprawie, także tablicy czytanej przez API:",
  issue: "otwórz zgłoszenie",
  noCrawl: "Ten serwer nie uruchamia crawlera. Trzyma tylko dane osób, które z niego korzystają.",
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
        <p className="eyebrow">NowaRolaBot</p>
        <h1>NowaRolaBot</h1>
        <p className="lede">{page.lede}</p>
        {offerIndexEnabled() ? null : <p>{page.noCrawl}</p>}
        <h2>{page.rulesTitle}</h2>
        <ul>
          {page.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <h2>{page.stopTitle}</h2>
        <p>{page.robots}</p>
        <pre>{"User-agent: NowaRolaBot\nDisallow: /"}</pre>
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
