import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/ui-dialogs.js', import.meta.url), 'utf8');

function element(classes = []) {
  const names = new Set(classes);
  const listeners = {};
  return {
    classList: {
      contains: name => names.has(name),
      add: name => names.add(name),
      remove: name => names.delete(name),
    },
    addEventListener: (type, callback, capture) => { listeners[type] = { callback, capture }; },
    removeEventListener: type => { delete listeners[type]; },
    dispatch(type, extra = {}) {
      const event = { target: this, ...extra, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; },
        stopImmediatePropagation() { this.stopped = true; } };
      listeners[type]?.callback(event);
      return event;
    },
    listeners,
  };
}

function setup({ observer = true } = {}) {
  const window = element();
  const document = element();
  const overlays = {};
  const timers = new Map();
  const calls = { task: 0, event: 0, questions: [], toasts: [] };
  let nextTimer = 0;
  let mutationCallback;
  let observed;
  let answer;
  document.documentElement = element();
  document.getElementById = id => overlays[id] || null;
  window.setTimeout = (callback, delay) => { assert.equal(delay, 450); timers.set(++nextTimer, callback); return nextTimer; };
  window.clearTimeout = id => timers.delete(id);
  Object.assign(window, {
    document, modalState: { editId: null }, eventEditId: null,
    closeModal: () => calls.task++, closeEventModal: () => calls.event++,
    uiToast: (message, options) => calls.toasts.push({ message, options }),
    uiConfirm: options => { calls.questions.push(options); return new Promise(resolve => { answer = resolve; }); },
  });
  if (observer) window.MutationObserver = function(callback) {
    mutationCallback = callback;
    this.observe = (target, options) => { observed = { target, options }; };
  };
  window.window = window;
  const context = vm.createContext(window);
  vm.runInContext(source, context);
  function overlay(id = 'modal') {
    const node = element(['modal-overlay', 'open']);
    node.id = id;
    node.box = element(['modal']);
    node.querySelector = selector => { assert.equal(selector, '.modal'); return node.box; };
    node.input = { closest: selector => { assert.equal(selector, '.modal-overlay'); return node; } };
    overlays[id] = node;
    return node;
  }
  function click(node, press = node) {
    window.dispatch('mousedown', { target: press });
    return window.dispatch('click', { target: node });
  }
  return { window, document, calls, overlay, click, timers, api: window.MarcomDialogs,
    answer: value => answer(value),
    mutate: records => mutationCallback(records),
    observed: () => observed };
}

test('untouched backdrop clicks pass through capture listeners', () => {
  const h = setup();
  const click = h.click(h.overlay());
  assert.equal(click.prevented, false);
  assert.equal(click.stopped, false);
  for (const type of ['mousedown', 'click']) assert.equal(h.window.listeners[type].capture, true);
  for (const type of ['input', 'change']) assert.equal(h.document.listeners[type].capture, true);
});

test('dirty backdrop clicks stop, shake, and toast only once per opening', () => {
  const h = setup();
  const node = h.overlay();
  h.api.markDirty(node);
  const click = h.click(node);
  assert.equal(click.prevented, true);
  assert.equal(click.stopped, true);
  assert.equal(node.box.classList.contains('ui-shake'), true);
  h.click(node);
  assert.equal(h.calls.toasts.length, 1);
  assert.equal(h.calls.toasts[0].message, 'You have unsaved changes. Press Cancel or \u00d7 to close without saving.');
  assert.equal(h.calls.toasts[0].options.duration, 5000);
  node.box.dispatch('animationend', { animationName: 'ui-shake' });
  assert.equal(node.box.classList.contains('ui-shake'), false);
  assert.equal(h.timers.size, 0);
  h.click(node);
  for (const callback of [...h.timers.values()]) callback();
  assert.equal(node.box.classList.contains('ui-shake'), false);
});

test('pressing inside then releasing on backdrop is blocked without feedback', () => {
  const h = setup();
  const node = h.overlay();
  for (const dirty of [false, true]) {
    if (dirty) h.api.markDirty(node);
    const click = h.click(node, node.input);
    assert.equal(click.prevented, true);
    assert.equal(click.stopped, true);
    assert.equal(node.box.classList.contains('ui-shake'), false);
  }
  assert.equal(h.calls.toasts.length, 0);
});

test('confirm and links hub overlays are never intercepted', () => {
  const h = setup();
  for (const id of ['uxp-modal', 'links-hub-modal']) {
    const node = h.overlay(id);
    h.api.markDirty(node);
    for (const press of [node, node.input]) {
      const click = h.click(node, press);
      assert.equal(click.stopped, false);
      assert.equal(click.prevented, false);
    }
    assert.equal(node.box.classList.contains('ui-shake'), false);
  }
  assert.equal(h.calls.toasts.length, 0);
});

test('untouched task closes immediately without a question', () => {
  const h = setup();
  h.overlay();
  h.window.requestCloseModal();
  assert.equal(h.calls.task, 1);
  assert.equal(h.calls.questions.length, 0);
});

test('dirty task close confirms, uses the edit title, and ignores repeat requests', async () => {
  const h = setup();
  h.api.markDirty(h.overlay());
  let pending = h.window.requestCloseModal();
  h.window.requestCloseModal();
  assert.equal(h.calls.questions.length, 1);
  assert.deepEqual({ ...h.calls.questions[0] }, {
    title: 'Discard this task?', message: 'What you typed will be lost.',
    okLabel: 'Discard', cancelLabel: 'Keep editing', danger: true,
  });
  h.answer(false);
  await pending;
  assert.equal(h.calls.task, 0);
  h.window.modalState.editId = 'task-1';
  pending = h.window.requestCloseModal();
  assert.equal(h.calls.questions[1].title, 'Discard your changes?');
  h.answer(true);
  await pending;
  assert.equal(h.calls.task, 1);
});

test('event close confirms only changes and uses new and existing event titles', async () => {
  const h = setup();
  const node = h.overlay('event-modal');
  h.window.requestCloseEventModal();
  assert.equal(h.calls.event, 1);
  assert.equal(h.calls.questions.length, 0);
  h.api.markDirty(node);
  let pending = h.window.requestCloseEventModal();
  assert.equal(h.calls.questions[0].title, 'Discard this event?');
  h.answer(false);
  await pending;
  assert.equal(h.calls.event, 1);
  h.window.eventEditId = 'event-1';
  pending = h.window.requestCloseEventModal();
  assert.equal(h.calls.questions[1].title, 'Discard your changes?');
  h.answer(true);
  await pending;
  assert.equal(h.calls.event, 2);
});

test('trusted input and change mark only open overlays; clearDirty resets them', () => {
  const h = setup();
  const node = h.overlay();
  for (const type of ['input', 'change']) {
    h.document.dispatch(type, { target: node.input, isTrusted: false });
    assert.equal(h.api.isDirty(node), false);
    h.document.dispatch(type, { target: node.input, isTrusted: true });
    assert.equal(h.api.isDirty(node), true);
    h.api.clearDirty(node);
    assert.equal(h.api.isDirty(node), false);
  }
  node.classList.remove('open');
  h.document.dispatch('input', { target: node.input, isTrusted: true });
  h.document.dispatch('input', { target: { closest: () => null }, isTrusted: true });
  assert.equal(h.api.isDirty(node), false);
});

test('open and close transitions reset dirtiness and toast state; unrelated classes do not', () => {
  const h = setup();
  const node = h.overlay();
  const { target, options } = h.observed();
  assert.equal(target, h.document.documentElement);
  assert.equal(options.subtree, true);
  assert.equal(options.attributes, true);
  assert.equal(options.attributeOldValue, true);
  assert.deepEqual([...options.attributeFilter], ['class']);
  h.api.markDirty(node);
  h.click(node);
  node.classList.add('extra');
  h.mutate([{ target: node, oldValue: 'modal-overlay open' }]);
  assert.equal(h.api.isDirty(node), true);
  node.classList.remove('open');
  h.mutate([{ target: node, oldValue: 'modal-overlay open extra' }]);
  assert.equal(h.api.isDirty(node), false);
  h.api.markDirty(node);
  node.classList.add('open');
  h.mutate([{ target: node, oldValue: 'modal-overlay extra' }]);
  assert.equal(h.api.isDirty(node), false);
  h.api.markDirty(node);
  h.click(node);
  assert.equal(h.calls.toasts.length, 2);
});

test('optional globals and observer may be absent; native confirm is the fallback', () => {
  const h = setup({ observer: false });
  h.api.markDirty(h.overlay());
  delete h.window.uiConfirm;
  delete h.window.modalState;
  const questions = [];
  h.window.confirm = message => { questions.push(message); return false; };
  h.window.requestCloseModal();
  assert.equal(h.calls.task, 0);
  h.window.confirm = message => { questions.push(message); return true; };
  h.window.requestCloseModal();
  assert.equal(h.calls.task, 1);
  assert.deepEqual(questions, ['Discard your changes?', 'Discard your changes?']);
  delete h.window.closeModal;
  delete h.window.confirm;
  delete h.window.uiToast;
  delete h.window.closeEventModal;
  delete h.window.eventEditId;
  assert.doesNotThrow(() => h.window.requestCloseModal());
  assert.doesNotThrow(() => h.window.requestCloseEventModal());
  assert.doesNotThrow(() => h.click(h.document.getElementById('modal')));
});
