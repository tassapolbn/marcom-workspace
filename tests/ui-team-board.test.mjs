import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {renderTeamBoard} from './team-board-fixture.mjs';
const {matchesTask}=createRequire(import.meta.url)('../assets/team-board.js');
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
