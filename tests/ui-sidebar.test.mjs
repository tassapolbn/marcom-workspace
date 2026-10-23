import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const summaryJs=readFileSync(new URL('../assets/widget-summary.js',import.meta.url),'utf8');
function slice(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+1);
  assert.ok(a>0&&b>a,'missing source between '+start+' and '+end);
  return source.slice(a,b);
}

/* A tiny widget: a title, an optional element per selector, and counted items. */
function widget(title,{elements={},counts={},panel='panel-boss'}={}){
  return {
    closest:sel=>sel==='.tab-panel'?{id:panel}:null,
    querySelector:sel=>sel==='.widget-title'?{textContent:title}:(elements[sel]||null),
    querySelectorAll:sel=>({length:counts[sel]||0}),
  };
}
function summaries(globals={}){
  const context=vm.createContext({window:{},String,Math,isFinite,...globals});
  context.window=context;
  vm.runInContext(summaryJs,context);
  return context.MarcomWidgets.summary;
}

test('folded widget headers show each widget\'s key number',()=>{
  const summary=summaries({tasksOf:()=>[{status:'pending',dueDate:'a'},{status:'done',dueDate:'a'},{status:'pending',dueDate:'b'}],daysUntil:d=>d==='a'?2:30});
  const balance={childNodes:[{textContent:'10,000 '},{textContent:'THB'}]};
  assert.equal(summary(widget('Petty Cash',{elements:{'.pc-bal-num':balance}})),'10,000 THB');
  assert.equal(summary(widget('Day-off in Lieu',{elements:{'[id$="-lieu-balance"]':{textContent:' 1 Day 4 Hours '}}})),'1 Day 4 Hours');
  assert.equal(summary(widget('Sick Leave',{elements:{'[id$="-sick-count"]':{textContent:'3'}}})),'3 used');
  assert.equal(summary(widget('Pinned Notes',{counts:{'.pin-item':4}})),'4 pinned');
  assert.equal(summary(widget('Pinned Notes')),'','an empty widget says nothing');
  assert.equal(summary(widget('Deadlines')),'1 due soon','only open tasks within 7 days count');
  assert.equal(summary(widget('Asset Library',{counts:{'.asset-row':1}})),'1 link');
  assert.equal(summary(widget('Something else')),'');
});

test('weather and calendar summaries read the let-declared globals by name',()=>{
  const d=new Date(),today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const summary=summaries({wxData:{daily:{temperature_2m_max:[31.4]}},gcalData:{boss:{list:[{start:today+'T09:00'},{start:today+'T13:00'},{start:'2001-01-01T10:00'}]}}});
  assert.equal(summary(widget('Phuket Weather')),'31'+String.fromCharCode(176));
  assert.equal(summary(widget('Calendar')),'2 today');
});

test('member-tab widgets start folded unless they were opened before',()=>{
  const stored={};
  const context=vm.createContext({localStorage:{getItem:k=>k in stored?stored[k]:null}});
  vm.runInContext(slice('  function widgetKey(w){','  function scan(root){')+'\nthis.applyState=applyState;',context);
  function w(title,overview=false){
    const set=new Set();
    return {set,classList:{add:n=>set.add(n)},querySelector:()=>({textContent:title}),closest:sel=>overview&&sel==='#panel-overview'?{}:null};
  }
  const fresh=w('Sick Leave');context.applyState(fresh);
  assert.ok(fresh.set.has('collapsed'),'nothing stored: folded');
  stored['bb_wcol_Day-off in Lieu']='0';
  const opened=w('Day-off in Lieu');context.applyState(opened);
  assert.ok(!opened.set.has('collapsed'),'opened before: stays open');
  stored['bb_wcol_Pinned Notes']='1';
  const folded=w('Pinned Notes');context.applyState(folded);
  assert.ok(folded.set.has('collapsed'));
  const menu=w("Today's Menu",true);context.applyState(menu);
  assert.ok(!menu.set.has('collapsed'),'the Overview lunch menu is not folded by default');
});

test('the Calendar widget shows exactly one view',()=>{
  const context=vm.createContext({});
  vm.runInContext(slice('  function calView(widget,view){','  window.uxpCalView=')+'\nthis.calView=calView;',context);
  const month={hidden:false},up={hidden:false},buttons=['month','upcoming'].map(v=>({attrs:{},getAttribute:()=>v,setAttribute(k,val){this.attrs[k]=val;}}));
  const cal={querySelector:sel=>sel==='.uxp-cal-month'?month:(sel==='.uxp-cal-upcoming'?up:null),querySelectorAll:()=>buttons};
  assert.equal(context.calView(cal,'upcoming'),'upcoming');
  assert.deepEqual([month.hidden,up.hidden],[true,false]);
  assert.equal(buttons[1].attrs['aria-pressed'],'true');
  assert.equal(context.calView(cal,'anything'),'month');
  assert.deepEqual([month.hidden,up.hidden],[false,true]);
});

test('the widget drawer opens, locks the page, and closes on Escape',()=>{
  const classes=name=>{const set=new Set();return {set,contains:n=>set.has(n),toggle:(n,on)=>{on?set.add(n):set.delete(n);}};};
  const listeners={};
  const button={setAttribute(){},focus(){this.focused=true;}};
  const close={focus(){}};
  const col={querySelector:()=>close};
  const panel={querySelector:sel=>sel==='.uxp-drawer-btn'?button:(sel==='.two-col>.side-col'?col:null)};
  const body={classList:classes(),appendChild(){}};
  const document={body,documentElement:{classList:classes()},activeElement:null,
    getElementById:()=>({}),createElement:()=>({addEventListener(){}}),
    querySelector:sel=>sel==='.tab-panel.active'?panel:null,querySelectorAll:()=>[button],
    addEventListener:(t,fn)=>{listeners[t]=fn;},removeEventListener:t=>{delete listeners[t];}};
  document.activeElement=body;
  const context=vm.createContext({document,window:{},setTimeout:fn=>fn()});
  vm.runInContext(slice('  var drawerOpener=null;','  function decorateDrawer(panel){')+'\nthis.uxpDrawer=window.uxpDrawer;',context);
  context.uxpDrawer(true);
  assert.ok(body.classList.contains('uxp-drawer-open'));
  assert.ok(document.documentElement.classList.contains('uxp-drawer-lock'));
  const esc={key:'Escape',preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
  listeners.keydown(esc);
  assert.ok(!body.classList.contains('uxp-drawer-open'));
  assert.ok(esc.prevented&&esc.stopped,'Escape is consumed');
  assert.ok(button.focused,'focus returns to the Widgets button');
});

test('the repeated stats row is hidden and the header chips filter the board',()=>{
  const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
  assert.match(css,/\.tab-panel \.sub-panel>\.stats-row\{display:none;\}/);
  assert.match(source,/<button type="button" class="mh-stat mh-stat-soon" data-f="soon"/);
});
