import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../assets/ui-render.js', import.meta.url), 'utf8');
function extract(start, end) {
  const begin = source.indexOf(start), finish = source.indexOf(end, begin);
  assert.ok(begin >= 0 && finish > begin);
  return source.slice(begin, finish);
}
function target(id, zIndex = 500) {
  let html = '';
  return {
    id, zIndex, writes: 0, closed: false, classList: { contains: () => true },
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; this.writes++; },
    querySelector() { return { click: () => { this.closed = true; } }; },
  };
}
function event(key, tagName = 'BODY', extra = {}) {
  return { key, target: { tagName }, defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.stopped = true; }, ...extra };
}

test('cached rendering preserves decorated DOM and updates only changed content', () => {
  const context = vm.createContext({window:{}});
  vm.runInContext(renderer, context);
  const node = target('content');
  const setHTML = context.window.MarcomUI.setHTML;
  assert.equal(setHTML(node, '<button>Review</button>'), true);
  node.innerHTML = '<button aria-label="Review">Review</button>';
  for (let i = 0; i < 1000; i++) assert.equal(setHTML(node, '<button>Review</button>'), false);
  assert.equal(node.writes, 2);
  assert.match(node.innerHTML, /aria-label/);
  assert.equal(setHTML(node, '<button>Updated review</button>'), true);
  assert.equal(setHTML(node, ''), true);
  assert.equal(setHTML(node, ''), false);
  assert.equal(setHTML(target('replacement'), ''), true);
});

test('actual overview calendar filters preserve nodes on refresh and update on selection', () => {
  const node = target('ov-cal-filters');
  const context = vm.createContext({window:{}, document:{getElementById:()=>node},
    MORDER:['boss','dew'], nm:w=>w, esc:s=>s, ovCalFilter:'all'});
  vm.runInContext(renderer, context);
  context.MarcomUI = context.window.MarcomUI;
  vm.runInContext(extract('  function calFilters(){', '  function dayData('), context);
  context.calFilters(); context.calFilters();
  assert.equal(node.writes, 1);
  context.ovCalFilter = 'dew';
  context.calFilters();
  assert.equal(node.writes, 2);
  assert.match(node.innerHTML, /class="ov-fpill on" onclick="ovSetCalFilter\('dew'\)"/);
});

function shortcuts() {
  const calls = [];
  const state = { dialog: false, commandOpen: false };
  const context = vm.createContext({
    document:{getElementById:()=>({classList:{contains:()=>state.commandOpen}}),querySelector:()=>state.dialog?{}:null},
    openAdd:()=>calls.push('add'),curTab:()=> 'boss', openCmdk:()=>calls.push('search'),closeCmdk:()=>calls.push('close-search'),
  });
  vm.runInContext(extract('function handleWorkspaceShortcut(e){', "document.addEventListener('keydown',handleWorkspaceShortcut)"),context);
  return { context, calls, state };
}

test('global shortcuts preserve select type-ahead, IME and browser key combinations', () => {
  const { context, calls } = shortcuts();
  for (const e of [event('n','SELECT'), event('n','INPUT'), event('n','BODY',{ctrlKey:true}), event('n','BODY',{metaKey:true}), event('n','BODY',{altKey:true}), event('n','BODY',{isComposing:true})]) {
    context.handleWorkspaceShortcut(e);
    assert.equal(e.defaultPrevented,false);
  }
  assert.deepEqual(calls,[]);
  context.handleWorkspaceShortcut(event('n'));
  context.handleWorkspaceShortcut(event('/'));
  assert.deepEqual(calls,['add','search']);
});

test('a dialog blocks global shortcuts; command-palette Escape is consumed once', () => {
  const { context, calls, state } = shortcuts();
  state.dialog = true;
  context.handleWorkspaceShortcut(event('n'));
  context.handleWorkspaceShortcut(event('k','INPUT',{ctrlKey:true}));
  assert.deepEqual(calls,[]);
  state.commandOpen = true;
  const escape = event('Escape');context.handleWorkspaceShortcut(escape);
  assert.deepEqual(calls,['close-search']);
  assert.equal(escape.stopped,true);
});

test('Escape closes only the highest overlay through its cleanup control', () => {
  const parent = target('modal',500), child = target('resources',700);
  const context = vm.createContext({
    document:{getElementById:()=>null,querySelectorAll:()=>[child,parent]},
    getComputedStyle:e=>({zIndex:String(e.zIndex)}),
  });
  vm.runInContext(extract('  function handleOverlayEscape(e){',"  document.addEventListener('keydown',handleOverlayEscape)"),context);
  const escape = event('Escape');context.handleOverlayEscape(escape);
  assert.equal(child.closed,true);
  assert.equal(parent.closed,false);
  assert.equal(escape.stopped,true);
});

test('legacy confirmation uses its close callback without closing the editor', () => {
  let canceled = false;
  const parent=target('modal',500), confirm=target('confirm-overlay',600);
  const context=vm.createContext({document:{getElementById:()=>null,querySelectorAll:()=>[parent,confirm]},
    getComputedStyle:e=>({zIndex:e.zIndex}), closeConfirm:()=>{canceled=true;}});
  vm.runInContext(extract('  function handleOverlayEscape(e){',"  document.addEventListener('keydown',handleOverlayEscape)"),context);
  context.handleOverlayEscape(event('Escape'));
  assert.equal(canceled,true);
  assert.equal(parent.closed,false);
});
