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
  /* Text in an event's colour (step 46); colours stay ignored here, since evOkClr is stubbed. */
  vm.runInContext(extract('function evInk(', 'const EV_TEXT_COLORS'), context);
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

test('a chip with its own text colour is marked as a coloured tile', () => {
  const { context: c } = fixture();
  /* The real colour helpers, instead of the stub that ignores colours. */
  vm.runInContext(extract('function evOkClr(', 'const EV_TEXT_COLORS'), c);
  const html = c.evHubHTML([
    { id: 'tile', name: 'Tile', date: '2099-01-01', color: '#d6336c', textColor: '#ffffff' },
    { id: 'tint', name: 'Tint', date: '2099-01-02', color: '#0d9488' },
    { id: 'plain', name: 'Plain', date: '2099-01-03' },
  ], 'boss');
  const chip = name => html.split('<div class="ev-chip ').find(part => part.includes('>' + name + '<'));
  assert.match(chip('Tile'), /^evt-\w+ ev-chip-filled"/, 'a fill with its own text colour');
  assert.match(chip('Tile'), /background:linear-gradient\(180deg,#d6336c,rgba\(214,51,108,0\.86\)\)/);
  assert.match(chip('Tile'), /class="ev-chip-name" style="color:#ffffff;"/);
  assert.doesNotMatch(chip('Tint'), /ev-chip-filled/, 'a colour alone stays a flat row in light mode');
  assert.match(chip('Tint'), /border-top-color:#0d9488/);
  assert.doesNotMatch(chip('Plain'), /ev-chip-filled|style=/);
});

/* Step 46: an event colour used as text reads on white in light mode. */
const lum = hex => hex.slice(1).match(/../g).map(h => parseInt(h, 16) / 255)
  .map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const onWhite = hex => 1.05 / (lum(hex) + 0.05);
const presets = JSON.parse(source.match(/const EV_COLORS=(\[[^\]]+\])/)[1].replace(/'/g, '"'));

test('every event colour has a shade that reads on white, and a readable colour stays as chosen', () => {
  const { context: c } = fixture();
  vm.runInContext(extract('function evOkClr(', 'const EV_TEXT_COLORS'), c);
  assert.equal(presets.length, 10);
  for (const hex of presets.concat(['#ffff00', '#4B8FD0', '#ffffff'])) {
    const ink = c.evInk(hex);
    assert.ok(onWhite(ink) >= 4.5, hex + ' -> ' + ink + ' reads at ' + onWhite(ink).toFixed(2));
    if (onWhite(hex) >= 4.5) assert.equal(ink, hex, hex + ' already reads, so it is kept');
    else {
      const a = hex.slice(1).match(/../g).map(h => parseInt(h, 16)), b = ink.slice(1).match(/../g).map(h => parseInt(h, 16));
      assert.ok(b.every((v, i) => v <= a[i]), ink + ' is a darker shade of ' + hex);
      const k = Math.max(...b) / Math.max(...a);
      assert.ok(b.every((v, i) => Math.abs(v - a[i] * k) <= 1), ink + ' keeps the hue of ' + hex);
    }
  }
  assert.equal(c.evTextAttrs('ov-cdn-n', ''), ' class="ov-cdn-n"');
  assert.match(c.evTextAttrs('ov-cdn-n', '#1f3a5f'), /^ class="ov-cdn-n ev-ink-d" style="color:#1f3a5f;--evc-ink-d:#[0-9a-f]{6};"$/,
    'navy reads on white, so no light-mode shade (its dark-mode shade is step 57)');
  assert.match(c.evTextAttrs('ev-tl-name', '#e6a417'), /^ class="ev-tl-name ev-ink" style="color:#e6a417;--evc-ink:#[0-9a-f]{6};"$/);
});

/* Step 57: the same in dark mode, against the dark card (#161a24, #242831 on hover). */
const ratio = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };

test('every event colour has a shade that reads on the dark card, and a readable colour stays as chosen', () => {
  const { context: c } = fixture();
  vm.runInContext(extract('function evOkClr(', 'const EV_TEXT_COLORS'), c);
  for (const hex of presets.concat(['#000000', '#7a5c1e', '#c8553d', '#ffffff'])) {
    const ink = c.evInkDark(hex);
    for (const card of ['#242831', '#161a24'])
      assert.ok(ratio(ink, card) >= 4.5, hex + ' -> ' + ink + ' reads at ' + ratio(ink, card).toFixed(2) + ' on ' + card);
    if (ratio(hex, '#242831') >= 4.5) assert.equal(ink, hex, hex + ' already reads, so it is kept');
    else {
      const a = hex.slice(1).match(/../g).map(h => parseInt(h, 16)), b = ink.slice(1).match(/../g).map(h => parseInt(h, 16));
      assert.ok(b.every((v, i) => v >= a[i]), ink + ' is a lighter shade of ' + hex);
      const i0 = a.indexOf(Math.min(...a)), k = (255 - b[i0]) / (255 - a[i0]);
      assert.ok(b.every((v, i) => Math.abs((255 - v) - (255 - a[i]) * k) <= 1), ink + ' keeps the hue of ' + hex);
    }
  }
  assert.match(c.evTextAttrs('ev-tl-name', '#e05a3d'), /^ class="ev-tl-name ev-ink ev-ink-d" style="color:#e05a3d;--evc-ink:#[0-9a-f]{6};--evc-ink-d:#[0-9a-f]{6};"$/,
    'coral needs a darker shade on white and a lighter one on the dark card');
  assert.doesNotMatch(c.evTextAttrs('ov-cdn-n', '#e6a417'), /ev-ink-d/, 'amber already reads on the dark card');
});

test('the Timeline names and the Overview countdown numbers use the readable shade', () => {
  const { context: c } = fixture();
  vm.runInContext(extract('function evOkClr(', 'const EV_TEXT_COLORS'), c);
  c.evTimelineMode = true;
  const amber = { id: 'a', name: 'Teacher Day', date: '2099-01-01', color: '#e6a417' };
  const navy = { id: 'n', name: 'Concert', date: '2099-01-02', color: '#1f3a5f' };
  const html = c.evHubHTML([amber, navy], 'boss');
  assert.match(html, /<div class="ev-tl-name ev-ink" style="color:#e6a417;--evc-ink:#[0-9a-f]{6};">Teacher Day</, 'a light colour gets its darker shade');
  assert.match(html, /<div class="ev-tl-name ev-ink-d" style="color:#1f3a5f;--evc-ink-d:#[0-9a-f]{6};">Concert</, 'a dark colour keeps its colour in light mode');
  assert.match(html, /class="ev-tl-dot evu-\w+" style="color:#e6a417;"/, 'the dot keeps the colour as chosen');
  let rendered;
  c.MORDER = ['boss']; c.eOf = () => [amber, navy]; c.dU = () => 3; c.fdt = () => 'Soon';
  c.MarcomUI = { setHTML: (el, value) => { rendered = value; } };
  c.document = { getElementById: () => ({}) };
  vm.runInContext(countdown, c);
  c.renderCountdown();
  assert.match(rendered, /<div class="ov-cdn-n ev-ink" style="color:#e6a417;--evc-ink:#[0-9a-f]{6};">3</);
  assert.match(rendered, /<div class="ov-cdn-n ev-ink-d" style="color:#1f3a5f;--evc-ink-d:#[0-9a-f]{6};">3</);
});

