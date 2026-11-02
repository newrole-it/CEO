import type { Locale } from "src/app/i18n/copy"
import type { Operator } from "src/server/operator"

/** Shown when someone runs this as a service for others (OPERATOR_NAME and OPERATOR_CONTACT set). */
export type ServiceSection = { title: string; lines: string[] }

export function servicePrivacy(locale: Locale, who: Operator): ServiceSection[] {
  return locale === "pl"
    ? [
        {
          title: "Kto odpowiada za Twoje dane",
          lines: [
            `Administratorem danych jest ${who.name}. Kontakt w sprawie danych: ${who.contact}.`,
          ],
        },
        {
          title: "Po co i na jakiej podstawie",
          lines: [
            "Prowadzenie konta oraz przechowywanie Twojego profilu, CV, aplikacji i odpowiedzi, czyli świadczenie usługi, o którą prosisz (art. 6 ust. 1 lit. b RODO).",
            "Bezpieczeństwo: limity logowania i dziennik czynności, bo mamy prawnie uzasadniony interes w ochronie usługi przed nadużyciami (art. 6 ust. 1 lit. f RODO).",
          ],
        },
        {
          title: "Twój Claude",
          lines: [
            "Ten serwer przechowuje dane, ale nie wywołuje żadnego modelu językowego i nie szuka ofert. Robi to Twój Claude, na Twoim koncie.",
            "Gdy Claude wywołuje narzędzie Nowej Roli, dostaje jego wynik, w tym dane z Twojego profilu, CV i aplikacji. Od tej chwili przetwarza je Anthropic na warunkach Twojego konta Claude. Dostęp cofniesz, usuwając connector w Claude i token w Ustawieniach.",
          ],
        },
        {
          title: "Jak długo",
          lines: [
            "Dane trzymamy, dopóki masz konto. Usunięcie konta kasuje je zgodnie z opisem niżej.",
          ],
        },
        {
          title: "Twoje prawa",
          lines: [
            "Masz prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia oraz sprzeciwu. Eksport i usunięcie są w Ustawieniach, a w pozostałych sprawach napisz na adres wyżej.",
            "Możesz złożyć skargę do organu nadzorczego (art. 77 RODO), w Polsce do UODO: uodo.gov.pl.",
          ],
        },
        {
          title: "Czy musisz podawać dane",
          lines: [
            "E-mail jest potrzebny do założenia konta. Resztę podajesz dobrowolnie, a bez niej odpowiednie funkcje po prostu nie mają na czym pracować.",
          ],
        },
        {
          title: "Decyzje automatyczne",
          lines: [
            "Serwer nie podejmuje wobec Ciebie decyzji opartych wyłącznie na automatycznym przetwarzaniu, które wywołują skutki prawne lub podobnie istotnie na Ciebie wpływają (art. 22 RODO).",
          ],
        },
      ]
    : [
        {
          title: "Who answers for your data",
          lines: [`The controller is ${who.name}. Contact about your data: ${who.contact}.`],
        },
        {
          title: "Why, and on what basis",
          lines: [
            "Running your account and keeping your profile, CV, applications and answers, which is the service you ask for (GDPR Art. 6(1)(b)).",
            "Security: sign-in limits and an activity log, because we have a legitimate interest in protecting the service from abuse (GDPR Art. 6(1)(f)).",
          ],
        },
        {
          title: "Your Claude",
          lines: [
            "This server stores data. It calls no language model and looks for no offers. Your Claude does that, on your account.",
            "When Claude calls a Nowa Rola tool, it receives the result, including data from your profile, CV and applications. From then on Anthropic processes it under the terms of your Claude account. To withdraw access, remove the connector in Claude and the token in Settings.",
          ],
        },
        {
          title: "How long",
          lines: [
            "We keep the data while you have an account. Deleting the account removes it as described below.",
          ],
        },
        {
          title: "Your rights",
          lines: [
            "You have the right to access, rectify and erase your data, to restrict processing, to data portability and to object. Export and deletion are in Settings; for anything else, write to the address above.",
            "You can complain to a supervisory authority (GDPR Art. 77); in Poland, UODO: uodo.gov.pl.",
          ],
        },
        {
          title: "Do you have to give data",
          lines: [
            "An email is needed to open an account. The rest is your choice; without it the features that use it simply have nothing to work on.",
          ],
        },
        {
          title: "Automated decisions",
          lines: [
            "The server takes no decision about you based solely on automated processing that has legal or similarly significant effects (GDPR Art. 22).",
          ],
        },
      ]
}

export function serviceHost(locale: Locale, who: Operator): string {
  const processors =
    who.processors || (locale === "pl" ? "operator ich nie podał" : "not stated by the operator")
  return locale === "pl"
    ? `Serwer i baza PostgreSQL, w których leżą konto, profil, CV i aplikacje. Dostawcy, którzy przetwarzają dane dla administratora, i miejsce przetwarzania: ${processors}.`
    : `The server and PostgreSQL database that hold the account, profile, CV and applications. Companies that process data for the controller, and where: ${processors}.`
}

export function noModelLine(locale: Locale): string {
  return locale === "pl"
    ? "Ten serwer nie wywołuje modelu językowego i nie wysyła do niego Twoich danych."
    : "This server calls no language model and sends your data to none."
}
