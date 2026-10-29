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
  assert.ok(order(['ov-dl-card'],main));
  assert.doesNotMatch(main,/id="ov-cal-card"/,'the Master Calendar moved to the side column (step 51)');
  assert.ok(order(['ov-wm-card','ov-cd-card','ov-cal-card'],side));
  assert.doesNotMatch(side,/team-card/,'Team today left the side column for the strip above the work');
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
  const announcements=card('ov-ann-card'),other=card('ov-cd-card');
  const document={
    getElementById:id=>id==='panel-overview'?{querySelectorAll:()=>[announcements,other]}:null,
    createElement:()=>({attributes:{},setAttribute(name,value){this.attributes[name]=value;}})
  };
  const localStorage={getItem:key=>{
    assert.equal(key,'uxp_collapsed');
    return JSON.stringify({'ov-ann-card':1,'ov-cd-card':1});
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
  const [wm,cd,rc,ann]=['ov-wm-card','ov-cd-card','ov-rc-card','ov-ann-card'].map(id=>new Card(id));
  const side=new Column();side.add(rc,wm,cd,ann);
  const place=placer([wm,cd,rc,ann]);
  place(side,['ov-wm-card','ov-cd-card','ov-rc-card','ov-ann-card']);
  assert.deepEqual(side.kids.map(c=>c.id),['ov-wm-card','ov-cd-card','ov-rc-card','ov-ann-card']);
  assert.equal(side.moves,2,'only the watermark and countdown cards move; the Request Centre and announcements stay');
  side.moves=0;
  place(side,['ov-wm-card','ov-cd-card','ov-rc-card','ov-ann-card']);
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
    fmtDue:d=>days[d]<0?'Overdue':days[d]+' days left',tOf:()=>tasks,dU:d=>days[d],esc:s=>s,fdt:s=>s,topicOf:t=>t.topic,
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
/* One step's own styles: from its marker to the next step's, so a later step's
   rules can never trip an earlier step's checks. */
function stepBlock(n){
  const a=css26.indexOf('/* Step '+n+':');assert.ok(a>=0,'the step '+n+' styles exist');
  /* A marker is "/* Step N:"; comments that merely mention a step do not end it. */
  const b=css26.slice(a+1).search(/\/\* Step \d+:/);return css26.slice(a,b<0?undefined:a+1+b);
}
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
  const step=stepBlock(26);
  assert.ok(step.length>0,'the step 26 styles exist');
  assert.match(step,/#lunch-banner\{background:none;/,'no lunch band in light mode');
  assert.match(step,/html\.dark #lunch-banner\{background:none;/,'no lunch band in dark mode');
  assert.match(step,/\.uxp-sal-toggle\{[^}]*min-height:44px/,'the payday toggle is at least 44px tall');
  assert.match(step,/#lunch-banner \.lb-close\{[^}]*width:44px;height:44px/,'dismissing lunch is a 44px target');
  assert.match(step,/#lunch-banner \.lb-ico i\{display:none;\}/,'lunch does not rely on the icon font');
});

/* ===== Step 27: one greeting on a member tab ===== */
const step27=stepBlock(27);
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
  assert.match(source,/var title=isOwn\(w\)\?'Today':/,'since step 64 the Overview greets, and my day on your own tab is "Today"');
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
const step28=stepBlock(28);

test('in light mode every card shares one calm shadow, and raised things keep their lift',()=>{
  const tokens=step28.match(/html:not\(\.dark\)\{--shadow:([^;]+);--shadow-hover:([^;]+);\}/);
  assert.ok(tokens,'the light shadow tokens are set');
  assert.doesNotMatch(tokens[1],/12px 30px/,'the floating card shadow is gone');
  assert.equal(tokens[1],'0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.05)','cards use the calm design-refresh shadow');
  assert.match(step28,/:is\(\.task-card,\.evc-card,\.rq-card\):hover[^{]*\{box-shadow:var\(--shadow-hover\)!important;\}/,'hover still deepens as a card lifts');
  /* The Overview's search results floated above the page here; that box went in step 48. */
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

/* ===== Step 29 (the triage tiles) was undone by Step 37: the tiles are gone. ===== */
test('the triage tiles and their styles are gone',()=>{
  assert.doesNotMatch(source,/function tile\(icon,n,label/);
  assert.doesNotMatch(css26,/\/\* Step 29:/);
  assert.doesNotMatch(source+css26,/\.ov-stat\b|ov-s-(?:red|gold|navy|blue|purple|green)\b/);
});

/* ===== Step 30: one status and member palette with the Team Board ===== */
const step30=stepBlock(30);
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
const step31=stepBlock(31);

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
});

/* ===== Step 32: flatten the nested cards ===== */
const step32=stepBlock(32);

test('boxes inside a card become rows separated by hairlines',()=>{
  /* The countdown rows follow their list wherever it sits (step 51: inside the Event Board). */
  const rows=step32.match(/html:not\(\.dark\) #ov-dl-card \.ov-dl,\s*html:not\(\.dark\) #evb-card \.evb-g,\s*html:not\(\.dark\) \.ov-countdown \.ov-cdn\{([^}]*)\}/);
  assert.ok(rows,'Upcoming Deadlines, Event Board and countdown rows share one rule');
  for(const want of [/border:0!important/,/border-radius:0!important/,/box-shadow:none!important/,/border-top:1px solid var\(--border\)!important/])
    assert.match(rows[1],want);
  assert.match(step32,/\.ov-cdn:first-of-type\{border-top-color:transparent!important;\}/,'no hairline above the first row');
  assert.match(step32,/#ov-cal-card \.ov-cal-detail\{border:0!important;border-radius:0!important;/,'the day agenda is a section, not a card');
});

test('what carries meaning survives the flattening',()=>{
  /* A chip with its own text colour keeps its fill (step 44), so only plain chips flatten. */
  const chip=step32.match(/\.evhub \.ev-chip:not\(\.ev-chip-filled\)\{([^}]*)\}/)[1];
  assert.doesNotMatch(chip,/border-top/,'an event chip keeps its urgency rule');
  assert.doesNotMatch(chip,/border:0/,'only the side and bottom edges go');
  const dirq=step32.match(/\.task-card \.dirq\{([^}]*)\}/)[1];
  assert.doesNotMatch(dirq,/border-left/,'a Director request keeps its amber rail');
  assert.doesNotMatch(dirq,/background/,'and its amber tint');
  assert.match(step32,/\.ov-ann-item\.pinned\{background:var\(--gold-light\);border-left:3px solid var\(--gold2\)!important;/,'a pinned announcement keeps its gold');
});

/* ===== Step 33: the floating buttons stop covering content ===== */
const step33=stepBlock(33);
/* A fixed element's resting place, read from index.html where it is defined. */
function px(sel,prop){
  const rule=source.match(new RegExp(sel.replace(/\./g,'\\.')+'\\{position:fixed;[^}]*\\}'));
  assert.ok(rule,sel+' is defined in index.html');
  const m=rule[0].match(new RegExp('[;{]'+prop+':(\\d+)px'));
  assert.ok(m,sel+' has a '+prop);return +m[1];
}

test('every tab ends with room to scroll its last item clear of the floating buttons',()=>{
  assert.match(step33,/:root\{--dock-h:0px;--float-lift:calc\(var\(--dock-h\) \+ env\(safe-area-inset-bottom,0px\)\);\}/,'one lift for the dock and the home bar, zero by default');
  const pad=+step33.match(/\.tab-panel\{padding-bottom:calc\((\d+)px \+ var\(--float-lift\)\);\}/)[1];
  /* Quick Add is the top of the stack; Team Chat sits below it. */
  const stackTop=px('.quickadd-fab','bottom')+px('.quickadd-fab','height');
  assert.ok(px('.chat-fab','bottom')+px('.chat-fab','height')<stackTop,'Team Chat sits below Quick Add');
  assert.ok(pad>stackTop,'the panel ends '+pad+'px up, clear of the '+stackTop+'px stack');
  /* Each panel is also the page container; this replaces its old bottom padding. */
  assert.match(source,/class="container tab-panel active" id="panel-boss"/);
  assert.ok(css26.indexOf('.tab-panel{padding-bottom')>css26.indexOf('.container{max-width:100%;padding:14px 12px 48px;}'),'the phone padding cannot win back');
});

test('everything that floats lifts by the same amount, and rests where it always did',()=>{
  assert.match(step33,/\.chat-fab,#uxp-toasts,\.chat-panel\{bottom:calc\(22px \+ var\(--float-lift\)\);\}/);
  assert.match(step33,/\.quickadd-fab\{bottom:calc\(88px \+ var\(--float-lift\)\);\}/);
  assert.match(step33,/\.chat-panel\{max-height:calc\(100vh - 90px - var\(--float-lift\)\);\}/,'an open chat still fits the screen');
  for(const [sel,at] of [['.chat-fab',22],['.quickadd-fab',88],['.chat-panel',22],['#uxp-toasts',22]])
    assert.equal(px(sel,'bottom'),at,sel+' rests at '+at+'px with no dock');
});

/* ===== Step 36: opening the app shows one calm screen ===== */
test('the start-up cover is the first thing drawn, styled from the head', () => {
  const head = source.slice(0, source.indexOf('</head>'));
  assert.match(head, /<style id="boot-cover-style">[\s\S]*\.boot-cover\{position:fixed;inset:0;z-index:10000;/, 'its styles apply from the first paint');
  assert.match(head, /\.boot-cover\.done\{opacity:0;visibility:hidden;pointer-events:none;\}/);
  assert.match(head, /@media\(prefers-reduced-motion:reduce\)\{\.boot-cover\{transition:none;\}/);
  const body = source.slice(source.indexOf('<body>'));
  assert.ok(body.startsWith('<body>\n<div class="boot-cover" id="boot-cover" role="status">'), 'the cover is the first element in the page');
  assert.ok(body.indexOf('boot-cover') < body.indexOf('class="app-header"'));
  assert.match(body, /Opening your workspace/);
  assert.match(body, /\(request\|rc\)\(=\|&\|\$\)\/\.test\(location\.search\+location\.hash\)\)\{var c=document\.getElementById\('boot-cover'\);if\(c\)c\.parentNode\.removeChild\(c\);/,
    'the staff Request Centre page never shows it');
});

/* The real sign-in script, run against a fake page, a fake Firebase and fake timers. */
function signInRun({ sdk = true, rcMode = false } = {}) {
  const registry = [], timers = [];
  let authCallback = null;
  function element(tag) {
    const classes = new Set(), attrs = {};
    const e = {
      tag, id: '', className: '', innerHTML: '', parentNode: null, children: [],
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
      setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return attrs[k]; },
      appendChild(c) { c.parentNode = e; e.children.push(c); return c; },
      insertBefore(c) { return e.appendChild(c); },
      removeChild(c) { e.children = e.children.filter(x => x !== c); c.parentNode = null; return c; },
      querySelector() { return null; },
    };
    registry.push(e);
    return e;
  }
  const body = element('body');
  const cover = element('div'); cover.id = 'boot-cover'; body.appendChild(cover);
  const document = {
    body, readyState: 'complete',
    createElement: element,
    getElementById: id => registry.find(e => e.id === id && (e === body || e.parentNode)) || null,
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  };
  const firebase = !sdk ? undefined : {
    auth: () => ({ onAuthStateChanged(fn) { authCallback = fn; }, setPersistence: () => Promise.resolve(), signOut: () => Promise.resolve() }),
    firestore: () => ({ collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ role: 'admin' }) }) }) }) }),
  };
  const sandbox = {
    document, firebase, console: { warn() {}, error() {} },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    Event: function (type) { this.type = type; }, dispatchEvent() {}, addEventListener() {},
    __rcMode: rcMode,
  };
  sandbox.window = sandbox;
  const start = source.indexOf('(function(){\n  if(window.__authInit)return;');
  const endMark = "  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot); else boot();\n})();";
  const end = source.indexOf(endMark, start);
  assert.ok(start > 0 && end > start, 'the sign-in script is in the page');
  vm.runInContext(source.slice(start, end + endMark.length), vm.createContext(sandbox));
  const gate = () => document.getElementById('auth-gate');
  return {
    sandbox, body, cover,
    coverUp: () => !cover.classList.contains('done'),
    gateShown: () => !!(gate() && gate().classList.contains('show')),
    signIn: user => authCallback(user),
    runTimersUpTo: ms => timers.filter(t => t.ms <= ms).forEach(t => t.fn()),
  };
}

test('a signed-in person goes from the cover straight to the workspace, never past the sign-in form', async () => {
  const run = signInRun();
  assert.ok(run.coverUp(), 'the cover stays up while the session is checked');
  assert.equal(run.gateShown(), false, 'and the sign-in form is not shown behind it');
  assert.ok(run.body.classList.contains('auth-locked'), 'the page cannot scroll meanwhile');
  run.signIn({ email: 'boss@example.test' });
  assert.ok(run.coverUp(), 'still covered while the access list is read');
  await new Promise(r => setImmediate(r));
  assert.equal(run.coverUp(), false, 'the workspace is set, so the cover lifts');
  assert.equal(run.gateShown(), false);
  assert.equal(run.body.classList.contains('auth-locked'), false);
  assert.equal(run.sandbox.__cur.email, 'boss@example.test');
});

test('a signed-out person gets the sign-in form; a stalled check falls back to it after 8 seconds', () => {
  const out = signInRun();
  out.signIn(null);
  assert.ok(out.gateShown());
  assert.equal(out.coverUp(), false, 'the form replaces the cover');

  const stalled = signInRun();
  stalled.runTimersUpTo(7999);
  assert.ok(stalled.coverUp(), 'nothing gives way before 8 seconds');
  stalled.runTimersUpTo(8000);
  assert.ok(stalled.gateShown(), 'after 8 seconds the form appears, as it used to at once');
  assert.equal(stalled.coverUp(), false, 'so the cover can never trap anyone');
});

test('without the sign-in service, or on the Request Centre page, the cover lifts at once', () => {
  const noSdk = signInRun({ sdk: false });
  assert.equal(noSdk.coverUp(), false);
  const rc = signInRun({ rcMode: true });
  assert.equal(rc.coverUp(), false);
  rc.signIn(null);
  assert.equal(rc.gateShown(), false, 'the Request Centre never shows the sign-in form');
});

/* ===== Step 37: the Overview's first screen puts the work first ===== */
const step37=stepBlock(37);
const rule=(css,sel)=>{const i=css.indexOf(sel+'{');assert.ok(i>=0,sel+' has a rule');return css.slice(i+sel.length+1,css.indexOf('}',i));};
const media=(css,q)=>{const i=css.indexOf('@media('+q+'){');assert.ok(i>=0,q+' block exists');
  let depth=0,j=css.indexOf('{',i);for(;j<css.length;j++){if(css[j]==='{')depth++;else if(css[j]==='}'&&--depth===0)break;}return css.slice(i,j+1);};

test('the Overview opens on the work: one announcement line, the greeting and search, Team today, then the work list',()=>{
  const at=['id="ov-ann-card"','class="ov-topbar"','id="ov-team"','class="ov-grid"','id="ov-dl-card"'].map(s=>shell.indexOf(s));
  at.forEach((n,i)=>assert.ok(n>0&&(i===0||n>at[i-1]),'out of order at '+i));
  assert.doesNotMatch(shell,/ov-stats|ov-stat\b/,'the five number tiles are gone');
  const render=slice('  function renderOverview(){','\n  }\n');
  assert.match(render,/renderTeam\(\);/);
  assert.doesNotMatch(source,/function renderStats\(/);
  const context=vm.createContext({});
  vm.runInContext(slice('  var LAYOUT={','  };')+'  };',context);
  assert.deepEqual(Array.from(context.LAYOUT.side),['ov-rc-card','ov-wm-card','ov-cd-card','ov-cal-card'],'step 51: the calendar joins the side column');
  assert.deepEqual(Array.from(context.LAYOUT.main),['ov-dl-card','evb-card']);
});

test('the announcement line holds one item on one row, and its text opens the rest',()=>{
  assert.match(rule(step37,'#ov-ann-card:not(.ov-ann-all)'),/display:grid;grid-template-columns:auto minmax\(0,1fr\) auto;/);
  const text=rule(step37,'html #panel-overview #ov-ann-card:not(.ov-ann-all) .ov-ann-text');
  for(const want of [/white-space:nowrap/,/overflow:hidden/,/text-overflow:ellipsis/,/min-width:0/])assert.match(text,want);
  const open=rule(step37,'#ov-ann-card .ov-ann-open');
  assert.match(open,/background:none/);assert.match(open,/text-align:left/);assert.match(open,/cursor:pointer/);
  assert.doesNotMatch(open,/font:inherit|color:inherit/,'it keeps the announcement type size and colour');
  assert.match(step37,/#ov-ann-card \.ov-ann-open:focus-visible\{outline:2px solid var\(--focus-ink\)/);
  assert.match(shell,/<div class="ov-ann-list" id="ov-ann-list" tabindex="-1"><\/div>/,'focus can move to the opened list');
});

test('Team today is a strip of four people on a computer, two per row on an iPad and a phone',()=>{
  assert.match(rule(step37,'.ov-team-list'),/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(media(step37,'max-width:1100px'),/\.ov-team-list\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);\}/);
  const cell=rule(step37,'.tm');
  assert.match(cell,/grid-template-areas:"mono name open" "mono st st" "mono lv lv"/);
  assert.match(cell,/cursor:pointer/);
  assert.match(step37,/\.tm:focus-visible\{outline:2px solid var\(--focus-ink\)/,'each person is a visible keyboard stop');
  assert.match(rule(step37,'.tm-lv'),/font-size:13px;color:var\(--muted\)/,'sick days and lieu read quietly');
});

test('on a phone each person is one short line and the work list starts on the first screen',()=>{
  const phone=media(step37,'max-width:600px');
  assert.match(phone,/\.tm\{display:flex;align-items:flex-start;/,'the initial, then the name and flags as one line of text');
  assert.match(phone,/\.tm-top,\.tm-st\{display:inline;\}/);
  assert.doesNotMatch(phone,/\.tm-st\{[^}]*overflow:hidden/,'flags wrap under the name on a narrow phone, never cut off');
  assert.match(phone,/\.tm-open,\.tm-w,\.tm-lv\{display:none;\}/,'counts with icons; the words stay in the label');
  assert.match(phone,/\.ov-team-sum-w,\.nx-l\{display:none;\}/,'"21 open" and "14:00 Weekly sync" keep the heading to one line');
  assert.match(phone,/\.ov-team-head:has\(\.nx-btn\) \.ov-team-done\{display:none;\}/,'a next meeting takes the room of the done count');
  assert.match(phone,/\.ov-team-next\{flex:1 1 0;\}/,'and only the room left beside the title');
  assert.match(phone,/#ov-top,#ov-team\{margin-bottom:12px;\}/);
  assert.match(phone,/\.tm-s\{display:inline;\}/,'a flag without a count keeps a short word');
  assert.match(phone,/#panel-overview \.ov-hello\{display:none;\}/,'the greeting gives way to the work');
  assert.doesNotMatch(css26,/\.ov-team-note/,'the calendar setup note moved to Settings (step 64)');
  assert.doesNotMatch(phone,/\.ov-mini-btn[^{]*\{[^}]*display:none/,'refreshing availability stays on a phone');
  assert.doesNotMatch(phone,/\.ov-team-next[^{]*\{[^}]*display:none/,'so does the next meeting');
  assert.match(phone,/html #panel-overview #ov-ann-card:not\(\.ov-ann-all\) \.ov-ann-foot\{display:none;\}/,'the line keeps its text and New; tapping the text shows the rest');
  assert.match(step37,/#panel-overview \.ov-dl-filters\{overflow-x:auto;scrollbar-width:none;\}/,'the four filters stay on one line and scroll');
  assert.match(step37,/#panel-overview \.ov-dl-filters \.ov-fpill\{flex:0 0 auto;white-space:nowrap;/);
});

test('what needs attention is written in the shared status inks, which read at AA',()=>{
  const inks={over:rule(step37,'.tm-over').match(/#[0-9a-f]{6}/i)[0]};
  for(const [kind,token] of [['wait','waiting'],['hold','hold'],['out','pending'],['meet','progress']]){
    assert.match(rule(step37,'.tm-'+kind),new RegExp('color:var\\(--st-'+token+'-ink,'),kind+' uses the shared ink');
    inks[kind]=hex(step30,'st-'+token+'-ink');
  }
  for(const [kind,ink] of Object.entries(inks)){
    assert.ok(contrast(ink,'#ffffff')>=4.5,kind+' on white: '+contrast(ink,'#ffffff').toFixed(2));
  }
  assert.match(step37,/\.tm-clear,\.tm-soon\{font-weight:600;color:var\(--muted\);\}/,'nothing wrong reads quietly');
  /* The person colours carry a white initial. */
  const members=step37.match(/:root\{--member-boss:(#\w{6});--member-dew:(#\w{6});--member-o:(#\w{6});--member-junior:(#\w{6});\}/);
  assert.ok(members,'default person colours are set');
  for(const c of members.slice(1))assert.ok(contrast(c.toLowerCase(),'#ffffff')>=4.5,c+' behind a white initial');
  assert.match(source,/css\+=':root\{--member-'\+w\+':'\+ink\+';\}';/,'a saved tab colour carries into Team today');
});

/* ===== Step 38: iPhone person tabs put the work above the dock ===== */
const step38=stepBlock(38);
const myDaySource=slice('  function tmr(){var n=new Date();n.setDate','  function renderMyDay(w){');
function myDay(w,{tasks=[],hour=11,unread=[],own=false}={}){
  const TODAY='2026-10-26';
  class At extends Date{constructor(...a){if(a.length)super(...a);else super(TODAY+'T'+String(hour).padStart(2,'0')+':30:00');}}
  const window={__cur:own?{workspace:w}:{role:'admin'},__rcCounts:{unreadList:unread}};
  const context=vm.createContext({window,Date:At,tdy:()=>TODAY,esc:s=>String(s),
    memberName:x=>x[0].toUpperCase()+x.slice(1),tasksOf:()=>tasks,eventsOf:()=>[],fmtDate:d=>d,daysUntil:()=>1,
    MEMBER_ORDER:['boss','dew','o','junior'],document:{}});
  vm.runInContext(myDaySource+'\nthis.myDayHTML=myDayHTML;',context);
  return context.myDayHTML(w);
}

test('My day draws only the counts that are there, and never repeats "due today" as a focus line',()=>{
  const due={id:'a',status:'pending',topic:'Newsletter',dueDate:'2026-10-26'};
  let html=myDay('dew',{tasks:[due]});
  assert.doesNotMatch(html,/Focus:/,'the chip already says it');
  assert.doesNotMatch(html,/class="myday-sub"/,'nothing else to say before 5pm when work is due today');
  assert.match(html,/<b>1<\/b> due today/);
  assert.doesNotMatch(html,/<b>0<\/b>/,'a zero is not drawn');
  assert.doesNotMatch(html,/overdue<\/button>/);
  assert.doesNotMatch(html,/new request/);
  html=myDay('dew',{tasks:[],hour:9});
  assert.doesNotMatch(html,/myday-chips/,'no counts, no row of chips');
  assert.doesNotMatch(html,/Here is the plan for today|class="myday-sub"/,'no filler line before 5pm (step 64)');
  assert.match(html,/All clear for now/);
  html=myDay('dew',{tasks:[due],hour:18});
  assert.match(html,/Tomorrow is clear so far|due tomorrow/,'after 5pm the line still looks ahead');
  html=myDay('o',{unread:[{ws:'o'}]});
  assert.match(html,/<b>1<\/b> new request<\/button>/,'one request, singular');
  html=myDay('o',{unread:[{ws:'o'},{ws:'o'}]});
  assert.match(html,/<b>2<\/b> new requests<\/button>/);
});

test('on a phone the name bar is one row, the counters one short row, and the date gives way',()=>{
  const phone=media(step38,'max-width:600px');
  assert.match(phone,/\.member-head \.member-head-text\{flex:1 1 0;min-width:0;display:flex;align-items:baseline;/,'name and role share a line');
  assert.match(phone,/\.member-head \.member-role\{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;/,'a long role ends with an ellipsis');
  assert.match(phone,/\.member-head \.member-head-extra\{order:2;/,'the colour button ends the first row');
  assert.match(phone,/\.member-head \.member-head-extra \.mh-dt\{display:none;\}/);
  assert.match(phone,/\.member-head \.member-head-extra \.tcp-pop\{top:100%;right:0;left:auto;\}/,'the colour picker opens on screen');
  assert.match(phone,/\.member-head \.member-head-stats\{order:3;flex:1 1 100%;flex-wrap:nowrap;/);
  assert.match(media(step38,'max-width:360px'),/\.member-head \.mh-stat i\{display:none;\}/,'at 320px the counters drop their icons to stay on one line');
});

test('on a phone each today row puts its date under the name, clear of the round buttons',()=>{
  const phone=media(step38,'max-width:600px');
  assert.match(phone,/\.myday-row\{flex-wrap:wrap;align-items:flex-start;/);
  assert.match(phone,/\.myday-row \.md-sub\{flex:1 1 100%;margin-left:23px;white-space:nowrap;/,'the date sits under the name, left-aligned, in one piece');
  assert.match(phone,/\.uxp-sal-toggle\{flex-wrap:wrap;white-space:nowrap;/,'"Fri, 30 October" and "4 days left" never break in the middle');
});

test('the sub-tabs stay on one line and scroll, and Widgets never looks like a selected tab',()=>{
  const phone=media(step38,'max-width:600px');
  assert.match(phone,/\.tab-panel \.sub-nav\{flex-wrap:nowrap;overflow-x:auto;/);
  assert.match(phone,/\.tab-panel \.sub-nav \.sub-tab,\.tab-panel \.sub-nav \.uxp-drawer-btn\{flex:0 0 auto;\}/);
  /* Step 43: nothing sticks over a tab; a fade at the right edge says the row scrolls. */
  assert.doesNotMatch(phone,/uxp-drawer-btn\{[^}]*position:sticky/,'Widgets never covers Notes or Requests');
  assert.match(phone,/\.tab-panel \.sub-nav::after\{content:'';position:sticky;right:-5px;flex:0 0 32px;[^}]*pointer-events:none;/,
    'the edge fade never takes a tap');
  const tablet=media(step38,'max-width:980px');
  const btn=rule(tablet,'.sub-nav .uxp-drawer-btn');
  assert.match(btn,/order:99/,'it ends the row');
  assert.match(btn,/background:transparent/,'never the white pill of the selected tab');
  assert.match(btn,/box-shadow:none/);
  assert.match(tablet,/\.sub-nav \.uxp-drawer-btn::before\{content:'';width:1px;/,'a hairline sets it apart from the tabs');
});

/* ===== Step 39: nothing fixed covers the work; no label is cut off ===== */
const step39=stepBlock(39);
/* A tiny page: a header with the bell, and a body that can hold the chat button. */
function chatPage(phone){
  const kids=n=>n.children;
  const mk=(id,cls)=>({id,className:cls||'',children:[],parentNode:null,
    insertBefore(el,ref){if(el.parentNode)el.parentNode.children.splice(el.parentNode.children.indexOf(el),1);
      const i=ref?this.children.indexOf(ref):-1;this.children.splice(i<0?this.children.length:i,0,el);el.parentNode=this;},
    appendChild(el){this.insertBefore(el,null);}});
  const body=mk('body'),host=mk('','header-right'),bell=mk('uxp-bell'),fab=mk('tc-fab','chat-fab');
  host.appendChild(bell);body.appendChild(fab);
  const classes=new Set();body.classList={toggle:(n,on)=>on?classes.add(n):classes.delete(n)};
  const listeners=[],mq={matches:phone,addEventListener:(t,f)=>listeners.push(f)};
  const document={body,getElementById:id=>({'tc-fab':fab,'uxp-bell':bell})[id]||null,querySelector:s=>s==='.header-right'?host:null};
  const context=vm.createContext({document,window:{matchMedia:()=>mq}});
  vm.runInContext(slice('  var phoneMq=null;','  function notify(d){')+'\nthis.placeChat=placeChat;this.watchPlace=watchPlace;',context);
  context.watchPlace();context.placeChat();
  return {fab,host,body,classes,mq,flip(v){mq.matches=v;listeners.forEach(f=>f());},kids};
}

test('Team Chat sits in the header next to the bell on computers and iPads, and stays a round button on phones',()=>{
  const desk=chatPage(false);
  assert.equal(desk.fab.parentNode,desk.host);
  assert.equal(desk.host.children.indexOf(desk.fab),0,'just before the bell');
  assert.equal(desk.fab.className,'dm-toggle hdr-chat');
  assert.ok(desk.classes.has('tc-in-header'));
  desk.flip(true);
  assert.equal(desk.fab.parentNode,desk.body,'turning to phone width puts it back above the dock');
  assert.equal(desk.fab.className,'chat-fab');
  assert.ok(!desk.classes.has('tc-in-header'));
  const phone=chatPage(true);
  assert.equal(phone.fab.parentNode,phone.body);
  phone.flip(false);
  assert.equal(phone.fab.parentNode,phone.host);
  assert.match(source,/fab\.setAttribute\('aria-label','Team chat'\); fab\.setAttribute\('aria-expanded','false'\);/);
  assert.match(source,/if\(fb\)fb\.setAttribute\('aria-expanded',open\?'true':'false'\);/,'the button says whether the chat is open');
});

test('one Quick Add per screen: the header "+" on computers and iPads, the round one on phones',()=>{
  assert.match(media(step39,'min-width:601px'),/\.quickadd-fab\{display:none!important;\}/);
  assert.match(step39,/@media\(max-width:600px\)\{#hdr-add\{display:none;\}\}/);
  /* The header "+" adds to Boss's board on the Overview, as the round one did,
     never to O's ("theme-overview" starts with "theme-o"). */
  const calls=[];
  const run=cls=>{const context=vm.createContext({document:{body:{className:cls}},window:{__cur:{role:'admin',workspace:null}},
    openAdd:w=>calls.push(w),uxpMoreToggle(){},MEMBERS:{boss:1,dew:1,o:1,junior:1}});
    vm.runInContext(slice('  window.uxpQuickAdd=function(){','  /* overflow menu for small screens */'),context);
    context.window.uxpQuickAdd();return calls.pop();};
  assert.equal(run('uxp-sal-collapsed theme-overview'),'boss');
  assert.equal(run('theme-o'),'o');
  assert.equal(run('theme-dew uxp-sal-collapsed'),'dew');
});

test('opened from the header, the chat panel drops down under it',()=>{
  const desk=media(step39,'min-width:601px');
  assert.match(desk,/body\.tc-in-header \.chat-panel\{top:var\(--tc-top,96px\);bottom:auto;max-height:calc\(100vh - var\(--tc-top,96px\) - 16px\);\}/);
  assert.match(desk,/\.hdr-chat \.chat-unread\{top:2px;right:2px;/,'the unread count sits on the header button like the bell\'s');
  assert.match(source,/if\(\(window\.innerHeight\|\|0\)-top<360\)top=8;/,'on a phone held sideways it opens over the header instead');
});

/* Sidebar widget headers moved on to step 56 (whole names, summary under the name). */

/* ===== Step 40: task cards lead with the task ===== */
const step40=stepBlock(40);
function card(task,{who='dew',admin=true,soon=false,acts=false,du=-1,events=null,names=null}={}){
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const context=vm.createContext({window:{__cur:admin?{role:'admin'}:{role:'designer',workspace:who},__tcActs:acts?{[who+'_'+task.id]:true}:{}},
    SC:{pending:{l:'Pending',i:'ti-circle'},waiting:{l:'Waiting',i:'ti-clock'},done:{l:'Done',i:'ti-check'}},
    DZ_STATUSES:['Brief Received'],MEMBER_ORDER:['boss','dew','o','junior'],
    daysUntil:()=>du,isSoon:()=>soon,eventsOf:()=>events||[],evOkClr:()=>false,evTint:()=>'',isEventTask:t=>t.__src==='event',taskAssignees:t=>t.assignees||[],
    memberName:w=>(names&&names[w])||w,escHtml:esc,fmtDate:d=>d,fmtDue:()=>du===0?'Due today':du+' days left',safeUrl:u=>u,oCardExtra:()=>'',dewCardExtra:()=>'<div class="role-x">role</div>'});
  /* With events, the real colour helpers (step 63: the card draws the event's own tag). */
  if(events)vm.runInContext(slice('function evOkClr(','const EV_TEXT_COLORS'),context);
  vm.runInContext(slice('function scColors(s){','function setTaskStatus(')+slice('function moveSelectHTML(who,task){','function moveCardTo(')
    +slice('function evTagHTML(','function kanbanHTML(')+'\nthis.taskCardHTML=taskCardHTML;',context);
  return context.taskCardHTML(task,who);
}
const sample={id:'t1',topic:'Plan the open day',status:'pending',dueDate:'2026-10-25',priority:'high',eventName:'Open Day',description:'More',links:[]};

test('a task card opens with its done tick, then its name and facts',()=>{
  const html=card(sample);
  assert.match(html,/^<div class="task-card tc-pending" draggable="true" data-id="t1" onclick="taskCardClick\(event,'dew','t1'\)" ondragstart="taskDragStart\(event,'dew','t1'\)" ondragend="taskDragEnd\(event\)"><div class="task-head"><button class="task-check [^]*?<\/button><div class="task-topic [^"]*" title="Plan the open day">Plan the open day<\/div>/,
    'the tick precedes the name, and drag and drop is unchanged');
  assert.match(html,/aria-label="Mark as done"/);
  const meta=html.slice(html.indexOf('<div class="task-meta">'),html.indexOf('<div class="role-x">'));
  assert.match(meta,/^<div class="task-meta"><select class="tcard-sel" title="Task status"/,'the status leads the facts, as its menu');
  assert.ok(meta.indexOf('Overdue')<meta.indexOf('High')&&meta.indexOf('High')<meta.indexOf('Open Day'),'then due, priority, event');
});

test('the status shows once and the "close to deadline" dot is gone',()=>{
  const html=card(sample,{soon:true});
  assert.equal((html.match(/class="tcard-sel"/g)||[]).length,1);
  assert.doesNotMatch(html,/tcard-sicon|dl-dot|Close to deadline/);
  assert.doesNotMatch(source,/function statusIconHTML|class="dl-dot"/);
});

test('every action is still on the card: the tick at the top, the rest in one row at the foot',()=>{
  const html=card(sample);
  const foot=html.slice(html.indexOf('<div class="task-foot">'));
  for(const call of [/moveCardTo\('dew','t1',this\.value\)/,/uxpTaskCalendar\('dew','t1'\)/,/duplicateTask\('dew','t1'\)/,/openEdit\('dew','t1'\)/,/deleteTask\('dew','t1'\)/])assert.match(foot,call);
  assert.match(html,/toggleTaskDone\('dew','t1'\)/);
  assert.match(html,/setTaskStatus\('dew','t1',this\.value\)/);
  assert.match(html,/tcToggleDetails\(this,'dew_t1'\)/,'details still open and close');
  assert.ok(html.indexOf('tc-open-hint')<html.indexOf('task-foot'),'a Director request lands above the foot, before the hint');
  assert.match(foot,/aria-label="Duplicate this task"/);
  assert.doesNotMatch(card(sample,{admin:false}),/tcard-move/,'"Move to…" stays Boss\'s only');
});

test('inside a status column a card has no coloured rail, and a long name may take three lines',()=>{
  assert.match(step40,/\.kb-col \.task-card\{border-left-width:1px!important;border-left-color:var\(--border\)!important;\}/);
  assert.match(step40,/\.kb-col \.task-card \.task-topic\{-webkit-line-clamp:3;line-clamp:3;\}/);
  assert.match(step40,/\.task-card \.task-foot\{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid var\(--border\);\}/);
  assert.match(step40,/\.task-card \.task-meta \.mb:not\(\.mb-event\):not\(\.mb-shared\)\{padding:0;background:none;/,'facts read as text; an event keeps its coloured chip');
});

/* ===== Step 41: gold back to the brand; red only for trouble ===== */
const step41=stepBlock(41);

test('an event countdown is amber within a week, calm before that, grey when past, and never red',()=>{
  const context=vm.createContext({});
  vm.runInContext(slice('function evUrgency(ms){','\nfunction evCountLabel(')+'\nthis.evUrgency=evUrgency;',context);
  const day=86400000;
  assert.equal(context.evUrgency(-1),'grey');
  assert.equal(context.evUrgency(0.5*day),'amber');
  assert.equal(context.evUrgency(7.6*day),'amber','"7 days" on the label is amber, as on the Overview');
  assert.equal(context.evUrgency(8.1*day),'calm');
  assert.equal(context.evUrgency(40*day),'calm');
  assert.match(source,/var urg=it\.d<=7\?' soon':'';/,'the Overview countdown uses the same week');
});

test('a task due today or soon is not red; only overdue work is',()=>{
  assert.match(source,/else if\(soon\)dueLabel='<span class="mb mb-soon">/);
  assert.match(source,/if\(overdue\)dueLabel='<span class="mb mb-overdue">/);
  assert.doesNotMatch(step41,/\.mb-soon\{/,'its colour moved to step 63: plain ink with a clock, so amber means Waiting');
  assert.match(step41,/\.mh-stat-soon i,\.mh-stat-soon b\{color:var\(--st-waiting-ink,#7d5406\);\}/,'"5 Due Soon" is not red');
  assert.match(step41,/\.fpill \.pill-dot\{background:var\(--st-waiting,#a97614\);\}/);
  assert.match(source,/row\('ti-calendar-week','var\(--amber-light\)','var\(--st-waiting\)','Due this week',dueWk\)/);
  const ink=hex(step30,'st-waiting-ink');
  assert.ok(contrast(ink,'#fdf0d5')>=4.5,'amber ink on its tint: '+contrast(ink,'#fdf0d5').toFixed(2));
  assert.ok(contrast(ink,'#ffffff')>=4.5);
});

test('gold stays with the brand: payday, lunch, ADMIN and the calendar\'s events leave it',()=>{
  assert.match(step41,/\.uxp-sal-mini>span\{background:var\(--navy,#003057\);\}/);
  assert.match(step41,/#lunch-banner \.lb-ico\{background:var\(--navy,#003057\);\}/);
  assert.match(step41,/\.auth-banner-role\{background:transparent;color:rgba\(255,255,255,\.9\);box-shadow:inset 0 0 0 1px rgba\(255,255,255,\.45\);\}/,'ADMIN is a quiet outline');
  assert.match(step41,/#panel-overview \.ov-cd-ev\{background:var\(--teal,#0d9488\);\}/);
  assert.match(step41,/#panel-overview \.ov-cdn\.soon \.ov-cdn-tag\{background:var\(--amber-light\);color:var\(--st-waiting-ink,#7d5406\);\}/);
  assert.match(step41,/\.evc-cd\.u-calm\{background:var\(--navy-light\);color:var\(--navy,#003057\);\}/);
  assert.doesNotMatch(step41,/var\(--gold|#f0b323|#e6a417/i,'the step itself adds no gold');
});

/* ===== Step 42: quiet details ===== */
const step42=stepBlock(42);

test('the header no longer repeats the selected tab, and the role line no longer repeats the avatar icon',()=>{
  assert.match(step42,/\.hdr-context\{display:none!important;\}/);
  assert.match(step42,/\.member-head \.member-role i\{display:none;\}/);
});

test('headings and rows share two left edges: the page edge and one inner edge in every card',()=>{
  assert.match(step42,/#panel-overview \.ov-card\{padding-left:16px;padding-right:16px;\}/,'every Overview card writes from the same inner edge');
  assert.match(step42,/#panel-overview \.ov-more-toggle\{padding-left:16px;padding-right:16px;\}/);
  assert.match(step42,/\.myday-list\{margin-left:-8px;margin-right:-8px;\}/,'today\'s rows start under "Dew\'s day", their hover still has room');
  assert.match(media(step42,'max-width:600px'),/\.myday-list\{margin-left:-6px;margin-right:-6px;\}/);
  assert.match(media(step42,'min-width:601px'),/\.tm\{padding-left:6px;\}/,'Team today\'s initials line up with its heading');
});

test('the Event Hub fits its events: tiles share the row and a single event is one slim line',()=>{
  assert.match(media(step42,'min-width:481px'),/\.ev-grid\{grid-template-columns:repeat\(auto-fit,minmax\(176px,1fr\)\);\}/);
  const one=rule(step42,'.ev-grid>.ev-chip:only-child');
  for(const want of [/grid-column:1\/-1/,/flex-direction:row/,/align-items:center/,/min-height:0/])assert.match(one,want);
  assert.match(step42,/\.ev-grid>\.ev-chip:only-child \.ev-chip-del\{top:50%;transform:translateY\(-50%\);\}/,'its delete button stays reachable at the end of the line');
});

test('a phone on its side gets a two-row header instead of three',()=>{
  const land=media(step42,'max-height:500px) and (min-width:601px');
  assert.match(land,/\.app-header \.header-top\{flex-wrap:nowrap;/,'the brand and its controls share one row');
  assert.match(land,/\.app-header \.app-tagline\{display:none;\}/);
  assert.match(land,/\.app-header \.auth-banner-em\{display:none;\}/,'the signed-in name gives way; ADMIN and sign out stay');
  assert.match(land,/\.tab-nav \.tab-btn\{min-height:36px;/);
});

/* ===== Step 43: the final check's fixes ===== */
const step43=stepBlock(43);

test('on iPhone Team Chat opens as an even sheet below the header, and the two round buttons match',()=>{
  const phone=media(step43,'max-width:600px');
  assert.match(phone,/\.chat-panel\{left:12px;right:12px;width:auto;max-width:none;top:var\(--tc-top,118px\);/);
  assert.match(phone,/\.chat-fab\{width:52px;height:52px;/,'the same size as the "+" above it');
  assert.match(phone,/\.task-card \.tcard-sel,\.task-card \.tcard-move\{min-height:40px;\}/);
});

test('small fixes from the second review',()=>{
  assert.match(step43,/#panel-overview \.ov-ann-act\{color:var\(--muted\);\}/,'announcement actions are visible');
  /* The Overview's search box (and its clear button) went in step 48: one search in the header. */
  assert.doesNotMatch(step43,/\.mb-evt/,'the second event chip went in step 63: one event tag in the event\'s own colours');
  assert.match(step43,/body:not\(\.hdr-scrolled\) \.app-header\{box-shadow:inset 0 1px 0 rgba\(255,255,255,\.06\)!important;\}/);
  assert.match(step43,/\.tc-details\.open \.task-desc\{display:block;-webkit-line-clamp:unset;/,'opened details show the whole text');
  assert.match(step43,/\.member-head \.member-head-extra \.mh-dt\{display:none;\}/);
  assert.doesNotMatch(source,/DAY AGENDA|shared by the whole team/);
});

/* ===== Step 44: event colours the team chose stay readable ===== */
const step44=stepBlock(44);

test('an event with its own text colour keeps its coloured tile in light mode',()=>{
  /* Any rule that clears a chip's fill must skip filled chips, or their white or
     cream text lands on white (Boss's report, 28 Oct). */
  const chipSel=/\.ev-chip(?![\w-])/;
  const clears=[...css26.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([,sel,decl])=>chipSel.test(sel)&&/background:\s*(transparent|none|var\(--surface\))/.test(decl));
  assert.ok(clears.length>=1,'plain chips are still flat rows (step 32)');
  for(const [,sel] of clears)for(const part of sel.split(/,(?![^()]*\))/))
    if(chipSel.test(part)&&!part.trim().startsWith('html.dark'))assert.match(part,/:not\(\.ev-chip-filled\)/,part.trim()+' must leave filled chips alone in light mode');
  assert.match(step44,/html:not\(\.dark\) \.evhub \.ev-chip\.ev-chip-filled\{border:0;border-radius:12px;\}/,'a filled chip is a neat tile');
  assert.match(source,/\(tc\?' ev-chip-filled':''\)/,'only an event with a text colour is marked filled');
});

test("a task label on a coloured event keeps the event's own colours",()=>{
  assert.doesNotMatch(css26,/#0b6e69/,'no teal label any more (step 63): the event\'s own colours, or the quiet tag');
  assert.doesNotMatch(css26,/html:not\(\.dark\) \.mb-event\{color/,'no rule repaints a filled label');
  assert.doesNotMatch(css26,/\.mb-event[^{]*\{[^}]*!important/,'nothing outranks the colours a tag is drawn with');
  assert.match(source,/var cls='mb mb-event'\+\(t\?' mb-event-filled':\(c\?' mb-event-tint':''\)\),st='';/);
});


/* ===== Step 45: the Revisions buttons save on every card ===== */
const step45=stepBlock(45);

test('the Revisions buttons save where the card lives',async()=>{
  /* The real buttons' code and the real save routing, against a stand-in database. */
  const writes=[],failed=[];let refuse=false;
  const list=name=>({doc:id=>({update:data=>{writes.push(JSON.parse(JSON.stringify({name,id,data})));
    return refuse?Promise.reject(new Error('refused')):Promise.resolve();}})});
  const tasks={dew:[{id:'own',dzRevisions:2},{id:'shared',__src:'event',assignees:['boss','dew'],dzRevisions:0}]};
  const c=vm.createContext({eventTasksRef:list('event_tasks'),db:null,refOf:w=>list(w+'_tasks'),
    tasksOf:w=>tasks[w]||[],tOf:w=>tasks[w]||[],ts:()=>'now',
    stampEdit:()=>({lastEditedBy:'boss@example.test'}),dbSaveFailed:(e,what)=>failed.push(what)});
  c.window=c;
  vm.runInContext(slice('function taskRef(','function isEventTask(')+slice('  window.dzRev=function(','  /* ---------- Sick leave: editable'),c);
  let stopped=0;const tap={stopPropagation:()=>stopped++};
  c.dzRev(tap,'dew','shared',1);
  assert.deepEqual(writes.pop(),{name:'event_tasks',id:'shared',data:{dzRevisions:1,updatedAt:'now',lastEditedBy:'boss@example.test'}},
    'a card shared by Boss and Dew is saved to the shared list, with the editor recorded');
  c.dzRev(tap,'dew','own',1);
  assert.deepEqual(writes.pop(),{name:'dew_tasks',id:'own',data:{dzRevisions:3,updatedAt:'now',lastEditedBy:'boss@example.test'}},"Dew's own card stays in Dew's list");
  c.dzRev(tap,'dew','shared',-1);
  assert.equal(writes.length,0,'"-" at zero saves nothing');
  refuse=true;c.dzRev(tap,'dew','own',-1);await new Promise(r=>setImmediate(r));
  assert.deepEqual(failed,['the revision count'],'a refused save says so');
  assert.equal(stopped,4,'a tap never opens the card behind it');
  assert.doesNotMatch(slice('  window.dzRev=function(','  /* ---------- Sick leave: editable'),/refOf/,'no shortcut to the personal list');
});

test('on a touch screen a Revisions tap leaves no colour behind, and the buttons are big enough',()=>{
  assert.match(media(step45,'hover:none'),/\.rev-btn:hover\{background:var\(--surface\);color:var\(--text\);\}/,'no colour that stays after a tap');
  assert.match(step45,/\.rev-btn:active\{background:var\(--accent-ink,var\(--navy\)\);color:#fff;\}/,'a short press instead');
  assert.ok(step45.indexOf('.rev-btn:active')>step45.indexOf('@media(hover:none)'),'while the finger is down, the press wins');
  assert.match(media(step45,'max-width:600px'),/\.rev-step \.rev-btn\{width:32px;height:32px;/);
});

/* ===== Step 46: event colours readable as text ===== */
const step46=stepBlock(46);

test('in light mode only, an event colour too light for text shows its darker shade',()=>{
  assert.match(step46,/html:not\(\.dark\) \.ev-ink\{color:var\(--evc-ink\)!important;\}/);
  assert.doesNotMatch(css26,/html\.dark[^{]*\.ev-ink(?![\w-])/,'the darker shade is for light mode only');
  assert.doesNotMatch(source,/class="ov-cdn-n"'\+\(\(it\.e\.color/,'the countdown number goes through evTextAttrs');
});


/* ===== Step 47: iPhone, the header gives its height back to the work ===== */
const step47=stepBlock(47);

test('on iPhone the logo row scrolls away and the payday row stays pinned, with nothing jumping',()=>{
  const phone=media(step47,'max-width:600px');
  assert.match(phone,/body\.hdr-scrolled \.header-top\{padding:12px 14px 8px;\}/,'one header height, scrolled or not');
  assert.match(phone,/\.app-header\{top:-60px;\}/,'the first 60px (the logo row) scroll away; the second row stays');
  assert.match(phone,/\.app-header::before\{content:'';position:fixed;top:0;left:0;right:0;height:env\(safe-area-inset-top,0px\);background:inherit;/,
    'in the Home Screen app the status bar stays covered in the header colour');
  assert.match(phone,/#auth-banner\{display:none;\}/,'ADMIN leaves the header; Sign out is in the menu');
  assert.match(phone,/\.header-right \.uxp-sal-toggle :is\(\.uxp-sal-date,\.uxp-sal-left,\.uxp-sal-mini\)\{display:none;\}/,'"Payday · 2 days"');
  assert.match(phone,/\.salary-dock:not\(:has\(#lunch-banner\.show\)\) \.uxp-sal-bar\{display:none;\}/,'the line under the header only for lunch');
  assert.match(phone,/\.uxp-mi-who\{display:flex;/);
  assert.match(step47,/^\.uxp-mi-who\{display:none;\}/m,'the menu names the account only on phones');
  assert.match(media(step47,'max-width:360px'),/\.header-right \.uxp-sal-toggle :is\(\.uxp-sal-word,\.uxp-sal-sep\)\{display:none;\}/,'"2 days" on the smallest iPhones');
});

test('the payday line moves into the header on phones and back under it on wider screens',()=>{
  const mk=cls=>({className:cls,children:[],parentNode:null,
    insertBefore(el,ref){if(el.parentNode)el.parentNode.children.splice(el.parentNode.children.indexOf(el),1);
      const i=ref?this.children.indexOf(ref):-1;this.children.splice(i<0?this.children.length:i,0,el);el.parentNode=this;},
    get firstChild(){return this.children[0]||null;}});
  const host=mk('header-right'),bar=mk('uxp-sal-bar'),toggle=mk('uxp-sal-toggle'),bell=mk('dm-toggle'),lunch=mk('');
  host.insertBefore(bell,null);bar.insertBefore(toggle,null);bar.insertBefore(lunch,null);
  const listeners=[],mq={matches:true,addEventListener:(t,f)=>listeners.push(f)};
  const document={getElementById:id=>id==='uxp-sal-toggle'?toggle:null,querySelector:s=>({'.header-right':host,'.uxp-sal-bar':bar})[s]||null};
  const c=vm.createContext({document,window:{matchMedia:()=>mq}});
  vm.runInContext(slice('  var salMq=null;','  /* condensed header after scrolling')+'\nthis.placeSal=placeSal;this.watchSal=watchSal;',c);
  c.watchSal();c.placeSal();
  assert.equal(toggle.parentNode,host);assert.equal(host.children[0],toggle,'first in the row, where ADMIN was');
  mq.matches=false;listeners.forEach(f=>f());
  assert.equal(toggle.parentNode,bar);assert.equal(bar.children[0],toggle,'back before the lunch notice');
  assert.match(source,/watchSal\(\); placeSal\(\);/,'placed as soon as the line exists');
  assert.match(source,/<span class="uxp-sal-word">Payday<\/span> <b class="uxp-sal-date">/,'the same words, in pieces a phone can shorten');
  assert.match(source,/days==='1'\?' day':' days'/);
  assert.match(source,/if\(!v&&b\.parentNode&&b\.parentNode\.classList\.contains\('header-right'\)&&\(window\.scrollY\|\|0\)>0\)/,'opening it from the pinned row scrolls up to show the details');
  assert.match(source,/'<div class="uxp-mi-who"><i class="ti ti-user-circle"><\/i><span class="uxp-mi-name">'/,'the menu says who is signed in');
});

test('the "⋯" menu and the bell panel open under their own button',()=>{
  const style={},panel={classList:{contains:n=>n==='open'},style},btn={getBoundingClientRect:()=>({bottom:45})};
  const c=vm.createContext({document:{getElementById:id=>({'uxp-more-panel':panel,'hdr-more':btn})[id]||null}});
  vm.runInContext(slice('  function reanchor(){','  window.uxpReanchor=reanchor;'),c);
  c.reanchor();
  assert.equal(style.top,'53px','8px under the button, never over the header row');
  assert.match(source,/document\.body\.classList\.toggle\('hdr-scrolled',\(window\.scrollY\|\|0\)>10\);\n      reanchor\(\);/,'and stays under it while the header scrolls');
  assert.match(source,/if\(open\)reanchor\(\);/);
  assert.match(source,/if\(open&&window\.uxpReanchor\)window\.uxpReanchor\(\);/);
});

/* ===== Step 48: one search that finds everything ===== */
const step48=stepBlock(48);

test('the finder covers every person: tasks and shared cards, events, notes and links',()=>{
  const c=vm.createContext({MORDER:['boss','dew'],topicOf:t=>t.topic,nm:w=>({boss:'Boss',dew:'Dew'})[w],fdt:d=>d,
    tOf:w=>w==='dew'?[{id:'d1',topic:'Poster for Open Day'},{id:'d2',topic:'Banner',description:'open day welcome'}]:[{id:'b1',topic:'Budget'}],
    eOf:w=>w==='boss'?[{id:'e1',name:'School Open Day',date:'2026-11-04'}]:[],
    nOf:w=>w==='dew'?[{id:'n1',title:'Ideas',content:'Open day photo wall'}]:[],
    lkOf:w=>w==='boss'?[{id:'l1',title:'Open day brief',url:'#'}]:[]});
  vm.runInContext(slice('  function marcomFind(q){','  /* ---------- master render'),c);
  const found=JSON.parse(JSON.stringify(c.marcomFind('open day')));
  assert.deepEqual(found.map(r=>r.kind+':'+r.w+':'+r.id),['event:boss:e1','link:boss:l1','task:dew:d1','task:dew:d2','note:dew:n1'],'person by person, in tab order');
  assert.equal(found[0].sub,'Team event · 2026-11-04');
  assert.deepEqual(JSON.parse(JSON.stringify(c.marcomFind('o'))),[],'two letters at least');
});

test('the header search lists the tabs you can see, by today\'s names, and what the finder finds',()=>{
  const tab=(id,name,icon,hidden)=>({id,hidden,querySelector:s=>s==='.tab-name'?{textContent:name}:(s==='i.ti'?{className:'ti '+icon}:null)});
  const tabs=[tab('tab-overview','Overview','ti-layout-grid'),tab('tab-boss','Boss','ti-user'),tab('tab-dew','Dew','ti-palette'),tab('tab-o','O','ti-camera',true),tab('tab-junior','Eye','ti-user-plus')];
  const out={innerHTML:''},input={value:''},calls=[];
  const c=vm.createContext({
    document:{querySelectorAll:s=>s==='.tab-nav .tab-btn'?tabs:[],getElementById:id=>({'cmdk-input':input,'cmdk-results':out})[id]},
    getComputedStyle:b=>({display:b.hidden?'none':'flex'}),escHtml:x=>String(x),
    closeCmdk:()=>calls.push('close'),switchTab:w=>calls.push('tab:'+w),openEdit:(w,id)=>calls.push('edit:'+w+':'+id),ovGoto:w=>calls.push('goto:'+w),
    showTask:(w,id,o)=>calls.push('show:'+w+':'+id+(o&&o.open?':open':'')),
    setTimeout:f=>f(),highlightCmdk:()=>{},cmdkItems:[],cmdkSel:0});
  c.window=c;c.marcomRoleOf=w=>({boss:'Marcom manager',dew:'Graphic Designer',junior:'Junior Events Coordinator'})[w];
  c.marcomFind=q=>[{kind:'task',w:'dew',id:'t9',ic:'ti-clipboard-list',label:'Poster',sub:'Dew'},{kind:'note',w:'boss',id:'n2',ic:'ti-notes',label:'Ideas',sub:'Boss'}];
  vm.runInContext('let cmdkItems=[],cmdkSel=0;'+slice('function cmdkActions(q){','function setCmdkSel(')+'\nthis.run=i=>cmdkItems[i].run();',c);
  const titles=JSON.parse(JSON.stringify(c.cmdkActions('').map(a=>a.title)));
  assert.deepEqual(titles,['New task','Go to Overview','Go to Boss','Go to Dew','Go to Eye','Toggle dark mode','Settings'],'a tab you cannot see is not offered');
  assert.equal(c.cmdkActions('').find(a=>a.title==='Go to Dew').sub,'Graphic Designer','roles from Settings');
  assert.doesNotMatch(slice('function cmdkActions(q){','function setCmdkSel('),/Best|best|Junior tab|bossTasks/,'nothing left of the old fixed list');
  input.value='poster';c.renderCmdk();
  assert.match(out.innerHTML,/<div class="cmdk-section">Tasks \(1\)<\/div>/);
  assert.match(out.innerHTML,/<div class="cmdk-section">Notes \(1\)<\/div>/);
  const n=(out.innerHTML.match(/class="cmdk-item"/g)||[]).length;
  c.run(n-2);c.run(n-1);
  assert.deepEqual(calls,['close','show:dew:t9:open','close','goto:boss'],'a task is shown where it lives, then opens in its editor (step 60); a note opens its tab');
});

test('one search on every screen: the header button on iPhone, no box on the Overview',()=>{
  const phone=media(step48,'max-width:600px');
  assert.match(phone,/\.header-right \.cmdk-trigger\{display:inline-flex;[^}]*width:42px;height:42px;/,'the same size as the bell');
  assert.match(phone,/#panel-overview \.ov-topbar\{display:none;\}/,'nothing left of the Overview\'s top bar on a phone');
  assert.doesNotMatch(source,/ov-search|doSearch|ovClearSearch/,'the Overview\'s own search is gone');
  assert.match(source,/<button class="cmdk-trigger" onclick="openCmdk\(\)" title="Search and commands \(Ctrl K\)" aria-label="Search">/);
  assert.match(source,/placeholder="Search tasks, events, notes or links"/);
});

/* ===== Step 49: person colours as small marks only ===== */
const step49=stepBlock(49);

test('in light mode a person colour fills no large area: plain name and Event Hub bars, navy buttons',()=>{
  assert.match(step49,/html:not\(\.dark\) \.member-head\{background:var\(--surface\)!important;background-image:none!important;\}/);
  assert.match(step49,/html:not\(\.dark\) \.evhub-head\{background:transparent!important;background-image:none!important;\}/);
  assert.match(step49,/html:not\(\.dark\) :is\(#panel-boss,#panel-dew,#panel-o,#panel-junior\) \.btn-accent\{background:var\(--navy,#003057\)!important;[^}]*color:#fff!important;\}/,
    'Add Task and the other primary buttons are the same navy on every tab');
  assert.match(step49,/html:not\(\.dark\) \.tab-panel \.fpill\.act-accent\{background:var\(--navy,#003057\)!important;/,'so is the selected filter');
  assert.doesNotMatch(css26,/html:not\(\.dark\) #panel-(boss|dew|o) \.btn-accent\{background:#(366a9c|a25816|b73d0b)/,'no person-coloured button left in light mode');
  assert.ok(contrast('#ffffff','#003057')>=4.5&&contrast('#ffffff','#00264a')>=4.5,'white reads on the navy and its hover');
  assert.doesNotMatch(step49,/html\.dark/,'dark mode keeps its colours');
});

/* ===== Step 50: task cards are calm at rest ===== */
const step50=stepBlock(50);

test('at rest a card ends in one bar, Details and "⋯"; the action row and the details follow it',()=>{
  const html=card(sample);
  const bar=html.slice(html.indexOf('<div class="tc-bar">'),html.indexOf('<div class="task-foot">'));
  assert.match(bar,/^<div class="tc-bar"><button type="button" class="tc-more" aria-expanded="false" onclick="event\.stopPropagation\(\);tcToggleDetails\(this,'dew_t1'\)">/,'Details on the left');
  assert.match(bar,/<button type="button" class="tc-acts-btn" aria-expanded="false" aria-label="More actions for this task" title="More actions" onclick="event\.stopPropagation\(\);tcToggleActs\(this,'dew_t1'\)"><i class="ti ti-dots"><\/i><\/button><\/div>$/,'"⋯" beside Details');
  const foot=html.slice(html.indexOf('<div class="task-foot">'),html.indexOf('<div class="tc-details'));
  assert.match(foot,/^<div class="task-foot"><select class="tcard-sel tc-row-sel" title="Task status"/,'the row can carry the status menu for a status column');
  for(const call of [/moveCardTo\('dew','t1',this\.value\)/,/uxpTaskCalendar\('dew','t1'\)/,/duplicateTask\('dew','t1'\)/,/openEdit\('dew','t1'\)/,/deleteTask\('dew','t1'\)/])assert.match(foot,call);
  assert.ok(html.indexOf('tc-open-hint')<html.indexOf('tc-bar'),'a Director request lands above the bar');
  assert.ok(html.indexOf('task-foot')<html.indexOf('tc-details'),'the action row opens right under "⋯", before the details');
  assert.match(html,/^<div class="task-card tc-pending" draggable="true"/,'closed at rest');
  const open=card(sample,{acts:true});
  assert.match(open,/^<div class="task-card tc-pending acts-open" draggable="true"/,'a row left open stays open after a redraw');
  assert.match(open,/class="tc-acts-btn" aria-expanded="true"/);
  assert.doesNotMatch(card({...sample,description:'',links:[]}),/class="tc-more"/,'no Details button without details; "⋯" stays');
});

test('"⋯" opens and closes the row and remembers it; Details finds its own panel',()=>{
  const classes=new Set(),attrs={},panel={classList:{contains:n=>false,toggle(){}}};
  const cardEl={classList:{contains:n=>classes.has(n),toggle:(n,on)=>on?classes.add(n):classes.delete(n)},querySelector:s=>s==='.tc-details'?panel:null};
  const btn={closest:s=>s==='.task-card'?cardEl:null,setAttribute:(k,v)=>{attrs[k]=v;},classList:{toggle(){}},nextElementSibling:null};
  const c=vm.createContext({window:{}});c.window=c;
  vm.runInContext(slice('window.__tcOpen={};','function kbFilterPass('),c);
  c.tcToggleActs(btn,'dew_t1');
  assert.ok(classes.has('acts-open'));assert.equal(attrs['aria-expanded'],'true');assert.equal(c.__tcActs.dew_t1,true);
  c.tcToggleActs(btn,'dew_t1');
  assert.ok(!classes.has('acts-open'));assert.equal(attrs['aria-expanded'],'false');assert.equal(c.__tcActs.dew_t1,false);
  let opened=null;panel.classList={contains:()=>false,toggle:(n,on)=>{opened=on;}};
  c.tcToggleDetails(btn,'dew_t1');
  assert.equal(opened,true,'the panel is found through the card, now that Details sits in the bar');
});

test('the row stays hidden until "⋯"; in a status column the status menu waits in it',()=>{
  assert.match(step50,/\.task-card:not\(\.acts-open\) \.task-foot\{display:none;\}/);
  assert.match(step50,/\.task-card \.task-foot \.tc-row-sel\{display:none;\}/);
  assert.match(step50,/\.kb-col \.task-card \.task-meta \.tcard-sel\{display:none;\}/);
  assert.match(step50,/\.kb-col \.task-card \.task-foot \.tc-row-sel\{display:inline-flex;\}/);
  assert.match(media(step50,'max-width:600px'),/\.task-card \.tc-acts-btn\{width:40px;height:40px;\}/,'a full touch target on iPhone');
  assert.match(step50,/\.task-card \.tc-acts-btn\{margin-left:0;/,'"⋯" beside Details on the left');
});


/* ===== Step 51: the Overview, one heavy block and columns that end together ===== */
const step51=stepBlock(51);

test('the countdown list becomes the Event Board\'s "Coming up", and its old card hides only after the move',()=>{
  const wrap={hidden:false,kids:[]},soon={kids:[],appendChild(el){el.parentNode=this;this.kids.push(el);}},list={parentNode:wrap};
  const ids={'ov-countdown':list,'ov-cd-card':wrap};
  const c=vm.createContext({document:{getElementById:id=>ids[id]||null},window:{}});
  vm.runInContext(slice('  function ovAdoptCountdown(){','  window.ovAdoptCountdown=ovAdoptCountdown;'),c);
  c.ovAdoptCountdown();
  assert.equal(list.parentNode,wrap,'no board yet: the list stays in its own card');
  assert.equal(wrap.hidden,false,'and that card stays visible, so no event is ever out of sight');
  ids['evb-soon']=soon;c.ovAdoptCountdown();
  assert.equal(list.parentNode,soon);assert.equal(wrap.hidden,true);
  c.ovAdoptCountdown();assert.equal(soon.kids.length,1,'moved once');
  assert.match(source,/main\.insertBefore\(c,main\.firstChild\);\n      if\(window\.ovAdoptCountdown\)window\.ovAdoptCountdown\(\);/,'the board adopts it as soon as it exists');
  assert.match(source,/'<div class="evb-soon" id="evb-soon"><div class="evb-sec-h">Coming up<\/div><\/div>'/);
  assert.match(source,/'<div class="evb-sec-h evb-tasks-h"><span>Shared tasks<\/span>'\n\s*\+'<select class="evb-sel" id="evb-filter" aria-label="Filter shared tasks by event"/,'the filter sits with the tasks it filters');
});

test('with two columns the Event Board runs full width under them; in one column it follows the deadlines',()=>{
  const context=vm.createContext({});
  vm.runInContext(slice('  var LAYOUT={','  };')+'  };',context);
  assert.deepEqual(Array.from(context.LAYOUT.wide),['evb-card']);
  const layout=slice('  function ovLayout(){','\n  }\n');
  assert.match(layout,/var oneCol=!!\(window\.matchMedia&&window\.matchMedia\('\(max-width:980px\)'\)\.matches\);/,'the same 980px where the grid becomes one column');
  assert.match(layout,/ovPlace\(panel\.querySelector\('\.ov-col-main'\),oneCol\?LAYOUT\.main:LAYOUT\.main\.filter\(/);
  assert.match(layout,/if\(!oneCol\)ovPlace\(document\.getElementById\('ov-wide'\),LAYOUT\.wide\);/);
  assert.match(source,/ovColMq\.addEventListener\('change',function\(\)\{ovLayout\(\);\}\)/,'turning an iPad moves it with the columns');
  assert.ok(shell.indexOf('id="ov-wide"')>shell.indexOf('class="ov-col-side"'),'the band comes after both columns');
  assert.match(step51,/#evb-soon \.ov-countdown\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(280px,1fr\)\);/,'"Coming up" is a grid when it has room');
  assert.match(step51,/#panel-overview \.ov-wide:empty\{display:none;\}/);
});

test('the Request Centre is one quiet line when nothing is new or due',()=>{
  assert.match(source,/var quiet=!\(newD\|\|newP\|\|await_\|\|dueWk\|\|over\);\n    card\.classList\.toggle\('rc-quiet',quiet\);/);
  assert.match(source,/'<div class="ov-rc-none"><span class="ov-rc-none-t">No new requests<\/span>'/);
  assert.match(source,/rcOpenCentre\(\)"><i class="ti ti-external-link"><\/i> Open request form<\/button>'\n\s*\+'<button class="btn btn-ghost btn-sm" onclick="rcCopyLink\(this\)">/,'Open and Copy Link stay');
  assert.match(step51,/#ov-rc-card\.rc-quiet \.ov-rc-none\{grid-column:1 \/ -1;/);
});

/* ===== Step 52: Team today, what needs Boss reads first ===== */
const step52=stepBlock(52);

test('Team today: overdue reads strongest, waiting next, on hold and Clear quietest; a calm name fades',()=>{
  assert.match(css26,/\.tm-x\{display:inline-flex;[^}]*font-weight:700;/,'waiting keeps the base weight');
  assert.match(step52,/\.tm-x\.tm-over\{font-weight:800;\}/);
  assert.match(step52,/\.tm-x\.tm-hold\{font-weight:500;\}/);
  assert.match(step52,/\.tm-x\.tm-clear\{font-weight:500;\}/,'the two-class selector outweighs .tm-clear{font-weight:600}');
  assert.match(step52,/\.tm\.tm-calm \.tm-name\{color:var\(--muted\);font-weight:600;\}/);
  assert.match(source,/class="tm'\+\(calm\?' tm-calm':''\)\+'"/);
});

test('each deadline opens with its owner\'s initial in their colour; screen readers still hear the name',()=>{
  const nodes={'ov-deadlines':{innerHTML:''},'ov-dl-filters':{innerHTML:''}};
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const tasks={boss:[{id:'b1',status:'pending',dueDate:'2026-10-28',topic:'Brochure'}],dew:[{id:'d1',status:'pending',dueDate:'2026-10-29',topic:'Banner',priority:'high'}]};
  const context=vm.createContext({window:{},document:{getElementById:id=>nodes[id]||null},MORDER:['boss','dew'],
    tOf:w=>tasks[w]||[],isActive:()=>true,dU:d=>d==='2026-10-28'?0:1,nm:w=>({boss:'Boss',dew:'<b>dew</b>'})[w],esc,
    topicOf:t=>t.topic,fdt:d=>'on '+d,MarcomUI:{setHTML:(el,h)=>{el.innerHTML=h;}}});
  vm.runInContext(slice("  var ovDl='all', ovDlOpen={};",'  /* ---------- event countdown ---------- */'),context);
  context.renderDeadlines();
  const html=nodes['ov-deadlines'].innerHTML;
  assert.match(html,/<div class="ov-dl" role="button" tabindex="0" onkeydown="ovRowKey\(event\)" onclick="ovShowTask\('boss','b1'\)"><span class="ov-dl-who" data-member="boss" title="Boss" aria-hidden="true">B<\/span><div class="ov-dl-main">/,'the row opens its task (step 60), by keyboard too (step 65)');
  assert.match(html,/<div class="ov-dl-sub"><span class="ov-dl-wn">Boss &middot; <\/span>on 2026-10-28<\/div>/,'the name stays in the text for screen readers');
  assert.match(html,/data-member="dew" title="&lt;b&gt;dew&lt;\/b&gt;" aria-hidden="true">&lt;<\/span>/,'names are escaped; the initial is the first letter shown');
  assert.doesNotMatch(html,/<b>dew<\/b>/);
  assert.match(step52,/#panel-overview \.ov-dl \.ov-dl-who\{flex:0 0 auto;width:24px;height:24px;border-radius:50%;[^}]*color:#fff;background:var\(--tm-c,var\(--navy,#003057\)\);\}/);
  for(const w of ['boss','dew','o','junior'])
    assert.match(step52,new RegExp('#panel-overview \\.ov-dl-who\\[data-member="'+w+'"\\]\\{--tm-c:var\\(--member-'+w+'\\);\\}'));
  assert.match(step52,/#panel-overview \.ov-dl-wn\{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect\(0 0 0 0\);white-space:nowrap;border:0;\}/);
});

test('white initials read on every person colour, the defaults and any saved tab colour',()=>{
  for(const w of ['boss','dew','o','junior']){
    const c=hex(css26,'member-'+w);
    assert.ok(contrast('#ffffff',c)>=4.5,w+': white on '+c+' is '+contrast('#ffffff',c).toFixed(2));
  }
  /* A saved colour becomes an ink that reads at 4.5:1 on #EFF3F9, so white,
     which is lighter still, reads on it at least as well. */
  assert.match(source,/var ink=readable\(c,'#EFF3F9',4\.5\);/);
  assert.match(source,/css\+=':root\{--member-'\+w\+':'\+ink\+';\}';/);
});

/* ===== Step 56: sidebar widget headers, the name first ===== */
const step56=stepBlock(56);

test('sidebar headers: the name first, buttons on the right, and a button that does not fit moves under it',()=>{
  assert.doesNotMatch(css26,/\.side-col \.widget-head\{display:grid/,'step 39\'s grid, which let buttons take the hidden handle\'s place, is gone');
  assert.doesNotMatch(css26,/\.side-col \.widget-head>\*\{grid-row/);
  assert.match(step56,/\.side-col \.widget-head\{--wh-name-x:52px;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;column-gap:10px;row-gap:6px;\}/,
    'one row that wraps; a wrapped button stays on the right');
  assert.match(step56,/\.side-col \.widget-head>\.widget-title\{flex:1 1 auto;\}/,'the name is measured at its full width before anything wraps');
  assert.match(css26,/\.widget-head>\.widget-title\{min-width:0;flex:1 1 auto;\}/);
  assert.match(step56,/\.side-col \.widget-head>\.uxp-cal-seg\{order:1;\}/,'the refresh stays beside the name; only the wide switch moves down');
  assert.match(step56,/\.side-col \.widget\.collapsed>\.widget-head>\.widget-title\{white-space:normal;\}/,'a long folded name wraps on the narrowest phones instead of being cut');
});

test('a folded widget\'s summary sits on the last line, under the name\'s first letter',()=>{
  assert.match(step56,/\.side-col \.widget-head>\.widget-sum\{order:2;flex:0 0 auto;width:calc\(100% - var\(--wh-name-x\)\);max-width:none;margin:-5px 0 0 var\(--wh-name-x\);padding:0;text-align:left;\}/);
  /* 52px is the fold arrow and the icon tile; from 981px the drag handle and its gap add 31px.
     The handle hides below exactly that width, so the two rules must move together. */
  assert.match(media(step56,'min-width:981px'),/\.side-col \.widget-head\{--wh-name-x:83px;\}/);
  assert.match(source,/@media\(max-width:980px\)\{\.uxp-wh-drag\{display:none;\}\}/);
  assert.match(source,/\.uxp-wh-drag\{[^}]*padding:4px 6px 4px 0;font-size:15px;/,'the handle is 21px wide (15px icon and 6px padding)');
});

/* ===== Step 57: event colours readable as text in dark mode too ===== */
const step57=stepBlock(57);

test('in dark mode only, an event colour too dark for the card shows its lighter shade',()=>{
  assert.match(step57,/html\.dark \.ev-ink-d\{color:var\(--evc-ink-d\)!important;\}/);
  assert.doesNotMatch(css26,/html:not\(\.dark\)[^{]*\.ev-ink-d/,'light mode keeps step 46\'s shade');
  assert.match(source,/var ink=evInk\(hex\),inkD=evInkDark\(hex\),c=cls,st='color:'\+hex\+';';/,'both shades come from one helper call per text');
});

/* ===== Step 58: the event a shared task belongs to, and the Deadlines legend ===== */
const step58=stepBlock(58);

test('picking an event fills a shared card\'s "Event name", unless someone typed their own',()=>{
  const el=(value='')=>({value,attrs:{},getAttribute(k){return k in this.attrs?this.attrs[k]:null;},setAttribute(k,v){this.attrs[k]=String(v);}});
  const lab=el(),pick=el('open');
  const c=vm.createContext({document:{getElementById:id=>({'m-evt-label':lab,'m-event':pick})[id]||null},
    modalState:{who:'boss',taskType:'normal'},eventsOf:()=>[{id:'open',name:'School Open Day'},{id:'fair',name:'Christmas Fair'}]});
  vm.runInContext(slice('function syncDesignEvent(){','function toggleRoleDetails('),c);
  c.syncDesignEvent();
  assert.equal(lab.value,'School Open Day','an empty box takes the picked event');
  pick.value='fair';c.syncDesignEvent();
  assert.equal(lab.value,'Christmas Fair','and follows the picker while it is still the automatic name');
  pick.value='';c.syncDesignEvent();
  assert.equal(lab.value,'','"None" clears it again');
  lab.value='Open Day prep';pick.value='open';c.syncDesignEvent();
  assert.equal(lab.value,'Open Day prep','a typed name is never overwritten');
  assert.match(source,/data\.eventLabel=\(\(document\.getElementById\('m-evt-label'\)\|\|\{\}\)\.value\|\|''\)\.trim\(\)\|\|data\.eventName\|\|'';/,'saving falls back to the picked event too');
  assert.match(source,/if\(!lab\.value\|\|lab\.value===\(\(task&&task\.eventName\)\|\|''\)\)lab\.setAttribute\('data-auto',lab\.value\);/,'an edited card keeps following the picker unless its name was typed');
  assert.match(source,/evtList\(\)\.forEach\(function\(t\)\{ var n=t\.eventLabel\|\|t\.eventName; if\(n\)set\[n\]=1; \}\);/,'the board\'s filter lists events named either way');
});

test('every Deadlines legend tells a deadline, one due soon and a sick day apart',()=>{
  const boss=slice('<div class="cal-grid" id="boss-cal-grid"></div>','<div class="cal-detail" id="boss-cal-detail"');
  assert.match(boss,/style="background:var\(--navy\);"><\/div>Deadline<\/div>/);
  assert.match(boss,/class="cal-leg-dot cd-urgent"><\/div>Due soon<\/div>/,'the legend shares the calendar due-soon ring');
  assert.match(boss,/<div class="cal-leg-sick"><\/div>Sick day<\/div>/);
  assert.doesNotMatch(boss,/var\(--sick\);"><\/div>Sick</,'no red dot that reads like a deadline');
  assert.match(source,/Due soon<\/div><div class="cal-leg-item"><div class="cal-leg-sick"><\/div>Sick day<\/div><\/div>/,'the member tabs\' calendars say the same');
  assert.match(source,/const dc=info\.urgent\?'cd-urgent':/,'urgent dates share the due-soon marker');
  assert.match(step58,/\.cal-leg-sick\{width:10px;height:10px;border-radius:3px;background:var\(--sick-light\);box-shadow:inset 0 0 0 1px var\(--sick\);\}/,'the same tint a sick day gets');
});

/* ===== Step 59: readable event tiles; no content text under 13px ===== */
const step59=stepBlock(59);

test('tile dates at full strength and 11px; event names, day rows and director lines at 13px',()=>{
  assert.match(step59,/\.ev-chip-date\{font-size:11px;\}/);
  assert.match(step59,/\.ev-chip-name,\.dirq-s,\.dirq-note,\.myday-row\{font-size:13px;\}/);
  assert.doesNotMatch(source,/opacity:\.78/,'no faded tile date');
  assert.doesNotMatch(source,/linear-gradient\(180deg,'\+clr\+','\+evTint\(clr,0\.86\)/,'no fading tile');
});

/* ===== Step 60: after you add or open a task, you see it ===== */
const step60=stepBlock(60);

test('a toast can offer one action ("Show") that runs once and closes it',()=>{
  const mk=tag=>({tag,children:[],className:'',textContent:'',attrs:{},parentNode:null,classList:{add(){}},
    appendChild(c){c.parentNode=this;this.children.push(c);return c;},removeChild(c){this.children=this.children.filter(x=>x!==c);c.parentNode=null;},
    setAttribute(k,v){this.attrs[k]=v;}});
  const body=mk('body'),timers=[];
  const c=vm.createContext({document:{body,createElement:mk,getElementById:id=>body.children.find(x=>x.id===id)||null},
    setTimeout:f=>timers.push(f),console});
  vm.runInContext(slice('function uiToast(msg,opts){','function deleteWithUndo('),c);
  let shown=0;
  c.uiToast('Added for Dew · due 2 Nov',{actionLabel:'Show',action:()=>shown++});
  const host=body.children[0],toast=host.children[0],btn=toast.children.find(x=>x.tag==='button');
  assert.equal(toast.children[0].textContent,'Added for Dew · due 2 Nov');
  assert.equal(btn.textContent,'Show');
  btn.onclick();btn.onclick();
  assert.equal(shown,1,'runs once');
  assert.equal(toast.parentNode,null,'and the toast goes');
});

test('showTask opens the person\'s tab at the task, marks it, and resets a filter that hides it',()=>{
  const calls=[],card={id:'t1',getAttribute:()=>'t1',classList:{list:[],add(x){this.list.push(x);},remove(){}},scrollIntoView:o=>calls.push('scroll:'+o.block),offsetWidth:1};
  let filtered=true;
  const panel={classList:{contains:()=>false},querySelectorAll:()=>filtered?[]:[card]};
  const c=vm.createContext({document:{getElementById:id=>id==='panel-dew'?panel:null,querySelector:s=>s==='.fpill[data-who="dew"][data-f="all"]'?{all:1}:null},
    switchTab:w=>calls.push('tab:'+w),filterOf:()=>filtered?'pending':'all',setFilter:(w,f)=>{calls.push('filter:'+w+':'+f);filtered=false;},
    openEdit:(w,id)=>calls.push('edit:'+w+':'+id),motionBehavior:()=>'auto',setTimeout:f=>f()});
  vm.runInContext(slice('function showTask(who,id,opts){','\ndocument.addEventListener'),c);
  c.showTask('dew','t1',{open:true});
  assert.deepEqual(calls,['tab:dew','filter:dew:all','scroll:center','edit:dew:t1']);
  assert.deepEqual(card.classList.list,['tc-found']);
  calls.length=0;c.showTask('ghost','x',{open:true});
  assert.deepEqual(calls,['edit:ghost:x'],'no tab: the editor still opens');
  assert.match(source,/if\(!panel\.classList\.contains\('active'\)\)\{try\{window\.scrollTo\(0,0\);\}catch\(e\)\{\}\}/,'every tab opens at its top');
  assert.match(source,/cmdkItems\.push\(\{run:r\.kind==='task'\?\(\)=>\{closeCmdk\(\);showTask\(r\.w,r\.id,\{open:true\}\);\}:/,'search shows the task, then opens it');
  assert.match(source,/window\.ovShowTask=function\(w,id\)\{ try\{ showTask\(w,id\); \}catch\(e\)\{ window\.ovGoto\(w\); \} \};/);
});

test('saving a new task says what was added, for whom and when, with Show',()=>{
  assert.match(source,/var _msg=\(evtOn&&!_ppl2\.length\)\?\('Added to the Event Board'\+_due\):\('Added for '\+_ppl2\.map\(memberName\)\.join\(', '\)\+_due\);/);
  assert.match(source,/uiToast\(_msg,\{actionLabel:'Show',action:function\(\)\{\n\s*if\(_ppl2\.length\)showTask\(_ppl2\[0\],_nid\);/);
});

test('"For" at the top of Add Task: an admin picks whose board, or several people for a shared card',()=>{
  const el=()=>({hidden:false,innerHTML:'',value:'',checked:false,scrollIntoView(){}});
  const els={'m-for-group':el(),'m-for':el(),'m-evt-on':el(),'m-evt-fields':el(),'m-event':el()};
  els['m-event'].value='open-day';
  const calls=[];
  const c=vm.createContext({document:{getElementById:id=>els[id]||null},window:{__cur:{role:'admin'}},
    MEMBER_ORDER:['boss','dew','o','junior'],refOf:()=>({}),memberName:w=>w.toUpperCase(),escHtml:x=>x,motionBehavior:()=>'auto',
    styleModal:w=>calls.push('style:'+w),populateEventSelect:(w,e)=>calls.push('events:'+w+':'+e),setTaskType:m=>calls.push('type:'+m)});
  c.window.evtToggle=()=>calls.push('share-toggle');c.window.evtPeopleSet=a=>calls.push('people:'+a.join('+'));
  vm.runInContext('var modalState={who:"boss",editId:null};'+slice('function taskForFill(who){','function setTaskType(mode){'),c);
  c.taskForFill('boss');
  assert.equal(els['m-for-group'].hidden,false);
  assert.match(els['m-for'].innerHTML,/^<option value="boss" selected>BOSS<\/option><option value="dew">DEW<\/option>.*<option value="__shared">Several people \(a shared card\)<\/option>$/);
  c.taskForChange('dew');
  assert.equal(vm.runInContext('modalState.who',c),'dew','the task goes on Dew\'s board');
  assert.deepEqual(calls,['style:dew','events:dew:open-day','type:role','people:dew'],'the form follows Dew and keeps the event');
  calls.length=0;c.taskForChange('__shared');
  assert.equal(els['m-evt-on'].checked,true,'several people: a shared card');
  assert.deepEqual(calls,['share-toggle']);
  vm.runInContext('modalState.editId="t1"',c);c.taskForFill('dew');
  assert.equal(els['m-for-group'].hidden,true,'editing keeps Move to for that');
  vm.runInContext('modalState.editId=null;window.__cur={role:"designer"}',c);c.taskForFill('dew');
  assert.equal(els['m-for-group'].hidden,true,'a member adds to their own board only');
  assert.match(source,/<div class="form-group m-for" id="m-for-group" hidden><label class="form-label" for="m-for">For<\/label><select class="form-select" id="m-for" onchange="taskForChange\(this\.value\)"><\/select><\/div>\n\s*<div class="form-group"><label class="form-label">Task Title<\/label>/,'it comes first');
});

test('the shown card is marked for a moment; on iPhone and iPad the page holds still behind a sheet',()=>{
  assert.match(step60,/@keyframes tc-found\{from\{outline-color:var\(--focus-ink\);\}to\{outline-color:transparent;\}\}/);
  assert.match(step60,/\.task-card\.tc-found\{outline:3px solid transparent;outline-offset:2px;animation:tc-found 2\.4s ease-in forwards;\}/);
  assert.match(step60,/@media\(prefers-reduced-motion:reduce\)\{\.task-card\.tc-found\{animation:none;outline-color:var\(--focus-ink\);\}\}/);
  assert.match(step60,/\.modal-overlay,\.modal-overlay \.modal\{overscroll-behavior:contain;\}/);
  assert.match(media(step60,'max-width:980px'),/html:has\(\.modal-overlay\.open\),html:has\(\.modal-overlay\.open\) body\{overflow:hidden;\}/);
  assert.match(step60,/\.m-for\[hidden\]\{display:none;\}/);
});

/* ===== Step 61: iPhone, the round buttons never cover a control ===== */
const step61=stepBlock(61);

test('on iPhone the round buttons slide away while scrolling down and return on the way up',()=>{
  const cls=new Set();let handler=null,chat=null,phone=true;
  const win={scrollY:0,matchMedia:()=>({get matches(){return phone;},addEventListener(){}}),addEventListener:(t,f)=>{if(t==='scroll')handler=f;}};
  const c=vm.createContext({window:win,document:{body:{classList:{toggle:(k,on)=>on?cls.add(k):cls.delete(k)}},querySelector:s=>s==='.chat-panel.open'?chat:null}});
  vm.runInContext(slice('/* Step 61: on iPhone the round','function uiToast(msg,opts){'),c);
  const to=y=>{win.scrollY=y;handler();};
  to(10);assert.equal(cls.has('fab-away'),false,'near the top they stay');
  to(60);assert.equal(cls.has('fab-away'),true,'scrolling down: away');
  to(400);to(398);assert.equal(cls.has('fab-away'),true,'a 2px wobble changes nothing');
  to(380);assert.equal(cls.has('fab-away'),false,'scrolling up: back');
  to(600);assert.equal(cls.has('fab-away'),true);
  chat={};to(900);assert.equal(cls.has('fab-away'),false,'never while Team Chat is open');
  chat=null;to(1200);assert.equal(cls.has('fab-away'),true);
  phone=false;to(1500);assert.equal(cls.has('fab-away'),false,'iPad and computers keep them as they are');
});

test('the slide uses the page\'s motion and becomes a plain fade with Reduce Motion',()=>{
  const phone=media(step61,'max-width:600px');
  assert.match(phone,/body\.fab-away \.quickadd-fab,body\.fab-away \.chat-fab\{transform:translateY\(calc\(100% \+ var\(--float-lift\) \+ 48px\)\);opacity:0;visibility:hidden;pointer-events:none;/,
    'out of sight and out of the way of a tap at once');
  assert.match(step61,/@media\(max-width:600px\) and \(prefers-reduced-motion:reduce\)\{[^@]*body\.fab-away \.quickadd-fab,body\.fab-away \.chat-fab\{transform:none;\}/);
});

/* ===== Step 62: person tabs open on the person's work ===== */
const step62=stepBlock(62);

test('step 68a: every person tab puts the Event Hub before the sub-tabs and board',()=>{
  const boss=slice('<div class="two-col">\n    <div class="main-col">','<div class="side-col">');
  const tpl=source.slice(source.indexOf("function memberPanelHTML(w){"));
  const context=vm.createContext({MEMBERS:{dew:{},o:{},junior:{}}});
  vm.runInContext(tpl.slice(0,tpl.indexOf('\n}',tpl.indexOf('return'))+2),context);
  for(const [w,html] of [['boss',boss],...['dew','o','junior'].map(w=>[w,context.memberPanelHTML(w)])]){
    const hub=html.indexOf('class="evhub"'),nav=html.indexOf('class="sub-nav"');
    assert.ok(hub>=0&&nav>hub,w+': Event Hub before sub-tabs');
    assert.ok(nav<html.indexOf('id="'+w+'-sub-tasks"'),w+': sub-tabs before tasks');
    assert.ok(html.indexOf('class="filter-tabs"')<html.indexOf('id="'+w+'-list"'),w+': filters before board');
    assert.equal((html.match(/class="evhub"/g)||[]).length,1,w+': only one Event Hub');
    for(const action of ['toggleEvTimeline()','openEventModal()','toggleEvHub()'])assert.ok(html.includes(action),w+': keeps '+action);
  }
});

test('step 68a: Today mounts immediately after the name card, ahead of the main column',()=>{
  const mount=slice('  function mountMyDay(){','  function renderAllMyDay()');
  assert.match(mount,/slot.id=w\+'-myday'/);
  assert.match(mount,/head.parentNode.insertBefore\(slot,head.nextSibling\)/);
  assert.match(source,/<\/div>\n  <div class="two-col">\n    <div class="main-col">\n      <!-- Event Hub: under Today/);
  assert.match(source,/\+  '<\/div>'\n  \+  '<div class="two-col"><div class="main-col">'\n  \+    '<div class="evhub">/);
});

test('on iPhone: no Add Task bar, one row of filters, a one-line name card whose counters are still heard',()=>{
  assert.match(source,/<div class="addtask-bar"><button class="btn btn-accent" onclick="openAdd\('boss'\)">/);
  assert.match(source,/'<div class="addtask-bar"><button class="btn btn-accent" onclick="openAdd\(\\''\+w\+'\\'\)">/);
  const phone=media(step62,'max-width:600px');
  assert.match(phone,/\.tab-panel \.addtask-bar\{display:none;\}/,'the round "+" opens the same sheet');
  assert.match(phone,/\.tab-panel \.filter-tabs\{flex-wrap:nowrap;overflow-x:auto;/);
  for(const l of ['active','due soon','done'])assert.match(source,new RegExp('<b>0</b> <span class="mh-l">'+l+'</span></button>'));
  const one=media(step62,'min-width:361px) and (max-width:600px');
  assert.match(one,/\.member-head \.member-head-stats\{order:1;flex:0 0 auto;margin-left:auto;gap:5px;\}/);
  assert.match(one,/\.member-head \.mh-stat \.mh-l\{position:absolute;width:1px;height:1px;[^}]*clip:rect\(0 0 0 0\);/,'hidden from sight, not from screen readers');
  assert.match(one,/\.member-head \.member-role\{display:none;\}/);
});

/* ===== Step 63: colour on a card means a status, a person or the event ===== */
const step63=stepBlock(63);
const EVS=[{id:'sports-day',name:'Sports Day',color:'#d6336c',textColor:'#ffffff'},{id:'open-day',name:'School Open Day',color:'#4B8FD0'},
  {id:'party',name:'Staff Party'},{id:'book-week',title:'Book Week',color:'#0d9488'}];
const meta=html=>html.slice(html.indexOf('<div class="task-meta">'),html.indexOf('<i class="ti ti-arrow-up-right tc-open-hint"'));

test("one event tag: the event's own fill, a tint with a readable shade, or the quiet tag",()=>{
  assert.match(meta(card({...sample,eventId:'sports-day',eventName:'Sports Day'},{events:EVS})),
    /<span class="mb mb-event mb-event-filled" style="background:#d6336c;color:#ffffff;"><i class="ti ti-confetti"[^>]*><\/i> Sports Day<\/span>/,'its fill under its own text colour');
  const tint=meta(card({...sample,eventId:'open-day',eventName:'School Open Day'},{events:EVS}));
  const m=tint.match(/<span class="mb mb-event mb-event-tint" style="background:rgba\(75,143,208,0\.14\);--evc-ink:(#[0-9a-f]{6});--evc-ink-d:(#[0-9a-f]{6});">/);
  assert.ok(m,'a colour without a text colour: its tint, and a readable shade of it as the text');
  /* Step 66: measured on the tint the text sits on, not on the white card around it. */
  const over=(base,a)=>'#'+[75,143,208].map((c,k)=>Math.round(base[k]+(c-base[k])*a).toString(16).padStart(2,'0')).join('');
  assert.ok(contrast(m[1],over([255,255,255],0.14))>=4.5,'the light shade reads on its tint: '+m[1]+' on '+over([255,255,255],0.14));
  assert.ok(contrast(m[2],over([36,40,49],0.14))>=4.5,'the dark-mode shade reads on its tint: '+m[2]+' on '+over([36,40,49],0.14));
  for(const ev of [{id:'a',name:'A',color:'#e6a417'},{id:'b',name:'B',color:'#8e3ad6'},{id:'c',name:'C',color:'#0d9488'},{id:'d',name:'D',color:'#4B8FD0'},{id:'e',name:'E',color:'#697586'}]){
    const h=meta(card({...sample,eventId:ev.id,eventName:ev.name},{events:[ev]}));
    const q=h.match(/--evc-ink:(#[0-9a-f]{6});--evc-ink-d:(#[0-9a-f]{6});/);
    const rgb=[1,3,5].map(i=>parseInt(ev.color.slice(i,i+2),16));
    const on=base=>'#'+rgb.map((c,k)=>Math.round(base[k]+(c-base[k])*0.14).toString(16).padStart(2,'0')).join('');
    assert.ok(contrast(q[1],on([248,250,252]))>=4.5,ev.color+': '+q[1]+' on its light tint, even on a finished card');
    assert.ok(contrast(q[2],on([36,40,49]))>=5.3,ev.color+': '+q[2]+' on its dark tint, with room for a faded card');
  }
  assert.match(meta(card({...sample,eventId:'party',eventName:'Staff Party'},{events:EVS})),/<span class="mb mb-event"><i class="ti ti-confetti"[^>]*><\/i> Staff Party<\/span>/,'no colour: the quiet tag');
  assert.match(meta(card({...sample,eventName:'Old Event'},{events:EVS})),/<span class="mb mb-event"><i class="ti ti-confetti"[^>]*><\/i> Old Event<\/span>/,'a removed event keeps its name, quietly');
  assert.match(meta(card({...sample,eventId:'book-week',eventName:''},{events:EVS})),/mb-event-tint[^>]*><i class="ti ti-confetti"[^>]*><\/i> Book Week<\/span>/,'an older event saved with a title only');
  assert.match(step63,/\.mb-event:not\(\.mb-event-filled\):not\(\.mb-event-tint\)\{background:var\(--gray-light\);\}/);
  assert.match(step63,/html:not\(\.dark\) \.mb-event:not\(\.mb-event-filled\):not\(\.mb-event-tint\)\{color:var\(--text\);\}/);
  assert.match(step63,/html:not\(\.dark\) \.mb-event\.mb-event-tint\{color:var\(--evc-ink\);\}/);
  assert.match(step63,/html\.dark \.mb-event\.mb-event-tint\{color:var\(--evc-ink-d\);\}/,'the dark card uses the lighter shade (step 57)');
});

test('a shared card finds its event by name and wears the same tag as a personal card',()=>{
  const shared={id:'s1',topic:'Book the photographer',status:'pending',dueDate:'2026-11-02',eventLabel:'school open day ',__src:'event',assignees:['dew','o']};
  const html=meta(card(shared,{events:EVS}));
  const own=meta(card({...sample,eventId:'open-day',eventName:'School Open Day'},{events:EVS}));
  assert.equal(html.match(/<span class="mb mb-event[^>]*>/)[0],own.match(/<span class="mb mb-event[^>]*>/)[0],'found by name, whatever the case and spacing');
  assert.doesNotMatch(card(shared,{events:EVS}),/mb-evt/,'the second event chip is gone');
  assert.match(meta(card({...shared,eventLabel:'Christmas Fair'},{events:EVS})),/<span class="mb mb-event"><i class="ti ti-confetti"[^>]*><\/i> Christmas Fair<\/span>/,'an event not on the calendar is quiet');
});

test("a shared card names its people in ink, each with their initial in their colour",()=>{
  const shared={id:'s1',topic:'Book the photographer',status:'pending',__src:'event',eventLabel:'',assignees:['dew','junior']};
  const html=meta(card(shared,{names:{dew:'Dew',junior:'Eye'}}));
  assert.match(html,/<span class="mb mb-shared" title="Shared card\. A status change by anyone updates it for everyone\."><span class="mb-who" data-member="dew" aria-hidden="true">D<\/span><span class="mb-who" data-member="junior" aria-hidden="true">E<\/span> Shared · Dew, Eye<\/span>/);
  assert.match(meta(card({...shared,assignees:['o']},{names:{o:'O'}})),/<span class="mb-who" data-member="o" aria-hidden="true">O<\/span> O<\/span>/,'one person: the initial and the name');
  assert.match(meta(card({...shared,assignees:[]})),/<span class="mb mb-shared"><i class="ti ti-users-group"[^>]*><\/i> Unassigned<\/span>/);
  assert.match(step63,/\.mb-shared\{background:var\(--gray-light\);color:var\(--text\);\}/,'the names in ink, not blue');
  assert.match(step63,/\.mb-who\{[^}]*color:#fff;background:var\(--tm-c,var\(--navy,#003057\)\);\}/);
  for(const w of ['boss','dew','o','junior'])assert.match(step63,new RegExp('\\.mb-who\\[data-member="'+w+'"\\]\\{--tm-c:var\\(--member-'+w+'\\);\\}'));
  const root=css26.match(/:root\{--member-boss:(#[0-9A-Fa-f]{6});--member-dew:(#[0-9A-Fa-f]{6});--member-o:(#[0-9A-Fa-f]{6});--member-junior:(#[0-9A-Fa-f]{6});\}/);
  for(const c of root.slice(1))assert.ok(contrast('#ffffff',c)>=4.5,'a white initial reads on '+c);
  assert.match(source,/var ink=readable\(c,'#EFF3F9',4\.5\);/,'a custom colour is kept dark enough for a white initial');
});

test('due soon reads in ink with a clock, overdue stays red, and medium priority is quiet',()=>{
  const soon=meta(card({...sample,dueDate:'2026-10-30',priority:'medium'},{soon:true,du:2}));
  assert.match(soon,/<span class="mb mb-soon"><i class="ti ti-clock"[^>]*><\/i> 2 days left<\/span>/);
  assert.match(soon,/<span class="mb mb-med">/);
  assert.match(meta(card(sample)),/<span class="mb mb-overdue"><i class="ti ti-calendar"[^>]*><\/i> Overdue · was due 2026-10-25<\/span>/);
  assert.match(step63,/\.mb-soon,\.mb-wmsoon\{background:var\(--gray-light\);color:var\(--text\);\}/,'a watermark due this week reads the same');
  assert.match(step63,/\.task-card \.task-meta \.mb-soon\{color:var\(--text\);font-weight:700;\}/);
  assert.match(step63,/\.mb-med,\.mb-pending,\.mb-time,\.mb-rev\{background:var\(--gray-light\);color:var\(--muted\);\}/,'medium priority, a pending upload, a shoot time and a revision count are facts');
  assert.match(step63,/\.mb-req,\.mb-together\{background:var\(--navy-light\);color:var\(--navy\);\}/);
  assert.doesNotMatch(css26,/\.mb-soon\{background:var\(--amber-light\)/,'no amber due date left');
  assert.doesNotMatch(source,/html:not\(\.dark\) \.mb-together/,'no old rule keeps "Together" green');
});

test("Dew's design menu takes the theme's status colours, so Approved and In progress read in dark mode too",()=>{
  assert.match(source,/'In Progress':\['var\(--blue-light\)','var\(--blue\)'\]/);
  assert.match(source,/'Approved':\['var\(--green-light\)','var\(--green\)'\]/);
  const light=source.match(/html:not\(\.dark\)\{\n  --st-pending[^}]*\}/)[0],dark=source.match(/html\.dark\{\n  --st-pending[^}]*\}/)[0];
  const v=(blk,n)=>blk.match(new RegExp('--'+n+':([^;]+);'))[1];
  for(const n of ['blue','green'])assert.ok(contrast(v(light,n),v(light,n+'-light'))>=4.5,n+' reads on its tint in light mode');
  for(const n of ['blue','green'])assert.match(v(dark,n),/^#[0-9a-f]{6}$/,n+' has its own dark-mode ink');
  for(const n of ['blue','green'])assert.ok(contrast(v(dark,n),'#262b36')>=4.5,n+' reads on a dark card: '+v(dark,n));
});

test('the boards redraw when the events change, so a tag follows its event',()=>{
  assert.match(source,/eventsLoaded=true;renderEvHub\('boss'\);renderEvHub\('junior'\);evRedrawCards\(\);\}/);
  assert.match(source,/DATA\[k\]\.eventsLoaded=true;renderEvHub\(k\);evRedrawCards\(k\);\}/,'an older per-person event list redraws that person');
  const drawn=[];
  const c=vm.createContext({MEMBER_ORDER:['boss','dew','o','junior'],renderBoss:()=>drawn.push('boss'),renderMember:w=>drawn.push(w)});
  vm.runInContext(slice('function evRedrawCards(w){','// TASK MODAL').split('\n}\n')[0]+'\n}',c);
  c.evRedrawCards();assert.deepEqual(drawn,['boss','dew','o','junior']);
  drawn.length=0;c.evRedrawCards('o');assert.deepEqual(drawn,['o']);
});

test('the Event form previews the tag the cards will show',()=>{
  assert.match(source,/const tag=t\?\('mb mb-event mb-event-filled" style="background:'\+bg\+';color:'\+t\+';'\)\n    :\('mb mb-event mb-event-tint" style="background:'\+bg\+';--evc-ink:'\+evTagInk\(base\)\+';--evc-ink-d:'\+evTagInkDark\(base\)\+';'\);/,'the same shades as the card, measured on the tint (step 66)');
  assert.match(source,/\+'<span class="'\+tag\+'box-shadow:inset 0 0 0 1px '\+evTint\(base,0\.4\)\+';">/);
});

/* ===== Step 64: trim what says a thing twice or only helps a keyboard ===== */
const step64=stepBlock(64);

test('the search sheet closes with a real button: "ESC" on computers, "Cancel" on touch, and no keyboard hints there',()=>{
  assert.match(source,/<button type="button" class="cmdk-esc" onclick="closeCmdk\(\)" aria-label="Close search"><span class="cmdk-esc-k">ESC<\/span><span class="cmdk-esc-t">Cancel<\/span><\/button>/);
  const touch=media(step64,'max-width:600px),(hover:none) and (pointer:coarse');
  assert.match(touch,/\.cmdk-hint,\.uxp-mi-kbd\{display:none;\}/,'no ↑↓, ↵, N or / hints, and no "(Ctrl K)" in the "⋯" menu');
  assert.match(touch,/\.cmdk-esc\{min-height:44px;/,'Cancel is a full-size touch target');
  assert.match(touch,/\.cmdk-esc-k\{display:none;\}/);
  assert.match(touch,/\.cmdk-esc-t\{display:inline;\}/);
  assert.match(step64,/\.cmdk-esc-t\{display:none;\}/,'computers keep "ESC"');
  assert.match(source,/<i class="ti ti-search"><\/i> Search<span class="uxp-mi-kbd"> \(Ctrl K\)<\/span><\/button>'/);
  assert.match(source,/<button class="cmdk-trigger" onclick="openCmdk\(\)" title="Search and commands \(Ctrl K\)"/,'the shortcut is still named where a keyboard is likely');
  assert.match(source,/inp\.placeholder=\(window\.matchMedia&&matchMedia\('\(max-width:600px\)'\)\.matches\)\?'Tasks, events, notes, links':'Search tasks, events, notes or links';/,'beside Cancel a phone gets the short placeholder');
});

test('a countdown row says its days once: the big number, with a word only for today and tomorrow',()=>{
  const fn=slice('  function renderCountdown(){','\n  }\n')+'\n  }';
  const el={};const c=vm.createContext({document:{getElementById:()=>el},MarcomUI:{setHTML:(n,h)=>{n.html=h;}},MORDER:['boss'],
    eOf:()=>[{id:'a',name:'Fair',date:'d0'},{id:'b',name:'Book Week',date:'d1'},{id:'c',name:'Sports Day',date:'d5'}],
    dU:d=>({d0:0,d1:1,d5:5})[d],esc:s=>s,fdt:s=>s,evTextAttrs:cls=>' class="'+cls+'"',evDeleteButtonHTML:()=>'<button class="ev-chip-del"></button>'});
  vm.runInContext(fn+'\nthis.renderCountdown=renderCountdown;',c);
  c.renderCountdown();
  const rows=el.html.split(/(?=<div class="ov-cdn(?: soon)?" onclick)/);
  assert.equal(rows.length,3);
  assert.match(rows[0],/>0<\/div><div class="ov-cdn-u">days<\/div>.*<div class="ov-cdn-tag">Today<\/div>/);
  assert.match(rows[1],/>1<\/div><div class="ov-cdn-u">day<\/div>.*<div class="ov-cdn-tag">Tomorrow<\/div>/,'one day, singular');
  assert.match(rows[2],/>5<\/div><div class="ov-cdn-u">days<\/div>/);
  assert.doesNotMatch(rows[2],/ov-cdn-tag/,'no "5 days" pill beside the 5');
});

test('the payday panel says the days left once: the ring, with no count of days gone, second bar or badge',()=>{
  const strip=slice('<div class="salary-strip" id="salary-card">','<div id="sal-badge"></div>');
  assert.match(strip,/class="salary-days-big" id="sal-days"/,'the ring and its number stay');
  assert.match(strip,/Next Payday/);
  assert.match(strip,/Pay Period/);
  assert.doesNotMatch(strip,/Cycle Progress|sal-bar|days elapsed|sal-cycle/);
  assert.match(source,/_setH\('sal-badge',days===0\?'<span class="salary-badge sb-pay">Payday!<\/span>':''\);/,'"Payday!" on the day itself, no "Soon" or "On track"');
  assert.match(step64,/#sal-badge:empty\{display:none;\}/);
  assert.match(source,/var _card=document\.getElementById\('salary-card'\);if\(_card\)_card\.setAttribute\('data-pct',_pct\+'%'\);/);
  assert.doesNotMatch(source,/class="uxp-sal-mini"/,'the compact line keeps only the words');
});

test('the calendar setup note lives in Settings: Boss sees who is missing, everyone else their own calendar',()=>{
  assert.doesNotMatch(source,/Calendar not connected: /,'not on the Overview any more');
  assert.match(source,/\+'<div class="gcs-team" id="gcs-team" role="status"><\/div>'/);
  const paint=slice('  window.gcsPaintSettings=function(){','  function inject(){');
  const run=(role,cfg,missing)=>{const tm={textContent:''};
    const c=vm.createContext({window:{__cur:{role,workspace:'dew'},avlMissing:()=>missing},document:{getElementById:id=>id==='gcs-team'?tm:null,activeElement:null},
      myWs:()=>role==='admin'?'boss':'dew',cfgOf:()=>cfg,gcsConfigured:()=>!!(cfg&&cfg.url)});
    vm.runInContext(paint.replace('window.gcsPaintSettings=','this.paint='),c);c.paint();return tm.textContent;};
  assert.equal(run('admin',{url:'x'},['Dew','Eye']),'Not connected yet: Dew, Eye. Each person connects their own calendar here.');
  assert.equal(run('admin',{url:'x'},[]),"Everyone's calendar is connected.");
  assert.equal(run('designer',null,['Boss','Dew']),'Your calendar is not connected yet.','a member is not told about the others');
  assert.equal(run('designer',{url:'x'},[]),'Your calendar is connected.');
  assert.match(step64,/\.gcs-team:empty\{display:none;\}/);
});

test('on touch screens no delete button sits on every event tile and row; an event is deleted from its own page',()=>{
  const touch=media(step64,'hover:none');
  assert.match(touch,/\.ev-chip-del\{display:none;\}/,'hidden, not invisible: nothing to tap by accident');
  assert.match(touch,/\.ev-chip-date,\.ev-chip-name\{padding-right:0;\}/,'the names take the room back');
  assert.doesNotMatch(css26,/@media\(hover:none\)\{\.ev-chip-del\{opacity:1;\}\}/);
  assert.match(source,/window\.evChipClick=function\(id,who\)\{\n    if\(WS\.indexOf\(who\)>=0\)\{evwsOpenEvent\(who,id\);\}/,'a tap opens the event');
  assert.match(source,/class="btn btn-ghost btn-sm ews-del" onclick="quickDeleteEvent\(/,'whose page keeps Delete');
  assert.match(css26,/\.ev-chip:hover \.ev-chip-del,\.ev-chip:focus-within \.ev-chip-del,/,'computers still show it on hover and focus');
});

test('one greeting: My day on your own tab is "Today"',()=>{
  const own=myDay('dew',{tasks:[],own:true,hour:9});
  assert.match(own,/<span class="myday-greet">Today<\/span>/);
  assert.doesNotMatch(own,/Good (morning|afternoon|evening)/);
  assert.match(myDay('dew',{tasks:[]}),/<span class="myday-greet">Dew's day<\/span>/,'someone else\'s tab keeps its name');
  assert.doesNotMatch(shell,/id="ov-greet"/,'the Overview greeting is removed');
  assert.match(shell,/id="ov-datesub"/,'the date stays');
});

test('an empty status column is its header and its 0, with a drop area only while a card is dragged over it',()=>{
  const html=kanban=>kanban;
  assert.doesNotMatch(source,/No tasks<\/div>/);
  assert.match(source,/var body=cards\.map\(function\(t\)\{var h=taskCardHTML\(t,who\),L=tcLingerRec\(t,who\);/);
  assert.doesNotMatch(slice('function kanbanHTML(','function renderList('),/kb-empty|>No tasks</);
  assert.match(step64,/\.kb-col-body:empty\{min-height:0;padding:0!important;\}/);
  assert.match(step64,/\.kb-col\.kb-over>\.kb-col-body:empty\{min-height:56px;\}/);
  assert.match(source,/<div class="kb-col" data-status="'\+S\+'" ondragover="taskColOver\(event\)"/,'the whole column still takes a drop');
  void html;
});

/* ===== Step 65: polish ===== */
const step65=stepBlock(65);

test('iPhone: Upcoming Deadlines keeps its title, and its four filters get a row of their own',()=>{
  const phone=media(step65,'max-width:600px');
  assert.match(phone,/#panel-overview #ov-dl-card \.ov-card-head\{flex-wrap:wrap;row-gap:10px;\}/);
  assert.match(phone,/#panel-overview #ov-dl-card \.ov-dl-filters\{order:3;flex:1 1 100%;margin-left:0;\}/,'under the title and its fold button, so "7 days" is not cut off');
  assert.doesNotMatch(css26,/#ov-dl-title\{font-size:0/,'the title is no longer shrunk to its icon');
});

test('deadline rows are buttons: Tab reaches them and Enter or Space opens the task',()=>{
  assert.match(source,/<div class="ov-dl" role="button" tabindex="0" onkeydown="ovRowKey\(event\)" onclick="/);
  const c=vm.createContext({window:{}});
  vm.runInContext(slice('  window.ovRowKey=function(e){','\n')+'\n',c);
  let clicks=0,prevented=0;
  const ev=key=>({key,preventDefault:()=>prevented++,currentTarget:{click:()=>clicks++}});
  c.window.ovRowKey(ev('Enter'));c.window.ovRowKey(ev(' '));c.window.ovRowKey(ev('Tab'));c.window.ovRowKey(ev('a'));
  assert.equal(clicks,2,'Enter and Space open it');
  assert.equal(prevented,2,'and Space does not scroll the page');
  assert.match(step65,/#panel-overview \.ov-dl:focus-visible\{outline:2px solid var\(--focus-ink\);outline-offset:2px;border-radius:8px!important;\}/);
});

test('one set of left edges: every card title after the same chip, and flat rows starting at the card edge',()=>{
  assert.match(step65,/\.ov-team-title>i\.ti:first-child\{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:0 0 28px;/,'Team today wears the chip the other titles wear');
  assert.match(css26,/\.ov-card-title>i\.ti:first-child,\.widget-title>i\.ti:first-of-type\{\s*display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:0 0 28px;/);
  assert.match(step65,/html:not\(\.dark\) #ov-dl-card \.ov-dl,\nhtml:not\(\.dark\) #panel-overview \.ov-countdown \.ov-cdn,\nhtml:not\(\.dark\) #evb-card \.evb-row\{padding-left:0;padding-right:0;\}/);
  assert.match(step65,/box-shadow:-11px 0 0 var\(--surface-3\),11px 0 0 var\(--surface-3\)!important;/,'the hover tint reaches into the card padding');
  assert.match(step65,/html:not\(\.dark\) #evb-card \.evb-g-h\{width:calc\(100% \+ 24px\);margin-left:-12px;margin-right:-12px;\}/);
  assert.match(step65,/html:not\(\.dark\) #evb-card \.evb-g\{overflow:visible;\}/,'the fold animation still clips while it runs (ui-motion sets it inline)');
  assert.match(readFileSync(new URL('../assets/ui-motion.js',import.meta.url),'utf8'),/animate\.style\.overflow = 'hidden';/);
});

test("a widget's name keeps its place when it unfolds; the Overview columns end together",()=>{
  assert.match(step65,/\.widget-title>\.wmove\{order:2;margin:0 0 0 8px;\}/,'the reorder arrows follow the name');
  assert.match(source,/titleEl\.insertAdjacentHTML\('afterbegin',\s*'<span class="wmove">'/,'they are still the first element, moved by order only');
  const desk=media(step65,'min-width:981px');
  assert.match(desk,/#panel-overview \.ov-grid\{align-items:stretch;\}/);
  assert.match(desk,/#panel-overview :is\(\.ov-col-main,\.ov-col-side\)>\.ov-card:last-child:not\(\.uxp-collapsed\)\{flex-grow:1;\}/);
});

test('folded Overview cards are excluded from the last-card grow rule',()=>{
  const desk=media(step65,'min-width:981px');
  const growRules=desk.match(/[^{}]+\{flex-grow:1;\}/g)||[];
  assert.equal(growRules.length,1);
  assert.match(growRules[0],/\.ov-card:last-child:not\(\.uxp-collapsed\)/,'folded cards shrink to their header');
  assert.doesNotMatch(desk,/>\.ov-card:last-child\{flex-grow:1;\}/);
});

test('"⋯" sits beside Details or below the tick without adding a row',()=>{
  const withDetails=card(sample);
  assert.match(withDetails,/<div class="tc-bar"><button type="button" class="tc-more"[^]*?<\/button><button type="button" class="tc-acts-btn"/,'Details and "⋯" share the bar');
  assert.doesNotMatch(withDetails.slice(withDetails.indexOf('<div class="task-meta">'),withDetails.indexOf('tc-open-hint')),/tc-acts-btn/);
  const bare=card({...sample,description:'',links:[]});
  assert.doesNotMatch(bare,/class="tc-bar"/,'no footer row without details');
  const meta=bare.slice(bare.indexOf('<div class="task-meta">'),bare.indexOf('<i class="ti ti-arrow-up-right tc-open-hint"'));
  assert.match(meta,/<button type="button" class="tc-acts-btn" aria-expanded="false" aria-label="More actions for this task" title="More actions" onclick="event\.stopPropagation\(\);tcToggleActs\(this,'dew_t1'\)"><i class="ti ti-dots"><\/i><\/button><\/span><\/div><div class="role-x">/,'its keyboard position follows the facts');
  assert.equal((bare.match(/tc-acts-btn/g)||[]).length,1);
  const step68=stepBlock(68);
  assert.match(meta,/<span class="tc-facts-end"><button/,'the bare card has an actions group in the tick column');
  assert.match(step68,/\.task-card \.tc-facts-end\{position:absolute;top:0;left:calc\(-1 \* var\(--tc-name-inset\)\);width:calc\(var\(--tc-name-inset\) - 10px\);display:flex;justify-content:center;\}/);
  assert.match(step68,/\.task-card \.task-meta\{position:relative;margin-left:var\(--tc-name-inset\);\}/);
  assert.doesNotMatch(step68,/flex-basis:100%/,'actions add no row of their own');
  assert.doesNotMatch(step65,/task-meta>\.tc-acts-btn\{position:absolute/);

});

test('the Director request is one quote and one action',()=>{
  assert.match(step65,/html:not\(\.dark\) \.task-card \.dirq,html\.dark \.task-card \.dirq\{margin-top:10px;padding:0 0 0 12px;border:0!important;\s*border-left:3px solid #d98324!important;border-radius:0!important;background:none!important;box-shadow:none!important;\}/);
  assert.match(step65,/\.dirq-h\{font-size:12px;font-weight:600;letter-spacing:0;text-transform:none;color:var\(--muted\);\}/,'a quiet label, not an amber banner');
  assert.match(step65,/\.dirq-i\{margin-top:4px;padding-top:0;border-top:0;\}/,'no dashed rule');
  assert.match(step65,/\.dirq-ok\{margin-top:4px;min-height:32px;padding:0;border:0;border-radius:6px;background:none;color:var\(--navy\);font-size:13px;\}/,'one quiet action');
  assert.doesNotMatch(source+css26,/\.dirq-n(?![\w-])|class="dirq-n"/,'no count badge');
  assert.ok(contrast('#003057','#ffffff')>=4.5&&contrast('#8fb4dc','#262b36')>=4.5);
});

test('deadline priorities at 13px beside a 13px date; Low is as quiet as Medium',()=>{
  assert.match(step65,/#panel-overview #ov-dl-card \.ov-dl-sub\{font-size:13px;\}/);
  assert.match(step65,/#panel-overview \.ov-pri\{font-size:13px!important;font-weight:600;padding:0;background:none!important;\}/);
  assert.match(step65,/#panel-overview \.ov-pri\.low\{color:#636e7e!important;\}/);
  assert.ok(contrast('#636e7e','#ffffff')>=4.5);
});

test('a round focus ring in the search field; one calendar style on every tab',()=>{
  assert.match(step65,/#cmdk-input\{border-radius:8px;\}/);
  assert.match(step65,/#cmdk-input:focus-visible\{outline:2px solid var\(--focus-ink\);outline-offset:4px;\}/);
  assert.match(step65,/#panel-overview \.ov-cal-grid \.cal-day\{background:transparent;\}/,'no grey tile per day on the Overview');
  assert.match(step65,/html\.dark \.cal-day\.today\{color:#fff;\}/);
  assert.doesNotMatch(source,/body\.theme-dew \.cal-day\.today|body\.theme-dew \.cd-normal/,'today and deadline dots are navy on every tab, as the legends say');
  assert.doesNotMatch(css26,/\.cal-day\.today\{color:var\(--accent-on/);
});

test('a task ticked done stays in its column for a moment, at its height, then moves',()=>{
  const timers=[];let redraws=[];
  const card={getBoundingClientRect:()=>({height:168})};
  const c=vm.createContext({window:{},setTimeout:(fn,ms)=>timers.push({fn,ms}),evRedrawCards:w=>redraws.push(w),
    document:{querySelector:sel=>/#panel-boss \.kb-col \.task-card\[data-id="t1"\]/.test(sel)?card:null}});
  c.window.CSS=c.CSS={escape:s=>s};
  vm.runInContext(slice('window.__tcLinger={};','function kbFilterPass(').replace(/window\.tcToggleActs[\s\S]*$/,'')+'\nthis.tcLinger=tcLinger;this.tcLingerFrom=tcLingerFrom;this.tcLingerRec=tcLingerRec;',c);
  const t={id:'t1',status:'done'};
  c.tcLinger('boss','t1','pending');
  assert.equal(c.tcLingerFrom(t,'boss'),'pending','shown in its old column');
  assert.equal(c.tcLingerRec(t,'boss').h,168,'at the height it had');
  assert.equal(c.tcLingerFrom(t,'dew'),'','only on the board where it was ticked');
  assert.equal(timers[0].ms,1400);
  c.tcLinger('boss','t1','done');
  assert.equal(c.tcLingerFrom(t,'boss'),'pending','a quick undo keeps it where it is shown');
  timers[0].fn();assert.deepEqual(redraws,[],'the first timer no longer owns it');
  timers[1].fn();assert.deepEqual(redraws,['boss'],'then the board redraws');
  assert.equal(c.tcLingerFrom(t,'boss'),'','and the card goes to its column');
  assert.match(source,/  tcLinger\(who,id,t\.status\|\|'pending'\);\n  rf\.doc\(id\)\.update/,'the tick starts it');
  const kb=slice('function kanbanHTML(','function renderList(');
  assert.match(kb,/tasks\.filter\(function\(t\)\{return \(tcLingerFrom\(t,who\)\|\|t\.status\|\|'pending'\)===S;\}\)/);
  assert.match(kb,/filter\(function\(t\)\{return !!tcLingerFrom\(t,who\)\|\|kbFilterPass\(t,filter\);\}\)/,'a filter does not drop it mid-moment');
  assert.match(source,/function act\(w\)\{try\{return \(tasksOf\(w\)\|\|\[\]\)\.filter\(function\(t\)\{return \(t\.status!=='done'&&t\.status!=='canceled'\)\|\|\(typeof tcLingerFrom==='function'&&!!tcLingerFrom\(t,w\)\);\}\);/,'"Today" above the board waits too');
});

test('the app opens on navy: the font and icon style sheets no longer hold back the first paint',()=>{
  const head=source.slice(0,source.indexOf('<body>'));
  for(const url of ['fonts.googleapis.com/css2?family=Plus+Jakarta+Sans','fonts.googleapis.com/css2?family=Sarabun','tabler-icons.min.css']){
    const tags=head.match(new RegExp('<link[^>]*'+url.replace(/[.?+]/g,'\\$&')+'[^>]*>','g'));
    assert.equal(tags.length,2,url+': loaded once, with a fallback for no script');
    assert.match(tags[0],/media="print" onload="this\.media='all'"/,url+' does not block the first paint');
  }
  assert.match(head,/<noscript><link href="https:\/\/fonts\.googleapis\.com/);
  assert.match(head,/html:not\(\.booted\),html.dark:not\(\.booted\)\{background:#00223C;\}/,'the first paint is navy in both themes');
  assert.match(source,/function liftCover\(\)\{ var c=el\('boot-cover'\); if\(!c\|\|c\.classList\.contains\('done'\)\)return; try\{document\.documentElement\.classList\.add\('booted'\);\}catch\(e\)\{\}/);
});

/* Step 67: completion remembers the status and leaves Today rows in place. */
function doneFixture(task){
  const writes=[],toasts=[],lingers=[];
  const c=vm.createContext({tasksOf:()=>[task],taskRef:()=>({doc:()=>({update:fields=>{writes.push({...fields});return Promise.resolve();}})}),
    todayStr:()=> '2026-10-26',stampEdit:()=>({edited:true}),dbSaveFailed:()=>{},
    tcLinger:(...args)=>lingers.push(args),uiToast:(msg,opts)=>toasts.push({msg,...opts})});
  vm.runInContext(slice('function taskDoneFields(','/* Step 65: a task ticked done')+'\n'+slice('function setTaskStatus(','\n'),c);
  return {c,writes,toasts,lingers};
}
test('completion saves the earlier status and Undo restores it before or after the snapshot arrives',()=>{
  const task={id:'a',status:'waiting',topic:'x'.repeat(41)};
  const {c,writes,toasts,lingers}=doneFixture(task);
  c.toggleTaskDone('dew','a');
  assert.deepEqual(writes[0],{status:'done',done:true,statusBefore:'waiting',doneOn:'2026-10-26',edited:true});
  assert.equal(toasts[0].msg,'Done: '+'x'.repeat(40)+'…');
  assert.equal(toasts[0].duration,6000);
  toasts[0].undo();
  assert.deepEqual(writes[1],{status:'waiting',done:false,doneOn:null,edited:true});
  Object.assign(task,writes[0]);
  toasts[0].undo();
  assert.deepEqual(writes[2],writes[1]);
  assert.equal(lingers.length,3,'Undo also preserves the lingering card');
});
test('un-ticking restores a valid earlier status or pending without a toast',()=>{
  for(const statusBefore of ['pending','in-progress','waiting','on-hold',undefined,'canceled','done']){
    const {c,writes,toasts}=doneFixture({id:'a',status:'done',statusBefore});
    c.toggleTaskDone('dew','a');
    assert.deepEqual(writes[0],{status:['pending','in-progress','waiting','on-hold'].includes(statusBefore)?statusBefore:'pending',done:false,doneOn:null,edited:true});
    assert.equal(toasts.length,0);
  }
});
test('the status menu saves completion metadata from in-progress',()=>{
  const {c,writes}=doneFixture({id:'a',status:'in-progress'});
  c.setTaskStatus('dew','a','done');
  assert.deepEqual(writes[0],{status:'done',done:true,statusBefore:'in-progress',doneOn:'2026-10-26',edited:true});
  const already=doneFixture({id:'a',status:'done'});
  already.c.setTaskStatus('dew','a','done');
  assert.deepEqual(already.writes[0],{status:'done',done:true,edited:true},'selecting done again keeps existing completion metadata');
});
test('Today keeps completed rows in their original groups and positions with open counts only',()=>{
  const tasks=[
    {id:'a',status:'waiting',topic:'First late',dueDate:'2026-10-24'},
    {id:'b',status:'pending',topic:'Second late',dueDate:'2026-10-25'},
    {id:'c',status:'pending',topic:'Third late',dueDate:'2026-10-25'},
    {id:'d',status:'pending',topic:'Today task',dueDate:'2026-10-26'}
  ];
  const before=myDay('dew',{tasks});
  Object.assign(tasks[0],{status:'done',doneOn:'2026-10-26'});
  const after=myDay('dew',{tasks});
  assert.match(after,/class="myday-row done"[^>]*><i class="ti ti-circle-check"><\/i><span class="md-title">First late<\/span><span class="md-sub">done/);
  assert.match(after,/<b>2<\/b> overdue/);
  assert.match(after,/class="myday-chip ok"[^>]*><b>1<\/b> done today/);
  assert.equal((before.match(/class="myday-row /g)||[]).length,(after.match(/class="myday-row /g)||[]).length);
  assert.ok(after.indexOf('First late')<after.indexOf('Second late'));
  assert.doesNotMatch(after,/Third late/);
  Object.assign(tasks[3],{status:'done',doneOn:'2026-10-26'});
  const allDone=myDay('dew',{tasks:[tasks[0],tasks[3]]});
  assert.equal((allDone.match(/class="myday-row done"/g)||[]).length,2);
  assert.match(allDone,/<b>2<\/b> done today/);
  assert.doesNotMatch(allDone,/myday-chip (bad|warn)/);
  assert.doesNotMatch(myDay('dew',{tasks:[{...tasks[0],doneOn:'2026-10-25'}]}),/First late|done today/);
});
test('finished Today styles strike the title and green chips meet contrast in both themes',()=>{
  const css=stepBlock(67);
  assert.match(css,/\.myday-row\.done \.md-title\{text-decoration:line-through;/);
  for(const [selector,ink,bg] of [['.myday-chip.ok','#166534','#dcfce7'],['html.dark .myday-chip.ok','#86efac','#143523']]){
    assert.ok(css.includes(selector+'{background:'+bg));
    assert.ok(css.includes('color:'+ink));
    assert.ok(contrast(ink,bg)>=4.5);
  }
});

/* Step 72a: chosen member colours reach identity text in both modes. */
function pickerIdentityFixture(chosen){
  const sheet={textContent:''};
  const c=vm.createContext({document:{getElementById:id=>id==='tc-themes'?sheet:null,
    body:{lastElementChild:sheet}}});
  const picker=slice('<script id="theme-picker-2026">','</script>');
  vm.runInContext(picker.slice(picker.indexOf('  var PAL='),picker.indexOf('  function getDb(')),c);
  c.chosen=chosen;
  c.apply();
  return {css:sheet.textContent,c};
}
test('chosen colours override member identity shades with readable light and dark ink',()=>{
  for(const w of ['boss','best','dew','o','junior']){
    const color='#12A4A0';
    const {css,c}=pickerIdentityFixture({[w]:color});
    const ink=c.readable(color,'#EFF3F9',4.5);
    const bright=c.readable(color,'#26374b',4.5);
    const identity='#panel-'+w+' :is(#'+w+'-headname,.member-name,.member-role,.member-role i,.mh-greet,.evhub-title)';
    assert.ok(css.includes('html:not(.dark) '+identity+'{color:'+ink+'!important;}'),w+' light identity');
    assert.ok(css.includes('html.dark '+identity+'{color:'+bright+'!important;}'),w+' dark identity');
    assert.ok(contrast(ink,'#ffffff')>=4.5,w+' ink reads on white');
    assert.ok(contrast(bright,'#26374b')>=4.5,w+' bright reads on dark cards');
    assert.ok(!css.includes('#panel-'+(w==='dew'?'boss':'dew')+' '),'unchosen identities keep their defaults');
  }
});
test('without a chosen colour the picker writes no identity overrides',()=>{
  assert.equal(pickerIdentityFixture({}).css,'');
});

/* ===== Step 68: the tick and actions stay on the left ===== */
test('the tick is the first keyboard control, then the existing card controls',()=>{
  for(const details of [true,false]){
    const html=card({...sample,description:details?'More':'',links:[]});
    const controls=[...html.matchAll(/<(button|select|a)\b[^>]*>/g)].map(m=>m[0]);
    assert.match(controls[0],/class="task-check /);
    assert.match(controls[1],/class="tcard-sel"/);
    assert.ok(html.indexOf('task-check')<html.indexOf('task-topic'));
    assert.doesNotMatch(html,/tabindex=/,'native keyboard order');
  }
});

test('facts and footer align under the name at desktop and phone tick widths',()=>{
  const block=stepBlock(68);
  assert.match(block,/--tc-name-inset:35px/,'25px tick plus 10px gap');
  assert.match(media(block,'max-width:640px'),/--tc-name-inset:50px/,'40px touch tick plus 10px gap');
  assert.match(block,/\.tc-bar\{margin-left:var\(--tc-name-inset\);justify-content:flex-start;/);
});

/* Step 71: the date and work lead the desktop screen. */
test('desktop Add Task follows the filters and Today dates follow task names',()=>{
  const boss=slice('<div class="sub-panel" id="boss-sub-tasks">','<!-- Links sub-panel -->');
  const member=slice("'<div class=\"sub-panel\" id=\"'+w+'-sub-tasks\">'","'<div class=\"sub-panel\" id=\"'+w+'-sub-links\"");
  for(const markup of [boss,member]){
    assert.ok(markup.indexOf('class="addtask-bar"')>markup.indexOf('data-f="canceled"'));
    assert.match(markup,/class="addtask-bar"><button[^>]+onclick="openAdd\(/);
    assert.doesNotMatch(markup.slice(markup.indexOf('class="addtask-bar"')),/setFilter\(/);
  }
  const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8').split('/* Step 71:')[1];
  assert.match(css,/@media\(min-width:981px\)/);
  assert.match(css,/\.filter-tabs \.addtask-bar\{margin-left:auto;flex:0 0 auto;/);
  assert.match(css,/background:#10243a!important;.*color:#fff!important/);
  assert.match(css,/\.myday-row \.md-sub\{margin-left:0;flex:0 0 auto;/);
  assert.match(source,/dateLabel=DOW\[n.getDay\(\)\]/);
  assert.doesNotMatch(slice('window.ovDaily=function(){','/* quick actions */'),/Good morning|Good afternoon|Good evening|ov-greet/);
});


test('step 72b keeps high priority in readable quiet ink; step 78 restores the gold payday ring',()=>{
  const block=stepBlock('72b');
  for(const [ink,bg] of [['#34445c','#ffffff'],['#34445c','#e5e7eb'],['#4b5563','#ffffff'],['#003057','#ffffff'],['#ffffff','#003057']]){
    assert.ok(contrast(ink,bg)>=4.5,ink+' on '+bg);
  }
  assert.match(block,/html:not\(\.dark\) \.uxp-undo\{color:#fff;font-weight:800;text-decoration:underline;/);
  assert.match(block,/\.ov-pri\.high\{background:transparent!important;color:#34445c!important;font-weight:800;/);
  assert.match(block,/\.cd-urgent\{background:transparent!important;border:1.5px solid #003057/);
  assert.match(block,/\.myday-chip\.warn\{background:#e5e7eb/);
  assert.match(source,/<span class="ov-pri high"><i class="ti ti-arrow-up" aria-hidden="true"><\/i>High/);
  assert.match(source,/<span class="mb mb-high"><i class="ti ti-arrow-up"/);
  assert.doesNotMatch(block,/html\.dark/,'colour overrides only apply in light mode');
});

/* Step 72c: quiet widgets without changing member identity colours. */
test('step 72c palette omits brand swatches while saved colours still apply',()=>{
  const {css,c}=pickerIdentityFixture({boss:'#D99A0F',o:'#003057'});
  assert.equal(c.PAL.length,8);
  for(const entry of c.PAL) assert.ok(!['#003057','#D99A0F'].includes(entry.c.toUpperCase()));
  assert.ok(css.includes('--accent:#D99A0F;'));
  assert.ok(css.includes('--accent:#003057;'));
  for(const [w,color] of [['boss','#D99A0F'],['o','#003057']]){
    const ink=c.readable(color,'#EFF3F9',4.5);
    assert.ok(css.includes('#'+w+'-headname,.member-name,.member-role'));
    assert.ok(contrast(ink,'#EFF3F9')>=4.5);
  }
});

test('Reset Year lives in the open widget body for Boss and the member template',()=>{
  const widgets=[...source.matchAll(/<div class="widget sick-widget">([\s\S]*?)Reset Year<\/button>/g)];
  assert.equal(widgets.length,2);
  for(const [,markup] of widgets){
    assert.ok(markup.indexOf('widget-body')<markup.indexOf('confirmReset('));
    assert.ok(markup.includes('widget-body'));
    assert.doesNotMatch(markup.slice(0,markup.indexOf('widget-body')),/confirmReset/);
  }
});

test('Reset Year asks before deleting sick records',()=>{
  const nodes=Object.fromEntries(['confirm-title','confirm-msg','confirm-ok','confirm-overlay'].map(id=>[id,{textContent:'',classList:{add(value){this.value=value;}}}]));
  let deletions=0;
  const c=vm.createContext({document:{getElementById:id=>nodes[id]},sickOf:()=>[{id:'sample'}],memberName:()=> 'Boss',doReset:()=>{deletions++;}});
  vm.runInContext(slice("let resetWho='boss';",'function closeConfirm()'),c);
  c.confirmReset('boss');
  assert.equal(deletions,0);
  assert.equal(nodes['confirm-overlay'].classList.value,'open');
  assert.match(nodes['confirm-msg'].textContent,/delete all 1 sick day/);
  nodes['confirm-ok'].onclick();
  assert.equal(deletions,1);
});

test('step 72c quiet widget tiles and outline actions meet AA contrast',()=>{
  const block=stepBlock('72c');
  assert.match(block,/\.side-col \.widget-title>i\.ti:first-of-type/);
  assert.match(block,/color:#34445c!important;background:#e5e7eb!important/);
  assert.match(block,/\.widget-head \.btn/);
  assert.match(block,/\.task-card \.story-email-btn/);
  assert.match(block,/background:transparent!important;border:1px solid #34445c!important;box-shadow:none!important/);
  assert.doesNotMatch(block,/member-name|member-role|headname/);
  for(const bg of ['#ffffff','#e5e7eb','#EFF3F9']) assert.ok(contrast('#34445c',bg)>=4.5);
  assert.match(source,/class="task-link role-btn story-email-btn" onclick="openStoryEmail/);
});
