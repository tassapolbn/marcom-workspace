import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('<div class="modal-overlay" id="modal"');
const markup = html.slice(start, html.indexOf('<div class="modal-footer">', start));
const source = html.match(/<script id="taskform-script">([\s\S]*?)<\/script>/)[1];
const draftSource = readFileSync(new URL('../assets/task-draft.js', import.meta.url), 'utf8');
const ids = ['m-topic', 'm-desc', 'm-assignedby', 'm-assigned', 'm-due', 'm-status',
  'm-event', 'm-evt-on', 'm-evt-label', 'm-priority', 'm-cat', 'm-attach', 'm-notes',
  'm-links-container', 'm-media-section', 'm-design-section'];

// A small tag stack keeps containment assertions independent of indentation.
function parse(fragment) {
  const root = { children: [] };
  const stack = [root];
  const nodes = {};
  const voidTags = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
  for (const match of fragment.matchAll(/<\/?([a-z][\w-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const [tag, name] = match;
    if (tag.startsWith('</')) {
      assert.equal(stack.at(-1).tag, name, 'balanced markup');
      stack.pop();
      continue;
    }
    const node = { tag: name, attrs: {}, parent: stack.at(-1), children: [] };
    for (const attr of tag.matchAll(/([\w-]+)="([^"]*)"/g)) node.attrs[attr[1]] = attr[2];
    node.parent.children.push(node);
    if (node.attrs.id) nodes[node.attrs.id] = node;
    if (!voidTags.has(name) && !tag.endsWith('/>')) stack.push(node);
  }
  return nodes;
}
const nodes = parse(markup);
const hasClass = (node, name) => (node.attrs.class || '').split(' ').includes(name);
function inside(node, ancestor) {
  for (let parent = node.parent; parent; parent = parent.parent) if (parent === ancestor) return true;
  return false;
}

test('task form keeps every existing field id exactly once and in its form group', () => {
  for (const id of ids) {
    assert.equal([...html.matchAll(new RegExp('\\bid="' + id + '"', 'g'))].length, 1, id);
    assert.ok(nodes[id], id + ' remains in the task dialog');
    if (['m-links-container', 'm-media-section', 'm-design-section'].includes(id)) continue;
    let group = nodes[id].parent;
    while (group && !hasClass(group, 'form-group')) group = group.parent;
    assert.ok(group, id + ' retains a form-group ancestor');
  }
});

test('task dialog follows the compact order and groups Due, Priority, Status together', () => {
  const order = ['m-tasktype', 'm-topic', 'm-due', 'm-priority', 'm-status', 'm-event-group',
    'm-evt-group', 'm-desc-group', 'm-desc', 'm-media-section', 'm-design-section', 'm-more'];
  const positions = order.map(id => markup.indexOf('id="' + id + '"'));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
  const row = nodes['m-due'].parent.parent;
  assert.ok(hasClass(row, 'form-row-3'));
  assert.deepEqual(row.children, ['m-due', 'm-priority', 'm-status'].map(id => nodes[id].parent));
  assert.equal(nodes['m-topic'].parent.parent, nodes['modal-body']);
  assert.ok(inside(nodes['m-desc'], nodes['m-desc-wrap']));
  assert.equal(nodes['m-desc-add'].attrs.type, 'button');
  assert.equal(nodes['m-more-toggle'].attrs['aria-controls'], 'm-more-body');
});

test('secondary fields live in More details in order, with a Category spacer', () => {
  const order = ['m-assignedby', 'm-assigned', 'm-cat', 'm-attach', 'm-links-container', 'm-notes'];
  for (const id of order) assert.ok(inside(nodes[id], nodes['m-more-body']), id);
  const positions = order.map(id => markup.indexOf('id="' + id + '"'));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  const row = nodes['m-cat'].parent.parent;
  assert.ok(hasClass(row, 'form-row'));
  assert.equal(row.children.length, 2);
  assert.ok(hasClass(row.children[1], 'form-group'));
  assert.equal(row.children[1].children.length, 0);
});

function setup() {
  const fields = {};
  for (const id of Object.keys(nodes)) {
    const classes = new Set((nodes[id].attrs.class || '').split(' '));
    fields[id] = {
      value: '', textContent: '', attrs: { ...nodes[id].attrs }, listeners: {},
      classList: {
        contains: name => classes.has(name),
        add: name => classes.add(name), remove: name => classes.delete(name),
        toggle(name, force = !classes.has(name)) {
          if (force) classes.add(name); else classes.delete(name);
          return force;
        },
      },
      setAttribute(name, value) { this.attrs[name] = value; },
      getAttribute(name) { return this.attrs[name]; },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      focus() { this.focused = true; },
    };
  }
  const window = {
    document: { getElementById: id => fields[id] || null },
    autoGrowDesc() { window.grows = (window.grows || 0) + 1; },
  };
  window.window = window;
  const context = vm.createContext(window);
  vm.runInContext('let modalLinks = [];', context);
  vm.runInContext(source, context);
  return { window, context, fields, links: vm.runInContext('modalLinks', context),
    closed: () => fields['m-more'].classList.contains('tf-more-closed'),
    summary: () => fields['m-more-sum'].textContent };
}

test('tfSync opens populated details, ignores Assigned Date, and resets description visibility', () => {
  const h = setup();
  h.fields['m-assigned'].value = '2026-10-24';
  h.window.tfSync();
  assert.equal(h.closed(), true);
  assert.equal(h.summary(), '');
  assert.equal(h.fields['m-more-toggle'].attrs['aria-expanded'], 'false');
  h.fields['m-notes'].value = 'Remember the brief';
  h.fields['m-desc'].value = 'A restored description';
  h.window.tfSync();
  assert.equal(h.closed(), false);
  assert.equal(h.fields['m-more-toggle'].attrs['aria-expanded'], 'true');
  assert.equal(h.fields['m-desc-wrap'].classList.contains('tf-hidden'), false);
  assert.equal(h.fields['m-desc-add'].classList.contains('tf-hidden'), true);
  h.fields['m-notes'].value = '  ';
  h.fields['m-desc'].value = '';
  h.window.tfSync();
  assert.equal(h.closed(), true);
  assert.equal(h.fields['m-desc-wrap'].classList.contains('tf-hidden'), true);
  assert.equal(h.fields['m-desc-add'].classList.contains('tf-hidden'), false);
});

test('each secondary value or a link URL opens More details without motion', () => {
  for (const id of ['m-assignedby', 'm-cat', 'm-attach', 'm-notes', 'link']) {
    const h = setup();
    h.window.MarcomMotion = { toggle() { assert.fail('tfSync must not animate'); } };
    if (id === 'link') h.links.push({ url: 'https://example.com' });
    else h.fields[id].value = 'Value';
    h.window.tfSync();
    assert.equal(h.closed(), false, id);
  }
  const h = setup();
  h.links.push({ title: 'Label only', url: ' ' });
  h.window.tfSync();
  assert.equal(h.closed(), true);
});

test('summary counts links and notes, excludes date, and safely uses plain text', () => {
  const h = setup();
  h.fields['m-assigned'].value = '2026-10-24';
  h.fields['m-assignedby'].value = '<b>Khun Miki</b>';
  h.fields['m-cat'].value = 'Work';
  h.fields['m-attach'].value = 'https://example.com/attachment';
  h.fields['m-notes'].value = 'Notes content';
  h.links.push({ url: 'https://example.com/a' }, { url: ' ' }, { url: 'https://example.com/b' });
  h.window.tfSummary();
  assert.equal(h.summary(), 'Assigned by <b>Khun Miki</b> \u00c2\u00b7 Work \u00c2\u00b7 Attachment \u00c2\u00b7 2 links \u00c2\u00b7 Notes');
  assert.ok(!h.summary().includes('2026-10-24'));
  h.window.tfToggleMore(true);
  assert.equal(h.summary(), '');
  h.links.pop();
  h.window.tfToggleMore(false);
  assert.match(h.summary(), /1 link /);
  assert.doesNotMatch(h.summary(), /1 links/);
});

test('description reveal supports optional motion, focus, and auto-grow', () => {
  for (const motion of [false, true]) {
    const h = setup();
    if (motion) h.window.MarcomMotion = { toggle(el, name, force, opts) {
      assert.equal(el, h.fields['m-desc-wrap']);
      assert.equal(name, 'tf-hidden');
      assert.equal(force, false);
      assert.equal(opts.reveal, ':scope>*');
      return el.classList.toggle(name, force);
    } };
    h.window.tfShowDesc(true);
    assert.equal(h.fields['m-desc-wrap'].classList.contains('tf-hidden'), false);
    assert.equal(h.fields['m-desc-add'].classList.contains('tf-hidden'), true);
    assert.equal(h.fields['m-desc'].focused, true);
    assert.equal(h.window.grows, 1);
  }
});

test('animated collapse updates summary and aria before the closing class is committed', () => {
  const h = setup();
  h.fields['m-notes'].value = 'Brief';
  h.window.tfSync();
  h.window.MarcomMotion = { toggle(el, name, force, opts) {
    assert.equal(el, h.fields['m-more']);
    assert.equal(name, 'tf-more-closed');
    assert.equal(force, undefined);
    assert.equal(opts.reveal, ':scope>.tf-more-body');
    return true;
  } };
  h.window.tfToggleMore();
  assert.equal(h.closed(), false);
  assert.equal(h.fields['m-more-toggle'].attrs['aria-expanded'], 'false');
  assert.equal(h.summary(), 'Notes');
});

test('delegated inputs, changes, and Add Link clicks refresh the summary', () => {
  const h = setup();
  const listeners = h.fields['m-more-body'].listeners;
  h.fields['m-notes'].value = 'Brief';
  listeners.input();
  assert.equal(h.summary(), 'Notes');
  h.fields['m-cat'].value = 'Work';
  listeners.change();
  assert.equal(h.summary(), 'Work \u00c2\u00b7 Notes');
  h.links.push({ url: 'https://example.com' });
  listeners.click();
  assert.equal(h.summary(), 'Work \u00c2\u00b7 1 link \u00c2\u00b7 Notes');
});

test('Add defaults Assigned Date and syncs before offering drafts; Edit syncs before opening', () => {
  const add = html.slice(html.indexOf('function openAdd(who){'), html.indexOf('function openEdit(who,id){'));
  assert.ok(add.indexOf("if(e)e.value=''") < add.indexOf("document.getElementById('m-assigned').value=todayStr()"));
  assert.ok(add.includes('tfSync();'));
  assert.ok(add.indexOf('tfSync();') < add.indexOf('MarcomDraft.offer(who)'));
  const edit = html.slice(html.indexOf('function openEdit(who,id){'), html.indexOf('function styleModal(who){'));
  assert.ok(edit.indexOf('tfSync();') > edit.indexOf('rcTaskPanel(task)'));
  assert.ok(edit.indexOf('tfSync();') < edit.indexOf("document.getElementById('modal').classList.add('open')"));
});

test('draft restore reveals saved description and notes through the optional tfSync hook', () => {
  const h = setup();
  Object.assign(h.window, { modalState: { who: 'boss', editId: null },
    cancel() {}, copyLinks: links => links.slice(), times: [], hideOffer() {} });
  const restore = draftSource.slice(draftSource.indexOf('  function restore(draft){'), draftSource.indexOf('  function offer(who){'));
  vm.runInContext('var root = window;\n' + restore, h.context);
  h.window.restore({ who: 'boss', fields: { 'm-desc': 'Saved description', 'm-notes': 'Saved notes' }, links: [] });
  assert.equal(h.closed(), false);
  assert.equal(h.fields['m-desc-wrap'].classList.contains('tf-hidden'), false);
  delete h.window.tfSync;
  assert.doesNotThrow(() => h.window.restore({ who: 'boss', fields: {}, links: [] }));
});
