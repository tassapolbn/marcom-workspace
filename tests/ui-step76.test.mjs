import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/workspace-ui.css','utf8').split('/* Step 76:')[1];
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
function dates(){
  class FixedDate extends Date {constructor(...args){super(...(args.length?args:['2026-10-29T12:00:00']));}}
  const c=vm.createContext({Date:FixedDate});
  vm.runInContext(slice('function fmtDate(', 'function todayStr('),c);
  return c;
}
test('step 76 formats dates with Sep and a year only outside the current year',()=>{
  const c=dates();
  for(const [input,expected] of [['2026-10-29','29 Oct'],['2027-01-03','3 Jan 2027'],['2025-09-20','20 Sep 2025'],['2026-09-20','20 Sep'],['',''],['invalid','']])assert.equal(c.fmtDate(input),expected);
  assert.equal(vm.runInContext("fmtDate(new Date('2026-10-29T09:30:00'))",c),'29 Oct');
});
test('step 76 uses complete relative wording across today, tomorrow and overdue',()=>{
  const c=dates();
  for(const [input,expected] of [['2026-10-31','2 days left'],['2026-10-30','1 day left'],['2026-10-29','Due today'],['2026-10-27','Overdue'],['','']])assert.equal(c.fmtDue(input),expected);
  assert.match(html,/Overdue · was due '\+fmtDate\(task.dueDate\)/);
  assert.doesNotMatch(html,/\+'d left'|\+'d late'|cd='in '\+dys\+'d'/);
});
test('step 76 calls the first person sub-tab All Tasks for every person',()=>{
  const c=vm.createContext({MEMBERS:{dew:{},o:{},junior:{}}});
  vm.runInContext(slice('function memberPanelHTML(', 'function renderDewWidgets(').split('\nfunction ')[0],c);
  for(const w of ['dew','o','junior'])assert.match(c.memberPanelHTML(w),/class="sub-tab act st-tasks"[^>]*><i[^>]*><\/i> All Tasks<\/button>/);
  assert.match(html,/class="sub-tab act act-boss st-tasks"[^>]*><i[^>]*><\/i> All Tasks<\/button>/);
});
test('step 76 animates increased column counts after arrivals, keeping identical snapshots intact',()=>{
  const make=(status,n)=>({dataset:{status},querySelector:()=>({textContent:String(n),classList:{add:x=>marks.push([status,x])}})});
  const marks=[];let columns=[make('pending',2),make('done',1)],writes=0;
  const list={querySelectorAll:()=>columns,set innerHTML(value){writes++;columns=[make('pending',1),make('done',2)];}};
  const c=vm.createContext({});vm.runInContext(slice('function setBoardHTML(', 'function drawBoard('),c);
  c.setBoardHTML(list,'changed');c.setBoardHTML(list,'changed');
  assert.deepEqual(marks,[['done','kb-count-tick']]);assert.equal(writes,1);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.kb-count-tick\{animation:none;\}\}/);
});
test('step 76 mobile polish keeps labels and Widgets visible, with quiet list links and pretty titles',()=>{
  assert.match(css,/\.task-card \.task-topic\{text-wrap:pretty;/);
  assert.match(css,/min-height:0;height:auto;padding:3px 0/);
  assert.match(css,/\.mh-l\{position:static;width:auto;height:auto/);
  assert.match(css,/\.sub-nav\{gap:0;padding:4px 0;overflow:visible/);
  assert.match(css,/body::after\{content:'';position:fixed;z-index:389/);
  assert.match(css,/\.ov-ann-list\{display:flex;flex-direction:column;gap:6px/);
  assert.match(slice('function openAdd(', 'function openEdit('),/getElementById\('m-topic'\)\.focus\(\{preventScroll:true\}\)/);
});
test('opening cover still reads the saved theme before any blocking stylesheet',()=>{
  const head=html.slice(0,html.indexOf('<body>'));
  assert.ok(head.indexOf("localStorage.getItem('bb_dark')")<head.indexOf('<style id="boot-cover-style">'));
  assert.match(head,/html:not\(\.booted\),html.dark:not\(\.booted\)\{background:#00223C;/);
});

test('step 76 displays a Director deadline from its structured date without rewriting the record',()=>{
  const c=dates();vm.runInContext(slice('  function requestText(', '  /* The admin sees every request;'),c);
  const note={action:'deadline',actionLabel:'Needs to be done by',sentence:'Needs to be done by 20 Sept 2026',value:'2026-09-20'};
  assert.equal(c.requestText(note),'Needs to be done by 20 Sep');
  assert.equal(note.sentence,'Needs to be done by 20 Sept 2026');
  assert.equal(c.requestText({sentence:'Needs discussion'}),'Needs discussion');
});
