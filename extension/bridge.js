// İzole dünya: ayarları sayfaya (MAIN world) data-* nitelikleriyle iletir ve
// sayfadaki editörün yazım denetimi isteklerini arka plan servisine aktarır.
(function () {
  'use strict';
  var DEF = { enabled: true, modern: true };
  function apply(s) {
    var el = document.documentElement;
    if (!el) { document.addEventListener('readystatechange', function () { apply(s); }, { once: true }); return; }
    el.setAttribute('data-r10fix', s.enabled === false ? 'off' : 'on');
    el.setAttribute('data-r10me', s.modern === false ? 'off' : 'on');
    el.setAttribute('data-r10spell', 'on');
  }
  var cur = Object.assign({}, DEF);
  apply(cur);
  try {
    chrome.storage.local.get(DEF, function (r) { cur = r; apply(cur); });
    chrome.storage.onChanged.addListener(function (c, area) {
      if (area !== 'local') return;
      if (c.enabled) cur.enabled = c.enabled.newValue;
      if (c.modern) cur.modern = c.modern.newValue;
      apply(cur);
    });
  } catch (e) {}

  // Yazım denetimi köprüsü: sayfa -> eklenti servis çalışanı
  window.addEventListener('message', function (e) {
    if (e.source !== window || !e.data || e.data.__r10spell !== 'req') return;
    var id = e.data.id;
    var payload = e.data.payload || {};
    var reply = function (res) { window.postMessage({ __r10spell: 'res', id: id, res: res }, location.origin); };
    try {
      chrome.runtime.sendMessage({ type: 'r10spell', words: payload.words, suggest: payload.suggest, maxSuggest: payload.maxSuggest }, function (res) {
        var err = chrome.runtime.lastError;
        reply(err ? { ok: false, error: err.message } : (res || { ok: false, error: 'yanıt yok' }));
      });
    } catch (err) {
      reply({ ok: false, error: String(err && err.message || err) });
    }
  });
})();
