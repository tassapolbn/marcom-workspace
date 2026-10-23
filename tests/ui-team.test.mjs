import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const begin=source.indexOf('  function renderTeam(){');
const end=source.indexOf('  window.ovRenderTeam=renderTeam;');
assert.ok(begin>0&&end>begin,'renderTeam must exist in the Overview script');
const renderTeamSource=source.slice(begin,end);
const shellStart=source.indexOf("var SHELL=''");
const shell=source.slice(shellStart,source.indexOf('  function buildShell(){',shellStart));

function escape(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function team({tasks={},sick={},leave={},calendar={},missing=[],names={},lieuText}={}){
  const nodes=Object.fromEntries(['team-list','team-sum','team-note'].map(id=>[id,{id,innerHTML:'',hidden:false,addEventListener(){}}]));
  const window={avlState:w=>calendar[w]||{cls:'',txt:'Calendar not connected'},avlMissing:()=>missing.slice()};
  if(lieuText)window.LIEU_balanceText=lieuText;
  const context=vm.createContext({window,document:{getElementById:id=>nodes[id]},
    MORDER:['boss','dew','o','junior'],
    tReal:w=>tasks[w]||[],isActive:t=>t.status!=='done'&&t.status!=='canceled',
    statusOf:w=>leave[w]?{l:leave[w],c:'ov-st-sick',i:'ti-heart-broken'}:{l:'Available',c:'ov-st-ok',i:'ti-circle-check'},
    sOf:w=>sick[w]||[],lOf:()=>[],esc:escape,nm:w=>names[w]||w.toUpperCase(),roleOf:()=>'Role',iconOf:()=>'ti-user',
    MarcomUI:{setHTML:(el,html)=>{el.innerHTML=html;}}});
  vm.runInContext(renderTeamSource+'\nthis.renderTeam=renderTeam;',context);
  context.renderTeam();
  return nodes;
}
function open(n){return Array.from({length:n},()=>({status:'pending'}));}
function rows(html){return html.split('class="team-row"').slice(1);}

test('every member gets one row with the open count and the right workload level',()=>{
  const nodes=team({tasks:{boss:open(5),dew:open(6),o:open(13),junior:open(12).concat([{status:'done'},{status:'canceled'}])}});
  const r=rows(nodes['team-list'].innerHTML);
  assert.equal(r.length,4);
  assert.match(r[0],/<b>5<\/b> open <span class="team-lvl low">Low/);
  assert.match(r[1],/<b>6<\/b> open <span class="team-lvl med">Medium/);
  assert.match(r[2],/<b>13<\/b> open <span class="team-lvl high">High/);
  assert.match(r[3],/<b>12<\/b> open <span class="team-lvl med">Medium/);
  assert.match(nodes['team-sum'].innerHTML,/36 open tasks/);
});

test('a member on sick leave shows as away even when the calendar says free',()=>{
  const nodes=team({leave:{dew:'Sick Leave'},calendar:{dew:{cls:'free',txt:'Available'},boss:{cls:'busy',txt:'In a meeting'}}});
  const r=rows(nodes['team-list'].innerHTML);
  assert.match(r[1],/<span class="team-st away">Sick Leave<\/span>/);
  assert.match(r[0],/<span class="team-st busy">In a meeting<\/span>/);
  assert.match(r[2],/<span class="team-st free">Available<\/span>/,'no calendar falls back to the leave state');
});

test('the not-connected note lists only members without a calendar and hides when all are connected',()=>{
  let nodes=team({missing:['Boss','Eye']});
  assert.match(nodes['team-note'].innerHTML,/Calendar not connected: Boss, Eye\./);
  assert.equal(nodes['team-note'].hidden,false);
  nodes=team({missing:[]});
  assert.equal(nodes['team-note'].innerHTML,'');
  assert.equal(nodes['team-note'].hidden,true);
});

test('names are escaped and the hours-based lieu balance is used when available',()=>{
  const nodes=team({names:{boss:'<b>Boss</b>'},sick:{boss:[{},{}]},lieuText:w=>w==='boss'?'1 Day 4 Hours':'0 Hours'});
  const r=rows(nodes['team-list'].innerHTML);
  assert.match(r[0],/&lt;b&gt;Boss&lt;\/b&gt;/);
  assert.doesNotMatch(r[0],/<b>Boss<\/b>/);
  assert.match(r[0],/Sick <b>2<\/b> \u00b7 Lieu <b>1 Day 4 Hours<\/b>/);
});

test('the Overview shell has one Team today card and none of the four old cards',()=>{
  assert.ok(shell.length>0);
  assert.match(shell,/id="team-card"/);
  assert.doesNotMatch(shell,/ov-avail-card/);
  assert.doesNotMatch(shell,/Workload Heatmap/);
  assert.doesNotMatch(shell,/Leave &amp; Availability/);
  assert.doesNotMatch(source,/id='avl-card'|id="avl-card"|c\.id='avl-card'/);
});
