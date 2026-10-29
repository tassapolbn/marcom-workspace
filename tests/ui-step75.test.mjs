import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/workspace-ui.css','utf8').split('/* Step 75:')[1];
function source(start,end){const a=html.indexOf(start);assert.ok(a>=0);return html.slice(a,html.indexOf(end,a));}
function cards(){
  const ctx=vm.createContext({window:{},SC:{pending:{},done:{},canceled:{}},daysUntil:()=>2,isSoon:()=>false,
    isEventTask:t=>!!t.assignees,taskAssignees:t=>t.assignees,memberName:w=>({dew:'Dew',o:'O'})[w],
    escHtml:String,safeUrl:String,fmtDate:String,evTagHTML:()=>'',statusSelectHTML:()=>'',moveSelectHTML:()=>'',
    designSelectHTML:()=>'<select>Design status</select>',isUrl:()=>false,
    KB_STATUS_ORDER:['pending','done','canceled'],scColors:()=>[],tcLingerFrom:()=>null,tcLingerRec:()=>null,
    isAutoArchived:()=>false,kbFilterPass:()=>true,dueSortValue:()=>0});
  vm.runInContext(source('function taskCardHTML(', '/* The board is rebuilt')+source('function oCardExtra(', '// QUICK LINKS'),ctx);
  return ctx;
}
test('only the five existing toast-failure fallbacks retain browser alerts',()=>{
  const lines=html.split('\n').filter(l=>/\balert\(/.test(l));
  assert.equal(lines.length,5);
  for(const line of lines)assert.match(line,/try\{uiToast\([\s\S]*catch\([_e]\)\{(?:try\{)?\s*alert\(/);
});
test('finished media cards lose pending upload and Story email, keeping files and uploaded facts',()=>{
  const c=cards();
  assert.match(c.oCardExtra({id:'x'}),/Pending upload[\s\S]*Story email/);
  for(const status of ['done','canceled']){
    assert.doesNotMatch(c.oCardExtra({id:'x',status}),/Pending upload|Story email/);
    assert.match(c.oCardExtra({id:'x',status,mdUpload:'2026-10-29',mdFile:'Archive'}),/Uploaded[\s\S]*Archive/);
    assert.doesNotMatch(c.dewCardExtra({status,dzType:'Poster'}),/dzsel-wrap|Design status/);
    assert.match(c.dewCardExtra({status,dzType:'Poster'}),/Poster/);
  }
  assert.match(c.dewCardExtra({status:'pending'}),/Design status/);
});
test('own-board single owner is omitted, shared initials and other-board ownership stay',()=>{
  const c=cards(),t={id:'x',assignees:['dew']};
  assert.doesNotMatch(c.taskCardHTML(t,'dew'),/mb-shared|mb-who|Unassigned/);
  assert.match(c.taskCardHTML(t,'boss'),/mb-who[\s\S]*Dew/);
  assert.match(c.taskCardHTML({...t,assignees:['dew','o']},'dew'),/Shared · Dew, O/);
  assert.match(c.taskCardHTML({...t,assignees:[]},'dew'),/Unassigned/);
});
test('empty Canceled column is omitted and returns with a card',()=>{
  const c=cards();
  assert.doesNotMatch(c.kanbanHTML([],'o','all'),/data-status="canceled"/);
  assert.match(c.kanbanHTML([{id:'x',status:'canceled'}],'o','all'),/data-status="canceled"/);
});
test('compact payday says 1 day, plural days and Today without a bar',()=>{
  const paint=source('    function paint(force){','    /* The payday strip starts');
  for(const [days,expected] of [['0','Today'],['1','1 day'],['2','2 days']]){
    const b={setAttribute(){}};
    vm.runInNewContext(paint+'paint(true);',{b,esc:String,document:{getElementById:id=>({textContent:id==='sal-days'?days:'Fri, 30 October'})}});
    assert.ok(b.innerHTML.includes(expected));
    assert.doesNotMatch(b.innerHTML,/1 days|0 days|uxp-sal-mini/);
  }
});
test('Request Centre labels and quiet controls follow step 75',()=>{
  const rc=source('    if(quiet){','  function injectTabs(){');
  assert.match(rc,/No new requests<\/span>/);
  assert.equal((rc.match(/Open request form<\/button>/g)||[]).length,2);
  assert.equal((rc.match(/Copy form link<\/button>/g)||[]).length,2);
  assert.match(css,/\.tcard-move\{flex:0 0 auto;min-width:100px/);
  assert.match(css,/\.tc-more:is\(\.open,:hover\)\{background:var\(--gray-light\);color:var\(--muted\)/);
  assert.match(css,/\.fpill\[data-f="soon"\] \.pill-dot\{background:var\(--muted\)/);
});
