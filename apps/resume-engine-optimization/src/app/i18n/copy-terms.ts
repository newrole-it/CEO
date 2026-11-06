import type { Locale } from "@newrole/ui/i18n"

/**
 * The terms at /terms. One object per language. Polish is the source; the English object is typed
 * from it. Placeholders use {name}; fill them with fmt().
 */
const termsPl = {
  // On a local install, where the person is their own operator.
  lede: "Oferty, które dodajesz, prowadzą do ogłoszeń pracodawców. newrole.it nie jest stroną aplikacji i nie gwarantuje, że oferta jest nadal otwarta. Ogłoszenie z linku czytamy na Twoją prośbę, z limitem co najmniej 1 sekundy między zapytaniami do jednego hosta. Za treść CV i listów, które wysyłasz, odpowiadasz Ty. To szkic regulaminu.",
  // Shown when someone runs this as a service for others (OPERATOR_NAME and OPERATOR_CONTACT
  // set). {name} and {contact} come from the operator.
  service: [
    { title: "Usługodawca", text: "Usługę świadczy {name}. Kontakt: {contact}." },
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
      text: "Napisz na {contact}. Odpowiemy w ciągu 14 dni.",
    },
    {
      title: "Kod źródłowy i prawo",
      text: "Otwarta część oprogramowania jest dostępna na licencji AGPL-3.0, link jest w stopce. Stosujemy prawo polskie. Nic w tych warunkach nie ogranicza praw, które masz jako konsument.",
    },
  ],
}

const termsEn: typeof termsPl = {
  // On a local install, where the person is their own operator.
  lede: "The offers you add link to employers' postings. newrole.it is not a party to an application and does not guarantee an offer is still open. A posting is read from its link when you ask, at least 1 second apart between requests to one host. You are responsible for the CVs and letters you send. This is a draft of the terms.",
  // Shown when someone runs this as a service for others (OPERATOR_NAME and OPERATOR_CONTACT
  // set). {name} and {contact} come from the operator.
  service: [
    {
      title: "Provider",
      text: "The service is provided by {name}. Contact: {contact}.",
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
    { title: "Complaints", text: "Write to {contact}. We answer within 14 days." },
    {
      title: "Source code and law",
      text: "The open part of the software is available under AGPL-3.0; the link is in the footer. Polish law applies. Nothing here limits the rights you have as a consumer.",
    },
  ],
}

export const termsCopy: Record<Locale, typeof termsPl> = { pl: termsPl, en: termsEn }
