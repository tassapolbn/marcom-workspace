import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function slice(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+1);
  assert.ok(a>0&&b>a,'missing source between '+start+' and '+end);
  return source.slice(a,b);
}
const context=vm.createContext({window:{}});
vm.runInContext(slice('  function todayCounts(items,dayFn){','  /* ---------- availability ---------- */')+'\nthis.todayCounts=todayCounts;',context);
vm.runInContext(slice("  var ovDl='all'",'  window.ovDlFilter=')+'\nthis.dlGroups=dlGroups;',context);
const shellStart=source.indexOf("var SHELL=''");
const shell=source.slice(shellStart,source.indexOf('  function buildShell(){',shellStart));

const days={'2026-10-20':-4,'2026-10-23':-1,'2026-10-24':0,'2026-10-25':1,'2026-10-31':7,'2026-11-01':8};
const dayFn=d=>d in days?days[d]:null;

test('a task due today counts once, never also in the next 7 days',()=>{
  const c=context.todayCounts([{status:'pending',dueDate:'2026-10-24'},{status:'pending',dueDate:'2026-10-25'},{status:'in-progress',dueDate:'2026-10-31'}],dayFn);
  assert.equal(c.dueToday,1);
  assert.equal(c.week,2);
  assert.equal(c.open,3);
});

test('done and canceled tasks are never counted',()=>{
  const c=context.todayCounts([{status:'done',dueDate:'2026-10-23'},{status:'canceled',dueDate:'2026-10-24'},{status:'pending'}],dayFn);
  assert.deepEqual({...c},{overdue:0,oldest:0,dueToday:0,week:0,open:1});
});

test('overdue counts negative days and keeps the oldest',()=>{
  const c=context.todayCounts([{status:'pending',dueDate:'2026-10-23'},{status:'waiting',dueDate:'2026-10-20'},{status:'pending',dueDate:'2026-11-01'}],dayFn);
  assert.equal(c.overdue,2);
  assert.equal(c.oldest,4);
  assert.equal(c.week,0,'eight days away is outside the next 7 days');
});

test('the deadline filter returns only the matching groups',()=>{
  const items=[-4,-1,0,1,3,9].map(d=>({d}));
  /* Arrays made inside the vm context have their own prototype, so copy them out. */
  const keys=f=>Array.from(context.dlGroups(items,f),g=>g.key);
  assert.deepEqual(keys('all'),['overdue','today','tomorrow','week','next']);
  assert.deepEqual(keys('overdue'),['overdue']);
  assert.deepEqual(keys('today'),['today']);
  assert.deepEqual(keys('week'),['tomorrow','week']);
  assert.deepEqual(Array.from(context.dlGroups(items,'overdue')[0].items,i=>i.d),[-4,-1]);
  assert.deepEqual(keys('unknown'),keys('all'));
});

test('the Overview shell shows each today number once',()=>{
  assert.doesNotMatch(shell,/ov-todayline/);
  assert.doesNotMatch(shell,/id="ov-focus"/);
  assert.doesNotMatch(shell,/id="uxp-today"/);
  assert.match(shell,/id="ov-dl-filters"/);
  /* Step 37: the number tiles are gone; their counts head the work list. */
  assert.doesNotMatch(shell,/id="ov-stats"|ov-stat/);
  assert.match(shell,/id="ov-team"/);
});
