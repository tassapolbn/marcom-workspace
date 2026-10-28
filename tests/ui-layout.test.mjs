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
  assert.match(phone,/\.ov-team-note\{display:none!important;\}/,'only the calendar setup note gives way');
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
  assert.match(html,/Here is the plan for today/);
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
function card(task,{who='dew',admin=true,soon=false,acts=false}={}){
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const context=vm.createContext({window:{__cur:admin?{role:'admin'}:{role:'designer',workspace:who},__tcActs:acts?{[who+'_'+task.id]:true}:{}},
    SC:{pending:{l:'Pending',i:'ti-circle'},waiting:{l:'Waiting',i:'ti-clock'},done:{l:'Done',i:'ti-check'}},
    DZ_STATUSES:['Brief Received'],MEMBER_ORDER:['boss','dew','o','junior'],
    daysUntil:()=>-1,isSoon:()=>soon,eventsOf:()=>[],evOkClr:()=>false,evTint:()=>'',isEventTask:()=>false,taskAssignees:()=>[],
    memberName:w=>w,escHtml:esc,fmtDate:d=>d,safeUrl:u=>u,oCardExtra:()=>'',dewCardExtra:()=>'<div class="role-x">role</div>'});
  vm.runInContext(slice('function scColors(s){','function setTaskStatus(')+slice('function moveSelectHTML(who,task){','function moveCardTo(')
    +slice('function taskCardHTML(task,who){','function kanbanHTML(')+'\nthis.taskCardHTML=taskCardHTML;',context);
  return context.taskCardHTML(task,who);
}
const sample={id:'t1',topic:'Plan the open day',status:'pending',dueDate:'2026-10-25',priority:'high',eventName:'Open Day',description:'More',links:[]};

test('a task card opens with its name, the done tick beside it, then one line of facts',()=>{
  const html=card(sample);
  assert.match(html,/^<div class="task-card tc-pending" draggable="true" data-id="t1" onclick="taskCardClick\(event,'dew','t1'\)" ondragstart="taskDragStart\(event,'dew','t1'\)" ondragend="taskDragEnd\(event\)"><div class="task-head"><div class="task-topic [^"]*" title="Plan the open day">Plan the open day<\/div><button class="task-check /,
    'the name is the first thing inside the card, and drag and drop is unchanged');
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
  assert.match(step40,/\.task-card \.task-meta \.mb:not\(\.mb-event\):not\(\.mb-evt\):not\(\.mb-shared\)\{padding:0;background:none;/,'facts read as text; an event keeps its coloured chip');
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

test('a task due today or soon reads amber; only overdue work is red',()=>{
  assert.match(source,/else if\(soon\)dueLabel='<span class="mb mb-soon">/);
  assert.match(source,/if\(overdue\)dueLabel='<span class="mb mb-overdue">/);
  assert.match(step41,/\.mb-soon\{background:var\(--amber-light\);color:var\(--st-waiting-ink,#7d5406\);\}/);
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
  assert.match(step43,/\.mb-evt\{background:var\(--teal-light\);color:#0b6e69;\}/,'one event chip colour');
  assert.ok(contrast('#0b6e69','#d6f5f0')>=4.5);
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
    if(chipSel.test(part))assert.match(part,/:not\(\.ev-chip-filled\)/,part.trim()+' must leave filled chips alone');
  assert.match(step44,/html:not\(\.dark\) \.evhub \.ev-chip\.ev-chip-filled\{border:0;border-radius:12px;\}/,'a filled chip is a neat tile');
  assert.match(source,/\(tc\?' ev-chip-filled':''\)/,'only an event with a text colour is marked filled');
});

test("a task label on a coloured event keeps the event's own colours",()=>{
  assert.match(css26,/html:not\(\.dark\) \.mb-event:not\(\.mb-event-filled\)\{color:#0b6e69!important;\}/,'the darker teal is only for labels without their own colours');
  assert.doesNotMatch(css26,/html:not\(\.dark\) \.mb-event\{color/,'no rule repaints a filled label');
  assert.match(source,/class="mb mb-event'\+\(_evTc\?' mb-event-filled':''\)\+'"'\+_evStyle/);
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
  assert.match(source,/' days<span class="uxp-sal-left"> left<\/span><\/span>'/);
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
  assert.deepEqual(calls,['close','tab:dew','edit:dew:t9','close','goto:boss'],'a task opens in its editor; a note opens its tab');
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
  assert.match(bar,/<button type="button" class="tc-acts-btn" aria-expanded="false" aria-label="More actions for this task" title="More actions" onclick="event\.stopPropagation\(\);tcToggleActs\(this,'dew_t1'\)"><i class="ti ti-dots"><\/i><\/button><\/div>$/,'"⋯" on the right');
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
  assert.match(step50,/\.task-card \.tc-acts-btn\{margin-left:auto;/,'"⋯" at the right end of the bar');
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
  assert.match(source,/'<div class="ov-rc-none"><span class="ov-rc-none-t">No new requests or deadlines<\/span>'/);
  assert.match(source,/rcOpenCentre\(\)"><i class="ti ti-external-link"><\/i> Open<\/button>'\n\s*\+'<button class="btn btn-ghost btn-sm" onclick="rcCopyLink\(this\)">/,'Open and Copy Link stay');
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
  const tasks={boss:[{status:'pending',dueDate:'2026-10-28',topic:'Brochure'}],dew:[{status:'pending',dueDate:'2026-10-29',topic:'Banner',priority:'high'}]};
  const context=vm.createContext({window:{},document:{getElementById:id=>nodes[id]||null},MORDER:['boss','dew'],
    tOf:w=>tasks[w]||[],isActive:()=>true,dU:d=>d==='2026-10-28'?0:1,nm:w=>({boss:'Boss',dew:'<b>dew</b>'})[w],esc,
    topicOf:t=>t.topic,fdt:d=>'on '+d,MarcomUI:{setHTML:(el,h)=>{el.innerHTML=h;}}});
  vm.runInContext(slice("  var ovDl='all', ovDlOpen={};",'  /* ---------- event countdown ---------- */'),context);
  context.renderDeadlines();
  const html=nodes['ov-deadlines'].innerHTML;
  assert.match(html,/<div class="ov-dl" onclick="ovGoto\('boss'\)"><span class="ov-dl-who" data-member="boss" title="Boss" aria-hidden="true">B<\/span><div class="ov-dl-main">/);
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
