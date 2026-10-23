/* Key numbers in member-tab widget headers, so folded widgets still say what they hold. */
(function(root){
  'use strict';
  var DEGREE = String.fromCharCode(176);
  var timers = new WeakMap();
  var watched = new WeakSet();

  function text(el){ return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function count(widget, selector){ return widget.querySelectorAll(selector).length; }
  function plural(n, one, many){ return n + ' ' + (n === 1 ? one : many); }
  function memberOf(widget){
    var panel = widget.closest ? widget.closest('.tab-panel') : null;
    return panel && panel.id ? panel.id.replace(/^panel-/, '') : '';
  }
  function todayKey(){
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function titleOf(widget){
    var t = widget.querySelector('.widget-title');
    return t ? text(t) : '';
  }
  /* Each rule returns the short text for one widget, or '' when there is nothing to say. */
  var RULES = {
    'Petty Cash': function(w){
      var el = w.querySelector('.pc-bal-num');
      if(!el)return '';
      return Array.prototype.map.call(el.childNodes, function(n){ return String(n.textContent || '').trim(); }).filter(Boolean).join(' ');
    },
    'Phuket Weather': function(){
      /* wxData and gcalData are top-level let bindings, so read them by name. */
      var wx = typeof wxData !== 'undefined' ? wxData : root.wxData;
      var d = wx && wx.daily;
      var max = d && d.temperature_2m_max && d.temperature_2m_max[0];
      return typeof max === 'number' && isFinite(max) ? Math.round(max) + DEGREE : '';
    },
    'Pinned Notes': function(w){
      var n = count(w, '.pin-item');
      return n ? n + ' pinned' : '';
    },
    'Calendar': function(w){
      var gd = typeof gcalData !== 'undefined' ? gcalData : root.gcalData;
      var who = memberOf(w), data = gd && gd[who];
      if(!data || !data.list)return '';
      var today = todayKey();
      var n = data.list.filter(function(m){ return m && m.start && String(m.start).slice(0, 10) === today; }).length;
      return n ? n + ' today' : '';
    },
    'Day-off in Lieu': function(w){ return text(w.querySelector('[id$="-lieu-balance"]')); },
    'Sick Leave': function(w){
      var v = text(w.querySelector('[id$="-sick-count"]'));
      return v ? v + ' used' : '';
    },
    'Deadlines': function(w){
      var who = memberOf(w);
      if(!who || typeof tasksOf !== 'function' || typeof daysUntil !== 'function')return '';
      var n = (tasksOf(who) || []).filter(function(t){
        if(!t || !t.dueDate || t.status === 'done' || t.status === 'canceled')return false;
        var d = daysUntil(t.dueDate);
        return d !== null && d >= 0 && d <= 7;
      }).length;
      return n ? n + ' due soon' : '';
    },
    'Design Review Queue': function(w){ var n = count(w, '.wf-item'); return n ? n + ' in review' : ''; },
    'Revision Tracker': function(w){ var n = count(w, '.rev-item'); return n ? String(n) : ''; },
    'Watermark Removal Queue': function(w){ var n = count(w, '.wmq-item'); return n ? n + ' queued' : ''; },
    'Recurring Templates': function(w){ var n = count(w, '.tpl-item'); return n ? String(n) : ''; },
    'Asset Library': function(w){ var n = count(w, '.asset-row'); return n ? plural(n, 'link', 'links') : ''; }
  };
  RULES['Google Calendar'] = RULES.Calendar;

  function summary(widget){
    var rule = RULES[titleOf(widget)];
    if(!rule)return '';
    try{ return rule(widget) || ''; }catch(e){ return ''; }
  }
  function update(widget){
    var title = widget.querySelector('.widget-title');
    if(!title)return;
    var span = widget.querySelector('.widget-head > .widget-sum');
    if(!span){
      span = widget.ownerDocument.createElement('span');
      span.className = 'widget-sum';
      span.setAttribute('aria-hidden', 'true');
      title.parentNode.insertBefore(span, title.nextSibling);
    }
    var next = summary(widget);
    if(span.textContent !== next)span.textContent = next;
  }
  function soon(widget){
    if(timers.has(widget))root.clearTimeout(timers.get(widget));
    timers.set(widget, root.setTimeout(function(){ timers.delete(widget); update(widget); }, 150));
  }
  function attach(widget){
    if(!widget || watched.has(widget) || !widget.querySelector('.widget-title'))return;
    watched.add(widget);
    update(widget);
    var body = widget.querySelector('.widget-body');
    if(body && typeof root.MutationObserver === 'function'){
      new root.MutationObserver(function(){ soon(widget); }).observe(body, {childList:true, subtree:true, characterData:true});
    }
  }
  function scan(scope){
    Array.prototype.forEach.call((scope || root.document).querySelectorAll('.tab-panel .side-col .widget'), attach);
  }
  function refreshAll(){
    Array.prototype.forEach.call(root.document.querySelectorAll('.tab-panel .side-col .widget'), function(w){ if(watched.has(w))update(w); });
  }

  root.MarcomWidgets = {summary:summary, update:update, attach:attach, scan:scan, rules:RULES};
  if(root.document && typeof root.MutationObserver === 'function'){
    var start = function(){
      scan();
      new root.MutationObserver(function(records){
        records.forEach(function(r){
          Array.prototype.forEach.call(r.addedNodes || [], function(n){
            if(n.nodeType !== 1)return;
            if(n.classList && n.classList.contains('widget'))attach(n);
            else if(n.querySelectorAll)scan(n);
          });
        });
      }).observe(root.document.body, {childList:true, subtree:true});
      /* Weather, calendars and deadlines can change without touching the widget body. */
      root.setInterval(refreshAll, 60000);
    };
    if(root.document.readyState === 'loading')root.document.addEventListener('DOMContentLoaded', start); else start();
  }
})(window);
