import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
const step104=css.slice(css.indexOf('/* Step 104:'),css.indexOf('/* Step 106:'));
function source(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a);
  assert.ok(a>=0&&b>a,'source exists: '+start);
  return html.slice(a,b);
}
const handlers=source('var _taskDrag=','function taskCardClick(');
const eventDrop=source('  window.evwsColDrop=function(','  function wsHTML(');

function board(){
  const columns=[],children=[],changes=[];
  function element(){
    const classes=new Set();
    let text='';
    return {style:{},attributes:{},textWrites:0,offsetWidth:160,offsetHeight:30,
      classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
      setAttribute(name,value){this.attributes[name]=value;},
      get textContent(){return text;},set textContent(value){text=value;this.textWrites++;},
      set innerHTML(value){assert.fail('the hint must use textContent');}
    };
  }
  const card=element();
  function column(name,hasCard=false){
    const c=element(),child={};
    c.querySelector=selector=>selector==='.kb-col-name'?{textContent:name}:
      selector==='.kb-dragging'&&hasCard&&card.classList.contains('kb-dragging')?card:null;
    c.contains=node=>node===child||(hasCard&&node===card);
    columns.push(c);
    return {c,child};
  }
  const own=column('Pending',true),other=column('In Progress'),shelf=column('Done');
  const document={body:{appendChild:el=>children.push(el)},createElement:tag=>{
    assert.equal(tag,'div');return element();
  },querySelectorAll:selector=>{
    assert.equal(selector,'.kb-col.kb-over');return columns.filter(c=>c.classList.contains('kb-over'));
  }};
  const window={innerWidth:1000,innerHeight:700};
  const context=vm.createContext({document,window,
    tasksOf:who=>who==='boss'?[{id:'moving',status:'pending'}]:[],
    setTaskStatus:(...args)=>changes.push(args)
  });
  vm.runInContext(handlers+eventDrop,context);
  function event(col=other,coords={clientX:100,clientY:200}){
    return {currentTarget:col.c,target:col.child,relatedTarget:null,...coords,
      dataTransfer:{},prevented:false,preventDefault(){this.prevented=true;}};
  }
  context.taskDragStart({currentTarget:card,dataTransfer:{setData(){}}},'boss','moving');
  return {context,window,card,own,other,shelf,children,changes,event};
}

test('step 104 stretches the row and grows the body only at 601px and wider',()=>{
  assert.ok(css.includes('/* Step 104:'));
  const media=step104.match(/@media\(min-width:601px\)\{([\s\S]*?)\n\}/);
  assert.ok(media);
  assert.match(media[1],/\.kanban-board\{align-items:stretch;\}/);
  assert.match(media[1],/\.kb-col>\.kb-col-body\{flex:1 1 auto;\}/);
  assert.equal((step104.match(/@media/g)||[]).length,1);
  assert.doesNotMatch(media[1],/task-card|grid-template|grid-column|background|border|gap|justify-content/);
  assert.doesNotMatch(step104,/!important/);
  assert.match(html,/\.kanban-board\{[^}]*align-items:start;/,'the phone default remains');
  assert.match(html,/\.kb-col\{[^}]*display:flex;flex-direction:column;/);
  assert.match(html,/\.kb-col-body\{[^}]*display:flex;flex-direction:column;/);
  const older=html+css.slice(0,css.indexOf('/* Step 104:'));
  assert.doesNotMatch(older,/\.kanban-board[^{}]*\{[^}]*align-items:[^;]*!important/);
  assert.doesNotMatch(older,/\.kb-col(?:>|\s)[^{}]*\.kb-col-body\{[^}]*flex:[^;]*!important/);
});

test('the pointer label is hidden, fixed, above the board, and styled in both themes',()=>{
  const light=step104.match(/\n#kb-drop-hint\{([^}]+)\}/)[1];
  for(const declaration of ['display:none','position:fixed','pointer-events:none','z-index:10001',
    'background:#003057','color:#fff','font-size:12.5px','font-weight:700','padding:6px 10px',
    'border-radius:8px','box-shadow:var(--hs-shadow-float)'])assert.ok(light.includes(declaration),declaration);
  assert.match(step104,/html\.dark #kb-drop-hint\{background:#cfe0f5;color:#0b1a2b;\}/);
});

test('dragging over another column uses its heading, follows client coordinates and keeps the highlight',()=>{
  const b=board(),e=b.event();
  b.context.taskColOver(e);
  assert.equal(e.prevented,true);
  assert.equal(e.dataTransfer.dropEffect,'move');
  assert.equal(b.other.c.classList.contains('kb-over'),true);
  assert.equal(b.children.length,1);
  const hint=b.children[0];
  assert.equal(hint.id,'kb-drop-hint');
  assert.equal(hint.attributes.role,'status');
  assert.equal(hint.attributes['aria-live'],'polite');
  assert.equal(hint.textContent,'Move to In Progress');
  assert.deepEqual(hint.style,{display:'block',left:'114px',top:'218px'});
});

test('repeated dragover only changes text when the name changes and reuses one element',()=>{
  const b=board();
  b.context.taskColOver(b.event());
  const hint=b.children[0];
  b.context.taskColOver(b.event(b.other,{clientX:150,clientY:250}));
  assert.equal(hint.textWrites,1);
  assert.equal(hint.style.left,'164px');
  assert.equal(hint.style.top,'268px');
  b.context.taskColLeave(b.event());
  b.context.taskColOver(b.event(b.shelf));
  assert.equal(b.children.length,1);
  assert.equal(hint.textContent,'Move to Done');
  assert.equal(hint.textWrites,2);
  assert.equal(hint.style.display,'block');
});

test('the hint stays at least 8px from the window edges',()=>{
  const b=board();
  b.context.taskColOver(b.event(b.other,{clientX:999,clientY:699}));
  const hint=b.children[0];
  assert.equal(hint.style.left,'832px');
  assert.equal(hint.style.top,'662px');
  b.context.taskColOver(b.event(b.other,{clientX:-100,clientY:-100}));
  assert.equal(hint.style.left,'8px');
  assert.equal(hint.style.top,'8px');
});

test('the source column has no label even when entered after another column',()=>{
  const b=board();
  b.context.taskColOver(b.event(b.own));
  assert.equal(b.children.length,0);
  assert.equal(b.own.c.classList.contains('kb-over'),true);
  b.context.taskColOver(b.event());
  b.context.taskColOver(b.event(b.own));
  assert.equal(b.children[0].style.display,'none');
});

test('leaving the column hides the label, but moving between its children keeps it visible',()=>{
  const b=board();
  b.context.taskColOver(b.event());
  b.context.taskColLeave({...b.event(),relatedTarget:b.other.child});
  assert.equal(b.children[0].style.display,'block');
  assert.equal(b.other.c.classList.contains('kb-over'),true);
  b.context.taskColLeave(b.event());
  assert.equal(b.children[0].style.display,'none');
  assert.equal(b.other.c.classList.contains('kb-over'),false);
});

test('dragend, including native Escape cancellation, hides the hint and clears drag state',()=>{
  const b=board();
  b.context.taskColOver(b.event());
  b.context.taskDragEnd({currentTarget:b.card});
  assert.equal(b.children[0].style.display,'none');
  assert.equal(b.card.classList.contains('kb-dragging'),false);
  assert.equal(b.other.c.classList.contains('kb-over'),false);
  assert.equal(b.context._taskDrag.id,null);
  b.context.taskColOver(b.event());
  assert.equal(b.children[0].style.display,'none','an external drag has no card hint');
});

for(const name of ['taskColDrop','evwsColDrop']){
  function drop(b,e,status,who='boss'){
    if(name==='taskColDrop')b.context.taskColDrop(e,who,status);
    else b.window.evwsColDrop(e,status);
  }
  test(name+' hides the label and preserves the status change',()=>{
    const b=board(),e=b.event();
    b.context.taskColOver(e);
    drop(b,e,'in-progress');
    assert.equal(b.children[0].style.display,'none');
    assert.equal(b.other.c.classList.contains('kb-over'),false);
    assert.deepEqual(b.changes,[['boss','moving','in-progress']]);
  });
  test(name+' hides the label before early returns and keeps same-status drops inert',()=>{
    const b=board();
    b.context.taskColOver(b.event());
    drop(b,b.event(b.own),'pending');
    assert.equal(b.children[0].style.display,'none');
    assert.deepEqual(b.changes,[]);
    b.context.taskColOver(b.event());
    b.context._taskDrag={who:null,id:null};
    drop(b,b.event(),'done');
    assert.equal(b.children[0].style.display,'none');
    assert.deepEqual(b.changes,[]);
  });
}

test('both board templates retain the shared drag handlers and their respective drop handlers',()=>{
  assert.equal((html.match(/ondragover="taskColOver\(event\)" ondragleave="taskColLeave\(event\)"/g)||[]).length,2);
  assert.match(html,/ondrop="taskColDrop\(event,/);
  assert.match(html,/ondrop="evwsColDrop\(event,/);
  assert.match(html,/ondragend="taskDragEnd\(event\)"/);
});

// Found in the browser check: an older light-theme rule removed the highlight of the column under the pointer.
test('the column under the pointer is highlighted in the light theme too',()=>{
  const page=readFileSync('index.html','utf8');
  assert.match(page,/html:not\(\.dark\) \.kb-col:not\(\.kb-over\),html:not\(\.dark\) \.kb-col\[data-status\]:not\(\.kb-over\)\{background:transparent!important;box-shadow:none!important;\}/);
  assert.doesNotMatch(page,/html:not\(\.dark\) \.kb-col,html:not\(\.dark\) \.kb-col\[data-status\]\{background:transparent!important/);
  assert.match(page,/\.kb-col\.kb-over\{background:color-mix\(in srgb,var\(--c\) 10%,transparent\)!important;/);
});
