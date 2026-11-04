import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const original = readFileSync(new URL('../google-apps-script/marcom-sheet-sync.gs', import.meta.url), 'utf8');
/* Tests supply their own secret phrase and a fake sheet ID. */
const SAMPLE = "var SECRET = 'change-me-please';";
assert.ok(original.includes(SAMPLE), 'the script ships with the sample phrase');
const EMPTY_SHEET = "var SPREADSHEET_ID = '';";
assert.ok(original.includes(EMPTY_SHEET), 'the script ships without a sheet ID');
const source = original.replace(SAMPLE, "var SECRET = 'test-phrase';")
  .replace(EMPTY_SHEET, "var SPREADSHEET_ID = 'test-sheet-id';");
/* Columns in each tab of the copy (the gridProperties columnCount). */
const widths = { Boss: 6, Dew: 11, O: 13, Eye: 6, 'Boss 1': 6, Jez: 31 };
const OUTSIDE = 'The coordinates of the range are outside the dimensions of the sheet.';
const headings = {
  Boss: ['Event', 'Task 🐧', 'Status', 'Due Date', 'Assigned by', 'Note'],
  Dew: ['Assigned by', 'Task', 'Priority', 'Due date', 'Status', 'Details Provided',
    'Additional Details', 'Estimate Time', 'Start', 'Finish', 'Duration (include edit)'],
  O: ['Task 📸', 'Time', 'Assigned by', 'Status', 'Date', 'Due Date',
    'Photo - FIle Location', 'FIle Location', 'Notes', 'Media', 'Upload date', 'Watermark deleting date', 'Watermark'],
  Eye: ['Event', 'Task 🗃️', 'Status', 'Event owner', 'Due date 📆', 'Notes']
};
const duration = '=INT(RC[-1]-RC[-2]) & " days " & TEXT(RC[-1]-RC[-2], "hh:mm:ss")';
const watermark = '=IF(RC[-1]<>"", RC[-1]+14, "")';
const clone = value => JSON.parse(JSON.stringify(value));
const sheetDate = date => new Date(date + 'T00:00:00+07:00');
const formatDate = (date, tz, format) => {
  assert.equal(format, 'yyyy-MM-dd');
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
};
const row = values => ({ cells: values.map(v => typeof v === 'object' && v !== null && 'f' in v ? { ...v } : { v, f: '' }), metadata: [] });

// Only the Apps Script methods listed in the task are exposed to the VM.
class Range {
  constructor(sheet, r, c = 1, nr = 1, nc = 1, wholeRow = false) {
    Object.assign(this, { sheet, r, c, nr, nc, wholeRow });
  }
  getRow() { return this.r; }
  getLastRow() { return this.r + this.nr - 1; }
  matrix(field) {
    assert.equal(this.wholeRow, false, 'whole-row ranges are only for metadata');
    this.sheet.reads.push([this.r, this.c, this.nr, this.nc, field]);
    return Array.from({ length: this.nr }, (_, dr) => Array.from({ length: this.nc }, (_, dc) => {
      const cell = this.sheet.rows[this.r + dr - 1]?.cells[this.c + dc - 1] || { v: '', f: '' };
      const value = typeof cell.v === 'string' ? cell.v.replace(/^'/, '') : cell.v;
      return field === 'display' ? (cell.display ?? (value instanceof Date ? formatDate(value, 'Asia/Bangkok', 'yyyy-MM-dd') : String(value)))
        : field === 'v' ? value : cell[field];
    }));
  }
  getValues() { return this.matrix('v'); }
  getDisplayValues() { return this.matrix('display'); }
  getDisplayValue() { return this.getDisplayValues()[0][0]; }
  getFormulas() { return this.matrix('f'); }
  getFormulasR1C1() { return this.matrix('f'); }
  getFormula() { return this.matrix('f')[0][0]; }
  cell() {
    while (this.sheet.rows.length < this.r) this.sheet.rows.push(row([]));
    const cells = this.sheet.rows[this.r - 1].cells;
    while (cells.length < this.c) cells.push({ v: '', f: '' });
    return cells[this.c - 1];
  }
  setValue(value) {
    assert.equal(this.sheet.state.held, true, 'writes need the lock');
    assert.equal(this.wholeRow, false);
    if (this.sheet.failValueColumn === this.c) throw new Error('write failed');
    // Model Sheets interpreting an unguarded leading = as a formula.
    Object.assign(this.cell(), typeof value === 'string' && value.startsWith('=')
      ? { v: '', f: value } : { v: value, f: '' });
    return this;
  }
  setFormulaR1C1(formula) {
    assert.equal(this.sheet.state.held, true);
    if (this.sheet.failFormula) throw new Error('formula failed');
    Object.assign(this.cell(), { v: '', f: formula });
    return this;
  }
  addDeveloperMetadata(key, value) {
    assert.equal(this.sheet.state.held, true);
    assert.equal(this.wholeRow, true);
    if (this.sheet.failTag) throw new Error('metadata unavailable');
    this.cell();
    this.sheet.rows[this.r - 1].metadata.push({ key, value });
    return this;
  }
}

const used = cell => !!(cell.f || (cell.v !== '' && cell.v !== null && cell.v !== undefined));

class Sheet {
  constructor(name, rows, state) {
    Object.assign(this, { name, rows: rows.map(row), state, protections: [], reads: [], inserts: [], deletes: [], tagReads: 0 });
    // Like Google Sheets, a tab has a fixed size, and a range past it is an error.
    this.maxRows = rows.length;
    this.maxColumns = widths[name];
  }
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (this.rows[i].cells.some(used)) return i + 1;
    }
    return 0;
  }
  getLastColumn() {
    return Math.max(0, ...this.rows.map(r => r.cells.reduce((last, cell, i) => used(cell) ? i + 1 : last, 0)));
  }
  getRange(r, c, nr = 1, nc = 1) {
    if (typeof r === 'string') {
      const match = /^(\d+):\1$/.exec(r);
      assert.ok(match, 'only a whole row metadata range is allowed');
      if (Number(match[1]) > this.maxRows) throw new Error(OUTSIDE);
      return new Range(this, Number(match[1]), 1, 1, 1, true);
    }
    assert.ok(r > 0 && c > 0 && nr > 0 && nc > 0);
    if (r + nr - 1 > this.maxRows || c + nc - 1 > this.maxColumns) throw new Error(OUTSIDE);
    return new Range(this, r, c, nr, nc);
  }
  insertRowAfter(r) {
    assert.equal(this.state.held, true);
    if (r < 1 || r > this.maxRows) throw new Error(OUTSIDE);
    this.inserts.push(r);
    this.maxRows++;
    while (this.rows.length < r) this.rows.push(row([]));
    this.rows.splice(r, 0, row([]));
    for (const p of this.protections.filter(p => p.type === 'RANGE')) {
      if (p.start > r) { p.start++; p.end++; }
      else if (p.end >= r) p.end++;
    }
  }
  deleteRow(r) {
    assert.equal(this.state.held, true);
    if (r < 1 || r > this.maxRows) throw new Error(OUTSIDE);
    this.deletes.push(r);
    this.maxRows--;
    this.rows.splice(r - 1, 1);
    for (const p of this.protections.filter(p => p.type === 'RANGE')) {
      if (p.start > r) { p.start--; p.end--; }
      else if (p.end >= r) p.end--;
    }
  }
  getProtections(type) {
    return this.protections.filter(p => p.type === type).map(p => ({
      canEdit: () => p.edit,
      getRange: () => this.getRange(p.start, 1, p.end - p.start + 1, 1),
      getUnprotectedRanges: () => (p.exceptions || []).map(([start, end]) => this.getRange(start, 1, end - start + 1, 1))
    }));
  }
  createDeveloperMetadataFinder() {
    let key, value;
    const finder = {
      withKey(k) { key = k; return finder; },
      withValue(v) { value = v; return finder; },
      find: () => {
        this.tagReads++;
        return this.rows.flatMap((r, i) => r.metadata.filter(m => m.key === key && (value === undefined || m.value === value))
          .map(m => ({ getValue: () => m.value, getLocation: () => ({ getRow: () => this.getRange(i + 1, 1) }) })));
      }
    };
    return finder;
  }
}

function fixture(t, { protectedO = false, emptyDew = false } = {}) {
  const state = { held: false, waits: [], releases: 0, opens: [], busy: false };
  const sheets = Object.fromEntries(Object.entries({
    Boss: [['Boss title'], ['', { v: '4 years', f: '=DATEDIF(RC[-1],TODAY(),"Y")' }], ['Private title'], headings.Boss],
    Dew: [['Task List 👽🛸\nTeam Task Board'], ['Private Dew title'], headings.Dew,
      ['Boss', emptyDew ? '' : 'Newest one'], ['Boss', 'Newest two'], [], [], [], ['Boss', 'Older one'], ['Boss', 'Older two'], [], []],
    O: [['O title'], headings.O, ['Shoot one'], ['Shoot two'], [], ['Shoot last'], [], [], []],
    Eye: [['Eye title'], ['Private Eye title'], headings.Eye, ['Event one', 'File one'], ['', 'File two'], ['Event-only last']],
    'Boss 1': [['Hidden private data'], ['Task', 'Do not touch']],
    Jez: [['Another private tab'], ['Task', 'Leave alone']]
  }).map(([name, rows]) => [name, new Sheet(name, rows, state)]));
  const put = (name, r, c, v, f = '') => {
    const cells = sheets[name].rows[r - 1].cells;
    while (cells.length < c) cells.push({ v: '', f: '' });
    cells[c - 1] = { v, f };
  };
  if (emptyDew) put('Dew', 4, 1, '');
  for (let r = 3; r <= 9; r++) put('O', r, 12, r === 5 ? '2026-11-18' : '', watermark);
  for (let r = 4; r <= 12; r++) put('Dew', r, 11, '0 days 00:00:00', duration);
  if (protectedO) sheets.O.protections.push({ type: 'RANGE', start: 1, end: 9, edit: false });
  const untouched = clone([sheets['Boss 1'].rows, sheets.Jez.rows]);
  const ss = {
    getName: () => 'MARCOM test copy',
    getSheetByName: name => {
      assert.ok(['Boss', 'Dew', 'O', 'Eye'].includes(name), 'only exact allowed tabs may be accessed');
      return sheets[name] || null;
    },
    getSpreadsheetTimeZone: () => 'Asia/Bangkok'
  };
  const context = vm.createContext({
    SpreadsheetApp: {
      ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' },
      openById: id => {
        assert.equal(id, 'test-sheet-id');
        state.opens.push(state.held);
        if (state.failOpen) throw new Error('open failed');
        return ss;
      }
    },
    LockService: { getScriptLock: () => ({
      waitLock(ms) {
        state.waits.push(ms);
        if (state.busy) throw new Error('lock timeout');
        assert.equal(state.held, false);
        state.held = true;
      },
      releaseLock() { assert.equal(state.held, true); state.held = false; state.releases++; }
    }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: text => ({ text, setMimeType(mime) { assert.equal(mime, 'application/json'); return this; } })
    },
    Utilities: { formatDate, parseDate: (date, tz, format) => {
      assert.equal(format, 'yyyy-MM-dd');
      assert.equal(tz, 'Asia/Bangkok');
      if (state.failDate) throw new Error('invalid date');
      return sheetDate(date);
    } }
  });
  vm.runInContext(source, context, { filename: 'marcom-sheet-sync.gs' });
  const decode = output => JSON.parse(output.text);
  const post = body => decode(context.doPost({ postData: { contents: JSON.stringify({ secret: 'test-phrase', ...body }) } }));
  const append = (who, values = {}, cardId = 'card-1') => post({ action: 'append', who, cardId, values });
  const cell = (name, r, c) => sheets[name].rows[r - 1]?.cells[c - 1] || { v: '', f: '' };
  const snapshot = () => clone(Object.fromEntries(Object.entries(sheets).map(([name, sheet]) => [name, { rows: sheet.rows, protections: sheet.protections }])));
  t.after(() => {
    assert.deepEqual([sheets['Boss 1'].rows, sheets.Jez.rows], untouched, 'Boss 1 and Jez must stay unchanged in every test');
    assert.deepEqual(sheets['Boss 1'].reads, []);
    assert.deepEqual(sheets.Jez.reads, []);
    assert.equal(state.held, false, 'no lock may be left held');
  });
  return { context, sheets, state, put, post, append, cell, snapshot, decode };
}

test('headings normalize emoji, case, punctuation and Thai; titles are not headings', t => {
  const { context, sheets } = fixture(t);
  for (const [input, expected] of [
    ['Task 🐧', 'task'], ['Due date 📆', 'due date'], ['ASSIGNED BY', 'assigned by'],
    ['Photo - FIle Location', 'photo file location'], ['Duration (include edit)', 'duration include edit'],
    ['Task List 👽🛸\nTeam Task Board', 'task list team task board'], [' ส่งเมลแล้ว ', 'ส่งเมลแล้ว']
  ]) assert.equal(context.cleanHeading_(input), expected);
  for (const [name, expected] of [['Boss', 4], ['Dew', 3], ['O', 2], ['Eye', 3]]) {
    const heading = context.findHeading_(sheets[name]);
    assert.equal(heading.row, expected);
    assert.equal(heading.width, headings[name].length);
  }
});

test('wrong or missing secret refuses every action without opening or changing the sheet', t => {
  const f = fixture(t), before = f.snapshot();
  for (const action of ['ping', 'append', 'update', 'sync', 'sweep']) {
    for (const secret of ['wrong', undefined]) {
      assert.deepEqual(f.post({ action, secret, who: 'boss', cardId: 'card' }), { ok: false, error: 'unauthorised' });
    }
  }
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(f.state.opens, []);
  assert.deepEqual(f.state.waits, []);
});

test('ping reports only four tabs and their headings, with protection and a data-free health check', t => {
  const f = fixture(t, { protectedO: true }), before = f.snapshot();
  assert.deepEqual(f.post({ action: 'ping' }), {
    ok: true, spreadsheet: 'MARCOM test copy', tabs: [
      { key: 'boss', name: 'Boss', found: true, headingRow: 4, headings: headings.Boss, canEdit: true },
      { key: 'dew', name: 'Dew', found: true, headingRow: 3, headings: headings.Dew, canEdit: true },
      { key: 'o', name: 'O', found: true, headingRow: 2, headings: headings.O, canEdit: false },
      { key: 'junior', name: 'Eye', found: true, headingRow: 3, headings: headings.Eye, canEdit: true }
    ]
  });
  assert.deepEqual(f.decode(f.context.doGet()), { ok: true, service: 'MARCOM sheet link', ready: true });
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(f.state.waits, []);
});

test('Boss inserts below its headings, writes the matching values and a date, and skips unknown keys', t => {
  const f = fixture(t), titles = clone(f.sheets.Boss.rows);
  const result = f.append('boss', {
    Event: 'Open day', 'Task 🐧': 'Prepare signs', STATUS: 'In progress', 'due date 📆': { date: '2026-11-04' },
    'Assigned by': 'School', Note: 'ส่งเมลแล้ว', Unknown: 'ignored'
  });
  assert.deepEqual(result, { ok: true, tab: 'Boss', row: 5, tagged: true, updated: false, skipped: ['Unknown'], kept: [] });
  assert.deepEqual(f.sheets.Boss.rows.slice(0, 4), titles);
  assert.deepEqual(f.sheets.Boss.rows[4].cells.map(c => c.v), [
    'Open day', 'Prepare signs', 'In progress', sheetDate('2026-11-04'), 'School', 'ส่งเมลแล้ว'
  ]);
  assert.deepEqual(f.sheets.Boss.rows[4].metadata, [{ key: 'marcomCard', value: 'card-1' }]);
  assert.deepEqual(f.sheets.Boss.inserts, [4]);
});

test('Eye appends after an Event-only task; numeric and boolean values also count as filled', t => {
  const f = fixture(t);
  assert.equal(f.append('junior', { Task: 'New file' }).row, 7);
  assert.equal(f.cell('Eye', 6, 1).v, 'Event-only last');
  f.put('Eye', 7, 2, 0);
  assert.equal(f.append('junior', { Task: false }, 'card-2').row, 8);
  assert.equal(f.append('junior', { Task: 'After false' }, 'card-3').row, 9);
});

test('O ignores spacers and formula-only tail rows and preserves the repeated watermark formula', t => {
  const f = fixture(t), before = clone(f.sheets.O.rows);
  const result = f.append('o', { Task: 'New shoot', 'watermark deleting date': 'overwrite attempt' });
  assert.deepEqual(result, { ok: true, tab: 'O', row: 7, tagged: true, updated: false, skipped: [], kept: ['watermark deleting date'] });
  assert.equal(f.cell('O', 7, 12).f, watermark);
  assert.equal(f.cell('O', 7, 12).v, '');
  assert.deepEqual(f.sheets.O.rows.slice(0, 6), before.slice(0, 6));
  assert.deepEqual(f.sheets.O.rows.slice(7), before.slice(6));
  assert.ok(f.sheets.O.reads.some(([r, c, nr, nc, field]) => r === 3 && c === 1 && nr === 7 && nc === 13 && field === 'v'));
});

test('protected O is refused before insertion and remains exactly unchanged', t => {
  const f = fixture(t, { protectedO: true }), before = f.snapshot();
  assert.deepEqual(f.append('o', { Task: 'Blocked' }), { ok: false, error: 'protected', tab: 'O' });
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(f.sheets.O.inserts, []);
  assert.deepEqual(f.state.waits, [20000]);
  assert.equal(f.state.releases, 1);
});

test('Dew inserts after the newest run and shifts old tasks while carrying the duration formula', t => {
  const f = fixture(t), before = clone(f.sheets.Dew.rows);
  assert.equal(f.append('dew', { Task: 'Next newest', 'Duration (include edit)': 'no' }).row, 6);
  assert.equal(f.cell('Dew', 6, 11).f, duration);
  assert.equal(f.cell('Dew', 10, 2).v, 'Older one');
  assert.deepEqual(f.sheets.Dew.rows.slice(6), before.slice(5));
  assert.ok(f.sheets.Dew.reads.some(([r, c, nr, nc, field]) => r === 4 && nc === 11 && field === 'v'));
});

test('Dew with an empty first task row inserts directly below the heading and uses the two rows below', t => {
  const f = fixture(t, { emptyDew: true });
  assert.equal(f.append('dew', { Task: 'First newest' }).row, 4);
  assert.equal(f.cell('Dew', 4, 11).f, duration);
  assert.equal(f.cell('Dew', 5, 2).v, '');
  assert.equal(f.cell('Dew', 6, 2).v, 'Newest two');
});

test('repeated append compares its tagged row without inserting again', t => {
  const f = fixture(t);
  assert.equal(f.append('boss', { Task: 'One', Status: 'New' }).updated, false);
  assert.deepEqual(f.append('boss', { Task: 'Changed' }), { ok: true, tab: 'Boss', row: 5, updated: true, skipped: [], kept: [],
    written: [], same: [], conflicts: [{ key: 'Task', sheet: 'One', card: 'Changed' }] });
  assert.equal(f.cell('Boss', 5, 2).v, 'One');
  assert.equal(f.cell('Boss', 5, 3).v, 'New');
  assert.deepEqual(f.sheets.Boss.inserts, [4]);
});

test('tagged updates follow shifted rows, compare supplied keys, and clear only when forced', t => {
  const f = fixture(t);
  f.append('boss', { Task: 'One', Note: 'Clear me', Status: ' Hold' });
  // A person inserts a row above the card between requests.
  f.state.held = true;
  f.sheets.Boss.insertRowAfter(4);
  f.state.held = false;
  const result = f.post({ action: 'update', who: 'boss', cardId: 'card-1', values: { Note: '', Task: 'Edited' },
    expect: { Task: 'One' }, force: ['Note'] });
  assert.equal(result.row, 6);
  assert.equal(f.cell('Boss', 6, 6).v, '');
  assert.equal(f.cell('Boss', 6, 3).v, ' Hold');
  assert.equal(f.cell('Boss', 6, 2).v, 'Edited');
  assert.equal(f.sheets.Boss.getLastRow(), 6);
});

test('update searches the requested tab first, then only the other allowed tabs', t => {
  const f = fixture(t);
  f.append('junior', { Task: 'Eye card' });
  assert.equal(f.post({ action: 'update', who: 'boss', cardId: 'card-1', values: { Notes: 'Found in Eye' } }).tab, 'Eye');
  assert.equal(f.cell('Eye', 7, 6).v, 'Found in Eye');
  f.append('boss', { Task: 'Boss duplicate tag' });
  assert.equal(f.post({ action: 'update', who: 'boss', cardId: 'card-1', values: { Task: 'Preferred' } }).tab, 'Boss');
  assert.equal(f.cell('Eye', 7, 2).v, 'Eye card');
});

test('row and exact trimmed title fallback tags an existing task; wrong or invalid fallback never appends', t => {
  const f = fixture(t), count = f.sheets.Eye.rows.length;
  assert.equal(f.post({ action: 'update', who: 'junior', cardId: 'old-card', row: 4, title: ' File one ', values: { Status: 'Done' } }).row, 4);
  assert.deepEqual(f.sheets.Eye.rows[3].metadata, [{ key: 'marcomCard', value: 'old-card' }]);
  for (const [r, title] of [[5, 'wrong'], [3, 'Task 🗃️'], [99, 'File two'], [5.5, 'File two'], ['5', 'File two'], [5, '  '], [5, 'file two']]) {
    assert.deepEqual(f.post({ action: 'update', who: 'junior', cardId: 'missing', row: r, title, values: { Task: 'No' } }),
      { ok: false, error: 'not found', tab: 'Eye' });
  }
  assert.equal(f.sheets.Eye.rows.length, count);
  assert.deepEqual(f.sheets.Eye.inserts, []);
});

test('text guards block formulas and typed numeric/time conversion while preserving menu and Thai text', t => {
  const f = fixture(t);
  for (const input of ['=IMPORTXML("x","y")', '+1', '-5', '@x', '08:15 - 09:30', '- Set up the hall', '123', '1/2', '(123)']) {
    assert.equal(f.context.guardText_(input), "'" + input);
  }
  for (const input of ['Hello', ' Hold', 'ส่งเมลแล้ว', 'Photo&VDO', '']) assert.equal(f.context.guardText_(input), input);
  f.append('boss', { Task: '=IMPORTXML("x","y")', Note: '08:15 - 09:30' });
  assert.deepEqual(f.cell('Boss', 5, 2), { v: '\'=IMPORTXML("x","y")', f: '' });
  assert.equal(f.cell('Boss', 5, 6).v, "'08:15 - 09:30");
});

test('value conversion validates dates and keeps numbers and booleans without coercion', t => {
  const f = fixture(t), convert = value => f.context.toCellValue_(value, 'Asia/Bangkok');
  for (const input of [null, undefined, {}, [], { date: '2026-02-29' }, { date: '2026-11-31' },
    { date: '2026-00-01' }, { date: '2026-13-01' }, { date: '2026-01-00' }, { date: '26-01-01' }]) assert.equal(convert(input), '');
  assert.deepEqual(convert({ date: '2028-02-29' }), sheetDate('2028-02-29'));
  assert.equal(convert(0), 0);
  assert.equal(convert(false), false);
  assert.equal(convert(12.5), 12.5);
  assert.equal(convert('a'.repeat(20001)).length, 20000);
  assert.equal(convert('='.repeat(20001)).length, 20000);
  f.state.failDate = true;
  assert.equal(convert({ date: '2026-11-04' }), '');
});

test('invalid member, card ID, and action return precise errors; inherited member names are refused', t => {
  const f = fixture(t), before = f.snapshot();
  for (const who of ['Boss', 'Boss 1', 'Jez', 'toString', '__proto__', undefined, ['boss']]) {
    assert.deepEqual(f.post({ action: 'append', who, cardId: 'card' }), { ok: false, error: 'unknown member' });
  }
  for (const action of ['append', 'update']) {
    for (const cardId of [undefined, '', 'has spaces', 'x'.repeat(129), 12, ['card'], 'ไทย']) {
      assert.deepEqual(f.post({ action, who: 'boss', cardId }), { ok: false, error: 'no card id' });
    }
  }
  assert.deepEqual(f.post({ action: 'delete', who: 'boss' }), { ok: false, error: 'unknown action' });
  assert.deepEqual(f.snapshot(), before);
});

test('failed writes roll back the inserted row, its formulas, metadata shifts and protection growth', t => {
  const f = fixture(t);
  f.sheets.Dew.protections.push({ type: 'RANGE', start: 4, end: 12, edit: true });
  f.sheets.Dew.rows[8].metadata.push({ key: 'marcomCard', value: 'older-card' });
  f.sheets.Dew.failValueColumn = 5;
  const before = f.snapshot();
  assert.deepEqual(f.append('dew', { Task: 'Written first', Status: 'Fails next' }), { ok: false, error: 'Error: write failed' });
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(f.sheets.Dew.deletes, [6]);
  assert.deepEqual(f.state.waits, [20000]);
  assert.equal(f.state.releases, 1);
});

test('failed formula copying rolls back, but failed metadata tagging leaves a successful row', t => {
  const f = fixture(t), before = f.snapshot();
  f.sheets.O.failFormula = true;
  assert.equal(f.append('o', { Task: 'Fails' }).error, 'Error: formula failed');
  assert.deepEqual(f.snapshot(), before);
  f.sheets.Boss.failTag = true;
  assert.equal(f.append('boss', { Task: 'Saved without tag' }).tagged, false);
  assert.equal(f.cell('Boss', 5, 2).v, 'Saved without tag');
  assert.deepEqual(f.sheets.Boss.deletes, []);
});

test('append and update hold the lock before opening the sheet and release it on success and failure', t => {
  const f = fixture(t);
  f.append('boss', { Task: 'One' });
  f.post({ action: 'update', who: 'boss', cardId: 'card-1', values: { Status: 'Done' } });
  f.post({ action: 'update', who: 'boss', cardId: 'missing', values: {} });
  f.sheets.Boss.failValueColumn = 2;
  assert.equal(f.post({ action: 'update', who: 'boss', cardId: 'card-1', values: { Task: 'Fails' }, expect: { Task: 'One' } }).error, 'Error: write failed');
  f.state.failOpen = true;
  assert.equal(f.append('boss').error, 'Error: open failed');
  assert.deepEqual(f.state.opens, [true, true, true, true, true]);
  assert.deepEqual(f.state.waits, [20000, 20000, 20000, 20000, 20000]);
  assert.equal(f.state.releases, 5);
});

test('lock timeout returns busy without reading, writing, or releasing an unacquired lock', t => {
  const f = fixture(t), before = f.snapshot();
  f.state.busy = true;
  for (const action of ['append', 'update']) {
    assert.deepEqual(f.post({ action, who: 'boss', cardId: 'card', values: { Task: 'No' } }), { ok: false, error: 'busy, please try again' });
  }
  assert.deepEqual(f.state.opens, []);
  assert.equal(f.state.releases, 0);
  assert.deepEqual(f.snapshot(), before);
});

test('sheet protections honour exceptions but an overlapping range protection still blocks', t => {
  const f = fixture(t);
  f.sheets.O.protections.push({ type: 'SHEET', edit: false, exceptions: [[7, 8]] });
  assert.equal(f.context.rowBlocked_(f.sheets.O, 6), true);
  assert.equal(f.context.rowBlocked_(f.sheets.O, 7), false);
  assert.equal(f.context.rowBlocked_(f.sheets.O, 8), false);
  assert.equal(f.context.rowBlocked_(f.sheets.O, 9), true);
  assert.equal(f.post({ action: 'ping' }).tabs[2].canEdit, true);
  f.sheets.O.protections.push({ type: 'RANGE', start: 7, end: 7, edit: false });
  assert.equal(f.post({ action: 'ping' }).tabs[2].canEdit, false);
  assert.equal(f.append('o').error, 'protected');
  f.sheets.O.protections = [{ type: 'SHEET', edit: false }];
  assert.equal(f.append('o').error, 'protected');
  f.sheets.O.protections[0].edit = true;
  assert.equal(f.append('o', { Task: 'Allowed owner' }).ok, true);
});

test('protected tagged and fallback updates do not change values or add tags', t => {
  const f = fixture(t, { protectedO: true });
  f.sheets.O.rows[2].metadata.push({ key: 'marcomCard', value: 'existing' });
  const before = f.snapshot();
  assert.equal(f.post({ action: 'update', who: 'boss', cardId: 'existing', values: { Task: 'No' } }).error, 'protected');
  assert.equal(f.post({ action: 'update', who: 'o', cardId: 'fallback', row: 4, title: 'Shoot two', values: { Task: 'No' } }).error, 'protected');
  assert.deepEqual(f.snapshot(), before);
});

test('missing tabs and headings are reported without writing; ping has no task content', t => {
  const f = fixture(t);
  delete f.sheets.Boss;
  f.sheets.Dew.rows[2] = row(['No task heading']);
  f.sheets.Dew.protections.push({ type: 'RANGE', start: 1, end: 1, edit: false });
  const before = f.snapshot(), ping = f.post({ action: 'ping' });
  assert.deepEqual(ping.tabs[0], { key: 'boss', name: 'Boss', found: false });
  assert.deepEqual(ping.tabs[1], { key: 'dew', name: 'Dew', found: true, headingRow: 0, headings: [], canEdit: false });
  assert.deepEqual(f.append('boss'), { ok: false, error: 'tab not found', tab: 'Boss' });
  assert.deepEqual(f.append('dew'), { ok: false, error: 'no heading row', tab: 'Dew' });
  assert.deepEqual(f.snapshot(), before);
  assert.doesNotMatch(JSON.stringify(ping), /Newest|Older|Private|Shoot|File one/);
});

test('matching takes the first duplicate heading and leaves cells beyond the heading width alone', t => {
  const f = fixture(t);
  f.put('Boss', 4, 6, 'Task 📸');
  f.append('boss', { task: 'First match' });
  assert.equal(f.cell('Boss', 5, 2).v, 'First match');
  assert.equal(f.cell('Boss', 5, 6).v, '');
  f.sheets.Boss.maxColumns = 8;
  f.put('Boss', 5, 8, 'Outside the table');
  assert.equal(f.post({ action: 'update', who: 'boss', cardId: 'card-1', values: { task: 'Edited', Unknown: 'No' } }).ok, true);
  assert.equal(f.cell('Boss', 5, 8).v, 'Outside the table');
});

test('formula copying requires two agreeing rows, including the only-above branch', t => {
  const f = fixture(t);
  f.put('Eye', 5, 6, '', '=RC[-1]+1');
  f.put('Eye', 6, 6, '', '=RC[-1]+1');
  f.put('Eye', 6, 3, 'Calculated once', '=42');
  const result = f.append('junior', { Task: 'Next', Notes: 'Do not overwrite', Status: 'New' });
  assert.deepEqual(result.kept, ['Notes']);
  assert.equal(f.cell('Eye', 7, 6).f, '=RC[-1]+1');
  assert.equal(f.cell('Eye', 7, 3).f, '');
  assert.equal(f.cell('Eye', 7, 3).v, 'New');
  f.put('O', 6, 9, '', '=42');
  f.put('O', 7, 9, '', '=43');
  f.append('o', { Task: 'Next', Notes: 'Allowed text' });
  assert.equal(f.cell('O', 7, 9).f, '');
  assert.equal(f.cell('O', 7, 9).v, 'Allowed text');
});

test('updates preserve formulas and metadata on headings can never allow a heading write', t => {
  const f = fixture(t);
  f.sheets.O.rows[2].metadata.push({ key: 'marcomCard', value: 'old' });
  assert.deepEqual(f.post({ action: 'update', who: 'o', cardId: 'old', values: { 'Watermark deleting date': '', Notes: 'Updated' } }).kept,
    ['Watermark deleting date']);
  assert.equal(f.cell('O', 3, 12).f, watermark);
  f.sheets.Boss.rows[3].metadata.push({ key: 'marcomCard', value: 'bad-tag' });
  const before = f.snapshot();
  assert.equal(f.append('boss', { Task: 'Never replace heading' }, 'bad-tag').error, 'not found');
  assert.deepEqual(f.snapshot(), before);
});

test('values must be plain objects and are limited to the first 40 own keys', t => {
  const f = fixture(t);
  for (const values of [null, [], ['Task'], 'Task', 12, false]) {
    assert.equal(f.append('boss', values, 'empty').ok, true);
    assert.equal(f.cell('Boss', 5, 2).v, '');
  }
  assert.equal(vm.runInContext('Object.keys(values_(new Date())).length', f.context), 0);
  const values = Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['unknown' + i, i]));
  values.Task = 'Key 41 is ignored';
  const result = f.append('boss', values, 'limited');
  assert.equal(result.skipped.length, 40);
  assert.equal(f.cell('Boss', result.row, 2).v, '');
  const special = JSON.parse('{"__proto__":"safe","constructor":"safe","Task":"Valid"}');
  assert.deepEqual(f.append('boss', special, 'special').skipped, ['__proto__', 'constructor']);
});

test('malformed JSON is caught and all responses use JSON output', t => {
  const f = fixture(t);
  assert.match(f.decode(f.context.doPost({ postData: { contents: '{bad' } })).error, /SyntaxError/);
  assert.equal(f.decode(f.context.doPost()).error, 'unauthorised');
  assert.equal(f.decode(f.context.doPost({ postData: { contents: 'null' } })).error, 'unauthorised');
});

test('narrow tabs are read only as far as their last column (Boss and Eye have 6)', t => {
  const f = fixture(t);
  assert.throws(() => f.sheets.Boss.getRange(1, 1, 1, 13), /outside the dimensions/);
  assert.equal(f.append('boss', { Task: 'Fits' }).row, 5);
  assert.equal(f.append('junior', { Task: 'Fits too' }, 'card-2').row, 7);
  for (const name of ['Boss', 'Eye']) {
    for (const [, c, , nc] of f.sheets[name].reads) assert.ok(c + nc - 1 <= 6, name + ' was read past column 6');
  }
  assert.ok(f.post({ action: 'ping' }).tabs.every(tab => tab.found && tab.headingRow > 0));
});

test('text with spaces or a line break before a formula sign is also kept as text', t => {
  const f = fixture(t);
  for (const input of [' =1+1', '\n=HYPERLINK("x")', '\t+1', '  @x']) {
    assert.equal(f.context.guardText_(input), "'" + input);
  }
});

test('the sample secret phrase is refused for every action, but the health check still answers', () => {
  const context = vm.createContext({
    SpreadsheetApp: { openById: () => assert.fail('the sheet must not be opened') },
    LockService: { getScriptLock: () => assert.fail('the lock must not be taken') },
    ContentService: { MimeType: { JSON: 'application/json' },
      createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    Utilities: {}
  });
  vm.runInContext(original, context);
  for (const action of ['ping', 'append', 'update', 'sync', 'sweep']) {
    const body = JSON.stringify({ secret: 'change-me-please', action, who: 'boss', cardId: 'card' });
    assert.deepEqual(JSON.parse(context.doPost({ postData: { contents: body } }).text),
      { ok: false, error: 'secret not set' });
  }
  assert.deepEqual(JSON.parse(context.doGet().text), { ok: true, service: 'MARCOM sheet link', ready: true });
});

test('an empty sheet ID refuses every action after checking the secret, without opening or locking', () => {
  let opens = 0, locks = 0;
  const context = vm.createContext({
    SpreadsheetApp: { openById: () => { opens++; throw new Error('unexpected sheet open'); } },
    LockService: { getScriptLock: () => { locks++; throw new Error('unexpected lock'); } },
    ContentService: { MimeType: { JSON: 'application/json' },
      createTextOutput: text => ({ text, setMimeType() { return this; } }) }
  });
  vm.runInContext(original.replace(SAMPLE, "var SECRET = 'test-phrase';"), context);
  for (const id of ['', ' \t\n ']) {
    context.SPREADSHEET_ID = id;
    for (const action of ['ping', 'append', 'update', 'sync', 'sweep']) {
      for (const secret of ['test-phrase', 'wrong']) {
        const body = JSON.stringify({ secret, action, who: 'boss', cardId: 'card', values: { Task: 'No write' } });
        assert.deepEqual(JSON.parse(context.doPost({ postData: { contents: body } }).text),
          { ok: false, error: secret === 'wrong' ? 'unauthorised' : 'spreadsheet not set' });
      }
    }
  }
  assert.equal(opens, 0, 'the sheet must not be opened');
  assert.equal(locks, 0, 'the lock must not be taken');
  assert.deepEqual(JSON.parse(context.doGet().text), { ok: true, service: 'MARCOM sheet link', ready: true });
});

const card = (cardId, who, values, force = []) => ({ cardId, who, values, force });
const sync = (f, cards, check = false) => f.post({ action: 'sync', cards, check });
const tag = (f, tab, r, cardId) => f.sheets[tab].rows[r - 1].metadata.push({ key: 'marcomCard', value: cardId });
const cancel = { boss: 'Canceled', dew: 'Cancel', o: 'CANCELLED', junior: 'Canceled' };
const sweep = (f, overrides = {}) => f.post({ action: 'sweep', cardIds: [], cancel, apply: [], ...overrides });

test('comparable text respects dates, time zone, primitive types, and the no-clear decision order', t => {
  const f = fixture(t), { cellText_, valueText_, nameKey_, decide_ } = f.context;
  for (const [input, expected] of [[null, ''], [undefined, ''], ['  text\n', 'text'], [0, '0'], [false, 'false']]) {
    assert.equal(cellText_(input, 'Asia/Bangkok'), expected);
    assert.equal(valueText_(input), expected);
  }
  assert.equal(cellText_(sheetDate('2026-11-04'), 'Asia/Bangkok'), '2026-11-04');
  assert.equal(cellText_(sheetDate('2026-11-04'), 'UTC'), '2026-11-03');
  assert.equal(valueText_({ date: '2028-02-29' }), '2028-02-29');
  for (const input of [{}, [], { date: '2026-02-29' }, { date: '2026-11-31' }, { date: 'bad' }]) assert.equal(valueText_(input), '');
  assert.equal(nameKey_('  File \n ONE\t here  '), 'file one here');
  for (const [current, next, expected, has, forced, outcome] of [
    ['a', 'a', '', false, true, 'same'], ['', '', '', false, false, 'same'],
    ['a', '', 'a', true, false, 'conflict'], ['a', '', '', false, true, 'write'],
    ['', 'b', '', false, false, 'write'], ['a', 'b', '', false, true, 'write'],
    ['a', 'b', 'a', true, false, 'write'], ['a', 'b', 'a', false, false, 'conflict'],
    ['a', 'b', 'wrong', true, false, 'conflict']
  ]) assert.equal(decide_(current, next, expected, has, forced), outcome);
});

test('update fills blanks, reports same and conflicts, and compares only own expected keys', t => {
  const f = fixture(t);
  f.append('boss', { task: 'Original', status: 'New', note: 'Keep', 'due date': { date: '2026-11-04' } });
  f.cell('Boss', 5, 3).display = 'NEW (display)';
  const update = extra => f.post({ action: 'update', who: 'boss', cardId: 'card-1', ...extra });
  const result = update({ values: { task: ' Original ', event: 'Filled', status: 'Done', note: 'Changed',
    'due date': { date: '2026-11-04' }, unknown: 'Ignored' }, expect: { note: 'Wrong' } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.written, ['event']);
  assert.deepEqual(result.same, ['task', 'due date']);
  assert.deepEqual(result.skipped, ['unknown']);
  assert.deepEqual(result.conflicts, [{ key: 'status', sheet: 'NEW (display)', card: 'Done' }, { key: 'note', sheet: 'Keep', card: 'Changed' }]);
  assert.equal(f.cell('Boss', 5, 3).v, 'New');
  assert.equal(f.cell('Boss', 5, 6).v, 'Keep');
  assert.deepEqual(update({ values: { task: 'Edited', status: 'Done' }, expect: { task: ' Original ' } }).written, ['task']);
  assert.equal(f.cell('Boss', 5, 2).v, 'Edited');
  assert.deepEqual(update({ values: { 'due date': { date: '2026-11-05' } }, expect: { 'due date': { date: '2026-11-04' } } }).written, ['due date']);
  assert.deepEqual(f.cell('Boss', 5, 4).v, sheetDate('2026-11-05'));
});

test('update force applies only to its exact keys; empty values require force even with matching expect', t => {
  const f = fixture(t);
  f.append('boss', { task: 'Old', status: 'New', note: 'Keep' });
  const update = extra => f.post({ action: 'update', who: 'boss', cardId: 'card-1', ...extra });
  let result = update({ values: { task: 'Changed', status: 'Done', note: '' }, force: ['status'], expect: { note: 'Keep' } });
  assert.deepEqual(result.written, ['status']);
  assert.deepEqual(result.conflicts.map(c => c.key), ['task', 'note']);
  assert.equal(f.cell('Boss', 5, 2).v, 'Old');
  assert.equal(f.cell('Boss', 5, 6).v, 'Keep');
  result = update({ values: { note: '' }, force: ['note'] });
  assert.deepEqual(result.written, ['note']);
  assert.equal(f.cell('Boss', 5, 6).v, '');
  f.put('Boss', 5, 3, 'Calculated', '=42');
  result = update({ values: { status: 'Forced' }, force: ['status'], expect: { status: 'Calculated' } });
  assert.deepEqual(result.kept, ['status']);
  assert.deepEqual(result.written, []);
  assert.equal(f.cell('Boss', 5, 3).f, '=42');
  assert.deepEqual(f.post({ action: 'append', who: 'boss', cardId: 'card-1', values: { task: 'Edited' }, expect: { task: 'Old' } }).written, ['task']);
});

test('sync tagged cards compare, fill, force only chosen keys, and ignore all empty values', t => {
  const f = fixture(t);
  f.append('boss', { task: 'One', status: 'New', note: 'Keep' });
  assert.equal(sync(f, [card('card-1', 'boss', { task: 'One' })]).results[0].result, 'unchanged');
  let result = sync(f, [card('card-1', 'boss', { event: 'Open day', status: 'Done', note: '' }, ['note'])]).results[0];
  assert.equal(result.result, 'updated');
  assert.deepEqual(result.written, ['event']);
  assert.deepEqual(result.conflicts, [{ key: 'status', sheet: 'New', card: 'Done' }]);
  assert.equal(f.cell('Boss', 5, 6).v, 'Keep');
  result = sync(f, [card('card-1', 'boss', { task: 'Different', status: 'Done', note: '' }, ['status', 'note'])]).results[0];
  assert.deepEqual(result.written, ['status']);
  assert.deepEqual(result.conflicts, [{ key: 'task', sheet: 'One', card: 'Different' }]);
  assert.equal(f.cell('Boss', 5, 3).v, 'Done');
  const before = f.snapshot();
  result = sync(f, [card('card-1', 'boss', { task: 'Different', note: '' }, ['note'])]).results[0];
  assert.equal(result.result, 'unchanged');
  assert.deepEqual(f.snapshot(), before);
  f.put('Boss', 5, 3, 'Computed', '=42');
  assert.deepEqual(sync(f, [card('card-1', 'boss', { status: 'Done' }, ['status'])]).results[0].written, []);
  assert.equal(f.cell('Boss', 5, 3).f, '=42');
});

test('sync prefers the own-tab tag then finds tags on other allowed tabs, including empty tagged rows', t => {
  const f = fixture(t);
  tag(f, 'Eye', 4, 'shared');
  assert.equal(sync(f, [card('shared', 'boss', { notes: 'Found Eye' })]).results[0].tab, 'Eye');
  f.append('boss', { task: 'Own' }, 'shared');
  assert.equal(sync(f, [card('shared', 'boss', { note: 'Own tab first' })]).results[0].tab, 'Boss');
  assert.equal(f.cell('Eye', 4, 6).v, 'Found Eye');
  f.sheets.Boss.rows.push(row([])); f.sheets.Boss.maxRows++;
  tag(f, 'Boss', 6, 'empty-tag');
  const result = sync(f, [card('empty-tag', 'boss', { task: 'Fill empty tagged row' })]).results[0];
  assert.equal(result.row, 6);
  assert.equal(result.result, 'updated');
  assert.equal(f.cell('Boss', 6, 2).v, 'Fill empty tagged row');
});

test('sync links normalized hand-typed names and Eye Event-only names without replacing their text', t => {
  const f = fixture(t);
  f.put('Eye', 4, 2, '  File  \n ONE ');
  f.put('Eye', 4, 3, 'Human status');
  const results = sync(f, [card('file', 'junior', { task: 'file one', status: 'New', notes: 'Fill' }),
    card('event', 'junior', { task: ' EVENT-only   last ', notes: 'Also fill' })]).results;
  assert.deepEqual(results.map(r => [r.result, r.row]), [['linked', 4], ['linked', 6]]);
  assert.deepEqual(results[0].conflicts.map(c => c.key), ['task', 'status']);
  assert.equal(f.cell('Eye', 4, 2).v, '  File  \n ONE ');
  assert.equal(f.cell('Eye', 4, 6).v, 'Fill');
  assert.equal(f.cell('Eye', 6, 1).v, 'Event-only last');
  assert.equal(f.cell('Eye', 6, 2).v, ' EVENT-only   last ');
  assert.equal(f.sheets.Eye.rows[3].metadata[0].value, 'file');
  assert.equal(f.sheets.Eye.rows[5].metadata[0].value, 'event');
});

test('sync matches equal due dates and missing dates, but adds when both dates differ', t => {
  for (const [rowDue, cardDue, expected] of [
    [sheetDate('2026-11-04'), { date: '2026-11-04' }, 'linked'],
    ['2026-11-04', { date: '2026-11-04' }, 'linked'],
    [sheetDate('2026-11-04'), { date: '2026-11-05' }, 'added'],
    ['', { date: '2026-11-05' }, 'linked'],
    [sheetDate('2026-11-04'), '', 'linked'], ['No date yet', { date: '2026-11-05' }, 'linked']
  ]) {
    const f = fixture(t);
    f.put('Eye', 4, 5, rowDue);
    const result = sync(f, [card('date-card', 'junior', { task: 'File one', 'due date': cardDue })]).results[0];
    assert.equal(result.result, expected);
    assert.equal(result.row, expected === 'added' ? 7 : 4);
    if (expected === 'added') assert.deepEqual(f.cell('Eye', 4, 5).v, rowDue);
  }
});

test('sync ambiguous names never write, and rows tagged for another card are never matched', t => {
  const f = fixture(t);
  f.put('Eye', 5, 2, ' FILE ONE ');
  const before = f.snapshot();
  const ambiguous = sync(f, [card('ambiguous', 'junior', { task: 'File one', status: 'New' }, ['task'])]).results[0];
  assert.equal(ambiguous.result, 'ambiguous');
  assert.deepEqual(ambiguous.matches, [4, 5]);
  assert.deepEqual(f.snapshot(), before);
  tag(f, 'Eye', 4, 'someone-else'); tag(f, 'Eye', 5, 'another-card');
  const added = sync(f, [card('new', 'junior', { task: 'File one' })]).results[0];
  assert.equal(added.result, 'added');
  assert.equal(added.row, 7);
  assert.equal(f.sheets.Eye.rows[3].metadata[0].value, 'someone-else');
});

test('sync adds exactly where append does with formulas and unchanged shifted rows', t => {
  for (const who of ['boss', 'dew', 'o', 'junior']) {
    const f = fixture(t), control = fixture(t);
    const values = { task: 'Brand new', status: 'New', 'due date': { date: '2026-11-04' },
      'duration include edit': 'Keep formula', 'watermark deleting date': 'Keep formula' };
    const expected = control.append(who, values, 'added');
    const result = sync(f, [card('added', who, values)]).results[0];
    assert.equal(result.result, 'added');
    assert.equal(result.row, expected.row);
    assert.deepEqual(f.snapshot(), control.snapshot());
    assert.deepEqual(f.sheets[result.tab].deletes, []);
  }
});

test('sync check is a deep no-op and predicts link, add, conflict, ambiguous, and protected outcomes', t => {
  const f = fixture(t);
  f.append('boss', { task: 'Tagged', status: 'Human status' }, 'tagged');
  f.put('O', 4, 1, 'Shoot one');
  f.sheets.Eye.protections.push({ type: 'RANGE', start: 5, end: 5, edit: false });
  const cards = [card('tagged', 'boss', { task: 'Tagged', status: 'New', note: 'Fill' }),
    card('linked', 'junior', { task: 'File one', notes: 'Fill' }),
    card('added', 'dew', { task: 'New', 'duration include edit': 'Formula stays' }),
    card('ambiguous', 'o', { task: 'Shoot one' }), card('protected', 'junior', { task: 'File two' })];
  const before = f.snapshot(), inserts = clone(Object.values(f.sheets).map(s => s.inserts));
  const preview = sync(f, cards, true);
  assert.equal(preview.check, true);
  assert.deepEqual(preview.results.map(r => r.result), ['updated', 'linked', 'added', 'ambiguous', 'protected']);
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(Object.values(f.sheets).map(s => s.inserts), inserts);
  assert.equal(preview.results[2].row, 0);
  const applied = sync(f, cards);
  applied.results[2].row = 0;
  assert.deepEqual(preview.results, applied.results);
  assert.equal(f.state.releases, 3);
});

test('sync reads each unchanged tab block and tags once, and remembers earlier writes and links', t => {
  const f = fixture(t);
  const result = sync(f, [card('link', 'junior', { task: 'File one', notes: 'First' }),
    card('link', 'junior', { task: 'File one', notes: 'First' }), card('link', 'junior', { notes: 'Second' })]);
  assert.deepEqual(result.results.map(r => r.result), ['linked', 'unchanged', 'unchanged']);
  assert.deepEqual(result.results[2].conflicts, [{ key: 'notes', sheet: 'First', card: 'Second' }]);
  for (const name of ['Boss', 'Dew', 'O', 'Eye']) {
    assert.equal(f.sheets[name].tagReads, 1, name);
    assert.equal(f.sheets[name].reads.length, 3, name + ' should only read values, formulas and display once');
  }
});

test('sync refreshes an inserted tab before the next card and check simulates the same sequence', t => {
  const f = fixture(t);
  tag(f, 'Dew', 9, 'old');
  const cards = [card('first', 'dew', { task: 'First new' }), card('second', 'dew', { task: 'Second new' }),
    card('old', 'dew', { status: 'Updated' }), card('first', 'dew', { task: 'First new' })];
  const before = f.snapshot(), preview = sync(f, cards, true);
  assert.deepEqual(f.snapshot(), before);
  const result = sync(f, cards);
  assert.deepEqual(result.results.map(r => [r.result, r.row]), [['added', 6], ['added', 7], ['updated', 11], ['unchanged', 6]]);
  assert.deepEqual(preview.results, result.results.map(r => r.result === 'added' ? { ...r, row: 0 } : r));
  assert.equal(f.cell('Dew', 11, 2).v, 'Older one');
  assert.equal(f.cell('Dew', 11, 5).v, 'Updated');
  assert.equal(f.cell('Dew', 6, 11).f, duration);
  assert.equal(f.cell('Dew', 7, 11).f, duration);
  assert.equal(f.sheets.Dew.tagReads, 4, 'one preview read plus three apply reads');
});

test('sync limits batches, isolates invalid entries, exceptions, and protected tabs', t => {
  const f = fixture(t), before = f.snapshot();
  assert.deepEqual(sync(f, Array.from({ length: 31 }, (_, i) => card('c' + i, 'boss', {}))), { ok: false, error: 'too many cards' });
  assert.deepEqual(f.snapshot(), before);
  f.sheets.O.protections.push({ type: 'SHEET', edit: false });
  f.sheets.Boss.failValueColumn = 2;
  const results = sync(f, [null, card('bad id', 'boss', {}), card('bad-member', 'Jez', {}),
    card('throws', 'boss', { task: 'Fail' }), card('protected', 'o', { task: 'Shoot one' }),
    card('protected-new', 'o', { task: 'New' }), card('works', 'junior', { task: 'File one', notes: 'Success' })]).results;
  assert.deepEqual(results.map(r => r.result), ['error', 'error', 'error', 'error', 'protected', 'protected', 'linked']);
  assert.match(results[1].error, /no card id/);
  assert.match(results[2].error, /unknown member/);
  assert.match(results[3].error, /write failed/);
  assert.equal(f.cell('Eye', 4, 6).v, 'Success');
  assert.deepEqual(f.sheets.O.rows, before.O.rows);
  assert.deepEqual(f.state.waits, [20000, 20000]);
  assert.deepEqual(f.state.opens, [true, true]);
  assert.equal(f.state.releases, 2);
});

test('sweep previews missing tagged cards across tabs and only cancels explicitly selected ids', t => {
  const f = fixture(t);
  f.append('boss', { task: 'Deleted', status: 'In progress' }, 'gone-boss');
  for (const [tab, r, id, col] of [['Dew', 4, 'gone-dew', 5], ['O', 3, 'gone-o', 4],
    ['Eye', 4, 'gone-eye', 3], ['Eye', 5, 'still-live', 3], ['Dew', 5, 'not-selected', 5]]) {
    tag(f, tab, r, id); f.put(tab, r, col, 'In progress');
  }
  const before = f.snapshot(), selected = ['gone-boss', 'gone-dew', 'gone-o', 'gone-eye', 'still-live'];
  const preview = sweep(f, { check: true, cardIds: ['still-live'], apply: selected });
  assert.equal(preview.check, true);
  assert.deepEqual(preview.rows.map(r => r.cardId), ['gone-boss', 'gone-dew', 'not-selected', 'gone-o', 'gone-eye']);
  assert.ok(preview.rows.every(r => r.status === 'In progress' && !('result' in r)));
  assert.deepEqual(f.snapshot(), before);
  const applied = sweep(f, { cardIds: ['still-live'], apply: selected });
  assert.deepEqual(applied.rows.map(({ result, ...r }) => r), preview.rows);
  assert.deepEqual(applied.rows.map(r => r.result), ['canceled', 'canceled', 'unchanged', 'canceled', 'canceled']);
  const expected = clone(before);
  for (const [tab, r, col, word] of [['Boss', 5, 3, 'Canceled'], ['Dew', 4, 5, 'Cancel'],
    ['O', 3, 4, 'CANCELLED'], ['Eye', 4, 3, 'Canceled']]) expected[tab].rows[r - 1].cells[col - 1].v = word;
  assert.deepEqual(f.snapshot(), expected, 'only the selected Status cells change');
  assert.ok(sweep(f, { cardIds: ['still-live'], apply: selected }).rows.every(r => r.result === 'unchanged'));
  assert.deepEqual(f.state.opens, [true, true, true, true]);
  assert.equal(f.state.releases, 4);
  for (const sheet of Object.values(f.sheets)) assert.deepEqual(sheet.deletes, []);
});

test('sweep protects blocked and formula statuses, reports display values, and continues after write errors', t => {
  const f = fixture(t);
  tag(f, 'Dew', 4, 'throws'); f.sheets.Dew.failValueColumn = 5;
  tag(f, 'O', 3, 'protected'); f.sheets.O.protections.push({ type: 'SHEET', edit: false });
  tag(f, 'Eye', 4, 'formula'); f.put('Eye', 4, 3, 'Calculated', '=42');
  f.cell('Eye', 4, 3).display = 'Visible status';
  tag(f, 'Eye', 5, 'works');
  const before = f.snapshot(), apply = ['throws', 'protected', 'formula', 'works'];
  assert.equal(sweep(f, { check: true, apply }).rows.find(r => r.cardId === 'formula').status, 'Visible status');
  assert.deepEqual(f.snapshot(), before);
  const result = sweep(f, { apply });
  assert.deepEqual(result.rows.map(r => r.result), ['error', 'protected', 'protected', 'canceled']);
  assert.equal(f.cell('Eye', 4, 3).f, '=42');
  assert.equal(f.cell('Eye', 5, 3).v, 'Canceled');
  assert.equal(f.state.releases, 2);
});

test('sweep validates ids and cancellation words before any mutation', t => {
  const f = fixture(t), before = f.snapshot();
  for (const cardIds of [null, 'card', [1], Array(5001).fill('x')]) assert.equal(sweep(f, { cardIds }).error, 'invalid cardIds');
  for (const words of [null, [], { boss: '' }, { boss: '  ' }, { boss: 'x'.repeat(41) }, { boss: false }, { Jez: 'Cancel' }]) {
    assert.equal(sweep(f, { cancel: words }).error, 'invalid cancel');
  }
  assert.equal(sweep(f, { apply: [42] }).error, 'invalid apply');
  assert.equal(sweep(f, { cardIds: Array(5000).fill('x') }).ok, true);
  assert.deepEqual(f.snapshot(), before);
});

test('request fields cannot bypass comparisons or activate internal writer options', t => {
  const f = fixture(t);
  f.append('boss', { task: 'Human text' });
  const before = f.snapshot();
  for (const action of ['update', 'append']) {
    const result = f.post({ action, who: 'boss', cardId: 'card-1', values: { task: 'Replace' },
      fresh: true, ignoreEmpty: true, check: true, data: {} });
    assert.equal(result.ok, true);
    assert.deepEqual(result.conflicts, [{ key: 'task', sheet: 'Human text', card: 'Replace' }]);
  }
  assert.deepEqual(f.snapshot(), before);
});

test('sync cache preserves display spaces and escaped text when later cards compare the same row', t => {
  const f = fixture(t);
  tag(f, 'Eye', 4, 'same-card');
  const results = sync(f, [card('same-card', 'junior', { status: ' Hold', notes: '=plain text' }),
    card('same-card', 'junior', { status: 'Done', notes: '=plain text' })]).results;
  assert.deepEqual(results[1].written, []);
  assert.deepEqual(results[1].conflicts, [{ key: 'status', sheet: ' Hold', card: 'Done' }]);
  assert.equal(f.cell('Eye', 4, 6).f, '');
});

test('a failed sync link tag does not fill the hand-typed row, and later cards still run', t => {
  const f = fixture(t), before = clone(f.sheets.Eye.rows);
  f.sheets.Eye.failTag = true;
  const results = sync(f, [card('link', 'junior', { task: 'File one', notes: 'Do not write' }),
    card('next', 'dew', { task: 'Newest one', status: 'Fill' })]).results;
  assert.equal(results[0].result, 'error');
  assert.match(results[0].error, /tag failed/);
  assert.equal(results[1].result, 'linked');
  assert.deepEqual(f.sheets.Eye.rows, before);
});

test('a failed tag on a newly added sync row removes that fresh row, like append does', t => {
  const f = fixture(t), before = clone(f.sheets.O.rows);
  f.sheets.O.failTag = true;
  const results = sync(f, [card('fresh', 'o', { task: 'Brand new shoot' }),
    card('other', 'boss', { task: 'Still runs' })]).results;
  assert.equal(results[0].result, 'error');
  assert.match(results[0].error, /tag failed/);
  assert.deepEqual(f.sheets.O.rows, before, 'no empty row (with copied formulas) is left behind');
  assert.equal(f.sheets.O.inserts.length, 1);
  assert.equal(f.sheets.O.deletes.length, 1);
  assert.equal(results[1].result, 'added');
});

test('sync insertion uses last used data for formulas even when tags extend into empty tail rows', t => {
  const f = fixture(t), control = fixture(t);
  for (const instance of [f, control]) {
    instance.put('Eye', 5, 6, '', '=RC[-1]+1');
    instance.put('Eye', 6, 6, '', '=RC[-1]+1');
    instance.sheets.Eye.rows.push(row([])); instance.sheets.Eye.maxRows++;
    tag(instance, 'Eye', 7, 'empty-tail');
  }
  const values = { task: 'New task', notes: 'Keep formula' };
  const before = f.snapshot(), preview = sync(f, [card('new', 'junior', values)], true);
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(preview.results[0].written, ['task']);
  sync(f, [card('new', 'junior', values)]);
  control.append('junior', values, 'new');
  assert.deepEqual(f.snapshot(), control.snapshot());
});

test('sync previews an update to its own inserted row using that row protection position', t => {
  const f = fixture(t);
  f.sheets.Dew.protections.push({ type: 'SHEET', edit: false, exceptions: [[6, 7]] });
  const cards = [card('new', 'dew', { task: 'New' }), card('new', 'dew', { status: 'Filled' })];
  const before = f.snapshot(), preview = sync(f, cards, true);
  assert.deepEqual(f.snapshot(), before);
  const applied = sync(f, cards);
  applied.results[0].row = 0;
  assert.deepEqual(preview.results, applied.results);
  assert.deepEqual(preview.results.map(r => r.result), ['added', 'updated']);
});
