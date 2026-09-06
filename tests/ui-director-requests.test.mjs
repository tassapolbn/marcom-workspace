/* The Director-request block inside index.html, exercised with stubs.
   It never touches Firebase, the network or a real browser. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const block = source.match(/<script id="dirq-script">([\s\S]*?)<\/script>/)?.[1];
assert.ok(block, 'The Director-request block must exist in index.html');

function harness(current = { role: 'admin', email: 'boss@headstartphuket.com' }) {
  const state = { snapshot: null, updates: [], toasts: [], events: [], repaints: 0 };
  const notesDoc = id => ({
    update: patch => { state.updates.push({ id, patch }); return Promise.resolve(); }
  });
  const collection = name => ({
    where: (field, op, value) => ({
      onSnapshot: (next, fail) => { state.snapshot = next; state.query = { name, field, op, value }; state.fail = fail; return () => {}; }
    }),
    doc: id => (name === 'director_notes' ? notesDoc(id) : { update: () => Promise.resolve() })
  });
  const sandbox = {
    console,
    __cur: current,
    MEMBER_ORDER: ['boss', 'dew', 'o', 'junior'],
    escHtml: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    fmtDate: d => String(d || ''),
    isEventTask: t => Boolean(t && t.__src === 'event'),
    memberName: w => ({ boss: 'Boss', dew: 'Dew', o: 'O', junior: 'Eye' })[w] || w,
    uiToast: text => state.toasts.push(text),
    whenAuthed: fn => fn(),
    renderBoss: () => { state.repaints += 1; },
    renderMember: () => { state.repaints += 1; },
    Event: class { constructor(type) { this.type = type; } },
    dispatchEvent: event => state.events.push(event.type),
    document: { readyState: 'complete', addEventListener: () => {} },
    firebase: { firestore: Object.assign(() => ({ collection }), { FieldValue: { serverTimestamp: () => 'server-timestamp' } }) },
    /* The card markup this block decorates, shortened to its shape. */
    taskCardHTML: (task, who) => '<div class="task-card tc-pending" data-id="' + task.id + '" data-who="' + who + '">'
      + '<div class="task-topic">' + task.topic + '</div>'
      + '<i class="ti ti-arrow-up-right tc-open-hint" aria-hidden="true"></i></div>'
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(block, context);
  return { context, state };
}

const note = (over = {}) => Object.assign({
  status: 'new', taskKey: 'boss_tasks/t1', taskTopic: 'Newsletter',
  sentence: 'Please prioritise this task', actionLabel: 'Please prioritise this task',
  from: 'Khun Miki', note: '', owners: ['boss'], createdAtIso: '2026-09-06T04:00:00.000Z'
}, over);

function deliver(state, notes) {
  state.snapshot({ docs: notes.map((data, index) => ({ id: 'n' + index, data: () => data })) });
}

test('the listener asks only for requests that are still open', () => {
  const { state } = harness();
  assert.deepEqual(state.query, { name: 'director_notes', field: 'status', op: '==', value: 'new' });
});

test('a request is drawn on its own card only, and the board is redrawn', () => {
  const { context, state } = harness();
  deliver(state, [note()]);
  assert.ok(state.repaints > 0);
  assert.ok(state.events.includes('uxp-rccounts'));
  const mine = context.taskCardHTML({ id: 't1', topic: 'Newsletter' }, 'boss');
  assert.match(mine, /Director request/);
  assert.match(mine, /Please prioritise this task/);
  assert.match(mine, /class="task-card has-dirq /);
  /* The panel sits inside the card, before the card's own trailing hint. */
  assert.ok(mine.indexOf('dirq') < mine.indexOf('tc-open-hint'));
  const other = context.taskCardHTML({ id: 't2', topic: 'Something else' }, 'boss');
  assert.doesNotMatch(other, /Director request/);
  const otherPerson = context.taskCardHTML({ id: 't1', topic: 'Newsletter' }, 'dew');
  assert.doesNotMatch(otherPerson, /Director request/);
});

test('a shared event card is matched on the shared collection, not the member one', () => {
  const { context, state } = harness();
  deliver(state, [note({ taskKey: 'event_tasks/e1', owners: ['boss', 'dew'] })]);
  const shared = context.taskCardHTML({ id: 'e1', topic: 'Open Day', __src: 'event' }, 'dew');
  assert.match(shared, /Director request/);
  const notShared = context.taskCardHTML({ id: 'e1', topic: 'Open Day' }, 'dew');
  assert.doesNotMatch(notShared, /Director request/);
});

test('request text from outside cannot inject markup into a card', () => {
  const { context, state } = harness();
  deliver(state, [note({ sentence: '<img src=x onerror="alert(1)">', from: '"><b>x', note: '</div><script>bad()' })]);
  const card = context.taskCardHTML({ id: 't1', topic: 'Newsletter' }, 'boss');
  assert.doesNotMatch(card, /<img src=x/);
  assert.doesNotMatch(card, /<b>x/);
  assert.doesNotMatch(card, /<script>bad/);
  assert.match(card, /&lt;img src=x/);
});

test('two requests on one card are listed together and counted', () => {
  const { context, state } = harness();
  deliver(state, [note(), note({ sentence: 'Needs discussion on this task' })]);
  const card = context.taskCardHTML({ id: 't1', topic: 'Newsletter' }, 'boss');
  assert.match(card, /Director requests/);
  assert.match(card, /class="dirq-n">2</);
  assert.match(card, /Needs discussion on this task/);
});

test('the admin sees every request in the bell; a member sees only their own', () => {
  const admin = harness();
  deliver(admin.state, [note(), note({ taskKey: 'dew_tasks/d1', owners: ['dew'], taskTopic: 'Poster' })]);
  assert.equal(admin.context.dirqItems().length, 2);
  assert.equal(admin.context.dirqItems()[0].g, 'Director requests');
  assert.equal(admin.context.dirqItems()[1].go, 'dew');

  const designer = harness({ role: 'designer', workspace: 'dew', email: 'dew@headstartphuket.com' });
  deliver(designer.state, [note(), note({ taskKey: 'dew_tasks/d1', owners: ['dew'], taskTopic: 'Poster' })]);
  const items = designer.context.dirqItems();
  assert.equal(items.length, 1);
  assert.match(items[0].s, /Poster/);
  /* And the request addressed to someone else stays off the designer's card. */
  assert.doesNotMatch(designer.context.taskCardHTML({ id: 't1', topic: 'Newsletter' }, 'boss'), /Director request/);
});

test('closing a request writes the three handled fields and nothing else', () => {
  const { context, state } = harness();
  deliver(state, [note()]);
  context.dirqHandled('n0');
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].id, 'n0');
  assert.deepEqual(Object.keys(state.updates[0].patch).sort(), ['handledAt', 'handledBy', 'status']);
  assert.equal(state.updates[0].patch.status, 'done');
  assert.equal(state.updates[0].patch.handledBy, 'boss@headstartphuket.com');
  context.dirqHandled('');
  assert.equal(state.updates.length, 1);
});

test('the newest request is listed first', () => {
  const { context, state } = harness();
  deliver(state, [
    note({ sentence: 'Older', createdAtIso: '2026-09-01T04:00:00.000Z' }),
    note({ sentence: 'Newer', createdAtIso: '2026-09-06T04:00:00.000Z' })
  ]);
  const card = context.taskCardHTML({ id: 't1', topic: 'Newsletter' }, 'boss');
  assert.ok(card.indexOf('Newer') < card.indexOf('Older'));
});
