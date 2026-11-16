import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
const block=css.slice(css.indexOf('/* Step 110:'),css.indexOf('/* Step 111:'));
function source(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a);
  assert.ok(a>=0&&b>a,start);
  return html.slice(a,b);
}
const statuses=['pending','in-progress','waiting','on-hold','done','canceled'];
function board(saved){
  let stored=saved;
  const storage={getItem(key){assert.equal(key,'bb_kb_fold');return stored;},
    setItem(key,value){assert.equal(key,'bb_kb_fold');stored=value;}};
  const context=vm.createContext({localStorage:storage,
    SC:Object.fromEntries(statuses.map(s=>[s,{l:s==='done'?'Done':s==='canceled'?'Canceled':s,i:'ti-circle'}])),
    scColors:()=>[],tcLingerFrom:()=>'',tcLingerRec:()=>null,isAutoArchived:t=>!!t.archived,
    isSoon:t=>!!t.soon,dueSortValue:()=>0,
    taskCardHTML:t=>'<article class="task-card" data-id="'+t.id+'"><button>Open</button></article>'});
  vm.runInContext(source('const KB_STATUS_ORDER=','function taskCardClick(')
    +source('function kbFilterPass(','const DONE_ARCHIVE_DAYS=')
    +source('function kanbanHTML(','/* The board is rebuilt'),context);
  return {context,storage,read:()=>JSON.parse(stored),stored:()=>stored};
}
function columns(markup){
  return [...markup.matchAll(/<div class="(kb-col(?: kb-col-folded)?)" data-status="([^"]+)"([\s\S]*?)(?=<div class="kb-col(?: kb-col-folded)?" data-status=|$)/g)]
    .map(([,classes,status,content])=>({classes,status,content}));
}
function output(c,who='boss',filter='all'){
  return columns(c.kanbanHTML(statuses.map(status=>({id:status,status})),who,filter));
}

test('unsaved shelves start folded; saved booleans are separate for each person and shelf',()=>{
  const {context:c}=board();
  for(const who of ['boss','best','dew','o','junior']){
    assert.equal(c.kbFoldGet(who,'done'),true);
    assert.equal(c.kbFoldGet(who,'canceled'),true);
  }
  const b=board(JSON.stringify({boss:{done:false,canceled:true},dew:{done:true,canceled:false}}));
  assert.equal(b.context.kbFoldGet('boss','done'),false);
  assert.equal(b.context.kbFoldGet('boss','canceled'),true);
  assert.equal(b.context.kbFoldGet('dew','done'),true);
  assert.equal(b.context.kbFoldGet('dew','canceled'),false);
  assert.equal(b.context.kbFoldGet('best','done'),true);
  b.context.kbFoldSet('boss','canceled',false);
  b.context.kbFoldSet('junior','done',false);
  assert.deepEqual(b.read(),{boss:{done:false,canceled:false},dew:{done:true,canceled:false},junior:{done:false}});
  assert.equal(board(b.stored()).context.kbFoldGet('junior','done'),false,'survives a reload');
});

test('broken JSON and invalid saved shapes fall back to folded and can be replaced',()=>{
  for(const saved of ['{broken','null','[]','true','42','"text"','{"boss":null}','{"boss":[]}','{"boss":{"done":"false"}}']){
    const b=board(saved);
    assert.equal(b.context.kbFoldGet('boss','done'),true,saved);
    b.context.kbFoldSet('boss','done',false);
    assert.equal(b.context.kbFoldGet('boss','done'),false,saved);
  }
});

test('storage access, JSON parsing and JSON serialisation errors are contained',()=>{
  const b=board();
  b.storage.getItem=()=>{throw new Error('blocked');};
  b.storage.setItem=()=>{throw new Error('quota');};
  assert.equal(b.context.kbFoldGet('boss','done'),true);
  assert.doesNotThrow(()=>b.context.kbFoldSet('boss','done',false));
  delete b.context.localStorage;
  assert.equal(b.context.kbFoldGet('boss','done'),true);
  assert.doesNotThrow(()=>b.context.kbFoldSet('boss','done',false));
  const c=board().context;
  c.JSON={parse(){throw new Error('parse');},stringify(){throw new Error('stringify');}};
  assert.equal(c.kbFoldGet('boss','done'),true);
  assert.doesNotThrow(()=>c.kbFoldSet('boss','done',false));
});

test('only finished shelves get buttons after their count with matching labels and body IDs',()=>{
  const c=board().context;
  for(const who of ['boss','best','dew','o','junior']){
    const cols=output(c,who);
    assert.deepEqual(cols.map(col=>col.status),statuses);
    for(const col of cols){
      const shelf=['done','canceled'].includes(col.status);
      assert.equal(col.classes.includes('kb-col-folded'),shelf);
      assert.equal(col.content.includes('class="kb-fold-btn"'),shelf);
      assert.match(col.content,/class="kb-col-count">1<\/span>/);
      if(!shelf)continue;
      const label='Show the '+(col.status==='done'?'Done':'Canceled')+' tasks';
      const button=col.content.match(/<button type="button" class="kb-fold-btn"[^>]+>/)[0];
      assert.match(col.content,/class="kb-col-count">1<\/span><button/);
      assert.ok(button.includes('aria-expanded="false"'));
      assert.ok(button.includes('aria-label="'+label+'" title="'+label+'"'));
      assert.ok(button.includes('aria-controls="kb-body-'+who+'-'+col.status+'"'));
      assert.ok(col.content.includes('class="kb-col-body" id="kb-body-'+who+'-'+col.status+'"'));
      assert.match(col.content,/<i class="ti ti-chevron-down" aria-hidden="true"><\/i>/);
      let stopped=false,toggled;
      vm.runInNewContext(button.match(/onclick="([^"]+)"/)[1],{
        event:{stopPropagation(){stopped=true;}},kbFoldToggle(...args){assert.equal(stopped,true);toggled=args;}
      });
      assert.deepEqual(toggled,[who,col.status]);
      assert.ok(col.content.includes('ondragover="taskColOver(event)"'));
      assert.ok(col.content.includes('ondragleave="taskColLeave(event)"'));
      assert.ok(col.content.includes('ondrop="taskColDrop(event,\''+who+'\',\''+col.status+'\')"'));
    }
  }
});

test('saved open shelves have Hide labels; each status pill forces its shelf open without changing storage',()=>{
  for(const folded of [false,true]){
    const b=board(JSON.stringify({boss:{done:folded,canceled:folded}})),c=b.context;
    for(const status of ['done','canceled']){
      const normal=output(c).find(col=>col.status===status);
      assert.equal(normal.classes.includes('kb-col-folded'),folded);
      assert.ok(normal.content.includes('aria-expanded="'+(!folded)+'"'));
      assert.ok(normal.content.includes((folded?'Show':'Hide')+' the '+(status==='done'?'Done':'Canceled')+' tasks'));
      const forced=output(c,'boss',status).find(col=>col.status===status);
      assert.equal(forced.classes,'kb-col');
      assert.doesNotMatch(forced.content,/kb-fold-btn/);
      assert.match(forced.content,/class="task-card"/);
      assert.equal(c.kbShelfFolded('boss',status,status),null,'forced open also omits the fold button');
      assert.equal(c.kbFoldGet('boss',status),folded,'a pill does not save a new fold preference');
    }
  }
  const c=board().context;
  for(const filter of ['all','pending','in-progress','soon']){
    assert.equal(c.kbShelfFolded('boss','done',filter),true);
    for(const status of statuses.slice(0,4))assert.equal(c.kbShelfFolded('boss',status,filter),false);
  }
  assert.doesNotMatch(c.kanbanHTML([],'boss','all'),/data-status="canceled"/);
  const empty=columns(c.kanbanHTML([],'boss','all')).find(col=>col.status==='done');
  assert.match(empty.content,/class="kb-col-count">0<\/span>/);
});

// Exercise the production redraw queue, count animation and drop handlers together.
function liveBoard(){
  const b=board(),c=b.context,tasks=[{id:'moving',status:'pending'},{id:'finished',status:'done'}];
  let markup='',cols=[],buttons={};
  const timers=new Map(),renders=[];
  let next=0;
  const list={contains:el=>Object.values(buttons).includes(el),querySelector:()=>null,
    querySelectorAll:()=>cols,
    get innerHTML(){return markup;},set innerHTML(value){
      markup=value;
      cols=columns(value).map(col=>{
        const classes=new Set(col.classes.split(' ')),countClasses=new Set();
        const count={textContent:col.content.match(/class="kb-col-count">(\d+)</)[1],classList:{add:x=>countClasses.add(x),contains:x=>countClasses.has(x)}};
        return {...col,dataset:{status:col.status},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
          querySelector:sel=>sel==='.kb-col-count'?count:null};
      });
      buttons={};
      for(const match of value.matchAll(/<button type="button" class="kb-fold-btn" id="([^"]+)"/g)){
        const button={tagName:'BUTTON',focus(options){assert.deepEqual(options.preventScroll,true);c.document.activeElement=button;}};
        buttons[match[1]]=button;
      }
    }};
  Object.assign(c,{document:{activeElement:null,getElementById:id=>id==='boss-list'?list:buttons[id]||null},
    setTimeout(fn){const id=++next;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    loadedOf:()=>true,tasksOf:()=>tasks,
    renderMember(who){renders.push(who);c.renderList(tasks,who,who+'-list',null,'all');},
    setTaskStatus(who,id,status){tasks.find(t=>t.id===id).status=status;c.renderMember(who);}});
  vm.runInContext(source('var __boardArgs=','function isUrl('),c);
  function flush(){for(const [id,fn] of [...timers]){timers.delete(id);fn();}}
  c.renderMember('boss');flush();
  return {...b,list,tasks,renders,timers,flush,getCols:()=>cols,getButtons:()=>buttons};
}

test('toggle saves, redraws the person immediately and focuses the replacement button with no pending redraw',()=>{
  const b=liveBoard(),c=b.context,original=b.getButtons()['kb-fold-boss-done'];
  c.document.activeElement=original;
  c.kbFoldToggle('boss','done');
  assert.equal(c.kbFoldGet('boss','done'),false);
  assert.equal(b.renders.at(-1),'boss');
  assert.notEqual(c.document.activeElement,original);
  assert.equal(c.document.activeElement,b.getButtons()['kb-fold-boss-done']);
  assert.equal(b.timers.size,0);
  assert.equal(b.getCols().find(col=>col.status==='done').classes,'kb-col');
  c.kbFoldToggle('boss','done');
  assert.equal(c.kbFoldGet('boss','done'),true);
  assert.equal(c.document.activeElement,b.getButtons()['kb-fold-boss-done']);
  assert.equal(b.timers.size,0);
});

test('a folded shelf highlights, accepts a drop and keeps its count tick after the redraw',()=>{
  const b=liveBoard(),c=b.context,shelf=b.getCols().find(col=>col.status==='done');
  const e={currentTarget:shelf,preventDefault(){},dataTransfer:{setData(){}}};
  c.taskDragStart(e,'boss','moving');
  c.taskColOver(e);
  assert.equal(shelf.classList.contains('kb-col-folded'),true);
  assert.equal(shelf.classList.contains('kb-over'),true);
  c.taskColDrop(e,'boss','done');
  assert.equal(shelf.classList.contains('kb-over'),false);
  assert.equal(b.tasks[0].status,'done');
  b.flush();
  const updated=b.getCols().find(col=>col.status==='done');
  assert.equal(updated.classList.contains('kb-col-folded'),true);
  assert.equal(updated.querySelector('.kb-col-count').textContent,'2');
  assert.equal(updated.querySelector('.kb-col-count').classList.contains('kb-count-tick'),true);
});

test('folding hides body keyboard targets, preserves the head line and provides full touch drop targets',()=>{
  assert.ok(css.includes('/* Step 110:'));
  assert.match(block,/\.kb-col\.kb-col-folded>\.kb-col-body\{display:none;\}/);
  assert.match(block,/\.kb-col\.kb-col-folded\{align-self:start;\}/);
  assert.match(block,/\.kb-col\.kb-col-folded\.kb-over\{min-height:56px;\}/);
  assert.doesNotMatch(block,/!important|\.kb-col-head|border-bottom|kb-col-name|kb-col-count|grid-template|kb-over\{[^}]*background/);
  assert.match(html,/\.kb-col\[data-status\] \.kb-col-head\{[^}]*border-bottom:2px solid var\(--c\)/,'the coloured head line stays in its source rule');
  assert.match(block,/width:30px;height:30px;padding:0;border:0;border-radius:var\(--hs-ctl-radius\);/);
  assert.match(block,/background:transparent;color:var\(--muted\);/);
  assert.match(block,/\.kb-fold-btn:hover\{background:var\(--hs-btn-hover\);color:var\(--text\);\}/);
  assert.match(block,/@media\(max-width:600px\),\(pointer:coarse\)\{\s*\.kb-fold-btn\{width:44px;height:44px;\}/);
  assert.match(block,/\.kb-fold-btn i\{font-size:16px;transition:transform \.18s;\}/);
  assert.match(block,/\.kb-col-folded \.kb-fold-btn i\{transform:rotate\(-90deg\);\}/);
  assert.match(block,/@media\(prefers-reduced-motion:reduce\)\{\.kb-fold-btn i\{transition:none;\}\}/);
  assert.match(css,/html body :is\(button,[^}]+:focus-visible\{\s*outline:2px solid var\(--focus-ink,#1d4ed8\);outline-offset:2px;/);
  const eventBoard=source('  function sharedKanbanHTML(tasks,w){','  window.evwsColDrop=');
  assert.doesNotMatch(eventBoard,/kb-fold|kbShelfFolded/);
});
