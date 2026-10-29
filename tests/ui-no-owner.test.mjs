import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function slice(a,b){const i=source.indexOf(a);return source.slice(i,source.indexOf(b,i));}
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function deadlines(owners){
  const task={id:'shared',topic:'Shared work',__src:'event',status:'pending',dueDate:'2026-10-31',assignees:owners};
  const nodes={'ov-deadlines':{},'ov-dl-filters':{}};
  const ctx=vm.createContext({window:{},document:{getElementById:id=>nodes[id]},eventTasks:[task],
    MORDER:['boss','dew','o','junior'],taskAssignees:t=>t.assignees,
    tOf:w=>owners[0]===w?[task]:[],isActive:t=>!['done','canceled'].includes(t.status),dU:()=>2,
    nm:w=>({boss:'Boss',dew:'Dew',o:'O',junior:'Eye'})[w],esc,topicOf:t=>t.topic,fdt:d=>d,
    MarcomUI:{setHTML:(el,h)=>{el.innerHTML=h;}}});
  vm.runInContext(slice("  var ovDl='all', ovDlOpen={};",'  /* ---------- event countdown ---------- */'),ctx);
  ctx.renderDeadlines();return nodes['ov-deadlines'].innerHTML;
}
test('unowned deadlines appear once in their date group and open the Event Board',()=>{
  const html=deadlines([]);
  assert.equal((html.match(/class="ov-dl"/g)||[]).length,1);
  assert.match(html,/This Week/);
  assert.match(html,/No owner/);
  assert.match(html,/onclick="evbShowTask\(&quot;shared&quot;\)"/);
  assert.match(html,/onkeydown="ovRowKey\(event\)"/);
});
test('owned shared deadlines keep their initial and shared deadlines show every owner once',()=>{
  const one=deadlines(['dew']);
  assert.doesNotMatch(one,/No owner/);
  assert.match(one,/data-member="dew"[^>]*>D<\/span>/);
  const many=deadlines(['boss','dew','o']);
  assert.equal((many.match(/class="ov-dl"/g)||[]).length,1);
  assert.match(many,/ov-dl-count">1<\/span>/);
  for(const [w,i] of [['boss','B'],['dew','D'],['o','O']])assert.match(many,new RegExp('data-member="'+w+'"[^>]*>'+i+'<'));
  assert.match(many,/Boss, Dew, O/);
  assert.match(many,/ovShowTask\('boss','shared'\)/);
  assert.match(deadlines(['boss','dew','o','junior']),/ov-dl-extra" aria-hidden="true">\+1/);
});
test('Event Board rows expose task ids and opening a task expands, scrolls and marks it',()=>{
  assert.match(source,/data-id="'\+esc\(t.id\)\+'" onclick="/);
  const classes=new Set();let scrolled=false,delay,cleanup;
  const row={getAttribute:()=> 'shared',classList:{remove:c=>classes.delete(c),add:c=>classes.add(c)},scrollIntoView:()=>{scrolled=true;}};
  const ctx=vm.createContext({window:{evbRender:()=>{}},evtList:()=>[{id:'shared'}],MarcomEventBoard:{labelOf:()=>''},
    evbOpen:{},evbMore:{},flt:'Another event',document:{getElementById:id=>id==='evb-body'?{querySelectorAll:()=>[row]}:null},
    motionBehavior:()=> 'auto',setTimeout:(f,d)=>{cleanup=f;delay=d;}});
  vm.runInContext(slice('  window.evbShowTask=function(id){','  window.evbShowMore='),ctx);
  ctx.window.evbShowTask('shared');
  assert.equal(ctx.evbOpen.Other,true);assert.equal(ctx.evbMore.Other,true);
  assert.equal(ctx.flt,'');assert.ok(scrolled);assert.ok(classes.has('tc-found'));
  assert.equal(delay,2400);cleanup();assert.ok(!classes.has('tc-found'));
});
