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

test('announcements start with the composer folded behind a New button',()=>{
  assert.match(shell,/class="ov-card ov-ann ov-ann-closed" id="ov-ann-card"/);
  assert.match(shell,/id="ov-ann-new" aria-expanded="false" aria-controls="ov-ann-compose" onclick="ovAnnCompose\(\)"/);
  assert.match(shell,/class="ov-ann-compose" id="ov-ann-compose"/);
});

test('one Resources card holds the three link cards as tabs',()=>{
  const card=shell.slice(shell.indexOf('id="ov-resx-card"'),shell.indexOf('id="ov-act-card"'));
  assert.equal((card.match(/role="tab"/g)||[]).length,3);
  assert.match(card,/id="ov-resx-links" aria-labelledby="ov-resx-tab-links">/);
  assert.match(card,/id="ov-resx-brand" aria-labelledby="ov-resx-tab-brand" hidden>/);
  assert.match(card,/id="ov-resx-assets" aria-labelledby="ov-resx-tab-assets" hidden>/);
  assert.ok(card.indexOf('id="ov-res-card"')>card.indexOf('id="ov-resx-links"'),'department links sit inside the first tab');
  assert.match(source,/more:\['ov-resx-card','ov-menu-card','ov-act-card','sscal-card'\]/);
});

function fakeTabs(){
  const nodes={};
  ['links','brand','assets'].forEach(t=>{
    nodes['ov-resx-tab-'+t]={attrs:{},tabIndex:0,classList:{set:new Set(),toggle(n,on){on?this.set.add(n):this.set.delete(n);}},
      setAttribute(k,v){this.attrs[k]=v;},focus(){nodes.focused=t;}};
    nodes['ov-resx-'+t]={hidden:false};
  });
  return nodes;
}
test('switching a Resources tab shows exactly one panel and remembers it',()=>{
  const nodes=fakeTabs(),stored={};
  const context=vm.createContext({fmtDate:String,window:{},document:{getElementById:id=>nodes[id]||null},
    localStorage:{setItem:(k,v)=>{stored[k]=v;},getItem:k=>stored[k]||null}});
  vm.runInContext(slice('  var RES_TABS=','  function ovResTabRestore(){'),context);
  context.window.ovResTab('brand');
  assert.equal(nodes['ov-resx-brand'].hidden,false);
  assert.equal(nodes['ov-resx-links'].hidden,true);
  assert.equal(nodes['ov-resx-assets'].hidden,true);
  assert.equal(nodes['ov-resx-tab-brand'].attrs['aria-selected'],'true');
  assert.equal(nodes['ov-resx-tab-links'].tabIndex,-1);
  assert.equal(stored.ov_res_tab,'brand');
  context.window.ovResTab('nope',true);
  assert.equal(nodes['ov-resx-links'].hidden,false,'an unknown tab falls back to links');
  assert.equal(nodes.focused,'links');
});

function announcements(items){
  const list={innerHTML:''},card={on:new Set(),classList:{toggle(n,on){on?card.on.add(n):card.on.delete(n);},remove(n){card.on.delete(n);}}};
  const context=vm.createContext({fmtDate:String,window:{},document:{getElementById:id=>id==='ov-ann-list'?list:id==='ov-ann-card'?card:null},
    annItems:items,buildAuthorOptions(){},esc:s=>String(s)});
  vm.runInContext(slice('  var ovAnnAll=false;','  function saveAnn(items){')+'\nthis.renderAnnouncements=renderAnnouncements;',context);
  context.renderAnnouncements();
  return {list,card,toggle:()=>context.window.ovAnnShowAll()};
}
const count=html=>(html.match(/class="ov-ann-item/g)||[]).length;

test('the Overview shows the pinned or newest announcement on one line; its text and All N open the full list',()=>{
  const items=Array.from({length:5},(_,i)=>({id:'a'+i,text:'Note '+i,author:'Boss',createdAt:new Date(2026,9,20+i).toISOString(),pinned:i===1}));
  const {list,card,toggle}=announcements(items);
  assert.equal(count(list.innerHTML),1);
  assert.match(list.innerHTML,/class="ov-ann-item pinned"/,'the pinned one comes first');
  assert.match(list.innerHTML,/<button type="button" class="ov-ann-text ov-ann-open" onclick="ovAnnShowAll\(\)" aria-expanded="false"[^>]*>Note 1<\/button>/);
  assert.match(list.innerHTML,/aria-label="Show all 5 announcements">All 5<\/button>/);
  assert.equal(card.on.has('ov-ann-all'),false);
  toggle();
  assert.equal(count(list.innerHTML),5);
  assert.equal(card.on.has('ov-ann-all'),true);
  assert.ok(list.innerHTML.indexOf('Note 1')<list.innerHTML.indexOf('Note 4'),'pinned first, then newest');
  assert.doesNotMatch(list.innerHTML,/ov-ann-open/,'the full list shows plain text');
  assert.match(list.innerHTML,/aria-label="Show fewer announcements">Show fewer<\/button>/);
  assert.equal((list.innerHTML.match(/ovDeleteAnn\(/g)||[]).length,5,'every announcement keeps its delete button');
  toggle();
  assert.equal(count(list.innerHTML),1);
});

test('a single announcement still opens in full, so its whole text, pin and delete stay reachable on a phone',()=>{
  const {list,toggle}=announcements([{id:'a0',text:'Only one\nsecond line',author:'Dew',createdAt:new Date(2026,9,20).toISOString()}]);
  assert.equal(count(list.innerHTML),1);
  assert.doesNotMatch(list.innerHTML,/All 1/,'no count when there is nothing more');
  assert.match(list.innerHTML,/class="ov-ann-text ov-ann-open"/);
  toggle();
  assert.match(list.innerHTML,/<div class="ov-ann-text">Only one<br>second line<\/div>/);
  assert.match(list.innerHTML,/ovTogglePin\('a0'\)/);
  assert.match(list.innerHTML,/aria-label="Show the announcement on one line">Show fewer<\/button>/);
});

test('with no announcements the list says how to add one and leaves the full view',()=>{
  const {list,card}=announcements([]);
  assert.match(list.innerHTML,/No announcements yet/);
  assert.equal(card.on.has('ov-ann-all'),false);
});

test('posting an announcement closes the composer',()=>{
  const post=slice('  window.ovAddAnnouncement=function(){','  window.ovTogglePin=');
  assert.match(post,/window\.ovAnnCompose\(false\);/);
});

test('the payday strip starts as one compact line unless it was opened before',()=>{
  assert.match(source,/localStorage\.getItem\('uxp_sal'\)!=='0'\)document\.body\.classList\.add\('uxp-sal-collapsed'\)/);
  assert.match(source,/paint\(v\);/,'the label follows the state being set, not the animating class');
});

test('Recent Team Activity shows five, then Show more',()=>{
  const act=slice('  function renderActivity(){','  /* ---------- watermark deletion queue');
  assert.match(act,/acts\.slice\(0,ovActAll\?10:5\)/);
  assert.match(act,/acts\.length>5\?'<button type="button" class="ov-more-link" onclick="ovActMore\(\)">/);
});
