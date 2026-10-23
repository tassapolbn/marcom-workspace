import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/ui-motion.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function element(doc, classes = []) {
  const names = new Set(classes);
  const listeners = {};
  return {
    ownerDocument: doc, children: [], attributes: {}, style: { overflow: 'visible' },
    animations: [], measurements: 0,
    classList: {
      contains: name => names.has(name),
      add: name => names.add(name),
      remove: name => names.delete(name),
      toggle(name, force = !names.has(name)) {
        if (force) names.add(name); else names.delete(name);
        return force;
      },
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    focus() { doc.activeElement = this; },
    contains(node) { return node === this || this.children.some(child => child.contains(node)); },
    querySelectorAll(selector) { this.selector = selector; return this.children; },
    getBoundingClientRect() {
      this.measurements++;
      return { height: this.liveHeight ?? (names.has('collapsed') ? 40 : 180) };
    },
    animate(frames, options) {
      const animation = {
        frames: plain(frames), options: plain(options), cancelled: false,
        cancel() { this.cancelled = true; this.oncancel?.(); },
        finish() { this.onfinish?.(); },
      };
      this.animations.push(animation);
      return animation;
    },
    addEventListener(type, callback, capture) { (listeners[type] ||= []).push({ callback, capture }); },
    removeEventListener(type, callback, capture) {
      listeners[type] = (listeners[type] || []).filter(entry => entry.callback !== callback || entry.capture !== capture);
    },
    dispatch(type, extra = {}) {
      const event = { target: this, prevented: false, stopped: false, ...extra,
        preventDefault() { this.prevented = true; },
        stopImmediatePropagation() { this.stopped = true; } };
      for (const { callback } of [...(listeners[type] || [])]) {
        callback(event);
        if (event.stopped) break;
      }
      return event;
    },
    listeners,
  };
}

function setup({ reduced = false, media = true } = {}) {
  const document = element();
  const window = { document };
  if (media) window.matchMedia = query => {
    assert.equal(query, '(prefers-reduced-motion: reduce)');
    return { matches: reduced };
  };
  window.window = window;
  vm.runInContext(source, vm.createContext(window));
  return { api: window.MarcomMotion, document, window, node: classes => element(document, classes) };
}

test('reduced motion changes state immediately without measuring or animating', () => {
  const h = setup({ reduced: true });
  const node = h.node();
  assert.equal(h.api.reduced(), true);
  assert.equal(h.api.toggle(node, 'collapsed'), true);
  assert.equal(node.classList.contains('collapsed'), true);
  assert.equal(node.animations.length, 0);
  assert.equal(node.measurements, 0);
  assert.equal(h.api.toggle(node, 'collapsed'), false);
});

test('collapse keeps content visible until finish and restores inline overflow', () => {
  const h = setup();
  const node = h.node();
  assert.equal(h.api.toggle(node, 'collapsed'), true);
  assert.equal(node.classList.contains('collapsed'), false);
  assert.equal(node.style.overflow, 'hidden');
  const animation = node.animations[0];
  assert.deepEqual(animation.frames, [{ height: '180px' }, { height: '40px' }]);
  assert.deepEqual(animation.options, { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  assert.equal(Object.hasOwn(node.style, 'height'), false);
  animation.finish();
  assert.equal(node.classList.contains('collapsed'), true);
  assert.deepEqual(node.style, { overflow: 'visible' });
});

test('expansion applies state immediately and fades the revealed elements', () => {
  const h = setup();
  const node = h.node(['collapsed']);
  node.children = [h.node(), h.node()];
  assert.equal(h.api.toggle(node, 'collapsed', false, { reveal: ':scope>.widget-body' }), false);
  assert.equal(node.classList.contains('collapsed'), false);
  assert.deepEqual(node.animations[0].frames, [{ height: '40px' }, { height: '180px' }]);
  assert.equal(node.selector, ':scope>.widget-body');
  for (const child of node.children) {
    assert.deepEqual(child.animations[0].frames, [
      { opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' },
    ]);
    assert.deepEqual(child.animations[0].options, node.animations[0].options);
  }
  node.animations[0].finish();
  assert.deepEqual(node.style, { overflow: 'visible' });
});

test('mid-collapse toggles cancel the first animation and ignore stale callbacks', () => {
  const h = setup();
  const node = h.node();
  h.api.toggle(node, 'collapsed');
  const first = node.animations[0];
  const staleFinish = first.onfinish;
  assert.equal(h.api.toggle(node, 'collapsed'), false);
  assert.equal(first.cancelled, true);
  staleFinish();
  assert.equal(node.classList.contains('collapsed'), false);
  assert.deepEqual(node.style, { overflow: 'visible' });
});

test('reversing expansion cancels reveal animations and finishes the latest collapse', () => {
  const h = setup();
  const node = h.node(['collapsed']);
  const child = h.node();
  node.children = [child];
  h.api.toggle(node, 'collapsed', false, { reveal: '.body' });
  const first = node.animations[0];
  assert.equal(h.api.toggle(node, 'collapsed', true), true);
  assert.equal(first.cancelled, true);
  assert.equal(child.animations[0].cancelled, true);
  first.finish();
  assert.equal(node.style.overflow, 'hidden');
  node.animations[1].finish();
  assert.equal(node.classList.contains('collapsed'), true);
  assert.deepEqual(node.style, { overflow: 'visible' });
});

test('explicit last request can reverse a pending collapse even before its class changes', () => {
  const h = setup();
  const node = h.node();
  h.api.toggle(node, 'collapsed', true);
  h.api.toggle(node, 'collapsed', false);
  node.animations[0].finish();
  assert.equal(node.classList.contains('collapsed'), false);
  assert.equal(node.animations[0].cancelled, true);
});

test('external cancellation restores overflow and commits the requested state', () => {
  const h = setup();
  const node = h.node();
  node.style.overflow = '';
  h.api.toggle(node, 'collapsed');
  node.animations[0].cancel();
  assert.equal(node.classList.contains('collapsed'), true);
  assert.deepEqual(node.style, { overflow: '' });
});

test('force matching the current or pending state is a no-op', () => {
  const h = setup();
  const node = h.node();
  assert.equal(h.api.toggle(node, 'collapsed', false), false);
  assert.equal(node.measurements, 0);
  assert.equal(node.animations.length, 0);
  h.api.toggle(node, 'collapsed', true);
  const measurements = node.measurements;
  assert.equal(h.api.toggle(node, 'collapsed', true), true);
  assert.equal(node.measurements, measurements);
  assert.equal(node.animations.length, 1);
  assert.equal(node.animations[0].cancelled, false);
  node.animations[0].finish();
  assert.equal(h.api.toggle(node, 'collapsed', true), true);
  assert.equal(node.measurements, measurements);
});

test('missing Web Animations toggles instantly and missing matchMedia means no preference', () => {
  const h = setup({ media: false });
  const node = h.node();
  delete node.animate;
  assert.equal(h.api.reduced(), false);
  assert.equal(h.api.toggle(node, 'collapsed'), true);
  assert.equal(node.classList.contains('collapsed'), true);
  assert.equal(node.measurements, 0);
});

test('equal heights keep the new class without animations or style changes', () => {
  const h = setup();
  const node = h.node();
  node.liveHeight = 100;
  h.api.toggle(node, 'collapsed');
  assert.equal(node.classList.contains('collapsed'), true);
  assert.equal(node.animations.length, 0);
  assert.deepEqual(node.style, { overflow: 'visible' });
});

test('animate option measures a separate dock while class and reveal belong to the owner', () => {
  const h = setup();
  const body = h.node();
  const dock = h.node();
  body.children = [h.node()];
  body.classList.add('collapsed');
  dock.getBoundingClientRect = () => ({ height: body.classList.contains('collapsed') ? 40 : 180 });
  h.api.toggle(body, 'collapsed', false, { animate: dock, reveal: '#dock .strip' });
  assert.equal(body.animations.length, 0);
  assert.equal(body.measurements, 0);
  assert.equal(body.selector, '#dock .strip');
  assert.deepEqual(dock.animations[0].frames, [{ height: '40px' }, { height: '180px' }]);
  dock.animations[0].finish();
  assert.deepEqual(dock.style, { overflow: 'visible' });
});

function menuSetup(opts = {}) {
  const h = setup();
  const trigger = h.node();
  const panel = h.node();
  panel.children = [h.node(), h.node(), h.node()];
  const menu = h.api.menu(trigger, panel, opts);
  return { ...h, trigger, panel, menu };
}

test('menu opening sets class and aria, optionally focuses first, and calls callbacks once', () => {
  const calls = [];
  const h = menuSetup({ focusFirst: true, onOpen: () => calls.push('open'), onClose: () => calls.push('close') });
  h.menu.open();
  h.menu.open();
  assert.equal(h.menu.isOpen(), true);
  assert.equal(h.panel.classList.contains('open'), true);
  assert.equal(h.trigger.attributes['aria-expanded'], 'true');
  assert.equal(h.document.activeElement, h.panel.children[0]);
  assert.equal(h.panel.selector, 'button, a[href], [role=menuitem]');
  h.menu.toggle();
  h.menu.close();
  assert.equal(h.menu.isOpen(), false);
  assert.equal(h.trigger.attributes['aria-expanded'], 'false');
  assert.deepEqual(calls, ['open', 'close']);
  h.menu.toggle();
  assert.equal(h.menu.isOpen(), true);
});

test('Escape closes the menu, consumes the event, restores focus and removes listeners', () => {
  const h = menuSetup();
  h.menu.open();
  assert.equal(h.document.listeners.keydown[0].capture, true);
  const event = h.document.dispatch('keydown', { key: 'Escape', target: h.panel.children[0] });
  assert.equal(h.menu.isOpen(), false);
  assert.equal(h.trigger.attributes['aria-expanded'], 'false');
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.document.listeners.keydown.length, 0);
  assert.equal(h.document.listeners.pointerdown.length, 0);
});

test('outside pointerdown closes the menu while panel and trigger descendants stay open', () => {
  const h = menuSetup();
  h.trigger.children = [h.node()];
  h.menu.open();
  for (const target of [h.panel, h.panel.children[0], h.trigger, h.trigger.children[0]]) {
    h.document.dispatch('pointerdown', { target });
    assert.equal(h.menu.isOpen(), true);
  }
  h.document.dispatch('pointerdown', { target: h.node() });
  assert.equal(h.menu.isOpen(), false);
});

test('ArrowDown and ArrowUp move and wrap menu focus without affecting outside controls', () => {
  const h = menuSetup();
  h.menu.open();
  assert.equal(h.document.activeElement, undefined);
  h.trigger.focus();
  function arrow(key, target = h.document.activeElement) {
    return h.document.dispatch('keydown', { key, target });
  }
  assert.equal(arrow('ArrowDown').prevented, true);
  assert.equal(h.document.activeElement, h.panel.children[0]);
  arrow('ArrowDown');
  assert.equal(h.document.activeElement, h.panel.children[1]);
  arrow('ArrowUp');
  assert.equal(h.document.activeElement, h.panel.children[0]);
  arrow('ArrowUp');
  assert.equal(h.document.activeElement, h.panel.children[2]);
  arrow('ArrowDown');
  assert.equal(h.document.activeElement, h.panel.children[0]);
  assert.equal(arrow('ArrowDown', h.node()).prevented, false);
});

test('empty menus support focusFirst and arrow navigation', () => {
  const h = menuSetup({ focusFirst: true });
  h.panel.children = [];
  assert.doesNotThrow(() => h.menu.open());
  assert.doesNotThrow(() => h.document.dispatch('keydown', { key: 'ArrowUp', target: h.trigger }));
  h.menu.close();
});
