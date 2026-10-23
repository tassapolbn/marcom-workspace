/* Protect unfinished dialogs while keeping save and cleanup paths unconditional. */
(function(root){
  'use strict';
  var dirty = new WeakSet();
  var notified = new WeakSet();
  var pressedOverlay = null;
  var asking = false;

  function isDirty(el){return !!el && dirty.has(el);}
  function markDirty(el){if(el)dirty.add(el);}
  function clearDirty(el){if(el)dirty.delete(el);}
  function isOverlay(el){
    return !!el && !!el.classList && el.classList.contains('modal-overlay');
  }
  function trackChange(event){
    if(event.isTrusted === false)return;
    var target = event.target;
    var overlay = target && typeof target.closest === 'function' ? target.closest('.modal-overlay') : null;
    if(overlay && overlay.classList.contains('open'))markDirty(overlay);
  }
  document.addEventListener('input', trackChange, true);
  document.addEventListener('change', trackChange, true);

  if(typeof MutationObserver === 'function'){
    new MutationObserver(function(records){
      records.forEach(function(record){
        var overlay = record.target;
        if(!isOverlay(overlay))return;
        var wasOpen = /(^|\s)open(\s|$)/.test(record.oldValue || '');
        if(wasOpen !== overlay.classList.contains('open')){
          clearDirty(overlay);
          notified.delete(overlay);
        }
      });
    }).observe(document.documentElement, {
      subtree:true, attributes:true, attributeFilter:['class'], attributeOldValue:true
    });
  }

  function shake(overlay){
    var box = overlay.querySelector('.modal');
    if(!box || box.classList.contains('ui-shake'))return;
    var timer;
    function clearShake(event){
      if(event && (event.target !== box || event.animationName !== 'ui-shake'))return;
      box.classList.remove('ui-shake');
      box.removeEventListener('animationend', clearShake);
      root.clearTimeout(timer);
    }
    box.classList.add('ui-shake');
    box.addEventListener('animationend', clearShake);
    timer = root.setTimeout(clearShake, 450);
  }
  /* Pointer events also cover touch screens that skip compatibility mouse events. */
  function rememberPress(event){
    pressedOverlay = isOverlay(event.target) ? event.target : null;
  }
  root.addEventListener('pointerdown', rememberPress, true);
  root.addEventListener('mousedown', rememberPress, true);
  root.addEventListener('click', function(event){
    if(event.isTrusted === false)return;
    var overlay = event.target;
    if(!isOverlay(overlay) || !overlay.classList.contains('open') ||
       overlay.id === 'uxp-modal' || overlay.id === 'links-hub-modal')return;
    if(pressedOverlay !== overlay){
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if(!isDirty(overlay))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    shake(overlay);
    if(!notified.has(overlay)){
      notified.add(overlay);
      if(typeof uiToast === 'function'){
        uiToast('You have unsaved changes. Press Cancel or \u00d7 to close without saving.', {duration:5000});
      }
    }
  }, true);

  function requestClose(id, title, close){
    if(asking)return;
    if(!isDirty(document.getElementById(id))){close();return;}
    asking = true;
    if(typeof uiConfirm === 'function'){
      try{
        return uiConfirm({title:title, message:'What you typed will be lost.',
          okLabel:'Discard', cancelLabel:'Keep editing', danger:true}).then(function(discard){
          asking = false;
          if(discard === true)close();
        }, function(){asking = false;});
      }catch(error){asking = false;}
    }else{
      try{
        if(typeof root.confirm === 'function' && root.confirm('Discard your changes?') === true)close();
      }finally{asking = false;}
    }
  }
  root.requestCloseModal = function(){
    var editing = typeof modalState !== 'undefined' && modalState && modalState.editId;
    return requestClose('modal', editing ? 'Discard your changes?' : 'Discard this task?', function(){
      if(typeof closeModal === 'function')closeModal();
    });
  };
  root.requestCloseEventModal = function(){
    var editing = typeof eventEditId !== 'undefined' && eventEditId;
    return requestClose('event-modal', editing ? 'Discard your changes?' : 'Discard this event?', function(){
      if(typeof closeEventModal === 'function')closeEventModal();
    });
  };
  root.MarcomDialogs = {isDirty:isDirty, markDirty:markDirty, clearDirty:clearDirty};
})(window);
