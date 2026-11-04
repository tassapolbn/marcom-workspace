import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const helper=readFileSync(new URL('../assets/sheet-sync.js',import.meta.url),'utf8');
const marker='<script id="sheet-script">',start=source.indexOf(marker)+marker.length;
const script=source.slice(start,source.indexOf('</script>',start));
const plain=value=>JSON.parse(JSON.stringify(value));
const url='https://script.google.com/macros/s/saved/exec';
const card=(extra={})=>({id:'card-1',topic:'Campaign',status:'pending',...extra});
const linked=(extra={})=>card({sheetRow:{member:'boss',tab:'Boss',row:5,title:'Campaign'},...extra});
const result=(kind,extra={})=>({ok:true,results:[{cardId:'card-1',result:kind,tab:'Boss',row:5,written:[],conflicts:[],...extra}]});

function sheet({task=card(),cfg={url,secret:'phrase'},replies=[],answers=[],collection='boss_tasks',updateError=false}={}){
  const calls=[],toasts=[],updates=[],logs=[],questions=[],toggles=[],events=[];
  let snapshot,stamps=0;
  const colRef={id:collection,doc:id=>({update:async upd=>{
    if(updateError)throw new Error('update denied');
    updates.push({id,upd:plain(upd)});
  }})};
  const db={collection:()=>({doc:()=>({onSnapshot(fn){snapshot=fn;fn({exists:!!cfg,data:()=>cfg});return ()=>{};}})})};
  const context=vm.createContext({
    document:{readyState:'complete',getElementById:()=>null,body:{classList:{toggle:(...args)=>toggles.push(args)}}},
    firebase:{firestore:()=>db},whenAuthed:fn=>fn(),
    console:{error:(...args)=>logs.push(args)},
    tasksOf:who=>{assert.equal(who,'o');return task?[task]:undefined;},
    taskRef:(value,who)=>{assert.equal(value,task);assert.equal(who,'o');return colRef;},
    fetch:async (address,options)=>{
      assert.equal(address,url);
      const body=JSON.parse(options.body);calls.push(body);events.push(body.action+':'+body.check);
      assert.ok(replies.length,'unexpected fetch');
      const reply=replies.shift();if(reply instanceof Error)throw reply;
      return {json:async()=>reply};
    },
    uiConfirm:async options=>{questions.push(plain(options));events.push('confirm');assert.ok(answers.length,'unexpected question');return answers.shift();},
    uiToast:(message,options)=>toasts.push({message,options:plain(options)}),
    stampEdit:()=>{stamps++;return {lastEditedBy:'boss@example.test',lastEditedAt:'stamp'};}
  });
  context.window=context;
  vm.runInContext(helper,context);vm.runInContext(script,context);
  return {context,calls,toasts,updates,logs,questions,toggles,events,colRef,get stamps(){return stamps;},
    snapshot:value=>snapshot({exists:!!value,data:()=>value}),press:()=>context.sheetCardButton('o','card-1')};
}
function toast(h,message){assert.deepEqual(h.toasts,[{message,options:{duration:6000}}]);}
function saved(h,member='boss',tab='Boss',row=5){
  assert.deepEqual(h.updates,[{id:'card-1',upd:{sheetRow:{member,tab,row,title:'Campaign'},
    ...(h.stamps?{lastEditedBy:'boss@example.test',lastEditedAt:'stamp'}:{})}}]);
}

test('missing card, link off and unassigned cards stop before fetching',async()=>{
  const missing=sheet({task:null});await missing.press();assert.equal(missing.toasts.length,0);
  for(const cfg of [null,{url:''}]){
    const h=sheet({cfg});await h.press();assert.equal(h.calls.length,0);toast(h,'The Google Sheet link is off.');
  }
  const h=sheet({task:card({__src:'event'})});await h.press();
  assert.equal(h.calls.length,0);toast(h,'This card has nobody assigned, so it has no tab in the Google Sheet.');
});

test('unlinked cards ask first; declining sends and saves nothing',async()=>{
  const h=sheet({answers:[false]});await h.press();
  assert.deepEqual(h.questions,[{title:'Add to the Google Sheet?',icon:'ti-table-plus',
    message:'"Campaign" will go into O\'s tab in a new empty row. If the same task is already typed there once, the card is linked to that row instead, and nothing in it is overwritten.',okLabel:'Add it'}]);
  assert.equal(h.calls.length,0);assert.equal(h.updates.length,0);assert.equal(h.toasts.length,0);
});

test('adding uses the assigned member and full row values; only shared links receive a stamp',async()=>{
  for(const shared of ['personal','collection','source']){
    const task=card({assignees:['dew'],...(shared==='source'?{__src:'event'}:{})});
    const h=sheet({task,collection:shared==='collection'?'event_tasks':'o_tasks',answers:[true],replies:[result('added',{tab:'Dew',row:9})]});
    await h.press();
    assert.deepEqual(h.events,['confirm','sync:false']);
    assert.deepEqual(h.calls,[{action:'sync',check:false,cards:[{cardId:'card-1',who:'dew',values:plain(h.context.MarcomSheet.rowFor(task,'o','dew').values)}],secret:'phrase'}]);
    assert.equal(h.stamps,shared==='personal'?0:1);saved(h,'dew','Dew',9);
    toast(h,'Added to the Google Sheet (Dew, row 9).');
  }
});

test('an existing matching row is linked and reported',async()=>{
  const h=sheet({answers:[true],replies:[result('linked')]});await h.press();
  saved(h,'o');toast(h,'Linked to the row already in the Google Sheet (Boss, row 5).');
});

test('linked cards check first, use their saved member and report unchanged or updated',async()=>{
  for(const kind of ['unchanged','updated']){
    const task=linked({assignees:['dew']});
    const h=sheet({task,replies:[result(kind),result(kind)]});await h.press();
    assert.deepEqual(h.calls.map(c=>[c.action,c.check,c.cards[0].who]),[['sync',true,'boss'],['sync',false,'boss']]);
    assert.deepEqual(h.calls[0].cards,h.calls[1].cards);
    assert.deepEqual(h.calls[1].cards[0].values,plain(h.context.MarcomSheet.rowFor(task,'o','boss').values));
    assert.equal(h.questions.length,0);assert.equal(h.updates.length,0);
    toast(h,kind==='updated'?'Updated in the Google Sheet (Boss, row 5).':'Already up to date in the Google Sheet (Boss).');
  }
});

test('a missing linked row requires consent before adding again',async()=>{
  for(const answer of [false,true]){
    const h=sheet({task:linked(),answers:[answer],replies:[result('added',{row:0}),result('added',{row:12})]});
    await h.press();assert.equal(h.calls.length,answer?2:1);
    assert.equal(h.questions[0].message,"This card's row is no longer in the Google Sheet. Add it again in a new empty row?");
    assert.equal(h.questions[0].okLabel,'Add it again');
    if(answer){saved(h,'boss','Boss',12);toast(h,'Added to the Google Sheet (Boss, row 12).');}
    else{assert.equal(h.updates.length,0);assert.equal(h.toasts.length,0);}
  }
});

test('a moved row saves its location and stamps shared cards',async()=>{
  const h=sheet({task:linked({__src:'event'}),replies:[result('unchanged',{row:8}),result('unchanged',{row:8})]});
  await h.press();saved(h,'boss','Boss',8);assert.equal(h.stamps,1);
});

const conflicts=[{key:'status',sheet:'In progress',card:'Completed'},{key:'due date',sheet:'2026-11-02',card:''},{key:'note',sheet:'<b>Keep</b>',card:'"New"'}];
test('the shared conflict notice preserves plain text, every value and empty card values',async()=>{
  const h=sheet({answers:[true]});assert.equal(await h.context.sheetAskConflicts('Boss',5,conflicts),true);
  assert.deepEqual(h.questions,[{title:'The Google Sheet has different information',icon:'ti-alert-triangle',
    message:'Boss\'s tab, row 5, already has:\nStatus: sheet "In progress", card "Completed"\nDue date: sheet "2026-11-02", card "(empty)"\nNote: sheet "<b>Keep</b>", card ""New""\nUpdate the sheet with the card\'s details, or keep what is in the sheet?',
    okLabel:'Update the sheet',cancelLabel:'Keep the sheet'}]);
});

test('keeping conflicts makes no extra request and reports whether empty cells were filled',async()=>{
  for(const written of [[],['note']]){
    const h=sheet({task:linked(),answers:[false],replies:[result('unchanged'),result(written.length?'updated':'unchanged',{conflicts,written})]});
    await h.press();assert.equal(h.calls.length,2);assert.equal(h.questions.length,1);
    assert.equal(h.calls[1].cards[0].force,undefined);
    toast(h,(written.length?'Filled the empty cells; kept the rest of what is in the Google Sheet':'Kept what is in the Google Sheet')+' (Boss, row 5).');
  }
});

test('updating conflicts sends exactly their keys in one additional sync',async()=>{
  const h=sheet({task:linked(),answers:[true],replies:[result('unchanged'),result('unchanged',{conflicts}),result('updated')]});
  await h.press();assert.equal(h.calls.length,3);
  assert.deepEqual(h.calls[2],{...h.calls[1],cards:[{...h.calls[1].cards[0],force:['status','due date','note']}]});
  toast(h,'Updated in the Google Sheet (Boss, row 5).');
});

test('newly linked cards keep their metadata when conflicts are kept or a forced update fails',async()=>{
  for(const update of [false,true]){
    const h=sheet({answers:[true,update],replies:[result('linked',{conflicts}),{ok:false,error:'network'}]});
    await h.press();saved(h,'o');assert.equal(h.calls.length,update?2:1);
    assert.equal(h.toasts.length,1);
  }
});

test('ambiguous rows, protected rows, result errors and failed replies save nothing and explain why',async()=>{
  const cases=[
    [result('ambiguous',{matches:[8,12]}),'Boss\'s tab has more than one row named "Campaign" (rows 8, 12), so nothing was changed. Fix it in the sheet, then try again.'],
    [result('protected'),"The Google Sheet was not changed: Boss's tab is protected, and the account that runs the link cannot edit it."],
    [result('error',{error:'no heading row'}),"The Google Sheet was not changed: Boss's tab has no heading row with a Task column."],
    [{ok:false,error:'unauthorised'},'The Google Sheet was not changed: the secret phrase in Settings does not match the script.'],
    [new Error('offline'),'The Google Sheet was not changed: Google could not be reached.']
  ];
  for(const [reply,message] of cases){
    for(const isLinked of [false,true]){
      const h=sheet({task:isLinked?linked():card(),answers:isLinked?[]:[true],replies:[reply]});
      await h.press();assert.equal(h.calls.length,1);assert.equal(h.updates.length,0);toast(h,message);
    }
  }
});

test('unknown action falls back through sheetSyncNew only for an unlinked card',async()=>{
  const unknown={ok:false,error:'unknown action'};
  const h=sheet({answers:[true],replies:[unknown,{ok:true,tab:'O',row:7}]});
  const original=h.context.sheetSyncNew;let fallback=0;
  h.context.sheetSyncNew=(...args)=>{fallback++;assert.equal(args[0],'o');assert.equal(args[1],'card-1');assert.equal(args[3],h.colRef);return original(...args);};
  await h.press();assert.equal(fallback,1);
  assert.deepEqual(h.calls.map(c=>c.action),['sync','append']);saved(h,'o','O',7);
  toast(h,'Added to the Google Sheet (O, row 7). Used the older script to add a fresh empty row.');
  const old=sheet({task:linked(),replies:[unknown]});await old.press();
  assert.equal(old.calls.length,1);assert.equal(old.calls[0].check,true);assert.equal(old.updates.length,0);
  toast(old,'Update the Google Sheet script to the new version to refresh cards (see SHEET-SETUP.md).');
});

test('legacy fallback failure reports only its existing failure toast',async()=>{
  const h=sheet({answers:[true],replies:[{ok:false,error:'unknown action'},{ok:false,error:'protected'}]});
  await h.press();assert.equal(h.toasts.length,1);assert.match(h.toasts[0].message,/not added.*protected/);assert.equal(h.updates.length,0);
});

test('unexpected failures are caught and logged',async()=>{
  const h=sheet({task:linked()});h.context.sheetCall=()=>{throw new Error('unexpected');};
  await assert.doesNotReject(h.press());assert.equal(h.logs.length,1);
  const failed=sheet({answers:[true],replies:[result('added')],updateError:true});
  await assert.doesNotReject(failed.press());assert.equal(failed.logs.length,1);
});

test('settings snapshots toggle existing buttons on and off without board rendering',()=>{
  const h=sheet();h.snapshot({url:''});h.snapshot({url});h.snapshot(null);
  assert.deepEqual(h.toggles,[['sheet-link-on',true],['sheet-link-on',false],['sheet-link-on',true],['sheet-link-on',false]]);
  assert.equal(h.logs.length,0);
});

test('task card source places the sheet action after Calendar with both icons, labels and handler',()=>{
  const block=source.slice(source.indexOf('function taskCardHTML('),source.indexOf('function kanbanHTML('));
  const lines=block.split(/\r?\n/),at=lines.findIndex(l=>l.includes('uxpTaskCalendar('));
  const button=lines[at+1];
  assert.match(button,/class="icon-btn tc-sheet-btn/);assert.match(button,/task\.sheetRow\?' sheet-on':''/);
  assert.ok(button.includes("onclick=\"event.stopPropagation();sheetCardButton(\\''+who+'\\',\\''+task.id+'\\')\""));
  assert.match(button,/task\.sheetRow\?'ti-table':'ti-table-plus'/);
  for(const attribute of ['title','aria-label'])assert.ok(button.includes(attribute+'="\'+(task.sheetRow?\'Refresh this card in the Google Sheet\':\'Add this card to the Google Sheet\')+\'"'));
  assert.match(lines[at+2],/duplicateTask/);
});

test('CSS gates the button on settings, shows linked green in both themes and preserves dialog line breaks',()=>{
  assert.match(source,/\.tc-sheet-btn\{display:none\}/);
  assert.match(source,/body\.sheet-link-on \.tc-sheet-btn\{display:flex\}/);
  assert.match(source,/\.icon-btn\.sheet-on\{color:#147c3b;\}/);
  assert.match(source,/html\.dark \.icon-btn\.sheet-on\{color:#5fcf85;\}/);
  assert.match(source,/\.uxp-msg\{[^}]*white-space:pre-line/);
});
