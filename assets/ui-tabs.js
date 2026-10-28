/* Workspace tab bar: one indicator glides to the selected tab, the selected
   colours are drawn only where that indicator sits, and the new view enters
   from the side you moved towards.

   switchTab() in index.html still owns selection, tab roles and panels. This
   file only watches the tab bar for changes, so every way of selecting a tab
   (a tap, the arrow keys, a link that opens a workspace) gets the same motion.
   Layout and colours live in assets/workspace-ui.css (Step 34). */
(function(root){
  'use strict';
  var doc = root.document;

  /* The dock shows each person's initial, taken from the tab's own name so a
     renamed member keeps a matching monogram. */
  function initialOf(text){
    var first = Array.from(String(text == null ? '' : text).trim())[0] || '';
    return first.toLocaleUpperCase();
  }

  /* Moving right enters from the right, moving left from the left. */
  function direction(from, to){
    if(from < 0 || to < 0 || from === to)return '';
    return to > from ? 'next' : 'prev';
  }

  function reduced(){
    try{ return root.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; }
  }

  function child(el, className){
    for(var n = el.firstElementChild; n; n = n.nextElementSibling){
      if(n.classList.contains(className))return n;
    }
    return null;
  }

  function syncInitial(btn){
    var mono = child(btn, 'tab-mono'), name = child(btn, 'tab-name');
    if(!mono || !name || mono.hasAttribute('data-mark'))return;
    var letter = initialOf(name.textContent);
    if(letter && mono.textContent !== letter)mono.textContent = letter;
  }

  /* A copy of the tab's contents in the selected colours. Its clip follows the
     indicator, so text under the indicator is always drawn for the indicator
     and text beside it for the bar, even halfway through a move. Ids are
     dropped so nothing is duplicated, and screen readers skip it. */
  function paintInk(btn){
    var ink = doc.createElement('span');
    ink.className = 'tab-ink';
    ink.setAttribute('aria-hidden', 'true');
    for(var n = btn.firstChild; n; n = n.nextSibling){
      if(n.nodeType === 1 && n.classList.contains('tab-ink'))continue;
      ink.appendChild(n.cloneNode(true));
    }
    var named = ink.querySelectorAll('[id]');
    for(var i = 0; i < named.length; i++)named[i].removeAttribute('id');
    var old = child(btn, 'tab-ink');
    if(old)btn.replaceChild(ink, old);
    else btn.appendChild(ink);
    return ink;
  }

  function attach(nav){
    var ind = child(nav, 'tab-ind');
    if(!ind){
      ind = doc.createElement('span');
      ind.className = 'tab-ind';
      ind.setAttribute('aria-hidden', 'true');
      nav.insertBefore(ind, nav.firstChild);
    }
    /* Browsers that can animate the two position variables glide; older ones
       place the indicator at once, which is still correct. */
    var smooth = !!(root.CSS && typeof root.CSS.registerProperty === 'function');
    var last = null, engaged = false, settling = 0, frame = 0, mo = null, ro = null;

    function now(){ return root.performance && root.performance.now ? root.performance.now() : Date.now(); }
    function tabs(){ return Array.prototype.slice.call(nav.querySelectorAll('.tab-btn')); }
    function current(){ return nav.querySelector('.tab-btn.a-active'); }
    function within(el, className){
      for(var n = el; n && n !== nav; n = n.parentNode){
        if(n.classList && n.classList.contains(className))return true;
      }
      return false;
    }
    function tabOf(el){
      for(var n = el; n && n !== nav; n = n.parentNode){
        if(n.classList && n.classList.contains('tab-btn'))return n;
      }
      return null;
    }
    function onlyInk(m){
      var nodes = Array.prototype.slice.call(m.addedNodes).concat(Array.prototype.slice.call(m.removedNodes));
      return nodes.length > 0 && nodes.every(function(x){ return x.nodeType === 1 && x.classList.contains('tab-ink'); });
    }

    /* Put the indicator under the selected tab. Without animation on first
       show, after a resize or a font load; with it when the selection moves. */
    function place(animate){
      var cur = current();
      if(!cur){ nav.classList.remove('has-ind'); return; }
      var snap = !animate || !smooth || reduced();
      if(snap)nav.classList.add('ind-snap');
      else nav.classList.remove('ind-snap');
      /* Measured to the sub-pixel, from the edge the indicator is placed against. */
      var r = nav.getBoundingClientRect(), edge = r.left + nav.clientLeft - nav.scrollLeft;
      var all = tabs();
      all.forEach(function(b){ b.style.setProperty('--tab-x', (b.getBoundingClientRect().left - edge) + 'px'); });
      /* The two ends of the row of tabs: the spring squashes the indicator
         against them instead of pushing it out of the bar (Step 53). */
      var shown = all.filter(function(b){ return b.getBoundingClientRect().width > 0; });
      if(shown.length){
        var first = shown[0].getBoundingClientRect(), end = shown[shown.length - 1].getBoundingClientRect();
        nav.style.setProperty('--ind-min', (first.left - edge) + 'px');
        nav.style.setProperty('--ind-max', (end.left + end.width - edge) + 'px');
      }
      var c = cur.getBoundingClientRect();
      nav.style.setProperty('--ind-x', (c.left - edge) + 'px');
      nav.style.setProperty('--ind-w', c.width + 'px');
      nav.classList.add('has-ind');
      if(snap){
        /* Commit the jump while transitions are off, then allow them again. */
        root.getComputedStyle(nav).getPropertyValue('--ind-x');
        root.cancelAnimationFrame(frame);
        frame = root.requestAnimationFrame(function(){
          frame = root.requestAnimationFrame(function(){ nav.classList.remove('ind-snap'); });
        });
      }
    }

    function select(){
      var cur = current();
      if(!cur || cur === last){ place(now() < settling); return; }
      var all = tabs(), from = last ? all.indexOf(last) : -1, to = all.indexOf(cur);
      /* Start-up and restored selections are placed, not animated: motion only
         follows something the person did. */
      var animate = engaged && from >= 0;
      var dir = animate ? direction(from, to) : '';
      if(dir)doc.documentElement.setAttribute('data-tab-dir', dir);
      last = cur;
      if(animate)settling = now() + 400;
      place(animate);
    }

    function observeSizes(){
      if(!ro)return;
      ro.observe(nav);
      tabs().forEach(function(b){ ro.observe(b); });
    }

    function onMutations(records){
      var dirty = [], selection = false, structure = false;
      records.forEach(function(m){
        var el = m.target.nodeType === 1 ? m.target : m.target.parentNode;
        if(!el)return;
        if(el === nav){
          if(m.type === 'childList' && !onlyInk(m))structure = true;
          return;
        }
        if(el === ind || within(el, 'tab-ink'))return;
        if(m.type === 'attributes' && el.classList.contains('tab-btn')){
          if(m.attributeName === 'class')selection = true;
          return;
        }
        if(m.type === 'childList' && onlyInk(m))return;
        var btn = tabOf(el);
        if(btn && dirty.indexOf(btn) < 0)dirty.push(btn);
      });
      if(structure){
        tabs().forEach(function(b){ if(dirty.indexOf(b) < 0)dirty.push(b); });
        observeSizes();
      }
      dirty.forEach(function(b){ syncInitial(b); paintInk(b); });
      if(selection)select();
      else if(dirty.length)place(now() < settling);
      /* Drop the records caused by the lines above. */
      if(mo)mo.takeRecords();
    }

    function engage(){ engaged = true; }
    doc.addEventListener('pointerdown', engage, true);
    doc.addEventListener('keydown', engage, true);
    /* iOS only shows :active (the press feedback) when a touch listener exists. */
    nav.addEventListener('touchstart', function(){}, {passive:true});

    tabs().forEach(function(b){ syncInitial(b); paintInk(b); });
    last = current();
    place(false);

    if(typeof root.MutationObserver === 'function'){
      mo = new root.MutationObserver(onMutations);
      mo.observe(nav, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['class', 'style']});
    }
    if(typeof root.ResizeObserver === 'function'){
      /* A label that changes, a badge that appears, fonts that finish loading or
         a rotated phone all change sizes; the indicator follows without sliding. */
      ro = new root.ResizeObserver(function(){ place(now() < settling); });
      observeSizes();
    }else{
      root.addEventListener('resize', function(){ place(false); });
    }
    if(doc.fonts && doc.fonts.ready)doc.fonts.ready.then(function(){ place(false); });

    return {place:place, select:select, sync:onMutations};
  }

  function boot(){
    var nav = doc.querySelector('.tab-nav');
    if(nav && !nav.marcomTabs)nav.marcomTabs = attach(nav);
  }

  root.MarcomTabs = {initialOf:initialOf, direction:direction, paintInk:paintInk, attach:attach};
  if(doc.readyState === 'loading')doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
