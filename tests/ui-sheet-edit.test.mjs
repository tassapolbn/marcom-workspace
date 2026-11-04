import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const helper=readFileSync(new URL('../assets/sheet-sync.js',import.meta.url),'utf8');
const marker='<script id="sheet-script">';
const start=source.indexOf(marker)+marker.length;
const script=source.slice(start,source.indexOf('</script>',start));
const plain=value=>JSON.parse(JSON.stringify(value));
const url='https://script.google.com/macros/s/saved/exec';
const tabs={boss:'Boss',dew:'Dew',o:'O',junior:'Eye'};
const card=(member='boss',extra={})=>({topic:'Campaign',status:'pending',
  sheetRow:{member,tab:tabs[member],row:5,title:'Campaign'},...extra});

function sheet({cfg={url,secret:'phrase'},reply={ok:true,tab:'Boss',row:5},fetchError=false,updateError=false}={}){
  const calls=[],toasts=[],updates=[],logs=[],infos=[];
  const db={collection:()=>({doc:()=>({onSnapshot(fn){fn({exists:!!cfg,data:()=>cfg});return ()=>{};}})})};
  const context=vm.createContext({
    document:{readyState:'complete',getElementById:()=>null},
    firebase:{firestore:()=>db},whenAuthed:fn=>fn(),
    console:{error:(...args)=>logs.push(args),info:(...args)=>infos.push(args)},
    fetch:async (address,options)=>{
      calls.push({address,options,body:JSON.parse(options.body)});
      if(fetchError)throw new Error('offline');
      return {json:async()=>reply};
    },
    uiToast:(message,options)=>toasts.push({message,options}),
    stampEdit:()=>({lastEditedBy:'boss@example.test',lastEditedAt:'stamp'})
  });
  context.window=context;
  vm.runInContext(helper,context);
  vm.runInContext(script,context);
  const colRef={id:'boss_tasks',doc:id=>({update:async upd=>{
    if(updateError)throw new Error('update denied');
    updates.push({id,upd:plain(upd)});
  }})};
  return {context,calls,toasts,updates,logs,infos,colRef};
}

async function sync(h,method,before,after={...before,status:'done'}){
  if(method==='sheetSyncEdit')await h.context[method]('o','card-1',before,after,h.colRef);
  else await h.context[method]('o','card-1',before);
}

test('all sync helpers quietly skip missing links, invalid members, missing helper and paused configuration',async()=>{
  for(const method of ['sheetSyncEdit','sheetSyncCancel','sheetSyncRestore']){
    for(const task of [null,{},card('unknown'),card('__proto__'),card('constructor'),card(['boss'])]){
      const h=sheet();await sync(h,method,task);
      assert.equal(h.calls.length,0);assert.equal(h.toasts.length,0);assert.equal(h.updates.length,0);
    }
    for(const cfg of [null,{url:'',secret:'phrase'}]){
      const h=sheet({cfg});await sync(h,method,card());assert.equal(h.calls.length,0);
    }
    const h=sheet();h.context.MarcomSheet=undefined;
    await sync(h,method,card());assert.equal(h.calls.length,0);assert.equal(h.logs.length,0);
  }
});

test('unchanged sheet cells make no request, including app-only edits',async()=>{
  const h=sheet(),before=card();
  await sync(h,'sheetSyncEdit',before,{...before});
  await sync(h,'sheetSyncEdit',before,{...before,sortOrder:9,dzRevisions:4});
  assert.equal(h.calls.length,0);assert.equal(h.updates.length,0);
});

test('Boss status edit sends only the changed cell using the linked member and row hints',async()=>{
  const h=sheet();await sync(h,'sheetSyncEdit',card());
  assert.equal(h.calls.length,1);
  assert.deepEqual(h.calls[0].body,{action:'update',who:'boss',cardId:'card-1',row:5,title:'Campaign',values:{status:'Completed'},secret:'phrase'});
  assert.equal(h.updates.length,0);assert.equal(h.toasts.length,0);
});

test('title changes save new fallback hints, including an explicitly cleared title',async()=>{
  for(const title of ['New campaign','']){
    const h=sheet({reply:{ok:true}}),before=card();
    await sync(h,'sheetSyncEdit',before,{...before,topic:title});
    assert.deepEqual(h.calls[0].body.values,{task:title});
    assert.equal(h.calls[0].body.title,'Campaign');
    assert.deepEqual(h.updates,[{id:'card-1',upd:{sheetRow:{member:'boss',tab:'Boss',row:5,title}}}]);
  }
});

test('a moved sheet row saves its returned location; unchanged or absent row does not write',async()=>{
  const h=sheet({reply:{ok:true,tab:'Eye',row:12}});
  await sync(h,'sheetSyncEdit',card());
  assert.deepEqual(h.updates,[{id:'card-1',upd:{sheetRow:{member:'boss',tab:'Eye',row:12,title:'Campaign'}}}]);
  for(const reply of [{ok:true,row:5},{ok:true}]){
    const unchanged=sheet({reply});await sync(unchanged,'sheetSyncEdit',card());
    assert.equal(unchanged.updates.length,0);
  }
});

test('shared row hint updates stamp edits for collection and source markers',async()=>{
  for(const bySource of [false,true]){
    const h=sheet({reply:{ok:true,row:8}});
    if(!bySource)h.colRef.id='event_tasks';
    await sync(h,'sheetSyncEdit',card('boss',bySource?{__src:'event'}:{}));
    assert.deepEqual(h.updates,[{id:'card-1',upd:{
      sheetRow:{member:'boss',tab:'Boss',row:8,title:'Campaign'},
      lastEditedBy:'boss@example.test',lastEditedAt:'stamp'
    }}]);
  }
});

for(const [method,prefix] of [
  ['sheetSyncEdit','The change was saved, but the Google Sheet (Boss) was not updated: '],
  ['sheetSyncCancel','The card was deleted, but its row in the Google Sheet (Boss) was not marked Canceled: '],
  ['sheetSyncRestore','The card was restored, but its status in the Google Sheet (Boss) was not put back: ']
]){
  test(method+' quietly logs missing rows and gives one tab-specific toast for other failures',async()=>{
    const missing=sheet({reply:{ok:false,error:'not found'}});
    await sync(missing,method,card());
    assert.equal(missing.toasts.length,0);assert.equal(missing.infos.length,1);assert.equal(missing.updates.length,0);
    for(const [error,reason] of [
      ['protected',"Boss's tab is protected, and the account that runs the link cannot edit it"],
      ['unauthorised','the secret phrase in Settings does not match the script'],
      ['secret not set','the script still has its sample secret phrase; set your own and redeploy it'],
      ['network','Google could not be reached']
    ]){
      const h=sheet({reply:{ok:false,error},fetchError:error==='network'});
      await sync(h,method,card());
      assert.equal(h.toasts.length,1);assert.equal(h.toasts[0].message,prefix+reason+'.');
      assert.equal(h.toasts[0].options.duration,9000);assert.equal(h.updates.length,0);
    }
  });
}

test('cancel and restore use each linked tab wording without deleting a row',async()=>{
  for(const [member,canceled] of [['boss','Canceled'],['junior','Canceled'],['o','CANCELLED'],['dew','Cancel']]){
    const h=sheet(),task=card(member,{status:'in-progress'});
    await sync(h,'sheetSyncCancel',task);
    await sync(h,'sheetSyncRestore',task);
    assert.equal(h.calls.length,2);
    for(const [i,status] of [canceled,'In progress'].entries()){
      assert.deepEqual(h.calls[i].body,{action:'update',who:member,cardId:'card-1',row:5,title:'Campaign',values:{status},secret:'phrase'});
    }
    assert.equal(h.updates.length,0);assert.equal(h.toasts.length,0);
  }
  const h=sheet();await sync(h,'sheetSyncRestore',card('dew',{status:'on-hold',dzStatus:'In Progress'}));
  assert.deepEqual(h.calls[0].body.values,{status:' Hold'});
});

test('unexpected helper and metadata-write failures are caught and logged',async()=>{
  for(const method of ['sheetSyncEdit','sheetSyncCancel','sheetSyncRestore']){
    const h=sheet();h.context.sheetCall=()=>{throw new Error('unexpected');};
    await assert.doesNotReject(sync(h,method,card()));
    assert.equal(h.logs.length,1);assert.equal(h.toasts.length,0);
  }
  const h=sheet({reply:{ok:true,row:9},updateError:true});
  await assert.doesNotReject(sync(h,'sheetSyncEdit',card()));
  assert.equal(h.logs.length,1);assert.equal(h.toasts.length,0);
});

function between(from,to){
  const at=source.indexOf(from);assert.notEqual(at,-1,from);
  const end=source.indexOf(to,at+from.length);assert.notEqual(end,-1,to);
  return source.slice(at,end);
}
const baseDelete=between('function deleteWithUndo(', '// TASK MODAL');
const calendarDelete=between('  var _dwu=window.deleteWithUndo;', '  /* ---------- Settings panel ---------- */');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

for(const calendar of [false,true]){
  test((calendar?'calendar':'base')+' deletion Undo runs afterUndo only after a successful restore',async()=>{
    for(const fail of [false,true]){
      let undo,resolveSet,rejectSet,restored;
      const events=[];
      const pending=new Promise((resolve,reject)=>{resolveSet=resolve;rejectSet=reject;});
      const colRef={doc:id=>{
        assert.equal(id,'card-1');
        return {delete:async()=>events.push('delete'),set:data=>{restored=plain(data);events.push('set');return pending;}};
      }};
      const c=vm.createContext({Promise,console:{error:()=>{}},
        uiToast:(message,options)=>{undo=options?.undo;},
        dbSaveFailed:()=>events.push('failed'),gcsConfigured:()=>false,
        meEmail:()=>'',stampEdit:()=>({})
      });c.window=c;
      vm.runInContext(baseDelete+(calendar?'\n'+calendarDelete:''),c);
      const item={id:'card-1',__src:'event',...card(),...(calendar?{gcalEventId:'event-1'}:{})};
      await c.deleteWithUndo(colRef,'card-1',item,'Task deleted',()=>events.push('afterUndo'));
      await flush();assert.equal(typeof undo,'function');
      undo();assert.deepEqual(events,['delete','set']);
      assert.equal(restored.id,undefined);assert.equal(restored.__src,undefined);
      assert.deepEqual(restored.sheetRow,item.sheetRow);
      if(fail)rejectSet(new Error('permission denied'));else resolveSet();
      await flush();
      assert.deepEqual(events,['delete','set',fail?'failed':'afterUndo']);
    }
  });
}

test('edit, move, menu and done hooks stay in the requested paths and preserve existing behavior',()=>{
  const edit=between('  if(modalState.editId&&wasEvent===evtOn){','  else if(modalState.editId&&wasEvent!==evtOn){');
  assert.match(edit,/update\(data\)[\s\S]*sheetSyncEdit\(modalState.who,modalState.editId,old,Object.assign\(\{\},old\|\|\{\},data\),ref\)/);
  assert.doesNotMatch(edit,/sheetSyncNew\(/);
  const move=between('  else if(modalState.editId&&wasEvent!==evtOn){','    data.createdAt=firebase.firestore.FieldValue.serverTimestamp();');
  assert.match(move,/const thatWho=modalState.who,thatId=modalState.editId;\s*ref.add\(merged\).then\(function\(newDoc\)/);
  assert.match(move,/sheetSyncEdit\(thatWho,newDoc.id,old,merged,ref\)[\s\S]*srcRef.doc\(thatId\).delete\(\)/);
  for(const [from,to] of [['function setTaskStatus(','function setDesignStatus('],['function setDesignStatus(','\n']]){
    const block=between(from,to);
    assert.match(block,/const card=\(tasksOf\(who\)\|\|\[\]\).find\(x=>x.id===id\)/);
    assert.match(block,/const fields=/);
    assert.match(block,/update\(fields\)[\s\S]*sheetSyncEdit\(who,id,card,Object.assign\(\{\},card,fields\),ref\)/);
    assert.match(block,/rcMirrorStatus\(/);
  }
  const done=between('function toggleTaskDone(','/* Step 65:');
  assert.equal((done.match(/sheetSyncEdit\(/g)||[]).length,2);
  assert.match(done,/sheetSyncEdit\(who,id,t,Object.assign\(\{\},t,fields\),rf\)/);
  assert.match(done,/sheetSyncEdit\(who,id,Object.assign\(\{\},t,fields\),Object.assign\(\{\},t,taskDoneFields\(previous,false\)\),rf\)/);
  for(const block of [edit,move,done]){
    assert.equal((block.match(/sheetSyncEdit\(/g)||[]).length,
      (block.match(/try\{if\(window.sheetSyncEdit\)sheetSyncEdit\([^\n]+catch\(e\)\{console.error\('\[sheet\] step failed',e\);\}/g)||[]).length);
  }
});

test('delete hooks require a linked card and both Undo implementations accept the callback',()=>{
  const deletion=between('function deleteTask(','function duplicateTask(');
  assert.match(deletion,/if\(!ok\)return;[\s\S]*if\(t&&t.sheetRow&&window.sheetSyncCancel\)sheetSyncCancel\(who,id,t\)/);
  assert.match(deletion,/var afterUndo=t&&t.sheetRow\?function\(\)\{try\{if\(window.sheetSyncRestore\)sheetSyncRestore\(who,id,t\);\}catch\(e\)/);
  assert.equal((deletion.match(/deleteWithUndo\(_cref,id,t,'Task deleted',afterUndo\)/g)||[]).length,2);
  assert.match(baseDelete,/function deleteWithUndo\(colRef,id,item,label,afterUndo\)/);
  assert.match(calendarDelete,/window.deleteWithUndo=function\(colRef,id,item,label,afterUndo\)/);
  assert.match(calendarDelete,/_dwu.apply\(this,arguments\)/);
  for(const block of [baseDelete,calendarDelete]){
    assert.match(block,/set\(data\).then\(function\(\)\{\s*if\(typeof afterUndo==='function'\)afterUndo\(\)/);
    assert.match(block,/dbSaveFailed\(e,'the restored item'\)/);
  }
});
