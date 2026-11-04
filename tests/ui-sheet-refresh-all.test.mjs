import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const helper=readFileSync(new URL('../assets/sheet-sync.js',import.meta.url),'utf8');
const marker='<script id="sheet-script">', start=source.indexOf(marker)+marker.length;
const script=source.slice(start,source.indexOf('</script>',start));
const plain=value=>JSON.parse(JSON.stringify(value));
const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const url='https://script.google.com/macros/s/saved/exec';
const members=['boss','dew','o','junior'];
const card=(id,extra={})=>({id,topic:'Campaign '+id,status:'pending',...extra});
const cards=n=>Array.from({length:n},(_,i)=>card('card-'+i));
const row=(cardId,result='unchanged',extra={})=>({cardId,result,tab:'Boss',row:5,written:[],conflicts:[],...extra});
const sync=(...results)=>({ok:true,results});
const sweep=(...rows)=>({ok:true,rows});
const batchReply=(result='added')=>body=>sync(...body.cards.map(c=>row(c.cardId,result)));

function sheet({own={},shared=[],role='admin',cfg={url,secret:'phrase'},loaded=true,eventLoaded=true,replies=[],updateError=false}={}){
  const calls=[],updates=[],logs=[],messages=[],saves=[],nodes={};
  let stamps=0,snapshot;
  // Model the Settings nodes and checkbox state created by the summary HTML.
  function element(id=''){
    let html='',text='',children=[];
    function clear(){children.forEach(key=>delete nodes[key]);children=[];}
    return {id,style:{},value:'',disabled:false,checked:false,
      get innerHTML(){return html;},set innerHTML(value){
        clear();html=value;text='';
        for(const match of value.matchAll(/<(input|button|div)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
          const child=element(match[3]);child.checked=/\bchecked\b/.test(match[2]);
          const handler=match[2].match(/onclick="(\w+)\(\)"/);
          if(handler)child.click=()=>{if(!child.disabled)return context[handler[1]]();};
          nodes[child.id]=child;children.push(child.id);
        }
      },get textContent(){return text;},set textContent(value){clear();html='';text=value;if(id==='sheet-refresh-out')messages.push(value);}
    };
  }
  const refs=Object.fromEntries([...members,'event'].map(w=>[w,{id:w==='event'?'event_tasks':w+'_tasks',doc:id=>({update:async upd=>{
    if(updateError)throw new Error('update denied');
    updates.push({collection:w==='event'?'event_tasks':w+'_tasks',id,upd:plain(upd)});
  }})}]));
  const body={appendChild:node=>{nodes[node.id]=node;}};
  const db={collection:()=>({doc:()=>({onSnapshot(fn){snapshot=fn;fn({exists:!!cfg,data:()=>cfg});return ()=>{};},set:async data=>saves.push(data)})})};
  const context=vm.createContext({
    document:{readyState:'complete',getElementById:id=>nodes[id]||null,
      querySelector:selector=>selector==='#settings-modal .modal-body'?body:null,createElement:()=>element(),body:{classList:{toggle(){}}}},
    firebase:{firestore:()=>db},whenAuthed:fn=>fn(),setTimeout:fn=>fn(),__cur:{role},
    MEMBER_ORDER:members,ownTasksOf:w=>own[w]||[],refOf:w=>refs[w],loadedOf:w=>typeof loaded==='object'?loaded[w]:loaded,
    eventTasks:shared,eventTasksRef:refs.event,eventTasksLoaded:eventLoaded,escHtml:escape,
    uiToast:()=>assert.fail('bulk refresh should use its output area'),console:{error:(...args)=>logs.push(args)},
    stampEdit:()=>{stamps++;return {lastEditedBy:'boss@example.test',lastEditedAt:'stamp'};},
    fetch:async (address,options)=>{
      assert.equal(address,url);
      const request=JSON.parse(options.body);calls.push(request);
      assert.ok(replies.length,'unexpected fetch');
      let reply=replies.shift();if(typeof reply==='function')reply=await reply(request);
      if(reply instanceof Error)throw reply;
      return {json:async()=>reply};
    }
  });
  context.window=context;vm.runInContext(helper,context);vm.runInContext(script,context);context.openSettings();
  // Members have no controls, but direct invocation still reports its guard.
  if(!nodes['sheet-refresh-out'])nodes['sheet-refresh-out']=element('sheet-refresh-out');
  return {context,nodes,calls,updates,logs,messages,saves,get stamps(){return stamps;},
    get output(){return nodes['sheet-refresh-out'].textContent;},get html(){return nodes['sheet-refresh-out'].innerHTML;},
    check:()=>context.sheetRefreshAll(),apply:()=>nodes['sheet-refresh-apply']?.click(),
    setConfig:value=>snapshot({exists:!!value,data:()=>value})};
}

test('Settings provides admin-only Refresh all, its help, and a live output area',()=>{
  const h=sheet();
  assert.match(h.nodes['sheet-cfg'].innerHTML,/ti ti-refresh/);
  assert.match(h.nodes['sheet-cfg'].innerHTML,/Refresh all compares the team's cards with the sheet\. It shows what would change first; nothing is written until you press Apply\./);
  assert.match(h.nodes['sheet-cfg'].innerHTML,/id="sheet-refresh-out" aria-live="polite"/);
  assert.equal(typeof h.nodes['sheet-refresh'].click,'function');
  const member=sheet({role:'member'});assert.equal(member.nodes['sheet-refresh'],undefined);
});

test('admin, configuration and complete loading are required before any fetch',async()=>{
  for(const [options,message] of [
    [{role:'member'},'Only the admin can refresh all cards.'],
    [{cfg:null},'The Google Sheet link is off.'],[{cfg:{url:''}},'The Google Sheet link is off.'],
    [{loaded:false},"Still loading the team's cards. Try again in a moment."],
    [{loaded:{boss:true,dew:true,o:false,junior:true}},"Still loading the team's cards. Try again in a moment."],
    [{eventLoaded:false},"Still loading the team's cards. Try again in a moment."]
  ]){
    const h=sheet(options);await assert.doesNotReject(h.check());
    assert.equal(h.calls.length,0);assert.equal(h.output,message);
  }
});

test('selection includes open and linked finished cards, while sweep protects EVERY card id',async()=>{
  const own={boss:[
    ...['pending','in-progress','waiting','on-hold'].map(status=>card(status,{status})),
    card('done',{status:'done',done:true}),card('canceled',{status:'canceled'}),card('flag-done',{done:true}),
    card('linked-done',{status:'done',done:true,sheetRow:{member:'dew',row:4}}),
    card('linked-canceled',{status:'canceled',sheetRow:{member:'boss',row:6}}),
    card('invalid-link',{sheetRow:{member:'nobody'}}),card('missing-member',{sheetRow:{row:3}})
  ],dew:[card('design')],o:[card('photos')],junior:[card('junior')]};
  const shared=[card('shared',{__src:'event',assignees:['o','dew']}),
    card('owner',{__src:'event',owner:'junior'}),card('unassigned',{__src:'event'}),
    card('invalid-assignee',{__src:'event',assignees:['bad']})];
  const h=sheet({own,shared,replies:[batchReply(),sweep()]});await h.check();
  const entries=h.calls[0].cards;
  assert.deepEqual(entries.map(c=>[c.cardId,c.who]),[
    ['pending','boss'],['in-progress','boss'],['waiting','boss'],['on-hold','boss'],
    ['linked-done','dew'],['linked-canceled','boss'],['design','dew'],['photos','o'],['junior','junior'],['shared','o'],['owner','junior']
  ]);
  assert.deepEqual(entries[9].values,plain(h.context.MarcomSheet.rowFor(shared[0],'o','o').values));
  assert.deepEqual(h.calls[1],{action:'sweep',check:true,cardIds:[...Object.values(own).flat(),...shared].map(c=>c.id),
    cancel:{boss:'Canceled',dew:'Cancel',o:'CANCELLED',junior:'Canceled'},secret:'phrase'});
  assert.equal(h.updates.length,0);
});

test('60 cards check sequentially in 25/25/10 batches, then sweep, without writes',async()=>{
  const h=sheet({own:{boss:cards(60)},replies:[batchReply(),batchReply(),batchReply(),sweep()]});
  await h.nodes['sheet-refresh'].click();
  assert.deepEqual(h.calls.map(c=>[c.action,c.check,c.cards?.length]),[['sync',true,25],['sync',true,25],['sync',true,10],['sweep',true,undefined]]);
  assert.deepEqual(h.messages,['Checking 25 of 60...','Checking 50 of 60...','Checking 60 of 60...']);
  assert.equal(h.updates.length,0);assert.ok(h.nodes['sheet-refresh-apply']);
});

test('summary counts, safe text, unticked conflicts, ticked deleted rows and ambiguous rows',async()=>{
  const kinds=['added','linked','updated','unchanged','ambiguous','protected','error'];
  const title='<b>Campaign "A"</b>';
  const h=sheet({own:{boss:kinds.map(k=>card(k,{topic:title}))},replies:[
    sync(...kinds.map(k=>row(k,k,k==='updated'?{tab:'<b>Boss</b>',row:8,
      conflicts:[{key:'note',sheet:'<b>Keep "me"</b>',card:'"New" & <b>card</b>'}]}:k==='ambiguous'?{matches:[7,9]}:{}))),
    sweep({cardId:'deleted',tab:'Dew',row:12,status:'<b>Ready "now"</b>'})
  ]});
  await h.check();
  for(const label of ['To add','To link to rows already in the sheet','To update','Already matching','Need a look','Protected','Errors','Rows of deleted cards'])assert.ok(h.html.includes(label+' 1'),label);
  assert.match(h.html,/Different in the sheet/);
  assert.match(h.html,/&lt;b&gt;Campaign &quot;A&quot;&lt;\/b&gt;/);
  assert.match(h.html,/&lt;b&gt;Boss&lt;\/b&gt;, row 8/);
  assert.match(h.html,/Note: sheet &quot;&lt;b&gt;Keep &quot;me&quot;&lt;\/b&gt;&quot; -&gt; card &quot;&quot;New&quot; &amp; &lt;b&gt;card&lt;\/b&gt;&quot;/);
  assert.match(h.html,/Boss, rows 7, 9/);
  assert.match(h.html,/Dew row 12, status &quot;&lt;b&gt;Ready &quot;now&quot;&lt;\/b&gt;&quot; -&gt; Cancel/);
  assert.doesNotMatch(h.html,/<b>/);
  assert.equal(h.nodes['sheet-refresh-force-0'].checked,false);
  assert.equal(h.nodes['sheet-refresh-row-0'].checked,true);
  assert.equal(h.calls.every(c=>c.check),true);
  await h.nodes['sheet-refresh-cancel'].click();assert.equal(h.html,'');assert.equal(h.output,'');
  await h.context.sheetRefreshApply();assert.equal(h.calls.length,2);
});

test('matching cards have no Apply, and an empty team still checks the sweep',async()=>{
  for(const own of [{boss:[card('same')]},{}]){
    const h=sheet({own,replies:own.boss?[sync(row('same')),sweep()]:[sweep()]});await h.check();
    assert.match(h.html,/Everything already matches\./);assert.equal(h.nodes['sheet-refresh-apply'],undefined);
    assert.ok(h.nodes['sheet-refresh-cancel']);await h.context.sheetRefreshApply();
    assert.equal(h.calls.length,own.boss?2:1);
  }
});

test('Apply preserves compared values, sends only ticked force keys, saves links and sweeps selected ids',async()=>{
  const own={boss:[card('add'),card('move',{sheetRow:{member:'boss',row:2}}),card('same',{sheetRow:{member:'boss',row:5}})]};
  const shared=[card('link',{__src:'event',assignees:['dew','o']})];
  const conflict=(key)=>({key,sheet:'Sheet value',card:'Card value'});
  const deleted=[{cardId:'gone-1',tab:'Boss',row:15,status:'In progress'},{cardId:'gone-2',tab:'O',row:20,status:'Not started'}];
  const h=sheet({own,shared,replies:[
    sync(row('add','added',{conflicts:[conflict('note'),conflict('status')]}),row('move','updated'),row('same'),
      row('link','linked',{tab:'Dew',conflicts:[conflict('additional details')]})),sweep(...deleted),
    sync(row('add','added',{row:10,conflicts:[conflict('status')]}),row('move','updated',{row:9}),row('same'),row('link','linked',{tab:'Dew',row:11})),
    sweep({...deleted[0],result:'canceled'},{...deleted[1],result:'unchanged'})
  ]});
  await h.check();const checked=h.calls[0].cards;
  h.nodes['sheet-refresh-force-0'].checked=true;h.nodes['sheet-refresh-force-2'].checked=true;
  h.nodes['sheet-refresh-row-1'].checked=false;
  own.boss[0].topic='Changed after checking';
  // A card arriving during review must also be protected by the final sweep.
  own.boss.push(card('arrived',{status:'done'}));
  await h.apply();
  assert.deepEqual(h.calls[2].cards,checked.map((entry,i)=>({...entry,force:i===0?['note']:i===3?['additional details']:[]})));
  assert.equal(h.calls[2].check,false);assert.equal(h.calls[3].check,false);
  assert.deepEqual(h.calls[3].apply,['gone-1']);assert.ok(h.calls[3].cardIds.includes('arrived'));
  assert.deepEqual(h.updates,[
    {collection:'boss_tasks',id:'add',upd:{sheetRow:{member:'boss',tab:'Boss',row:10,title:'Campaign add'}}},
    {collection:'boss_tasks',id:'move',upd:{sheetRow:{member:'boss',tab:'Boss',row:9,title:'Campaign move'}}},
    {collection:'event_tasks',id:'link',upd:{sheetRow:{member:'dew',tab:'Dew',row:11,title:'Campaign link'},lastEditedBy:'boss@example.test',lastEditedAt:'stamp'}}
  ]);
  assert.equal(h.stamps,1);
  assert.equal(h.output,'Done: added 1, linked 1, updated 1, already matching 1, marked Canceled 1. Differences left as they are: 1.');
  await h.context.sheetRefreshApply();assert.equal(h.calls.length,4);
});

test('Apply batches 60 cards sequentially and saves each batch before starting the next',async()=>{
  const h=sheet({own:{boss:cards(60)},replies:[batchReply(),batchReply(),batchReply(),sweep(),
    batchReply(),body=>{assert.equal(h.updates.length,25);return batchReply()(body);},
    body=>{assert.equal(h.updates.length,50);return batchReply()(body);},()=>{assert.equal(h.updates.length,60);return sweep();}]});
  await h.check();await h.apply();
  assert.deepEqual(h.calls.slice(4).map(c=>[c.action,c.check,c.cards?.length]),[['sync',false,25],['sync',false,25],['sync',false,10],['sweep',false,undefined]]);
  assert.deepEqual(h.messages.slice(3,6),['Applying 25 of 60...','Applying 50 of 60...','Applying 60 of 60...']);
  assert.match(h.output,/Done: added 60/);
});

test('conflicts alone offer Apply, and leaving every conflict unticked sends an empty force list',async()=>{
  const conflict={key:'note',sheet:'Keep this',card:'Different'};
  const result=row('one','unchanged',{conflicts:[conflict]});
  const h=sheet({own:{boss:[card('one',{sheetRow:{member:'boss',row:5}})]},
    replies:[sync(result),sweep(),sync(result),sweep()]});
  await h.check();assert.ok(h.nodes['sheet-refresh-apply']);assert.doesNotMatch(h.html,/Everything already matches/);
  await h.apply();assert.deepEqual(h.calls[2].cards[0].force,[]);assert.equal(h.updates.length,0);
  assert.match(h.output,/Differences left as they are: 1\./);
});

test('deleted rows alone offer Apply, including an empty selection with no sync requests',async()=>{
  for(const selected of [true,false]){
    const deleted={cardId:'gone',tab:'Eye',row:7,status:'In progress'};
    const h=sheet({replies:[sweep(deleted),sweep({...deleted,result:selected?'canceled':'unchanged'})]});
    await h.check();assert.ok(h.nodes['sheet-refresh-apply']);h.nodes['sheet-refresh-row-0'].checked=selected;
    await h.apply();assert.deepEqual(h.calls.map(c=>[c.action,c.check]),[['sweep',true],['sweep',false]]);
    assert.deepEqual(h.calls[1].apply,selected?['gone']:[]);assert.deepEqual(h.calls[1].cardIds,[]);
    assert.match(h.output,new RegExp('marked Canceled '+(selected?1:0)));
  }
});

test('failed check batch or sweep stops without writes and explains the failure',async()=>{
  for(const failure of [{ok:false,error:'unauthorised'},new Error('offline')]){
    const h=sheet({own:{boss:cards(60)},replies:[batchReply(),failure]});await assert.doesNotReject(h.check());
    assert.equal(h.calls.length,2);assert.equal(h.updates.length,0);
    assert.match(h.output,/^Stopped: .*\. Nothing was changed\.$/);
    assert.match(h.output,failure instanceof Error?/Google could not be reached/:/secret phrase/);
    assert.equal(h.nodes['sheet-refresh-apply'],undefined);assert.equal(h.nodes['sheet-refresh'].disabled,false);
  }
  const h=sheet({own:{boss:[card('one')]},replies:[batchReply(),{ok:false,error:'busy'}]});await h.check();
  assert.match(h.output,/sheet was busy.*Nothing was changed/);assert.equal(h.calls.length,2);
});

test('failed Apply batch stops at the completed count and never sends later batches or sweep',async()=>{
  for(const failure of [{ok:false,error:'unauthorised'},new Error('offline')]){
    const h=sheet({own:{boss:cards(60)},replies:[batchReply(),batchReply(),batchReply(),sweep(),batchReply(),failure]});
    await h.check();await assert.doesNotReject(h.apply());
    assert.equal(h.calls.length,6);assert.equal(h.updates.length,25);
    assert.match(h.output,/^Stopped after 25 of 60 cards: .*The cards before that were done; nothing after it was changed\.$/);
    assert.equal(h.nodes['sheet-refresh'].disabled,false);
  }
});

test('double clicks during checking or applying do not send extra requests; all Settings buttons stay disabled',async()=>{
  let release;
  const pause=body=>new Promise(resolve=>{release=()=>resolve(batchReply()(body));});
  const h=sheet({own:{boss:[card('one')]},replies:[pause,sweep(),pause,sweep()]});
  const checking=h.check();
  for(const id of ['sheet-test','sheet-save','sheet-refresh'])assert.equal(h.nodes[id].disabled,true);
  await h.check();await h.context.sheetTest();await h.context.sheetSave();await h.context.sheetRefreshApply();
  assert.equal(h.calls.length,1);assert.equal(h.saves.length,0);
  release();await checking;
  for(const id of ['sheet-test','sheet-save','sheet-refresh'])assert.equal(h.nodes[id].disabled,false);
  const applying=h.apply();
  for(const id of ['sheet-test','sheet-save','sheet-refresh'])assert.equal(h.nodes[id].disabled,true);
  await h.context.sheetRefreshApply();await h.check();h.context.sheetRefreshCancel();
  assert.equal(h.calls.length,3);release();await applying;assert.equal(h.calls.length,4);
});

test('Apply rechecks admin, link, loading and configuration before writing',async()=>{
  for(const change of [h=>{h.context.__cur.role='member';},h=>h.setConfig(null),
    h=>{h.context.eventTasksLoaded=false;},h=>h.setConfig({url,secret:'changed'})]){
    const h=sheet({own:{boss:[card('one')]},replies:[batchReply(),sweep()]});await h.check();change(h);await h.apply();
    assert.equal(h.calls.length,2);assert.ok(h.output);assert.equal(h.updates.length,0);
  }
});

test('row-level ambiguous, protected and errors never save links and are reported after Apply',async()=>{
  const results=[row('a','ambiguous',{matches:[7,8]}),row('p','protected'),row('e','error'),row('u','updated')];
  const h=sheet({own:{boss:['a','p','e','u'].map(id=>card(id))},replies:[sync(...results),sweep(),sync(...results),
    sweep({cardId:'gone',result:'protected'},{cardId:'other',result:'error'})]});
  await h.check();await h.apply();assert.deepEqual(h.updates.map(u=>u.id),['u']);
  assert.match(h.output,/Need a look 1, protected 2, errors 2\./);
});

test('unexpected failures, incomplete replies, failed link saves and failed apply sweep never throw',async()=>{
  const broken=sheet();broken.context.ownTasksOf=()=>{throw new Error('unexpected');};
  await assert.doesNotReject(broken.check());assert.match(broken.output,/unexpected.*Nothing was changed/);
  for(const reply of [{ok:true},{ok:true,results:[]}]){
    const h=sheet({own:{boss:[card('one')]},replies:[reply]});await assert.doesNotReject(h.check());
    assert.match(h.output,/incomplete.*Nothing was changed/);assert.equal(h.calls.length,1);
  }
  const failedSave=sheet({own:{boss:[card('one')]},updateError:true,replies:[batchReply(),sweep(),batchReply()]});
  await failedSave.check();await assert.doesNotReject(failedSave.apply());
  assert.match(failedSave.output,/Stopped after 1 of 1 cards: update denied/);assert.equal(failedSave.calls.length,3);
  const failedSweep=sheet({own:{boss:[card('one')]},replies:[batchReply(),sweep(),batchReply(),{ok:false,error:'busy'}]});
  await failedSweep.check();await assert.doesNotReject(failedSweep.apply());
  assert.match(failedSweep.output,/Stopped after 1 of 1 cards: the sheet was busy/);assert.equal(failedSweep.updates.length,1);
});
