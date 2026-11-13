import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
const step100=css.split('/* Step 100:')[1].split('/* Step ')[0];
const tablet=step100.split('@media(min-width:601px){')[1].split('@media')[0];
const desktop=step100.split('@media(min-width:981px){')[1];
const shelves='.kb-col[data-status="done"],.kb-col[data-status="canceled"]';
const bodies='.kb-col[data-status="done"]>.kb-col-body,.kb-col[data-status="canceled"]>.kb-col-body';
function rule(block,selector){
  const start=block.indexOf(selector+'{');
  assert.ok(start>=0,selector+' has a rule');
  return block.slice(start+selector.length+1,block.indexOf('}',start));
}
function source(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a);
  assert.ok(a>=0&&b>a);
  return html.slice(a,b);
}
function board(){
  const tasks=[{id:'moving',status:'pending'}],changes=[];
  const context=vm.createContext({
    SC:Object.fromEntries(['pending','in-progress','waiting','on-hold','done','canceled'].map(s=>[s,{l:s,i:'ti-circle'}])),
    scColors:()=>[],tcLingerFrom:()=>null,tcLingerRec:()=>null,isAutoArchived:()=>false,
    kbFilterPass:()=>true,dueSortValue:()=>0,taskCardHTML:t=>'<article class="task-card" data-id="'+t.id+'"></article>',
    tasksOf:who=>who==='boss'?tasks:[],setTaskStatus:(...args)=>changes.push(args)
  });
  vm.runInContext(source('const KB_STATUS_ORDER=','function taskCardClick(')+
    source('function kanbanHTML(','/* The board is rebuilt'),context);
  return {context,tasks,changes};
}

test('601px to 980px uses two equal working columns and full-width shelves with top-aligned cards',()=>{
  assert.match(rule(tablet,'.kanban-board'),/grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:14px;/);
  assert.match(rule(tablet,shelves),/grid-column:1\/-1;/);
  const body=rule(tablet,bodies);
  assert.match(body,/display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/);
  assert.match(body,/gap:14px;align-items:start;/);
});

test('981px and up uses four equal tracks for the board and both shelf bodies regardless of the sidebar',()=>{
  assert.match(rule(desktop,'.kanban-board,'+bodies),/grid-template-columns:repeat\(4,minmax\(0,1fr\)\);/);
  assert.doesNotMatch(step100,/sidebar|side-col|auto-fit|!important/);
});

test('the shelf layout is confined to 601px and up and preserves column and card appearance in both themes',()=>{
  const rules=step100.slice(step100.indexOf('@media'));
  assert.match(rules,/^@media\(min-width:601px\)\{/);
  assert.deepEqual([...rules.matchAll(/@media\(([^)]+)\)/g)].map(m=>m[1]),['min-width:601px','min-width:981px']);
  assert.equal(rules.trim().at(-1),'}');
  assert.doesNotMatch(step100,/\.dark|background|border|box-shadow|padding|margin|min-height|\.task-card|\.kb-col-head|\.kb-over/);
  assert.match(css,/\.kb-col-body:empty\{min-height:0;padding:0!important;\}/);
  assert.match(css,/\.kb-col\.kb-over>\.kb-col-body:empty\{min-height:56px;\}/);
});

test('every column including Done and Canceled retains its head, count and drag handlers in status order',()=>{
  const {context}=board();
  const statuses=['pending','in-progress','waiting','on-hold','done','canceled'];
  const output=context.kanbanHTML(statuses.map(status=>({id:status,status})),'boss','all');
  const columns=[...output.matchAll(/<div class="kb-col" data-status="([^"]+)"([^>]+)>/g)];
  assert.deepEqual(columns.map(m=>m[1]),statuses);
  for(const [,status,attrs] of columns){
    assert.ok(attrs.includes('ondragover="taskColOver(event)"'));
    assert.ok(attrs.includes('ondragleave="taskColLeave(event)"'));
    assert.ok(attrs.includes('ondrop="taskColDrop(event,\'boss\',\''+status+'\')"'));
  }
  assert.equal((output.match(/class="kb-col-head"/g)||[]).length,6);
  assert.equal((output.match(/class="kb-col-ic"/g)||[]).length,6);
  assert.equal((output.match(/class="kb-col-count">1</g)||[]).length,6);
  const empty=context.kanbanHTML([],'boss','all');
  assert.match(empty,/data-status="done"[^>]*>[\s\S]*?class="kb-col-count">0<\/span><\/div><div class="kb-col-body"><\/div>/);
  assert.doesNotMatch(empty,/data-status="canceled"/);
});

test('dragging onto the Done shelf highlights it and dropping calls the existing status handler',()=>{
  const {context,changes}=board(),classes=new Set();
  let prevented=0;
  context.event={preventDefault(){prevented++;},dataTransfer:{},currentTarget:{
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}
  }};
  context.taskDragStart(context.event,'boss','moving');
  const output=context.kanbanHTML([],'boss','all');
  const attrs=output.match(/data-status="done"([^>]+)>/)[1];
  vm.runInContext(attrs.match(/ondragover="([^"]+)"/)[1],context);
  assert.ok(classes.has('kb-over'));
  assert.equal(context.event.dataTransfer.dropEffect,'move');
  vm.runInContext(attrs.match(/ondrop="([^"]+)"/)[1],context);
  assert.equal(classes.has('kb-over'),false);
  assert.equal(prevented,2);
  assert.deepEqual(changes,[['boss','moving','done']]);
});
