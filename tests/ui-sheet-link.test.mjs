import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const helper=readFileSync(new URL('../assets/sheet-sync.js',import.meta.url),'utf8');
const marker='<script id="sheet-script">';
const start=source.indexOf(marker)+marker.length;
const script=source.slice(start,source.indexOf('</script>',start));
const url='https://script.google.com/macros/s/saved/exec';
const plain=value=>JSON.parse(JSON.stringify(value));
const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

function sheet({cfg={url,secret:'saved phrase'},reply={ok:true,tab:'Boss',row:5},replies,role='admin',fetchError=false,updateError=false,saveError=false}={}){
  const calls=[],toasts=[],updates=[],saves=[],logs=[],watches=[];
  const nodes=Object.fromEntries(['sheet-url','sheet-secret','sheet-test-out'].map(id=>[id,{value:'',textContent:'',innerHTML:'',style:{}}]));
  const body={appendChild:node=>{nodes[node.id]=node;}};
  let snapshot,authed,opened=0;
  const db={collection:name=>({doc:id=>({
    onSnapshot(fn){watches.push([name,id]);snapshot=fn;fn({exists:!!cfg,data:()=>cfg});return ()=>{};},
    async set(data,options){if(saveError)throw new Error('permission denied');saves.push({name,id,data:plain(data),options:plain(options)});}
  })})};
  const context=vm.createContext({document:{readyState:'complete',getElementById:id=>nodes[id],
    querySelector:selector=>selector==='#settings-modal .modal-body'?body:null,createElement:()=>({style:{},innerHTML:'',textContent:''})},
    firebase:{firestore:()=>db},console:{error:(...args)=>logs.push(args)},
    fetch:async (address,options)=>{calls.push({address,options,body:JSON.parse(options.body)});if(fetchError)throw new Error('offline');return {json:async()=>replies?replies[calls.length-1]:reply};},
    uiToast:(message,options)=>toasts.push({message,options}),stampEdit:()=>({lastEditedBy:'boss@example.test',lastEditedAt:'stamp'}),
    escHtml:escape,whenAuthed:fn=>{authed=fn;},setTimeout:fn=>fn(),__cur:{role},openSettings:()=>{opened++;}});
  context.window=context;
  vm.runInContext(helper,context);
  vm.runInContext(script,context);
  assert.equal(watches.length,0,'watch waits for authentication');
  authed();authed();
  assert.deepEqual(watches,[['dept_settings','sheetsync']]);
  const colRef={id:'boss_tasks',doc:id=>({update:async upd=>{if(updateError)throw new Error('update denied');updates.push({id,upd:plain(upd)});}})};
  return {context,nodes,calls,toasts,updates,saves,logs,colRef,setConfig:cfg=>snapshot({exists:!!cfg,data:()=>cfg}),opened:()=>opened};
}

test('sync quietly skips unconfigured, missing, and unassigned cards',async()=>{
  const h=sheet({cfg:null});
  assert.equal(h.context.sheetConfigured(),false);
  assert.deepEqual(plain(await h.context.sheetCall({action:'ping'})),{ok:false,error:'not configured'});
  await h.context.sheetSyncNew('boss','card',{topic:'Task'},h.colRef);
  h.setConfig({url,secret:'secret'});
  await h.context.sheetSyncNew('boss','shared',{__src:'event',assignees:[],owner:'',topic:'Task'},h.colRef);
  await h.context.sheetSyncNew('boss','',{topic:'Task'},h.colRef);
  await h.context.sheetSyncNew('boss','card',null,h.colRef);
  h.context.MarcomSheet=undefined;
  await h.context.sheetSyncNew('boss','card',{topic:'Task'},h.colRef);
  assert.equal(h.calls.length,0);assert.equal(h.toasts.length,0);assert.equal(h.updates.length,0);
});

test('Boss append uses saved config and nonempty values, then stores an unstamped row link',async()=>{
  const h=sheet();
  await h.context.sheetSyncNew('boss','card-1',{topic:'School campaign',description:'',dueDate:'2026-11-04'},h.colRef);
  assert.equal(h.calls.length,1);
  const call=h.calls[0];
  assert.equal(call.address,url);assert.equal(call.options.method,'POST');assert.equal(call.options.redirect,'follow');
  assert.equal(call.options.headers['Content-Type'],'text/plain;charset=utf-8');
  assert.deepEqual(call.body,{action:'append',who:'boss',cardId:'card-1',secret:'saved phrase',values:{task:'School campaign',status:'Not started','due date':{date:'2026-11-04'}}});
  assert.deepEqual(h.updates,[{id:'card-1',upd:{sheetRows:{boss:{tab:'Boss',row:5,title:'School campaign'}}}}]);
  assert.equal(h.toasts.length,0);
});

test('shared cards append each assignee with their own columns and words, then save once with a stamp',async()=>{
  for(const bySource of [false,true]){
    const h=sheet({replies:[{ok:true,tab:'Dew',row:7},{ok:true,tab:'O',row:12}]});
    if(!bySource)h.colRef.id='event_tasks';
    const first=await h.context.sheetSyncNew('boss','shared',{
      topic:'Poster',assignees:['dew','o'],status:'waiting',description:'Design details',mdCategory:'Photos',
      ...(bySource?{__src:'event'}:{})
    },h.colRef);
    assert.deepEqual(plain(first),{ok:true,tab:'Dew',row:7});
    assert.deepEqual(h.calls.map(c=>c.body),[
      {action:'append',who:'dew',cardId:'shared',secret:'saved phrase',values:{task:'Poster',priority:'Medium',status:'Waiting for response','details provided':'Design details'}},
      {action:'append',who:'o',cardId:'shared',secret:'saved phrase',values:{task:'Poster',status:'Blocked',media:'Photo'}}
    ]);
    assert.deepEqual(h.updates,[{id:'shared',upd:{sheetRows:{dew:{tab:'Dew',row:7,title:'Poster'},o:{tab:'O',row:12,title:'Poster'}},lastEditedBy:'boss@example.test',lastEditedAt:'stamp'}}]);
  }
});

test('shared appends run one after another and save only after both replies',async()=>{
  const h=sheet(),pending=[],requests=[];
  h.context.sheetCall=payload=>{requests.push(plain(payload));return new Promise(resolve=>pending.push(resolve));};
  const result=h.context.sheetSyncNew('boss','shared',{topic:'Poster',assignees:['dew','o']},h.colRef);
  assert.equal(requests.length,1);assert.equal(requests[0].who,'dew');assert.equal(h.updates.length,0);
  pending[0]({ok:true,row:7});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests.length,2);assert.equal(requests[1].who,'o');assert.equal(h.updates.length,0);
  pending[1]({ok:true,row:12});await result;
  assert.equal(h.updates.length,1);
});

test('one failed member gives one named toast and preserves the successful link regardless of order',async()=>{
  for(const failed of ['dew','o']){
    const replies=['dew','o'].map(member=>member===failed?{ok:false,error:'protected'}:{ok:true,row:9});
    const h=sheet({replies});
    const first=await h.context.sheetSyncNew('boss','shared',{topic:'Poster',__src:'event',assignees:['dew','o']},h.colRef);
    const member=failed==='dew'?'o':'dew',tab=member==='dew'?'Dew':'O',failedTab=failed==='dew'?'Dew':'O';
    assert.deepEqual(plain(first),replies[0]);
    assert.equal(h.calls.length,2);
    assert.deepEqual(h.updates,[{id:'shared',upd:{sheetRows:{[member]:{tab,row:9,title:'Poster'}},lastEditedBy:'boss@example.test',lastEditedAt:'stamp'}}]);
    assert.deepEqual(h.toasts.map(t=>t.message),['The card was saved, but it was not added to the Google Sheet ('+failedTab+'): '+failedTab+"'s tab is protected, and the account that runs the link cannot edit it."]);
  }
});

test('multiple append failures are combined into one toast naming all failing tabs and reasons',async()=>{
  const h=sheet({replies:[{ok:false,error:'protected'},{ok:false,error:'network'}]});
  await h.context.sheetSyncNew('boss','shared',{topic:'Poster',assignees:['dew','o']},h.colRef);
  assert.equal(h.calls.length,2);assert.equal(h.updates.length,0);assert.equal(h.toasts.length,1);
  assert.match(h.toasts[0].message,/Google Sheet \(Dew, O\).*Dew's tab is protected.*Google could not be reached/);
});

test('new links carry over an old single link without writing the old field',async()=>{
  const h=sheet({reply:{ok:true,row:8}});
  await h.context.sheetSyncNew('o','shared',{topic:'Poster',assignees:['o'],sheetRow:{member:'dew',tab:'Dew',row:4,title:'Old title'}},h.colRef);
  assert.deepEqual(h.updates,[{id:'shared',upd:{sheetRows:{dew:{tab:'Dew',row:4,title:'Old title'},o:{tab:'O',row:8,title:'Poster'}}}}]);
});

for(const [error,reason] of [['protected',"Boss's tab is protected, and the account that runs the link cannot edit it"],['unauthorised','the secret phrase in Settings does not match the script'],['network','Google could not be reached']]){
  test(error+' produces one friendly toast and no card update',async()=>{
    const h=sheet({reply:{ok:false,error}});
    await h.context.sheetSyncNew('boss','card',{topic:'Task'},h.colRef);
    assert.equal(h.toasts.length,1);assert.equal(h.toasts[0].options.duration,9000);
    assert.equal(h.toasts[0].message,'The card was saved, but it was not added to the Google Sheet (Boss): '+reason+'.');
    assert.equal(h.updates.length,0);
  });
}

test('fetch and JSON failures resolve as network; failed row updates only log',async()=>{
  const h=sheet({fetchError:true});
  assert.deepEqual(plain(await h.context.sheetCall({action:'ping'})),{ok:false,error:'network'});
  h.context.fetch=()=>{throw new Error('synchronous failure');};
  assert.equal((await h.context.sheetCall({})).error,'network');
  h.context.fetch=async()=>({json:async()=>{throw new Error('invalid JSON');}});
  assert.equal((await h.context.sheetCall({})).error,'network');
  const failed=sheet({updateError:true});
  await failed.context.sheetSyncNew('boss','card',{topic:'Task'},failed.colRef);
  assert.equal(failed.logs.length,1);assert.equal(failed.toasts.length,0);
});

test('friendly reasons preserve unknown errors and explain script setup failures',()=>{
  const {context:c}=sheet();
  for(const [error,expected] of [
    ['secret not set','the script still has its sample secret phrase; set your own and redeploy it'],
    ['spreadsheet not set',"the script has no sheet ID yet; paste the sheet's ID into SPREADSHEET_ID and deploy a New version"],
    ['unknown action','the Google script is an older version; paste the new one and deploy a New version (see SHEET-SETUP.md)'],
    ['tab not found','the sheet has no tab named Eye'],['no heading row',"Eye's tab has no heading row with a Task column"],
    ['busy, please try again','the sheet was busy, please try again'],['unknown member','unknown member'],['no card id','no card id'],['not found','not found']
  ])assert.equal(c.sheetReason({error},'Eye'),expected);
  assert.equal(c.sheetReason(null,'Eye'),'no reply');
});

test('connection test uses typed config and escapes tab names and headings',async()=>{
  const h=sheet({reply:{ok:true,tabs:[
    {name:'Boss <b>"',found:true,headingRow:4,headings:['Task','<b>Title</b>','A "quote"'],canEdit:true},
    {name:'Dew',found:true,headingRow:3,headings:['Task'],canEdit:false},{name:'Eye',found:false},
    {name:'O',found:true,headingRow:0,headings:[],canEdit:true}
  ]}});
  h.nodes['sheet-url'].value=' https://script.google.com/macros/s/typed/exec?test=1 ';
  h.nodes['sheet-secret'].value=' typed phrase ';
  await h.context.sheetTest();
  assert.equal(h.calls[0].address,'https://script.google.com/macros/s/typed/exec');
  assert.deepEqual(h.calls[0].body,{action:'ping',secret:'typed phrase'});
  assert.equal(h.nodes['sheet-test-out'].innerHTML,'<div><b>Boss &lt;b&gt;&quot;</b>: Task, &lt;b&gt;Title&lt;/b&gt;, A &quot;quote&quot;; can write</div><div><b>Dew</b>: Task; cannot write: protected for this account</div><div><b>Eye</b>: ; tab not found</div><div><b>O</b>: ; no heading row with a Task column</div>');
  const bad=sheet({reply:{ok:false,error:'unauthorised'}});bad.nodes['sheet-url'].value=url;
  await bad.context.sheetTest();assert.equal(bad.nodes['sheet-test-out'].textContent,'The secret phrase does not match the script.');
  /* The calendar script answers ping with ok and a calendar name, but no tabs. */
  const other=sheet({reply:{ok:true,calendar:'Boss'}});other.nodes['sheet-url'].value=url;
  await other.context.sheetTest();
  assert.match(other.nodes['sheet-test-out'].textContent,/not the Google Sheet link script/);
});

test('admin can save cleaned config or pause, with clear validation and save failures',async()=>{
  const h=sheet();h.nodes['sheet-url'].value=' '+url+' ?foo=1 ';h.nodes['sheet-secret'].value=' phrase ';
  await h.context.sheetSave();
  assert.deepEqual(h.saves,[{name:'dept_settings',id:'sheetsync',data:{url,secret:'phrase'},options:{merge:true}}]);
  assert.equal(h.nodes['sheet-test-out'].textContent,'Saved. New cards will now be added to the Google Sheet.');
  h.nodes['sheet-url'].value='';await h.context.sheetSave();
  assert.equal(h.saves[1].data.url,'');assert.equal(h.nodes['sheet-test-out'].textContent,'Saved. The Google Sheet link is paused.');
  for(const invalid of ['https://script.googleusercontent.com/redirect','https://example.test']){
    h.nodes['sheet-url'].value=invalid;await h.context.sheetSave();assert.equal(h.saves.length,2);assert.match(h.nodes['sheet-test-out'].textContent,/address/);
  }
  const failed=sheet({saveError:true});failed.nodes['sheet-url'].value=url;await failed.context.sheetSave();
  assert.match(failed.nodes['sheet-test-out'].textContent,/Could not save.*permission denied/);
});

test('Settings wraps the existing opener and gives members only live read-only status',async()=>{
  const admin=sheet();admin.context.openSettings();admin.context.openSettings();
  assert.equal(admin.opened(),2);assert.match(admin.nodes['sheet-cfg'].innerHTML,/ti ti-table/);
  assert.match(admin.nodes['sheet-cfg'].innerHTML,/Google Sheet link/);assert.equal(admin.nodes['sheet-url'].value,url);
  const member=sheet({role:'designer'});member.context.openSettings();
  assert.equal(member.nodes['sheet-cfg'].innerHTML,'');
  assert.equal(member.nodes['sheet-cfg'].textContent,"Google Sheet link: on. New cards are also added to your tab in the team's Google Sheet.");
  member.setConfig(null);assert.equal(member.nodes['sheet-cfg'].textContent,'Google Sheet link: off.');
  member.nodes['sheet-url'].value=url;await member.context.sheetSave();assert.equal(member.saves.length,0);
});

test('source wires only the four new-card paths and places the module after photo upload',()=>{
  assert.match(source,/<script src="assets\/task-draft.js"><\/script>\s*<script src="assets\/sheet-sync.js"><\/script>/);
  const phoStart=source.indexOf('<script id="pho-script">');
  assert.equal(source.slice(source.indexOf('</script>',phoStart)+9,source.indexOf(marker)).trim(),'');
  const save=source.slice(source.indexOf('function saveTask(){'),source.indexOf('  window.__calAfterSave=false;',source.indexOf('function saveTask(){')));
  const newStart=save.indexOf('const newRef=ref.doc();');
  assert.doesNotMatch(save.slice(0,newStart),/sheetSyncNew\(/);
  assert.match(save.slice(newStart,save.indexOf('if(wantCal)',newStart)),/if\(window.sheetSyncNew\)sheetSyncNew\(whoNow,newRef.id,evtOn\?Object.assign\(\{__src:'event'\},data\):data,ref\)/);
  for(const [from,to,call] of [
    ['window.rcCreateTask=function','window.rcDelete=function',"sheetSyncNew(w,tr.id,task,f.collection(w+'_tasks'))"],
    ['window.tplUse=function','/* ---------- open-app auto-create',"sheetSyncNew('o',doc.id,task,ref)"],
    ['function generate(){','function startTpl(){',"sheetSyncNew('o',docId,task,ref)"]
  ]){
    const block=source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
    assert.ok(block.includes(call));
    assert.match(block,/try\{if\(window.sheetSyncNew\).*\}catch\(e\)\{console.error\('\[sheet\] step failed',e\);\}/);
  }
  assert.match(script,/collection\('dept_settings'\).doc\('sheetsync'\)/);
  assert.match(script,/window.sheetSave=async function\(\)\{\s*if\(!isAdmin\(\)\)return;/);
});
