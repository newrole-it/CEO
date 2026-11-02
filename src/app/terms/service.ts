import type { Locale } from "src/app/i18n/copy"
import type { Operator } from "src/server/operator"

/** Shown when someone runs this as a service for others (OPERATOR_NAME and OPERATOR_CONTACT set). */
export function serviceTerms(locale: Locale, who: Operator): { title: string; text: string }[] {
  return locale === "pl"
    ? [
        { title: "Usługodawca", text: `Usługę świadczy ${who.name}. Kontakt: ${who.contact}.` },
        {
          title: "Czym jest usługa",
          text: "Przechowuje Twoje dane o szukaniu pracy: profil, CV, aplikacje i odpowiedzi na pytania rekrutacyjne. Udostępnia je Tobie i Twojemu Claude. Nie zbiera ofert pracy, nie kontaktuje się z pracodawcami i nie przekazuje im Twoich danych.",
        },
        {
          title: "Czego potrzebujesz",
          text: "Przeglądarki, adresu e-mail i własnego konta Claude. Claude to osobna usługa Anthropic, na Twoich warunkach z Anthropic.",
        },
        {
          title: "Zasady",
          text: "Podawaj tylko swoje dane. Nie próbuj dostać się do cudzych danych ani utrudniać działania usługi. Możemy zablokować konto, które to robi.",
        },
        {
          title: "Treści od Claude",
          text: "Oferty, szkice i poprawki CV przygotowuje Twój Claude. Sprawdź je, zanim wyślesz je pracodawcy. Usługa nie gwarantuje, że oferta jest aktualna ani że dostaniesz pracę.",
        },
        {
          title: "Rezygnacja",
          text: "Konto i dane usuniesz w każdej chwili w Ustawieniach.",
        },
        {
          title: "Reklamacje",
          text: `Napisz na ${who.contact}. Odpowiemy w ciągu 14 dni.`,
        },
        {
          title: "Kod źródłowy i prawo",
          text: "Otwarta część oprogramowania jest dostępna na licencji AGPL-3.0, link jest w stopce. Stosujemy prawo polskie. Nic w tych warunkach nie ogranicza praw, które masz jako konsument.",
        },
      ]
    : [
        {
          title: "Provider",
          text: `The service is provided by ${who.name}. Contact: ${who.contact}.`,
        },
        {
          title: "What the service is",
          text: "It stores your job search records: profile, CV, applications and answers to application questions. It makes them available to you and your Claude. It gathers no job offers, does not contact employers and passes them none of your data.",
        },
        {
          title: "What you need",
          text: "A browser, an email address and your own Claude account. Claude is a separate service from Anthropic, under your terms with Anthropic.",
        },
        {
          title: "Rules",
          text: "Enter only your own data. Do not try to reach other people's data or to disrupt the service. We may block an account that does.",
        },
        {
          title: "What Claude produces",
          text: "Offers, drafts and CV changes come from your Claude. Check them before you send them to an employer. The service does not guarantee that an offer is current or that you will get a job.",
        },
        { title: "Leaving", text: "You can delete your account and data at any time in Settings." },
        { title: "Complaints", text: `Write to ${who.contact}. We answer within 14 days.` },
        {
          title: "Source code and law",
          text: "The open part of the software is available under AGPL-3.0; the link is in the footer. Polish law applies. Nothing here limits the rights you have as a consumer.",
        },
      ]
}
