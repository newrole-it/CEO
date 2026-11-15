/**
 * Strings for interview preparation and the story bank (src/server/interview). Keys "iv.".
 */
export const interviewPl = {
  "iv.title": "Przygotowanie do rozmowy",
  "iv.back": "Wróć do oferty",
  "iv.for": "{title} w {company}",
  "iv.prepare": "Przygotuj",
  "iv.regenerate": "Przygotuj od nowa",
  "iv.running":
    "Czytam ofertę, Twoje CV i historie. To może potrwać kilka minut, nie zamykaj tej strony.",
  "iv.running.rules": "Układam przygotowanie z tego, co już jest zapisane.",
  "iv.err.prepare": "Nie udało się przygotować. Spróbuj jeszcze raz.",
  "iv.err.limited": "Za dużo przygotowań w ostatniej godzinie. Spróbuj ponownie za godzinę.",
  "iv.empty.title": "Nie ma jeszcze przygotowania do tej oferty",
  "iv.empty.body":
    "Z treści oferty, Twojego CV, dopasowania i banku historii ułożę prawdopodobne pytania, wskażę, która historia odpowiada na które wymaganie, nazwę ryzyka i podpowiem, o co zapytać firmę.",
  "iv.empty.body.rules":
    "Model nie jest skonfigurowany, więc ułożę to regułami: pytania z wymagań oferty, historie dopasowane po słowach, ryzyka z ostatniego dopasowania i pytania do firmy.",
  "iv.meta.when": "Przygotowano {when}",
  "iv.meta.reader.llm": "Sformułowane przez model i sprawdzone z Twoimi danymi",
  "iv.meta.reader.rules": "Ułożone regułami, bez modelu",
  "iv.meta.match.round": "Ryzyka z ostatniej rundy dopasowania CV",
  "iv.meta.match.fresh": "Ryzyka ze sprawdzenia CV zrobionego na potrzeby tej strony",
  "iv.meta.match.none": "Bez dopasowania CV do oferty",
  "iv.missing.title": "Czego zabrakło przy przygotowaniu:",
  "iv.missing.offer-text":
    "Nie masz zapisanej treści oferty, więc pytań z jej wymagań nie da się ułożyć. Dodaj treść w ofercie.",
  "iv.missing.requirements":
    "Wymagania tej oferty nie zostały jeszcze odczytane. Dostosuj CV do oferty, a pojawią się tutaj.",
  "iv.missing.match":
    "Nie ma dopasowania CV do tej oferty, więc ryzyka są nieznane. Dostosuj CV do oferty.",
  "iv.missing.stories": "Bank historii jest pusty. Dodaj pierwszą historię.",
  "iv.missing.cv": "Nie masz jeszcze CV, z którym można porównać ofertę. Dodaj CV.",
  "iv.missing.model":
    "Model nie jest skonfigurowany: pytania mają stałe brzmienie, a historie są dopasowane po słowach.",

  "iv.questions.title": "Prawdopodobne pytania",
  "iv.questions.sub":
    "Pytania wynikają z wymagań oferty albo są ogólne. Nie wiemy, o co ta firma naprawdę pyta.",
  "iv.questions.story": "Odpowiedz historią: {title}",
  "iv.audience.recruiter": "Rekruter",
  "iv.audience.recruiter.sub": "Pierwsza rozmowa: dopasowanie, formalności, warunki.",
  "iv.audience.manager": "Przełożony",
  "iv.audience.manager.sub": "Zakres roli, odpowiedzialność, sposób pracy.",
  "iv.audience.peer": "Zespół i rozmowa techniczna",
  "iv.audience.peer.sub": "Jak głęboko znasz to, czym będziesz się zajmować.",
  "iv.basis.requirement": "Z wymagania oferty",
  "iv.basis.general": "Ogólne",
  "iv.q.requirement": "Opowiedz o swoim doświadczeniu w tym obszarze: {requirement}.",
  "iv.q.general.walk-through": "Opowiedz o swojej dotychczasowej drodze zawodowej.",
  "iv.q.general.why-looking": "Dlaczego szukasz teraz nowej pracy?",
  "iv.q.general.salary": "Jakie masz oczekiwania finansowe?",
  "iv.q.general.availability": "Od kiedy możesz zacząć i jaki masz okres wypowiedzenia?",
  "iv.q.general.work-mode": "Jaki tryb pracy i jaka lokalizacja Ci odpowiadają?",
  "iv.q.general.why-role": "Dlaczego ta rola i dlaczego ta firma?",
  "iv.q.general.proud": "Z którego projektu jesteś najbardziej zadowolony i co w nim było Twoje?",
  "iv.q.general.conflict":
    "Opowiedz o sytuacji, w której nie zgadzałeś się z kimś z zespołu. Jak to się skończyło?",
  "iv.q.general.failure": "Opowiedz o czymś, co się nie udało. Co dziś zrobiłbyś inaczej?",
  "iv.q.general.hard-problem":
    "Jaki był najtrudniejszy problem, który ostatnio rozwiązałeś? Jak do niego podszedłeś?",
  "iv.q.general.trade-off":
    "Opowiedz o decyzji, w której musiałeś wybrać między dwoma dobrymi rozwiązaniami.",
  "iv.q.general.feedback": "Jak dajesz i jak przyjmujesz uwagi do swojej pracy?",

  "iv.mapping.title": "Historie do wymagań",
  "iv.mapping.sub":
    "Dla każdego ważnego wymagania: która zapisana historia na nie odpowiada i jak dobrze. Szkice się nie liczą.",
  "iv.mapping.none": "Bez wymagań oferty nie ma do czego dopasować historii.",
  "iv.mapping.by.model": "Model wskazał fragment historii, a kod znalazł go w niej",
  "iv.mapping.by.rules": "Dopasowane po słowach",
  "iv.mapping.story": "Historia: {title}",
  "iv.mapping.unbacked":
    "Liczby z tej historii, których nie ma w Twoim CV ani profilu: {numbers}. Sprawdź je, zanim je podasz.",
  "iv.mapping.missing.title": "Brakujące historie",
  "iv.mapping.missing.none": "Każde z tych wymagań ma swoją historię.",
  "iv.mapping.lead": "W Twoim CV jest fragment, od którego można zacząć:",
  "iv.mapping.add": "Dodaj historię",
  "iv.importance.required": "Wymagane",
  "iv.importance.preferred": "Mile widziane",
  "iv.importance.soft": "Miękkie",
  "iv.fit.strong": "Mocne dopasowanie",
  "iv.fit.partial": "Częściowe",
  "iv.fit.none": "Brak historii",

  "iv.risks.title": "Ryzyka",
  "iv.risks.sub":
    "Wymagania obowiązkowe, których dopasowanie nie znalazło w Twoich danych, i uczciwe zdanie na każde z nich.",
  "iv.risks.unknown":
    "Nie wiadomo: nie ma jeszcze dopasowania CV do tej oferty, więc nie da się wskazać niespełnionych wymagań.",
  "iv.risks.none": "Dopasowanie nie znalazło niespełnionych wymagań obowiązkowych.",
  "iv.risks.status.met": "Spełnione",
  "iv.risks.status.partial": "Częściowo",
  "iv.risks.status.missing": "Brak w danych",
  "iv.risks.gap.critical": "Może przesądzić o odrzuceniu",
  "iv.risks.gap.major": "Istotna luka",
  "iv.risks.gap.minor": "Drobna luka",
  "iv.risks.evidence": "Co pokazują Twoje dane:",
  "iv.risks.line.model": "Co możesz powiedzieć:",
  "iv.risks.line.match": "Wskazówka z dopasowania:",
  "iv.risks.line.none":
    "Powiedz wprost, że tego nie masz, i pokaż, co z Twojego doświadczenia jest najbliżej.",

  "iv.asks.title": "O co zapytać firmę",
  "iv.asks.sub":
    "Pytania z tego, co oferta mówi niejasno albo pomija. Każde ma podane, skąd się wzięło.",
  "iv.asks.basis.red-flag": "Sygnał ostrzegawczy w ofercie",
  "iv.asks.basis.offer": "Z treści oferty",
  "iv.asks.basis.unknown": "Oferta tego nie podaje",
  "iv.asks.basis.general": "Ogólne",
  "iv.ask.redFlag": "W ofercie jest sformułowanie „{quote}”. Co ono oznacza na co dzień?",
  "iv.ask.offer": "W ofercie jest fragment „{quote}”. Co dokładnie się za nim kryje?",
  "iv.ask.unknown.salary": "Jakie są widełki wynagrodzenia na tym stanowisku?",
  "iv.ask.unknown.work-mode":
    "Jak wygląda tryb pracy: zdalnie, hybrydowo czy z biura? Ile dni w biurze?",
  "iv.ask.unknown.contract": "Jaka forma współpracy wchodzi w grę?",
  "iv.ask.general.process":
    "Jak wyglądają kolejne etapy rekrutacji i kiedy mogę spodziewać się decyzji?",
  "iv.ask.general.success": "Po czym poznacie za pół roku, że to była dobra decyzja?",
  "iv.ask.general.team": "Z kim będę pracować na co dzień i komu podlega ta rola?",

  "iv.card.title": "Przygotowanie do rozmowy",
  "iv.card.body": "Prawdopodobne pytania, Twoje historie do wymagań, ryzyka i pytania do firmy.",
  "iv.nav.stories": "Historie",

  "iv.stories.title": "Bank historii",
  "iv.stories.sub":
    "Twoje historie na rozmowy: sytuacja, zadanie, działanie, rezultat i wniosek. Kilka dobrych historii wystarcza na większość pytań o doświadczenie.",
  "iv.stories.count.one": "{n} zapisana historia",
  "iv.stories.count.few": "{n} zapisane historie",
  "iv.stories.count.many": "{n} zapisanych historii",
  "iv.stories.add": "Dodaj historię",
  "iv.stories.list": "Historie",
  "iv.stories.signIn.title": "Zaloguj się, żeby prowadzić bank historii",
  "iv.stories.signIn.body": "Historie są zapisane na Twoim koncie i wracają przy każdej rozmowie.",
  "iv.stories.signIn.cta": "Zaloguj się",
  "iv.stories.empty.title": "Nie masz jeszcze żadnej historii",
  "iv.stories.empty.body":
    "Zapisz sytuację z pracy, o której opowiadasz na rozmowach: co się działo, co było Twoim zadaniem, co zrobiłeś i co z tego wyszło.",
  "iv.stories.empty.add": "Dodaj pierwszą historię",
  "iv.stories.filter": "Pokaż",
  "iv.stories.filter.all": "Wszystkie",
  "iv.stories.filter.saved": "Zapisane",
  "iv.stories.filter.draft": "Szkice",
  "iv.stories.filter.none": "W tym widoku nie ma historii.",

  "iv.draft.cta": "Naszkicuj z mojego CV",
  "iv.draft.running":
    "Szukam w Twoim CV i profilu sytuacji, z których da się ułożyć historie. To może potrwać minutę lub dwie.",
  "iv.draft.done.one": "Jest {n} szkic. Przeczytaj go, uzupełnij i zapisz.",
  "iv.draft.done.few": "Są {n} szkice. Przeczytaj je, uzupełnij i zapisz.",
  "iv.draft.done.many": "Jest {n} szkiców. Przeczytaj je, uzupełnij i zapisz.",
  "iv.draft.dropped.one": "{n} szkic odrzuciłem, bo Twoje dane go nie potwierdzały.",
  "iv.draft.dropped.few": "{n} szkice odrzuciłem, bo Twoje dane ich nie potwierdzały.",
  "iv.draft.dropped.many": "{n} szkiców odrzuciłem, bo Twoje dane ich nie potwierdzały.",
  "iv.draft.code.drafted": "Szkice są gotowe.",
  "iv.draft.code.nothing":
    "Żaden szkic nie przeszedł sprawdzenia z Twoimi danymi. Dodaj historię ręcznie albo uzupełnij CV i profil.",
  "iv.draft.code.no-data":
    "Nie masz jeszcze CV ani profilu, więc nie ma z czego szkicować. Dodaj CV albo napisz historię ręcznie.",
  "iv.draft.code.no-model": "Model nie jest skonfigurowany. Historie dodajesz ręcznie.",
  "iv.draft.code.failed":
    "Model nie odpowiedział. Spróbuj jeszcze raz albo dodaj historię ręcznie.",
  "iv.draft.code.limited":
    "Za dużo szkicowań w ostatniej godzinie. Spróbuj ponownie za godzinę albo dodaj historię ręcznie.",
  "iv.draft.noModel":
    "Model nie jest skonfigurowany, więc szkicowanie z CV jest niedostępne. Historie dodajesz ręcznie.",
  "iv.draft.banner":
    "To szkic napisany przez model z Twojego CV i profilu. Nie trafia do przygotowań, dopóki go nie zapiszesz. Popraw go tak, żeby brzmiał jak Ty.",

  "iv.story.draft": "Szkic",
  "iv.story.missing": "Do uzupełnienia: {parts}",
  "iv.story.updated": "Zmieniono {when}",
  "iv.story.saved": "Historia zapisana",
  "iv.story.deleted": "Historia usunięta",
  "iv.story.save": "Zapisz",
  "iv.story.saveDraft": "Zapisz w banku historii",
  "iv.story.delete": "Usuń historię",
  "iv.story.discard": "Odrzuć szkic",
  "iv.story.delete.confirm": "Usunąć tę historię? Tego nie da się cofnąć.",
  "iv.story.delete.yes": "Usuń",
  "iv.story.err.title": "Nadaj historii tytuł.",
  "iv.story.err.limit": "Bank historii jest pełny. Usuń którąś historię, żeby dodać nową.",
  "iv.story.err.save": "Nie udało się zapisać. Spróbuj jeszcze raz.",
  "iv.story.err.delete": "Nie udało się usunąć historii.",
  "iv.story.origin.manual": "Napisana ręcznie",
  "iv.story.origin.draft": "Zaczęta od szkicu modelu",
  "iv.story.origin.mcp": "Dodana przez Claude",

  "iv.panel.new": "Nowa historia",
  "iv.panel.edit": "Historia",
  "iv.panel.draft": "Szkic historii",
  "iv.checks.title": "Co sprawdziliśmy w tym szkicu",
  "iv.checks.evidence": "Opiera się na tym fragmencie Twoich danych:",
  "iv.checks.removed": "Usunięte zdania, bo Twoje dane ich nie potwierdzają:",
  "iv.checks.removed.number":
    "{part}: zdanie z liczbą {value}, której nie ma w Twoim CV ani profilu.",
  "iv.checks.removed.name": "{part}: zdanie z nazwą {value}, której nie ma w Twoim CV ani profilu.",
  "iv.checks.questions": "Pytania do Ciebie, bo dane tego nie mówią:",
  "iv.field.title": "Tytuł",
  "iv.field.title.hint": "Na przykład: migracja rozliczeń bez przestoju",
  "iv.field.themes": "Do jakich pytań pasuje",
  "iv.field.themes.hint":
    "Tematy lub pytania, przy których opowiesz tę historię: przywództwo, konflikt, porażka. Zatwierdź Enterem.",
  "iv.field.source": "Skąd ta historia",
  "iv.field.source.hint": "Firma i rola albo projekt.",
  "iv.part.situation": "Sytuacja",
  "iv.part.situation.hint": "Kontekst w dwóch, trzech zdaniach: gdzie, kiedy, co było nie tak.",
  "iv.part.situation.ask": "Dane tego nie mówią. Jaki był punkt wyjścia?",
  "iv.part.task": "Zadanie",
  "iv.part.task.hint": "Za co odpowiadałeś Ty, nie cały zespół.",
  "iv.part.task.ask": "Dane tego nie mówią. Co było Twoim zadaniem?",
  "iv.part.action": "Działanie",
  "iv.part.action.hint": "Co konkretnie zrobiłeś, krok po kroku.",
  "iv.part.action.ask": "Dane tego nie mówią. Co dokładnie zrobiłeś?",
  "iv.part.result": "Rezultat",
  "iv.part.result.hint": "Co się zmieniło. Liczby tylko takie, które znasz na pewno.",
  "iv.part.result.ask":
    "Twoje dane nie podają rezultatu, więc nie został dopisany. Co się zmieniło i jak to zmierzono?",
  "iv.part.reflection": "Wniosek",
  "iv.part.reflection.hint": "Czego Cię to nauczyło albo co dziś zrobiłbyś inaczej.",
  "iv.part.reflection.ask": "Wniosek możesz napisać tylko Ty. Czego Cię to nauczyło?",
}

export const interviewEn: Record<keyof typeof interviewPl, string> = {
  "iv.title": "Interview preparation",
  "iv.back": "Back to the offer",
  "iv.for": "{title} at {company}",
  "iv.prepare": "Prepare",
  "iv.regenerate": "Prepare again",
  "iv.running":
    "Reading the offer, your CV and your stories. This can take a few minutes; keep this page open.",
  "iv.running.rules": "Putting the preparation together from what is already saved.",
  "iv.err.prepare": "The preparation could not be made. Try again.",
  "iv.err.limited": "Too many preparations in the last hour. Try again in an hour.",
  "iv.empty.title": "There is no preparation for this offer yet",
  "iv.empty.body":
    "From the offer's text, your CV, the match and your story bank I will list likely questions, show which story answers which requirement, name the risks and suggest what to ask the company.",
  "iv.empty.body.rules":
    "No model is configured, so I will use rules: questions from the offer's requirements, stories matched by words, risks from the latest match and questions for the company.",
  "iv.meta.when": "Prepared {when}",
  "iv.meta.reader.llm": "Worded by a model and checked against your data",
  "iv.meta.reader.rules": "Put together by rules, without a model",
  "iv.meta.match.round": "Risks from the latest round of the CV match",
  "iv.meta.match.fresh": "Risks from a check of your CV made for this page",
  "iv.meta.match.none": "No match of your CV with the offer",
  "iv.missing.title": "What was missing when this was prepared:",
  "iv.missing.offer-text":
    "You have no saved text of the offer, so no questions could be drawn from its requirements. Add the text in the offer.",
  "iv.missing.requirements":
    "This offer's requirements have not been read yet. Tailor your CV to the offer and they will appear here.",
  "iv.missing.match":
    "There is no match of your CV with this offer, so the risks are unknown. Tailor your CV to the offer.",
  "iv.missing.stories": "Your story bank is empty. Add your first story.",
  "iv.missing.cv": "You have no CV yet to compare with the offer. Add a CV.",
  "iv.missing.model":
    "No model is configured: the questions have fixed wording and stories are matched by words.",

  "iv.questions.title": "Likely questions",
  "iv.questions.sub":
    "Each question comes from a requirement of the offer or is a general one. We do not know what this company actually asks.",
  "iv.questions.story": "Answer with the story: {title}",
  "iv.audience.recruiter": "Recruiter",
  "iv.audience.recruiter.sub": "The first call: fit, formalities, conditions.",
  "iv.audience.manager": "Hiring manager",
  "iv.audience.manager.sub": "The scope of the role, ownership, ways of working.",
  "iv.audience.peer": "Team and technical round",
  "iv.audience.peer.sub": "How deeply you know the work you would be doing.",
  "iv.basis.requirement": "From a requirement of the offer",
  "iv.basis.general": "General",
  "iv.q.requirement": "Tell me about your experience in this area: {requirement}.",
  "iv.q.general.walk-through": "Walk me through your career so far.",
  "iv.q.general.why-looking": "Why are you looking for a new job now?",
  "iv.q.general.salary": "What are your salary expectations?",
  "iv.q.general.availability": "When could you start, and what is your notice period?",
  "iv.q.general.work-mode": "Which work mode and location suit you?",
  "iv.q.general.why-role": "Why this role, and why this company?",
  "iv.q.general.proud": "Which project are you most pleased with, and what in it was yours?",
  "iv.q.general.conflict":
    "Tell me about a time you disagreed with someone on your team. How did it end?",
  "iv.q.general.failure":
    "Tell me about something that did not work out. What would you do differently today?",
  "iv.q.general.hard-problem":
    "What was the hardest problem you solved recently? How did you approach it?",
  "iv.q.general.trade-off":
    "Tell me about a decision where you had to choose between two good options.",
  "iv.q.general.feedback": "How do you give and take feedback on work?",

  "iv.mapping.title": "Stories for the requirements",
  "iv.mapping.sub":
    "For each key requirement: which saved story answers it, and how well. Drafts do not count.",
  "iv.mapping.none": "Without the offer's requirements there is nothing to map stories to.",
  "iv.mapping.by.model": "The model pointed at a fragment of the story and code found it there",
  "iv.mapping.by.rules": "Matched by words",
  "iv.mapping.story": "Story: {title}",
  "iv.mapping.unbacked":
    "Numbers in this story that your CV and profile do not have: {numbers}. Check them before you say them.",
  "iv.mapping.missing.title": "Missing stories",
  "iv.mapping.missing.none": "Each of these requirements has a story.",
  "iv.mapping.lead": "Your CV has a fragment to start from:",
  "iv.mapping.add": "Add a story",
  "iv.importance.required": "Required",
  "iv.importance.preferred": "Nice to have",
  "iv.importance.soft": "Soft",
  "iv.fit.strong": "Strong fit",
  "iv.fit.partial": "Partial",
  "iv.fit.none": "No story",

  "iv.risks.title": "Risks",
  "iv.risks.sub":
    "Required items the match did not find in your data, with an honest line for each.",
  "iv.risks.unknown":
    "Unknown: there is no match of your CV with this offer yet, so unmet requirements cannot be named.",
  "iv.risks.none": "The match found no unmet required items.",
  "iv.risks.status.met": "Met",
  "iv.risks.status.partial": "Partly",
  "iv.risks.status.missing": "Not in your data",
  "iv.risks.gap.critical": "May be a deal-breaker",
  "iv.risks.gap.major": "A real gap",
  "iv.risks.gap.minor": "A small gap",
  "iv.risks.evidence": "What your data shows:",
  "iv.risks.line.model": "What you can say:",
  "iv.risks.line.match": "A hint from the match:",
  "iv.risks.line.none":
    "Say plainly that you do not have it, and show what in your experience is closest.",

  "iv.asks.title": "What to ask the company",
  "iv.asks.sub":
    "Questions from what the offer says vaguely or leaves out. Each says where it comes from.",
  "iv.asks.basis.red-flag": "A warning sign in the offer",
  "iv.asks.basis.offer": "From the offer's text",
  "iv.asks.basis.unknown": "The offer does not say",
  "iv.asks.basis.general": "General",
  "iv.ask.redFlag": "The offer says “{quote}”. What does that mean day to day?",
  "iv.ask.offer": "The offer says “{quote}”. What exactly is behind it?",
  "iv.ask.unknown.salary": "What is the pay range for this position?",
  "iv.ask.unknown.work-mode":
    "What is the work mode: remote, hybrid or in the office? How many days in the office?",
  "iv.ask.unknown.contract": "What kind of contract is on offer?",
  "iv.ask.general.process":
    "What are the next steps of the process, and when can I expect a decision?",
  "iv.ask.general.success": "In six months, how will you know this hire was the right one?",
  "iv.ask.general.team": "Who would I work with day to day, and who does this role report to?",

  "iv.card.title": "Interview preparation",
  "iv.card.body":
    "Likely questions, your stories for the requirements, risks and questions to ask.",
  "iv.nav.stories": "Stories",

  "iv.stories.title": "Story bank",
  "iv.stories.sub":
    "Your stories for interviews: situation, task, action, result and what you took from it. A few good stories cover most questions about experience.",
  "iv.stories.count.one": "{n} saved story",
  "iv.stories.count.few": "{n} saved stories",
  "iv.stories.count.many": "{n} saved stories",
  "iv.stories.add": "Add a story",
  "iv.stories.list": "Stories",
  "iv.stories.signIn.title": "Sign in to keep a story bank",
  "iv.stories.signIn.body": "Stories are saved to your account and come back for every interview.",
  "iv.stories.signIn.cta": "Sign in",
  "iv.stories.empty.title": "You have no stories yet",
  "iv.stories.empty.body":
    "Write down a situation from work that you talk about in interviews: what was going on, what your task was, what you did and what came of it.",
  "iv.stories.empty.add": "Add your first story",
  "iv.stories.filter": "Show",
  "iv.stories.filter.all": "All",
  "iv.stories.filter.saved": "Saved",
  "iv.stories.filter.draft": "Drafts",
  "iv.stories.filter.none": "No stories in this view.",

  "iv.draft.cta": "Draft from my CV",
  "iv.draft.running":
    "Looking through your CV and profile for situations that can become stories. This can take a minute or two.",
  "iv.draft.done.one": "{n} draft is ready. Read it, fill it in and save it.",
  "iv.draft.done.few": "{n} drafts are ready. Read them, fill them in and save them.",
  "iv.draft.done.many": "{n} drafts are ready. Read them, fill them in and save them.",
  "iv.draft.dropped.one": "I discarded {n} draft because your data did not back it.",
  "iv.draft.dropped.few": "I discarded {n} drafts because your data did not back them.",
  "iv.draft.dropped.many": "I discarded {n} drafts because your data did not back them.",
  "iv.draft.code.drafted": "The drafts are ready.",
  "iv.draft.code.nothing":
    "No draft stood up to a check against your data. Add a story by hand, or fill in your CV and profile.",
  "iv.draft.code.no-data":
    "You have no CV or profile yet, so there is nothing to draft from. Add a CV or write a story by hand.",
  "iv.draft.code.no-model": "No model is configured. You add stories by hand.",
  "iv.draft.code.failed": "The model did not answer. Try again, or add a story by hand.",
  "iv.draft.code.limited":
    "Too many drafting runs in the last hour. Try again in an hour, or add a story by hand.",
  "iv.draft.noModel":
    "No model is configured, so drafting from your CV is not available. You add stories by hand.",
  "iv.draft.banner":
    "This is a draft a model wrote from your CV and profile. It is not used in preparations until you save it. Edit it so it sounds like you.",

  "iv.story.draft": "Draft",
  "iv.story.missing": "To fill in: {parts}",
  "iv.story.updated": "Changed {when}",
  "iv.story.saved": "Story saved",
  "iv.story.deleted": "Story deleted",
  "iv.story.save": "Save",
  "iv.story.saveDraft": "Save to the story bank",
  "iv.story.delete": "Delete story",
  "iv.story.discard": "Discard draft",
  "iv.story.delete.confirm": "Delete this story? This cannot be undone.",
  "iv.story.delete.yes": "Delete",
  "iv.story.err.title": "Give the story a title.",
  "iv.story.err.limit": "The story bank is full. Delete a story to add a new one.",
  "iv.story.err.save": "The story could not be saved. Try again.",
  "iv.story.err.delete": "The story could not be deleted.",
  "iv.story.origin.manual": "Written by hand",
  "iv.story.origin.draft": "Started from a model's draft",
  "iv.story.origin.mcp": "Added through Claude",

  "iv.panel.new": "New story",
  "iv.panel.edit": "Story",
  "iv.panel.draft": "Story draft",
  "iv.checks.title": "What we checked in this draft",
  "iv.checks.evidence": "It rests on this fragment of your data:",
  "iv.checks.removed": "Sentences removed because your data does not back them:",
  "iv.checks.removed.number":
    "{part}: a sentence with the number {value}, which is not in your CV or profile.",
  "iv.checks.removed.name":
    "{part}: a sentence with the name {value}, which is not in your CV or profile.",
  "iv.checks.questions": "Questions for you, because the data does not say:",
  "iv.field.title": "Title",
  "iv.field.title.hint": "For example: moving billing with no downtime",
  "iv.field.themes": "Which questions it suits",
  "iv.field.themes.hint":
    "Themes or questions you would tell this story for: leadership, conflict, failure. Press Enter to add.",
  "iv.field.source": "Where it comes from",
  "iv.field.source.hint": "The company and role, or the project.",
  "iv.part.situation": "Situation",
  "iv.part.situation.hint": "The context in two or three sentences: where, when, what was wrong.",
  "iv.part.situation.ask": "Your data does not say. What was the starting point?",
  "iv.part.task": "Task",
  "iv.part.task.hint": "What you were responsible for, not the whole team.",
  "iv.part.task.ask": "Your data does not say. What was your task?",
  "iv.part.action": "Action",
  "iv.part.action.hint": "What exactly you did, step by step.",
  "iv.part.action.ask": "Your data does not say. What exactly did you do?",
  "iv.part.result": "Result",
  "iv.part.result.hint": "What changed. Only numbers you are sure of.",
  "iv.part.result.ask":
    "Your data states no result, so none was written. What changed, and how was it measured?",
  "iv.part.reflection": "Reflection",
  "iv.part.reflection.hint": "What it taught you, or what you would do differently today.",
  "iv.part.reflection.ask": "Only you can write this. What did it teach you?",
}
