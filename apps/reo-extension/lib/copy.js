/**
 * Interface text of the extension, by language. Polish is the source; every other dictionary has
 * the same keys (test/copy.test.ts checks it). Text written before this file still sits next to
 * the code, in Polish only: move it here when you touch it (AGENTS.md, "Not there yet").
 */

const pl = {
  "fit.offer": "{company} · {title}",
  "fit.stage.saved": "Zapisana w ofertach",
  "fit.stage.cv": "CV gotowe",
  "fit.tailor": "Dopasuj CV",
  "fit.retry": "Spróbuj ponownie",
  "fit.starting": "Dodaję ofertę do newrole.it…",
  "fit.running": "Dopasowuję CV. Możesz zamknąć ten panel: praca trwa w aplikacji.",
  "fit.step.offer": "Analiza oferty",
  "fit.step.cv": "Analiza Twojego CV",
  "fit.step.match": "Ocena dopasowania",
  "fit.step.tailor": "Dopasowanie CV do oferty",
  "fit.step.bullets": "Kontrola i poprawa punktów",
  "fit.step.ats": "Kontrola pod ATS",
  "fit.step.facts": "Sprawdzenie liczb i nazw",
  "fit.state.waiting": "Czeka",
  "fit.state.running": "W toku",
  "fit.state.done": "Gotowe",
  "fit.state.skipped": "Pominięte",
  "fit.state.failed": "Nie udało się",
  "fit.score": "Dopasowanie: {n}%",
  "fit.noScore": "Oferta nie wymienia wymagań, z których da się policzyć wynik.",
  "fit.noMatch": "To CV nie ma jeszcze oceny dopasowania.",
  "fit.band.top": "Spełniasz prawie wszystko",
  "fit.band.excellent": "Bardzo dobre dopasowanie",
  "fit.band.good": "Dobre dopasowanie",
  "fit.band.stretch": "Rola na wyrost",
  "fit.band.under": "Za mało spełnionych wymagań",
  "fit.required": "Spełnione wymagania konieczne: {met} z {total}",
  "fit.partial": "Spełnione częściowo: {partial}",
  "fit.gaps": "Czego brakuje:",
  "fit.ats": "Słowa kluczowe (ATS): {before}% → {after}%",
  "fit.ats.after": "Słowa kluczowe (ATS): {after}%",
  "fit.openEditor": "Otwórz w edytorze",
  "fit.openMatch": "Panel dopasowania",
  "fit.openOffer": "Otwórz ofertę w newrole.it",
  "fit.draft": "Nie umiem sam odczytać tej strony.",
  "fit.draft.link": "Sprawdź ofertę w newrole.it",
  "fit.invalid": "To nie wygląda na stronę oferty.",
  "fit.limited": "Za dużo odczytanych linków. Odczekaj godzinę i spróbuj ponownie.",
  "fit.err.llm-unavailable":
    "Model AI nie jest skonfigurowany, więc nie da się dopasować CV. Ustawisz go w konfiguracji aplikacji.",
  "fit.err.no-base":
    "Nie ma CV ani profilu, od których można zacząć. Dodaj CV w newrole.it i spróbuj ponownie.",
  "fit.err.no-content":
    "Twoje CV nie ma treści do edycji. Otwórz je w newrole.it i spróbuj ponownie.",
  "fit.err.job-not-found": "Tej oferty nie ma już w indeksie.",
  "fit.err.failed": "Model nie zwrócił poprawnego wyniku. Nic nie zmieniono, spróbuj ponownie.",
  "fit.err.offline": "Nie mogę połączyć się z aplikacją. Czy newrole.it działa?",
  "fit.err.not-connected": "Rozszerzenie nie jest połączone. Połącz je ponownie.",
  "fit.err.disconnected": "Rozszerzenie zostało przeładowane. Odśwież tę stronę.",
  "popup.tailor": "Dopasuj CV do tej oferty",
}

/** @type {Record<keyof typeof pl, string>} */
const en = {
  "fit.offer": "{company} · {title}",
  "fit.stage.saved": "Saved in your offers",
  "fit.stage.cv": "CV ready",
  "fit.tailor": "Tailor CV",
  "fit.retry": "Try again",
  "fit.starting": "Adding the offer to newrole.it…",
  "fit.running": "Tailoring your CV. You can close this panel: the work goes on in the app.",
  "fit.step.offer": "Reading the offer",
  "fit.step.cv": "Checking your CV",
  "fit.step.match": "Match score",
  "fit.step.tailor": "Tailoring the CV to the offer",
  "fit.step.bullets": "Checking and rewriting bullets",
  "fit.step.ats": "ATS check",
  "fit.step.facts": "Checking numbers and names",
  "fit.state.waiting": "Waiting",
  "fit.state.running": "Running",
  "fit.state.done": "Done",
  "fit.state.skipped": "Skipped",
  "fit.state.failed": "Failed",
  "fit.score": "Match: {n}%",
  "fit.noScore": "The offer lists no requirements a score can be counted from.",
  "fit.noMatch": "This CV has no match score yet.",
  "fit.band.top": "You meet nearly everything",
  "fit.band.excellent": "Excellent fit",
  "fit.band.good": "Good fit",
  "fit.band.stretch": "A stretch role",
  "fit.band.under": "Too few requirements met",
  "fit.required": "Required requirements met: {met} of {total}",
  "fit.partial": "Partly met: {partial}",
  "fit.gaps": "What's missing:",
  "fit.ats": "Keywords (ATS): {before}% → {after}%",
  "fit.ats.after": "Keywords (ATS): {after}%",
  "fit.openEditor": "Open in the editor",
  "fit.openMatch": "Match dashboard",
  "fit.openOffer": "Open the offer in newrole.it",
  "fit.draft": "I can't read this page on my own.",
  "fit.draft.link": "Check the offer in newrole.it",
  "fit.invalid": "This doesn't look like an offer's page.",
  "fit.limited": "Too many links read. Wait an hour and try again.",
  "fit.err.llm-unavailable":
    "No AI model is configured, so the CV can't be tailored. Set one up in the app's configuration.",
  "fit.err.no-base":
    "There's no CV or profile to start from. Add a CV in newrole.it and try again.",
  "fit.err.no-content": "Your CV has no editable content. Open it in newrole.it and try again.",
  "fit.err.job-not-found": "This offer is no longer in the index.",
  "fit.err.failed": "The model didn't return a usable result. Nothing changed, so try again.",
  "fit.err.offline": "I can't reach the app. Is newrole.it running?",
  "fit.err.not-connected": "The extension isn't connected. Connect it again.",
  "fit.err.disconnected": "The extension was reloaded. Refresh this page.",
  "popup.tailor": "Tailor a CV to this offer",
}

export const COPY = { pl, en }

/** Polish when the browser's language is Polish, English for every other language, as in the app. */
export function localeOf(language) {
  return String(language || "")
    .toLowerCase()
    .startsWith("pl")
    ? "pl"
    : "en"
}

/** `t(key, vars)` for one language; `{name}` in the text is filled from `vars`. */
export function translator(locale) {
  const dictionary = COPY[locale]
  return (key, vars = {}) =>
    String(dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_match, name) => String(vars[name] ?? ""))
}

/** The key of a failed run's or call's message; an unknown code reads as a failed run. */
export function errorKey(code) {
  const key = `fit.err.${code}`
  return key in pl ? key : "fit.err.failed"
}
