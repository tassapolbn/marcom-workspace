import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
const block=css.slice(css.indexOf('/* Step 114:'),css.indexOf('/* Step 116:'));
function source(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,start);
  return html.slice(a,b);
}
const plain=x=>JSON.parse(JSON.stringify(x));
const statuses=['pending','in-progress','waiting','on-hold','done','canceled'];
const fresh=(id,status='pending',extra={})=>({id,status,topic:id,newFor:['dew'],...extra});
function helpers(c){
  vm.runInContext(source('function myBoardKey(','function refOf(')
    +source('const DONE_ARCHIVE_DAYS=','/* reconcileDoneAt'),c);
}

test('taskNewCount counts only this recipient, including Done, and excludes automatic archives',()=>{
  let tasks=[];
  const c=vm.createContext({tasksOf:()=>tasks});helpers(c);
  assert.equal(c.taskNewCount('dew'),0);
  tasks=[fresh('a'),fresh('b')];assert.equal(c.taskNewCount('dew'),2);
  tasks=[fresh('done','done')];assert.equal(c.taskNewCount('dew'),1);
  tasks.push(fresh('old','done',{doneAt:Date.now()-9*86400000}));
  tasks.push(fresh('other','pending',{newFor:['o']}),{id:'legacy'});
  assert.equal(c.taskNewCount('dew'),1);
  assert.equal(c.taskNewCount('boss'),0);
  assert.equal(c.taskNewCount('o'),1);
});

function day(tasks,own=false){
  const c=vm.createContext({window:{__cur:own?{workspace:'dew'}:{role:'admin'},
    __rcCounts:{unreadList:[{ws:'dew'},{ws:'o'}]}},
    tasksOf:()=>tasks,tdy:()=> '2026-11-16',tmr:()=> '2026-11-17',
    evs:()=>[],esc:String,nm:()=> 'Dew',isOwn:()=>own,fdt:String,roleFocus:()=>null});
  helpers(c);
  vm.runInContext(source('  function myDayTasks(','  function renderMyDay('),c);
  return c.myDayHTML('dew');
}
test('Today omits an empty new chip and preserves all existing chips and rows',()=>{
  const tasks=[{id:'late',status:'pending',dueDate:'2026-11-15'},
    {id:'today',status:'pending',dueDate:'2026-11-16'},
    {id:'done',status:'done',doneOn:'2026-11-16',dueDate:'2026-11-16'}];
  const before=day(tasks);
  assert.doesNotMatch(before,/myday-chip new/);
  assert.deepEqual([...before.matchAll(/class="myday-chip (\w+)"/g)].map(m=>m[1]),['bad','warn','ok','info']);
  for(const text of ['overdue','due today','done today','new request'])assert.ok(before.includes('<b>1</b> '+text));
  for(const count of [1,2]){
    const after=day([...tasks,...Array.from({length:count},(_,i)=>fresh('new'+i))]);
    const chip='<button type="button" class="myday-chip new" onclick="taskShowNew(\'dew\')" aria-label="'+count+' new task'+(count===1?'':'s')+'. Show the first one."><i class="ti ti-sparkles" aria-hidden="true"></i><b>'+count+'</b> new</button>';
    assert.ok(after.includes('<div class="myday-chips">'+chip));
    assert.equal(after.replace(chip,''),before,'other chips, rows and copy stay identical');
  }
});
test('Today shows new cards with the all-clear line, for the recipient and other viewers',()=>{
  for(const own of [false,true]){
    const markup=day([fresh('done','done')],own);
    assert.match(markup,/myday-chip new/);
    assert.match(markup,/All clear for now\. A good moment to plan ahead\./);
    assert.doesNotMatch(markup,/myday-chip (bad|warn)/);
  }
  assert.doesNotMatch(day([fresh('old','done',{doneAt:Date.now()-9*86400000})]),/myday-chip new/);
});

// Run the production reveal, filters, search, shelves and redraw queue together.
function board(tasks,{filter='all',search='',own=true,reduced=false,sub='tasks'}={}){
  const timers=new Map(),scrolls=[],focuses=[],foldWrites=[],filterCalls=[],subCalls=[];
  const elements={},pills={},tabs={},filters={dew:filter,o:'pending'};
  let saved={},next=0;
  const c=vm.createContext({console,tasksOf:w=>w==='dew'?tasks:[],
    localStorage:{getItem:()=>JSON.stringify(saved),setItem(key,value){saved=JSON.parse(value);foldWrites.push(plain(saved));}},
    setTimeout(fn,ms){const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
    db:new Proxy({},{get(){assert.fail('revealing must never access the database');}}),
    taskRef(){assert.fail('revealing must never mark a task seen');},
    window:{__cur:own?{workspace:'dew'}:{role:'admin'},matchMedia:()=>({matches:reduced})},
    SC:Object.fromEntries(statuses.map(s=>[s,{l:s,i:'ti-circle'}])),scColors:()=>[],
    tcLingerFrom:t=>t.linger||'',tcLingerRec:()=>null,isSoon:()=>false,loadedOf:()=>true,
    filterOf:w=>filters[w],setFilterVar(w,f){filters[w]=f;filterCalls.push([w,f]);},
    renderMember(w){c.renderList(c.tasksOf(w),w,w+'-list',null,filters[w]);}});
  function node(tagName='DIV'){
    const classes=new Set(),attrs=new Map(),listeners=new Map();
    return {tagName,style:{},value:'',children:[],addEventListener:(type,fn)=>listeners.set(type,fn),fire(type){const fn=listeners.get(type);if(fn){listeners.delete(type);fn();}},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
      setAttribute:(k,v)=>attrs.set(k,v),hasAttribute:k=>attrs.has(k),removeAttribute:k=>attrs.delete(k),
      focus(opts){assert.equal(opts.preventScroll,true);focuses.push(this);c.document.activeElement=this;},
      scrollIntoView(opts){scrolls.push({node:this,opts:plain(opts)});},appendChild(el){this.children.push(el);}};
  }
  for(const f of ['all','pending','done']){pills[f]=node('BUTTON');pills[f].classList.add(f===filter?'act-accent':'inactive');}
  for(const name of ['tasks','events']){tabs[name]=node('BUTTON');if(name===sub)tabs[name].classList.add('act');}
  const panel=node();elements['dew-sub-tasks']=panel;elements['dew-sub-events']=node();
  const input=node('INPUT'),clear=node('BUTTON');input.parentNode={querySelector:()=>clear};
  elements['dew-kb-search']=input;elements['dew-kb-search-note']=node();
  let cards=[],cols=[],markup='';
  const list={contains:()=>false,querySelector:()=>null,
    querySelectorAll(sel){return sel==='.kb-col'?cols:sel==='.task-card.tc-new'?cards.filter(x=>x.classList.contains('tc-new')):cards;},
    get innerHTML(){return markup;},set innerHTML(value){
      markup=value;cards=[];cols=[];
      for(const m of value.matchAll(/<div class="(kb-col(?: kb-col-folded)?)" data-status="([^"]+)"([\s\S]*?)(?=<div class="kb-col(?: kb-col-folded)?" data-status=|$)/g)){
        const col=node(),count=node();count.textContent=m[3].match(/kb-col-count">(\d+)/)[1];
        col.dataset={status:m[2]};col.querySelector=()=>count;cols.push(col);
        for(const [,classes,id] of m[3].matchAll(/<div class="(task-card[^" ]*(?: [^"]+)?)" data-id="([^"]+)"/g)){
          const card=node(),badge=node('BUTTON');card.id=id;card.badge=badge;
          classes.split(' ').forEach(x=>card.classList.add(x));
          card.closest=()=>m[1].includes('kb-col-folded')?col:null;
          card.querySelector=()=>own?badge:null;cards.push(card);
        }
      }
    }};
  elements['dew-list']=list;
  c.document={activeElement:null,getElementById:id=>elements[id]||null,createElement:()=>node(),
    querySelector(sel){return sel.includes('.st-tasks')?tabs.tasks:sel.includes('[data-f="all"]')?pills.all:null;},
    querySelectorAll(sel){return sel.includes('.sub-panel')?[elements['dew-sub-tasks'],elements['dew-sub-events']]:sel.includes('.sub-tab')?Object.values(tabs):Object.values(pills);}};
  helpers(c);
  vm.runInContext(source('function motionBehavior(','\n')
    +source('function switchSub(','// DATES')
    +source('function setFilter(','const SC=')
    +source('function dueSortValue(','function taskOrder(')
    +source('const KB_STATUS_ORDER=','function taskCardClick(')
    +source('function kbFilterPass(','const DONE_ARCHIVE_DAYS=')
    +source('function kanbanHTML(','function isUrl('),c);
  const switchSub=c.switchSub;c.switchSub=(...args)=>{subCalls.push(args.slice(0,2));switchSub(...args);};
  c.taskCardHTML=(t,w)=>'<div class="task-card'+(c.taskIsNewFor(t,w)?' tc-new':'')+'" data-id="'+t.id+'"></div>';
  c.__kbSearchText.dew=search;c.__kbSearchText.o='other tab';
  c.renderMember('dew');
  for(const [id,t] of [...timers]){timers.delete(id);t.fn();}
  return {c,timers,scrolls,focuses,foldWrites,filterCalls,subCalls,input,filters,pills,tabs,
    cards:()=>cards,saved:()=>saved};
}

test('reveal follows drawn board order and due-date order, focuses New and flashes for 1.6 seconds',()=>{
  const tasks=[fresh('later','pending',{dueDate:'2026-11-20'}),fresh('progress','in-progress'),
    fresh('first','pending',{dueDate:'2026-11-17'})];
  const before=plain(tasks),b=board(tasks,{sub:'events'});
  b.c.taskShowNew('dew');
  assert.deepEqual(b.subCalls,[['dew','tasks']]);
  assert.equal(b.tabs.tasks.classList.contains('act'),true);
  assert.equal(b.scrolls[0].node.id,'first');
  assert.deepEqual(b.scrolls[0].opts,{block:'center',behavior:'smooth'});
  const card=b.scrolls[0].node;
  assert.equal(b.focuses.at(-1),card.badge);
  assert.equal(card.classList.contains('tc-new-flash'),true);
  assert.deepEqual(b.filterCalls,[]);assert.deepEqual(b.foldWrites,[]);
  assert.deepEqual(tasks,before);
  const [timer]=b.timers.values();assert.equal(timer.ms,1600);timer.fn();
  assert.equal(card.classList.contains('tc-new-flash'),false);
  assert.equal(b.c.taskNewCount('dew'),3);
});
test('reveal keeps a working pill and search when they already draw a new card',()=>{
  const b=board([fresh('poster')],{filter:'pending',search:'poster'});
  b.c.taskShowNew('dew');
  assert.equal(b.filters.dew,'pending');assert.equal(b.c.kbSearchGet('dew'),'poster');
  assert.deepEqual(b.filterCalls,[]);assert.equal(b.scrolls[0].node.id,'poster');
});
for(const hidden of ['pill','search','done','canceled','combined'])test('reveal restores a new card hidden by '+hidden,()=>{
  const status=hidden==='done'||hidden==='combined'?'done':hidden==='canceled'?'canceled':'pending';
  const b=board([fresh('target',status)],{filter:hidden==='pill'||hidden==='combined'?'in-progress':'all',
    search:hidden==='search'||hidden==='combined'?'missing':''});
  b.c.taskShowNew('dew');
  assert.deepEqual(b.filterCalls,[['dew','all']]);assert.equal(b.filters.dew,'all');
  assert.equal(b.pills.all.classList.contains('act-accent'),true);
  assert.equal(b.c.kbSearchGet('dew'),'');assert.equal(b.input.value,'');
  assert.equal(b.filters.o,'pending');assert.equal(b.c.kbSearchGet('o'),'other tab');
  assert.equal(b.scrolls[0].node.id,'target');assert.equal(b.scrolls[0].node.closest('.kb-col-folded'),null);
  if(status==='done'||status==='canceled'){
    assert.equal(b.saved().dew[status],false);assert.equal(b.foldWrites.length,1);
    assert.equal(b.c.kbFoldGet('dew',status==='done'?'canceled':'done'),true);
  }else assert.equal(b.foldWrites.length,0);
  assert.equal(b.c.taskNewCount('dew'),1);
  assert.deepEqual([...b.timers.values()].map(t=>t.ms),[1600],'search and board redraw timers are flushed');
});
test('reveal skips folded cards when another new card is drawn; repeating restarts just one flash',()=>{
  const b=board([fresh('folded','done'),fresh('shown','canceled')]);
  b.c.kbFoldSet('dew','canceled',false);b.c.kbSearchRender('dew');
  b.c.taskShowNew('dew');b.c.taskShowNew('dew');
  assert.equal(b.scrolls[0].node.id,'shown');assert.equal(b.scrolls[1].node.id,'shown');
  assert.equal(b.c.kbFoldGet('dew','done'),true);
  assert.equal(b.timers.size,1);
});
test('another viewer focuses the card temporarily and reduced motion scrolls immediately',()=>{
  const b=board([fresh('target')],{own:false,reduced:true});
  b.c.taskShowNew('dew');const card=b.scrolls[0].node;
  assert.deepEqual(b.scrolls[0].opts,{block:'center',behavior:'auto'});
  assert.equal(b.focuses.at(-1),card);
  /* Reviewer's correction: the card stays focusable until the focus moves on. */
  assert.equal(card.hasAttribute('tabindex'),true);card.fire('blur');assert.equal(card.hasAttribute('tabindex'),false);
  card.setAttribute('tabindex','0');b.c.taskShowNew('dew');
  assert.equal(card.hasAttribute('tabindex'),true,'existing tabindex is preserved');
});
test('no new card, missing board and automatic archives cause no scroll, flash or database access',()=>{
  for(const tasks of [[],[{id:'legacy',status:'pending'}],[fresh('old','done',{doneAt:Date.now()-9*86400000})]]){
    const b=board(tasks);b.c.taskShowNew('dew');b.c.taskShowNew('missing');
    assert.equal(b.scrolls.length,0);assert.equal(b.timers.size,0);assert.deepEqual(b.filterCalls,[]);
  }
});

function declarations(text,selector){
  const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const matches=[...text.matchAll(new RegExp('(?:^|[}\\n])'+escaped+'\\{([^}]+)\\}','g'))];
  assert.ok(matches.length,selector);return matches.at(-1)[1];
}
function property(rule,key){return rule.match(new RegExp('(?:^|;)\\s*'+key+':([^;]+)'))?.[1];}
function contrast(a,b){
  const lum=hex=>{const h=hex.slice(1);return (h.length===3?h.split('').map(v=>v+v).join(''):h).match(/../g)
    .map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
    .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);};
  const [lo,hi]=[lum(a),lum(b)].sort((x,y)=>x-y);return (hi+.05)/(lo+.05);
}
test('new chip inherits chip sizing and focus, with accessible gold colours in both themes',()=>{
  const chip=declarations(block,'.myday-chip.new');
  assert.equal(property(chip,'background'),'#F0B323');assert.equal(property(chip,'color'),'#0b1a2b');
  assert.equal(property(chip,'font-weight'),'700');assert.equal(property(chip,'border'),'0');
  assert.match(block,/\.myday-chip\.new b,\.myday-chip\.new i\{color:#0b1a2b;font-weight:700;/);
  assert.equal(property(declarations(block,'.myday-chip.new:hover'),'background'),'#f7c948');
  assert.ok(contrast(property(chip,'color'),property(chip,'background'))>=4.5);
  assert.ok(contrast(property(chip,'color'),'#f7c948')>=4.5);
  assert.doesNotMatch(chip,/padding:|border-radius:|font-size:|min-height:|outline:/);
  assert.doesNotMatch(block,/html.dark \.myday-chip/,'identical chip colours in both themes');
  assert.match(css,/html body :is\(button,[^\n]+:focus-visible\{\s*outline:2px solid var\(--focus-ink,#1d4ed8\);outline-offset:2px;/);
  assert.match(block,/\.myday-chip\.new::after\{[^}]*height:44px;/);
});
test('flash fades an additive gold ring and reduced motion keeps a steady ring',()=>{
  assert.match(block,/\.task-card\.tc-new-flash\{\s*--tc-new-shadow:var\(--hs-shadow-tile\);\s*box-shadow:0 0 0 3px #F0B323,var\(--tc-new-shadow\);\s*animation:tcNewFlash 1\.6s ease-out;/);
  assert.match(css,/\.task-card\{border-radius:var\(--hs-radius-tile\);box-shadow:var\(--hs-shadow-tile\);/);
  assert.match(css,/html.dark\{\s*--hs-shadow-card:[^;]+; --hs-shadow-tile:none;/);
  assert.match(block,/html.dark \.task-card\.tc-new-flash\{--tc-new-shadow:0 0 0 0 transparent;/);
  assert.match(block,/@keyframes tcNewFlash\{\s*from\{box-shadow:0 0 0 3px #F0B323,var\(--tc-new-shadow\);\}\s*to\{box-shadow:0 0 0 3px transparent,var\(--tc-new-shadow\);\}/);
  assert.match(block,/@media\(prefers-reduced-motion:reduce\)\{\s*\.task-card\.tc-new-flash\{animation:none;transition:none;\}/);
  assert.doesNotMatch(block,/!important/);
});
test('toast button contrast is at least 4.5 in both themes using actual CSS backgrounds and inks',()=>{
  for(const dark of [false,true]){
    const button=declarations(css,dark?'html.dark .uxp-undo':'html:not(.dark) .uxp-undo');
    const toast=declarations(html,dark?'html.dark .uxp-toast':'.uxp-toast');
    assert.ok(contrast(property(button,'color'),property(toast,'background'))>=4.5,dark?'dark toast':'light toast');
    assert.equal(property(button,'font-weight'),'800');assert.equal(property(button,'text-decoration'),'underline');
    assert.equal(property(button,'color'),dark?'#0b1a2b':'#fff');
  }
});
