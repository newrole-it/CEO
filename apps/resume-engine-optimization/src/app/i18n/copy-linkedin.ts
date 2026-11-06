/**
 * Strings for "LinkedIn i CV" (/profile/linkedin, src/app/profile/linkedin): the default CV against
 * the LinkedIn profile the person keeps here, and texts for LinkedIn written from the CV. Keys
 * "li.". The limits and the sync rule are the linkedin-profile-optimizer skill's; the page names it.
 */
export const linkedinPl = {
  "li.tab": "LinkedIn i CV",
  "li.title": "LinkedIn i CV",
  "li.sub":
    "Stanowiska, daty, najważniejsze osiągnięcia i umiejętności powinny być takie same w CV i na LinkedIn. LinkedIn może mówić więcej i swobodniej. Tak radzi skill linkedin-profile-optimizer.",
  "li.noCv.title": "Najpierw dodaj CV",
  "li.noCv.body": "Teksty na LinkedIn powstają z Twojego domyślnego CV, a tu go jeszcze nie ma.",
  "li.noCv.cta": "Przejdź do Moich CV",
  "li.cv": "Porównuję z CV „{title}”.",
  "li.openCv": "Otwórz CV",
  "li.read.extension": "Profil LinkedIn odczytany przez rozszerzenie {when}.",
  "li.read.import":
    "Profil z importu {when}. Jeśli wtedy importowano CV, a nie LinkedIn, porównanie pokazuje tamto CV. Najpewniejsze jest otwarcie swojego profilu na LinkedIn w Chrome z rozszerzeniem newrole.it: odczyta go samo.",
  "li.none.title": "Nie mamy jeszcze Twojego profilu z LinkedIn",
  "li.none.body":
    "Otwórz swój profil na LinkedIn w Chrome z rozszerzeniem newrole.it: odczyta go samo i zapisze tutaj. Możesz też go zaimportować. Teksty niżej przygotujesz już teraz, z samego CV.",
  "li.none.cta": "Zaimportuj z LinkedIn",

  "li.cmp.title": "Porównanie",
  "li.cmp.roles": "Stanowiska z CV",
  "li.cmp.same": "Tak samo na LinkedIn",
  "li.cmp.titleDiff": "Na LinkedIn inna nazwa stanowiska: {title}",
  "li.cmp.yearsDiff": "Na LinkedIn inne lata: {subtitle}",
  "li.cmp.missing": "Nie ma tej roli na LinkedIn",
  "li.cmp.role": "{role} · {company}",
  "li.cmp.onlyLinkedIn": "Na LinkedIn, ale nie w CV",
  "li.cmp.onlyLinkedInHint": "Jeśli to aktualne, dodaj tę rolę do CV albo usuń ją z LinkedIn.",
  "li.cmp.skills": "Umiejętności z CV, których nie ma w sekcji Umiejętności na LinkedIn",
  "li.cmp.skillsNone": "Wszystkie umiejętności z CV są na LinkedIn.",
  "li.cmp.skillsCount":
    "Na LinkedIn masz umiejętności: {n}. Skill radzi co najmniej 5, a najlepiej wykorzystać limit 50.",
  "li.cmp.headline": "Nagłówek",
  "li.cmp.headlineCv": "W CV: {text}",
  "li.cmp.headlineLinkedIn": "Na LinkedIn: {text}",
  "li.cmp.headlineNone": "Na LinkedIn nie ma nagłówka.",
  "li.cmp.about": "Sekcja O mnie",
  "li.cmp.aboutNone": "Na LinkedIn nie ma sekcji O mnie.",
  "li.cmp.aboutChars":
    "Ma {n} znaków. Limit to 2600, a skill radzi 1500–2000, jeśli masz o czym napisać.",

  "li.gen.title": "Teksty na LinkedIn",
  "li.gen.sub":
    "Model pisze je z Twojego CV i profilu: nagłówek do 220 znaków, sekcję O mnie do 2600 znaków, opisy ról i listę umiejętności. Wklejasz je na LinkedIn sam. newrole.it niczego tam nie wysyła.",
  "li.gen.language": "Język tekstów",
  "li.gen.go": "Przygotuj teksty",
  "li.gen.again": "Napisz od nowa",
  "li.gen.busy": "Piszę teksty…",
  "li.gen.headline": "Nagłówek",
  "li.gen.about": "O mnie",
  "li.gen.aboutPreview":
    "Około 300 pierwszych znaków widać, zanim ktoś rozwinie tę sekcję, więc tam jest najważniejsze.",
  "li.gen.roles": "Doświadczenie",
  "li.gen.skills": "Umiejętności",
  "li.gen.chars": "Znaków: {n} z {max}",
  "li.gen.copy": "Kopiuj",
  "li.gen.check": "Sprawdź przed wklejeniem. Tego nie ma w Twoim CV ani profilu:",
  "li.gen.dropped": "Pominięte fragmenty, bo dodawały liczbę, której nie ma w Twoich danych: {n}.",
  "li.err.llm-unavailable":
    "Nie ma skonfigurowanego modelu, więc nie da się napisać tekstów. Zobacz Ustawienia.",
  "li.err.no-content": "Domyślne CV nie ma treści, z której da się pisać.",
  "li.err.failed": "Model nie zwrócił poprawnego wyniku. Spróbuj ponownie.",
}

export const linkedinEn: Record<keyof typeof linkedinPl, string> = {
  "li.tab": "LinkedIn and CV",
  "li.title": "LinkedIn and CV",
  "li.sub":
    "Job titles, dates, core achievements and skills should be the same in your CV and on LinkedIn. LinkedIn can say more, and more conversationally. That is the linkedin-profile-optimizer skill's advice.",
  "li.noCv.title": "Add a CV first",
  "li.noCv.body":
    "The LinkedIn texts are written from your default CV, and there isn't one here yet.",
  "li.noCv.cta": "Go to My CVs",
  "li.cv": "Comparing with the CV “{title}”.",
  "li.openCv": "Open the CV",
  "li.read.extension": "LinkedIn profile read by the extension {when}.",
  "li.read.import":
    "Profile from an import {when}. If that import was a CV rather than LinkedIn, the comparison shows that CV. The surest way is to open your own LinkedIn profile in Chrome with the newrole.it extension: it reads it on its own.",
  "li.none.title": "We don't have your LinkedIn profile yet",
  "li.none.body":
    "Open your own LinkedIn profile in Chrome with the newrole.it extension: it reads it on its own and saves it here. You can also import it. You can prepare the texts below now, from the CV alone.",
  "li.none.cta": "Import from LinkedIn",

  "li.cmp.title": "Comparison",
  "li.cmp.roles": "Roles in the CV",
  "li.cmp.same": "The same on LinkedIn",
  "li.cmp.titleDiff": "LinkedIn has a different title: {title}",
  "li.cmp.yearsDiff": "LinkedIn has different years: {subtitle}",
  "li.cmp.missing": "This role isn't on LinkedIn",
  "li.cmp.role": "{role} · {company}",
  "li.cmp.onlyLinkedIn": "On LinkedIn, not in the CV",
  "li.cmp.onlyLinkedInHint": "If it's current, add the role to the CV, or remove it from LinkedIn.",
  "li.cmp.skills": "Skills in the CV that LinkedIn's Skills section doesn't list",
  "li.cmp.skillsNone": "Every skill in the CV is on LinkedIn.",
  "li.cmp.skillsCount":
    "LinkedIn lists {n} skills for you. The skill advises at least 5, and using the limit of 50.",
  "li.cmp.headline": "Headline",
  "li.cmp.headlineCv": "In the CV: {text}",
  "li.cmp.headlineLinkedIn": "On LinkedIn: {text}",
  "li.cmp.headlineNone": "There's no headline on LinkedIn.",
  "li.cmp.about": "About section",
  "li.cmp.aboutNone": "There's no About section on LinkedIn.",
  "li.cmp.aboutChars":
    "It has {n} characters. The limit is 2,600; the skill advises 1,500–2,000 if you have that much to say.",

  "li.gen.title": "Texts for LinkedIn",
  "li.gen.sub":
    "The model writes them from your CV and profile: a headline of up to 220 characters, an About of up to 2,600, role descriptions and a list of skills. You paste them into LinkedIn yourself; newrole.it sends nothing there.",
  "li.gen.language": "Language of the texts",
  "li.gen.go": "Prepare the texts",
  "li.gen.again": "Write again",
  "li.gen.busy": "Writing the texts…",
  "li.gen.headline": "Headline",
  "li.gen.about": "About",
  "li.gen.aboutPreview":
    "About the first 300 characters show before a reader expands the section, so the key point is there.",
  "li.gen.roles": "Experience",
  "li.gen.skills": "Skills",
  "li.gen.chars": "Characters: {n} of {max}",
  "li.gen.copy": "Copy",
  "li.gen.check": "Check before you paste. Your CV and profile don't have these:",
  "li.gen.dropped": "Pieces left out because they added a number your data doesn't have: {n}.",
  "li.err.llm-unavailable": "No model is configured, so the texts can't be written. See Settings.",
  "li.err.no-content": "The default CV has no content to write from.",
  "li.err.failed": "The model didn't return a usable result. Try again.",
}
