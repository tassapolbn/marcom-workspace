import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {renderTeamBoard,sendBoardAction,boardActions} from './team-board-fixture.mjs';
const {matchesTask,actionProblem}=createRequire(import.meta.url)('../assets/team-board.js');
const payload=html=>JSON.parse(html.match(/<script id="board-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);

test('team board preserves token gating and disabled shares',async()=>{
  for(const options of [{token:''},{token:'wrong'},{enabled:false}]){
    const page=await renderTeamBoard(options);assert.equal(page.statusCode,403);
    assert.doesNotMatch(page.body,/board-data|School Open Day/);
  }
});
test('board counts shared work once, excludes finished work and serializes only work fields',async()=>{
  const page=await renderTeamBoard({collections:{boss_tasks:[{topic:'Manager task',status:'pending',salary:99999},{topic:'Finished task',status:'done'}],event_tasks:[{topic:'Shared task',status:'waiting',assignees:['boss','dew']} ]}});
  assert.equal(page.statusCode,200);const tasks=Object.values(payload(page.body));
  assert.equal(tasks.length,2);assert.equal(tasks.filter(t=>t.topic==='Shared task').length,1);
  assert.deepEqual(tasks.find(t=>t.topic==='Shared task').members,['boss','dew']);
  assert.doesNotMatch(page.body,/99999|Finished task/);
  assert.match(page.body,/data-count="2">2<\/div>/);
  assert.equal(page.headers['Cache-Control'],'no-store');
});
test('task content cannot break out of the JSON script or inject task markup',async()=>{
  const topic='</script><img src=x onerror="alert(1)">';
  const page=await renderTeamBoard({collections:{boss_tasks:[{topic,status:'pending'}]}});
  assert.equal(Object.values(payload(page.body))[0].topic,topic);
  assert.doesNotMatch(page.body,/<img src=x/);
});
test('filters compose across search, owner, status and deadline including shared work',()=>{
  const task={topic:'Open Day',who:'Boss, Dew',status:'in-progress',members:['boss','dew'],daysLeft:0};
  assert.equal(matchesTask(task,{query:'OPEN',member:'dew',status:'in-progress',due:'today'}),true);
  assert.equal(matchesTask(task,{member:'o'}),false);
  assert.equal(matchesTask(task,{status:'waiting'}),false);
  assert.equal(matchesTask(task,{due:'overdue'}),false);
  assert.equal(matchesTask({...task,daysLeft:-1},{due:'overdue'}),true);
  assert.equal(matchesTask({...task,daysLeft:7},{due:'week'}),true);
  assert.equal(matchesTask({...task,daysLeft:8},{due:'week'}),false);
  assert.equal(matchesTask({...task,daysLeft:null},{due:'week'}),false);
  assert.equal(matchesTask({...task,daysLeft:null},{due:'none'}),true);
});
test('due today follows Bangkok midnight even when the server is on the previous UTC day',async()=>{
  const page=await renderTeamBoard({now:'2026-09-06T18:00:00Z',collections:{boss_tasks:[
    {topic:'Today',dueDate:'2026-09-07'}, {topic:'Yesterday',dueDate:'2026-09-06'}
  ]}});
  const tasks=Object.values(payload(page.body));
  assert.equal(tasks.find(t=>t.topic==='Today').daysLeft,0);
  assert.equal(tasks.find(t=>t.topic==='Yesterday').daysLeft,-1);
});

/* ===== Status categories and the two groupings ===== */

test('every task is rendered once and carries the keys both groupings need',async()=>{
  const page=await renderTeamBoard({collections:{
    boss_tasks:[{__id:'b1',topic:'Newsletter',status:'in-progress'}],
    event_tasks:[{__id:'e1',topic:'Open Day',status:'waiting',assignees:['boss','dew']}]}});
  const ids=[...page.body.matchAll(/data-task-id="(t\d+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,2);
  assert.equal(new Set(ids).size,ids.length);          // regrouping moves cards, never copies them
  assert.match(page.body,/data-task-id="t\d+" data-status="waiting" data-group="shared"/);
  assert.match(page.body,/data-task-id="t\d+" data-status="in-progress" data-group="boss"/);
  // The shared column exists for the browser to move that card into.
  assert.match(page.body,/data-member-list="shared"/);
});

test('status columns carry the work and member columns stand ready and empty',async()=>{
  const page=await renderTeamBoard({collections:{boss_tasks:[
    {topic:'A',status:'in-progress'},{topic:'B',status:'in-progress'},{topic:'C',status:'on-hold'}]}});
  const status=page.body.match(/<div class="grid" id="grid-status">([\s\S]*?)<div class="grid" id="grid-member"/)[1];
  const member=page.body.match(/<div class="grid" id="grid-member" hidden>([\s\S]*?)<div id="board-empty"/)[1];
  // Work that is moving comes first, work that is paused last.
  assert.deepEqual([...status.matchAll(/data-status-list="([a-z-]+)"/g)].map(m=>m[1]),
    ['in-progress','waiting','pending','on-hold']);
  assert.equal((status.match(/data-task-id=/g)||[]).length,3);
  assert.equal(member.match(/data-task-id=/g),null);   // the browser fills these on demand
  // No shared work in this snapshot, so that column is not drawn at all.
  assert.deepEqual([...member.matchAll(/data-member-list="([a-z]+)"/g)].map(m=>m[1]),
    ['boss','dew','o','junior']);
  assert.match(status,/>In progress<\/div><div class="rl">[^<]*<\/div><\/div><div class="cnt">2</);
  // A category with nothing in it still appears, so the full set stays visible.
  assert.match(status,/>Waiting<\/div><div class="rl">[^<]*<\/div><\/div><div class="cnt">0</);
});

test('the status filter offers every ongoing status with its own count',async()=>{
  const page=await renderTeamBoard({collections:{boss_tasks:[
    {topic:'A',status:'waiting'},{topic:'B',status:'waiting'},{topic:'C',status:'pending'}]}});
  const chips=[...page.body.matchAll(/class="schip[^"]*" data-status="([a-z-]*)" aria-pressed="[a-z]+">(?:<svg[\s\S]*?<\/svg>)?[A-Za-z ]+<b>(\d+)<\/b>/g)]
    .map(m=>[m[1],m[2]]);
  assert.deepEqual(chips,[['','3'],['in-progress','0'],['waiting','2'],['pending','1'],['on-hold','0']]);
});

test('a status the board does not know is read as pending, not dropped',async()=>{
  const page=await renderTeamBoard({collections:{boss_tasks:[{__id:'x1',topic:'Odd one',status:'parked'}]}});
  // The payload is normalised too, so the Pending filter still reaches this card.
  assert.equal(Object.values(payload(page.body))[0].status,'pending');
  assert.match(page.body,/data-task-id="t0" data-status="pending"/);
  assert.match(page.body,/Odd one/);
});

/* ===== Director actions sent from the shared board ===== */

const liveTask={__id:'t1',topic:'Prepare the September newsletter',status:'in-progress'};
const shared={__id:'e1',topic:'Open Day campaign',status:'waiting',assignees:['boss','dew']};
const send=(body,extra={})=>sendBoardAction({collections:{boss_tasks:[liveTask],event_tasks:[shared]},
  body:{coll:'boss_tasks',docId:'t1',from:'Khun Miki',...body},...extra});

test('an action is refused unless the share link is currently valid', async () => {
  for(const options of [{token:''},{token:'wrong'},{enabled:false}]){
    const result=await send({action:'prioritise'},options);
    assert.equal(result.statusCode,403);
    assert.equal(result.body.ok,false);
    assert.deepEqual(result.written,{});
  }
  const wrongMethod=await send({action:'prioritise'},{method:'GET'});
  assert.equal(wrongMethod.statusCode,405);
});

test('an action is refused when the input is missing, impossible or unknown', async () => {
  const cases=[
    [{action:'made-up'},400],                                   // not on the menu
    [{action:'prioritise',coll:'boss_lieu'},400],               // not a task collection
    [{action:'prioritise',docId:''},400],                       // no task
    [{action:'prioritise',from:''},400],                        // no name
    [{action:'deadline',value:'2026-02-31'},400],               // a date that does not exist
    [{action:'deadline',value:'next Tuesday'},400],             // not a date at all
    [{action:'deadline'},400],                                  // date required
    [{action:'assign'},400],                                    // name or department required
    [{action:'update',value:'   '},400],                        // whitespace is not a name
    [{action:'comment',note:''},400],                           // a comment needs words
    [{action:'prioritise',docId:'missing'},404],                // no such task
    [{action:'prioritise',docId:'t1/sub/doc'},400],             // an id is one path segment
    [{action:'prioritise',docId:'..'},400],                     // never a relative path
  ];
  for(const [body,expected] of cases){
    const result=await send(body);
    assert.equal(result.statusCode,expected,JSON.stringify(body));
    assert.equal(result.body.ok,false);
    assert.ok(result.body.error.length>0);
    assert.deepEqual(result.written,{});
  }
});

test('a finished task cannot receive a new request', async () => {
  const result=await sendBoardAction({collections:{boss_tasks:[{__id:'t1',topic:'Old',status:'done'}]},
    body:{coll:'boss_tasks',docId:'t1',from:'Khun Miki',action:'prioritise'}});
  assert.equal(result.statusCode,409);
  assert.deepEqual(result.written,{});
});

test('a valid action is recorded as a request and never edits the task', async () => {
  const result=await send({action:'deadline',value:'2026-09-20',note:'Before the parent evening.'});
  assert.equal(result.statusCode,200);
  assert.equal(result.body.ok,true);
  assert.equal(result.body.sentence,'Needs to be done by 20 Sept 2026');
  const [record]=result.written.director_notes;
  assert.equal(record.status,'new');
  assert.equal(record.taskKey,'boss_tasks/t1');
  assert.equal(record.from,'Khun Miki');
  assert.equal(record.note,'Before the parent evening.');
  assert.deepEqual([...record.owners],['boss']);
  assert.equal(record.taskTopic,'Prepare the September newsletter');
  /* The only collections written are the request log and the chat copy. */
  assert.deepEqual(Object.keys(result.written).sort(),['chat_messages','director_notes']);
  assert.match(result.written.chat_messages[0].text,/Needs to be done by 20 Sept 2026/);
  assert.match(result.written.chat_messages[0].text,/\(for Boss\)/);   // the person, not the workspace key
  assert.equal(result.written.chat_messages[0].authorName,'Khun Miki (Team Board)');
});

test('a shared task notifies every assignee, and options with no field carry no value', async () => {
  const result=await send({coll:'event_tasks',docId:'e1',action:'hold',value:'ignored'});
  assert.equal(result.statusCode,200);
  const [record]=result.written.director_notes;
  assert.deepEqual([...record.owners],['boss','dew']);
  assert.equal(record.value,'');
  assert.equal(record.sentence,'Please hold this task');
});

test('every menu option the board offers is one the server accepts', async () => {
  for(const action of boardActions.ACTIONS){
    const value=action.input==='date'?'2026-09-20':(action.input?'Khun Dew':'');
    const result=await send({action:action.id,value,note:'Please look at this.'});
    assert.equal(result.statusCode,200,action.id);
    assert.equal(result.written.director_notes[0].action,action.id);
  }
});

test('open requests reach the board as a count, a payload and unbroken markup', async () => {
  const nasty='</script><img src=x onerror="alert(1)">';
  const page=await renderTeamBoard({collections:{boss_tasks:[{__id:'t1',topic:'Newsletter',status:'pending'}]},
    notes:[
      {status:'new',taskKey:'boss_tasks/t1',sentence:'Please prioritise this task',from:'Khun Miki',note:nasty,createdAtIso:'2026-09-06T04:00:00.000Z'},
      {status:'new',taskKey:'boss_tasks/t1',sentence:'Needs discussion on this task',from:'Khun Miki',createdAtIso:'2026-09-06T05:00:00.000Z'},
      {status:'done',taskKey:'boss_tasks/t1',sentence:'Already handled',from:'Khun Miki'}
    ]});
  assert.equal(page.statusCode,200);
  const task=Object.values(payload(page.body))[0];
  assert.equal(task.coll,'boss_tasks');
  assert.equal(task.docId,'t1');
  assert.equal(task.requests.length,2);            // the handled one is not shown
  assert.equal(task.requests[0].note,nasty);
  assert.match(page.body,/2 requests sent/);
  assert.doesNotMatch(page.body,/<img src=x/);
  assert.doesNotMatch(page.body,/Already handled/);
});

test('a board with no requests still renders and offers the action menu', async () => {
  const page=await renderTeamBoard({collections:{boss_tasks:[{__id:'t1',topic:'Newsletter',status:'pending'}]}});
  assert.equal(page.statusCode,200);
  assert.doesNotMatch(page.body,/requests? sent/);
  const config=JSON.parse(page.body.match(/<script id="board-config" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(config.token,'fixture-only');
  assert.equal(config.endpoint,'/.netlify/functions/board-action');
  assert.deepEqual(config.actions.map(a=>a.id),boardActions.ACTIONS.map(a=>a.id));
});

test('a board that is not shared leaks neither the token nor the action menu', async () => {
  const page=await renderTeamBoard({token:'wrong'});
  assert.equal(page.statusCode,403);
  assert.doesNotMatch(page.body,/board-config|fixture-only/);
});

test('the browser catches the same missing input the server would refuse', () => {
  const find=id=>boardActions.ACTIONS.filter(a=>a.id===id)[0];
  assert.equal(actionProblem(find('prioritise'),{from:'Khun Miki'}),'');
  assert.match(actionProblem(find('prioritise'),{from:''}),/your name/);
  assert.match(actionProblem(null,{from:'Khun Miki'}),/choose what you need/);
  assert.match(actionProblem(find('deadline'),{from:'A',value:'soon'}),/valid date/);
  assert.equal(actionProblem(find('deadline'),{from:'A',value:'2026-09-20'}),'');
  assert.match(actionProblem(find('assign'),{from:'A',value:'  '}),/name or department/);
  assert.match(actionProblem(find('comment'),{from:'A',note:' '}),/write your comment/);
  assert.equal(actionProblem(find('comment'),{from:'A',note:'Please review'}),'');
});
