import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
function slice(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+1);
  assert.ok(a>0&&b>a,'missing source between '+start+' and '+end);
  return source.slice(a,b);
}
function classes(initial=[]){
  const names=new Set(initial);
  return {contains:n=>names.has(n),toggle(n,on=!names.has(n)){
    if(on)names.add(n);else names.delete(n);return on;
  }};
}
function widget(titleText,initial=[]){
  const title={textContent:titleText,attrs:{},setAttribute(k,v){this.attrs[k]=v;},
    closest:sel=>sel==='.widget-title'?title:sel==='.widget-head'?head:sel==='.widget'?w:null};
  const head={closest:sel=>sel==='.widget'?w:null};
  const w={title,classList:classes(initial),closest:()=>null,querySelector:sel=>sel==='.widget-title'?title:null};
  return w;
}
function widgets(stored={},initial=[],motion){
  const listeners={},writes=[],reads=[];
  const context=vm.createContext({window:motion?{MarcomMotion:motion}:{},
    localStorage:{getItem:k=>{reads.push(k);return k in stored?stored[k]:null;},setItem:(k,v)=>{writes.push([k,v]);stored[k]=v;}},
    document:{body:{},querySelectorAll:()=>initial,addEventListener:(type,fn)=>{listeners[type]=fn;}},
    MutationObserver:function(){this.observe=function(){};}});
  const script=slice('<script id="widget-collapse-script">','</script>').replace('<script id="widget-collapse-script">','');
  vm.runInContext(script,context);
  vm.runInContext(slice('  function widgetKey(w){','  function scan(root){'),context);
  return {context,listeners,writes,reads};
}
function key(key,target,shiftKey=false){
  return {key,target,shiftKey,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
}

test('Calendar uses a stable key and migrates the old value only once',()=>{
  for(const value of ['0','1']){
    const stored={'bb_wcol_Google Calendar':value};
    const h=widgets(stored),w=widget('Google Calendar',['gcal-widget']);
    assert.equal(h.context.widgetKey(w),'bb_wcol_Calendar');
    h.context.applyState(w);
    assert.equal(w.classList.contains('collapsed'),value==='1');
    assert.equal(stored.bb_wcol_Calendar,value);
    w.title.textContent='Calendar';stored['bb_wcol_Google Calendar']=value==='1'?'0':'1';
    h.context.applyState(w);
    assert.equal(h.context.widgetKey(w),'bb_wcol_Calendar');
    assert.equal(w.classList.contains('collapsed'),value==='1');
    assert.equal(h.reads.filter(k=>k==='bb_wcol_Google Calendar').length,1);
    assert.deepEqual(h.writes,[['bb_wcol_Calendar',value]]);
    assert.equal(h.context.widgetKey(widget('Sick Leave')),'bb_wcol_Sick Leave');
  }
});

test('applyState opens a previously folded widget and updates its keyboard control',()=>{
  const h=widgets({'bb_wcol_Calendar':'0','bb_wcol_Google Calendar':'1'});
  const w=widget('Google Calendar',['gcal-widget','collapsed']);
  h.context.applyState(w);
  assert.equal(w.classList.contains('collapsed'),false);
  assert.deepEqual(w.title.attrs,{tabindex:'0',role:'button','aria-expanded':'true'});
  assert.equal(h.writes.length,0,'an existing Calendar value wins');
});

test('Enter, Space and click share the widget toggle and persistence path',()=>{
  const w=widget('Sick Leave'),stored={};
  const h=widgets(stored,[w]);
  assert.equal(w.title.attrs['aria-expanded'],'false');
  h.listeners.keydown(key('Enter',w.title));
  assert.equal(w.classList.contains('collapsed'),false);
  assert.equal(w.title.attrs['aria-expanded'],'true');
  assert.equal(stored['bb_wcol_Sick Leave'],'0');
  const space=key(' ',w.title);h.listeners.keydown(space);
  assert.equal(space.prevented,true);
  assert.equal(w.title.attrs['aria-expanded'],'false');
  assert.equal(stored['bb_wcol_Sick Leave'],'1');
  h.listeners.click({target:w.title});
  assert.equal(w.title.attrs['aria-expanded'],'true');
  assert.equal(stored['bb_wcol_Sick Leave'],'0');
});

test('widget aria state follows the requested animation state',()=>{
  const w=widget('Sick Leave'),calls=[];
  const h=widgets({},[w],{toggle(...args){calls.push(args);return false;}});
  h.listeners.keydown(key('Enter',w.title));
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],w);
  assert.equal(calls[0][1],'collapsed');
  assert.equal(calls[0][3].reveal,':scope>.widget-body');
  assert.equal(w.title.attrs['aria-expanded'],'true');
});

function drawer(dialog=null){
  const document={body:{classList:classes(['uxp-drawer-open'])},activeElement:null};
  const item=(opts={})=>({tabIndex:0,matches:()=>!!opts.disabled,getClientRects:()=>opts.hidden?[]:[{}],
    visibility:opts.visibility||'visible',focus(){document.activeElement=this;},...opts});
  const first=item(),middle=item(),last=item();
  const items=[item({disabled:true}),item({hidden:true}),first,middle,last,item({visibility:'hidden'}),item({tabIndex:-1})];
  const col={querySelectorAll:sel=>{assert.equal(sel,'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');return items;}};
  const panel={querySelector:sel=>sel==='.two-col>.side-col'?col:null};
  document.querySelector=sel=>sel==='.tab-panel.active'?panel:dialog&&sel.split(',').includes(dialog)?{}:null;
  const window={getComputedStyle:el=>({visibility:el.visibility}),uxpDrawer(){throw new Error('drawer must stay open');}};
  const context=vm.createContext({document,window});
  vm.runInContext(slice('  function activePanel(){','  window.uxpDrawer=function(open){'),context);
  return {document,first,middle,last,items,keys:context.drawerKeys};
}

test('drawer leaves Escape and Tab to every open dialog',()=>{
  for(const dialog of ['.modal-overlay.open','.confirm-overlay.open','.cmdk-overlay.open','#uxp-modal.open']){
    const h=drawer(dialog);
    h.document.activeElement=h.last;
    for(const name of ['Escape','Tab']){
      const e=key(name);h.keys(e);
      assert.equal(e.prevented,undefined,dialog+' owns '+name);
      assert.equal(e.stopped,undefined);
      assert.equal(h.document.activeElement,h.last);
    }
  }
});

test('drawer wraps Tab in both directions using only visible enabled controls',()=>{
  const h=drawer();
  h.document.activeElement=h.last;
  const forward=key('Tab');h.keys(forward);
  assert.equal(h.document.activeElement,h.first);assert.equal(forward.prevented,true);
  const backward=key('Tab',null,true);h.keys(backward);
  assert.equal(h.document.activeElement,h.last);assert.equal(backward.prevented,true);
  h.document.activeElement=h.middle;
  const normal=key('Tab');h.keys(normal);
  assert.equal(normal.prevented,undefined,'native Tab handles interior controls');
  h.document.activeElement={};h.keys(key('Tab'));
  assert.equal(h.document.activeElement,h.first,'escaped focus returns to the drawer');
});

test('Team today counts shared cards once in the total while each person counts their share',()=>{
  const nodes=Object.fromEntries(['team-list','team-sum','team-note','ov-team-next'].map(id=>[id,{innerHTML:'',addEventListener(){}}]));
  const context=vm.createContext({window:{},document:{getElementById:id=>nodes[id]},MORDER:['boss','dew'],
    eventTasks:[{status:'pending',assignees:['boss','dew']},{status:'done',assignees:['boss','dew']}],
    ownTasksOf:w=>w==='boss'?[{status:'pending'}]:[],taskAssignees:t=>t.assignees,taskCanonicalWs:t=>t.assignees[0],
    isActive:t=>t.status!=='done'&&t.status!=='canceled',dU:()=>null,tdy:()=>'2026-10-26',tsToDate:()=>null,
    sOf:()=>[],lOf:()=>[],esc:String,nm:w=>w,
    MarcomUI:{setHTML:(el,html)=>{el.innerHTML=html;}}});
  vm.runInContext(slice('function tasksOf(w){','/* Every write goes through here'),context);
  vm.runInContext('function tReal(w){return tasksOf(w);} function tOf(w){return ovTasksOf(w);}',context);
  vm.runInContext(slice('  function todayCounts(items,dayFn){','  window.ovRenderTeam=renderTeam;'),context);
  context.renderTeam();
  assert.match(nodes['team-sum'].innerHTML,/ 2 open<span class="ov-team-sum-w"> tasks<\/span>$/);
  const cells=nodes['team-list'].innerHTML.split('class="tm"').slice(1);
  assert.equal(cells.length,2);
  assert.match(cells[0],/<span class="tm-open">2 open<\/span>/);
  assert.match(cells[1],/<span class="tm-open">1 open<\/span>/);
});

test('ovAnnCompose unfolds through the card button before opening the composer',()=>{
  for(const animated of [false,true]){
    const calls=[],stored={},button={attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
    const card={classList:classes(['uxp-collapsed','ov-ann-closed']),querySelector:sel=>sel==='.uxp-col-btn'?fold:null};
    const fold={click(){calls.push('unfold');card.classList.toggle('uxp-collapsed',false);stored.fold='0';this.expanded='true';}};
    const nodes={'ov-ann-card':card,'ov-ann-new':button,'ov-ann-text':{focus(){calls.push('focus');}}};
    const window=animated?{MarcomMotion:{toggle(el,name,force){
      if(force!==true)assert.equal(el.classList.contains('uxp-collapsed'),false,'unfold before composer animation');
      calls.push('compose');return el.classList.toggle(name,force);
    }}}:{};
    const context=vm.createContext({window,document:{getElementById:id=>nodes[id]},setTimeout:fn=>fn()});
    vm.runInContext(slice('  window.ovAnnCompose=function(force){','  var RES_TABS='),context);
    window.ovAnnCompose();
    assert.equal(calls[0],'unfold');assert.equal(stored.fold,'0');assert.equal(fold.expanded,'true');
    assert.equal(card.classList.contains('ov-ann-closed'),false);
    assert.equal(button.attrs['aria-expanded'],'true');assert.match(button.innerHTML,/Close/);
    card.classList.toggle('uxp-collapsed',true);
    window.ovAnnCompose(false);
    assert.equal(calls.filter(c=>c==='unfold').length,1,'closing leaves the card folded');
    window.ovAnnCompose(true);
    assert.equal(calls.filter(c=>c==='unfold').length,2,'forced opening also unfolds');
  }
});

test('drawer dialogs and hidden merged widgets have the final CSS overrides',()=>{
  assert.ok(css.includes('body.uxp-drawer-open .modal-overlay,body.uxp-drawer-open .confirm-overlay,body.uxp-drawer-open .cmdk-overlay{z-index:700!important;}'));
  assert.ok(css.includes('body .tab-panel .two-col>.side-col>.widget[hidden]{display:none!important;}'));
  assert.match(source,/#uxp-modal\{z-index:720;\}/);
  assert.match(source,/#uxp-toasts\{[^}]*z-index:760;/);
});
