import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/task-draft.js', import.meta.url), 'utf8');
const dialogs = readFileSync(new URL('../assets/ui-dialogs.js', import.meta.url), 'utf8');
const key = who => 'marcom_task_draft_v1_' + who;
const plain = value => JSON.parse(JSON.stringify(value));

function element(tag = 'div', id = '') {
  const classes = new Set();
  return {
    tagName: tag.toUpperCase(), id, value: '', checked: false, type: 'text',
    children: [], listeners: {}, attributes: {}, parentNode: null,
    classList: { contains: name => classes.has(name), add: name => classes.add(name),
      remove: name => classes.delete(name) },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, callback, capture) {
      (this.listeners[type] ||= []).push({ callback, capture });
    },
    dispatch(type, target = this) {
      for (const listener of this.listeners[type] || []) listener.callback({ target });
    },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    insertBefore(child, before) {
      const index = this.children.indexOf(before);
      this.children.splice(index < 0 ? this.children.length : index, 0, child);
      child.parentNode = this;
    },
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; },
    get firstChild() { return this.children[0] || null; },
    contains(child) { return child === this || this.children.some(node => node.contains(child)); },
    querySelectorAll(selector) {
      assert.equal(selector, 'input, textarea, select');
      return this.children.flatMap(child => [
        ...(['INPUT', 'TEXTAREA', 'SELECT'].includes(child.tagName) ? [child] : []),
        ...child.querySelectorAll(selector),
      ]);
    },
  };
}

function setup() {
  const window = element();
  const document = element();
  const modal = document.appendChild(element('div', 'modal'));
  modal.classList.add('open');
  const body = modal.appendChild(element('div', 'modal-body'));
  const fields = {};
  function field(id, value = '', type = 'text', tag = 'input') {
    const node = body.appendChild(element(tag, id));
    Object.assign(node, { value, type });
    fields[id] = node;
    return node;
  }
  field('m-topic');
  field('m-desc', '', 'text', 'textarea');
  field('m-notes');
  field('m-due', '', 'date');
  field('m-status', 'pending', 'select-one', 'select');
  field('m-priority', 'medium', 'select-one', 'select');
  field('m-dz-revisions', '0', 'number');
  field('m-dz-status', 'Brief Received', 'select-one', 'select');
  field('m-evt-on', '', 'checkbox');
  field('m-md-mailsent', '', 'checkbox');
  for (const id of ['m-md-start', 'm-md-end', 'm-dz-start', 'm-dz-end']) field(id, '', 'hidden');
  field('unrelated', 'Ignored');
  field('', 'Person', 'checkbox');
  document.getElementById = id => ({ modal, 'modal-body': body })[id] || fields[id] || null;
  document.createElement = tag => element(tag);
  const storage = new Map();
  const timers = new Map();
  const calls = [];
  let nextTimer = 0;
  Object.assign(window, {
    document,
    localStorage: {
      getItem: id => storage.get(id) ?? null,
      setItem: (id, value) => storage.set(id, value),
      removeItem: id => storage.delete(id),
    },
    setTimeout: (callback, delay) => {
      assert.equal(delay, 400);
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout: id => timers.delete(id),
    evtPeopleGet: () => ['boss', 'dew'],
    setTaskType: mode => { calls.push(['type', mode]); state().taskType = mode; },
    t24Set: (id, value) => { calls.push(['time', id, value]); fields[id].value = value; },
    evtToggle: () => { calls.push(['toggle', fields['m-evt-on'].checked]); },
    evtPeopleSet: people => calls.push(['people', plain(people)]),
    renderModalLinks: () => calls.push(['links', plain(links())]),
    autoGrowDesc: () => calls.push(['grow']),
    MarcomDialogs: { markDirty: node => { assert.equal(node, modal); calls.push(['dirty']); } },
  });
  window.window = window;
  const context = vm.createContext(window);
  vm.runInContext("let modalState = {who:'boss', editId:null, taskType:'standard'}; let modalLinks = [];", context);
  const state = () => vm.runInContext('modalState', context);
  const links = () => vm.runInContext('modalLinks', context);
  vm.runInContext(source, context);
  const draft = (who = 'boss', savedAt = Date.now()) => ({ v: 1, who, savedAt,
    taskType: 'role', fields: { 'm-topic': 'Saved title' }, people: ['junior'],
    links: [{ title: 'Brief', url: 'https://example.com/brief' }] });
  const put = value => storage.set(key(value.who), JSON.stringify(value));
  return { window, document, modal, body, fields, field, storage, timers, calls,
    context, state, links, draft, put, api: window.MarcomDraft,
    input: (id = 'm-topic', type = 'input') => document.dispatch(type, fields[id]) };
}

test('new-task input debounces and flush stores fields, people, and links at save time', () => {
  const h = setup();
  h.fields['m-topic'].value = 'Open day';
  h.fields['m-desc'].value = 'Plan the shoot';
  h.fields['m-evt-on'].checked = true;
  h.fields['m-md-start'].value = '09:30';
  h.input();
  h.input('m-evt-on', 'change');
  assert.equal(h.timers.size, 1);
  assert.equal(h.storage.size, 0);
  // The target's inline oninput runs after document capture.
  h.links().push({ title: 'Plan', url: 'https://example.com/plan' });
  h.api.flush();
  const saved = plain(h.api.read('boss'));
  assert.equal(saved.v, 1);
  assert.equal(saved.who, 'boss');
  assert.equal(saved.taskType, 'standard');
  assert.ok(Math.abs(Date.now() - saved.savedAt) < 1000);
  assert.equal(saved.fields['m-topic'], 'Open day');
  assert.equal(saved.fields['m-desc'], 'Plan the shoot');
  assert.equal(saved.fields['m-evt-on'], true);
  assert.equal(saved.fields['m-md-mailsent'], false);
  assert.equal(saved.fields['m-md-start'], '09:30');
  assert.equal(saved.fields.unrelated, undefined);
  assert.equal(saved.fields[''], undefined);
  assert.deepEqual(saved.people, ['boss', 'dew']);
  assert.deepEqual(saved.links, [{ title: 'Plan', url: 'https://example.com/plan' }]);
  assert.equal(h.timers.size, 0);
  for (const type of ['input', 'change']) assert.equal(h.document.listeners[type][0].capture, true);
});

test('timer and pagehide flush pending drafts, including after a plain close', () => {
  const h = setup();
  h.fields['m-topic'].value = 'First';
  h.input();
  [...h.timers.values()][0]();
  assert.equal(h.api.read('boss').fields['m-topic'], 'First');
  h.fields['m-topic'].value = 'Latest';
  h.input();
  h.modal.classList.remove('open');
  h.window.dispatch('pagehide');
  assert.equal(h.api.read('boss').fields['m-topic'], 'Latest');
  assert.equal(h.timers.size, 0);
});

test('editing, SOP batches, closed dialogs, and outside inputs do not schedule drafts', () => {
  for (const mode of ['edit', 'sop', 'closed', 'outside']) {
    const h = setup();
    h.fields['m-topic'].value = 'Do not save';
    if (mode === 'edit') h.state().editId = 'task-1';
    if (mode === 'sop') h.window.__sopBatch = {};
    if (mode === 'closed') h.modal.classList.remove('open');
    h.document.dispatch('input', mode === 'outside' ? element('input') : h.fields['m-topic']);
    assert.equal(h.timers.size, 0);
    h.api.flush();
    assert.equal(h.storage.size, 0);
  }
});

test('SOP save and discard hooks preserve an existing regular draft', () => {
  const h = setup();
  h.put(h.draft());
  h.fields['m-topic'].value = 'Pending';
  h.input();
  h.window.__sopBatch = {};
  h.api.clear('boss');
  h.api.flush();
  assert.equal(h.timers.size, 0);
  assert.equal(h.api.read('boss').fields['m-topic'], 'Saved title');
});

test('member drafts are separate and a pending save cannot read a replacement dialog', () => {
  const h = setup();
  h.fields['m-topic'].value = 'Boss task';
  h.input();
  h.api.flush();
  vm.runInContext("modalState = {who:'dew', editId:null, taskType:'role'};", h.context);
  h.fields['m-topic'].value = 'Dew task';
  h.input();
  h.api.flush();
  assert.equal(h.api.read('boss').fields['m-topic'], 'Boss task');
  assert.equal(h.api.read('dew').fields['m-topic'], 'Dew task');
  h.input();
  vm.runInContext("modalState = {who:'boss', editId:'existing'};", h.context);
  h.fields['m-topic'].value = 'Existing task';
  h.api.flush();
  assert.equal(h.api.read('dew').fields['m-topic'], 'Dew task');
});

test('default values, dates, whitespace, and empty links remove an existing draft', () => {
  const h = setup();
  h.put(h.draft());
  h.fields['m-topic'].value = ' \n ';
  h.fields['m-due'].value = '2026-10-24';
  h.fields['m-evt-on'].checked = true;
  h.links().push({ title: 'Label only', url: '  ' });
  h.input();
  h.api.flush();
  assert.equal(h.api.read('boss'), null);
  h.input();
  h.api.flush();
  assert.equal(h.storage.size, 0);
});

test('each meaningful text field and a link URL can keep a draft on its own', () => {
  for (const id of ['m-topic', 'm-desc', 'm-notes', 'm-attach', 'm-assignedby',
    'm-evt-label', 'm-md-event', 'm-md-location', 'm-md-file',
    'm-dz-type', 'm-dz-requestor', 'm-dz-brand', 'm-dz-file', 'link']) {
    const h = setup();
    if (id === 'link') h.links().push({ title: '', url: 'https://example.com' });
    else (h.fields[id] || h.field(id)).value = 'Content';
    h.input();
    h.api.flush();
    assert.ok(h.api.read('boss'), id);
  }
});

test('offer renders one dated banner, supports both buttons, and expires old drafts', () => {
  const h = setup();
  const draft = h.draft();
  h.put(draft);
  const originalFirst = h.body.firstChild;
  h.api.offer('boss');
  const banner = h.body.firstChild;
  assert.equal(banner.className, 'task-draft-banner');
  assert.equal(banner.attributes.role, 'status');
  assert.equal(banner.children[0].className, 'ti ti-history');
  const time = new Date(draft.savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  assert.equal(banner.children[1].textContent, `You have an unsaved task from ${time}.`);
  assert.equal(banner.children[2].className, 'btn btn-navy btn-sm');
  assert.equal(banner.children[2].textContent, 'Restore');
  assert.equal(banner.children[3].className, 'btn btn-ghost btn-sm');
  assert.equal(banner.children[3].textContent, 'Discard');
  h.api.offer('boss');
  assert.equal(banner.parentNode, null);
  h.body.firstChild.children[2].dispatch('click');
  assert.equal(h.fields['m-topic'].value, 'Saved title');
  assert.equal(h.body.firstChild, originalFirst);
  assert.ok(h.api.read('boss'));
  const older = h.draft('boss', Date.now() - 2 * 86400000);
  h.put(older);
  h.api.offer('boss');
  const date = new Date(older.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  assert.ok(h.body.firstChild.children[1].textContent.includes(date + ', '));
  h.body.firstChild.children[3].dispatch('click');
  assert.equal(h.api.read('boss'), null);
  assert.equal(h.body.firstChild, originalFirst);
  h.put(h.draft('boss', Date.now() - 7 * 86400000));
  h.api.offer('boss');
  assert.equal(h.api.read('boss'), null);
  assert.equal(h.body.firstChild, originalFirst);
});

test('offer hides previous banners and skips editing, SOP batches, and missing drafts', () => {
  const h = setup();
  h.put(h.draft());
  const originalFirst = h.body.firstChild;
  h.api.offer('boss');
  h.state().editId = 'task-1';
  h.api.offer('boss');
  assert.equal(h.body.firstChild, originalFirst);
  h.state().editId = null;
  h.window.__sopBatch = {};
  h.api.offer('boss');
  assert.equal(h.body.firstChild, originalFirst);
  delete h.window.__sopBatch;
  h.api.offer('dew');
  assert.equal(h.body.firstChild, originalFirst);
  h.api.offer('boss');
  h.api.hideOffer();
  assert.equal(h.body.firstChild, originalFirst);
});

test('restore sets fields and time pickers, then sharing and links, and finally marks dirty', () => {
  const h = setup();
  const draft = h.draft();
  Object.assign(draft.fields, { 'm-desc': 'Description', 'm-status': 'waiting',
    'm-evt-on': true, 'm-md-mailsent': true, 'm-missing': 'Ignore' });
  for (const id of ['m-md-start', 'm-md-end', 'm-dz-start', 'm-dz-end']) draft.fields[id] = '10:45';
  h.api.restore(draft);
  assert.equal(h.fields['m-topic'].value, 'Saved title');
  assert.equal(h.fields['m-desc'].value, 'Description');
  assert.equal(h.fields['m-status'].value, 'waiting');
  assert.equal(h.fields['m-md-mailsent'].checked, true);
  assert.deepEqual(h.calls, [
    ['type', 'role'],
    ...['m-md-start', 'm-md-end', 'm-dz-start', 'm-dz-end'].map(id => ['time', id, '10:45']),
    ['toggle', true], ['people', ['junior']], ['links', draft.links], ['grow'], ['dirty'],
  ]);
  assert.deepEqual(plain(h.links()), draft.links);
  h.links()[0].url = 'Changed';
  assert.equal(draft.links[0].url, 'https://example.com/brief');
});

test('restore skips missing optional helpers and falls back to direct time values', () => {
  const h = setup();
  for (const name of ['setTaskType', 't24Set', 'evtToggle', 'evtPeopleSet',
    'renderModalLinks', 'autoGrowDesc', 'MarcomDialogs', 'evtPeopleGet']) delete h.window[name];
  const draft = h.draft();
  draft.fields['m-md-start'] = '12:30';
  assert.doesNotThrow(() => h.api.restore(draft));
  assert.equal(h.fields['m-md-start'].value, '12:30');
  h.input();
  h.api.flush();
  assert.deepEqual(plain(h.api.read('boss').people), []);
});

test('clear removes only that member draft and banner, and cancels a pending save', () => {
  const h = setup();
  h.put(h.draft());
  h.put(h.draft('dew'));
  const originalFirst = h.body.firstChild;
  h.api.offer('boss');
  h.fields['m-topic'].value = 'Pending';
  h.input();
  h.api.clear('boss');
  assert.equal(h.timers.size, 0);
  h.api.flush();
  assert.equal(h.api.read('boss'), null);
  assert.ok(h.api.read('dew'));
  assert.equal(h.body.firstChild, originalFirst);
});

test('blocked storage and malformed data never break read, offer, flush, or clear', () => {
  for (const getter of [false, true]) {
    const h = setup();
    const fail = () => { throw new Error('Storage blocked'); };
    if (getter) Object.defineProperty(h.window, 'localStorage', { get: fail });
    else h.window.localStorage = { getItem: fail, setItem: fail, removeItem: fail };
    assert.doesNotThrow(() => h.api.offer('boss'));
    assert.equal(h.api.read('boss'), null);
    h.fields['m-topic'].value = 'Unsaved';
    h.input();
    assert.doesNotThrow(() => h.api.flush());
    h.fields['m-topic'].value = '';
    h.input();
    assert.doesNotThrow(() => h.api.flush());
    assert.doesNotThrow(() => h.api.clear('boss'));
  }
  const h = setup();
  for (const value of ['{broken', 'null', '{}', JSON.stringify({ ...h.draft(), v: 2 })]) {
    h.storage.set(key('boss'), value);
    assert.equal(h.api.read('boss'), null);
    assert.doesNotThrow(() => h.api.offer('boss'));
  }
});

test('dialog Discard clears only a dirty new task, before closing; untouched closes keep drafts', async () => {
  const h = setup();
  const closed = [];
  h.window.closeModal = () => closed.push(h.api.read('boss'));
  let answer;
  h.window.uiConfirm = () => new Promise(resolve => { answer = resolve; });
  vm.runInContext(dialogs, h.context);
  h.put(h.draft());
  h.window.requestCloseModal();
  assert.ok(closed[0]);
  h.window.MarcomDialogs.markDirty(h.modal);
  let pending = h.window.requestCloseModal();
  answer(false);
  await pending;
  assert.ok(h.api.read('boss'));
  assert.equal(closed.length, 1);
  h.state().editId = 'existing';
  pending = h.window.requestCloseModal();
  answer(true);
  await pending;
  assert.ok(h.api.read('boss'));
  h.state().editId = null;
  h.fields['m-topic'].value = 'Pending';
  h.input();
  pending = h.window.requestCloseModal();
  answer(true);
  await pending;
  assert.equal(closed.at(-1), null);
  h.api.flush();
  assert.equal(h.api.read('boss'), null);
});
