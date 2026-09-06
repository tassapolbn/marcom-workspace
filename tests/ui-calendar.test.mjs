import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function calendar(){
  const nodes=Object.fromEntries(['ov-cal-grid','ov-cal-title','ov-cal-legend','ov-cal-detail','ov-cal-filters'].map(id=>[id,{innerHTML:'',style:{},contains:()=>false}]));
  const context=vm.createContext({window:{},document:{getElementById:id=>nodes[id],activeElement:null},
    ovCalY:2026,ovCalM:8,ovSel:null,ovCalFilter:'all',MORDER:['boss','dew'],
    MSH:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    tdy:()=> '2026-09-06',pad2:n=>String(n).padStart(2,'0'),fdt:s=>s,esc:s=>s,nm:s=>s,
    tOf:w=>[{dueDate:'2026-09-06',topic:w+' task'}],eOf:()=>[],sOf:()=>[],lOf:()=>[],isActive:()=>true,topicOf:t=>t.topic,
    MarcomUI:{setHTML:(el,html)=>{el.innerHTML=html;}}});
  vm.runInContext(source.slice(source.indexOf('  function calMembers(){'),source.indexOf('  /* ---------- deadlines ---------- */')),context);
  vm.runInContext(source.slice(source.indexOf('  window.ovCalPrev='),source.indexOf('  window.ovSearch=')),context);
  return {context,nodes};
}

test('calendar opens on today with a populated agenda and full accessible date buttons',()=>{
  const {context,nodes}=calendar();context.renderCal();
  assert.equal(context.ovSel,'2026-09-06');
  assert.match(nodes['ov-cal-detail'].innerHTML,/2 scheduled items/);
  assert.equal((nodes['ov-cal-grid'].innerHTML.match(/<button /g)||[]).length,30);
  assert.match(nodes['ov-cal-grid'].innerHTML,/data-date="2026-09-06" aria-pressed="true" aria-current="date"/);
  context.window.ovSetCalFilter('dew');
  assert.match(nodes['ov-cal-detail'].innerHTML,/1 scheduled item/);
  assert.doesNotMatch(nodes['ov-cal-detail'].innerHTML,/boss task/);
});

test('month navigation keeps the selected day and agenda in the visible month across years',()=>{
  const {context,nodes}=calendar();context.ovCalM=11;context.ovSel='2026-12-31';
  context.window.ovCalNext();
  assert.equal(context.ovCalY,2027);assert.equal(context.ovCalM,0);assert.equal(context.ovSel,'2027-01-01');
  assert.match(nodes['ov-cal-detail'].innerHTML,/A clear day/);
  context.window.ovCalPrev();assert.equal(context.ovSel,'2026-12-01');
  context.ovCalY=2028;context.ovCalM=1;context.renderCal();
  assert.equal((nodes['ov-cal-grid'].innerHTML.match(/<button /g)||[]).length,29);
});

test('reselecting a date keeps the agenda open and restores focus after rendering',()=>{
  const {context,nodes}=calendar();let restored=false;
  context.document.activeElement={getAttribute:()=> '2026-09-07'};
  nodes['ov-cal-grid'].contains=()=>true;
  nodes['ov-cal-grid'].querySelector=selector=>{
    assert.equal(selector,'[data-date="2026-09-07"]');
    return {focus:()=>{restored=true;}};
  };
  context.window.ovPickDay('2026-09-07');context.window.ovPickDay('2026-09-07');
  assert.equal(context.ovSel,'2026-09-07');assert.equal(restored,true);
  assert.match(nodes['ov-cal-detail'].innerHTML,/A clear day/);
  assert.equal(nodes['ov-cal-detail'].style.display,'block');
});
