import { APPLICATION_STATUSES, statusLabel, statusTone } from "src/shared/applications"
import { SHEET_NAME } from "./sheet-table"

/** Background and text colour per status tone, matching the light theme tokens in app.css. */
const TONE_COLORS: Record<ReturnType<typeof statusTone>, [string, string]> = {
  neutral: ["#f0f0f5", "#14141f"],
  progress: ["#eeeafe", "#4326d9"],
  late: ["#ddd5fd", "#2f1aa3"],
  success: ["#e6f6ee", "#0b7a52"],
  danger: ["#fdecea", "#c8281c"],
  muted: ["#ececf1", "#66667a"],
}

export function statusColors(): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {}
  for (const status of APPLICATION_STATUSES) {
    const colors = TONE_COLORS[statusTone(status)]
    out[statusLabel(status, "pl")] = colors
    out[statusLabel(status, "en")] = colors
  }
  return out
}

/**
 * The Google Apps Script the person pastes into their sheet (Rozszerzenia → Apps Script) and
 * deploys as a web app. It checks the secret, rewrites the "Aplikacje" tab and colours statuses.
 */
export function appsScriptSource(secret = "WKLEJ_TU_SEKRET"): string {
  return `/**
 * newrole.it → Arkusz Google (synchronizacja jednostronna: aplikacja → arkusz).
 * 1. Wklej ten skrypt w Rozszerzenia → Apps Script i zapisz.
 * 2. Wdróż → Nowe wdrożenie → Aplikacja internetowa. Wykonaj jako: Ja. Kto ma dostęp: Każdy.
 * 3. Skopiuj adres URL kończący się na /exec i wklej go w newrole.it → Ustawienia → Arkusz Google.
 * Sekret poniżej chroni arkusz przed obcymi zapisami. Nie udostępniaj go.
 */
var SECRET = ${JSON.stringify(secret)};
var SHEET_NAME = ${JSON.stringify(SHEET_NAME)};
var STATUS_COLORS = ${JSON.stringify(statusColors(), null, 2)};

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e && e.postData ? e.postData.contents : "{}");
  } catch (err) {
    return json_({ ok: false, error: "bad-json" });
  }
  if (!body || body.secret !== SECRET) return json_({ ok: false, error: "bad-secret" });
  var header = body.header || [];
  var rows = body.rows || [];
  if (!header.length) return json_({ ok: false, error: "no-header" });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var book = SpreadsheetApp.getActiveSpreadsheet();
    var name = body.sheet || SHEET_NAME;
    var sheet = book.getSheetByName(name) || book.insertSheet(name);
    sheet.clearContents();
    var width = header.length;
    var values = [header].concat(rows.map(function (row) {
      var out = [];
      for (var i = 0; i < width; i++) out.push(row[i] == null ? "" : String(row[i]));
      return out;
    }));
    sheet.getRange(1, 1, values.length, width).setValues(values);
    sheet.getRange(1, 1, 1, width).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, width);

    var rules = [];
    var statusColumn = header.indexOf("Status") + 1;
    if (statusColumn > 0 && rows.length) {
      var range = sheet.getRange(2, statusColumn, rows.length, 1);
      for (var label in STATUS_COLORS) {
        rules.push(
          SpreadsheetApp.newConditionalFormatRule()
            .whenTextEqualTo(label)
            .setBackground(STATUS_COLORS[label][0])
            .setFontColor(STATUS_COLORS[label][1])
            .setRanges([range])
            .build()
        );
      }
    }
    sheet.setConditionalFormatRules(rules);
    return json_({ ok: true, rows: rows.length, syncedAt: body.syncedAt || null });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, app: "newrole" });
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON
  );
}
`
}
