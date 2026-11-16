import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
const block=css.slice(css.indexOf('/* Step 116:'));
function source(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,start);return html.slice(a,b);
}
function harness(task={id:'t1',topic:'Saved title',description:'Saved description',status:'pending'},board='dew'){
  const fields={},calls=[],listeners=new Map(),timers=[];
  const field=id=>fields[id]||=( {
    value:'',hidden:false,checked:false,style:{},textContent:'',innerHTML:'',
    classList:{values:new Set(),add(v){this.values.add(v);},remove(v){this.values.delete(v);},contains(v){return this.values.has(v);}},
    setAttribute(){},focus(){c.document.activeElement=this;}
  } );
  const refs={dew:{id:'dew_tasks'},boss:{id:'boss_tasks'},event:{id:'event_tasks'}};
  const c=vm.createContext({console,document:{getElementById:field,activeElement:null,
    addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
    modalState:{who:board,editId:null},modalLinks:[],
    eventTasks:task?.__src==='event'?[task]:[],eventTasksRef:refs.event,
    ownTasksOf:w=>w===board&&task&&task.__src!=='event'?[task]:[],
    taskAssignees:t=>t.assignees||(t.owner?[t.owner]:[]),refOf:w=>refs[w],
    memberName:w=>({boss:'Boss',dew:'Dew',o:'O'})[w]||w,
    sheetSyncCancel:(...args)=>calls.push(['sheet',...args]),sheetSyncRestore:(...args)=>calls.push(['restore',...args]),
    gcsDeleteFor:(...args)=>calls.push(['calendar',...args]),deleteWithUndo:(...args)=>calls.push(['delete',...args]),
    escHtml:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    setTimeout:fn=>timers.push(fn),taskMarkSeen(){},resetRoleDetails(){},taskForFill(){},
    todayStr:()=> '2026-11-16',setTaskCategory(){},evtFill(){},renderModalLinks(){},styleModal(){},
    populateEventSelect(){},setTaskType(){},tfSync(){},autoGrowDesc(){},t24Set(){},
    designEventName:()=>'',statusToDz:()=> 'Brief Received'
  });
  c.window=c;
  vm.runInContext(source('function tasksOf(','/* Own tasks plus shared cards')
    +source('function taskRef(','/* Identity for change tracking')
    +source('var __uiLastFocus=','function uiPrompt(')
    +source('function syncModalDelete(','function styleModal(')
    +source('function closeModal(){','function saveTask(){')
    +source('function hasSheetLink(','function duplicateTask(')
    +source('function duplicateTask(','// TASK RENDERING'),c);
  field('modal-delete').hidden=true;
  return {c,field,calls,refs,task,listeners,timers,confirm:ok=>c.uiModalClose(ok)};
}

test('the task footer starts with the hidden labelled Delete button and retains its three buttons',()=>{
  const footer=source('<div class="modal-footer">','<!-- LINK MODAL -->');
  const buttons=[...footer.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(m=>m[0]);
  assert.equal(buttons.length,4);
  assert.match(buttons[0],/^<button type="button" class="btn btn-ghost modal-delete" id="modal-delete"/);
  assert.match(buttons[0],/onclick="modalDeleteTask\(\)"/);
  assert.match(buttons[0],/aria-label="Delete this task" hidden>/);
  assert.match(buttons[0],/<i class="ti ti-trash" aria-hidden="true"><\/i> Delete<\/button>$/);
  assert.match(buttons[1],/onclick="requestCloseModal\(\)">Cancel/);
  assert.match(buttons[2],/id="modal-save"[^>]*onclick="saveTask\(\)"/);
  assert.match(buttons[3],/id="modal-save-cal"[^>]*onclick="saveTaskAndCalendar\(\)"/);
  assert.match(source('function taskCardHTML(','function kanbanHTML('),/onclick="event.stopPropagation\(\);deleteTask\(/);
});

test('real Add and Edit show Delete only for a saved card, including after switching modes',()=>{
  const h=harness();h.c.openEdit('dew','t1');
  assert.equal(h.field('modal-delete').hidden,false);
  h.c.openAdd('boss');assert.equal(h.field('modal-delete').hidden,true);
  assert.equal(h.c.modalState.editId,null);
  h.c.openEdit('dew','t1');assert.equal(h.field('modal-delete').hidden,false);
  h.c.openEdit('dew','missing');assert.equal(h.c.modalState.editId,'t1');
});

test('duplicate, quick add and SOP template forms use Add and hide Delete',()=>{
  const h=harness();h.c.openEdit('dew','t1');h.c.duplicateTask('dew','t1');
  assert.equal(h.field('modal-delete').hidden,true);
  assert.equal(h.c.modalState.editId,null);assert.equal(h.field('m-topic').value,'Saved title (copy)');
  h.c.document.body={className:'theme-dew'};h.c.uxpMoreToggle=()=>{};
  vm.runInContext(source('  window.uxpQuickAdd=function(){','  /* overflow menu for small screens */'),h.c);
  h.c.openEdit('dew','t1');h.c.uxpQuickAdd();assert.equal(h.field('modal-delete').hidden,true);
  vm.runInContext(source('  function openForm(who,title,eventName){','\n  function '),h.c);
  h.c.openEdit('dew','t1');h.c.openForm('dew','Template title','');
  assert.equal(h.field('modal-delete').hidden,true);assert.equal(h.field('m-topic').value,'Template title');
  const assignments=[...html.matchAll(/modalState\s*=\s*\{[^}]*editId:null[^}]*\}/g)];
  assert.equal(assignments.length,2,'only the initial state and openAdd create a new-card state');
});

test('deleteTask returns a pending Promise, then true and the unchanged Sheet, calendar and Undo steps',async()=>{
  const task={id:'t1',topic:'Saved title',sheetRows:{dew:{row:7}},gcalEventId:'cal1'};
  const h=harness(task),pending=h.c.deleteTask('dew','t1');
  assert.equal(typeof pending.then,'function');assert.deepEqual(h.calls,[]);
  assert.match(h.field('uxp-modal-title').innerHTML,/Delete task/);
  assert.equal(h.field('uxp-modal-body').innerHTML,'<div class="uxp-msg">&quot;Saved title&quot; will be deleted.</div>');
  h.confirm(true);assert.equal(await pending,true);
  assert.deepEqual(h.calls.map(x=>x[0]),['sheet','calendar','delete']);
  assert.deepEqual(h.calls[0],['sheet','dew','t1',task]);
  assert.deepEqual(h.calls[1],['calendar','dew',task,'t1']);
  const [,ref,id,snapshot,label,afterUndo]=h.calls[2];
  assert.equal(ref,h.refs.dew);assert.equal(id,'t1');assert.equal(snapshot,task);assert.equal(label,'Task deleted');
  afterUndo();assert.deepEqual(h.calls[3],['restore','dew','t1',task]);
});

test('deleteTask returns false after Cancel or for a missing card without starting deletion',async()=>{
  const h=harness(),pending=h.c.deleteTask('dew','t1');
  h.confirm(false);assert.equal(await pending,false);assert.deepEqual(h.calls,[]);
  const missing=h.c.deleteTask('dew','missing');assert.equal(typeof missing.then,'function');
  assert.equal(await missing,false);assert.deepEqual(h.calls,[]);
  assert.equal(h.field('uxp-modal').classList.contains('open'),false);
});

test('unlinked and older linked cards retain the existing optional Sheet and calendar behaviour',async()=>{
  for(const [extra,expected] of [[{},['delete']],[{calendarAddedAt:123},['calendar','delete']],
    [{sheetRow:{row:9}},['sheet','delete']]]){
    const h=harness({id:'t1',...extra}),pending=h.c.deleteTask('dew','t1');
    h.confirm(true);assert.equal(await pending,true);assert.deepEqual(h.calls.map(x=>x[0]),expected);
    assert.equal(typeof h.calls.at(-1)[5],extra.sheetRow?'function':'undefined');
  }
});

test('modal delete uses the open card identity and closes only after a confirmed delete starts',async()=>{
  const h=harness();h.c.openEdit('dew','t1');h.field('m-topic').value='Unsaved title';
  const pending=h.c.modalDeleteTask();assert.equal(h.field('modal').classList.contains('open'),true);
  assert.deepEqual(h.calls,[]);h.confirm(true);assert.equal(await pending,true);
  assert.equal(h.field('modal').classList.contains('open'),false);
  assert.equal(h.calls[0][1],h.refs.dew);assert.equal(h.calls[0][2],'t1');
  assert.equal(h.calls[0][3].topic,'Saved title','Undo receives the saved card');
});

test('Cancel leaves every typed field and the dialog intact and returns focus to Delete',async()=>{
  const h=harness();h.c.openEdit('dew','t1');
  h.field('m-topic').value='Unsaved title';h.field('m-desc').value='Unsaved description';
  h.field('m-notes').value='Unsaved notes';h.c.modalLinks=[{url:'https://example.test/new'}];
  h.field('m-topic').focus();const pending=h.c.modalDeleteTask();
  h.timers.splice(0).forEach(fn=>fn());assert.equal(h.c.document.activeElement,h.field('uxp-ok'));
  h.confirm(false);assert.equal(await pending,false);
  assert.equal(h.c.document.activeElement,h.field('modal-delete'));
  assert.equal(h.field('modal').classList.contains('open'),true);
  assert.deepEqual(['m-topic','m-desc','m-notes'].map(id=>h.field(id).value),['Unsaved title','Unsaved description','Unsaved notes']);
  assert.equal(h.c.modalLinks[0].url,'https://example.test/new');assert.deepEqual(h.calls,[]);
});

test('a repeat press cannot open another confirmation, and Cancel permits a fresh attempt',async()=>{
  const h=harness();h.c.openEdit('dew','t1');
  let count=0;const confirm=h.c.uiConfirm;h.c.uiConfirm=o=>{count++;return confirm(o);};
  const pending=h.c.modalDeleteTask();assert.equal(h.c.modalDeleteTask(),undefined);assert.equal(count,1);
  h.confirm(false);await pending;const next=h.c.modalDeleteTask();assert.equal(count,2);
  h.confirm(true);await next;assert.equal(h.calls.length,1);
});

test('modal delete does nothing for Add, a closed dialog or a missing saved card',async()=>{
  const h=harness();assert.equal(h.c.modalDeleteTask(),undefined);
  h.c.openAdd('dew');assert.equal(h.c.modalDeleteTask(),undefined);
  h.c.openEdit('dew','t1');h.c.closeModal();assert.equal(h.c.modalDeleteTask(),undefined);
  h.field('modal').classList.add('open');h.c.modalState.editId='missing';
  assert.equal(await h.c.modalDeleteTask(),false);
  assert.equal(h.field('modal').classList.contains('open'),true);assert.deepEqual(h.calls,[]);
  assert.equal(h.field('uxp-modal').classList.contains('open'),false);
});

test('shared event cards are deleted from their central collection even under an unrelated board',async()=>{
  for(const assignees of [[],['o'],['dew','o']]){
    const task={id:'shared',__src:'event',topic:'Event brief',eventLabel:'Sports Day',owner:assignees[0]||'',assignees,
      sheetRows:{o:{row:8}},gcalEventId:'shared-cal'};
    const h=harness(task);h.c.openEdit('boss','shared');
    assert.equal(h.c.tasksOf('boss').length,0);assert.equal(h.field('modal-delete').hidden,false);
    assert.equal(h.c.modalState.who,'boss');const pending=h.c.modalDeleteTask();
    assert.match(h.field('uxp-modal-title').innerHTML,/Delete a shared event task/);
    assert.match(h.field('uxp-modal-body').innerHTML,/shared team task on the central Event Board/);
    assert.match(h.field('uxp-modal-body').innerHTML,/Sports Day/);
    h.confirm(true);assert.equal(await pending,true);
    assert.deepEqual(h.calls.map(x=>x[0]),['sheet','calendar','delete']);
    assert.equal(h.calls[0][1],'boss');assert.equal(h.calls[2][1],h.refs.event);
    assert.equal(h.calls[2][3],task);assert.equal(h.field('modal').classList.contains('open'),false);
  }
});

test('Today, Event Board and search retain their routes into the same editor',()=>{
  const today=source('  function myDayTasks(','  function renderMyDay(');
  assert.ok(today.includes(String.raw`onclick="openEdit(\''+w+'\',\''+x.id+'\')"`));
  const board=source('  window.evbRender=function(){','  function boot(){');
  assert.match(board,/var owner=asg\[0\]\|\|''/);
  assert.match(board,/taskCardClick\(event,'\+JSON.stringify\(owner\|\|'boss'\)/);
  assert.match(source('function taskCardClick(','window.__tcOpen='),/openEdit\(who,id\)/);
  assert.match(source('function renderCmdk(){','function setCmdkSel('),/showTask\(r.w,r.id,\{open:true\}\)/);
  assert.match(source('function showTask(','document.addEventListener'),/if\(opts.open\)openEdit\(who,id\)/);
  assert.match(source('  function marcomFind(','  window.marcomFind='),/tOf\(w\).forEach/);
});

function declarations(text,selector){
  if(text===html)text=[...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  text=text.replace(/\/\*[\s\S]*?\*\//g,'');
  const rules=[...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(m=>m[1].trim()===selector).map(m=>m[2]);
  assert.ok(rules.length,selector);return Object.assign({},...rules.map(body=>Object.fromEntries(
    body.split(';').filter(s=>s.includes(':')).map(s=>s.trim().split(/:(.*)/s).slice(0,2)))));
}
function colour(value){
  if(value.startsWith('#')){const hex=value.slice(1);return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));}
  return value.match(/[\d.]+/g).map(Number);
}
function blend(fg,bg){return fg.slice(0,3).map((v,i)=>v*(fg[3]??1)+bg[i]*(1-(fg[3]??1)));}
function contrast(a,b){
  const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
    .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const [lo,hi]=[lum(a),lum(b)].sort((a,b)=>a-b);return (hi+.05)/(lo+.05);
}

test('red text and icon meet 4.5 contrast on the actual surface and hover background in both themes',()=>{
  const light=declarations(block,'.btn.modal-delete'),dark=declarations(block,'html.dark .btn.modal-delete');
  assert.equal(light.color,'#b42318');assert.equal(dark.color,'#fda4a4');
  assert.equal(light.background,'var(--surface)');assert.equal(light['font-weight'],'600');
  assert.equal(light.border,'1px solid #f2b8b5');assert.equal(dark['border-color'],'#874747');
  assert.equal(declarations(block,'.btn.modal-delete i').color,'inherit');
  assert.equal(declarations(html,'html.dark .modal').background,'var(--surface)');
  assert.match(html,/html:not\(\.dark\)[^{]*\.modal\{\s*background:#FFFFFF!important/);
  for(const isDark of [false,true]){
    const tokens=declarations(html,isDark?'html.dark':'html:not(.dark)');
    const surface=colour(tokens['--surface']);
    const underlay=isDark?blend(colour(declarations(html,'html.dark .modal-overlay').background),colour(tokens['--bg'])):surface;
    const dialog=blend(surface,underlay),button=blend(surface,dialog);
    const ink=colour(isDark?dark.color:light.color);
    const hover=declarations(block,isDark?'html.dark .btn.modal-delete:hover':'.btn.modal-delete:hover');
    assert.ok(contrast(ink,dialog)>=4.5,'dialog surface');assert.ok(contrast(ink,button)>=4.5,'button surface');
    assert.ok(contrast(colour(hover.color),blend(colour(hover.background),dialog))>=4.5,'hover surface');
  }
});

test('hidden wins over shared display, the shared focus ring applies, and touch height is 44px',()=>{
  assert.equal(declarations(block,'.modal-delete[hidden]').display,'none');
  assert.ok(css.indexOf('.modal-delete[hidden]')>css.indexOf('.btn,.auth-btn'));
  assert.match(block,/@media\(max-width:600px\),\(pointer:coarse\)\{\s*\.btn.modal-delete\{height:44px;min-height:44px;/);
  assert.match(css,/html body :is\(button,[^\n]+:focus-visible\{\s*outline:2px solid var\(--focus-ink,#1d4ed8\);outline-offset:2px;/);
  assert.doesNotMatch(block,/outline:none|!important/);
});

test('Delete occupies its own left-aligned phone row and preserves the existing narrow save layout',()=>{
  assert.equal(declarations(block,'.btn.modal-delete')['margin-right'],'auto');
  assert.match(block,/@media\(max-width:600px\)\{[\s\S]*#modal \.modal-footer:has\(>\.modal-delete:not\(\[hidden\]\)\)\{\s*display:grid;grid-template-columns:auto minmax\(0,1fr\) auto;/);
  assert.match(block,/#modal \.modal-delete\{grid-column:1\/-1;justify-self:start;/);
  assert.match(block,/@media\(max-width:480px\)\{\s*#modal:has\(\.modal-delete:not\(\[hidden\]\)\) #modal-save\{grid-column:2\/-1;/);
  assert.match(block,/#modal:has\(\.modal-delete:not\(\[hidden\]\)\) #modal-save-cal\{grid-column:1\/-1;/);
  assert.doesNotMatch(block,/overflow-x|font-size:0|display:none[^}]*ti-trash/);
});

test('the existing confirmation stacks above the card dialog and restores opener focus',()=>{
  assert.ok(Number(declarations(html,'#uxp-modal')['z-index'])>Number(declarations(html,'.modal-overlay')['z-index']));
  assert.match(source('function uiModalRoot(){','function uiModalClose('),/document.body.appendChild\(m\)/);
  assert.match(source('function uiConfirm(','function uiPrompt('),/__uiLastFocus=document.activeElement/);
  assert.match(source('function uiModalClose(','function __uiKeys('),/__uiLastFocus.focus\(\)/);
  assert.doesNotMatch(block,/z-index:/,'no stacking correction is needed');
});
