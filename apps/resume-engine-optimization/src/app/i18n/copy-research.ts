/**
 * Strings for the company brief of an offer (src/server/research). Keys "cr.".
 */
export const researchPl = {
  "cr.title": "O firmie",
  "cr.sub": "{company} · {title}",
  "cr.back": "Wróć do oferty",
  "cr.how":
    "Każde zdanie w tej notatce ma źródło, które sprawdził kod: fragment oferty, Twoje własne dane albo stronę, którą newrole.it samo przeczytało. Czego nie udało się potwierdzić, tego tu nie ma.",
  "cr.limits":
    "Sprawdzamy, czy cytat jest w źródle. Nie sprawdzamy, czy źródło pisze prawdę, ani czy zdanie modelu dobrze oddaje cytat. Dlatego przy każdym zdaniu jest cytat.",

  "cr.rec.title": "Co mamy w bazie",
  "cr.rec.sub": "Dane z Twojej bazy newrole.it, odczytane teraz. Model nie brał w tym udziału.",
  "cr.rec.domain": "Domena",
  "cr.rec.domain.none": "Nie znamy domeny tej firmy.",
  "cr.rec.career": "Strona z ofertami",
  "cr.rec.aliases": "Inne nazwy w bazie",
  "cr.rec.open.title": "Inne otwarte ogłoszenia tej firmy",
  "cr.rec.open.none": "W indeksie nie ma innych otwartych ogłoszeń tej firmy.",
  "cr.rec.open.count.one": "{n} otwarte ogłoszenie w indeksie",
  "cr.rec.open.count.few": "{n} otwarte ogłoszenia w indeksie",
  "cr.rec.open.count.many": "{n} otwartych ogłoszeń w indeksie",
  "cr.rec.open.more.one": "Jest jeszcze {n} ogłoszenie, którego tu nie pokazujemy.",
  "cr.rec.open.more.few": "Są jeszcze {n} ogłoszenia, których tu nie pokazujemy.",
  "cr.rec.open.more.many": "Jest jeszcze {n} ogłoszeń, których tu nie pokazujemy.",
  "cr.rec.history.title": "Twoja historia z tą firmą",
  "cr.rec.apps.none": "Nie masz w bazie żadnej aplikacji do tej firmy.",
  "cr.rec.app.when": "Aplikacja z {date}",
  "cr.rec.app.this": "ta oferta",
  "cr.rec.app.closedAt": "Zakończona na etapie: {stage}",
  "cr.rec.offers.title": "Inne oferty tej firmy, które masz zapisane",
  "cr.rec.offer.when": "Dodana {date}",
  "cr.rec.hiring.closed": "To ogłoszenie jest zamknięte.",

  "cr.brief.title": "Notatka o firmie",
  "cr.none.title": "Nie ma jeszcze notatki o tej firmie",
  "cr.none.body":
    "Model przeczyta ofertę i wypisze, co mówi ona o firmie: produkt i kierunek, ostatnie zmiany, sposób pracy, wyzwania i konkurencję. Zestawi też Twoje doświadczenie z tym, czego oferta wymaga. Każde zdanie dostanie cytat, a kod sprawdzi, czy ten cytat jest w źródle.",
  "cr.noModel":
    "Model językowy nie jest skonfigurowany, więc nie napiszemy notatki o firmie. Poniżej jest to, co mamy w bazie, i pytania, które warto zadać.",
  "cr.web.option": "Szukaj też w internecie (najwyżej {n} wyszukiwań)",
  "cr.web.option.hint":
    "Do wyszukiwarki trafia nazwa firmy i nazwa stanowiska. Twoje CV i profil nie.",
  "cr.web.unavailable":
    "Szukać w internecie potrafi tylko Claude CLI. Z obecnym modelem notatka powstanie wyłącznie z treści oferty.",
  "cr.run": "Napisz notatkę",
  "cr.rerun": "Napisz od nowa",
  "cr.run.title": "Piszemy notatkę o firmie",
  "cr.run.wait": "Model czyta ofertę. Nie zamykaj tej karty.",
  "cr.run.wait.web":
    "Model czyta ofertę i szuka w internecie, a potem newrole.it otwiera każdą stronę, którą model zacytował. To może potrwać kilka minut. Nie zamykaj tej karty.",
  "cr.err.failed": "Nie udało się napisać notatki. Spróbuj ponownie.",
  "cr.err.noJob": "Nie znaleźliśmy tej oferty.",

  "cr.axis.strategy": "Produkt i strategia",
  "cr.axis.moves": "Ostatnie zmiany",
  "cr.axis.culture": "Kultura inżynierska",
  "cr.axis.challenges": "Prawdopodobne wyzwania",
  "cr.axis.competitors": "Konkurencja",
  "cr.axis.none": "Nie wiemy. Nic o tym nie udało się potwierdzić w źródle.",
  "cr.src.offer": "Z treści oferty",
  "cr.src.web": "Ze strony {host}",
  "cr.src.web.checked": "newrole.it znalazło ten cytat na tej stronie {date}.",
  "cr.src.own": "strona firmy",

  "cr.angle.title": "Twój punkt zaczepienia",
  "cr.angle.sub": "Tylko to, co jest w Twoim CV i profilu, zestawione z tym, czego chce oferta.",
  "cr.angle.offer": "Oferta",
  "cr.angle.you": "Twoje dane",
  "cr.angle.none": "Model nie wskazał niczego, co dało się potwierdzić w Twoim CV i profilu.",

  "cr.q.title": "Pytania, które warto im zadać",
  "cr.q.sub": "Z tego, czego nie wiemy, i z tego, co oferta zostawia niejasne.",
  "cr.q.why.unknown": "Nie mamy o tym potwierdzonej informacji.",
  "cr.q.why.records": "Z danych o ogłoszeniu i Twoich aplikacjach.",
  "cr.q.why.offer": "Oferta pisze:",
  "cr.q.why.model": "Pytanie zaproponował model po przeczytaniu oferty.",
  "cr.q.axis.strategy": "Na czym firma dziś zarabia i co jest jej priorytetem na najbliższy rok?",
  "cr.q.axis.moves": "Co zmieniło się w firmie albo w zespole w ostatnich miesiącach?",
  "cr.q.axis.culture":
    "Jak zespół pracuje na co dzień: jak planuje pracę, sprawdza kod i wdraża zmiany?",
  "cr.q.axis.challenges":
    "Jaki problem ma rozwiązać osoba na tym stanowisku w pierwszych miesiącach?",
  "cr.q.axis.competitors": "Kogo uważacie za konkurencję i czym się od niej różnicie?",
  // n is always above 60 here, and "dni" is the form for every such number
  "cr.q.rec.posting-old":
    "Ogłoszenie ma {n} dni. Czy rekrutacja nadal trwa i na jakim jest etapie?",
  "cr.q.rec.evergreen":
    "Firma ma więcej otwartych ogłoszeń o tym samym tytule. Ile osób zatrudniacie na to stanowisko i do których zespołów?",
  "cr.q.rec.intermediary":
    "Ogłoszenie wystawił pośrednik. Dla jakiej firmy jest ta rekrutacja i kto podejmuje w niej decyzję?",
  "cr.q.rec.maybe-closed":
    "Przy ostatnim sprawdzeniu nie znaleźliśmy tego ogłoszenia na stronie firmy. Czy stanowisko jest nadal otwarte?",
  "cr.q.rec.applied-before":
    "Masz w bazie wcześniejszą aplikację do tej firmy. Czy ma ona znaczenie w tej rekrutacji?",

  "cr.meta.when": "Notatka z {date} ({age}).",
  "cr.meta.from": "Powstała z oferty „{title}”.",
  "cr.meta.otherOffer":
    "Ta notatka powstała z innej oferty tej firmy: „{title}”. Napisz ją od nowa, żeby powstała z tej oferty.",
  "cr.meta.otherOffer.gone":
    "Ta notatka powstała z innej oferty tej firmy, której już nie ma w indeksie. Napisz ją od nowa, żeby powstała z tej oferty.",
  "cr.stale": "Od czasu tej notatki zmieniła się treść oferty.",
  "cr.offer.state.no-text":
    "Nie mamy treści tej oferty, więc w notatce nie ma nic z oferty. Wklej treść na stronie oferty.",
  "cr.offer.state.withheld":
    "Strona tej oferty zastrzega, że jej treści nie wolno dawać modelom, więc model jej nie czytał.",
  "cr.offer.state.failed":
    "Model nie zwrócił czytelnej odpowiedzi o treści oferty. Spróbuj ponownie.",
  "cr.web.state.done": "Wyszukiwania w internecie: {n}, przy limicie {cap}.",
  "cr.web.state.provider":
    "Nie szukaliśmy w internecie: potrafi to tylko Claude CLI, a skonfigurowany jest inny model.",
  "cr.web.state.not-asked": "Nie szukaliśmy w internecie, bo ta opcja była wyłączona.",
  "cr.web.state.failed": "Szukanie w internecie nie zwróciło czytelnej odpowiedzi.",

  "cr.dropped.title": "Czego tu nie ma",
  "cr.dropped.why":
    "Odrzucamy punkt, gdy jego cytatu nie ma w źródle, gdy zdanie podaje liczbę, której nie ma w cytacie, albo gdy mówi o liczbie pracowników, finansowaniu, zwolnieniach, ocenach lub wynagrodzeniach, a nie stoi za nim strona, która to potwierdza.",
  "cr.dropped.offer.one": "Odrzuciliśmy {n} punkt, który model podał z oferty.",
  "cr.dropped.offer.few": "Odrzuciliśmy {n} punkty, które model podał z oferty.",
  "cr.dropped.offer.many": "Odrzuciliśmy {n} punktów, które model podał z oferty.",
  "cr.dropped.web.one": "Odrzuciliśmy {n} punkt, który model podał z internetu.",
  "cr.dropped.web.few": "Odrzuciliśmy {n} punkty, które model podał z internetu.",
  "cr.dropped.web.many": "Odrzuciliśmy {n} punktów, które model podał z internetu.",
  "cr.dropped.angle.one": "Odrzuciliśmy {n} punkt o Tobie, bo nie znaleźliśmy go w Twoich danych.",
  "cr.dropped.angle.few":
    "Odrzuciliśmy {n} punkty o Tobie, bo nie znaleźliśmy ich w Twoich danych.",
  "cr.dropped.angle.many":
    "Odrzuciliśmy {n} punktów o Tobie, bo nie znaleźliśmy ich w Twoich danych.",
  "cr.dropped.questions.one": "Odrzuciliśmy {n} pytanie, bo zawierało niepotwierdzone twierdzenie.",
  "cr.dropped.questions.few":
    "Odrzuciliśmy {n} pytania, bo zawierały niepotwierdzone twierdzenia.",
  "cr.dropped.questions.many":
    "Odrzuciliśmy {n} pytań, bo zawierały niepotwierdzone twierdzenia.",
  "cr.unread.title": "Strony, których newrole.it nie przeczytało",
  "cr.unread.sub":
    "Model powołał się na te strony, ale newrole.it nie mogło ich przeczytać. Nie pokazujemy więc tego, co model z nich podał. Możesz je otworzyć i sprawdzić.",
  "cr.unread.blocked":
    "Strona nie pozwala na odczyt: robots.txt, logowanie albo zasady źródeł newrole.it.",
  "cr.unread.failed": "Strona nie odpowiedziała.",
  "cr.unread.opt-out": "Strona zastrzega, że jej treści nie wolno dawać modelom.",
  "cr.unread.not-text": "Pod tym adresem nie ma strony z tekstem.",
  "cr.unread.limit": "Ponad limit stron sprawdzanych dla jednej notatki.",

  "cr.card.none": "Sprawdź, co wiadomo o firmie, zanim zaaplikujesz.",
  "cr.card.open": "Zobacz, co wiemy o firmie",
  "cr.card.when": "Notatka z {when}.",
  "cr.card.points.one": "{n} zdanie ze sprawdzonym źródłem",
  "cr.card.points.few": "{n} zdania ze sprawdzonym źródłem",
  "cr.card.points.many": "{n} zdań ze sprawdzonym źródłem",
  "cr.card.apps.one": "{n} Twoja aplikacja do tej firmy",
  "cr.card.apps.few": "{n} Twoje aplikacje do tej firmy",
  "cr.card.apps.many": "{n} Twoich aplikacji do tej firmy",
}

export const researchEn: Record<keyof typeof researchPl, string> = {
  "cr.title": "About the company",
  "cr.sub": "{company} · {title}",
  "cr.back": "Back to the offer",
  "cr.how":
    "Every sentence in this brief has a source that code checked: a fragment of the offer, your own data, or a page newrole.it read itself. What could not be confirmed is not here.",
  "cr.limits":
    "We check that the quote is in the source. We do not check that the source is right, or that the model's sentence renders the quote well. That is why every sentence comes with its quote.",

  "cr.rec.title": "What your database holds",
  "cr.rec.sub": "Data from your newrole.it database, read just now. No model took part.",
  "cr.rec.domain": "Domain",
  "cr.rec.domain.none": "We don't know this company's domain.",
  "cr.rec.career": "Its jobs page",
  "cr.rec.aliases": "Other names in the database",
  "cr.rec.open.title": "The company's other open postings",
  "cr.rec.open.none": "The index holds no other open postings of this company.",
  "cr.rec.open.count.one": "{n} open posting in the index",
  "cr.rec.open.count.few": "{n} open postings in the index",
  "cr.rec.open.count.many": "{n} open postings in the index",
  "cr.rec.open.more.one": "There is {n} more posting not shown here.",
  "cr.rec.open.more.few": "There are {n} more postings not shown here.",
  "cr.rec.open.more.many": "There are {n} more postings not shown here.",
  "cr.rec.history.title": "Your history with this company",
  "cr.rec.apps.none": "Your database holds no application to this company.",
  "cr.rec.app.when": "Applied {date}",
  "cr.rec.app.this": "this offer",
  "cr.rec.app.closedAt": "Ended at the stage: {stage}",
  "cr.rec.offers.title": "Other offers of this company you keep",
  "cr.rec.offer.when": "Added {date}",
  "cr.rec.hiring.closed": "This posting is closed.",

  "cr.brief.title": "The brief",
  "cr.none.title": "There is no brief about this company yet",
  "cr.none.body":
    "The model reads the offer and lists what it says about the company: the product and direction, recent changes, how the team works, the challenges and the competition. It also sets your experience against what the offer asks for. Every sentence gets a quote, and code checks that the quote is in the source.",
  "cr.noModel":
    "No language model is configured, so we cannot write a brief about the company. Below is what your database holds, and questions worth asking.",
  "cr.web.option": "Search the web too (at most {n} searches)",
  "cr.web.option.hint":
    "The search gets the company's name and the job title. Your CV and profile are not sent.",
  "cr.web.unavailable":
    "Only the Claude CLI can search the web. With the current model the brief comes from the offer's text alone.",
  "cr.run": "Write the brief",
  "cr.rerun": "Write it again",
  "cr.run.title": "Writing the company brief",
  "cr.run.wait": "The model is reading the offer. Keep this tab open.",
  "cr.run.wait.web":
    "The model is reading the offer and searching the web, and then newrole.it opens every page the model quoted. This can take a few minutes. Keep this tab open.",
  "cr.err.failed": "We couldn't write the brief. Try again.",
  "cr.err.noJob": "We couldn't find this offer.",

  "cr.axis.strategy": "Product and strategy",
  "cr.axis.moves": "Recent moves",
  "cr.axis.culture": "Engineering culture",
  "cr.axis.challenges": "Likely challenges",
  "cr.axis.competitors": "Competitors",
  "cr.axis.none": "Unknown. Nothing about this could be confirmed in a source.",
  "cr.src.offer": "From the offer's text",
  "cr.src.web": "From a page on {host}",
  "cr.src.web.checked": "newrole.it found this quote on that page on {date}.",
  "cr.src.own": "the company's site",

  "cr.angle.title": "Your angle",
  "cr.angle.sub": "Only what your CV and profile hold, set against what the offer asks for.",
  "cr.angle.offer": "The offer",
  "cr.angle.you": "Your data",
  "cr.angle.none": "The model named nothing that could be confirmed in your CV and profile.",

  "cr.q.title": "Questions worth asking them",
  "cr.q.sub": "From what we don't know, and from what the offer leaves vague.",
  "cr.q.why.unknown": "We have no confirmed information about this.",
  "cr.q.why.records": "From the data on the posting and your applications.",
  "cr.q.why.offer": "The offer says:",
  "cr.q.why.model": "Suggested by the model after reading the offer.",
  "cr.q.axis.strategy":
    "What does the company earn its money from today, and what is its priority for the coming year?",
  "cr.q.axis.moves": "What has changed in the company or the team in the last few months?",
  "cr.q.axis.culture":
    "How does the team work day to day: how does it plan work, review code and ship changes?",
  "cr.q.axis.challenges":
    "What problem should the person in this role solve in their first months?",
  "cr.q.axis.competitors": "Who do you see as your competitors, and how do you differ from them?",
  "cr.q.rec.posting-old":
    "The posting is {n} days old. Is the hiring still going on, and what stage is it at?",
  "cr.q.rec.evergreen":
    "The company has more open postings with the same title. How many people are you hiring for this role, and for which teams?",
  "cr.q.rec.intermediary":
    "The posting was placed by an intermediary. Which company is hiring, and who makes the decision?",
  "cr.q.rec.maybe-closed":
    "At the last check we did not find this posting on the company's site. Is the position still open?",
  "cr.q.rec.applied-before":
    "Your database holds an earlier application to this company. Does it matter for this one?",

  "cr.meta.when": "Brief from {date} ({age}).",
  "cr.meta.from": "Written from the offer “{title}”.",
  "cr.meta.otherOffer":
    "This brief was written from another offer of this company: “{title}”. Write it again to base it on this offer.",
  "cr.meta.otherOffer.gone":
    "This brief was written from another offer of this company, which is no longer in the index. Write it again to base it on this offer.",
  "cr.stale": "The offer's text has changed since this brief.",
  "cr.offer.state.no-text":
    "We don't have this offer's text, so the brief holds nothing from the offer. Paste the text on the offer's page.",
  "cr.offer.state.withheld":
    "The offer's page says its text must not be given to models, so the model did not read it.",
  "cr.offer.state.failed":
    "The model gave no readable answer about the offer's text. Try again.",
  "cr.web.state.done": "Web searches: {n}, with a limit of {cap}.",
  "cr.web.state.provider":
    "We did not search the web: only the Claude CLI can, and another model is configured.",
  "cr.web.state.not-asked": "We did not search the web because that option was off.",
  "cr.web.state.failed": "The web search gave no readable answer.",

  "cr.dropped.title": "What is not here",
  "cr.dropped.why":
    "We drop a point when its quote is not in the source, when the sentence gives a number the quote does not hold, or when it speaks of headcount, funding, layoffs, ratings or pay without a page that confirms it.",
  "cr.dropped.offer.one": "We dropped {n} point the model gave from the offer.",
  "cr.dropped.offer.few": "We dropped {n} points the model gave from the offer.",
  "cr.dropped.offer.many": "We dropped {n} points the model gave from the offer.",
  "cr.dropped.web.one": "We dropped {n} point the model gave from the web.",
  "cr.dropped.web.few": "We dropped {n} points the model gave from the web.",
  "cr.dropped.web.many": "We dropped {n} points the model gave from the web.",
  "cr.dropped.angle.one": "We dropped {n} point about you: we did not find it in your data.",
  "cr.dropped.angle.few": "We dropped {n} points about you: we did not find them in your data.",
  "cr.dropped.angle.many": "We dropped {n} points about you: we did not find them in your data.",
  "cr.dropped.questions.one": "We dropped {n} question because it held an unconfirmed claim.",
  "cr.dropped.questions.few": "We dropped {n} questions because they held unconfirmed claims.",
  "cr.dropped.questions.many": "We dropped {n} questions because they held unconfirmed claims.",
  "cr.unread.title": "Pages newrole.it did not read",
  "cr.unread.sub":
    "The model cited these pages, but newrole.it could not read them, so what the model reported from them is not shown. You can open them and check for yourself.",
  "cr.unread.blocked":
    "The page does not allow reading: robots.txt, a login, or newrole.it's source rules.",
  "cr.unread.failed": "The page did not answer.",
  "cr.unread.opt-out": "The page says its text must not be given to models.",
  "cr.unread.not-text": "There is no page with text at this address.",
  "cr.unread.limit": "Over the limit of pages checked for one brief.",

  "cr.card.none": "See what is known about the company before you apply.",
  "cr.card.open": "See what we know about the company",
  "cr.card.when": "Brief from {when}.",
  "cr.card.points.one": "{n} sentence with a checked source",
  "cr.card.points.few": "{n} sentences with a checked source",
  "cr.card.points.many": "{n} sentences with a checked source",
  "cr.card.apps.one": "{n} application of yours to this company",
  "cr.card.apps.few": "{n} applications of yours to this company",
  "cr.card.apps.many": "{n} applications of yours to this company",
}
