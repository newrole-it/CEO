/**
 * How text the person sends to an employer (CV, cover letter, answers) should read: as written by
 * them, not by a model. The English rules follow groups A to E of the humanizer-zh skill
 * (github.com/op7418/humanizer-zh at f4518a8, MIT), with the English word lists of blader/humanizer
 * v3.0.0 (MIT), the skill it is built on; its group F covers Chinese only. The Polish rules follow
 * the miodkuj skill (github.com/bartekpucek/miodkuj at 32004e3, MIT). Copies of humanizer-zh and
 * miodkuj are in newrole.it's .claude/skills.
 */

export type StyleLanguage = "pl" | "en"

const COMMON = `Write like the candidate, not like a model:
- Keep every fact, number, name, condition and degree of certainty. Never add a detail, example, number or opinion to make a sentence sound more specific or more human. When the data has no detail, write a smaller, plain sentence.
- Keep the candidate's voice: their words, their grammatical person, how formal and how direct they are.
- The patterns below are signs to look for in clusters, not banned words: one "key" or one list of three is not a problem. A sentence that is already plain and true stays as it is.
- Vary sentence length the way a person does, and do not give every bullet or paragraph the same shape.
- No em dash (—) or spaced dash between clauses: use a comma, a colon or a full stop. A dash in a date range stays.
- Bold only what a reader scanning the page needs. No emoji or decorative arrows.`

const ENGLISH = `Natural English (after the humanizer-zh skill):
- State the point. No contrast set up only to add weight ("not just X, but Y", "it's not X, it's Y"); keep one where both halves carry information. No run-up that announces the point ("Here's the thing", "Let's dive in"), no answer to an objection nobody made ("Don't get me wrong", "To be clear").
- No sayings that sound deep ("at its core", "what really matters", "X is the language of Y"), no dramatic fragments, no one-line closer that repeats the point.
- No inflated significance ("a pivotal moment", "plays a key role", "a testament to", "setting the stage for", "a step in the right direction") and no -ing rider bolted on to sound deeper ("…, showcasing my commitment to quality", "…, ensuring excellence"). Keep the fact and drop the dressing.
- Words models overuse, mostly in groups: additionally, align with, bolstered, crucial, delve, enhance, fostering, garner, highlight, intricate, key (adjective), landscape, meticulous, pivotal, robust (figurative), showcase, testament, underscore, valuable, vibrant. Use a plain word, or the fact itself. In a bullet prefer a plain verb (built, cut, led, wrote) to "enhanced", "fostered" or "showcased".
- No sales language ("renowned", "groundbreaking", "commitment to", "diverse array") and no unnamed authority ("experts argue").
- Use "is" and "has" rather than "serves as", "stands as", "boasts" or "features".
- List as many items as the facts give: do not stretch or cut them to three.
- One qualifier at most, the one the facts support: "may", not "could potentially".
- Active voice when the candidate is the actor: "I built", not "was built". Do not start sentence after sentence the same way.
- No chat residue: no "Great question", "Certainly", "I hope this helps", no notes about the draft, no disclaimers about what you know, no first sentence that restates the question.`

const POLISH = `Natural Polish (after the miodkuj skill):
- Start with the fact or the action. No openers such as "warto zauważyć", "należy podkreślić", "co istotne", "w dzisiejszych czasach", "w dynamicznie zmieniającym się świecie".
- "kluczowy", "kompleksowy", "innowacyjny", "strategiczny", "przełomowy", "holistyczny", "skuteczny" need a fact behind them: give the fact or make the claim smaller.
- No officialese: "aby" or "żeby", not "w celu" or "celem"; "zmieniłem", not "dokonałem zmiany"; "mogę", not "posiadam możliwość"; "ten", not "niniejszy"; avoid "w ramach", "w zakresie", "realizować działania", "podejmować działania".
- Verbs, not verbal nouns: "wdrożyłam system", not "odpowiadałam za wdrożenie systemu"; "przeanalizowałem dane", not "przeprowadzenie analizy danych". Turn a chain of nouns in the genitive into a clause, and "mając na uwadze", "biorąc pod uwagę", "dotyczący" into a short clause.
- Name the actor when it is the candidate: "zbudowałem", not "zostało zbudowane". Use the candidate's grammatical gender when their data shows it; when it does not, write sentences that avoid it.
- Keep a contrast only when it says something: no "nie tylko X, ale także Y", "zarówno X, jak i Y", "od X po Y", "X stanowi Y" as filler. No reveal after a colon ("Największy sukces: …"), no strings of negations ("Nie X. Nie Y. Z."), no closing slogan, "podsumowując", "to krok w dobrym kierunku" or "ma ogromny potencjał".
- One term for one thing: do not rotate synonyms only to avoid repeating a word.
- Polish word order and idiom, not translated English: no calques and no anglicisms where a common Polish word exists. Keep names of technologies and established terms.
- If a sentence could go unchanged into another person's text or to another company, it is filler: cut it or tie it to a fact from the data.`

/** The style rules for the languages a prompt writes in, English when none is given. */
export function humanStyle(languages: Iterable<StyleLanguage>): string {
  const wanted = new Set(languages)
  const blocks = [COMMON]
  if (wanted.has("en") || !wanted.size) blocks.push(ENGLISH)
  if (wanted.has("pl")) blocks.push(POLISH)
  return blocks.join("\n\n")
}
