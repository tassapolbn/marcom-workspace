import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
function source(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a);
  assert.ok(a>=0&&b>a,start);
  return html.slice(a,b);
}
function builder({acts=false,admin=true}={}){
  const context=vm.createContext({window:{__cur:{role:admin?'admin':'member'},__tcActs:acts?{dew_t1:true}:{}},
    MEMBER_ORDER:['boss','dew','o','junior'],
    escHtml:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
    daysUntil:()=>1,isSoon:()=>false,fmtDate:s=>s,fmtDue:s=>s,safeUrl:s=>s,
    eventsOf:()=>[],evOkClr:()=>false,isEventTask:t=>t.__src==='event',taskAssignees:t=>t.assignees||[],
    memberName:s=>s,nmW:s=>s,esc:s=>s,
    oCardExtra:()=>'<div class="role-row">Media controls</div>',
    dewCardExtra:()=>'<div class="role-row">Design controls</div>',
    tcLingerFrom:()=>'',tcLingerRec:()=>null,isAutoArchived:()=>false,kbFilterPass:()=>true,dueSortValue:()=>0
  });
  vm.runInContext(source('const SC=','function setTaskStatus(')
    +source('function moveSelectHTML(','function moveCardTo(')
    +source('const KB_STATUS_ORDER=','var _taskDrag=')
    +source('function evTagHTML(','/* The board is rebuilt')
    +source('  function sharedKanbanHTML(tasks,w){','  window.evwsColDrop='),context);
  return context;
}
const sample={id:'t1',topic:'Plan the open day',status:'pending',priority:'high'};
const variants=[['bare',{}],['description',{description:'More information'}],
  ['links',{links:[{title:'Brief',url:'https://example.com/brief'}]}]];
const statuses=['pending','in-progress','waiting','on-hold','done','canceled'];
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
const quick=card=>card.match(/<select class="tcard-sel tc-quick-sel"[^>]*>[\s\S]*?<\/select>/)?.[0];

for(const [board,render] of [
  ['person',(c,t,w)=>c.kanbanHTML([t],w,'all')],
  ['event workspace',(c,t,w)=>c.sharedKanbanHTML([t],w)]
])for(const [name,details] of variants){
  test(`${board} board: a ${name} card has one actions button and one helper-made quick status menu`,()=>{
    const c=builder();
    for(const who of ['boss','dew','o','junior'])for(const status of statuses){
      const task={...sample,...details,status,...(board==='event workspace'?{__src:'event',__own:who,assignees:[who]}:{})};
      const card=render(c,task,who),select=quick(card);
      assert.match(card,/class="kb-col"/,'the real caller places the card in a status column');
      assert.equal((card.match(/class="tc-acts-btn"/g)||[]).length,1);
      assert.equal((card.match(/class="tcard-sel tc-quick-sel"/g)||[]).length,1);
      assert.equal((card.match(/class="tc-more/g)||[]).length,name==='bare'?0:1);
      const expected=c.statusSelectHTML(who,task),actualAttrs=attrs(select),expectedAttrs=attrs(expected);
      for(const key of ['title','style','onchange','onclick'])assert.equal(actualAttrs[key],expectedAttrs[key],key);
      assert.equal(select.slice(select.indexOf('>')),expected.slice(expected.indexOf('>')),'all six options and the selected status come from the helper');
      assert.equal((select.match(/<option /g)||[]).length,6);
      assert.match(select,new RegExp('<option value="'+status+'" selected>'));
      const bar=card.slice(card.indexOf('<div class="tc-bar'),card.indexOf('<div class="task-foot">'));
      assert.match(bar,/<button type="button" class="tc-acts-btn"[^>]*>[\s\S]*?<\/button><select class="tcard-sel tc-quick-sel"/);
      assert.ok(card.indexOf('task-meta')<card.indexOf('tc-bar'));
      if(who==='dew'||who==='o')assert.equal(card.indexOf('role-row')<card.indexOf('tc-bar'),name!=='bare','desktop control order stays unchanged');
    }
  });
}

test('quick status changes call the existing save with the same owner and id, then blur',()=>{
  const c=builder(),calls=[];
  c.setTaskStatus=(...args)=>calls.push(args);
  const select=quick(c.taskCardHTML({...sample,__src:'event',assignees:['dew','o']},'dew'));
  let blurred=0;
  const control={value:'done',blur(){blurred++;}};
  vm.runInContext('(function(){'+attrs(select).onchange+'})',c).call(control);
  assert.deepEqual(calls,[['dew','t1','done']]);
  assert.equal(blurred,1,'the board can redraw immediately after selection');
});

test('using the quick menu stops card clicks and dragging without cancelling the native press',()=>{
  const c=builder(),attributes=attrs(quick(c.taskCardHTML(sample,'dew')));
  const card={draggable:true},control={closest:s=>{assert.equal(s,'.task-card');return card;}};
  let stopped=0,prevented=0;
  const event={stopPropagation(){stopped++;},preventDefault(){prevented++;}};
  const fire=name=>vm.runInContext('(function(event){'+attributes[name]+'})',c).call(control,event);
  assert.equal(attributes.draggable,'false');
  fire('onclick');assert.equal(stopped,1);assert.equal(prevented,0);
  for(const end of ['onpointerup','onpointercancel','onblur']){
    fire('onpointerdown');assert.equal(card.draggable,false);assert.equal(prevented,0);
    fire(end);assert.equal(card.draggable,true);
  }
  fire('ondragstart');assert.equal(prevented,1);assert.equal(stopped,5);
});

test('opening actions keeps a single expanded button, the move menu and every icon action',()=>{
  for(const [,details] of variants){
    const c=builder({acts:true}),card=c.taskCardHTML({...sample,...details},'dew');
    assert.match(card,/class="task-card tc-pending acts-open"/);
    assert.equal((card.match(/class="tc-acts-btn"/g)||[]).length,1);
    assert.match(card,/class="tc-acts-btn" aria-expanded="true"/);
    const foot=card.slice(card.indexOf('<div class="task-foot">'));
    assert.match(foot,/class="tcard-sel tc-row-sel"/,'the desktop action menu is retained');
    for(const handler of ['moveCardTo','uxpTaskCalendar','sheetCardButton','duplicateTask','openEdit','deleteTask'])assert.ok(foot.includes(handler),handler);
    assert.doesNotMatch(builder({admin:false}).taskCardHTML({...sample,...details},'dew'),/tcard-move/);
  }
});

const block=css.slice(css.indexOf('/* Step 108:'));
const media='@media(max-width:600px),(pointer:coarse)';
const outside=block.slice(0,block.indexOf(media)),touch=block.slice(block.indexOf(media));
function rule(text,selector){
  const start=text.indexOf(selector+'{');assert.ok(start>=0,selector);
  return text.slice(start+selector.length+1,text.indexOf('}',start));
}
test('only touch board columns reveal the quick menu and reposition the bar',()=>{
  assert.ok(css.includes('/* Step 108:'));
  assert.equal((block.match(/@media/g)||[]).length,1);
  assert.equal(rule(outside,'.task-card .tc-quick-sel'),'display:none;','also removes the hidden menu from keyboard navigation');
  assert.doesNotMatch(outside,/display:grid|display:inline-flex|margin:10px/);
  assert.equal(rule(touch,'.kb-col .task-card .tc-body'),'display:flex;flex-direction:column;');
  assert.match(rule(touch,'.kb-col .task-card .tc-bar'),/display:grid;grid-template-columns:auto auto minmax\(0,1fr\);align-items:center;gap:8px;/);
  assert.match(rule(touch,'.kb-col .task-card .tc-bar'),/position:static;width:auto;min-width:0;margin:10px 0 0;/);
  assert.match(rule(touch,'.kb-col .task-card .tc-bar.tc-facts-end'),/order:1;grid-template-columns:auto minmax\(0,1fr\);/,'the bare bar follows every role control on touch');
  assert.match(rule(touch,'.kb-col .task-card select.tc-quick-sel'),/display:inline-flex;justify-self:end;/);
  assert.doesNotMatch(touch,/\.task-meta/,'non-board cards keep their facts-row menu');
});

test('the quick menu uses compact dimensions and fits the remaining grid cell',()=>{
  const menu=rule(touch,'.kb-col .task-card select.tc-quick-sel');
  assert.match(menu,/width:128px;min-width:min\(108px,100%\);max-width:100%;/,'at least 108px when it fits, bounded by the space after the left buttons');
  assert.match(menu,/height:var\(--hs-ctl-h-sm\);min-height:44px;border-radius:var\(--hs-ctl-radius\);font-size:13px;font-weight:700;/);
  assert.doesNotMatch(block,/background:|background-color:|color:|!important|animation:|transition:/,'existing status colours, theme inks and motion are unchanged');
});

test('touch hides only the duplicate footer status, leaving the rest of the actions intact',()=>{
  assert.equal(rule(touch,'.kb-col .task-card .task-foot .tc-row-sel'),'display:none;');
  assert.doesNotMatch(touch,/\.tcard-move|\.task-acts|\.icon-btn|\.task-foot\{/);
  assert.doesNotMatch(outside,/\.task-foot/,'desktop keeps its original footer status');
});

test('bare desktop cards retain the original absolute tick-column placement and height',()=>{
  assert.equal(rule(outside,'.task-card .tc-body'),'position:relative;');
  assert.equal(rule(outside,'.task-card .tc-bar.tc-facts-end'),'left:0;margin:0;min-height:0;');
  const older=css.slice(0,css.indexOf('/* Step 108:'));
  assert.match(older,/\.task-card \.tc-facts-end\{position:absolute;top:0;left:calc\(-1 \* var\(--tc-name-inset\)\);width:calc\(var\(--tc-name-inset\) - 10px\);display:flex;justify-content:center;\}/);
  assert.match(older,/\.task-card \.task-meta\{position:relative;margin-left:var\(--tc-name-inset\);\}/);
  assert.doesNotMatch(outside,/\.task-card\{|\.task-meta\{|\.task-head\{|padding:|height:[1-9]/);
});

test('both production card-builder callers draw board columns; outside columns the extra menu stays hidden',()=>{
  assert.equal((html.match(/\btaskCardHTML\(/g)||[]).length,3,'the declaration and the two board callers');
  for(const code of [source('function kanbanHTML(','/* The board is rebuilt'),source('  function sharedKanbanHTML(tasks,w){','  window.evwsColDrop=')]){
    assert.match(code,/class="kb-col"/);assert.match(code,/taskCardHTML\(t,/);
  }
  assert.match(outside,/\.task-card \.tc-quick-sel\{display:none;\}/);
  assert.match(css,/\.kb-col \.task-card \.task-meta \.tcard-sel\{display:none;\}/);
  assert.doesNotMatch(touch,/(?:^|\})\s*\.task-card select\.tc-quick-sel\{/,'only the scoped board rule can reveal it');
});
