import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extract(start, end) {
  const begin = html.indexOf(start);
  const finish = html.indexOf(end, begin);
  assert.ok(begin >= 0 && finish > begin, start);
  return html.slice(begin, finish);
}
const mappings = extract('const DZ_STATUSES=', 'function dzColors(');
const helpers = extract('function setTaskCategory(', 'function openAdd(');
const categoryMarkup = html.match(/<select[^>]*id="m-cat"[^>]*>([\s\S]*?)<\/select>/)[1];
const categories = ['', 'Design', 'Photo & Video', 'Social Media', 'Event', 'Print', 'Admin'];
const stages = ['Waiting for Brief', 'Brief Received', 'In Progress', 'Review', 'Revision Required', 'Approved', 'Delivered'];
const statuses = ['waiting', 'pending', 'in-progress', 'in-progress', 'in-progress', 'in-progress', 'done'];

function option(value = '') {
  return { value, attrs: {}, textContent: '',
    getAttribute(name) { return this.attrs[name] ?? null; },
    setAttribute(name, value) { this.attrs[name] = value; } };
}
function fixture() {
  const fields = {};
  const field = id => fields[id] ||= { ...option(), style: {}, checked: false };
  const select = field('m-cat');
  select.options = categories.map(value => option(value));
  select.appendChild = child => select.options.push(child);
  select.removeChild = child => select.options.splice(select.options.indexOf(child), 1);
  const c = vm.createContext({
    document: { getElementById: field, createElement: () => option() },
    modalState: { who: 'dew', taskType: 'role', editId: 'task' },
    eventsOf: () => [{ id: 'a', name: 'Open Day' }, { id: 'b', name: 'Sports Day' }],
  });
  c.window = c;
  vm.runInContext(mappings + helpers, c);
  return { c, field, select };
}

test('all design stages map to board statuses, including Delivered and unknown stages', () => {
  const { c } = fixture();
  stages.forEach((stage, i) => assert.equal(c.dzToStatus(stage), statuses[i]));
  assert.equal(c.dzToStatus('unknown'), 'pending');
  assert.equal(c.dzToStatus(), 'pending');
});

test('status mapping round-trips known stages and preserves paused stages', () => {
  const { c } = fixture();
  stages.forEach(stage => {
    assert.equal(c.statusToDz(c.dzToStatus(stage), stage), stage);
    assert.equal(c.statusToDz('done', stage), 'Delivered');
    for (const status of ['on-hold', 'canceled']) assert.equal(c.statusToDz(status, stage), stage);
  });
  for (const [status, stage] of [['pending', 'Brief Received'], ['waiting', 'Waiting for Brief'], ['in-progress', 'In Progress']]) {
    assert.equal(c.statusToDz(status, 'unknown'), stage);
    assert.equal(c.statusToDz(status, 'Delivered'), stage);
  }
  for (const status of ['on-hold', 'canceled']) {
    assert.equal(c.statusToDz(status, ''), 'Brief Received');
    assert.equal(c.statusToDz(status, 'Old stage'), 'Old stage');
  }
});

test('old categories get one temporary plain-text option and are cleared between tasks', () => {
  const { c, select } = fixture();
  for (const value of ['Home', '<b>Personal</b>', 'Home']) {
    c.setTaskCategory(value);
    assert.equal(select.options.length, categories.length + 1);
    assert.equal(select.value, value);
    assert.equal(select.options.at(-1).textContent, value + ' (old)');
    assert.equal(select.options.at(-1).getAttribute('data-old'), 'true');
  }
  for (const value of categories) {
    c.setTaskCategory(value);
    assert.equal(select.options.length, categories.length);
    assert.equal(select.value, value);
  }
});

test('category markup contains exactly the MARCOM categories and values', () => {
  const entries = [...categoryMarkup.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)]
    .map(([, value, label]) => [value.replaceAll('&amp;', '&'), label.replaceAll('&amp;', '&')]);
  assert.deepEqual(entries, categories.map(value => [value, value || 'None']));
  assert.match(categoryMarkup, /Photo &amp; Video/);
});

test('campaign follows event changes only while empty or still auto-filled in Dew role mode', () => {
  const { c, field } = fixture();
  const brand = field('m-dz-brand');
  field('m-event').value = 'a';
  c.syncDesignEvent();
  assert.equal(brand.value, 'Open Day');
  assert.equal(brand.getAttribute('data-auto'), 'Open Day');
  field('m-event').value = 'b';
  c.syncDesignEvent();
  assert.equal(brand.value, 'Sports Day');
  brand.value = 'Custom campaign';
  field('m-event').value = 'a';
  c.syncDesignEvent();
  assert.equal(brand.value, 'Custom campaign');
  brand.value = '';
  c.modalState.taskType = 'standard';
  c.syncDesignEvent();
  assert.equal(brand.value, '');
  c.modalState.taskType = 'role';
  c.modalState.who = 'o';
  c.syncDesignEvent();
  assert.equal(brand.value, '');
  c.modalState.who = 'dew';
  c.syncDesignEvent();
  field('m-event').value = '';
  c.syncDesignEvent();
  assert.equal(brand.value, '');
});

function saveFixture() {
  const h = fixture();
  const { c, field } = h;
  h.old = { id: 'task', dzStatus: 'Review', status: 'in-progress', requestId: 'request', dueDate: '' };
  h.mirrors = [];
  const ref = { doc: () => ({
    update(data) { h.saved = data; return Promise.resolve(); },
    set(data) { h.saved = data; return Promise.resolve(); },
  }) };
  Object.assign(c, {
    tasksOf: () => [h.old], refOf: () => ref, taskRef: () => ref,
    modalLinks: [], isEventTask: () => false, stampEdit: () => ({}), closeModal() {},
    rcMirrorStatus: (...args) => h.mirrors.push(args),
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'now' } } }, meEmail: () => 'test@example.com',
  });
  field('m-topic').value = 'Design task';
  field('m-dz-requestor').value = 'Requester';
  field('m-assignedby').value = 'Old requester';
  field('m-status').value = 'done';
  vm.runInContext(extract('function saveTask(){', 'function deleteTask('), c);
  vm.runInContext(extract('function setDesignStatus(', '\n'), c);
  return h;
}

test('design saves resolve status and done before mirroring, and use one requester', () => {
  for (const [i, stage] of stages.entries()) {
    const h = saveFixture();
    h.field('m-dz-status').value = stage;
    h.c.saveTask();
    assert.equal(h.saved.status, statuses[i]);
    assert.equal(h.saved.done, stage === 'Delivered');
    assert.equal(h.saved.dzStatus, stage);
    assert.equal(h.saved.assignedBy, h.saved.dzRequestor);
    assert.equal(h.saved.assignedBy, 'Requester');
    assert.deepEqual(h.mirrors, statuses[i] === h.old.status ? [] : [['request', statuses[i]]]);
  }
});

test('paused design saves preserve the previous stage or use Brief Received for new tasks', () => {
  for (const status of ['on-hold', 'canceled']) {
    for (const isNew of [false, true]) {
      const h = saveFixture();
      if (isNew) h.c.modalState.editId = null;
      h.field('m-dz-status').value = '__' + status;
      h.c.saveTask();
      assert.equal(h.saved.status, status);
      assert.equal(h.saved.done, false);
      assert.equal(h.saved.dzStatus, isNew ? 'Brief Received' : 'Review');
      assert.deepEqual(h.mirrors, isNew ? [] : [['request', status]]);
    }
  }
});

test('card design changes update stage, board status, done and Request Centre together', () => {
  for (const [i, stage] of stages.entries()) {
    const h = saveFixture();
    h.c.setDesignStatus('dew', 'task', stage);
    assert.equal(h.saved.dzStatus, stage);
    assert.equal(h.saved.status, statuses[i]);
    assert.equal(h.saved.done, stage === 'Delivered');
    assert.deepEqual(h.mirrors, [['request', statuses[i]]]);
  }
});

test('role folds support optional motion and update aria from the requested animation state', () => {
  const { c } = fixture();
  let closed = false;
  const section = { classList: {
    contains: () => closed,
    toggle(name, force) { assert.equal(name, 'role-closed'); closed = force; return closed; },
  } };
  const button = { ...option(), parentElement: section };
  c.toggleRoleDetails(button);
  assert.equal(closed, true);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  c.toggleRoleDetails(button, false);
  assert.equal(closed, false);
  c.MarcomMotion = { toggle(el, name, force, opts) {
    assert.equal(el, section);
    assert.equal(name, 'role-closed');
    assert.equal(opts.reveal, ':scope>.role-body');
    return force === undefined ? true : force;
  } };
  c.toggleRoleDetails(button);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(closed, false, 'aria reflects target before animation commits the class');
  c.toggleRoleDetails(button, false);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
});
