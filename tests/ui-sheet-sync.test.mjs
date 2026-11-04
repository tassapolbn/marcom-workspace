import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/sheet-sync.js', import.meta.url), 'utf8');
const context = vm.createContext({window: {}});
vm.runInContext(source, context);
const sheet = context.window.MarcomSheet;
const plain = value => JSON.parse(JSON.stringify(value));
const row = (...args) => plain(sheet.rowFor(...args));
const members = ['boss', 'dew', 'o', 'junior'];
const headings = {
  boss: ['Event', 'Task 🐧', 'Status', 'Due Date', 'Assigned by', 'Note'],
  dew: ['Assigned by', 'Task', 'Priority', 'Due date', 'Status', 'Details Provided',
    'Additional Details', 'Estimate Time', 'Start', 'Finish', 'Duration (include edit)'],
  o: ['Task 📸', 'Time', 'Assigned by', 'Status', 'Date', 'Due Date', 'Photo - FIle Location',
    'FIle Location', 'Notes', 'Media', 'Upload date', 'Watermark deleting date', 'Watermark'],
  junior: ['Event', 'Task 🗃️', 'Status', 'Event owner', 'Due date 📆', 'Notes'],
};
const full = Object.freeze({
  topic: '  Open day photos  ', title: 'Old title', description: '  Brief  ', notes: '  Bring camera  ',
  dueDate: ' 2026-11-06 ', status: 'in-progress', done: true, priority: 'high', assignedBy: '  Boss  ',
  eventLabel: '  Open Day  ', eventName: 'Other event', mdEvent: 'Shoot event', dzBrand: 'School',
  mdTaken: ' 2026-11-04 ', mdStart: ' 09:00 ', mdEnd: ' 10:30 ', mdLocation: '  Photo folder  ',
  mdFile: '  File folder  ', mdCategory: ' Both ', mdUpload: ' 2026-11-07 ',
  mdWatermark: ' 2026-11-08 ', mdMailSent: true, dzStatus: ' Review ', dzRequestor: 'Dew',
});
const expected = {
  boss: {event: 'Open Day', task: 'Open day photos', status: 'In progress',
    'due date': {date: '2026-11-06'}, 'assigned by': 'Boss', note: 'Brief\n\nBring camera'},
  junior: {event: 'Open Day', task: 'Open day photos', status: 'In progress',
    'event owner': 'Boss', 'due date': {date: '2026-11-06'}, notes: 'Brief\n\nBring camera'},
  dew: {'assigned by': 'Boss', task: 'Open day photos', priority: 'High',
    'due date': {date: '2026-11-06'}, status: 'Waiting for response',
    'details provided': 'Brief', 'additional details': 'Bring camera'},
  o: {task: 'Open day photos', time: '09:00 - 10:30', 'assigned by': 'Boss', status: 'In progress',
    date: {date: '2026-11-04'}, 'due date': {date: '2026-11-06'}, 'photo file location': 'Photo folder',
    'file location': 'File folder', notes: 'ส่งเมลแล้ว', media: 'Photo&VDO',
    'upload date': {date: '2026-11-07'}, 'watermark deleting date': {date: '2026-11-08'}},
};

test('exports only the requested API and tabs', () => {
  assert.deepEqual(Object.keys(sheet).sort(),
    ['TABS', 'cleanHeading', 'memberFor', 'statusWord', 'cancelWord', 'rowFor', 'forAppend', 'changes'].sort());
  assert.deepEqual(plain(sheet.TABS), {boss: 'Boss', dew: 'Dew', o: 'O', junior: 'Eye'});
});

for (const member of members) {
  test(`${member}: full card produces exactly the requested columns`, () => {
    const snapshot = JSON.stringify(full);
    assert.deepEqual(row(full, member), {member, tab: sheet.TABS[member], values: expected[member]});
    assert.equal(JSON.stringify(full), snapshot);
  });
}

const statuses = ['pending', 'in-progress', 'waiting', 'on-hold', 'done', 'canceled'];
const statusWords = {
  boss: ['Not started', 'In progress', 'Waiting for approval', 'On hold', 'Completed', 'Canceled'],
  junior: ['Not started', 'In progress', 'Waiting for approval', 'On hold', 'Completed', 'Canceled'],
  o: ['Not started', 'In progress', 'Blocked', 'Blocked', 'Completed', 'CANCELLED'],
  dew: ['Ready to do!', 'In progress', 'Waiting for response', ' Hold', 'Completed', 'Cancel'],
};
for (const member of members) {
  for (const [index, status] of statuses.entries()) {
    test(`${member}: ${status} uses its exact menu word`, () => {
      assert.equal(sheet.statusWord({status}, member), statusWords[member][index]);
      assert.equal(row({status}, member).values.status, statusWords[member][index]);
    });
  }
  test(`${member}: missing and unknown statuses, done flag and cancellation`, () => {
    assert.equal(sheet.statusWord({}, member), statusWords[member][0]);
    assert.equal(sheet.statusWord({done: true}, member), 'Completed');
    assert.equal(sheet.statusWord({done: false}, member), statusWords[member][0]);
    assert.equal(sheet.statusWord({status: 'unknown', done: true}, member), statusWords[member][0]);
    assert.equal(sheet.statusWord({status: 'pending', done: true}, member), statusWords[member][0]);
    assert.equal(sheet.cancelWord(member), statusWords[member][5]);
  });
}

const stages = {
  'Waiting for Brief': 'Information needed', 'Brief Received': 'Ready to do!',
  'In Progress': 'In progress', Review: 'Waiting for response', 'Revision Required': 'Edit',
  Approved: 'File Prepared ', Delivered: 'Completed',
};
for (const [dzStatus, word] of Object.entries(stages)) {
  test(`Dew design stage: ${dzStatus}, with terminal and hold overrides`, () => {
    for (const status of ['pending', 'in-progress', 'waiting', 'unknown']) {
      assert.equal(sheet.statusWord({status, dzStatus}, 'dew'), word);
      assert.equal(row({status, dzStatus}, 'dew').values.status, word);
    }
    for (const status of ['on-hold', 'canceled', 'done']) {
      assert.equal(sheet.statusWord({status, dzStatus}, 'dew'), statusWords.dew[statuses.indexOf(status)]);
    }
    assert.equal(sheet.statusWord({done: true, dzStatus}, 'dew'), 'Completed');
    for (const member of ['boss', 'o', 'junior']) {
      assert.equal(sheet.statusWord({status: 'pending', dzStatus}, member), 'Not started');
    }
  });
}
test('unknown design stages leave the app status intact', () => {
  for (const dzStatus of ['Unknown', 'constructor', '__proto__', '']) {
    assert.equal(sheet.statusWord({status: 'waiting', dzStatus}, 'dew'), 'Waiting for response');
  }
});

test('shared cards go only to their first assignee or their older owner', () => {
  const task = {__src: 'event', assignees: ['dew', 'o', 'junior'], owner: 'boss'};
  for (const who of members) {
    assert.equal(sheet.memberFor(task, who), 'dew');
    assert.equal(row(task, who).tab, 'Dew');
  }
  assert.equal(sheet.memberFor({assignees: ['dew', 'o']}, 'boss'), 'dew');
  assert.equal(row({__src: 'event', assignees: []}, 'boss'), null);
  assert.equal(sheet.memberFor({__src: 'event'}, 'boss'), '');
  assert.equal(row({__src: 'event', owner: 'o'}, 'boss').tab, 'O');
  assert.equal(row({__src: 'event', assignees: [], owner: 'o'}, 'boss').tab, 'O');
  assert.equal(row({owner: 'o'}, 'boss').member, 'boss');
  assert.equal(row({assignees: []}, 'boss').member, 'boss');
  assert.equal(row(task, 'boss', 'junior').tab, 'Eye');
  assert.equal(row({__src: 'event'}, '', 'o').tab, 'O');
  for (const unknown of ['', 'nobody', 'constructor', '__proto__', null]) {
    assert.equal(sheet.memberFor({assignees: [unknown, 'dew'], owner: 'o'}, 'boss'), '');
    assert.equal(row({assignees: [unknown, 'dew']}, 'boss'), null);
    assert.equal(row({__src: 'event', owner: unknown}, 'boss'), null);
    assert.equal(row({}, unknown), null);
    assert.equal(row(task, 'boss', unknown), null);
  }
});

test('empty cards include every column, with the specified status and priority defaults', () => {
  for (const member of members) {
    const empty = Object.fromEntries(Object.keys(expected[member]).map(key => [key, '']));
    empty.status = statusWords[member][0];
    if (member === 'dew') empty.priority = 'Medium';
    const values = sheet.rowFor({}, member).values;
    assert.ok(Object.values(values).every(value => value !== undefined));
    assert.deepEqual(plain(values), empty);
    assert.deepEqual(row(null, member).values, empty);
  }
});

test('dates require YYYY-MM-DD and use the Apps Script date wrapper', () => {
  for (const value of ['', '2026-1-04', '04/11/2026', '2026-11-04T10:00:00Z', 'tomorrow', null, undefined]) {
    for (const member of members) assert.equal(row({dueDate: value}, member).values['due date'], '');
    const values = row({mdTaken: value, mdUpload: value, mdWatermark: value}, 'o').values;
    for (const key of ['date', 'upload date', 'watermark deleting date']) assert.equal(values[key], '');
  }
  assert.deepEqual(row({dueDate: '2026-11-04'}, 'boss').values['due date'], {date: '2026-11-04'});
});

test('title and event fallbacks use the first non-empty trimmed text', () => {
  assert.equal(row({topic: ' ', title: ' Older title '}, 'boss').values.task, 'Older title');
  const fields = ['eventLabel', 'eventName', 'mdEvent', 'dzBrand'];
  for (let i = 0; i < fields.length; i++) {
    const task = Object.fromEntries(fields.map((key, j) => [key, j < i ? ' ' : ` ${key} `]));
    for (const member of ['boss', 'junior']) assert.equal(row(task, member).values.event, fields[i]);
  }
});

test('notes join non-empty text with a blank line and Dew keeps the two fields separate', () => {
  for (const [description, notes, joined] of [
    [' Brief ', ' Notes ', 'Brief\n\nNotes'], [' Brief ', '', 'Brief'],
    ['', ' Notes ', 'Notes'], ['  ', ' \n ', ''],
  ]) {
    const task = {description, notes};
    assert.equal(row(task, 'boss').values.note, joined);
    assert.equal(row(task, 'junior').values.notes, joined);
    const dew = row(task, 'dew').values;
    assert.equal(dew['details provided'], description.trim());
    assert.equal(dew['additional details'], notes.trim());
  }
  assert.equal(row({description: ' Brief '}, 'boss').values.note, 'Brief');
  assert.equal(row({notes: ' Notes '}, 'junior').values.notes, 'Notes');
});

test('O time, sent mail and media values', () => {
  for (const [mdStart, mdEnd, time] of [
    [' 09:00 ', ' 10:00 ', '09:00 - 10:00'], ['09:00', '', '09:00'], ['', '', ''], ['', '10:00', ''],
  ]) assert.equal(row({mdStart, mdEnd}, 'o').values.time, time);
  assert.equal(row({mdMailSent: true}, 'o').values.notes, 'ส่งเมลแล้ว');
  assert.equal(row({mdMailSent: false, notes: 'Not mail'}, 'o').values.notes, '');
  for (const [mdCategory, media] of [['Photos', 'Photo'], ['Videos', 'Video'], ['Both', 'Photo&VDO'],
    ['Unknown', ''], ['', '']]) assert.equal(row({mdCategory}, 'o').values.media, media);
});

test('Dew requestor fallback and priorities', () => {
  assert.equal(row({assignedBy: ' ', dzRequestor: ' Teacher '}, 'dew').values['assigned by'], 'Teacher');
  assert.equal(row({dzRequestor: ' Teacher '}, 'dew').values['assigned by'], 'Teacher');
  assert.equal(row({assignedBy: ' Boss ', dzRequestor: 'Teacher'}, 'dew').values['assigned by'], 'Boss');
  for (const [priority, word] of [['high', 'High'], ['low', 'Low'], ['medium', 'Medium'],
    ['normal', 'Medium'], [undefined, 'Medium'], ['unknown', 'Medium']]) {
    assert.equal(row({priority}, 'dew').values.priority, word);
  }
});

test('forAppend copies values and drops only empty strings', () => {
  const values = Object.freeze({task: 'Title', notes: '', date: {date: '2026-11-04'},
    status: ' Hold', zero: 0, flag: false, nullable: null, whitespace: ' '});
  const result = sheet.forAppend(values);
  assert.notEqual(result, values);
  assert.deepEqual(plain(result), {task: 'Title', date: {date: '2026-11-04'},
    status: ' Hold', zero: 0, flag: false, nullable: null, whitespace: ' '});
  assert.equal(values.notes, '');
  assert.deepEqual(plain(sheet.forAppend({})), {});
});

test('changes sends only changed cells, including cleared dates and text', () => {
  for (const member of members) {
    const before = Object.freeze({topic: 'Task', status: 'pending', assignees: ['o']});
    assert.deepEqual(plain(sheet.changes(before, {...before, status: 'done'}, member)), {status: 'Completed'});
    const dated = {...before, dueDate: '2026-11-06'};
    assert.deepEqual(plain(sheet.changes(before, dated, member)), {'due date': {date: '2026-11-06'}});
    assert.deepEqual(plain(sheet.changes(dated, before, member)), {'due date': ''});
    assert.deepEqual(plain(sheet.changes(dated, {...dated, dueDate: ''}, member)), {'due date': ''});
    assert.deepEqual(plain(sheet.changes(dated, {...dated}, member)), {});
    assert.deepEqual(plain(sheet.changes(before, {...before, topic: ' Task ', irrelevant: true}, member)), {});
    assert.deepEqual(plain(sheet.changes(before, {...before, topic: ''}, member)), {task: ''});
  }
  for (const member of ['unknown', 'constructor', '__proto__', '', null, undefined]) {
    assert.deepEqual(plain(sheet.changes({}, full, member)), {});
  }
});

test('heading cleaning stays identical to the Apps Script', () => {
  const script = readFileSync(new URL('../google-apps-script/marcom-sheet-sync.gs', import.meta.url), 'utf8');
  const scriptContext = vm.createContext({});
  vm.runInContext(script, scriptContext);
  for (const heading of [...Object.values(headings).flat(), 'ASSIGNED BY', 'Duration (include edit)',
    'Task List 👽🛸\nTeam Task Board', '  งาน ภาษาไทย 123 - ABC  ']) {
    assert.equal(sheet.cleanHeading(heading), scriptContext.cleanHeading_(heading), heading);
  }
  assert.equal(sheet.cleanHeading('Due date 📆'), 'due date');
  assert.equal(sheet.cleanHeading('Photo - FIle Location'), 'photo file location');
  assert.equal(sheet.cleanHeading('Task List 👽🛸\nTeam Task Board'), 'task list team task board');
});

test('every produced key has a column in its destination tab', () => {
  for (const member of members) {
    const columns = headings[member].map(heading => sheet.cleanHeading(heading));
    for (const task of [{}, full]) {
      for (const key of Object.keys(row(task, member).values)) assert.ok(columns.includes(key), `${member}: ${key}`);
    }
  }
});
