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
const shell=slice("  var SHELL=''",'  /* ---------- layout:');
function order(ids,text){
  const at=ids.map(id=>text.indexOf('id="'+id+'"'));
  at.forEach((n,i)=>assert.ok(n>0,ids[i]+' is missing'));
  return at.every((n,i)=>i===0||n>at[i-1]);
}

test('the Overview shell puts every card in its column and folds the rest away',()=>{
  const main=shell.slice(shell.indexOf('ov-col-main'),shell.indexOf('ov-col-side'));
  const side=shell.slice(shell.indexOf('ov-col-side'),shell.indexOf('id="ov-more"'));
  const more=shell.slice(shell.indexOf('id="ov-more"'));
  assert.ok(order(['ov-dl-card','ov-cal-card'],main));
  assert.ok(order(['team-card','ov-cd-card','ov-wm-card'],side));
  const topAt=shell.indexOf('id="ov-top"'),annAt=shell.indexOf('id="ov-ann-card"'),barAt=shell.indexOf('class="ov-topbar"');
  assert.ok(topAt>0&&annAt>topAt&&barAt>annAt,'announcements sit in the top slot before the greeting');
  assert.doesNotMatch(side,/id="ov-ann-card"/);
  assert.ok(order(['ov-res-card','ov-act-card'],more));
  assert.match(shell,/class="ov-more ov-more-closed" id="ov-more"/,'Resources & more starts folded');
  assert.doesNotMatch(shell,/Quick Actions/);
  assert.doesNotMatch(shell,/ov-main-list-grid|ov-ann-row/);
});

test('the Overview layout keeps announcements in the top slot',()=>{
  const context=vm.createContext({});
  vm.runInContext(slice('  var LAYOUT={','  };')+'  };',context);
  assert.deepEqual(Array.from(context.LAYOUT.top),['ov-ann-card']);
  assert.ok(!context.LAYOUT.side.includes('ov-ann-card'));
});

test('announcements stay open without a fold button while other cards remain collapsible',()=>{
  function card(id){
    const classes=new Set(['uxp-collapsed']),buttons=[];
    const head={querySelector:selector=>selector==='.uxp-col-btn'?(buttons[0]||null):null,
      appendChild:button=>buttons.push(button)};
    return {id,buttons,classList:{remove:name=>classes.delete(name),add:name=>classes.add(name),contains:name=>classes.has(name)},
      querySelector:selector=>selector===':scope>.ov-card-head'?head:null};
  }
  const announcements=card('ov-ann-card'),other=card('team-card');
  const document={
    getElementById:id=>id==='panel-overview'?{querySelectorAll:()=>[announcements,other]}:null,
    createElement:()=>({attributes:{},setAttribute(name,value){this.attributes[name]=value;}})
  };
  const localStorage={getItem:key=>{
    assert.equal(key,'uxp_collapsed');
    return JSON.stringify({'ov-ann-card':1,'team-card':1});
  }};
  const context=vm.createContext({document,localStorage});
  vm.runInContext(slice("  var COLKEY='uxp_collapsed';",'  function decorate(){')+
    slice('  function decorate(){','  var pend=false;'),context);
  context.decorate();
  assert.equal(announcements.buttons.length,0);
  assert.equal(announcements.classList.contains('uxp-collapsed'),false);
  assert.equal(other.buttons.length,1);
  assert.equal(other.buttons[0].className,'uxp-col-btn');
  assert.equal(other.buttons[0].attributes['aria-expanded'],'false');
  context.decorate();
  assert.equal(announcements.buttons.length,0,'later decoration still skips announcements');
  assert.equal(announcements.classList.contains('uxp-collapsed'),false);
  assert.equal(other.buttons.length,1,'later decoration does not duplicate fold buttons');
});

class Card{constructor(id){this.id=id;this.parentNode=null;}
  get previousElementSibling(){const k=this.parentNode.kids,i=k.indexOf(this);return i>0?k[i-1]:null;}
  get nextSibling(){const k=this.parentNode.kids;return k[k.indexOf(this)+1]||null;}}
class Column{constructor(){this.kids=[];this.moves=0;}
  get firstElementChild(){return this.kids[0]||null;}
  get firstChild(){return this.kids[0]||null;}
  insertBefore(el,ref){this.moves++;if(el.parentNode){const k=el.parentNode.kids;k.splice(k.indexOf(el),1);}
    const i=ref?this.kids.indexOf(ref):-1;this.kids.splice(i<0?this.kids.length:i,0,el);el.parentNode=this;}
  add(...cards){cards.forEach(c=>{c.parentNode=this;this.kids.push(c);});}}
function placer(cards){
  const byId=Object.fromEntries(cards.map(c=>[c.id,c]));
  const context=vm.createContext({document:{getElementById:id=>byId[id]||null}});
  vm.runInContext(slice('  function ovPlace(container,ids){','  function ovLayout(){')+'\nthis.ovPlace=ovPlace;',context);
  return context.ovPlace;
}

test('layout moves only the cards that are out of place',()=>{
  const [team,cd,rc,ann]=['team-card','ov-cd-card','ov-rc-card','ov-ann-card'].map(id=>new Card(id));
  const side=new Column();side.add(rc,team,cd,ann);
  const place=placer([team,cd,rc,ann]);
  place(side,['team-card','ov-cd-card','ov-rc-card','ov-ann-card']);
  assert.deepEqual(side.kids.map(c=>c.id),['team-card','ov-cd-card','ov-rc-card','ov-ann-card']);
  assert.equal(side.moves,2,'only team and countdown move; the Request Centre and announcements stay');
  side.moves=0;
  place(side,['team-card','ov-cd-card','ov-rc-card','ov-ann-card']);
  assert.equal(side.moves,0,'an ordered column is left alone');
});

test('layout brings a card over from another column and skips cards that do not exist yet',()=>{
  const menu=new Card('ov-menu-card'),res=new Card('ov-res-card'),act=new Card('ov-act-card');
  const side=new Column(),more=new Column();side.add(menu);more.add(act,res);
  const place=placer([menu,res,act]);
  place(more,['ov-res-card','ov-brand-card','ov-menu-card','ov-act-card']);
  assert.deepEqual(more.kids.map(c=>c.id),['ov-res-card','ov-menu-card','ov-act-card']);
  assert.equal(side.kids.length,0);
});

test('the Overview watermark card shows only deletions due within three days',()=>{
  const nodes={'ov-watermark':{innerHTML:''},'ov-wm-card':{hidden:false}};
  let tasks=[];
  const days={'2026-10-26':2,'2026-11-10':17,'2026-10-20':-4};
  const context=vm.createContext({document:{getElementById:id=>nodes[id]||null},
    tOf:()=>tasks,dU:d=>days[d],esc:s=>s,fdt:s=>s,topicOf:t=>t.topic,
    MarcomUI:{setHTML:(el,html)=>{el.innerHTML=html;}}});
  vm.runInContext(slice('  function renderWM(){','  /* ---------- department resources ---------- */')+'\nthis.renderWM=renderWM;',context);
  tasks=[{topic:'Later',mdWatermark:'2026-11-10'}];
  context.renderWM();
  assert.equal(nodes['ov-wm-card'].hidden,true);
  tasks=[{topic:'Soon',mdWatermark:'2026-10-26'},{topic:'Late',mdWatermark:'2026-10-20'},{topic:'Later',mdWatermark:'2026-11-10'}];
  context.renderWM();
  assert.equal(nodes['ov-wm-card'].hidden,false);
  assert.match(nodes['ov-watermark'].innerHTML,/Soon/);
  assert.match(nodes['ov-watermark'].innerHTML,/Late/);
  assert.doesNotMatch(nodes['ov-watermark'].innerHTML,/Later/);
});

test('app feedback moved to Settings and keeps its styles there',()=>{
  const trq=slice('<script id="trq-script">','</script>');
  assert.match(trq,/querySelector\('#settings-modal \.modal-body'\)/);
  assert.match(trq,/Suggest an app improvement/);
  const style=slice('<style id="trq-style">','</style>');
  assert.doesNotMatch(style,/(^|[^(,])#panel-overview /m,'every Team Requests rule also applies in Settings');
});

/* ===== Step 26: one quiet status strip ===== */
const css26=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
/* A minimal DOM: enough for the real lunch placement code to run unchanged. */
function stripDom(withStrip){
  const nodes=[];
  const mk=(id,cls)=>{const n={id:id||'',className:cls||'',kids:[],parent:null,
    get parentNode(){return this.parent;},
    appendChild(c){if(c.parent)c.parent.kids=c.parent.kids.filter(k=>k!==c);this.kids.push(c);c.parent=this;return c;},
    insertAdjacentElement(where,c){c.parent=this.parent;this.parent.kids.splice(this.parent.kids.indexOf(this)+1,0,c);return c;},
    querySelector(){return {addEventListener(){}};}};nodes.push(n);return n;};
  const body=mk('body'),hdr=mk('','app-header');body.appendChild(hdr);
  let strip=null;
  if(withStrip){const dock=mk('uxp-salary-dock','salary-dock');body.appendChild(dock);strip=mk('','uxp-sal-bar');dock.appendChild(strip);}
  const document={body,createElement:()=>mk(),
    getElementById:id=>nodes.find(n=>n.id===id&&n.parent)||null,
    querySelector:sel=>sel==='.uxp-sal-bar'?strip:sel==='.app-header'?hdr:null};
  return {document,strip,hdr,body,mk};
}
const ensureBanner=slice('  function ensureBanner(){','    return banner;\n  }')+'    return banner;\n  }';
const adoptLunch=slice('    /* Adopt the lunch notice','    dock.appendChild(bar);');

test('lunch joins the payday line when the payday line is built first',()=>{
  const dom=stripDom(true);
  const context=vm.createContext({document:dom.document,banner:null,localStorage:{},cfg:{},DISMISS_KEY:'k',todayKey:()=>'t'});
  vm.runInContext(ensureBanner+';ensureBanner();',context);
  const lunch=dom.document.getElementById('lunch-banner');
  assert.equal(lunch.parent,dom.strip,'lunch sits inside the strip, not in a band after the header');
});

test('the payday line adopts lunch when lunch is built first, so order never matters',()=>{
  const dom=stripDom(false);
  const context=vm.createContext({document:dom.document,banner:null,localStorage:{},cfg:{},DISMISS_KEY:'k',todayKey:()=>'t'});
  vm.runInContext(ensureBanner+';ensureBanner();',context);
  const lunch=dom.document.getElementById('lunch-banner');
  assert.equal(lunch.parent,dom.body,'with no strip yet, lunch falls back to its old place');
  const bar=dom.mk('','uxp-sal-bar');
  vm.runInContext(adoptLunch,vm.createContext({document:dom.document,bar}));
  assert.equal(lunch.parent,bar,'once the strip exists, lunch moves into it');
});

test('the strip is plain text in both themes, with iPhone-sized tap targets',()=>{
  const step=css26.slice(css26.indexOf('/* Step 26:'));
  assert.ok(step.length>0,'the step 26 styles exist');
  assert.match(step,/#lunch-banner\{background:none;/,'no lunch band in light mode');
  assert.match(step,/html\.dark #lunch-banner\{background:none;/,'no lunch band in dark mode');
  assert.match(step,/\.uxp-sal-toggle\{[^}]*min-height:44px/,'the payday toggle is at least 44px tall');
  assert.match(step,/#lunch-banner \.lb-close\{[^}]*width:44px;height:44px/,'dismissing lunch is a 44px target');
  assert.match(step,/#lunch-banner \.lb-ico i\{display:none;\}/,'lunch does not rely on the icon font');
});

/* ===== Step 27: one greeting on a member tab ===== */
const step27=css26.slice(css26.indexOf('/* Step 27:'));
const renderMeeting=slice('function renderMeeting(who){','function renderAllMeetings(){');
function meetingCard(list){
  const classes=new Set(['meet-card','none']);
  const card={classList:{toggle:(c,on)=>{on?classes.add(c):classes.delete(c);}},
    querySelector:()=>({set textContent(v){},set innerHTML(v){}})};
  const context=vm.createContext({document:{getElementById:()=>card},gcalData:{boss:{list}},
    curTab:()=>'boss',escHtml:s=>String(s),Date});
  vm.runInContext(renderMeeting+';renderMeeting("boss");',context);
  return classes;
}

test('an empty meetings card is hidden, and a booked meeting still shows',()=>{
  assert.ok(meetingCard([]).has('none'),'no meetings: the card is marked empty');
  const soon=new Date(Date.now()+3600000).toISOString();
  assert.ok(!meetingCard([{start:soon,title:'Open Day briefing'}]).has('none'),'a booked meeting clears the mark');
  assert.match(step27,/\.meet-card\.none\{display:none;\}/,'only the empty card is hidden');
  /* The later renderer must follow the same rule, or a real meeting could vanish. */
  const rmeet=slice('  function rmeet(who){','\n  }\n');
  assert.match(rmeet,/if\(!up\.length\)\{[\s\S]*?card\.classList\.add\('none'\)/,'empty adds the mark');
  assert.match(rmeet,/card\.classList\.remove\('none'\)/,'a meeting removes it');
});

test('a member tab greets once, and the greeting and counts share one line',()=>{
  assert.match(step27,/\.member-head-extra \.mh-greet\{display:none;\}/,'the header card drops its plain greeting');
  assert.match(source,/var title=isOwn\(w\)\?\(greet\+', '/,'the my-day greeting stays: it knows the hour and whose desk it is');
  assert.match(step27,/\.myday\{display:flex;flex-wrap:wrap;/,'greeting and chips sit on one line and wrap on iPhone');
  assert.match(step27,/\.myday-list\{flex:1 1 100%;/,'the focus list runs full width below');
});

test('in light mode the two cards read as one, keeping the member colour wash',()=>{
  const head=step27.match(/html:not\(\.dark\) \.member-head\{([^}]*)\}/)[1];
  const day=step27.match(/html:not\(\.dark\) \.myday\{([^}]*)\}/)[1];
  assert.match(head,/border-radius:16px 16px 0 0!important/,'rounded on top only');
  assert.match(day,/border-radius:0 0 16px 16px!important/,'rounded on the bottom only');
  assert.match(head,/margin-bottom:0!important/,'no gap between them');
  assert.doesNotMatch(head,/background/,'the 12% wash of the member colour is kept, it says whose desk this is');
});

/* ===== Step 28: one card language ===== */
const step28=css26.slice(css26.indexOf('/* Step 28:'));

test('in light mode every card shares one calm shadow, and raised things keep their lift',()=>{
  const tokens=step28.match(/html:not\(\.dark\)\{--shadow:([^;]+);--shadow-hover:([^;]+);\}/);
  assert.ok(tokens,'the light shadow tokens are set');
  assert.doesNotMatch(tokens[1],/12px 30px/,'the floating card shadow is gone');
  assert.equal(tokens[1],'0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.05)','cards use the calm design-refresh shadow');
  assert.match(step28,/:is\(\.task-card,\.evc-card,\.rq-card\):hover[^{]*\{box-shadow:var\(--shadow-hover\)!important;\}/,'hover still deepens as a card lifts');
  assert.match(step28,/\.ov-search-results\{box-shadow:var\(--shadow-lg\);\}/,'search results still float above the page');
});

test('cards share one radius, decorative rails go and meaningful rails stay',()=>{
  assert.match(step28,/\.task-card,#panel-overview \.ov-more\{border-radius:var\(--r-lg,16px\)!important;\}/);
  assert.match(step28,/\.evhub\{border-left-width:1px!important;/,'Event Hub loses its decorative rail');
  assert.match(step28,/\.ov-ann-item:not\(\.pinned\)\{border-left:1px solid var\(--border\);\}/,'plain announcements lose theirs');
  assert.doesNotMatch(step28,/\.ov-ann-item\.pinned\{[^}]*border-left/,'a pinned announcement keeps its rail: only pinned items have one');
  assert.doesNotMatch(step28,/\.task-card[^{]*\{[^}]*border-left/,'task status rails are untouched');
});

test('Team Announcements reads like every other card',()=>{
  const head=step28.match(/#panel-overview \.ov-ann>\.ov-card-head\{([^}]*)\}/)[1];
  assert.match(head,/background:none/,'no navy band');
  assert.match(head,/border-bottom:0/,'no gold rule');
  assert.match(head,/margin:0 0 12px/,'the same spacing as the other card heads');
  assert.match(step28,/\.ov-ann>\.ov-card-head \.ov-card-title\{color:var\(--text\);font-size:14px;font-weight:700;/);
});

test('event chips have room for their names, and phones keep two columns',()=>{
  assert.match(step28,/@media\(min-width:481px\)\{\.ev-grid\{grid-template-columns:repeat\(auto-fill,minmax\(176px,1fr\)\);\}\}/);
  assert.match(source,/@media\(max-width:480px\)\{\.ev-grid\{grid-template-columns:repeat\(2,1fr\);\}\}/,'the phone grid is unchanged');
});

/* ===== Step 29: quiet the triage tiles, and let zero be quiet ===== */
const step29=css26.slice(css26.indexOf('/* Step 29:'));
const tileFn=slice('    function tile(icon,n,label,cls,sub,subCls,action,aria){','\n    var meetSub=');

test('a tile at zero is marked to read quietly, and the tile keeps working',()=>{
  const context=vm.createContext({esc:s=>String(s)});
  vm.runInContext(tileFn,context);
  const zero=context.tile('ti-x',0,'Overdue','ov-s-red','All clear','ov-sub-up','overdue','0 overdue tasks. Show them.');
  const four=context.tile('ti-x',4,'Overdue','ov-s-red','Oldest is 1d overdue','ov-sub-bad','overdue','4 overdue tasks. Show them.');
  assert.match(zero,/class="ov-stat ov-s-red is-zero"/,'0 overdue reads quietly: it is good news');
  assert.match(four,/class="ov-stat ov-s-red"/,'4 overdue keeps its red');
  for(const html of [zero,four]){
    assert.match(html,/role="button" tabindex="0" data-action="overdue"/,'still a focusable button with its action');
  }
  assert.match(zero,/aria-label="0 overdue tasks\. Show them\."/,'screen-reader text is unchanged');
});

test('colour stays only where it means something, and a zero overrides it',()=>{
  assert.match(step29,/:is\(\.ov-s-navy,\.ov-s-blue,\.ov-s-purple\)::before\{background:transparent;\}/,'neutral tiles lose their bars');
  assert.match(step29,/\.ov-s-gold:not\(\.is-zero\) \.ov-stat-num\{color:#8a5b00;\}/,'due today reads in amber ink');
  assert.match(step29,/\.ov-stat\.is-zero::before\{background:transparent;\}/);
  assert.match(step29,/\.ov-stat\.is-zero \.ov-stat-num\{color:var\(--muted\);\}/);
  assert.doesNotMatch(step29,/\.ov-s-red[^{]*\{/,'overdue keeps its red bar and number whenever it is not zero');
});

/* ===== Step 30: one status and member palette with the Team Board ===== */
const step30=css26.slice(css26.indexOf('/* Step 30:'));
const boardCss=readFileSync(new URL('../assets/team-board.css',import.meta.url),'utf8');
const boardJs=readFileSync(new URL('../netlify/functions/team-board.js',import.meta.url),'utf8');
const hex=(css,name)=>{const m=css.match(new RegExp('--'+name+':(#[0-9a-fA-F]{6})'));assert.ok(m,'--'+name+' is defined');return m[1].toLowerCase();};
function contrast(a,b){
  const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);
    return .2126*c[0]+.7152*c[1]+.0722*c[2];};
  const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+.05)/(y+.05);
}
const PAIRS=[['pending','pending'],['progress','in-progress'],['waiting','waiting'],['hold','on-hold']];

test('the workspace and the Team Board cannot drift apart on status colours',()=>{
  for(const [app,board] of PAIRS){
    assert.equal(hex(step30,'st-'+app),hex(boardCss,'s-'+board),app+' accent matches the board');
    assert.equal(hex(step30,'st-'+app+'-ink'),hex(boardCss,'s-'+board+'-fg'),app+' ink matches the board');
  }
});

test('status is written in ink, which reads on white and on its own tint',()=>{
  for(const [app,board] of PAIRS){
    const ink=hex(step30,'st-'+app+'-ink');
    assert.ok(contrast(ink,'#ffffff')>=4.5,app+' ink on white: '+contrast(ink,'#ffffff').toFixed(2));
    assert.ok(contrast(ink,hex(boardCss,'s-'+board+'-bg'))>=4.5,app+' ink on its tint');
  }
  assert.match(step30,/\.kb-col\[data-status\] \.kb-col-name\{color:var\(--c-ink,var\(--c\)\);\}/,'column names use the ink');
  assert.match(step30,/\.evc-cd\.u-amber,html:not\(\.dark\) \.rq-due\.soon\{color:var\(--st-waiting-ink\);\}/);
  assert.match(step30,/\.trq-status\.s-progress\{color:var\(--st-progress-ink\);\}/);
});

test('each member is the same colour in the workspace tabs and on the Team Board',()=>{
  for(const [ws,colour] of [['boss','#003057'],['dew','#A65614'],['o','#C2410C'],['junior','#14532D']]){
    assert.match(source,new RegExp('html:not\\(\\.dark\\) \\.tab-btn\\.a-'+ws+'\\{color:'+colour),ws+' tab label');
    assert.match(boardJs,new RegExp(ws+':\\s*\\[\''+colour+'\''),ws+' on the board');
    assert.match(boardCss,new RegExp('\\.m-'+ws+'\\{--mc:'+colour),ws+' name tag on the board');
  }
});

/* ===== Step 31: the last light-mode readability failures ===== */
const step31=css26.slice(css26.indexOf('/* Step 31:'));

test('finished work recedes by colour, not by fading everything inside it',()=>{
  const rule=step31.match(/html:not\(\.dark\) \.task-card:is\(\.tc-done,\.tc-canceled\)\{([^}]*)\}/);
  assert.ok(rule,'done and canceled cards have their own rule');
  assert.match(rule[1],/opacity:1/,'fully opaque, so nothing inside drops below AA');
  const surface=rule[1].match(/background-color:(#[0-9a-f]{6})/)[1];
  /* The colours that failed only because of the fade, at full opacity. */
  assert.ok(contrast('#55637a',surface)>=4.5,'struck topic on the finished-card surface');
  assert.ok(contrast('#8f5e0e','#fbf0dc')>=4.5,'the "Medium" badge');
  assert.ok(contrast('#55637a','#eef1f5')>=4.5,'the "Details" button');
  assert.ok(contrast('#92400e','#fdf3d6')>=4.5,'a dated badge on Dew\'s tab');
  assert.ok(contrast('#2563a8','#e7f0fa')>=4.5,'a role button on O\'s tab');
});

test('kanban counts are written in ink, and body text is at least 13px',()=>{
  assert.match(step31,/\.kb-col\[data-status\] \.kb-col-count\{color:var\(--c-ink,var\(--c\)\)!important;\}/,'counts use the ink, like the column names');
  for(const [app] of PAIRS){
    assert.ok(contrast(hex(step30,'st-'+app+'-ink'),'#ffffff')>=4.5,app+' count on white');
  }
  assert.match(step31,/#team-card \.team-note\{font-size:13px;\}/,'the Overview team note is no longer 11.5px');
});
