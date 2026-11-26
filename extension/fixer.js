/*
 * R10 Editör Düzeltici — sayfa içi kanca (MAIN world)
 * Gönderim/önizleme anında Froala içeriğini kayıpsız BBCode'a çevirip
 * forma BBCode modunda (wysiwyg=0) koyar; önizleme dönüşünde içeriği
 * kendi BBCode kopyasından editöre geri yükler.
 */
(function () {
  'use strict';
  if (window.__R10FIX__) return;
  window.__R10FIX__ = true;

  var STORE_KEY = 'r10fix:last';
  var STORE_TTL = 15 * 60 * 1000;
  var LOG = function () {
    try { console.debug.apply(console, ['[R10 Editör Düzeltici]'].concat([].slice.call(arguments))); } catch (e) {}
  };

  function enabled() {
    return document.documentElement.getAttribute('data-r10fix') !== 'off' && !!window.R10BB;
  }

  function instances() {
    var F = window.FroalaEditor;
    return (F && F.INSTANCES) ? F.INSTANCES.filter(function (ed) { return ed && ed.$oel && ed.$oel[0]; }) : [];
  }

  function editorsOf(form) {
    return instances().filter(function (ed) { return ed.$oel[0].form === form; });
  }

  function isBbView(ed) {
    try { return !!(ed.bbCode && ed.bbCode.isBbCodeView && ed.bbCode.isBbCodeView()); } catch (e) { return false; }
  }

  var prepared = [];

  function prepare(form) {
    if (!enabled() || !form || form.__r10fixBusy) return;
    var eds = editorsOf(form);
    if (!eds.length) return;
    eds.forEach(function (ed) {
      var me = ed.__r10me;
      var useModern = !!(me && me.isActive && me.isActive());
      if (!useModern && isBbView(ed)) return; // kullanıcı R10'un BBCode modunda yazıyor
      var oel = ed.$oel[0];
      var name = oel.getAttribute('data-r10fix-name') || oel.name || 'message';
      var bb;
      try {
        if (useModern) {
          bb = me.getBB();
          try { me.syncToFroala(bb); } catch (e2) {}
        } else {
          bb = window.R10BB.htmlToBB(ed.html.get());
        }
      } catch (e) { LOG('dönüşüm hatası', e); return; }

      var ta = form.querySelector('textarea[data-r10fix="' + name + '"]');
      if (!ta) {
        ta = document.createElement('textarea');
        ta.setAttribute('data-r10fix', name);
        ta.style.display = 'none';
      }
      // Froala alanının ÖNÜNE koy: R10'un AJAX gönderimleri (özel mesaj vb.)
      // textarea[name=message] ile ilk eşleşen alanı okur.
      if (oel.parentNode && oel.form === form) {
        if (ta.nextSibling !== oel) oel.parentNode.insertBefore(ta, oel);
      } else if (ta.parentNode !== form) {
        form.appendChild(ta);
      }
      ta.name = name;
      ta.value = bb;
      ta.disabled = false;

      // Aynı adlı diğer alanlar (Froala'nın HTML alanı, R10 BBCode alanı) gönderime
      // girmesin. Yalnız disabled yetmez: R10 içerik değişince Froala alanının
      // kilidini kendisi açıyor. Bu yüzden ad geçici olarak kaldırılır.
      var others = [];
      Array.prototype.forEach.call(form.elements, function (t) {
        if (t !== ta && t.name === name && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) {
          others.push({ el: t, name: t.name, disabled: t.disabled });
          t.setAttribute('data-r10fix-name', t.name);
          t.removeAttribute('name');
          t.disabled = true;
        }
      });
      var wys = form.querySelector('input[name="wysiwyg"]');
      var wysOld = wys ? wys.value : null;
      if (wys) wys.value = '0';

      prepared.push({ ta: ta, others: others, wys: wys, wysOld: wysOld });

      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({
          bb: bb, path: location.pathname, t: Date.now(), name: name
        }));
      } catch (e) {}
      LOG('BBCode hazırlandı (' + bb.length + ' karakter)');
    });
    scheduleRestore();
  }

  var restoreTimer = null;
  function scheduleRestore() {
    if (restoreTimer) return;
    restoreTimer = setTimeout(function () {
      restoreTimer = null;
      // gönderim verisi senkron alındı; editörü kullanılabilir duruma döndür
      // ters sırada: aynı gönderimde iki kez hazırlanırsa ilk kaydedilen (asıl) değerler kalsın
      prepared.splice(0).reverse().forEach(function (p) {
        p.others.forEach(function (o) { o.el.name = o.name; o.el.removeAttribute('data-r10fix-name'); o.el.disabled = o.disabled; });
        // eski BBCode sonraki okumalarda (ör. R10'un AJAX gönderimi) ilk eşleşme olmasın
        p.ta.removeAttribute('name');
        p.ta.disabled = true;
        if (p.wys && p.wysOld !== null) p.wys.value = p.wysOld;
      });
    }, 0);
  }

  // 1) Gönder/Önizle düğmesine tıklama (submit olayından önce)
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('button, input[type="submit"], input[type="image"]');
    if (!b || !b.form) return;
    var type = (b.getAttribute('type') || (b.tagName === 'BUTTON' ? 'submit' : '')).toLowerCase();
    if (type !== 'submit' && type !== 'image') return;
    prepare(b.form);
  }, true);

  // 2) Native submit olayı
  document.addEventListener('submit', function (e) { prepare(e.target); }, true);

  // 3) Programatik form.submit() (jQuery .submit(), Ctrl+Enter vb.)
  var nativeSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    try { prepare(this); } catch (e) {}
    return nativeSubmit.apply(this, arguments);
  };

  // 4) AJAX ile form serileştirme (hızlı cevap vb.)
  function hookJQuery($) {
    if (!$ || !$.fn || $.fn.__r10fix) return;
    $.fn.__r10fix = true;
    ['serialize', 'serializeArray'].forEach(function (fn) {
      var orig = $.fn[fn];
      if (!orig) return;
      $.fn[fn] = function () {
        try {
          this.each(function () {
            var f = this.tagName === 'FORM' ? this : (this.form || null);
            if (f) prepare(f);
          });
        } catch (e) {}
        return orig.apply(this, arguments);
      };
    });
  }

  // Önizleme dönüşünde editöre kayıpsız içerik yükle
  function restoreAfterPreview() {
    if (!enabled()) return;
    var raw;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return; }
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    if (!data || data.path !== location.pathname || Date.now() - data.t > STORE_TTL) return;
    var eds = instances().filter(function (ed) { return (ed.$oel[0].name || 'message') === data.name; });
    if (eds.length !== 1) return;
    var ed = eds[0];
    var current = '';
    try { current = window.R10BB.htmlToBB(ed.html.get()); } catch (e) {}
    if (!current) return; // boş editör: başka bir sayfa
    if (current === data.bb) return;
    // Sunucunun döndürdüğü içerik bizim gönderdiğimizle aynı metni taşımalı
    var strip = function (s) { return s.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ''); };
    if (strip(current) !== strip(data.bb)) return;
    try {
      ed.html.set(window.R10BB.bbToHTML(data.bb));
      ed.undo.saveStep();
      LOG('Önizleme sonrası içerik kayıpsız geri yüklendi');
    } catch (e) { LOG('geri yükleme hatası', e); }
  }

  function whenReady(cb, tries) {
    tries = tries || 0;
    if (window.jQuery) hookJQuery(window.jQuery);
    if (instances().length) { cb(); return; }
    if (tries > 300) return;
    setTimeout(function () { whenReady(cb, tries + 1); }, 100);
  }

  whenReady(function () {
    try { restoreAfterPreview(); } catch (e) { LOG('geri yükleme hatası', e); }
    window.__R10FIX_READY__ = true;
    try { window.dispatchEvent(new Event('r10fix:ready')); } catch (e) {}
  });
})();
