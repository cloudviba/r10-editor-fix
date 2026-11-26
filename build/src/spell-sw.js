/*
 * R10 Editör Düzeltici — yazım denetimi arka plan servisi (Manifest V3 service worker)
 * Hunspell (WASM) + Türkçe Hunspell sözlüğü (dictionary-tr, MIT, ~371 bin kök).
 * Metin dışarı gönderilmez; tüm denetim yerelde yapılır.
 *
 * İstek:  { type: 'r10spell', words: [{ w, alts: [..] }], suggest: true, maxSuggest: 40 }
 * Yanıt:  { ok: true, res: { [w]: { ok, alt, sugg } }, ms }
 */
import { loadModule } from 'hunspell-asm';

var hs = null;
var loading = null;
var cache = new Map(); // kelime -> sonuç (servis yaşadığı sürece)

function ensure() {
  if (hs) return Promise.resolve(hs);
  if (!loading) {
    loading = (async function () {
      var factory = await loadModule();
      var files = await Promise.all(['dict/tr.aff', 'dict/tr.dic'].map(function (p) {
        return fetch(chrome.runtime.getURL(p)).then(function (r) { return r.arrayBuffer(); });
      }));
      var aff = factory.mountBuffer(new Uint8Array(files[0]), 'tr.aff');
      var dic = factory.mountBuffer(new Uint8Array(files[1]), 'tr.dic');
      hs = factory.create(aff, dic);
      return hs;
    })().catch(function (e) { loading = null; throw e; });
  }
  return loading;
}

function check(h, item, wantSuggest) {
  var w = item.w;
  var key = w + '\u0001' + (item.alts || []).join('\u0002') + (wantSuggest ? '\u0003' : '');
  if (cache.has(key)) return cache.get(key);
  var r = { ok: h.spell(w) };
  var alts = item.alts || [];
  for (var i = 0; i < alts.length; i++) {
    if (alts[i] && alts[i] !== w && h.spell(alts[i])) { r.alt = alts[i]; break; }
  }
  if (!r.ok) {
    if (!r.alt && wantSuggest) {
      try { r.sugg = h.suggest(w).slice(0, 8); } catch (e) { r.sugg = []; }
    }
  }
  cache.set(key, r);
  if (cache.size > 20000) cache.clear();
  return r;
}

chrome.runtime.onMessage.addListener(function (msg, sender, send) {
  if (!msg || msg.type !== 'r10spell') return false;
  var t0 = Date.now();
  ensure().then(function (h) {
    var res = {};
    var max = msg.maxSuggest == null ? 40 : msg.maxSuggest;
    var suggested = 0;
    (msg.words || []).forEach(function (item) {
      if (!item || !item.w || res[item.w]) return;
      var want = !!msg.suggest && suggested < max;
      var r = check(h, item, want);
      if (r.sugg) suggested++;
      res[item.w] = r;
    });
    send({ ok: true, res: res, ms: Date.now() - t0 });
  }).catch(function (e) {
    send({ ok: false, error: String(e && e.message || e) });
  });
  return true; // asenkron yanıt
});

// Ön ısıtma: eklenti kurulduğunda/başladığında sözlüğü yükle
chrome.runtime.onInstalled.addListener(function () { ensure().catch(function () {}); });
