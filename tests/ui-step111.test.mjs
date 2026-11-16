import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
const block=css.slice(css.indexOf('/* Step 111:'),css.indexOf('/* Step 113:'));
function source(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a);
  assert.ok(a>=0&&b>a,start);
  return html.slice(a,b);
}
const statuses=['pending','in-progress','waiting','on-hold','done','canceled'];
function board(){
  const saved={boss:{done:true,canceled:true}};
  const c=vm.createContext({
    localStorage:{getItem:()=>JSON.stringify(saved),setItem(){assert.fail('search must not save fold choices');}},
    SC:Object.fromEntries(statuses.map(s=>[s,{l:s,i:'ti-circle'}])),scColors:()=>[],
    tcLingerFrom:t=>t.linger||'',tcLingerRec:t=>t.linger?{h:80}:null,
    isAutoArchived:t=>!!t.archived,isSoon:t=>!!t.soon,dueSortValue:()=>0,
    taskCardHTML:t=>'<div class="task-card tc-'+t.status+'" data-id="'+t.id+'"></div>'
  });
  vm.runInContext(source('const KB_STATUS_ORDER=','function taskCardClick(')
    +source('function kbFilterPass(','const DONE_ARCHIVE_DAYS=')
    +source('function kanbanHTML(','/* The board is rebuilt'),c);
  return {c,saved};
}
function columns(markup){
  return [...markup.matchAll(/<div class="(kb-col(?: kb-col-folded)?)" data-status="([^"]+)"([\s\S]*?)(?=<div class="kb-col(?: kb-col-folded)?" data-status=|$)/g)]
    .map(([,classes,status,content])=>({classes,status,content,count:Number(content.match(/class="kb-col-count">(\d+)</)[1])}));
}

const sample={topic:'Design a Poster',description:'For the school',eventName:'Open Day',eventLabel:'Admissions',
  category:'Print',requestRef:'REQ-123',assignedBy:'Boss',links:[{title:'แนวทาง Artwork',url:'https://example.com/private-url'}]};
for(const [text,expected] of [
  ['poster',true],['poster day',true],['DESIGN OPEN',true],['แนวทาง',true],['artwork',true],
  ['school',true],['admissions',true],['print',true],['req-123 boss',true],
  ['missing',false],['private-url',false],['poster missing',false],['',true],['   ',true]
])test('kbSearchPass matches every word across the specified fields: '+JSON.stringify(text),()=>{
  assert.equal(board().c.kbSearchPass(sample,text),expected);
});

test('matching handles missing fields, title fallback and canonical Unicode equivalence',()=>{
  const {c}=board();
  assert.equal(c.kbSearchPass({},'poster'),false);
  assert.equal(c.kbSearchPass({},''),true);
  assert.equal(c.kbSearchPass(null,'word'),false);
  assert.equal(c.kbSearchPass({title:'Café',links:[null,{}]},'CAFE\u0301'),true);
  assert.equal(c.kbSearchPass({topic:'Visible name',title:'Old name'},'old'),false,'same name fallback as the card');
  assert.equal(c.kbSearchPass(sample,'  poster   DAY  '),true);
});

test('search and pill narrow cards together, counts agree, Undo still lingers and archives stay hidden',()=>{
  const {c}=board();
  c.__kbSearchText.boss='poster';
  const tasks=[{id:'match',status:'pending',topic:'Poster'},{id:'other',status:'pending',topic:'Video'},
    {id:'progress',status:'in-progress',topic:'Poster'},
    {id:'undo',status:'done',topic:'Video',linger:'pending'},
    {id:'archived',status:'done',topic:'Poster',archived:true,linger:'pending'}];
  const output=c.kanbanHTML(tasks,'boss','pending'),cols=columns(output);
  assert.deepEqual([...output.matchAll(/data-id="([^"]+)"/g)].map(m=>m[1]),['match','undo']);
  assert.equal(cols.find(col=>col.status==='pending').count,2);
  assert.ok(cols.filter(col=>col.status!=='pending').every(col=>col.count===0));
  assert.match(output,/<div style="min-height:80px" class="task-card/);
  assert.match(c.kanbanHTML(tasks,'dew','pending'),/data-id="other"/,'other tabs have no search');
});

test('search opens only shelves with drawn matches, hides their buttons and restores saved choices',()=>{
  const {c,saved}=board();
  const tasks=[{id:'d',status:'done',topic:'Poster'},{id:'c',status:'canceled',topic:'Video'}];
  c.__kbSearchText.boss='poster';
  let cols=columns(c.kanbanHTML(tasks,'boss','all'));
  const done=cols.find(col=>col.status==='done');
  assert.equal(done.classes,'kb-col');assert.equal(done.count,1);
  assert.doesNotMatch(done.content,/kb-fold-btn/);
  assert.equal(c.kbShelfFolded('boss','canceled','all',0),true);
  assert.equal(c.kbShelfFolded('boss','done','pending',0),true);
  const noDone=columns(c.kanbanHTML(tasks,'boss','pending')).find(col=>col.status==='done');
  assert.equal(noDone.classes,'kb-col kb-col-folded');assert.equal(noDone.count,0);
  assert.match(noDone.content,/kb-fold-btn/);
  c.__kbSearchText.boss='video';
  cols=columns(c.kanbanHTML(tasks,'boss','all'));
  assert.equal(cols.find(col=>col.status==='done').classes,'kb-col kb-col-folded');
  assert.equal(cols.find(col=>col.status==='canceled').classes,'kb-col');
  assert.doesNotMatch(cols.find(col=>col.status==='canceled').content,/kb-fold-btn/);
  c.__kbSearchText.boss='';
  assert.ok(columns(c.kanbanHTML(tasks,'boss','all')).filter(col=>['done','canceled'].includes(col.status)).every(col=>col.classes==='kb-col kb-col-folded'));
  assert.deepEqual(saved,{boss:{done:true,canceled:true}});
});

// A small DOM harness runs the real search helpers and redraw queue together.
function live(){
  const {c}=board(),timers=new Map(),renders=[],elements={},tasks={boss:[],dew:[]};
  let next=0;
  function element(tag='DIV'){
    return {tagName:tag,hidden:false,style:{},children:[],value:'',
      set textContent(value){this.text=value;this.children=[];},get textContent(){return this.text||'';},
      set innerHTML(value){assert.fail('the note must use textContent and created elements: '+value);},
      appendChild(child){this.children.push(child);},focus(){c.document.activeElement=this;}};
  }
  for(const who of ['boss','dew']){
    const input=element('INPUT'),clear=element('BUTTON');clear.hidden=true;
    input.parentNode={querySelector:()=>clear};
    elements[who+'-kb-search']=input;elements[who+'-clear']=clear;
    elements[who+'-kb-search-note']=element();elements[who+'-empty']=element();
    let markup='';
    elements[who+'-list']={contains:()=>false,querySelector:()=>null,
      querySelectorAll(selector){
        if(selector==='.task-card')return [...markup.matchAll(/data-id="([^"]+)"/g)];
        return columns(markup).map(col=>({dataset:{status:col.status},querySelector:()=>({textContent:String(col.count),classList:{add(){}}})}));
      },get innerHTML(){return markup;},set innerHTML(value){markup=value;}};
  }
  Object.assign(c,{document:{activeElement:null,getElementById:id=>elements[id]||null,createElement:tag=>element(tag.toUpperCase())},
    setTimeout(fn,delay){const id=++next;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    loadedOf:()=>true,skeletonHTML:()=>'<div>Loading</div>',
    renderMember(who){renders.push(who);c.renderList(tasks[who],who,who+'-list',who+'-empty','all');}});
  vm.runInContext(source('var __boardArgs=','function isUrl('),c);
  const flush=()=>{for(const [id,timer] of [...timers]){timers.delete(id);timer.fn();}};
  return {c,tasks,timers,renders,elements,flush};
}

test('typing coalesces at 120ms, redraws immediately afterwards and preserves independent text and focus',()=>{
  const b=live(),{c,elements:e}=b,input=e['boss-kb-search'];
  c.document.activeElement=input;
  c.kbSearchSet('boss','po');c.kbSearchSet('boss','  poster  ');
  assert.equal(b.renders.length,0);assert.equal(b.timers.size,1);
  assert.equal([...b.timers.values()][0].delay,120);
  assert.equal(c.kbSearchGet('boss'),'poster');assert.equal(input.value,'  poster  ');
  assert.equal(e['boss-clear'].hidden,false);
  b.flush();assert.deepEqual(b.renders,['boss']);assert.equal(b.timers.size,0);
  assert.equal(c.document.activeElement,input);
  c.kbSearchSet('dew','Video');b.flush();
  assert.equal(c.kbSearchGet('boss'),'poster');assert.equal(c.kbSearchGet('dew'),'Video');
  input.value='';c.renderMember('boss');b.flush();
  assert.equal(input.value,'  poster  ','a tab redraw restores its field');
  assert.equal(board().c.kbSearchGet('boss'),'','fresh page memory is empty');
  c.kbSearchSet('boss','   ');assert.equal(c.kbSearchGet('boss'),'');b.flush();
  assert.equal(e['boss-kb-search-note'].hidden,true);
});

test('the drawn count and clear button use safe created elements, including zero and singular',()=>{
  const b=live(),{c,elements:e,tasks}=b,note=e['boss-kb-search-note'];
  for(const count of [0,1,3]){
    tasks.boss=Array.from({length:count},(_,i)=>({id:String(i),status:'pending',topic:'Poster'}));
    c.kbSearchSet('boss','poster');b.flush();
    assert.equal(note.hidden,false);
    assert.equal(note.children[0].textContent,count===0?'No tasks match':count===1?'1 task matches':'3 tasks match');
    assert.equal(note.children[1].className,'kb-search-reset');
    assert.equal(note.children[1].textContent,'Clear search');assert.equal(note.children[1].type,'button');
    assert.equal(e['boss-empty'].style.display,'none');
    assert.ok(columns(e['boss-list'].innerHTML).length>=5,'even an empty pool has its column heads');
  }
  c.kbSearchSet('boss','<img src=x onerror=alert(1)>');b.flush();
  assert.equal(note.children[0].textContent,'No tasks match');
  assert.equal(note.children.length,2);
});

test('both clear buttons and Escape cancel pending typing, redraw immediately and focus the field',()=>{
  for(const method of ['cross','reset','escape']){
    const b=live(),{c,elements:e}=b;
    b.tasks.boss=[{id:'one',status:'pending',topic:'Poster'}];
    c.kbSearchSet('boss','poster');b.flush();c.kbSearchSet('boss','pending text');
    if(method==='reset')e['boss-kb-search-note'].children[1].onclick();
    else if(method==='escape'){
      let prevented=false,stopped=false;
      c.kbSearchKey({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}},'boss');
      assert.ok(prevented&&stopped);
    }else c.kbSearchClear('boss');
    assert.equal(c.kbSearchGet('boss'),'');assert.equal(e['boss-kb-search'].value,'');
    assert.equal(c.document.activeElement,e['boss-kb-search']);assert.equal(e['boss-clear'].hidden,true);
    assert.equal(e['boss-kb-search-note'].hidden,true);assert.equal(e['boss-kb-search-note'].children.length,0);
    assert.equal(b.timers.size,0);assert.match(e['boss-list'].innerHTML,/data-id="one"/);
  }
  const b=live();b.c.kbSearchKey({key:'Enter'},'boss');assert.equal(b.renders.length,0);
});

test('each static and generated person tab has one field and one live note outside the board',()=>{
  const c=vm.createContext({MEMBERS:Object.fromEntries(['dew','o','junior','best','extra'].map(w=>[w,{}]))});
  vm.runInContext(source('function memberPanelHTML(w){','function buildDepartment('),c);
  const boss=source('<div class="sub-panel" id="boss-sub-tasks">','<!-- Links sub-panel -->');
  for(const [who,markup] of [['boss',boss],...Object.keys(c.MEMBERS).map(w=>[w,c.memberPanelHTML(w)])]){
    assert.equal((markup.match(/class="kb-search-input"/g)||[]).length,1,who);
    assert.equal((markup.match(/class="kb-search-note"/g)||[]).length,1,who);
    assert.ok(markup.indexOf('class="kb-search"')<markup.indexOf('class="addtask-bar"'));
    assert.ok(markup.indexOf('id="'+who+'-kb-search-note"')<markup.indexOf('id="'+who+'-list"'));
    assert.match(markup,/role="status" aria-live="polite" hidden><\/div>/);
    assert.ok(markup.includes('oninput="kbSearchSet(\''+who+'\',this.value)"'));
    assert.ok(markup.includes('onkeydown="kbSearchKey(event,\''+who+'\')"'));
    assert.ok(markup.includes('onclick="kbSearchClear(\''+who+'\')"'));
    for(const attr of ['type="search"','placeholder="Search tasks"','aria-label="Search the tasks on this board"',
      'autocomplete="off"','spellcheck="false"','enterkeyhint="search"','role="search"'])assert.ok(markup.includes(attr),attr);
    assert.equal((markup.match(/class="fpill/g)||[]).length,6);
  }
});

test('desktop and phone styles retain scrolling pills, accessible fields, quiet counts and theme focus',()=>{
  assert.match(block,/\.tab-panel \.filter-tabs\{flex-wrap:nowrap;align-items:center;column-gap:8px;/);
  assert.match(block,/\.kb-filter-pills\{display:flex;gap:6px;flex:0 1 auto;min-width:0;overflow-x:auto;/);
  assert.match(block,/flex:0 1 220px;width:220px;min-width:160px;/);
  assert.match(block,/height:var\(--hs-ctl-h\);margin-left:auto;/);
  assert.match(block,/border:1px solid var\(--hs-btn-line\);border-radius:var\(--hs-ctl-radius\);background:var\(--surface\);color:var\(--text\);/);
  assert.match(block,/font-size:13\.5px;box-shadow:none;outline:none;/);
  assert.match(block,/\.kb-search-input::placeholder\{color:var\(--muted\);opacity:1;/);
  assert.equal((css.match(/:is\(input,textarea\):not\(\.kb-search-input\)::placeholder/g)||[]).length,2,'older important placeholder colours exclude the new field');
  assert.match(block,/\.kb-search-input::-webkit-search-cancel-button\{display:none;/);
  assert.match(block,/\.kb-search:focus-within\{border-color:#003057;box-shadow:var\(--hs-focus\);outline:none;/);
  assert.match(block,/html.dark \.kb-search:focus-within\{border-color:#8fb4dc;/);
  assert.match(block,/width:28px;height:28px;/);
  assert.match(block,/\.kb-search-note\[hidden\],\.kb-search-note:empty\{display:none;/);
  assert.match(block,/margin:0 0 8px;font-size:12\.5px;color:var\(--muted\);/);
  assert.match(block,/\.kb-search-count\{color:var\(--text\);font-weight:600;/);
  assert.match(block,/html.dark \.kb-search-reset\{color:#cfe0f5;/);
  const phone=block.slice(block.indexOf('@media(max-width:600px){'));
  assert.match(phone,/\.kb-search\{order:-1;flex:0 0 100%;width:100%;min-width:0;height:44px;/);
  assert.match(phone,/html body \.kb-search-input\{font-size:16px;/);
  assert.match(phone,/\.tab-panel \.kb-filter-pills\{flex:0 0 100%;width:100%;/);
  assert.match(phone,/\.kb-search-clear\{width:44px;height:44px;/);
  assert.match(phone,/\.kb-search-reset\{min-height:44px;/);
  assert.doesNotMatch(block,/!important|\.cmdk|\.evws/);
});
