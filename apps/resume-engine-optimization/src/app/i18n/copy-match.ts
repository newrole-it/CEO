/**
 * Strings for the match dashboard of one offer (/offers/[id]/match, src/app/offers/[id]/match):
 * how the person's CV and profile meet the offer, and what the steps of tailoring found. Keys
 * "mt.". The readings of a score and the targets are the resumeskills skills' own
 * (job-description-analyzer, resume-ats-optimizer); the dashboard names them.
 */
export const matchPl = {
  "mt.title": "Ocena dopasowania",
  "mt.sub": "{title} · {company}",
  "mt.openCv": "Otwórz CV",
  "mt.openLetter": "Otwórz list",
  "mt.back": "Wróć do oferty",
  "mt.none.title": "Ta ocena powstaje przy dopasowaniu CV",
  "mt.none.body":
    "To CV dopasowano, zanim newrole.it zaczął oceniać dopasowanie. Otwórz CV i w panelu Dopasowanie kliknij „Wygeneruj ponownie”. Obecny tekst zostanie w historii wersji.",

  "mt.score.title": "Dopasowanie do wymagań",
  "mt.score.value": "{n}%",
  "mt.score.none":
    "Nie da się policzyć wyniku: oferta nie miała treści do analizy albo ocena się nie udała.",
  "mt.band.top": "Spełniasz prawie wszystko",
  "mt.band.top.hint":
    "Według skilla job-description-analyzer przy 90–100% warto sprawdzić, czy rola nie jest poniżej Twojego poziomu.",
  "mt.band.excellent": "Bardzo dobre dopasowanie",
  "mt.band.excellent.hint": "75–89%: według job-description-analyzer warto aplikować od razu.",
  "mt.band.good": "Dobre dopasowanie",
  "mt.band.good.hint":
    "60–74%: według job-description-analyzer aplikuj z mocnym listem motywacyjnym.",
  "mt.band.stretch": "Rola na wyrost",
  "mt.band.stretch.hint":
    "50–59%: według job-description-analyzer aplikuj, jeśli bardzo Ci na tej roli zależy.",
  "mt.band.under": "Za mało spełnionych wymagań",
  "mt.band.under.hint":
    "Poniżej 50%: według job-description-analyzer lepiej odpuścić, chyba że to wymarzona rola.",
  "mt.formula":
    "Wynik liczy kod, nie model: wymagania obowiązkowe ważą 70%, mile widziane 30%, a częściowe spełnienie liczy się w połowie. Wymaganie jest spełnione tylko wtedy, gdy kod znalazł w Twoim CV lub profilu fragment, który to pokazuje.",
  "mt.critical":
    "Braki krytyczne: {n}. Skill job-description-analyzer uznaje taki brak za powód, by nie aplikować.",
  "mt.group.required": "Obowiązkowe",
  "mt.group.preferred": "Mile widziane",
  "mt.group.soft": "Kompetencje miękkie",
  "mt.group.count": "Spełnione: {met} z {total}, częściowo: {partial}",
  "mt.group.percent": "{n}%",
  "mt.group.none": "Oferta ich nie wymienia.",
  "mt.group.softHint": "Nie wchodzą do wyniku.",

  "mt.kpi.label": "Liczby z kontroli",
  "mt.kpi.ats": "Słowa kluczowe pod ATS",
  "mt.kpi.atsValue": "{before}% → {after}%",
  "mt.kpi.atsSub":
    "Wymagane w CV: {found} z {total}. Cel według resume-ats-optimizer: 80% i więcej.",
  "mt.kpi.numbers": "Punkty z liczbą",
  "mt.kpi.change": "{before} → {after}",
  "mt.kpi.numbersSub": "Wszystkich punktów: {n}.",
  "mt.kpi.weak": "Słabe początki punktów",
  "mt.kpi.weakSub": "Na przykład „odpowiadałem za” albo „pomagałem” zamiast tego, co zrobione.",
  "mt.kpi.rewritten": "Przepisane punkty",
  "mt.kpi.count": "{n}",
  "mt.kpi.rewrittenSub": "Sprawdzonych: {checked}, do poprawy: {flagged}.",
  "mt.kpi.rewrittenNone": "Kontrola punktów się nie odbyła.",
  "mt.kpi.check": "Do sprawdzenia",
  "mt.kpi.checkSub": "Nazwy i liczby w nowym tekście, których nie ma w Twoich danych.",

  "mt.req.title": "Wymagania oferty",
  "mt.req.sub":
    "Każde wymaganie porównane z Twoim CV i profilem. Dowód to fragment, który kod znalazł w Twoich danych.",
  "mt.status.met": "Spełniasz",
  "mt.status.partial": "Częściowo",
  "mt.status.missing": "Brak",
  "mt.gap.critical": "Brak krytyczny",
  "mt.gap.major": "Istotny brak",
  "mt.gap.minor": "Drobny brak",
  "mt.req.evidence": "Z Twoich danych: „{quote}”",
  "mt.req.none": "Nie udało się porównać wymagań z Twoimi danymi.",

  "mt.strengths.title": "Twoje mocne strony dla tej oferty",
  "mt.emphasize.title": "Na czym oprzeć CV",
  "mt.talking.title": "Do listu motywacyjnego",
  "mt.side.none": "Ocena nie zostawiła tu uwag.",

  "mt.kw.title": "Słowa kluczowe z oferty",
  "mt.kw.sub":
    "Ile razy każde pada w gotowym CV. Według resume-ats-optimizer najważniejsze powinny paść 2–4 razy, pozostałe 1–2 razy.",
  "mt.kw.count": "{n}×",
  "mt.kw.required": "wymagane",
  "mt.kw.preferred": "mile widziane",
  "mt.kw.zero":
    "Słowo z zerem nie pada w tym CV. Model go nie dopisał, bo nie pokazują go Twoje dane. Dopisz je, jeśli naprawdę je masz.",
  "mt.kw.overused":
    "Padają więcej niż 4 razy: {terms}. To nic złego, gdy są w technologiach kilku ról. Sprawdź tylko, czy żadne zdanie nie powtarza ich bez nowej treści.",
  "mt.kw.none": "Oferta nie dała słów kluczowych do sprawdzenia.",

  "mt.ats.title": "Kontrola pod ATS",
  "mt.ats.sub":
    "Co w gotowym CV sprawdza kod, według list resume-ats-optimizer i resume-bullet-writer.",
  "mt.ats.ok": "W porządku",
  "mt.ats.fix": "Do poprawy",
  "mt.ats.email": "Adres e-mail w nagłówku",
  "mt.ats.phone": "Numer telefonu w nagłówku",
  "mt.ats.experience": "Sekcja doświadczenia",
  "mt.ats.education": "Sekcja wykształcenia",
  "mt.ats.skills": "Sekcja umiejętności",
  "mt.ats.titles": "Nagłówki sekcji, które ATS rozpozna",
  "mt.ats.titlesBad": "Nagłówki, których ATS może nie rozpoznać: {titles}",
  "mt.ats.dates": "Daty wszystkich ról zapisane w jednej formie",
  "mt.ats.long": "Każdy punkt na najwyżej dwie linijki",
  "mt.ats.longBad": "Punkty dłuższe niż dwie linijki: {n}",
  "mt.ats.profile": "Profil do 60 słów",
  "mt.ats.profileBad.one": "Profil ma {n} słowo",
  "mt.ats.profileBad.few": "Profil ma {n} słowa",
  "mt.ats.profileBad.many": "Profil ma {n} słów",
  "mt.ats.profileNone": "Pod nagłówkiem nie ma profilu",
  "mt.ats.file": "Nazwa pliku PDF: {file}",

  "mt.q.title": "Dopisz liczby, które znasz",
  "mt.q.sub":
    "Model nie zgaduje liczb. Te punkty byłyby mocniejsze z wynikiem albo skalą, które znasz tylko Ty. Dopisz je w edytorze.",
  "mt.q.where": "{role} · {company}",

  "mt.offer.title": "Co mówi oferta",
  "mt.offer.seniority": "Poziom: {level}",
  "mt.offer.resp": "Główne zadania",
  "mt.offer.flags": "Sygnały ostrzegawcze",
  "mt.offer.flagsNone":
    "Model nie znalazł w treści sygnałów ostrzegawczych z listy job-description-analyzer.",
  "mt.offer.signals": "Dobre sygnały",
  "mt.offer.none": "Oferta nie miała treści do analizy.",

  "mt.steps.title": "Co zostało zrobione",
  "mt.source":
    "Kroki oceny i dopasowania opierają się na skillach job-description-analyzer, resume-tailor, resume-ats-optimizer, resume-bullet-writer, resume-quantifier i cover-letter-generator z repozytorium paramchoudhary/resumeskills (MIT).",
}

export const matchEn: Record<keyof typeof matchPl, string> = {
  "mt.title": "Match score",
  "mt.sub": "{title} · {company}",
  "mt.openCv": "Open the CV",
  "mt.openLetter": "Open the letter",
  "mt.back": "Back to the offer",
  "mt.none.title": "This score is made when the CV is tailored",
  "mt.none.body":
    "This CV was tailored before newrole.it started scoring matches. Open the CV and, in the Tailoring tab, click “Generate again”. The current text stays in the version history.",

  "mt.score.title": "Match with the requirements",
  "mt.score.value": "{n}%",
  "mt.score.none":
    "No score could be counted: the offer had no text to read, or the match step failed.",
  "mt.band.top": "You meet nearly everything",
  "mt.band.top.hint":
    "The job-description-analyzer skill says that at 90–100% it's worth checking the role isn't below your level.",
  "mt.band.excellent": "Excellent fit",
  "mt.band.excellent.hint": "75–89%: job-description-analyzer says apply right away.",
  "mt.band.good": "Good fit",
  "mt.band.good.hint": "60–74%: job-description-analyzer says apply with a strong cover letter.",
  "mt.band.stretch": "A stretch role",
  "mt.band.stretch.hint":
    "50–59%: job-description-analyzer says apply if you really want this role.",
  "mt.band.under": "Too few requirements met",
  "mt.band.under.hint":
    "Under 50%: job-description-analyzer says skip it, unless it's your dream job.",
  "mt.formula":
    "Code counts the score, not the model: required items weigh 70%, nice-to-haves 30%, and a partial match counts as half. A requirement only counts as met when code found a fragment of your CV or profile that shows it.",
  "mt.critical":
    "Critical gaps: {n}. The job-description-analyzer skill treats such a gap as a reason not to apply.",
  "mt.group.required": "Required",
  "mt.group.preferred": "Nice to have",
  "mt.group.soft": "Soft skills",
  "mt.group.count": "Met: {met} of {total}, partly: {partial}",
  "mt.group.percent": "{n}%",
  "mt.group.none": "The offer lists none.",
  "mt.group.softHint": "Not part of the score.",

  "mt.kpi.label": "Numbers from the checks",
  "mt.kpi.ats": "ATS keywords",
  "mt.kpi.atsValue": "{before}% → {after}%",
  "mt.kpi.atsSub":
    "Required in the CV: {found} of {total}. Target per resume-ats-optimizer: 80% or more.",
  "mt.kpi.numbers": "Bullets with a number",
  "mt.kpi.change": "{before} → {after}",
  "mt.kpi.numbersSub": "All bullets: {n}.",
  "mt.kpi.weak": "Weak bullet openings",
  "mt.kpi.weakSub": "Such as “responsible for” or “helped” instead of what was done.",
  "mt.kpi.rewritten": "Bullets rewritten",
  "mt.kpi.count": "{n}",
  "mt.kpi.rewrittenSub": "Checked: {checked}, to improve: {flagged}.",
  "mt.kpi.rewrittenNone": "The bullet check didn't run.",
  "mt.kpi.check": "To check",
  "mt.kpi.checkSub": "Names and numbers in the new text that your data doesn't have.",

  "mt.req.title": "The offer's requirements",
  "mt.req.sub":
    "Each requirement compared with your CV and profile. The evidence is a fragment code found in your data.",
  "mt.status.met": "Met",
  "mt.status.partial": "Partly",
  "mt.status.missing": "Missing",
  "mt.gap.critical": "Critical gap",
  "mt.gap.major": "Major gap",
  "mt.gap.minor": "Minor gap",
  "mt.req.evidence": "From your data: “{quote}”",
  "mt.req.none": "The requirements couldn't be compared with your data.",

  "mt.strengths.title": "Your strengths for this offer",
  "mt.emphasize.title": "What the CV leads with",
  "mt.talking.title": "For the cover letter",
  "mt.side.none": "The match left no notes here.",

  "mt.kw.title": "The offer's keywords",
  "mt.kw.sub":
    "How many times each appears in the finished CV. Per resume-ats-optimizer, the most important ones should appear 2–4 times, the rest 1–2 times.",
  "mt.kw.count": "{n}×",
  "mt.kw.required": "required",
  "mt.kw.preferred": "nice to have",
  "mt.kw.zero":
    "A keyword at zero isn't in this CV. The model didn't add it because your data doesn't show it. Add it if you really have it.",
  "mt.kw.overused":
    "These appear more than 4 times: {terms}. That's fine when they sit in the technologies of several roles. Just check that no sentence repeats them without saying anything new.",
  "mt.kw.none": "The offer gave no keywords to check.",

  "mt.ats.title": "ATS check",
  "mt.ats.sub":
    "What code checks in the finished CV, after the resume-ats-optimizer and resume-bullet-writer lists.",
  "mt.ats.ok": "Fine",
  "mt.ats.fix": "To fix",
  "mt.ats.email": "Email address in the header",
  "mt.ats.phone": "Phone number in the header",
  "mt.ats.experience": "An experience section",
  "mt.ats.education": "An education section",
  "mt.ats.skills": "A skills section",
  "mt.ats.titles": "Section titles an ATS recognises",
  "mt.ats.titlesBad": "Titles an ATS may not recognise: {titles}",
  "mt.ats.dates": "Every role's dates written the same way",
  "mt.ats.long": "Every bullet two lines at most",
  "mt.ats.longBad": "Bullets longer than two lines: {n}",
  "mt.ats.profile": "A profile of 60 words or fewer",
  "mt.ats.profileBad.one": "The profile has {n} word",
  "mt.ats.profileBad.few": "The profile has {n} words",
  "mt.ats.profileBad.many": "The profile has {n} words",
  "mt.ats.profileNone": "There's no profile under the header",
  "mt.ats.file": "PDF file name: {file}",

  "mt.q.title": "Add numbers you know",
  "mt.q.sub":
    "The model doesn't guess numbers. These bullets would be stronger with a result or a scale only you know. Add them in the editor.",
  "mt.q.where": "{role} · {company}",

  "mt.offer.title": "What the offer says",
  "mt.offer.seniority": "Level: {level}",
  "mt.offer.resp": "Main responsibilities",
  "mt.offer.flags": "Warning signs",
  "mt.offer.flagsNone":
    "The model found none of the job-description-analyzer warning signs in the text.",
  "mt.offer.signals": "Good signs",
  "mt.offer.none": "The offer had no text to read.",

  "mt.steps.title": "What was done",
  "mt.source":
    "The steps of scoring and tailoring follow the job-description-analyzer, resume-tailor, resume-ats-optimizer, resume-bullet-writer, resume-quantifier and cover-letter-generator skills from the paramchoudhary/resumeskills repository (MIT).",
}
