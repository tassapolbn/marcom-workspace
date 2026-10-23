import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function extract(start, end) {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin);
  assert.ok(begin >= 0 && finish > begin, start + ' must exist');
  return source.slice(begin, finish);
}
const helpers = extract('function eventRefById(', 'function createTaskForEvent(');
const hub = extract('function evHubHTML(', 'function renderEvHub(');
const countdown = extract('  function renderCountdown(){', '  /* ---------- recent activity');
const workspace = extract('  function wsHeadHTML(', '  function wsTabsHTML(');
const escapeHTML = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function fixture() {
  const state = { confirms: [], toasts: [], deletes: [], restores: [], updates: [], adds: [], calls: [], tasks: {}, ok: true, fail: new Set(), closed: 0 };
  function collection(name) {
    return {
      doc: id => ({
        delete: () => {
          state.deletes.push({ name, id });
          return state.fail.has(id) ? Promise.reject(new Error('Delete failed')) : Promise.resolve();
        },
        set: data => { state.restores.push({ name, id, data: plain(data) }); return Promise.resolve(); },
        update: data => { state.updates.push({ name, id, data }); return Promise.resolve(); },
      }),
      add: data => { state.adds.push({ name, data }); return Promise.resolve(); },
    };
  }
  const context = vm.createContext({
    schoolEvents: [], eventsRef: collection('school_events'),
    DATA: Object.fromEntries(['dew', 'o', 'junior'].map(w => [w, { events: [], eventsRef: collection(w + '_events') }])),
    MEMBER_ORDER: ['boss', 'dew', 'o', 'junior'],
    tasksOf: w => state.tasks[w] || [],
    uiConfirm: options => { state.confirms.push(options); return Promise.resolve(state.ok); },
    uiToast: (message, options) => state.toasts.push({ message, options }),
    console: { error() {} }, dbSaveFailed: error => { throw error; },
    escHtml: escapeHTML, esc: escapeHTML, evTimelineMode: false, evPastOpen: {},
    evOkClr: () => false,
    document: { getElementById: id => ({ value: id === 'ev-date' ? '2099-01-01' : 'Example' }) },
    closeEventModal: () => state.closed++,
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'timestamp' } } },
    accBtn: () => 'btn-primary',
  });
  context.window = context;
  vm.runInContext(extract('function eventsOf(', 'function eventsLoadedOf('), context);
  vm.runInContext(extract('function evCountdown(', 'function evSorted('), context);
  vm.runInContext(extract('function deleteWithUndo(', '// TASK MODAL'), context);
  const realDelete = context.deleteWithUndo;
  context.deleteWithUndo = (...args) => { state.calls.push(args); return realDelete(...args); };
  vm.runInContext(helpers + hub + workspace, context);
  return { context, state };
}

test('eventRefById routes shared and every legacy member event, with shared priority', () => {
  const { context: c } = fixture();
  c.schoolEvents.push({ id: 'shared' });
  assert.equal(c.eventRefById('shared'), c.eventsRef);
  for (const member of ['dew', 'o', 'junior']) {
    c.DATA[member].events.push({ id: member }, { id: 'shared' });
    assert.equal(c.eventRefById(member), c.DATA[member].eventsRef);
  }
  assert.equal(c.eventRefById('shared'), c.eventsRef);
  assert.equal(c.eventRefById('unknown'), null);
});

test('eventLinkedWork deduplicates shared task ids and counts all workspace arrays', () => {
  const { context: c, state } = fixture();
  const task = { id: 'shared-task', __src: 'event', eventId: 'event' };
  state.tasks.boss = [task, { id: 'another-task', eventId: 'event' }];
  state.tasks.dew = [task, { id: 'unrelated', eventId: 'other' }];
  const event = { id: 'event', suppliers: [{}, {}], files: [{}], enotes: [{}, {}, {}], budget: { hsc: { items: [{}, {}] }, hsn: { items: [{}] } } };
  assert.deepEqual(plain(c.eventLinkedWork(event)), { tasks: 2, suppliers: 2, files: 1, notes: 3, budget: 3, total: 11 });
  assert.deepEqual(plain(c.eventLinkedWork({ id: 'empty' })), { tasks: 0, suppliers: 0, files: 0, notes: 0, budget: 0, total: 0 });
});

test('quick delete immediately deletes empty events and offers Undo through the correct collection', async () => {
  const { context: c, state } = fixture();
  const ev = { id: 'old', name: 'Legacy gala', date: '2099-01-01' };
  c.DATA.dew.events.push(ev);
  const result = c.quickDeleteEvent(ev.id, 'dew');
  assert.equal(typeof result.then, 'function');
  assert.equal(state.confirms.length, 0);
  assert.deepEqual(state.deletes, [{ name: 'dew_events', id: 'old' }]);
  assert.equal(await result, true);
  assert.equal(state.calls[0][0], c.DATA.dew.eventsRef);
  assert.equal(state.calls[0][2], ev);
  assert.equal(state.toasts[0].message, 'Event "Legacy gala" deleted');
  state.toasts[0].options.undo();
  assert.deepEqual(state.restores, [{ name: 'dew_events', id: 'old', data: { name: 'Legacy gala', date: '2099-01-01' } }]);
  assert.equal(await c.quickDeleteEvent('unknown', 'boss'), false);
});

test('quick delete asks once for linked work, names only nonzero counts and respects cancellation', async () => {
  const { context: c, state } = fixture();
  c.schoolEvents.push({ id: 'event', name: 'Gala', suppliers: [{}, {}], budget: { hsn: { items: [{}] } } });
  state.tasks.boss = [{ id: 'task', eventId: 'event' }];
  state.ok = false;
  assert.equal(await c.quickDeleteEvent('event', 'boss'), false);
  assert.deepEqual(state.deletes, []);
  assert.equal(state.confirms.length, 1);
  assert.deepEqual(plain(state.confirms[0]), {
    title: 'Delete "Gala"?',
    message: 'It has 1 task, 2 suppliers and a budget. The tasks stay on their boards; its workspace (suppliers, files, notes, budget) is deleted.',
    okLabel: 'Delete event', danger: true,
  });
  state.ok = true;
  assert.equal(await c.quickDeleteEvent('event', 'boss'), true);
  assert.equal(state.deletes.length, 1);
});

test('linked-work question handles singular and plural files, notes, suppliers and tasks', async () => {
  for (const count of [1, 2]) {
    const { context: c, state } = fixture();
    const items = Array.from({ length: count }, () => ({}));
    c.schoolEvents.push({ id: 'event', suppliers: items, files: items, enotes: items });
    state.tasks.boss = items.map((_, i) => ({ id: 'task-' + i, eventId: 'event' }));
    state.ok = false;
    await c.quickDeleteEvent('event', 'boss');
    const s = count === 1 ? '' : 's';
    assert.ok(state.confirms[0].message.startsWith(`It has ${count} task${s}, ${count} supplier${s}, ${count} file${s} and ${count} note${s}.`));
  }
});

test('quick delete returns false on a failed write and does not offer Undo', async () => {
  const { context: c, state } = fixture();
  c.schoolEvents.push({ id: 'fail', name: 'Fail' });
  state.fail.add('fail');
  assert.equal(await c.quickDeleteEvent('fail', 'boss'), false);
  assert.equal(state.toasts.length, 1);
  assert.equal(state.toasts[0].options, undefined);
});

test('clearPastEvents asks once, deletes only past events and restores every document without metadata', async () => {
  const { context: c, state } = fixture();
  c.schoolEvents.push({ id: 'past', name: 'Past', date: '2000-01-01', files: [{ name: 'Brief' }], __src: 'legacy' }, { id: 'future', name: 'Future', date: '2099-01-01' });
  c.schoolEvents.push({ id: 'undated', name: 'Undated' });
  c.DATA.dew.events.push({ id: 'legacy', name: 'Legacy', date: '2001-01-01', enotes: [{ text: 'Note' }] });
  assert.equal(await c.clearPastEvents('dew'), true);
  assert.equal(state.confirms.length, 1);
  assert.deepEqual(plain(state.confirms[0]), { title: 'Clear past events?', message: 'Delete 2 past events: Past, Legacy. Linked tasks stay on their boards.', okLabel: 'Delete 2 events', danger: true });
  assert.deepEqual(state.deletes, [{ name: 'school_events', id: 'past' }, { name: 'dew_events', id: 'legacy' }]);
  assert.equal(state.toasts.length, 1);
  assert.equal(state.toasts[0].message, '2 past events deleted');
  await state.toasts[0].options.undo();
  assert.deepEqual(state.restores, [
    { name: 'school_events', id: 'past', data: { name: 'Past', date: '2000-01-01', files: [{ name: 'Brief' }] } },
    { name: 'dew_events', id: 'legacy', data: { name: 'Legacy', date: '2001-01-01', enotes: [{ text: 'Note' }] } },
  ]);
});

test('bulk clear caps names at five, cancellation changes nothing, and an empty list asks nothing', async () => {
  const { context: c, state } = fixture();
  assert.equal(await c.clearPastEvents('boss'), false);
  assert.equal(state.confirms.length, 0);
  c.schoolEvents.push(...Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: 'Event ' + i, date: '2000-01-01' })));
  state.ok = false;
  assert.equal(await c.clearPastEvents('boss'), false);
  assert.equal(state.confirms[0].message, 'Delete 7 past events: Event 0, Event 1, Event 2, Event 3, Event 4 and 2 more. Linked tasks stay on their boards.');
  assert.deepEqual(state.deletes, []);
  assert.deepEqual(state.toasts, []);
});

test('a partial bulk failure still offers Undo for successfully deleted documents', async () => {
  const { context: c, state } = fixture();
  c.schoolEvents.push({ id: 'ok', name: 'OK', date: '2000-01-01' }, { id: 'fail', name: 'Fail', date: '2000-01-01' });
  state.fail.add('fail');
  assert.equal(await c.clearPastEvents('boss'), false);
  assert.equal(state.toasts[0].message, '1 past events deleted');
  await state.toasts[0].options.undo();
  assert.equal(state.restores.length, 1);
  assert.equal(state.restores[0].id, 'ok');
});

test('both hub modes isolate past chips, order each group and remember each member toggle', () => {
  const { context: c } = fixture();
  const events = [
    { id: 'old', name: 'Older past', date: '2000-01-01' },
    { id: 'later', name: 'Later future', date: '2099-02-01' },
    { id: 'recent', name: 'Recent past', date: '2001-01-01' },
    { id: 'soon', name: 'Soon future', date: '2099-01-01' },
  ];
  for (const timeline of [false, true]) {
    c.evTimelineMode = timeline;
    const html = c.evHubHTML(events, 'boss');
    const [upcoming, past] = html.split('<div class="ev-past ev-past-closed">');
    assert.ok(past);
    assert.doesNotMatch(upcoming, /Older past|Recent past|ev-chip-past/);
    assert.ok(upcoming.indexOf('Soon future') < upcoming.indexOf('Later future'));
    assert.ok(past.indexOf('Recent past') < past.indexOf('Older past'));
    assert.equal((past.match(/ev-chip-past/g) || []).length, 2);
    assert.equal((html.match(/class="ev-chip-del"/g) || []).length, 4);
    assert.match(html, /aria-expanded="false"[^>]*>Past events \(2\)/);
    assert.match(past, /Clear past events/);
    c.evPastOpen.dew = true;
    assert.match(c.evHubHTML(events, 'dew'), /<div class="ev-past">/);
    assert.match(c.evHubHTML(events, 'boss'), /ev-past-closed/);
  }
  assert.doesNotMatch(c.evHubHTML([events[1]], 'boss'), /ev-past/);
});

test('past toggle updates ARIA and uses motion when available without re-rendering', () => {
  const { context: c } = fixture();
  const changes = [];
  const container = { classList: { toggle: (...args) => changes.push(args) } };
  const button = { nextElementSibling: container, setAttribute: (name, value) => { button[name] = value; } };
  c.toggleEvPast('dew', button);
  assert.equal(button['aria-expanded'], 'true');
  assert.equal(c.evPastOpen.dew, true);
  assert.deepEqual(changes, [['ev-past-closed', false]]);
  c.MarcomMotion = { toggle: (...args) => changes.push(args) };
  c.toggleEvPast('dew', button);
  assert.equal(button['aria-expanded'], 'false');
  assert.equal(changes[1][0], container);
  assert.deepEqual(plain(changes[1].slice(1)), ['ev-past-closed', true, { reveal: ':scope>*' }]);
});

test('delete buttons escape names and ids, stop propagation, and overview keeps setHTML', () => {
  const { context: c } = fixture();
  const ev = { id: 'id\'"<&\\', name: 'Gala\'"<&', date: '2099-01-01' };
  let called, stopped = false, rendered;
  c.quickDeleteEvent = (...args) => { called = args; };
  c.event = { stopPropagation: () => { stopped = true; } };
  const html = c.evDeleteButtonHTML(ev, 'boss');
  assert.ok(html.includes('aria-label="Delete event ' + escapeHTML(ev.name) + '"'));
  vm.runInContext(decode(html.match(/onclick="([^"]+)"/)[1]), c);
  assert.equal(stopped, true);
  assert.deepEqual(called, [ev.id, 'boss']);
  c.MORDER = ['boss']; c.eOf = () => [ev]; c.dU = () => 1; c.fdt = () => 'Tomorrow';
  c.MarcomUI = { setHTML: (el, value) => { rendered = value; } };
  vm.runInContext(countdown, c);
  c.renderCountdown();
  assert.ok(rendered.endsWith(html + '</div>'));
});

test('workspace returns to event list only after a successful delete', async () => {
  const { context: c } = fixture();
  const ev = { id: 'id\'"<&', name: 'Gala', date: '2099-01-01' };
  const html = c.wsHeadHTML('boss', ev);
  const handler = decode(html.match(/class="btn btn-ghost btn-sm ews-del" onclick="([^"]+)"/)[1]);
  const back = [];
  c.evwsBack = w => back.push(w);
  c.quickDeleteEvent = (id, who) => { assert.equal(id, ev.id); assert.equal(who, 'boss'); return Promise.resolve(false); };
  await vm.runInContext(handler, c);
  assert.deepEqual(back, []);
  let finish;
  c.quickDeleteEvent = () => new Promise(resolve => { finish = resolve; });
  const pending = vm.runInContext(handler, c);
  assert.deepEqual(back, []);
  finish(true);
  await pending;
  assert.deepEqual(back, ['boss']);
});

test('dialog updates and deletes legacy events in their own collection; new events stay shared', async () => {
  const { context: c, state } = fixture();
  c.DATA.junior.events.push({ id: 'legacy', name: 'Legacy' });
  c.eventEditId = 'legacy'; c.eventModalWho = 'junior';
  vm.runInContext(extract('function saveEvent(', 'function eventRefById('), c);
  c.saveEvent();
  assert.equal(state.updates[0].name, 'junior_events');
  c.deleteEvent();
  await Promise.resolve();
  assert.deepEqual(state.deletes, [{ name: 'junior_events', id: 'legacy' }]);
  c.eventEditId = null;
  c.saveEvent();
  assert.equal(state.adds[0].name, 'school_events');
});
