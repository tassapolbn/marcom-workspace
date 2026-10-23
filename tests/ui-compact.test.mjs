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
  const context=vm.createContext({window:{},document:{getElementById:id=>nodes[id]||null},
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

test('the announcement list shows the newest three and offers Show all',()=>{
  const list={innerHTML:''};
  const items=Array.from({length:5},(_,i)=>({id:'a'+i,text:'Note '+i,author:'Boss',createdAt:new Date(2026,9,20+i).toISOString(),pinned:i===1}));
  const context=vm.createContext({window:{},document:{getElementById:id=>id==='ov-ann-list'?list:null},
    annItems:items,buildAuthorOptions(){},esc:s=>String(s)});
  vm.runInContext(slice('  var ovAnnAll=false;','  function saveAnn(items){')+'\nthis.renderAnnouncements=renderAnnouncements;',context);
  context.renderAnnouncements();
  assert.equal((list.innerHTML.match(/class="ov-ann-item/g)||[]).length,3);
  assert.match(list.innerHTML,/Show all 5 announcements/);
  assert.ok(list.innerHTML.indexOf('Note 1')<list.innerHTML.indexOf('Note 4'),'pinned first, then newest');
  context.window.ovAnnShowAll();
  assert.equal((list.innerHTML.match(/class="ov-ann-item/g)||[]).length,5);
  assert.match(list.innerHTML,/Show fewer/);
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
