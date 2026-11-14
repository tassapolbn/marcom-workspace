import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
function source(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a);
  assert.ok(a>=0&&b>a,start);
  return html.slice(a,b);
}
const menuSource=source('const MENU_DAYS=','// ===== WIDGET REORDERING =====');
const helpers=source('function menuAnchorValid(','function menuCacheAnchor(');
const pure=vm.createContext({});
vm.runInContext(helpers,pure);
const date=(y,m,d)=>new Date(y,m-1,d);
const anchor={week:3,monday:'2026-11-09'};
const plain=value=>JSON.parse(JSON.stringify(value));

for(const [parts,expected] of [
  [[2026,11,11],'2026-11-09'],[[2026,11,9],'2026-11-09'],
  [[2026,11,13],'2026-11-09'],[[2026,11,14],'2026-11-16'],
  [[2026,11,15],'2026-11-16'],[[2026,1,31],'2026-02-02'],
  [[2026,2,1],'2026-02-02'],[[2022,12,31],'2023-01-02'],
  [[2023,1,1],'2023-01-02']
])test(`menuMondayOf(${parts.join('-')}) gives ${expected}`,()=>{
  const input=date(...parts),before=input.getTime();
  assert.equal(pure.menuMondayOf(input),expected);
  assert.equal(input.getTime(),before,'the input date is unchanged');
});

for(const [n,expected] of [[0,3],[1,4],[2,1],[3,2],[4,3],[9,4],[-1,2],[-2,1],[-3,4],[-9,2]]){
  test(`menuWeekFor counts ${n} weeks from Week 3 as Week ${expected}`,()=>{
    assert.equal(pure.menuWeekFor(anchor,date(2026,11,9+7*n)),expected);
  });
}
test('menuWeekFor keeps weekdays together and counts the weekend with the coming week',()=>{
  for(let d=9;d<=13;d++)assert.equal(pure.menuWeekFor(anchor,date(2026,11,d)),3);
  for(const d of [14,15,16])assert.equal(pure.menuWeekFor(anchor,date(2026,11,d)),4);
  assert.equal(pure.menuWeekFor({week:4,monday:'2026-11-09'},date(2026,11,16)),1);
});
test('missing and malformed anchors fall back to Week 1',()=>{
  for(const bad of [undefined,null,{},1,{week:0,monday:anchor.monday},{week:5,monday:anchor.monday},
    {week:1.5,monday:anchor.monday},{week:'3',monday:anchor.monday},{week:3},
    {week:3,monday:'2026-1-09'},{week:3,monday:20261109},{week:3,monday:'not-a-date'}]){
    assert.equal(pure.menuWeekFor(bad,date(2026,11,16)),1,JSON.stringify(bad));
  }
});
test('calendar counting survives both daylight-saving changes in New York',()=>{
  const script=`import assert from 'node:assert/strict';\n${helpers}\n
    for(const [m,d] of [[3,2],[10,26]]){
      const first=new Date(2026,m-1,d),next=new Date(2026,m-1,d+7);
      assert.notEqual(first.getTimezoneOffset(),next.getTimezoneOffset(),'the dates cross a clock change');
      const a={week:4,monday:menuMondayOf(first)};
      assert.equal(menuWeekFor(a,next),1);
      assert.equal(menuWeekFor(a,new Date(2026,m-1,d+14)),2);
      assert.equal(menuWeekFor(a,new Date(2026,m-1,d-7)),3);
    }`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{
    env:{...process.env,TZ:'America/New_York'},encoding:'utf8'
  });
  assert.equal(result.status,0,result.stderr);
});

function element(tag='div'){
  let text='';
  return {tag,children:[],innerHTML:'',value:'',attributes:{},
    set textContent(value){text=value;this.children=[];},
    get textContent(){return text+this.children.map(c=>c.textContent).join('');},
    appendChild(node){this.children.push(node);return node;},
    setAttribute(name,value){this.attributes[name]=value;},
    addEventListener(name,fn){this['on'+name]=fn;}
  };
}
function menu({today=[2026,11,11],role='member',stored={'bb_menu_anchor':JSON.stringify(anchor)},save=async()=>{},confirm=true}={}){
  const elements=Object.fromEntries(['menu-week','menu-days','menu-date','menu-week-note','menu-list'].map(id=>[id,element()]));
  const cache={...stored},writes=[],saves=[],prompts=[],toasts=[],events={};
  class MenuDate extends Date{
    constructor(...parts){super(...(parts.length?parts:[today[0],today[1]-1,today[2]]));}
  }
  const context=vm.createContext({Date:MenuDate,document:{getElementById:id=>elements[id],createElement:element},
    window:{__cur:role?{role}:null,addEventListener:(name,fn)=>{events[name]=fn;}},
    localStorage:{getItem:key=>cache[key]??null,setItem(key,value){writes.push([key,value]);cache[key]=value;}},
    teamRef:{async set(...args){saves.push(plain(args));await save(...args);}},
    uiConfirm:async options=>{prompts.push(plain(options));return confirm;},uiToast:message=>toasts.push(message)
  });
  vm.runInContext(menuSource,context);
  const run=code=>vm.runInContext(code,context);
  const pick=week=>{elements['menu-week'].value=String(week);context.changeMenuWeek();};
  const buttons=()=>elements['menu-week-note'].children.flatMap(c=>c.children);
  context.renderMenu();
  return {context,elements,cache,writes,saves,prompts,toasts,events,run,pick,buttons};
}
test('default rendering counts from the device anchor and retains dishes in both languages',()=>{
  const m=menu({today:[2026,11,18]});
  assert.equal(m.elements['menu-week'].value,4);
  assert.equal(m.elements['menu-date'].textContent,'Today, Wednesday · Week 4');
  assert.equal(m.elements['menu-week-note'].textContent,'');
  assert.match(m.elements['menu-list'].innerHTML,/Soft Pizza Slices/);
  assert.match(m.elements['menu-list'].innerHTML,/menu-item-th/);
});
test('the picker only changes the view, and its real back button restores this week',()=>{
  const m=menu();m.pick(1);
  assert.equal(m.run('menuViewWeek'),1);
  assert.equal(m.elements['menu-date'].textContent,'Wednesday · Week 1');
  assert.match(m.elements['menu-week-note'].textContent,/^Showing Week 1\. This week is Week 3\./);
  const [back]=m.buttons();
  assert.equal(back.tag,'button');assert.equal(back.type,'button');assert.equal(back.className,'menu-week-back');
  assert.equal(back.textContent,'Back to this week');
  assert.equal(m.buttons().length,1);
  assert.deepEqual(m.writes,[],'browsing never saves');
  back.onclick();
  assert.equal(m.run('menuViewWeek'),null);
  assert.equal(m.elements['menu-week'].value,3);
  assert.equal(m.elements['menu-week-note'].textContent,'');
  m.pick(1);m.pick(3);
  assert.equal(m.run('menuViewWeek'),null,'picking this week also clears the view');
});
test('Today applies only to the actual weekday in the counted week',()=>{
  const m=menu();
  assert.match(m.elements['menu-date'].textContent,/^Today, /);
  m.context.changeMenuDay('fri');assert.doesNotMatch(m.elements['menu-date'].textContent,/Today/);
  m.context.changeMenuDay('wed');m.pick(2);
  assert.doesNotMatch(m.elements['menu-date'].textContent,/Today/);
  assert.doesNotMatch(m.elements['menu-days'].innerHTML,/aria-current="date"|today-pill/);
});
test('weekends default to Monday and the coming week without a Today label',()=>{
  for(const day of [14,15]){
    const m=menu({today:[2026,11,day]});
    assert.equal(m.elements['menu-date'].textContent,'Monday · Week 4');
    assert.equal(m.run('menuSelectedDay'),'mon');
  }
});
test('only admins see the set button, and auth changes redraw it immediately',()=>{
  const m=menu({role:null});m.pick(1);
  assert.equal(m.buttons().length,1);
  m.context.window.__cur={role:'admin'};m.events.authchanged();
  assert.equal(m.buttons().length,2);
  const set=m.buttons()[1];
  assert.equal(set.tag,'button');assert.equal(set.type,'button');assert.equal(set.className,'menu-week-set');
  assert.equal(set.textContent,'Set Week 1 as this week');
  m.context.window.__cur={role:'member'};m.events.authchanged();
  assert.equal(m.buttons().length,1);
  m.context.window.__cur=null;m.events.authchanged();
  assert.equal(m.buttons().length,1);
});
test('setting Week 4 confirms the wrap to 1, merges only menuWeek and caches the successful save',async()=>{
  const m=menu({role:'admin'});m.pick(4);
  await m.buttons()[1].onclick();
  assert.deepEqual(m.prompts,[{title:'Set the menu week',message:'Count from this week with Week 4? Everyone on the team will see Week 4 this week, Week 1 next week, and so on.',okLabel:'Set Week 4',icon:'ti-calendar-check'}]);
  assert.deepEqual(m.saves,[[{menuWeek:{week:4,monday:'2026-11-09'}},{merge:true}]]);
  assert.deepEqual(JSON.parse(m.cache.bb_menu_anchor),{week:4,monday:'2026-11-09'});
  assert.equal(m.run('menuViewWeek'),null);
  assert.equal(m.elements['menu-week'].value,4);
  assert.equal(m.elements['menu-week-note'].textContent,'');
  assert.deepEqual(m.toasts,['Week 4 is now this week. The menu will count on from here.']);
});
test('a refused save or missing team document changes no menu or device state',async()=>{
  for(const missing of [false,true]){
    const m=menu({role:'admin',save:async()=>{throw new Error('permission-denied');}});m.pick(1);
    const before={anchor:m.run('JSON.stringify(menuAnchor)'),view:m.run('menuViewWeek'),cache:{...m.cache},note:m.elements['menu-week-note'].textContent};
    if(missing)m.context.teamRef=null;
    await m.buttons()[1].onclick();
    assert.equal(m.run('JSON.stringify(menuAnchor)'),before.anchor);
    assert.equal(m.run('menuViewWeek'),before.view);
    assert.deepEqual(m.cache,before.cache);assert.deepEqual(m.writes,[]);
    assert.equal(m.elements['menu-week-note'].textContent,before.note);
    assert.deepEqual(m.toasts,['Could not save the menu week. Please try again.']);
  }
});
test('nothing changes while the save is pending',async()=>{
  let finish;
  const m=menu({role:'admin',save:()=>new Promise(resolve=>{finish=resolve;})});m.pick(1);
  const pending=m.buttons()[1].onclick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(plain(m.run('menuAnchor')),anchor);
  assert.equal(m.run('menuViewWeek'),1);assert.deepEqual(m.writes,[]);
  finish();await pending;
  assert.equal(m.elements['menu-week'].value,1);
});
test('cancelling the confirmation and direct non-admin calls never save',async()=>{
  const m=menu({role:'admin',confirm:false});m.pick(1);await m.buttons()[1].onclick();
  assert.deepEqual(m.saves,[]);assert.deepEqual(m.writes,[]);assert.equal(m.run('menuViewWeek'),1);
  m.context.window.__cur={role:'member'};await m.context.setMenuWeek(1);
  assert.equal(m.prompts.length,1);assert.deepEqual(m.saves,[]);
});
test('migration uses the old week once, then resumes counting from the cached anchor',()=>{
  const m=menu({stored:{bb_menu_week:'2'}});
  assert.deepEqual(JSON.parse(m.cache.bb_menu_anchor),{week:2,monday:'2026-11-09'});
  assert.equal(m.writes.length,1);
  const later=menu({today:[2026,11,18],stored:{...m.cache,bb_menu_week:'4'}});
  assert.equal(later.elements['menu-week'].value,3);
  assert.deepEqual(later.writes,[]);
  for(const bad of [undefined,'0','5','2x']){
    const fallback=menu({stored:{bb_menu_week:bad,bb_menu_anchor:'broken json'}});
    assert.equal(fallback.elements['menu-week'].value,1);
    assert.equal(fallback.writes.length,1);
  }
});
test('the existing team listener copies valid menu settings and preserves member names',()=>{
  const m=menu();let snapshot,applied=0;
  m.context.db={collection:name=>{assert.equal(name,'dept_settings');return {doc:id=>{
    assert.equal(id,'team');return {onSnapshot:fn=>{snapshot=fn;}};
  }};}};
  m.context.applyMemberNames=()=>applied++;
  m.context.syncErr=assert.fail;
  const listener=source("  teamRef=db.collection('dept_settings').doc('team');",'  assetsRef=db.collection');
  assert.equal((listener.match(/\.onSnapshot\(/g)||[]).length,1);
  vm.runInContext(listener,m.context);
  snapshot({exists:true,data:()=>({names:{dew:'New name'},menuWeek:{week:2,monday:'2026-11-02'}})});
  assert.equal(m.elements['menu-week'].value,3);
  assert.deepEqual(JSON.parse(m.cache.bb_menu_anchor),{week:2,monday:'2026-11-02'});
  assert.equal(m.context.memberNames.dew,'New name');assert.equal(applied,1);
  const writes=m.writes.length;
  for(const bad of [null,{week:5,monday:anchor.monday},{week:'2',monday:anchor.monday},{week:2,monday:'bad'}]){
    snapshot({exists:true,data:()=>({menuWeek:bad})});
    assert.deepEqual(plain(m.run('menuAnchor')),{week:2,monday:'2026-11-02'});
    assert.equal(m.writes.length,writes);
  }
  snapshot({exists:true,metadata:{hasPendingWrites:true},data:()=>({menuWeek:{week:4,monday:anchor.monday}})});
  assert.equal(m.writes.length,writes,'unconfirmed local writes cannot change the anchor');
  snapshot({exists:false});
  assert.equal(m.writes.length,writes);
  snapshot({exists:true,data:()=>({menuWeek:{week:4,monday:anchor.monday}})});
  assert.equal(m.elements['menu-week'].value,4,'team data wins over the device copy and redraws');
});
test('Today only resets the viewing week and day, including weekends',()=>{
  for(const day of [11,14,15]){
    const m=menu({today:[2026,11,day]});m.pick(1);m.context.changeMenuDay('fri');
    const classes=new Set(),head=element(),card=element();let toggle;
    head.querySelector=()=>null;head.appendChild=node=>{toggle=node;};
    card.querySelector=()=>head;
    card.classList={contains:name=>classes.has(name),toggle:(name,on)=>on?classes.add(name):classes.delete(name)};
    const original=m.context.document.getElementById;
    m.context.document.getElementById=id=>id==='ov-menu-card'?card:original(id);
    vm.runInContext(source('  function ovMenuCompact(){','  var ovActAll='),m.context);
    m.context.ovMenuCompact();
    toggle.onclick({stopPropagation(){}});toggle.onclick({stopPropagation(){}});
    assert.equal(m.run('menuViewWeek'),null);
    assert.equal(m.run('menuSelectedDay'),day===11?'wed':'mon');
    assert.equal(m.elements['menu-week-note'].textContent,'');
    assert.equal(toggle.textContent,'Whole week');
  }
});

const block=css.slice(css.indexOf('/* Step 107:'),css.indexOf('/* Step 108:'));
test('the empty note is hidden and new compact buttons wrap with full touch targets',()=>{
  assert.match(html,/<div class="menu-date" id="menu-date"><\/div>\s*<div class="menu-week-note" id="menu-week-note"><\/div>/);
  assert.match(block,/\.menu-week-note\{[^}]*font-size:12.5px;[^}]*color:var\(--muted\);[^}]*text-align:center;[^}]*margin-bottom:8px/);
  assert.match(block,/\.menu-week-note:empty\{display:none;\}/);
  assert.match(block,/\.menu-week-actions\{[^}]*gap:8px;flex-wrap:wrap/);
  assert.match(block,/height:var\(--hs-ctl-h-sm\);[^}]*border-radius:var\(--hs-ctl-radius\)/);
  assert.match(block,/\.menu-week-set\{background:var\(--surface\);color:var\(--text\);border:1px solid var\(--hs-btn-line\)/);
  assert.match(block,/\.menu-week-back:hover\{text-decoration:underline;\}/);
  assert.match(block,/@media\(max-width:600px\),\(pointer:coarse\)\{\s*\.menu-week-back,\.menu-week-set\{height:44px;min-height:44px;/);
  assert.doesNotMatch(block,/!important|transition:|animation:/);
  assert.match(css,/html body :is\(button,a,\[tabindex\][^}]+focus-visible\{\s*outline:2px solid/,'the shared focus rule covers both buttons');
});
function luminance(hex){
  const c=hex.replace('#','').match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  return .2126*c[0]+.7152*c[1]+.0722*c[2];
}
test('new note and button inks meet 4.5 to 1 in both themes',()=>{
  assert.match(block,/\.menu-week-back\{[^}]*color:#003057;/);
  assert.match(block,/html.dark \.menu-week-back\{color:#cfe0f5;\}/);
  assert.match(html,/--muted:#55637A/);assert.match(css,/html.dark\{--muted:#a3b1c4/);
  for(const [bg,inks] of [['#ffffff',['#55637a','#003057','#101a2b']],['#192231',['#a3b1c4','#cfe0f5','#eaf0f8']]]){
    for(const ink of inks){
      const a=luminance(bg),b=luminance(ink);
      assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${ink} on ${bg}`);
    }
  }
});
