import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
function source(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,start);
  return html.slice(a,b);
}
const helpers=source('function myBoardKey(','function refOf(');
const plain=value=>JSON.parse(JSON.stringify(value));
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const admin={role:'admin',workspace:'ignored',email:'BOSS@school.test'};
const dew={role:'member',workspace:'dew',email:'DEW@school.test'};
function harness(cur=admin,task={id:'t1',topic:'Brief',status:'pending',dueDate:''}){
  const writes=[],errors=[],fields={},refs={};
  const field=id=>fields[id]||=( {value:'',checked:false,textContent:'',style:{},classList:{add(){},remove(){}},
    focus(){},setAttribute(){},getAttribute(){return '';}} );
  const ref=name=>refs[name]||=( {doc:id=>({id:id||'new',
    update(data){writes.push({op:'update',name,id,data:plain(data)});return Promise.resolve();},
    set(data){writes.push({op:'set',name,id,data:plain(data)});return Promise.resolve();},
    delete(){writes.push({op:'delete',name,id});return Promise.resolve();},
    get:()=>Promise.resolve({exists:false})}),
    add(data){writes.push({op:'add',name,data:plain(data)});return Promise.resolve({id:'new'});} } );
  const c=vm.createContext({console,document:{getElementById:field},
    tasksOf:()=>task?[task]:[],eventTasks:task?.__src==='event'?[task]:[],
    taskAssignees:t=>t.assignees||(t.owner?[t.owner]:[]),isEventTask:t=>t?.__src==='event',
    refOf:ref,taskRef:()=>ref(task?.__src==='event'?'event':'dew'),eventTasksRef:ref('event'),
    db:{collection:ref,batch:()=>({set(r,data){writes.push({op:'batch-set',name:'target',data:plain(data)});},
      delete(){},commit:()=>Promise.resolve()})},
    memberName:w=>({boss:'Boss',dew:'Dew <&"',o:'O'})[w]||w,
    firebase:{firestore:{FieldValue:{serverTimestamp:()=> 'timestamp',delete:()=> 'delete'}}},
    dbSaveFailed:(...args)=>errors.push(args),modalState:{who:'dew'},modalLinks:[],
    eventsOf:()=>[],closeModal(){},uiToast(){},uiConfirm:()=>Promise.resolve(true),
    tcLinger(){},todayStr:()=> '2026-11-16',evtPeopleGet:()=>c.people||[],
    setTimeout(){},taskForFill(){},resetRoleDetails(){},evtFill(){},setTaskCategory(){},
    t24Set(){},renderModalLinks(){},styleModal(){},populateEventSelect(){},designEventName:()=>'',
    setTaskType(){},tfSync(){},autoGrowDesc(){},statusToDz:()=> 'Brief Received',
    daysUntil:()=>1,isSoon:()=>false,escHtml:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    safeUrl:s=>s,fmtDate:s=>s,fmtDue:s=>s,oCardExtra:()=>'',dewCardExtra:()=>'',
    MEMBER_ORDER:['boss','dew','o','junior'],evTagHTML:()=>''
  });
  c.window=c;c.__cur=cur;
  vm.runInContext(source('function meEmail(','/* Step 113: unseen recipients')+helpers
    +source('const SC=','function moveSelectHTML(')
    +source('function moveSelectHTML(','function moveCardTo(')
    +source('function moveCardTo(','function openLinksHub(')
    +source('function taskDoneFields(','/* Step 65:')
    +source('function openEdit(','function styleModal(')
    +source('function saveTask(){','/* Is this card in the Google Sheet?')
    +source('function duplicateTask(','// TASK RENDERING')
    +source('function taskCardClick(','window.__tcOpen=')
    +source('function taskCardHTML(','function kanbanHTML('),c);
  field('m-topic').value='A new task';field('m-status').value='pending';field('m-priority').value='medium';
  return {c,writes,errors,field,ref,task};
}

test('identity and recipient helpers handle admin, member, nobody, duplicates and empty keys',()=>{
  const {c}=harness();
  assert.equal(c.myBoardKey(),'boss');
  assert.deepEqual(plain(c.newForOthers(['boss','dew','dew','','o',null,undefined])),['dew','o']);
  c.__cur=dew;assert.equal(c.myBoardKey(),'dew');
  assert.deepEqual(plain(c.newForOthers(['boss','dew','boss',''])),['boss']);
  c.__cur=null;assert.equal(c.myBoardKey(),'');
  c.__cur={role:'member'};assert.equal(c.myBoardKey(),'');
  for(const task of [{},{newFor:[]},{newFor:'dew'},null])assert.equal(c.taskIsNewFor(task,'dew'),false);
  assert.equal(c.taskIsNewFor({newFor:['dew']},'dew'),true);
});

test('the card builder keeps legacy cards plain and draws the recipient button first with tc-new',()=>{
  const {c}=harness(dew),task={id:'t1',topic:'Brief',status:'pending'};
  for(const newFor of [undefined,[],'dew']){
    const card=c.taskCardHTML({...task,newFor},'dew');
    assert.doesNotMatch(card,/mb-new|tc-new/);
    assert.match(card,/<div class="task-meta"><select/,'the existing facts keep their order');
  }
  const card=c.taskCardHTML({...task,newFor:['dew']},'dew');
  assert.match(card,/class="task-card tc-pending tc-new"/);
  assert.match(card,/<div class="task-meta"><button type="button" class="mb mb-new"/);
  assert.match(card,/aria-label="New task\. Press to mark it as seen\." title="Mark as seen"/);
  assert.match(card,/<i class="ti ti-sparkles" aria-hidden="true"><\/i> New<\/button><select/);
  const handler=card.match(/class="mb mb-new"[^>]*onclick="([^"]+)"/)[1];
  let stopped=0,seen=[];
  vm.runInNewContext(handler,{event:{stopPropagation(){stopped++;}},taskMarkSeen:(...args)=>seen.push(args)});
  assert.equal(stopped,1);assert.deepEqual(seen,[['dew','t1']]);
});

test('observers see an escaped name on a span and shared labels stay on unseen boards only',()=>{
  const {c}=harness(),task={id:'t1',status:'pending',__src:'event',assignees:['boss','dew','o'],newFor:['dew']};
  assert.match(c.taskCardHTML(task,'dew'),/<div class="task-meta"><span class="mb mb-new" title="Not opened by Dew &lt;&amp;&quot; yet">/);
  for(const who of ['boss','o'])assert.doesNotMatch(c.taskCardHTML(task,who),/mb-new|tc-new/);
  c.__cur=dew;assert.match(c.taskCardHTML(task,'dew'),/<button type="button" class="mb mb-new"/);
});

test('mark seen saves remaining recipients and the real editor stamp, without opening',async()=>{
  const h=harness(dew,{id:'t1',__src:'event',newFor:['dew','o','dew']});
  h.c.openEdit=()=>assert.fail('the badge must not open the modal');
  h.c.taskMarkSeen('dew','t1');
  assert.deepEqual(h.writes,[{op:'update',name:'event',id:'t1',data:{newFor:['o'],lastEditedBy:'dew@school.test',lastEditedByName:'Dew <&"',lastEditedAt:'timestamp'}}]);
  assert.deepEqual(h.task.newFor,['dew','o','dew'],'wait for the shared database snapshot');
  h.c.__cur=admin;h.c.taskMarkSeen('dew','t1');assert.equal(h.writes.length,1);
  h.c.__cur=dew;h.c.taskMarkSeen('dew','missing');assert.equal(h.writes.length,1);
  delete h.task.newFor;h.c.taskMarkSeen('dew','t1');assert.equal(h.writes.length,1);
  h.task.newFor=['dew'];h.c.taskRef=()=>({doc:()=>({update:()=>Promise.reject('offline')})});
  h.c.taskMarkSeen('dew','t1');await settle();assert.deepEqual(h.errors,[['offline','the new label']]);
});

for(const [cur,who,shared,people,expected] of [
  [admin,'dew',false,[],['dew']],[dew,'dew',false,[],[]],
  [admin,'boss',true,['boss','dew'],['dew']],[dew,'dew',true,['dew','o'],['o']]
])test('new save assigns unseen recipients: '+who+' '+cur.role+' '+shared,()=>{
  const h=harness(cur);h.c.modalState={who};h.field('m-evt-on').checked=shared;h.c.people=people;
  h.c.saveTask();
  assert.equal(h.writes.length,1);assert.equal(h.writes[0].name,shared?'event':who);
  assert.deepEqual(h.writes[0].data.newFor,expected);assert.equal(h.writes[0].data.createdBy,cur.email.toLowerCase());
});

test('duplicating uses the new-card save and never inherits the original unseen recipients',()=>{
  for(const cur of [admin,dew]){
    const h=harness(cur,{id:'t1',topic:'Original',newFor:['o']});
    h.c.openAdd=who=>{h.c.modalState={who};h.field('m-evt-on').checked=false;};
    h.c.duplicateTask('dew','t1');h.c.saveTask();
    assert.deepEqual(h.writes[0].data.newFor,cur===admin?['dew']:[]);
    assert.equal(h.writes[0].data.topic,'Original (copy)');
  }
});

test('shared edits preserve unseen people, add only new people and remove departed people',()=>{
  for(const newFor of [undefined,['dew','junior']]){
    const h=harness(admin,{id:'t1',__src:'event',assignees:['boss','dew','junior'],newFor,dueDate:''});
    h.c.modalState={who:'boss',editId:'t1'};h.field('m-evt-on').checked=true;h.c.people=['boss','dew','o'];h.c.saveTask();
    assert.deepEqual(h.writes[0].data.newFor,newFor?['dew','o']:['o']);
  }
});

test('type changes mark only newly reached boards and save to the destination collection',async()=>{
  const h=harness(admin,{id:'t1',__src:'own',newFor:['dew'],dueDate:''});
  h.c.modalState={who:'dew',editId:'t1'};h.field('m-evt-on').checked=true;h.c.people=['dew','o','boss'];
  h.c.saveTask();await settle();
  assert.equal(h.writes[0].name,'event');assert.deepEqual(h.writes[0].data.newFor,['dew','o']);
  assert.equal(h.writes[1].op,'delete');assert.equal(h.writes[1].name,'dew');
  const back=harness(admin,{id:'t1',__src:'event',assignees:['dew','o'],newFor:['dew','o'],dueDate:''});
  back.c.modalState={who:'dew',editId:'t1'};back.c.saveTask();await settle();
  assert.equal(back.writes[0].name,'dew');assert.deepEqual(back.writes[0].data.newFor,['dew']);
  assert.ok(!('assignees' in back.writes[0].data));assert.equal(back.writes[1].name,'event');
  const existing=harness(admin,{id:'t1',__src:'own',dueDate:''});
  existing.c.modalState={who:'dew',editId:'t1'};existing.field('m-evt-on').checked=true;existing.c.people=['dew'];existing.c.saveTask();
  assert.deepEqual(existing.writes[0].data.newFor,[],'a legacy recipient is not newly assigned');
  const arrived=harness(admin,{id:'t1',__src:'event',assignees:['o'],dueDate:''});
  arrived.c.modalState={who:'dew',editId:'t1'};arrived.c.saveTask();
  assert.equal(arrived.writes[0].name,'dew');assert.deepEqual(arrived.writes[0].data.newFor,['dew']);
});

test('moves write the new destination, shared reassignment does not re-flag an existing recipient',async()=>{
  const h=harness(admin,{id:'t1',newFor:['junior']});h.c.moveCardTo('boss','t1','dew');await settle();
  assert.deepEqual(h.writes[0].data.newFor,['dew']);
  for(const [assignees,newFor,expected] of [[['boss'],[],['dew']],[['boss','dew'],[],[]],[['boss','dew'],['dew'],['dew']]]){
    const shared=harness(admin,{id:'t1',__src:'event',assignees,newFor});
    shared.c.moveCardTo('boss','t1','dew');await settle();
    assert.equal(shared.writes.length,1);assert.deepEqual(shared.writes[0].data.newFor,expected);
    assert.deepEqual(shared.writes[0].data.assignees,['dew']);
  }
});

for(const method of ['setTaskStatus','setDesignStatus','toggleTaskDone','saveTask'])
  test(method+' clears only the signed-in recipient in its existing write',()=>{
    for(const cur of [dew,admin]){
      const h=harness(cur,{id:'t1',__src:'event',assignees:['dew','o'],newFor:['dew','o'],dueDate:'',status:'pending'});
      if(method==='saveTask'){
        h.c.modalState={who:'dew',editId:'t1'};h.field('m-evt-on').checked=true;h.c.people=['dew','o'];h.c.saveTask();
      }else h.c[method]('dew','t1',method==='setDesignStatus'?'Delivered':'done');
      assert.equal(h.writes.length,1);
      assert.equal(h.writes[0].data.lastEditedBy,cur.email.toLowerCase());
      if(cur===dew)assert.deepEqual(h.writes[0].data.newFor,['o']);
      else assert.deepEqual(h.writes[0].data.newFor??h.task.newFor,['dew','o']);
    }
  });

test('opening through card click or directly clears once for the recipient and never for observers',()=>{
  for(const cur of [dew,admin])for(const direct of [false,true]){
    const h=harness(cur,{id:'t1',status:'pending',newFor:['dew','o']});
    if(direct)h.c.openEdit('dew','t1');else h.c.taskCardClick({target:{closest:()=>false}},'dew','t1');
    assert.equal(h.writes.length,cur===dew?1:0);
    if(cur===dew)assert.deepEqual(h.writes[0].data.newFor,['o']);
    assert.equal(h.c.modalState.editId,'t1');
  }
  const h=harness(dew,{id:'t1',newFor:['dew']});
  h.c.taskCardClick({target:{closest:()=>true}},'dew','t1');assert.equal(h.writes.length,0);
});

test('dragging delegates to the same status write and clears the recipient',()=>{
  const h=harness(dew,{id:'t1',status:'pending',newFor:['dew']});
  vm.runInContext(source('var _taskDrag=','function taskCardClick('),h.c);
  h.c._taskDrag={who:'dew',id:'t1'};
  h.c.taskColDrop({preventDefault(){},stopPropagation(){},currentTarget:{classList:{remove(){}}}},'dew','done');
  assert.equal(h.writes.length,1);assert.deepEqual(h.writes[0].data.newFor,[]);
});

test('Request Centre creation uses the destination board for unseen recipients',async()=>{
  for(const cur of [admin,dew]){
    const h=harness(cur);Object.assign(h.c,{reqs:[{id:'r1',type:'design',data:{},refNo:'R1'}],
      typeOf:()=>({key:'design'}),FS:()=>({collection:h.ref}),rcBrief:()=>'',nmW:w=>w});
    vm.runInContext(source('  window.rcCreateTask=','  window.rcDelete='),h.c);
    h.c.rcCreateTask('dew','r1');await settle();
    assert.deepEqual(h.writes[0].data.newFor,cur===admin?['dew']:[]);
  }
});

test('O template use marks the new card for O unless O creates it; an automatic recurring task is never marked',async()=>{
  for(const cur of [admin,{role:'member',workspace:'o'}]){
    const h=harness(cur),template={id:'tpl',name:'Shoot',recurType:'daily'};
    Object.assign(h.c,{templates:[template],refOfT:()=>h.ref('o'),tdy:()=> '2026-11-16',ts:()=> 'timestamp',
      canGenerate:()=>true,loadedOf:()=>true,tOf:()=>[],dedupeGenerated(){},dueToday:()=>true});
    vm.runInContext(source('  window.tplUse=','  /* ---------- open-app auto-create')
      +source('  function generate(){','  function startTpl()'),h.c);
    h.c.tplUse('tpl');h.c.generate();await settle();
    assert.equal(h.writes.length,2);
    assert.deepEqual(h.writes[0].data.newFor,cur===admin?['o']:[],'Use template is someone giving O a task');
    assert.equal(h.writes[1].data.newFor,undefined,'the app made this one by itself (reviewer\'s correction)');
  }
});

test('Overview reassignment and Claim share the recipient rules',async()=>{
  const h=harness(admin,{id:'t1',__src:'event',assignees:['boss'],newFor:[]});
  h.c.evtList=()=>[h.task];h.c.nm=w=>w;
  vm.runInContext(source('  window.evbAssign=','  function card(){'),h.c);
  h.c.evbAssign('t1','dew');await settle();assert.deepEqual(h.writes[0].data.newFor,['dew']);
  h.c.__cur=dew;h.c.evbClaim('t1');await settle();assert.deepEqual(h.writes[1].data.newFor,[]);
  h.task.assignees=['dew'];h.task.newFor=['dew'];h.c.__cur=admin;
  h.c.evbAssign('t1','dew');await settle();assert.deepEqual(h.writes[2].data.newFor,['dew']);
  h.c.evbAssign('t1','');await settle();assert.deepEqual(h.writes[3].data.newFor,[]);
});

test('authchanged redraws each person board so badge buttons follow the session',()=>{
  const h=harness(),listeners={},redraws=[];
  h.c.addEventListener=(event,handler)=>listeners[event]=handler;
  h.c.renderBoss=()=>redraws.push('boss');h.c.renderMember=w=>redraws.push(w);
  vm.runInContext(source('function evRedrawCards(','/* The whole team shares ONE event hub'),h.c);
  h.c.__cur=dew;listeners.authchanged();assert.deepEqual(redraws,['boss','dew','o','junior']);
});

test('gold badge retains pill sizing, both theme colours, shared focus and an out-of-flow touch target',()=>{
  const block=css.slice(css.indexOf('/* Step 113:'),css.indexOf('/* Step 114:'));
  assert.match(block,/padding:4px 9px;border-radius:99px;font-size:10\.5px;font-weight:700;/);
  assert.match(block,/background:#F0B323;color:#0b1a2b;border:0;/);
  assert.match(block,/\.mb-new i\{color:inherit;/);
  assert.match(block,/button\.mb-new\{position:relative;font-family:inherit;line-height:inherit;cursor:pointer;/);
  assert.match(block,/button\.mb-new:hover\{background:#f7c948;/);
  assert.match(block,/@media\(max-width:600px\),\(pointer:coarse\)/);
  assert.match(block,/::after\{content:"";position:absolute;inset:50% 0 auto;height:44px;transform:translateY\(-50%\);/);
  assert.match(css,/:not\(\.mb-event\):not\(\.mb-shared\):not\(\.mb-new\)/);
  assert.match(css,/html body :is\(button,[^\n]+:focus-visible\{\s*outline:2px solid var\(--focus-ink,#1d4ed8\);outline-offset:2px;/);
  assert.doesNotMatch(block,/!important|animation:|transition:|html\.dark/,'same badge colours in both themes, with no motion');
  const luminance=hex=>hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  assert.ok((luminance('F0B323')+.05)/(luminance('0b1a2b')+.05)>=4.5);
});

// Reviewer's correction: a task the app makes by itself is not "given by someone",
// and which device makes it first is chance, so it carries no New label.
test('an automatic recurring task is not marked as new',async()=>{
  const {readFileSync}=await import('node:fs');
  const page=readFileSync('index.html','utf8');
  const line=page.split('\n').find(l=>l.includes('recurringFrom:t.id,genDate:ds'));
  assert.ok(line,'the recurring task is still generated');
  assert.ok(!line.includes('newFor'),'no newFor on the generated task');
});
