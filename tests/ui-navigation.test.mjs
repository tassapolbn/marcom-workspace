import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const navigation = source.slice(source.indexOf('function switchTab(t){'), source.indexOf('function switchSub('));

function element(id, classes = []) {
  const values = new Set(classes);
  return {
    id, attributes: {}, removedActive: 0, tabIndex: 0,
    classList: {
      contains: name => values.has(name),
      toggle(name, on) { if (on) values.add(name); else values.delete(name); },
      remove(...names) { names.forEach(name => values.delete(name)); },
      add: name => values.add(name),
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    closest() { return null; },
  };
}

function fixture() {
  const names = ['overview', 'boss', 'dew', 'o', 'junior'];
  const tabs = names.map(name => element('tab-' + name));
  const panels = names.map(name => element('panel-' + name));
  const body = element('body', ['theme-overview']);
  const context = vm.createContext({
    document: {
      body,
      getElementById: id => [...tabs, ...panels].find(e => e.id === id),
      querySelectorAll: selector => selector === '.tab-btn' ? tabs : panels,
      addEventListener() {},
    },
    window: { matchMedia: () => ({ matches: false }) },
  });
  vm.runInContext(navigation, context);
  return { context, tabs, panels, body };
}

test('all workspaces share one selected state and an associated accessible panel', () => {
  const { context, tabs, panels, body } = fixture();
  for (const name of ['boss', 'dew', 'o', 'junior', 'overview', 'boss']) {
    context.switchTab(name);
    assert.deepEqual(tabs.filter(t => t.classList.contains('a-active')).map(t => t.id), ['tab-' + name]);
    assert.deepEqual(panels.filter(p => p.classList.contains('active')).map(p => p.id), ['panel-' + name]);
    assert.deepEqual(tabs.filter(t => t.attributes['aria-selected'] === 'true').map(t => t.id), ['tab-' + name]);
    assert.deepEqual(tabs.filter(t => t.tabIndex === 0).map(t => t.id), ['tab-' + name]);
    assert.equal(body.classList.contains('theme-overview'), name === 'overview');
    assert.equal(tabs.find(t => t.id === 'tab-' + name).attributes['aria-controls'], 'panel-' + name);
  }
});

test('unknown workspace leaves the current screen selected', () => {
  const { context, tabs, panels } = fixture();
  context.switchTab('boss');
  context.switchTab('missing');
  assert.ok(tabs[1].classList.contains('a-active'));
  assert.ok(panels[1].classList.contains('active'));
});

test('selecting the current workspace never removes its active class', () => {
  const { context, panels } = fixture();
  context.switchTab('boss');
  const panel = panels[1], toggle = panel.classList.toggle;
  panel.classList.toggle = (name, on) => {
    if (name === 'active') assert.equal(on, true, 'do not restart the panel animation');
    toggle(name, on);
  };
  panel.classList.remove = () => assert.fail('do not detach the active state');
  context.switchTab('boss');
});

test('motion preference controls programmatic scrolling', () => {
  const { context } = fixture();
  assert.equal(context.motionBehavior(), 'smooth');
  context.window.matchMedia = () => ({ matches: true });
  assert.equal(context.motionBehavior(), 'auto');
});

test('saved custom colours meet contrast targets and cannot restyle selection', () => {
  const script = source.match(/<script id="theme-picker-2026">([\s\S]*?)<\/script>/)[1];
  const functions = script.slice(script.indexOf('(function(){') + '(function(){'.length, script.indexOf('  function getDb()'));
  let style;
  const context = vm.createContext({ document: {
    getElementById: () => style,
    createElement: () => ({}),
    body: { appendChild: element => { style = element; } },
  } });
  vm.runInContext(functions + "\nchosen.boss='#4B8FD0';apply();", context);
  const css = style.textContent;
  const header = css.match(/html:not\(\.dark\) \.tab-nav[^{}]+\{color:(#[a-f\d]+)!important;\}/i)[1];
  context.colour = header;
  assert.ok(vm.runInContext("ratio(rgb(colour),rgb('#31566A'))", context) >= 4.5);
  assert.ok(vm.runInContext("ratio(rgb(readable('#4B8FD0','#26374b',4.5)),rgb('#26374b'))", context) >= 4.5);
  assert.equal(css.includes('border-bottom-color'), false);
  for (const rule of css.matchAll(/([^{}]*\.tab-nav[^{}]*)\{/g)) {
    assert.ok(rule[1].includes(':not(.a-active)'), 'custom header rules must exclude the selected tab');
  }
});

test('every inline application script parses', () => {
  const scripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m => !/\bsrc=/.test(m[1]));
  assert.ok(scripts.length > 10);
  for (const [index, script] of scripts.entries()) new vm.Script(script[2], { filename: 'index.html inline script ' + index });
});
