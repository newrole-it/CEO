import { APPLICATION_STATUSES, statusLabel, statusTone } from "src/shared/applications"
import { EDITED_HEADER, ID_HEADER, SHEET_NAME } from "./sheet-table"

/** The table's name in the spreadsheet; Google keeps table names unique across all its tabs. */
const TABLE_NAME = "Aplikacje"

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
 * deploys as a web app. newrole.it calls it twice per sync: "read" returns the tab with the links
 * in it, "write" puts the merged table back. A tab holding someone else's data is written over only
 * with `adopt`, and then a copy of it is kept first. onEdit stamps rows edited by hand, so the
 * newer change wins when the same row changed in both places.
 *
 * The tab becomes a Sheets table with Status as a dropdown column, through the Sheets API
 * (addTable / updateTable, developers.google.com/workspace/sheets/api/guides/tables). Apps Script
 * reaches it only through the advanced Sheets service, which the person adds in the editor
 * (Usługi → Google Sheets API). Without it the tab stays a plain range and Status gets a data
 * validation dropdown instead.
 */
export function appsScriptSource(secret = "WKLEJ_TU_SEKRET"): string {
  return `/**
 * newrole.it ⇄ Arkusz Google (synchronizacja w obie strony).
 * 1. Wklej ten skrypt w Rozszerzenia → Apps Script i zapisz.
 * 2. Po lewej, obok „Usługi”, kliknij +, wybierz Google Sheets API i Dodaj (zakładka będzie tabelą).
 * 3. Wdróż → Nowe wdrożenie → Aplikacja internetowa. Wykonaj jako: Ja. Kto ma dostęp: Każdy.
 * 4. Skopiuj adres URL kończący się na /exec i wklej go w newrole.it → Ustawienia → Arkusz Google.
 * Sekret poniżej chroni arkusz przed obcymi zapisami. Nie udostępniaj go.
 */
var SECRET = ${JSON.stringify(secret)};
var DEFAULT_SHEET = ${JSON.stringify(SHEET_NAME)};
var ID_HEADER = ${JSON.stringify(ID_HEADER)};
var EDITED_HEADER = ${JSON.stringify(EDITED_HEADER)};
var TABLE_NAME = ${JSON.stringify(TABLE_NAME)};
var STATUS_COLORS = ${JSON.stringify(statusColors(), null, 2)};

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e && e.postData ? e.postData.contents : "{}");
  } catch (err) {
    return json_({ ok: false, error: "bad-json" });
  }
  if (!body || body.secret !== SECRET) return json_({ ok: false, error: "bad-secret" });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (body.action === "read") return json_(read_(body.sheet || DEFAULT_SHEET));
    if (body.action === "write") return json_(write_(body));
    return json_({ ok: false, error: "unknown-action" });
  } catch (err) {
    // Google answers an uncaught error with an HTML page; newrole.it shows this text instead.
    return json_({ ok: false, error: "exception: " + errorText_(err) });
  } finally {
    lock.releaseLock();
  }
}

function read_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) return { ok: true, exists: false, header: [], rows: [], links: [] };
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) return { ok: true, exists: true, header: [], rows: [], links: [] };
  var range = sheet.getRange(1, 1, lastRow, lastColumn);
  var values = range.getDisplayValues();
  var rich = range.getRichTextValues();
  var links = [];
  for (var r = 1; r < values.length; r++) {
    var link = null;
    for (var c = 0; c < lastColumn && !link; c++) {
      var cell = rich[r][c];
      if (cell && cell.getLinkUrl()) link = cell.getLinkUrl();
    }
    links.push(link);
  }
  return { ok: true, exists: true, header: values[0], rows: values.slice(1), links: links };
}

function write_(body) {
  var header = body.header || [];
  var rows = body.rows || [];
  var links = body.links || [];
  if (!header.length) return { ok: false, error: "no-header" };
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var name = body.sheet || DEFAULT_SHEET;
  var sheet = book.getSheetByName(name);
  if (sheet && sheet.getLastRow() > 1) {
    var first = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getDisplayValues()[0];
    if (first.indexOf(ID_HEADER) < 0) {
      // Rows newrole.it did not write: only after it read them, and never without a copy.
      if (!body.adopt) return { ok: false, error: "foreign-tab" };
      sheet.copyTo(book).setName(body.backupName || name + " (kopia)");
    }
  }
  if (!sheet) sheet = book.insertSheet(name);
  var width = header.length;
  var values = [header].concat(rows.map(function (row) {
    var out = [];
    for (var i = 0; i < width; i++) out.push(row[i] == null ? "" : String(row[i]));
    return out;
  }));

  // The table first: its range and column types (plain text, Status a dropdown of every status)
  // must fit the rows before they are written, or Sheets rejects them.
  var statusColumn = typeof body.statusColumn === "number" ? body.statusColumn : header.indexOf("Status");
  var table = table_(book, sheet, header, rows.length, statusColumn, body.statusOptions || []);

  // Overwrite in place and clear only what is left over, so a failed write never empties the tab.
  var range = sheet.getRange(1, 1, values.length, width);
  asText_(range);
  range.setValues(values);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow > values.length)
    sheet.getRange(values.length + 1, 1, lastRow - values.length, Math.max(lastColumn, width)).clearContent();
  if (lastColumn > width)
    sheet.getRange(1, width + 1, Math.max(lastRow, values.length), lastColumn - width).clearContent();

  var linkColumn = typeof body.linkColumn === "number" ? body.linkColumn : -1;
  if (linkColumn >= 0 && rows.length) {
    var cells = values.slice(1).map(function (row, i) {
      var text = row[linkColumn];
      var builder = SpreadsheetApp.newRichTextValue().setText(text);
      if (links[i] && text) builder.setLinkUrl(links[i]);
      return [builder.build()];
    });
    sheet.getRange(2, linkColumn + 1, rows.length, 1).setRichTextValues(cells);
  }

  try {
    format_(sheet, header, rows.length, statusColumn);
  } catch (err) {
    console.warn("newrole.it: formatting skipped: " + err);
  }
  return { ok: true, rows: rows.length, table: table, syncedAt: body.syncedAt || null };
}

/** Looks only: bold header, frozen row, widths, hidden technical columns, status colours. */
function format_(sheet, header, count, statusColumn) {
  var width = header.length;
  sheet.getRange(1, 1, 1, width).setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, width);
  [ID_HEADER, EDITED_HEADER].forEach(function (hidden) {
    var index = header.indexOf(hidden);
    if (index >= 0) sheet.hideColumns(index + 1, 1);
  });

  var rules = [];
  if (statusColumn >= 0 && count) {
    var statusRange = sheet.getRange(2, statusColumn + 1, count, 1);
    // Longest label first, so a label that starts another one cannot take its colour.
    Object.keys(STATUS_COLORS).sort(function (a, b) { return b.length - a.length; }).forEach(function (label) {
      rules.push(
        SpreadsheetApp.newConditionalFormatRule()
          .whenTextStartsWith(label)
          .setBackground(STATUS_COLORS[label][0])
          .setFontColor(STATUS_COLORS[label][1])
          .setRanges([statusRange])
          .build()
      );
    });
  }
  sheet.setConditionalFormatRules(rules);
}

/**
 * Makes the tab a table (as Format → Konwertuj na tabelę does) with Status as a dropdown, or
 * reshapes the table already there (one made by hand may have typed columns that reject text) to
 * the rows about to be written. Needs the Google Sheets API service; without it Status still gets a
 * dropdown. Returns "ok", "no-service" or "error: …", and never stops a sync.
 */
function table_(book, sheet, header, count, statusColumn, options) {
  var dataRows = Math.max(1, count);
  if (typeof Sheets === "undefined") {
    try {
      // Old rules (a strict list typed by hand) would reject the rows; the Status list only warns.
      sheet.getRange(2, 1, dataRows, header.length).clearDataValidations();
      if (statusColumn >= 0 && options.length) {
        sheet.getRange(2, statusColumn + 1, dataRows, 1).setDataValidation(
          SpreadsheetApp.newDataValidation().requireValueInList(options, true).setAllowInvalid(true).build()
        );
      }
    } catch (err) {
      // A table made by hand: its typed columns take no rules, and only the Sheets service changes them.
    }
    return "no-service";
  }
  try {
    var id = book.getId();
    var sheetId = sheet.getSheetId();
    var info = Sheets.Spreadsheets.get(id, { fields: "sheets(properties(sheetId),tables(tableId,name))" });
    var names = {};
    var existing = null;
    (info.sheets || []).forEach(function (tab) {
      (tab.tables || []).forEach(function (t) {
        names[t.name] = true;
        if (tab.properties && tab.properties.sheetId === sheetId && !existing) existing = t;
      });
    });
    var columns = header.map(function (name, i) {
      var column = { columnIndex: i, columnName: name, columnType: "TEXT" };
      if (i === statusColumn && options.length) {
        column.columnType = "DROPDOWN";
        column.dataValidationRule = {
          condition: {
            type: "ONE_OF_LIST",
            values: options.map(function (value) { return { userEnteredValue: value }; })
          }
        };
      }
      return column;
    });
    var range = {
      sheetId: sheetId,
      startRowIndex: 0,
      endRowIndex: dataRows + 1,
      startColumnIndex: 0,
      endColumnIndex: header.length
    };
    var request;
    if (existing) {
      request = {
        updateTable: {
          table: { tableId: existing.tableId, range: range, columnProperties: columns },
          fields: "range,columnProperties"
        }
      };
    } else {
      // A table name is unique in the whole spreadsheet; a copy of the tab may hold the first one.
      var name = TABLE_NAME;
      for (var n = 2; names[name]; n++) name = TABLE_NAME + n;
      try {
        sheet.getRange(2, 1, dataRows, header.length).clearDataValidations();
      } catch (err) {}
      request = { addTable: { table: { name: name, range: range, columnProperties: columns } } };
    }
    Sheets.Spreadsheets.batchUpdate({ requests: [request] }, id);
    return "ok";
  } catch (err) {
    return "error: " + errorText_(err);
  }
}

/** A row edited by hand gets the time in the hidden column, so newrole.it knows which change is newer. */
function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return;
  var header = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var column = header.indexOf(EDITED_HEADER);
  if (column < 0) return;
  var first = Math.max(2, e.range.getRow());
  var last = e.range.getLastRow();
  if (last < first) return;
  var stamp = new Date().toISOString();
  var stamps = [];
  for (var r = first; r <= last; r++) stamps.push([stamp]);
  var target = sheet.getRange(first, column + 1, stamps.length, 1);
  asText_(target);
  target.setValues(stamps);
}

/**
 * Plain-text format, so "02.10.2026" stays as typed. A table column has its own type and refuses a
 * format ("Tej czynności nie można wykonać na kolumnie, która ma określony typ"); it is left as is.
 */
function asText_(range) {
  try {
    range.setNumberFormat("@");
  } catch (err) {}
}

/** The message with the line it came from, so a failure can be traced to one call. */
function errorText_(err) {
  var text = String(err && err.message ? err.message : err);
  var at = err && err.stack ? String(err.stack).split("\\n")[1] : "";
  return (text + (at ? " [" + at.trim() + "]" : "")).slice(0, 300);
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
