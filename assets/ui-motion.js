/* Shared folding motion and keyboard-friendly dropdown behavior. */
(function(root){
  'use strict';
  var running = new WeakMap();
  var timing = {duration:220, easing:'cubic-bezier(.2,.8,.2,1)'};

  function reduced(){
    return typeof root.matchMedia === 'function' && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function toggle(el, className, force, opts){
    opts = opts || {};
    var previous = running.get(el);
    var current = previous && previous.className === className ? previous.state : el.classList.contains(className);
    var state = typeof force === 'boolean' ? force : !current;
    if(typeof force === 'boolean' && state === current)return state;
    var animate = opts.animate || el;
    var instant = reduced() || typeof animate.animate !== 'function';
    var h1 = instant ? 0 : animate.getBoundingClientRect().height;
    if(previous)previous.cancel();
    var before = el.classList.contains(className);
    el.classList.toggle(className, state);
    if(instant)return state;
    var h2 = animate.getBoundingClientRect().height;
    if(h1 === h2)return state;
    if(h2 < h1)el.classList.toggle(className, before);
    var overflow = animate.style.overflow;
    var animations = [];
    var record = {className:className, state:state, cancel:cancel};
    running.set(el, record);
    animate.style.overflow = 'hidden';
    function finish(){
      if(running.get(el) !== record)return;
      running.delete(el);
      el.classList.toggle(className, state);
      animate.style.overflow = overflow;
    }
    function cancel(){
      if(running.get(el) !== record)return;
      finish();
      animations.forEach(function(animation){animation.cancel();});
    }
    var height = animate.animate([{height:h1+'px'}, {height:h2+'px'}], timing);
    animations.push(height);
    height.onfinish = finish;
    height.oncancel = cancel;
    if(h2 > h1 && opts.reveal){
      Array.prototype.forEach.call(el.querySelectorAll(opts.reveal), function(node){
        if(typeof node.animate === 'function'){
          animations.push(node.animate([
            {opacity:0, transform:'translateY(-4px)'},
            {opacity:1, transform:'none'}
          ], timing));
        }
      });
    }
    return state;
  }

  function menu(trigger, panel, opts){
    opts = opts || {};
    var doc = panel.ownerDocument;
    function isOpen(){return panel.classList.contains('open');}
    function items(){return panel.querySelectorAll('button, a[href], [role=menuitem]');}
    function open(){
      if(isOpen())return;
      panel.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      doc.addEventListener('pointerdown', outside, true);
      doc.addEventListener('keydown', keydown, true);
      if(opts.focusFirst){
        var first = items()[0];
        if(first)first.focus();
      }
      if(typeof opts.onOpen === 'function')opts.onOpen();
    }
    function close(){
      if(!isOpen())return;
      panel.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      doc.removeEventListener('pointerdown', outside, true);
      doc.removeEventListener('keydown', keydown, true);
      if(typeof opts.onClose === 'function')opts.onClose();
    }
    function outside(event){
      if(!trigger.contains(event.target) && !panel.contains(event.target))close();
    }
    function keydown(event){
      if(event.key === 'Escape'){
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        trigger.focus();
      }else if((event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
               (panel.contains(event.target) || trigger.contains(event.target))){
        var nodes = items();
        if(!nodes.length)return;
        var index = Array.prototype.indexOf.call(nodes, doc.activeElement);
        var next = index < 0 ? (event.key === 'ArrowDown' ? 0 : nodes.length-1) :
          (index + (event.key === 'ArrowDown' ? 1 : -1) + nodes.length) % nodes.length;
        event.preventDefault();
        nodes[next].focus();
      }
    }
    return {open:open, close:close, toggle:function(){if(isOpen())close();else open();}, isOpen:isOpen};
  }
  root.MarcomMotion = {reduced:reduced, toggle:toggle, menu:menu};
})(window);
