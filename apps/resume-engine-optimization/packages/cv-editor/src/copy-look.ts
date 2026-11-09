/**
 * Strings for the editor's look panel: the templates (@newrole/cv-core/templates) and the accent.
 * Keys start with "look.". Each template needs "look.tpl.<id>" and "look.tpl.<id>.hint" here.
 * Polish uses the informal, capitalised "Ty". Every key in lookPl must exist in lookEn.
 */
export const lookPl = {
  "look.button": "Wygląd",
  "look.title": "Wygląd CV",
  "look.close": "Zamknij wygląd",
  "look.intro": "Wybierz szablon i kolor. Zmienisz je w każdej chwili przyciskiem „Wygląd”.",
  "look.template": "Szablon",
  "look.color": "Kolor",
  "look.color.pick": "Kolor {hex}",
  "look.color.custom": "Własny kolor",
  "look.columns.hint":
    "Umiejętności i języki stoją w pasku po lewej. Inną sekcję przeniesiesz tam ikoną kolumny w spisie sekcji.",
  "look.out.toSide": "Przenieś „{title}” do paska bocznego",
  "look.out.toMain": "Przenieś „{title}” do głównej kolumny",
  "look.out.side": "Pasek boczny",

  "look.tpl.classic": "Klasyczny",
  "look.tpl.classic.hint": "Jedna kolumna, kolor w tytułach sekcji i w linii pod nazwiskiem.",
  "look.tpl.band": "Pas w kolorze",
  "look.tpl.band.hint": "Jedna kolumna pod nagłówkiem w kolorze na całą szerokość strony.",
  "look.tpl.sidebar": "Dwie kolumny",
  "look.tpl.sidebar.hint":
    "Pasek ze zdjęciem, kontaktem, umiejętnościami i językami obok doświadczenia.",
}

export const lookEn: Record<keyof typeof lookPl, string> = {
  "look.button": "Design",
  "look.title": "CV design",
  "look.close": "Close design",
  "look.intro":
    "Pick a template and a colour. You can change them any time with the “Design” button.",
  "look.template": "Template",
  "look.color": "Colour",
  "look.color.pick": "Colour {hex}",
  "look.color.custom": "Custom colour",
  "look.columns.hint":
    "Skills and languages sit in the strip on the left. Move another section there with the column icon in the section list.",
  "look.out.toSide": "Move “{title}” to the side column",
  "look.out.toMain": "Move “{title}” to the main column",
  "look.out.side": "Side column",

  "look.tpl.classic": "Classic",
  "look.tpl.classic.hint":
    "One column, your colour in the section headings and the rule under your name.",
  "look.tpl.band": "Colour band",
  "look.tpl.band.hint": "One column under a header in your colour across the whole page.",
  "look.tpl.sidebar": "Two columns",
  "look.tpl.sidebar.hint":
    "A strip with your photo, contact details, skills and languages beside your experience.",
}
