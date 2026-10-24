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
