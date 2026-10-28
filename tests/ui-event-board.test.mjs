import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/event-board.js', import.meta.url), 'utf8');
const context = vm.createContext({window: {}});
vm.runInContext(source, context);
const groups = (tasks, opts) => JSON.parse(JSON.stringify(context.window.MarcomEventBoard.groups(tasks, opts)));
const task = (title, eventLabel, status = 'pending', dueDate = '', owner = 'boss') =>
  ({title, eventLabel, status, dueDate, owner});
const sample = [
  task('Welcome packs', 'School Open Day', 'pending', '2026-11-02', ''),
  task('Campaign', 'School Open Day', 'in-progress', '2026-11-01'),
  task('Venue', 'School Open Day', 'done', '2026-10-01'),
  task('Extra banners', 'School Open Day', 'canceled', '2026-10-02', ''),
  task('Recap', 'Christmas Fair', 'done', '2026-09-01'),
];

test('finished tasks and finished-only events are hidden by default, but counted', () => {
  const result = groups(sample);
  assert.deepEqual(result.groups.map(g => g.label), ['School Open Day']);
  assert.deepEqual(result.groups[0].tasks.map(t => t.title), ['Welcome packs', 'Campaign']);
  assert.equal(result.groups[0].open, 2);
  assert.equal(result.groups[0].done, 2);
  assert.equal(result.groups[0].nextDue, '2026-11-01');
  assert.equal(result.finishedCount, 3);
});

test('showDone includes done and canceled tasks with the same finished total', () => {
  const result = groups(sample, {showDone: true});
  assert.equal(result.groups.length, 2);
  assert.equal(result.groups[0].tasks.length, 4);
  assert.equal(result.groups[1].open, 0);
  assert.equal(result.groups[1].done, 1);
  assert.equal(result.groups[1].nextDue, '');
  assert.equal(result.finishedCount, groups(sample, {showDone: false}).finishedCount);
  assert.equal(result.finishedCount, 3);
});

test('groups sort by next unfinished due date, then label, with undated groups last', () => {
  const result = groups([
    task('No date', 'Zebra'), task('No date', 'Other'),
    task('Late', 'Alpha', 'waiting', '2026-12-01'),
    task('Soon', 'Bravo', 'on-hold', '2026-11-01'),
    task('Soon', 'Apple', 'pending', '2026-11-01'),
    task('Old', 'Alpha', 'done', '2020-01-01'),
  ]);
  assert.deepEqual(result.groups.map(g => g.label), ['Apple', 'Bravo', 'Alpha', 'Other', 'Zebra']);
});

test('unassigned tasks sort first, then due date and title; only open tasks count as unassigned', () => {
  const tasks = [
    task('Undated', 'Event'), task('B', 'Event', 'waiting', '2026-11-01'),
    task('A', 'Event', 'on-hold', '2026-11-01'),
    task('Unassigned', 'Event', 'pending', '', ''),
    {...task('Canceled', 'Event', 'canceled', '2026-10-01', ''), assignees: []},
    {...task('Array owner', 'Event', 'pending', '2026-11-02', ''), assignees: ['dew']},
  ];
  const before = JSON.stringify(tasks);
  const result = groups(tasks, {showDone: true}).groups[0];
  assert.deepEqual(result.tasks.map(t => t.title), ['Canceled', 'Unassigned', 'A', 'B', 'Array owner', 'Undated']);
  assert.equal(result.unassigned, 1);
  assert.equal(JSON.stringify(tasks), before, 'input order and tasks stay untouched');
  const override = groups(tasks, {assignees: t => t.title === 'A' ? [] : ['junior']}).groups[0];
  assert.equal(override.tasks[0].title, 'A');
  assert.equal(override.unassigned, 1);
});

test('filter limits tasks and finished counts to the exact event label', () => {
  const result = groups(sample, {filter: 'School Open Day', showDone: true});
  assert.deepEqual(result.groups.map(g => g.label), ['School Open Day']);
  assert.equal(result.finishedCount, 2);
  assert.deepEqual(groups(sample, {filter: 'Christmas Fair'}), {groups: [], finishedCount: 1});
  assert.deepEqual(groups(sample, {filter: 'Missing'}), {groups: [], finishedCount: 0});
});

test('empty labels use Other and object-property labels are safe', () => {
  const result = groups([task('Blank', ''), task('Prototype', '__proto__'), task('Constructor', 'constructor')]);
  assert.equal(result.groups.length, 3);
  assert.equal(result.groups.find(g => g.label === 'Other').open, 1);
  assert.deepEqual(groups([]), {groups: [], finishedCount: 0});
});

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const eventScript = page.match(/<script id="evt-script">([\s\S]*?)<\/script>/)[1];
const renderScript = readFileSync(new URL('../assets/ui-render.js', import.meta.url), 'utf8');
const escapeHTML = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function boardFixture(saved = {}, blockedStorage = false) {
  const nodes = {}, timers = [], motions = [];
  function node(tagName = 'DIV') {
    let html = '';
    return {
      tagName, writes: 0, listeners: {}, children: [], attributes: {},
      get innerHTML() { return html; },
      set innerHTML(value) { html = value; this.writes++; },
      contains(child) { return this === child || this.children.some(n => n.contains(child)); },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      querySelector(selector) { return nodes[selector.slice(1)]; },
      querySelectorAll() { return this.children; },
      getAttribute(key) { return this.attributes[key]; },
      setAttribute(key, value) { this.attributes[key] = value; },
    };
  }
  const body = nodes['evb-body'] = node();
  const filter = nodes['evb-filter'] = node('SELECT');
  const checkbox = nodes['evb-show-done'] = node('INPUT');
  nodes['evb-done-count'] = node('SPAN');
  const card = node();
  card.children = [body, filter, checkbox];
  const main = {insertBefore(c) { nodes[c.id] = c; checkbox.checked = c.innerHTML.includes('id="evb-show-done" checked'); }};
  const document = {
    readyState: 'loading', activeElement: null, addEventListener() {},
    querySelector: () => main, getElementById: id => nodes[id], createElement: () => card,
  };
  const c = vm.createContext({
    document, eventTasks: sample.map((t, i) => ({...t, id: String(i)})),
    localStorage: {
      getItem(key) { if (blockedStorage) throw Error('Storage blocked'); return saved[key] ?? null; },
      setItem(key, value) { if (blockedStorage) throw Error('Storage blocked'); saved[key] = value; },
    },
    setTimeout: fn => timers.push(fn), escHtml: escapeHTML, memberName: w => w,
    taskAssignees: t => t.assignees || (t.owner ? [t.owner] : []),
    fmtDate: d => d, SC: {}, MEMBER_ORDER: ['boss', 'dew', 'o', 'junior'], eventsOf: () => [],
    MarcomMotion: {toggle: (...args) => motions.push(args)},
  });
  c.window = c;
  vm.runInContext(source + renderScript + eventScript, c);
  return {c, nodes, body, filter, checkbox, card, saved, motions, node,
    flush() { while (timers.length) timers.shift()(); }};
}

test('refresh preserves identical DOM and defers changed content while either select has focus', () => {
  for (const focusFilter of [false, true]) {
    const h = boardFixture();
    h.c.evbRender();
    const initial = h.body.innerHTML;
    h.c.evbRender();
    assert.equal(h.body.writes, 1);
    assert.equal(h.filter.writes, 1);
    const assign = h.node('SELECT');
    h.body.children.push(assign);
    h.c.document.activeElement = focusFilter ? h.filter : assign;
    h.c.eventTasks.push(task('New task', 'New event'));
    h.c.evbRender();
    assert.equal(h.body.innerHTML, initial);
    assert.equal(h.filter.writes, 1);
    h.c.document.activeElement = h.checkbox;
    h.card.listeners.focusout(); h.flush();
    assert.equal(h.body.innerHTML, initial, 'moving inside the card keeps the render pending');
    h.c.document.activeElement = null;
    h.card.listeners.focusout(); h.flush();
    assert.match(h.body.innerHTML, /New task/);
    assert.equal(h.body.writes, 2);
    assert.equal(h.filter.writes, 2);
  }
});

test('folds, completed switch and show-more survive renders, with safe quoted event handlers', () => {
  const label = 'Parents\' "Welcome" <Day>\\';
  const h = boardFixture();
  h.c.eventTasks = Array.from({length: 7}, (_, i) => task('Task ' + i, label, i === 6 ? 'done' : 'pending'));
  h.c.evbRender();
  assert.match(h.body.innerHTML, /evb-g-closed/);
  assert.equal((h.body.innerHTML.match(/class="evb-row"/g) || []).length, 5);
  assert.match(h.body.innerHTML, /Show 1 more/);
  assert.equal(h.nodes['evb-done-count'].textContent, '1');
  const wrapper = h.node(), header = h.node('BUTTON');
  wrapper.attributes['data-label'] = label;
  wrapper.querySelector = () => header;
  h.body.children = [wrapper];
  vm.runInContext(decode(h.body.innerHTML.match(/onclick="(evbToggle[^\"]+)"/)[1]), h.c);
  assert.equal(header.attributes['aria-expanded'], 'true');
  assert.equal(h.motions[0][0], wrapper);
  assert.equal(h.motions[0][1], 'evb-g-closed');
  assert.equal(h.motions[0][2], false);
  assert.equal(h.motions[0][3].reveal, ':scope>.evb-g-b');
  assert.equal(JSON.parse(h.saved.evb_open)[label], true);
  vm.runInContext(decode(h.body.innerHTML.match(/onclick="(evbShowMore[^\"]+)"/)[1]), h.c);
  assert.equal((h.body.innerHTML.match(/class="evb-row"/g) || []).length, 6);
  assert.doesNotMatch(h.body.innerHTML, /evb-g-closed|Show 1 more/);
  h.checkbox.checked = true; h.checkbox.listeners.change.call(h.checkbox);
  assert.equal(h.saved.evb_show_done, 'true');
  assert.match(h.body.innerHTML, /evb-row-done/);
  const reloaded = boardFixture(h.saved);
  reloaded.c.eventTasks = h.c.eventTasks;
  reloaded.c.evbRender();
  assert.equal(reloaded.checkbox.checked, true);
  assert.doesNotMatch(reloaded.body.innerHTML, /evb-g-closed/);
  assert.match(reloaded.body.innerHTML, /Show 2 more/, 'show-more is only kept in memory');
});

test('late helper loading, blocked storage and both empty messages work', () => {
  const h = boardFixture({}, true);
  const api = h.c.MarcomEventBoard;
  h.c.MarcomEventBoard = undefined;
  h.c.evbRender();
  assert.equal(h.body.writes, 0);
  h.c.MarcomEventBoard = api;
  h.c.eventTasks = [];
  h.c.evbRender();
  assert.match(h.body.innerHTML, /No shared event tasks yet\. Create one from any board by ticking "Share this card with the team"\./);
  h.c.eventTasks = [task('Finished', 'Fair', 'canceled')];
  h.c.evbRender();
  assert.match(h.body.innerHTML, /All shared event tasks are done\./);
  assert.match(h.body.innerHTML, /Show completed/);
  h.checkbox.checked = true; h.checkbox.listeners.change.call(h.checkbox);
  assert.match(h.body.innerHTML, /Finished/);
});

/* Step 58: a card made with the event picker alone carries eventName but no label. */
test('a card with only the picked event\'s name is filed under that event, and found by its filter', () => {
  const picked = {title: 'Order banners', eventName: 'School Open Day', status: 'pending', dueDate: '2026-11-02', owner: 'dew'};
  const result = groups(sample.concat([picked]));
  assert.deepEqual(result.groups.map(g => g.label), ['School Open Day'], 'not "Other"');
  assert.equal(result.groups[0].open, 3);
  assert.deepEqual(groups([picked], {filter: 'School Open Day'}).groups.map(g => g.tasks.length), [1]);
  assert.equal(groups([{...picked, eventLabel: 'Open Day prep'}]).groups[0].label, 'Open Day prep', 'a typed label still wins');
  assert.equal(groups([{title: 'Loose', status: 'pending'}]).groups[0].label, 'Other', 'no event at all is still "Other"');
  assert.equal(context.window.MarcomEventBoard.labelOf(picked), 'School Open Day');
});
