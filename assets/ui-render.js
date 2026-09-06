/* Preserve focused controls and decorated nodes across identical live updates. */
(function(root){
  'use strict';
  var rendered = new WeakMap();
  function setHTML(element, html){
    if(!element || rendered.get(element) === html)return false;
    element.innerHTML = html;
    rendered.set(element, html);
    return true;
  }
  root.MarcomUI = Object.assign(root.MarcomUI || {}, {setHTML:setHTML});
})(window);
