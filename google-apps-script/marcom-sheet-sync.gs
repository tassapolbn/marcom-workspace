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
    if (!valueText_(value)) return '';
    try { return Utilities.parseDate(value.date, timeZone, 'yyyy-MM-dd'); }
    catch (err) { return ''; }
  }
  return '';
}

function cellText_(value, tz) {
  if (Object.prototype.toString.call(value) === '[object Date]') return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function valueText_(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object' && typeof value.date === 'string') {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.date);
    if (!parts) return '';
    var year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
    var leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return '';
    return value.date;
  }
  return '';
}

function nameKey_(text) { return String(text).trim().toLowerCase().replace(/\s+/g, ' '); }

function decide_(currentText, newText, expectText, hasExpect, forced) {
  if (currentText === newText) return 'same';
  if (newText === '' && currentText !== '') return forced ? 'write' : 'conflict';
  if (currentText === '' || forced || (hasExpect && currentText === expectText)) return 'write';
  return 'conflict';
}

function values_(value) {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') return {};
  var proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return {};
  var keys = Object.keys(value).slice(0, 40), out = Object.create(null);
  for (var i = 0; i < keys.length; i++) out[keys[i]] = value[keys[i]];
  return out;
}

function columns_(heading) {
  var columns = Object.create(null);
  for (var c = 0; c < heading.width; c++) {
    var name = cleanHeading_(heading.headings[c]);
    if (name && !Object.prototype.hasOwnProperty.call(columns, name)) columns[name] = c + 1;
  }
  return columns;
}

function writeValues_(ss, sheet, row, heading, values, options) {
  if (!heading.row || row <= heading.row) throw new Error('no heading row');
  options = options || {};
  var columns = columns_(heading), skipped = [], kept = [], written = [], same = [], conflicts = [];
  var expect = values_(options.expect), force = Array.isArray(options.force) ? options.force : [];
  var tz = ss.getSpreadsheetTimeZone(), data = options.data;
  var keys = Object.keys(values);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i], col = columns[cleanHeading_(key)];
    var next = valueText_(values[key]);
    if (options.ignoreEmpty && next === '') continue;
    if (!col) { skipped.push(key); continue; }
    var cell = data ? null : sheet.getRange(row, col);
    if (data ? data.formulas[row - 1][col - 1] : cell.getFormula()) { kept.push(key); continue; }
    var current = data ? data.values[row - 1][col - 1] : cell.getValues()[0][0];
    var decision = options.fresh ? 'write' : decide_(cellText_(current, tz), next, valueText_(expect[key]),
      Object.prototype.hasOwnProperty.call(expect, key), force.indexOf(key) !== -1);
    if (decision === 'same') { same.push(key); continue; }
    if (decision === 'conflict') {
      conflicts.push({ key: key, sheet: data ? data.display[row - 1][col - 1] : cell.getDisplayValue(), card: next });
      continue;
    }
    var converted = toCellValue_(values[key], tz);
    if (!options.check) (cell || sheet.getRange(row, col)).setValue(converted);
    if (data) {
      // Keep later cards in this request consistent with earlier planned writes.
      var stored = typeof converted === 'string' ? converted.replace(/^'/, '') : converted;
      data.values[row - 1][col - 1] = stored;
      data.display[row - 1][col - 1] = typeof stored === 'string' ? stored : cellText_(stored, tz);
    }
    written.push(key);
  }
  return { skipped: skipped, kept: kept, written: written, same: same, conflicts: conflicts };
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

function updateRow_(ss, sheet, row, values, cardId, needsTag, body) {
  var tab = sheet.getName(), heading = findHeading_(sheet);
  if (!heading.row) return { ok: false, error: 'no heading row', tab: tab };
  /* A tagged empty row can sit beyond getLastRow(), which counts only data. */
  if (row <= heading.row) return { ok: false, error: 'not found', tab: tab };
  if (rowBlocked_(sheet, row)) return { ok: false, error: 'protected', tab: tab };
  if (needsTag) tagRow_(sheet, row, cardId);
  body = body || {};
  var result = writeValues_(ss, sheet, row, heading, values, { expect: body.expect, force: body.force });
  return { ok: true, tab: tab, row: row, updated: true, skipped: result.skipped, kept: result.kept,
    written: result.written, same: result.same, conflicts: result.conflicts };
}

function append_(ss, body, values) {
  var tab = TABS[body.who], sheet = ss.getSheetByName(tab);
  if (!sheet) return { ok: false, error: 'tab not found', tab: tab };
  var existing = taggedRow_(sheet, body.cardId);
  if (existing) return updateRow_(ss, sheet, existing, values, body.cardId, false, body);
  var heading = findHeading_(sheet);
  if (!heading.row) return { ok: false, error: 'no heading row', tab: tab };
  var anchor = anchorRow_(sheet, heading), row = anchor + 1;
  if (rowBlocked_(sheet, row)) return { ok: false, error: 'protected', tab: tab };
  sheet.insertRowAfter(anchor);
  try {
    copyRowFormulas_(sheet, row, heading);
    var result = writeValues_(ss, sheet, row, heading, values, { fresh: true });
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
  for (var i = 0; body.tabOnly !== true && i < keys.length; i++) if (keys[i] !== body.who) order.push(keys[i]);
  for (i = 0; i < order.length; i++) {
    var sheet = ss.getSheetByName(TABS[order[i]]);
    if (!sheet) continue;
    var row = taggedRow_(sheet, body.cardId);
    if (row) return updateRow_(ss, sheet, row, values, body.cardId, false, body);
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
          return updateRow_(ss, target, body.row, values, body.cardId, true, body);
        }
        break;
      }
    }
  }
  return { ok: false, error: 'not found', tab: tab };
}

/* A request-local snapshot: one bulk read of each kind and one tag scan per
   tab, refreshed after insertion. Check mode edits only these plain arrays. */
function readTab_(ss, tab) {
  var sheet = ss.getSheetByName(tab);
  if (!sheet) throw new Error('tab not found');
  var tags = sheet.createDeveloperMetadataFinder().withKey(TAG_KEY).find().map(function (tag) {
    return { cardId: tag.getValue(), row: tag.getLocation().getRow().getRow() };
  });
  var last = sheet.getLastRow(), width = sheet.getLastColumn();
  tags.forEach(function (tag) { last = Math.max(last, tag.row); });
  var data = { sheet: sheet, tags: tags, values: [], formulas: [], display: [], origins: [], protectionRows: [],
    heading: { row: 0, width: 0, headings: [] } };
  if (last && width) {
    var range = sheet.getRange(1, 1, last, width);
    data.values = range.getValues();
    data.formulas = range.getFormulas();
    data.display = range.getDisplayValues();
    for (var r = 0; r < last; r++) { data.origins.push(r + 1); data.protectionRows.push(r + 1); }
    for (r = 0; r < Math.min(10, last); r++) {
      var cells = data.display[r], task = false, end = 0;
      for (var c = 0; c < width; c++) {
        if (String(cells[c]).trim()) end = c + 1;
        if (cleanHeading_(cells[c]) === 'task') task = true;
      }
      if (task) { data.heading = { row: r + 1, width: end, headings: cells.slice(0, end) }; break; }
    }
  }
  data.columns = columns_(data.heading);
  return data;
}

function cachedTab_(ss, cache, tab) {
  if (!cache[tab] || cache[tab].dirty) cache[tab] = readTab_(ss, tab);
  return cache[tab];
}

function dataAnchor_(data) {
  var anchor = data.heading.row;
  for (var r = anchor; r < data.values.length; r++) {
    var filled = false;
    for (var c = 0; c < data.heading.width; c++) {
      if (!data.formulas[r][c] && String(data.values[r][c]).trim() !== '') filled = true;
    }
    if (filled) anchor = r + 1;
    else if (NEWEST_FIRST[data.sheet.getName()]) break;
  }
  return anchor;
}

/* Predict the same neighbouring R1C1 formulas append copies after insertion. */
function insertionFormulas_(data, row) {
  var last = data.values.length;
  while (last > data.heading.row && !data.values[last - 1].some(function (value, c) {
    return data.formulas[last - 1][c] || (value !== null && value !== undefined && value !== '');
  })) last--;
  var a = row - 1 > data.heading.row ? row - 1 : 0;
  var b = row <= last ? row : 0;
  if (a && !b) b = a - 1 > data.heading.row ? a - 1 : 0;
  else if (b && !a) a = b + 1 <= last ? b + 1 : 0;
  function formulas(r) {
    var origin = data.origins[r - 1];
    return origin ? data.sheet.getRange(origin, 1, 1, data.heading.width).getFormulasR1C1()[0] : data.formulas[r - 1];
  }
  var first = a && b ? formulas(a) : [], second = a && b ? formulas(b) : [];
  return data.heading.headings.map(function (_, c) { return first[c] && first[c] === second[c] ? first[c] : ''; });
}

function sync_(ss, body) {
  if (!Array.isArray(body.cards)) return { ok: false, error: 'invalid cards' };
  if (body.cards.length > 30) return { ok: false, error: 'too many cards' };
  var check = body.check === true, cache = Object.create(null);
  var results = body.cards.map(function (card) {
    card = card || {};
    var result = { cardId: card.cardId === undefined ? '' : card.cardId, who: '', result: 'error', tab: '', row: 0, written: [], conflicts: [] };
    var data, insertedRow = 0;
    try {
      if (typeof card.who !== 'string' || !Object.prototype.hasOwnProperty.call(TABS, card.who)) throw new Error('unknown member');
      result.who = card.who;
      result.tab = TABS[card.who];
      if (typeof card.cardId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(card.cardId)) throw new Error('no card id');
      // Shared cards have independent tagged rows in each assigned member's tab.
      data = cachedTab_(ss, cache, TABS[card.who]);
      var row = 0;
      for (var i = 0; i < data.tags.length; i++) {
        if (data.tags[i].cardId === card.cardId) { row = data.tags[i].row; break; }
      }
      result.tab = data.sheet.getName();
      if (!data.heading.row) throw new Error('no heading row');
      var values = values_(card.values), kind = 'updated';
      if (!row) {
        var name = nameKey_(valueText_(values.task)), due = valueText_(values['due date']), matches = [];
        var columns = data.columns, tz = ss.getSpreadsheetTimeZone();
        for (var r = data.heading.row; name && r < data.values.length; r++) {
          if (data.tags.some(function (tag) { return tag.row === r + 1; })) continue;
          var title = cellText_(data.values[r][columns.task - 1], tz);
          if (!title && columns.event) title = cellText_(data.values[r][columns.event - 1], tz);
          if (nameKey_(title) !== name) continue;
          var rowDue = columns['due date'] ? cellText_(data.values[r][columns['due date'] - 1], tz) : '';
          if (due && /^\d{4}-\d{2}-\d{2}$/.test(rowDue) && due !== rowDue) continue;
          matches.push(r + 1);
        }
        if (matches.length > 1) { result.result = 'ambiguous'; result.matches = matches; return result; }
        if (matches.length) { row = matches[0]; kind = 'linked'; }
        else { row = dataAnchor_(data) + 1; kind = 'added'; }
      }
      result.row = row;
      if (row <= data.heading.row) throw new Error('not found');
      // In previews rows may have shifted in memory, while protections remain
      // on their original physical rows in the real sheet.
      var physicalRow = check ? (data.protectionRows[row - 1] || data.sheet.getLastRow() + 1) : row;
      if (rowBlocked_(data.sheet, physicalRow)) { result.result = 'protected'; return result; }
      if (kind === 'added') {
        var formulas = insertionFormulas_(data, row);
        if (!check) {
          data.sheet.insertRowAfter(row - 1);
          insertedRow = row;
          data.dirty = true;
          for (var c = 0; c < formulas.length; c++) if (formulas[c]) data.sheet.getRange(row, c + 1).setFormulaR1C1(formulas[c]);
        }
        data.values.splice(row - 1, 0, data.heading.headings.map(function () { return ''; }));
        data.display.splice(row - 1, 0, data.heading.headings.map(function () { return ''; }));
        data.formulas.splice(row - 1, 0, formulas);
        data.origins.splice(row - 1, 0, 0);
        data.protectionRows.splice(row - 1, 0, physicalRow);
        data.tags.forEach(function (tag) { if (tag.row >= row) tag.row++; });
      }
      if (kind === 'linked' || kind === 'added') {
        if (!check && !tagRow_(data.sheet, row, card.cardId)) throw new Error('tag failed');
        data.tags.push({ cardId: card.cardId, row: row });
      }
      var written = writeValues_(ss, data.sheet, row, data.heading, values,
        { data: data, check: check, force: card.force, ignoreEmpty: true });
      result.result = kind === 'updated' && !written.written.length ? 'unchanged' : kind;
      result.written = written.written;
      result.conflicts = written.conflicts;
      if (check && kind === 'added') result.row = 0;
    } catch (err) {
      // Remove the fresh row this card added (it holds only this card's data),
      // as append does, so a failure never leaves an empty row behind.
      if (insertedRow && !check) { try { data.sheet.deleteRow(insertedRow); } catch (e2) {} }
      // A partial failed write must be read back before processing another card.
      if (data && !check) data.dirty = true;
      result.result = 'error'; result.error = String(err);
    }
    return result;
  });
  return { ok: true, check: check, results: results };
}

function sweep_(ss, body) {
  if (!Array.isArray(body.cardIds) || body.cardIds.length > 5000 ||
      body.cardIds.some(function (id) { return typeof id !== 'string'; })) return { ok: false, error: 'invalid cardIds' };
  var members = body.members === undefined ? {} : body.members;
  if (!members || Object.prototype.toString.call(members) !== '[object Object]' ||
      Object.keys(members).length > 5000 || Object.keys(members).some(function (id) {
        return !Array.isArray(members[id]) || members[id].length > 4 || members[id].some(function (member) {
          return typeof member !== 'string' || !Object.prototype.hasOwnProperty.call(TABS, member);
        });
      })) return { ok: false, error: 'invalid members' };
  var cancel = values_(body.cancel), cancelKeys = Object.keys(cancel);
  if (!body.cancel || Object.prototype.toString.call(body.cancel) !== '[object Object]' || cancelKeys.some(function (key) {
    return !Object.prototype.hasOwnProperty.call(TABS, key) || typeof cancel[key] !== 'string' || !cancel[key].trim() || cancel[key].length > 40;
  })) return { ok: false, error: 'invalid cancel' };
  var apply = body.apply === undefined ? [] : body.apply;
  if (!Array.isArray(apply) || apply.some(function (item) {
    if (typeof item === 'string') return false;
    return !item || Object.prototype.toString.call(item) !== '[object Object]' ||
      typeof item.cardId !== 'string' || typeof item.who !== 'string' || !Object.prototype.hasOwnProperty.call(TABS, item.who);
  })) return { ok: false, error: 'invalid apply' };
  var check = body.check === true, rows = [], live = Object.create(null);
  body.cardIds.forEach(function (id) { live[id] = true; });
  Object.keys(TABS).forEach(function (member) {
    if (!ss.getSheetByName(TABS[member])) return;
    var data = readTab_(ss, TABS[member]), col = data.columns.status;
    data.tags.forEach(function (tag) {
      var reason = !live[tag.cardId] ? 'deleted' :
        Object.prototype.hasOwnProperty.call(members, tag.cardId) && members[tag.cardId].indexOf(member) === -1 ? 'removed' : '';
      if (!reason || tag.row <= data.heading.row || !data.heading.row) return;
      var entry = { cardId: tag.cardId, who: member, reason: reason, tab: TABS[member], row: tag.row,
        status: col ? data.display[tag.row - 1][col - 1] : '' };
      rows.push(entry);
      if (check) return;
      entry.result = 'unchanged';
      if (!apply.some(function (item) {
        return typeof item === 'string' ? item === tag.cardId : item.cardId === tag.cardId && item.who === member;
      })) return;
      try {
        if (!col || !cancel[member]) throw new Error(!col ? 'no status heading' : 'missing cancel word');
        if (cellText_(data.values[tag.row - 1][col - 1], ss.getSpreadsheetTimeZone()) === valueText_(cancel[member])) return;
        if (rowBlocked_(data.sheet, tag.row) || data.formulas[tag.row - 1][col - 1]) { entry.result = 'protected'; return; }
        data.sheet.getRange(tag.row, col).setValue(toCellValue_(cancel[member], ss.getSpreadsheetTimeZone()));
        data.values[tag.row - 1][col - 1] = cancel[member];
        entry.result = 'canceled';
      } catch (err) { entry.result = 'error'; entry.error = String(err); }
    });
  });
  return { ok: true, check: check, rows: rows };
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
    var batch = body.action === 'sync' || body.action === 'sweep';
    if (body.action !== 'append' && body.action !== 'update' && !batch) return json_({ ok: false, error: 'unknown action' });
    if (!batch && (typeof body.who !== 'string' || !Object.prototype.hasOwnProperty.call(TABS, body.who))) {
      return json_({ ok: false, error: 'unknown member' });
    }
    if (!batch && (typeof body.cardId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.cardId))) {
      return json_({ ok: false, error: 'no card id' });
    }
    var values = values_(body.values), lock;
    try {
      lock = LockService.getScriptLock();
      lock.waitLock(20000);
    } catch (err) { return json_({ ok: false, error: 'busy, please try again' }); }
    try {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      if (body.action === 'sync') return json_(sync_(ss, body));
      if (body.action === 'sweep') return json_(sweep_(ss, body));
      return json_(body.action === 'append' ? append_(ss, body, values) : update_(ss, body, values));
    } finally { lock.releaseLock(); }
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

/* Opening the URL shows that the deployment is live, without any sheet data. */
function doGet() {
  return json_({ ok: true, service: 'MARCOM sheet link', ready: true });
}
