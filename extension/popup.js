(function () {
  'use strict';
  var DEF = { enabled: true, modern: true };
  var t1 = document.getElementById('toggle'), s1 = document.getElementById('state');
  var t2 = document.getElementById('toggle2'), s2 = document.getElementById('state2');

  function paint(el, on) { el.textContent = on ? 'Açık' : 'Kapalı'; el.className = 'state ' + (on ? 'on' : 'off'); }
  function render(r) {
    t1.checked = r.enabled !== false; paint(s1, t1.checked);
    t2.checked = r.modern !== false; paint(s2, t2.checked);
    t2.disabled = !t1.checked;
    t2.parentNode.parentNode.style.opacity = t1.checked ? '' : '.5';
  }
  chrome.storage.local.get(DEF, render);
  t1.addEventListener('change', function () { chrome.storage.local.set({ enabled: t1.checked }, function () { chrome.storage.local.get(DEF, render); }); });
  t2.addEventListener('change', function () { chrome.storage.local.set({ modern: t2.checked }, function () { chrome.storage.local.get(DEF, render); }); });
})();
