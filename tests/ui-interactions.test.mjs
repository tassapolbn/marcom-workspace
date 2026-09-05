import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const keyHandler = source.match(/function __uiKeys\(e\)\{[\s\S]*?(?=\r?\nfunction uiConfirm\()/)?.[0];
assert.ok(keyHandler, 'The dialog keyboard handler must exist');

function dialog(kind = 'confirm') {
  const outcomes = [];
  const context = vm.createContext({
    __uiKind: kind,
    uiModalClose: value => outcomes.push(value),
    document: { activeElement: { tagName: 'BUTTON' } },
  });
  vm.runInContext(keyHandler, context);
  return { context, outcomes };
}

function keyboardEvent(key) {
  return {
    key,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.propagationStopped = true; },
  };
}

test('Enter on Cancel or Close keeps native activation and never confirms', () => {
  for (const label of ['Cancel', 'Close dialog']) {
    const { context, outcomes } = dialog();
    context.document.activeElement.ariaLabel = label;
    const event = keyboardEvent('Enter');
    context.__uiKeys(event);
    assert.equal(event.defaultPrevented, false);
    assert.deepEqual(outcomes, []);
    // The browser then activates the focused cancellation button.
    context.uiModalClose(false);
    assert.deepEqual(outcomes, [false]);
  }
});

test('Enter on Confirm remains available to the focused button', () => {
  const { context, outcomes } = dialog();
  const event = keyboardEvent('Enter');
  context.__uiKeys(event);
  assert.equal(event.defaultPrevented, false);
  assert.deepEqual(outcomes, []);
  context.uiModalClose(true);
  assert.deepEqual(outcomes, [true]);
});

test('Escape dismisses a confirmation and prevents underlying dialog handlers', () => {
  const { context, outcomes } = dialog();
  const event = keyboardEvent('Escape');
  context.__uiKeys(event);
  assert.deepEqual(outcomes, [false]);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
});

test('Escape cancels a prompt without a value and consumes the event', () => {
  const { context, outcomes } = dialog('prompt');
  const event = keyboardEvent('Escape');
  context.__uiKeys(event);
  assert.deepEqual(outcomes, [null]);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
});

const boardScript = source.match(/var __boardArgs=\{\}, __boardTimer=\{\};[\s\S]*?(?=\r?\nfunction isUrl\()/)?.[0];
assert.ok(boardScript, 'The board renderer must exist');

function board() {
  const state = { loaded: true, dragging: false, writes: 0, html: '', timers: [] };
  const empty = { style: {} };
  const list = {
    get innerHTML() { return state.html; },
    set innerHTML(value) { state.html = value; state.writes++; },
    querySelector: () => state.dragging ? {} : null,
    contains: element => element?.parent === list,
  };
  const document = {
    activeElement: null,
    getElementById: id => ({ board: list, empty })[id],
  };
  const context = vm.createContext({
    document,
    loadedOf: () => state.loaded,
    skeletonHTML: () => '<div>Loading</div>',
    kanbanHTML: (tasks, who, filter) => JSON.stringify({ tasks, who, filter }),
    setTimeout: (fn, delay) => state.timers.push({ fn, delay }),
  });
  vm.runInContext(boardScript, context);
  context.__boardArgs.board = { tasks: [{ id: 'task-1', status: 'pending' }], who: 'boss', emptyId: 'empty', filter: 'all' };
  return { context, document, list, empty, state, draw: () => context.drawBoard('board') };
}

test('An identical board snapshot preserves existing DOM; a changed task replaces it', () => {
  const { context, state, draw } = board();
  draw();
  draw();
  assert.equal(state.writes, 1);
  context.__boardArgs.board.tasks[0].status = 'done';
  draw();
  assert.equal(state.writes, 2);
  assert.match(state.html, /"status":"done"/);
});

test('Board rendering caches loading and empty states without hiding state transitions', () => {
  const { context, state, empty, draw } = board();
  state.loaded = false;
  draw();
  draw();
  assert.equal(state.writes, 1);
  state.loaded = true;
  context.__boardArgs.board.tasks = [];
  draw();
  draw();
  assert.equal(state.writes, 2);
  assert.equal(state.html, '');
  assert.equal(empty.style.display, '');
  context.__boardArgs.board.tasks = [{ id: 'new-task' }];
  draw();
  assert.equal(state.writes, 3);
  assert.equal(empty.style.display, 'none');
});

test('Changed boards wait for drag and focused form controls before replacing DOM', () => {
  for (const interaction of ['drag', 'SELECT', 'INPUT', 'TEXTAREA']) {
    const { context, document, list, state, draw } = board();
    draw();
    context.__boardArgs.board.tasks[0].status = 'done';
    if (interaction === 'drag') state.dragging = true;
    else document.activeElement = { parent: list, tagName: interaction };
    draw();
    assert.equal(state.writes, 1, interaction);
    assert.equal(state.timers.length, 1, interaction);
    assert.equal(state.timers[0].delay, 150);
    state.dragging = false;
    document.activeElement = null;
    state.timers[0].fn();
    assert.equal(state.writes, 2, interaction);
  }
});

const railScript = source.match(/  function widgetsOf\(col\)[\s\S]*?(?=\r?\n  function paintToggles\()/)?.[0];
assert.ok(railScript, 'The widget rail renderer must exist');

function widget(title, icon) {
  const heading = { textContent: title, querySelector: () => ({ className: icon }) };
  return {
    heading,
    classList: { contains: name => name === 'widget', add() {}, remove() {} },
    querySelector: () => heading,
    scrollIntoView(options) { this.scrolledWith = options; },
  };
}

function widgetRail() {
  const state = { writes: 0, timers: [], behavior: 'smooth' };
  const document = {
    activeElement: null,
    createElement: () => ({ setAttribute(name, value) { this[name] = value; } }),
  };
  const rail = {
    children: [],
    set innerHTML(value) {
      assert.equal(value, '');
      if (this.children.includes(document.activeElement)) document.activeElement = null;
      this.children = [];
      state.writes++;
    },
    appendChild(child) { this.children.push(child); },
  };
  const col = {
    children: [rail, widget('Calendar', 'ti ti-calendar'), widget('Notes', 'ti ti-notes')],
    querySelector: () => rail,
  };
  const context = vm.createContext({
    document,
    setCollapsed: value => { state.collapsed = value; },
    motionBehavior: () => state.behavior,
    setTimeout: (fn, delay) => state.timers.push({ fn, delay }),
  });
  vm.runInContext(railScript, context);
  return { col, rail, document, state, build: () => context.buildRail(col) };
}

test('Unchanged widget shortcuts retain button identities and keyboard focus', () => {
  const { rail, document, state, build } = widgetRail();
  build();
  const button = rail.children[0];
  document.activeElement = button;
  build();
  assert.equal(state.writes, 1);
  assert.equal(rail.children[0], button);
  assert.equal(document.activeElement, button);
});

test('Widget shortcuts update when title, icon, order, or widget identity changes', () => {
  const { col, rail, state, build } = widgetRail();
  build();
  col.children[1].heading.textContent = 'Team calendar';
  build();
  assert.equal(rail.children[0].title, 'Team calendar');
  col.children[1].heading.querySelector = () => ({ className: 'ti ti-calendar-event' });
  build();
  assert.match(rail.children[0].innerHTML, /ti-calendar-event/);
  [col.children[1], col.children[2]] = [col.children[2], col.children[1]];
  build();
  assert.equal(rail.children[0].title, 'Notes');
  col.children[1] = widget('Notes', 'ti ti-notes');
  build();
  assert.equal(state.writes, 5);
});

test('Widget shortcuts respect reduced motion when opening and scrolling', () => {
  const { col, rail, state, build } = widgetRail();
  state.behavior = 'auto';
  build();
  rail.children[0].onclick();
  assert.equal(state.collapsed, false);
  assert.equal(state.timers[0].delay, 0);
  state.timers[0].fn();
  assert.equal(col.children[1].scrolledWith.behavior, 'auto');
  assert.equal(col.children[1].scrolledWith.block, 'center');
});
