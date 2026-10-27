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
/* The real counting, availability and Team today code from the Overview script. */
const teamSource=slice('  function todayCounts(items,dayFn){','  window.ovRenderTeam=renderTeam;');
const shellStart=source.indexOf("var SHELL=''");
const shell=source.slice(shellStart,source.indexOf('  function buildShell(){',shellStart));

function escape(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

const TODAY='2026-10-26';
/* new Date() is 11:30 on the test day; any other Date works as usual. */
class FixedDate extends Date{constructor(...a){if(a.length)super(...a);else super(TODAY+'T11:30:00');}}

/* tasks: each person's own share (what their tab shows); board: the team list,
   where a shared task appears once. Due dates are days from today. */
function team({tasks={},board,sick={},lieu={},calendar={},missing=[],names={},lieuText,meetings={}}={}){
  const nodes=Object.fromEntries(['team-list','team-sum','team-note','ov-team-next'].map(id=>[id,{id,innerHTML:'',hidden:false}]));
  const window={avlState:w=>calendar[w]||{cls:'',txt:'Calendar not connected'},avlMissing:()=>missing.slice()};
  if(lieuText)window.LIEU_balanceText=lieuText;
  const context=vm.createContext({window,document:{getElementById:id=>nodes[id]||null},Date:FixedDate,
    MORDER:['boss','dew','o','junior'],
    tReal:w=>tasks[w]||[],tOf:w=>(board||tasks)[w]||[],isActive:t=>t.status!=='done'&&t.status!=='canceled',
    dU:d=>d,tdy:()=>TODAY,sOf:w=>sick[w]||[],lOf:w=>lieu[w]||[],tsToDate:ts=>ts?new Date(ts):null,
    SC:{waiting:{i:'ti-hourglass'},'on-hold':{i:'ti-player-pause'}},
    gcalData:Object.fromEntries(Object.entries(meetings).map(([w,list])=>[w,{list}])),
    esc:escape,nm:w=>names[w]||w.toUpperCase(),
    MarcomUI:{setHTML:(el,html)=>{el.innerHTML=html;}}});
  vm.runInContext(teamSource+'\nthis.renderTeam=renderTeam;',context);
  context.renderTeam();
  return nodes;
}
function open(n,extra){return Array.from({length:n},()=>({status:'pending',...extra}));}
function cells(html){return html.split('<button type="button" class="tm"').slice(1);}
function label(cell){return /aria-label="([^"]*)"/.exec(cell)[1];}

test('Team today has one cell per person with their own open count; the total counts a shared task once',()=>{
  const shared={status:'pending'};
  const nodes=team({tasks:{boss:open(4).concat(shared),dew:open(2).concat(shared,{status:'done'}),o:open(1),junior:[]},
    board:{boss:open(4).concat(shared),dew:open(2),o:open(1),junior:[]}});
  const c=cells(nodes['team-list'].innerHTML);
  assert.equal(c.length,4);
  assert.match(c[0],/<span class="tm-open">5 open<\/span>/);
  assert.match(c[1],/<span class="tm-open">3 open<\/span>/,'a shared task counts for each person, done work never');
  assert.match(c[3],/<span class="tm-open">0 open<\/span>/);
  assert.equal(nodes['team-sum'].innerHTML,' \u00b7 8 open<span class="ov-team-sum-w"> tasks</span>','the shared task is counted once in the total');
  assert.doesNotMatch(nodes['team-list'].innerHTML,/team-lvl|team-bar|Low|Medium|High/,'no workload level or bar');
});

test('the heading counts the work finished in the last 7 days, a shared task once, and says nothing when there is none',()=>{
  const recent=new FixedDate(TODAY+'T09:00:00').getTime()-2*86400000,old=new FixedDate(TODAY+'T09:00:00').getTime()-9*86400000;
  const shared={status:'done',doneAt:recent};
  let nodes=team({tasks:{boss:[shared,{status:'done',doneAt:old},{status:'pending'}],dew:[shared,{status:'done',doneAt:recent}]},
    board:{boss:[shared,{status:'done',doneAt:old},{status:'pending'}],dew:[{status:'done',doneAt:recent}]}});
  assert.equal(nodes['team-sum'].innerHTML,' \u00b7 1 open<span class="ov-team-sum-w"> tasks</span><span class="ov-team-done"> \u00b7 2 done this week</span>');
  nodes=team({tasks:{boss:[{status:'done',doneAt:old},{status:'done'}]}});
  assert.doesNotMatch(nodes['team-sum'].innerHTML,/done/);
});

test('only what needs attention shows, each with an icon and words in the shared status colours',()=>{
  const nodes=team({
    tasks:{boss:open(2,{dueDate:-1}).concat(open(1,{dueDate:0})),dew:[{status:'waiting'},{status:'on-hold'},{status:'on-hold'}],o:open(1),junior:open(1)},
    sick:{o:[{date:TODAY}]},lieu:{junior:[{type:'used',date:TODAY}]},
    calendar:{o:{cls:'free',txt:'Available · nothing today'}}});
  const c=cells(nodes['team-list'].innerHTML);
  assert.match(c[0],/class="tm-x tm-over"[^>]*><i class="ti ti-alert-triangle" aria-hidden="true"><\/i><span class="tm-n">2<\/span><span class="tm-w"> overdue<\/span>/);
  assert.doesNotMatch(c[0],/tm-clear/,'due today is in the work list, not a flag');
  assert.match(c[1],/class="tm-x tm-wait"[^>]*><i class="ti ti-hourglass"/,'waiting uses the shared status icon');
  assert.match(c[1],/<span class="tm-n">1<\/span><span class="tm-w"> waiting<\/span>/);
  assert.match(c[1],/class="tm-x tm-hold"[^>]*><i class="ti ti-player-pause"[^>]*><\/i><span class="tm-n">2<\/span><span class="tm-w"> on hold<\/span>/);
  assert.match(c[2],/class="tm-x tm-out"[^>]*><i class="ti ti-heart-broken"[^>]*><\/i><span class="tm-w">Out sick<\/span><span class="tm-s">Out<\/span>/,
    'sick leave shows even when the calendar says free');
  assert.match(c[3],/class="tm-x tm-out"[^>]*><i class="ti ti-beach"[^>]*><\/i><span class="tm-w">On leave<\/span>/);
  assert.match(label(c[0]),/^BOSS: 2 overdue\. 3 open\./);
  assert.match(label(c[1]),/^DEW: 1 waiting, 2 on hold\. 3 open\./);
  assert.match(label(c[2]),/^O: Out sick\. 1 open\./);
});

test('someone with nothing to flag reads Clear; a meeting now or soon shows quietly from the calendar',()=>{
  const nodes=team({tasks:{boss:open(3),dew:open(1),o:open(1),junior:open(1)},
    calendar:{boss:{cls:'free',txt:'Available · 2 today'},dew:{cls:'busy',txt:'In a meeting · free in 20 min'},
      o:{cls:'soon',txt:'Free now · next in 10 min'},junior:{cls:'away',txt:'Day off in lieu'}}});
  const c=cells(nodes['team-list'].innerHTML);
  assert.match(c[0],/<span class="tm-x tm-clear"><i class="ti ti-check" aria-hidden="true"><\/i>Clear<\/span>/);
  assert.match(label(c[0]),/^BOSS: clear\./);
  assert.match(c[1],/class="tm-x tm-meet" title="In a meeting · free in 20 min"/);
  assert.match(c[1],/<span class="tm-s">Busy<\/span>/,'a phone shows a short word');
  assert.doesNotMatch(c[1],/tm-clear/);
  assert.match(c[2],/class="tm-x tm-soon" title="Free now · next in 10 min"/);
  assert.match(c[3],/class="tm-x tm-out"[^>]*><i class="ti ti-beach"/,'leave known only to the calendar script still shows');
});

test('the not-connected note lists only members without a calendar and hides when all are connected',()=>{
  let nodes=team({missing:['Boss','Eye']});
  assert.match(nodes['team-note'].innerHTML,/Calendar not connected: Boss, Eye\./);
  assert.equal(nodes['team-note'].hidden,false);
  nodes=team({missing:[]});
  assert.equal(nodes['team-note'].innerHTML,'');
  assert.equal(nodes['team-note'].hidden,true);
});

test('names are escaped, each cell opens that person, and sick days and the lieu balance stay in view',()=>{
  let nodes=team({names:{boss:'<b>Boss</b>'},sick:{boss:[{date:'2026-03-02'},{date:'2026-05-11'}]},lieuText:w=>w==='boss'?'1 Day 4 Hours':'0 Hours'});
  let c=cells(nodes['team-list'].innerHTML);
  assert.match(c[0],/&lt;b&gt;Boss&lt;\/b&gt;/);
  assert.doesNotMatch(c[0],/<b>Boss<\/b>/);
  assert.match(c[0],/onclick="ovGoto\('boss'\)"/);
  assert.match(c[0],/<span class="tm-mono" aria-hidden="true">&lt;<\/span>/,'the monogram is the first letter of the shown name');
  assert.match(c[0],/<span class="tm-lv">Sick 2 · Lieu 1 Day 4 Hours<\/span>/);
  assert.match(label(c[0]),/Sick 2, lieu 1 Day 4 Hours\. Open &lt;b&gt;Boss&lt;\/b&gt;’s tab\.$/);
  assert.match(c[1],/<span class="tm-lv">Sick 0 · Lieu 0 Hours<\/span>/);
  /* Without the hours script the balance falls back to days. */
  nodes=team({lieu:{dew:[{type:'earned',days:2},{type:'used',days:0.5,date:'2026-01-05'}]}});
  c=cells(nodes['team-list'].innerHTML);
  assert.match(c[1],/<span class="tm-lv">Sick 0 · Lieu 1\.5 days<\/span>/);
});

test('the next meeting today shows in the heading once, even when two people share it',()=>{
  const at=h=>TODAY+'T'+h+':00';
  let nodes=team({meetings:{
    boss:[{title:'Weekly sync',start:at('14:00')},{title:'Earlier today',start:at('09:00')},{title:'All day',allDay:true,start:at('00:00')}],
    dew:[{title:'Weekly sync',start:at('14:00')},{title:'Brief',start:'2026-10-27T10:00:00'}],
    o:[{title:'Photo shoot',start:at('15:30')}]}});
  assert.match(nodes['ov-team-next'].innerHTML,/^<button type="button" class="nx-btn" onclick="openMeetingCal\(\)" title="Open Google Calendar">/,
    'the next meeting opens Google Calendar, as the Meetings tile did');
  assert.match(nodes['ov-team-next'].innerHTML,/<span class="nx-l">Next meeting: <\/span>14:00 Weekly sync<\/button>$/);
  nodes=team({meetings:{boss:[{title:'Earlier today',start:at('09:00')}],dew:[{title:'Tomorrow',start:'2026-10-27T10:00:00'}]}});
  assert.equal(nodes['ov-team-next'].innerHTML,'','nothing later today leaves the heading quiet');
});

test('the Overview shell has one Team today section between the greeting and the work, and none of the old cards',()=>{
  assert.equal((shell.match(/id="ov-team"/g)||[]).length,1);
  assert.match(shell,/<section class="ov-team" id="ov-team" aria-labelledby="ov-team-title">/);
  const order=['id="ov-top"','class="ov-topbar"','id="ov-team"','class="ov-grid"'].map(s=>shell.indexOf(s));
  assert.ok(order.every((x,i)=>x>0&&(i===0||x>order[i-1])),'announcements, greeting and search, Team today, then the work');
  assert.doesNotMatch(shell,/id="team-card"/);
  assert.doesNotMatch(shell,/ov-avail-card/);
  assert.doesNotMatch(shell,/Workload Heatmap/);
  assert.doesNotMatch(shell,/Leave &amp; Availability/);
  assert.doesNotMatch(source,/id='avl-card'|id="avl-card"|c\.id='avl-card'/);
});
