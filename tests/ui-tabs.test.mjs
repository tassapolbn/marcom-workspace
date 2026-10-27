import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('../assets/ui-tabs.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/workspace-ui.css', import.meta.url), 'utf8');
const step34 = css.slice(css.indexOf('/* Step 34:'));

/* ---------- a small fake page: enough DOM for the tab bar script ---------- */
class FakeNode {
  constructor(type) { this.nodeType = type; this.parentNode = null; this.childNodes = []; }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const list = this.parentNode.childNodes;
    return list[list.indexOf(this) + 1] || null;
  }
  appendChild(node) { return this.insertBefore(node, null); }
  insertBefore(node, ref) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    const at = ref ? this.childNodes.indexOf(ref) : -1;
    if (at < 0) this.childNodes.push(node); else this.childNodes.splice(at, 0, node);
    return node;
  }
  removeChild(node) {
    this.childNodes.splice(this.childNodes.indexOf(node), 1);
    node.parentNode = null;
    return node;
  }
  replaceChild(node, old) { this.insertBefore(node, old); return this.removeChild(old); }
  get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map(n => n.textContent).join(''); }
  set textContent(value) {
    if (this.nodeType === 3) { this.data = String(value); return; }
    this.childNodes.forEach(n => { n.parentNode = null; });
    this.childNodes = [];
    if (String(value)) this.appendChild(new FakeText(String(value)));
  }
}
class FakeText extends FakeNode {
  constructor(data) { super(3); this.data = data; }
  cloneNode() { return new FakeText(this.data); }
}
class FakeElement extends FakeNode {
  constructor(tag) {
    super(1);
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.rect = { left: 0, width: 0, top: 0, height: 0 };
    this.style = { props: {}, setProperty(name, value) { this.props[name] = value; } };
    const self = this;
    this.classList = {
      contains: name => self.classes().includes(name),
      add: (...names) => self.attrs.set('class', [...new Set([...self.classes(), ...names])].join(' ')),
      remove: (...names) => self.attrs.set('class', self.classes().filter(c => !names.includes(c)).join(' ')),
    };
  }
  classes() { return (this.attrs.get('class') || '').split(/\s+/).filter(Boolean); }
  get className() { return this.attrs.get('class') || ''; }
  set className(value) { this.attrs.set('class', value); }
  get id() { return this.attrs.get('id') || ''; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  get firstElementChild() { return this.childNodes.find(n => n.nodeType === 1) || null; }
  get nextElementSibling() { let n = this.nextSibling; while (n && n.nodeType !== 1) n = n.nextSibling; return n; }
  cloneNode(deep) {
    const copy = new FakeElement(this.tagName);
    this.attrs.forEach((v, k) => copy.attrs.set(k, v));
    if (deep) this.childNodes.forEach(n => copy.appendChild(n.cloneNode(true)));
    return copy;
  }
  all() {
    const out = [];
    const walk = node => node.childNodes.forEach(n => { if (n.nodeType === 1) { out.push(n); walk(n); } });
    walk(this);
    return out;
  }
  matches(selector) {
    if (selector === '[id]') return this.hasAttribute('id');
    return selector.split('.').filter(Boolean).every(c => this.classList.contains(c));
  }
  querySelectorAll(selector) { return this.all().filter(e => e.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener() {}
  getBoundingClientRect() { return this.rect; }
  get clientLeft() { return 0; }
  get scrollLeft() { return 0; }
}

function el(tag, className, children = []) {
  const e = new FakeElement(tag);
  if (className) e.className = className;
  children.forEach(c => e.appendChild(typeof c === 'string' ? new FakeText(c) : c));
  return e;
}

/* A tab bar like the real one: Overview, Boss, Dew, O, Eye; Boss selected. */
function page({ reducedMotion = false, registerProperty = true } = {}) {
  const listeners = {};
  const root = el('html');
  const document = {
    readyState: 'complete', documentElement: root,
    createElement: tag => new FakeElement(tag),
    querySelector: () => null,
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const nav = el('nav', 'tab-nav');
  nav.rect = { left: 30, width: 440, top: 60, height: 44 };
  const names = [['overview', 'Overview'], ['boss', 'Boss'], ['dew', 'Dew'], ['o', 'O'], ['junior', 'Eye']];
  const widths = [114, 84, 82, 64, 76];
  let x = 34;
  const tabs = names.map(([id, name], i) => {
    const mono = el('span', 'tab-mono', id === 'overview' ? [el('svg')] : []);
    if (id === 'overview') mono.setAttribute('data-mark', '');
    const label = el('span', 'tab-name', [name]);
    if (id !== 'boss' && id !== 'overview') label.setAttribute('id', id + '-tablabel');
    const btn = el('button', 'tab-btn' + (id === 'boss' ? ' a-active' : ''), [mono, el('i', 'ti'), label]);
    btn.setAttribute('id', 'tab-' + id);
    btn.rect = { left: x, width: widths[i], top: 64, height: 36 };
    x += widths[i] + 2;
    nav.appendChild(btn);
    return btn;
  });
  let frames = [];
  const window = {
    document,
    CSS: registerProperty ? { registerProperty() {} } : {},
    matchMedia: () => ({ matches: reducedMotion }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
    cancelAnimationFrame() {},
    performance: { now: () => 1000 },
    addEventListener() {},
  };
  const context = vm.createContext({ window });
  vm.runInContext(script, context);
  const api = window.MarcomTabs;
  const flush = () => { const run = frames; frames = []; run.forEach(fn => fn()); };
  const engage = () => (listeners.pointerdown || []).forEach(fn => fn());
  const select = id => {
    tabs.forEach(t => t.classList.remove('a-active'));
    tabs.find(t => t.id === 'tab-' + id).classList.add('a-active');
    return [{ type: 'attributes', target: tabs[0], attributeName: 'class', addedNodes: [], removedNodes: [] }];
  };
  return { api, nav, tabs, root, flush, engage, select };
}

/* ---------- the script ---------- */
test('the dock monogram is the first letter of the name, for any name', () => {
  const { api } = page();
  assert.equal(api.initialOf('Boss'), 'B');
  assert.equal(api.initialOf('  eye '), 'E');
  assert.equal(api.initialOf('นก'), 'น', 'a Thai name');
  assert.equal(api.initialOf('😀 Joy'), '😀', 'never half a character');
  assert.equal(api.initialOf(''), '');
  assert.equal(api.initialOf(null), '');
});

test('the view enters from the side you moved towards', () => {
  const { api } = page();
  assert.equal(api.direction(1, 3), 'next');
  assert.equal(api.direction(3, 0), 'prev');
  assert.equal(api.direction(2, 2), '');
  assert.equal(api.direction(-1, 2), '', 'no earlier tab, no direction');
});

test('attaching adds one hidden indicator and a hidden colour copy of every tab', () => {
  const { api, nav, tabs } = page();
  api.attach(nav);
  api.attach(nav);
  const indicators = nav.childNodes.filter(n => n.classList && n.classList.contains('tab-ind'));
  assert.equal(indicators.length, 1, 'attaching twice still leaves one indicator');
  assert.equal(nav.firstChild, indicators[0]);
  assert.equal(indicators[0].getAttribute('aria-hidden'), 'true');
  for (const tab of tabs) {
    const inks = tab.childNodes.filter(n => n.classList && n.classList.contains('tab-ink'));
    assert.equal(inks.length, 1, tab.id + ' has one copy');
    assert.equal(inks[0].getAttribute('aria-hidden'), 'true', 'screen readers skip the copy');
    assert.equal(inks[0].querySelectorAll('[id]').length, 0, 'the copy duplicates no id');
    assert.equal(inks[0].querySelector('.tab-name').textContent, tab.querySelector('.tab-name').textContent);
  }
  assert.equal(tabs[1].querySelector('.tab-mono').textContent, 'B');
  assert.equal(tabs[3].querySelector('.tab-mono').textContent, 'O');
  assert.equal(tabs[4].querySelector('.tab-mono').textContent, 'E', 'Eye, from the junior tab');
  assert.equal(tabs[0].querySelector('.tab-mono').textContent, '', 'the Overview mark is left alone');
});

test('the indicator is placed under the selected tab without sliding on first show', () => {
  const { api, nav, tabs, root, flush } = page();
  api.attach(nav);
  assert.equal(nav.style.props['--ind-x'], '120px', 'Boss starts 120px from the bar edge');
  assert.equal(nav.style.props['--ind-w'], '84px');
  assert.equal(tabs[2].style.props['--tab-x'], '206px', 'every tab knows where it sits');
  assert.ok(nav.classList.contains('has-ind'));
  assert.ok(nav.classList.contains('ind-snap'), 'first show is placed, not animated');
  flush(); flush();
  assert.ok(!nav.classList.contains('ind-snap'), 'motion is allowed again two frames later');
  assert.equal(root.getAttribute('data-tab-dir'), null);
});

test('a switch the person makes glides, and records its direction', () => {
  const { api, nav, root, flush, engage, select } = page();
  const bar = api.attach(nav);
  flush(); flush();
  bar.sync(select('o'));
  assert.equal(root.getAttribute('data-tab-dir'), null, 'start-up selections are placed, not animated');
  assert.ok(nav.classList.contains('ind-snap'));
  flush(); flush();
  engage();
  bar.sync(select('junior'));
  assert.equal(root.getAttribute('data-tab-dir'), 'next');
  assert.ok(!nav.classList.contains('ind-snap'), 'it glides');
  assert.equal(nav.style.props['--ind-x'], '356px');
  assert.equal(nav.style.props['--ind-w'], '76px', 'and takes the new tab\'s width');
  bar.sync(select('overview'));
  assert.equal(root.getAttribute('data-tab-dir'), 'prev');
  assert.equal(nav.style.props['--ind-x'], '4px');
});

test('Reduce Motion, or a browser that cannot glide, places the indicator at once', () => {
  for (const options of [{ reducedMotion: true }, { registerProperty: false }]) {
    const { api, nav, flush, engage, select } = page(options);
    const bar = api.attach(nav);
    flush(); flush(); engage();
    bar.sync(select('dew'));
    assert.ok(nav.classList.contains('ind-snap'), JSON.stringify(options));
    assert.equal(nav.style.props['--ind-x'], '206px');
  }
});

test('a renamed member gets a matching monogram, and the copy follows', () => {
  const { api, nav, tabs } = page();
  const bar = api.attach(nav);
  const label = tabs[2].querySelector('.tab-name');
  label.textContent = 'Nok';
  bar.sync([{ type: 'childList', target: label, addedNodes: [], removedNodes: [] }]);
  assert.equal(tabs[2].querySelector('.tab-mono').textContent, 'N');
  assert.equal(tabs[2].querySelector('.tab-ink').querySelector('.tab-name').textContent, 'Nok');
});

test('the script ignores its own changes, so it never loops', () => {
  const { api, nav, tabs } = page();
  const bar = api.attach(nav);
  const ink = tabs[2].querySelector('.tab-ink');
  bar.sync([
    { type: 'childList', target: tabs[2], addedNodes: [ink], removedNodes: [ink] },
    { type: 'attributes', target: nav, attributeName: 'class', addedNodes: [], removedNodes: [] },
    { type: 'attributes', target: tabs[2], attributeName: 'style', addedNodes: [], removedNodes: [] },
  ]);
  assert.equal(tabs[2].querySelector('.tab-ink'), ink, 'the copy was not rebuilt');
});

/* ---------- the page ---------- */
test('every tab carries a monogram for the dock and its name in its own element', () => {
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover">/,
    'the page may reach the screen edges, so the dock can sit clear of the home bar');
  assert.match(html, /id="tab-boss"><span class="tab-mono" aria-hidden="true">B<\/span><i class="ti ti-user"><\/i><span class="tab-name">Boss<\/span><\/button>/);
  assert.match(html, /b\.innerHTML='<span class="tab-mono" aria-hidden="true"><\/span><i class="ti '\+MEMBERS\[w\]\.icon\+'"><\/i><span class="tab-name" id="'\+w\+'-tablabel"><\/span>';/);
  assert.match(html, /b\.firstChild\.textContent=tabLabel\(w\)\.charAt\(0\)\.toUpperCase\(\);/, 'member tabs start with their initial');
  assert.match(html, /<span class="tab-mono" data-mark aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false">(<rect [^>]+\/>){4}<\/svg><\/span><i class="ti ti-layout-dashboard"><\/i><span class="tab-name">Overview<\/span>/,
    'Overview has a four-square mark drawn inline, not from the icon font');
  const motion = html.indexOf('<script src="assets/ui-motion.js"></script>');
  assert.ok(motion > 0 && html.indexOf('<script src="assets/ui-tabs.js"></script>') > motion);
});

test('one pair of animated variables drives both the indicator and the colour copy', () => {
  assert.match(step34, /@property --ind-x\{syntax:'<length>';inherits:true;initial-value:0px;\}/);
  assert.match(step34, /@property --ind-w\{syntax:'<length>';inherits:true;initial-value:0px;\}/);
  const pill = step34.match(/\.tab-nav \.tab-ind\{([^}]*)\}/)[1];
  assert.match(pill, /width:var\(--ind-w\);/);
  assert.match(pill, /transform:translateX\(var\(--ind-x\)\);/);
  const clip = 'inset(0 calc(100% - var(--ind-x) - var(--ind-w) + var(--tab-x,0px)) 0 calc(var(--ind-x) - var(--tab-x,0px)) round var(--ind-r))';
  assert.ok(step34.includes('-webkit-clip-path:' + clip) && step34.includes(' clip-path:' + clip), 'the copy is clipped to exactly where the indicator is');
  assert.match(step34, /\.tab-nav\.has-ind\{transition-property:--ind-x,--ind-w;transition-duration:\.34s;/);
  assert.match(step34, /transition-timing-function:linear\(0,[^)]*,1\);/, 'a spring curve that settles exactly on the tab');
  assert.match(step34, /\.tab-nav:not\(\.has-ind\) \.tab-ind,\.tab-nav:not\(\.has-ind\) \.tab-ink\{display:none;\}/, 'without the script, the old look stays');
  assert.match(step34, /html:not\(\.dark\) \.tab-nav\.has-ind \.tab-btn:is\(#tab-overview,#tab-boss,#tab-best,#tab-dew,#tab-o,#tab-junior\)\.a-active,/);
});

test('Reduce Motion stops the glide and the slide; the slide never widens the page', () => {
  const reduce = step34.slice(step34.indexOf('@media(prefers-reduced-motion:reduce){'));
  assert.match(reduce, /html\[data-tab-dir\] \.tab-panel\.active\{animation:none;\}/);
  assert.match(reduce, /\.tab-nav,\.tab-nav \.tab-btn,\.tab-nav \.tab-ink,\.tab-nav \.tab-ink \.tab-mono\{transition:none!important;\}/);
  assert.match(step34, /html\[data-tab-dir="next"\] \.tab-panel\.active\{animation:tab-in-next /);
  assert.match(step34, /@keyframes tab-in-prev\{from\{opacity:0;transform:translateX\(-16px\);\}/);
  assert.match(step34, /html,body\{overflow-x:clip;\}/, 'a wider page would zoom a phone out and drop the dock');
});

test('on iPhone the dock clears the home bar, lifts the floating buttons and fits five 44pt slots at 320', () => {
  const phone = step34.slice(step34.indexOf('@media(max-width:600px){'));
  assert.match(phone, /:root\{--dock-h:max\(44px,calc\(64px - env\(safe-area-inset-bottom,0px\)\)\);\}/);
  const dock = phone.match(/\.tab-nav\{position:fixed;([^}]*)\}/)[1];
  assert.match(dock, /left:max\(10px,env\(safe-area-inset-left,0px\)\);right:max\(10px,env\(safe-area-inset-right,0px\)\);/);
  assert.match(dock, /bottom:max\(10px,calc\(env\(safe-area-inset-bottom,0px\) - 10px\)\);/);
  const height = +dock.match(/height:(\d+)px/)[1], pad = +dock.match(/padding:(\d+)px/)[1], gap = +dock.match(/gap:(\d+)px/)[1];
  assert.ok(height - 2 * pad >= 44, 'slots are at least 44pt tall');
  const width = 320 - 2 * 10, slot = (width - 2 * pad - 4 * gap) / 5;
  assert.ok(slot >= 44, 'five slots at 320 are ' + slot.toFixed(1) + 'pt wide');
  /* The dock's top above the bottom edge, with and without a home bar; Team Chat
     rests 22px above the lift (step 33). */
  for (const inset of [0, 34]) {
    const top = Math.max(10, inset - 10) + height, lift = Math.max(44, 64 - inset) + inset;
    assert.ok(22 + lift >= top + 10, 'the floating buttons rest above the dock (inset ' + inset + ')');
  }
  assert.match(phone, /html\.dark \.app-header\{-webkit-backdrop-filter:none;backdrop-filter:none;/, 'a blurred header would trap the dock');
});

/* WCAG contrast, for the colours the selected tab is drawn in. */
function contrast(a, b) {
  const lum = hex => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('the selected tab reads at AA in the school gold and in each member colour', () => {
  assert.match(step34, /html:not\(\.dark\) body\.theme-overview \.tab-nav\{--tab-ink:#8a5b00;--tab-disc:#f0b323;--tab-on:#003057;\}/);
  assert.ok(contrast('#8a5b00', '#ffffff') >= 4.5, 'Overview on the white pill');
  assert.ok(contrast('#003057', '#f0b323') >= 4.5, 'the navy mark on the gold disc');
  assert.match(step34, /html:not\(\.dark\) \.tab-nav\{--tab-ink:var\(--accent-ink,#003057\);--tab-disc:var\(--accent-ink,#003057\);--tab-on:#fff;\}/,
    'members use their own ink, so saved custom colours carry through');
  for (const [who, ink] of [['dew', '#b16018'], ['o', '#c2410c'], ['junior', '#14532d'], ['boss', '#1f3a5f']]) {
    assert.match(html, new RegExp('body\\.theme-' + who + '\\{[^}]*--accent-ink:' + ink), who + ' ink is ' + ink);
    assert.ok(contrast(ink, '#ffffff') >= 4.5, who + ' on the white pill, and white on its disc');
  }
});

test('a phone on its side keeps the page, the buttons and the drawer clear of the notch', () => {
  assert.match(step34, /body\{padding-left:env\(safe-area-inset-left,0px\);padding-right:env\(safe-area-inset-right,0px\);\}/);
  assert.match(step34, /\.app-header\{margin-left:calc\(-1 \* env\(safe-area-inset-left,0px\)\);margin-right:calc\(-1 \* env\(safe-area-inset-right,0px\)\);\}/,
    'the header colour still reaches the screen edge');
  assert.match(html, /\.app-header\{z-index:300;padding-left:env\(safe-area-inset-left\);padding-right:env\(safe-area-inset-right\);padding-top:env\(safe-area-inset-top\)/,
    'while its contents keep their own clearance');
  assert.match(step34, /\.chat-fab,\.quickadd-fab,\.chat-panel\{right:calc\(22px \+ env\(safe-area-inset-right,0px\)\);\}/);
  assert.match(step34, /\.tab-panel \.two-col>\.side-col\{padding-right:max\(14px,env\(safe-area-inset-right,0px\)\);padding-bottom:max\(24px,env\(safe-area-inset-bottom,0px\)\);\}/);
});
