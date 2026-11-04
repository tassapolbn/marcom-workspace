/**
 * MARCOM Workspace - Google Sheet link
 * ===================================
 * Deploy this as a Web App from a Google account that can edit the four team
 * tabs. It writes each card as one row in its owner's tab, as that account.
 *
 * WHY THIS APPROACH
 * An Apps Script Web App runs as the account that deploys it. The workspace
 * needs no Google API key or separate Google sign-in for each team member.
 *
 * SETUP (see SHEET-SETUP.md for the click-by-click version)
 *  1. Go to script.google.com and create a new project.
 *  2. Delete the sample code and paste this whole file in.
 *  3. Paste your secret into SECRET and the team sheet ID into SPREADSHEET_ID.
 *  4. Deploy > New deployment > type "Web app".
 *       Execute as:      Me
 *       Who has access:  Anyone
 *  5. Authorise when asked, then copy the Web app URL.
 *  6. Once the workspace connection is available: Settings > Google Sheet
 *     link, paste the URL and the same secret phrase, test, then save.
 *
 * KEEP THE URL PRIVATE. Anyone holding both the URL and the secret can add
 * or update rows in the four allowed tabs.
 */

/* Any private phrase. It must match the one entered in the workspace Settings. */
var SECRET = 'change-me-please';
/* Paste the team sheet's ID here: the part of its link between /d/ and /edit.
   Never commit a real ID: this repository is public. */
var SPREADSHEET_ID = '';
/* The ONLY tabs this script may write to, by member. Every other tab is left alone. */
var TABS = { boss: 'Boss', dew: 'Dew', o: 'O', junior: 'Eye' };
/* Tabs that keep the newest task at the top. A new row goes right under the
   block of tasks that starts under the headings. Other tabs: under the last task. */
var NEWEST_FIRST = { Dew: true };
/* Hidden row tag that links a row to its card in the app. */
var TAG_KEY = 'marcomCard';

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Lower case; every run of characters other than a-z, 0-9 and Thai letters
   becomes one space. "Due date 📆" -> "due date". */
function cleanHeading_(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]+/g, ' ').trim();
}

/* The heading scan reads only as far as the tab's last used column: a range
   wider than the tab is an error (Boss and Eye have 6 columns). All task reads
   and writes then stop at the last heading. */
function findHeading_(sheet) {
  var count = Math.min(10, sheet.getLastRow());
  var columns = sheet.getLastColumn();
  if (!count || !columns) return { row: 0, width: 0, headings: [] };
  for (var r = 1; r <= count; r++) {
    var cells = sheet.getRange(r, 1, 1, columns).getDisplayValues()[0];
    var task = false, width = 0;
    for (var c = 0; c < cells.length; c++) {
      if (String(cells[c]).trim()) width = c + 1;
      if (cleanHeading_(cells[c]) === 'task') task = true;
    }
    if (task) return { row: r, width: width, headings: cells.slice(0, width) };
  }
  return { row: 0, width: 0, headings: [] };
}

function anchorRow_(sheet, heading) {
  var anchor = heading.row, count = sheet.getLastRow() - heading.row;
  if (!heading.row || count <= 0) return anchor;
  var range = sheet.getRange(heading.row + 1, 1, count, heading.width);
  var values = range.getValues(), formulas = range.getFormulas();
  for (var r = 0; r < values.length; r++) {
    var filled = false;
    for (var c = 0; c < heading.width; c++) {
      if (!formulas[r][c] && String(values[r][c]).trim() !== '') filled = true;
    }
    if (filled) anchor = heading.row + r + 1;
    else if (NEWEST_FIRST[sheet.getName()]) break;
  }
  return anchor;
}

function rowBlocked_(sheet, row) {
  var ranges = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  var sheets = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  var i, j, range;
  for (i = 0; i < ranges.length; i++) {
    if (ranges[i].canEdit()) continue;
    range = ranges[i].getRange();
    if (range.getRow() <= row && row <= range.getLastRow()) return true;
  }
  for (i = 0; i < sheets.length; i++) {
    if (sheets[i].canEdit()) continue;
    var allowed = false, exceptions = sheets[i].getUnprotectedRanges();
    for (j = 0; j < exceptions.length; j++) {
      range = exceptions[j];
      if (range.getRow() <= row && row <= range.getLastRow()) allowed = true;
    }
    if (!allowed) return true;
  }
  return false;
}

/* setValue treats text like typed input, so "=..." would become a formula.
   A leading apostrophe keeps it as plain text (it is not shown in the cell).
   Security rule: text from the app or the public Request Centre must never
   become a formula in the sheet. */
function guardText_(s) {
  return /^\s*[=+\-@]/.test(s) || /^[0-9 .,:/()+-]+$/.test(s) ? "'" + s : s;
}

function toCellValue_(value, timeZone) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return guardText_(value.slice(0, 20000)).slice(0, 20000);
  if (typeof value === 'object' && typeof value.date === 'string') {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.date);
    if (!parts) return '';
    var year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
    var leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return '';
    try { return Utilities.parseDate(value.date, timeZone, 'yyyy-MM-dd'); }
    catch (err) { return ''; }
  }
  return '';
}

function values_(value) {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') return {};
  var proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return {};
  var keys = Object.keys(value).slice(0, 40), out = Object.create(null);
  for (var i = 0; i < keys.length; i++) out[keys[i]] = value[keys[i]];
  return out;
}

function writeValues_(ss, sheet, row, heading, values) {
  if (!heading.row || row <= heading.row) throw new Error('no heading row');
  var columns = Object.create(null), skipped = [], kept = [];
  for (var c = 0; c < heading.width; c++) {
    var name = cleanHeading_(heading.headings[c]);
    if (name && !Object.prototype.hasOwnProperty.call(columns, name)) columns[name] = c + 1;
  }
  var keys = Object.keys(values);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i], col = columns[cleanHeading_(key)];
    if (!col) { skipped.push(key); continue; }
    var cell = sheet.getRange(row, col);
    if (cell.getFormula()) { kept.push(key); continue; }
    cell.setValue(toCellValue_(values[key], ss.getSpreadsheetTimeZone()));
  }
  return { skipped: skipped, kept: kept };
}

function taggedRow_(sheet, cardId) {
  var matches = sheet.createDeveloperMetadataFinder().withKey(TAG_KEY).withValue(cardId).find();
  return matches.length ? matches[0].getLocation().getRow().getRow() : 0;
}

function tagRow_(sheet, row, cardId) {
  try {
    sheet.getRange(row + ':' + row).addDeveloperMetadata(TAG_KEY, cardId);
    return true;
  } catch (err) { return false; }
}

/* Copy only a formula shared by two neighbouring task rows. R1C1 keeps its
   relative references correct at the new position. */
function copyRowFormulas_(sheet, row, heading) {
  var a = row - 1 > heading.row ? row - 1 : 0;
  var b = row + 1 <= sheet.getLastRow() ? row + 1 : 0;
  if (a && !b) b = a - 1 > heading.row ? a - 1 : 0;
  else if (b && !a) a = b + 1 <= sheet.getLastRow() ? b + 1 : 0;
  if (!a || !b) return;
  var first = sheet.getRange(a, 1, 1, heading.width).getFormulasR1C1()[0];
  var second = sheet.getRange(b, 1, 1, heading.width).getFormulasR1C1()[0];
  for (var c = 0; c < heading.width; c++) {
    if (first[c] && first[c] === second[c]) sheet.getRange(row, c + 1).setFormulaR1C1(first[c]);
  }
}

function updateRow_(ss, sheet, row, values, cardId, needsTag) {
  var tab = sheet.getName(), heading = findHeading_(sheet);
  if (!heading.row) return { ok: false, error: 'no heading row', tab: tab };
  /* A tagged empty row can sit beyond getLastRow(), which counts only data. */
  if (row <= heading.row) return { ok: false, error: 'not found', tab: tab };
  if (rowBlocked_(sheet, row)) return { ok: false, error: 'protected', tab: tab };
  if (needsTag) tagRow_(sheet, row, cardId);
  var result = writeValues_(ss, sheet, row, heading, values);
  return { ok: true, tab: tab, row: row, updated: true, skipped: result.skipped, kept: result.kept };
}

function append_(ss, body, values) {
  var tab = TABS[body.who], sheet = ss.getSheetByName(tab);
  if (!sheet) return { ok: false, error: 'tab not found', tab: tab };
  var existing = taggedRow_(sheet, body.cardId);
  if (existing) return updateRow_(ss, sheet, existing, values, body.cardId, false);
  var heading = findHeading_(sheet);
  if (!heading.row) return { ok: false, error: 'no heading row', tab: tab };
  var anchor = anchorRow_(sheet, heading), row = anchor + 1;
  if (rowBlocked_(sheet, row)) return { ok: false, error: 'protected', tab: tab };
  sheet.insertRowAfter(anchor);
  try {
    copyRowFormulas_(sheet, row, heading);
    var result = writeValues_(ss, sheet, row, heading, values);
    var tagged = tagRow_(sheet, row, body.cardId);
    return { ok: true, tab: tab, row: row, tagged: tagged, updated: false,
      skipped: result.skipped, kept: result.kept };
  } catch (err) {
    sheet.deleteRow(row);
    throw err;
  }
}

function update_(ss, body, values) {
  var tab = TABS[body.who], keys = Object.keys(TABS);
  var order = [body.who];
  for (var i = 0; i < keys.length; i++) if (keys[i] !== body.who) order.push(keys[i]);
  for (i = 0; i < order.length; i++) {
    var sheet = ss.getSheetByName(TABS[order[i]]);
    if (!sheet) continue;
    var row = taggedRow_(sheet, body.cardId);
    if (row) return updateRow_(ss, sheet, row, values, body.cardId, false);
  }
  var target = ss.getSheetByName(tab);
  if (target && typeof body.row === 'number' && isFinite(body.row) && Math.floor(body.row) === body.row &&
      typeof body.title === 'string' && body.title.trim()) {
    var heading = findHeading_(target);
    if (heading.row && body.row > heading.row && body.row <= target.getLastRow()) {
      for (var c = 0; c < heading.width; c++) {
        if (cleanHeading_(heading.headings[c]) !== 'task') continue;
        var title = target.getRange(body.row, c + 1).getValues()[0][0];
        if (String(title).trim() === body.title.trim()) {
          return updateRow_(ss, target, body.row, values, body.cardId, true);
        }
        break;
      }
    }
  }
  return { ok: false, error: 'not found', tab: tab };
}

function ping_(ss) {
  var keys = Object.keys(TABS), tabs = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i], sheet = ss.getSheetByName(TABS[key]);
    var entry = { key: key, name: TABS[key], found: !!sheet };
    if (sheet) {
      var heading = findHeading_(sheet);
      entry.headingRow = heading.row;
      entry.headings = heading.headings.map(function (s) { return String(s).trim(); }).filter(Boolean);
      entry.canEdit = !rowBlocked_(sheet, anchorRow_(sheet, heading) + 1);
    }
    tabs.push(entry);
  }
  return { ok: true, spreadsheet: ss.getName(), tabs: tabs };
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {};
    /* Refuse to work until the sample phrase has been replaced. */
    if (!SECRET || SECRET === 'change-me-please') return json_({ ok: false, error: 'secret not set' });
    if (body.secret !== SECRET) return json_({ ok: false, error: 'unauthorised' });
    if (!SPREADSHEET_ID.trim()) return json_({ ok: false, error: 'spreadsheet not set' });
    if (body.action === 'ping') return json_(ping_(SpreadsheetApp.openById(SPREADSHEET_ID)));
    if (body.action !== 'append' && body.action !== 'update') return json_({ ok: false, error: 'unknown action' });
    if (typeof body.who !== 'string' || !Object.prototype.hasOwnProperty.call(TABS, body.who)) {
      return json_({ ok: false, error: 'unknown member' });
    }
    if (typeof body.cardId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.cardId)) {
      return json_({ ok: false, error: 'no card id' });
    }
    var values = values_(body.values), lock;
    try {
      lock = LockService.getScriptLock();
      lock.waitLock(20000);
    } catch (err) { return json_({ ok: false, error: 'busy, please try again' }); }
    try {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      return json_(body.action === 'append' ? append_(ss, body, values) : update_(ss, body, values));
    } finally { lock.releaseLock(); }
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

/* Opening the URL shows that the deployment is live, without any sheet data. */
function doGet() {
  return json_({ ok: true, service: 'MARCOM sheet link', ready: true });
}
