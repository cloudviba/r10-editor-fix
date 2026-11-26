/*
 * R10 Modern Editör — R10'un Froala editörünün yerine geçebilen modern editör.
 * İçerik her zaman R10BB (kayıpsız BBCode dönüştürücü) üzerinden taşınır.
 */
import { Editor, Extension, Node as TNode } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { marked } from 'marked';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import {
  createElement, Undo2, Redo2, Bold, Italic, Underline as UnderlineIcon, Strikethrough, Palette,
  AlignLeft, AlignCenter, AlignRight, List, ListOrdered, IndentIncrease, IndentDecrease,
  Link as LinkIcon, Unlink, Image as ImageIcon, Smile, Quote, EyeOff, Code, RemoveFormatting,
  FileCode, Eye, Maximize2, Minimize2, ChevronDown, PenLine, Sparkles, Upload, Type, Pilcrow, Check, SpellCheck, X,
  ImagePlay, MessageSquareText, Search, Trash2, Pencil, Plus, Hash, AtSign, RefreshCw, ExternalLink, Images
} from 'lucide';
import CSS from './styles.css';
import { Plugin, PluginKey, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { diffChars } from 'diff';
import { closeHistory } from '@tiptap/pm/history';
import { proofread, mask as prMask, PROPER } from './tr-proofread.js';
import { processBlocks, matchCase as spMatchCase, trLower as spLower } from './spell-logic.js';
import Deasciifier from 'turkish-deasciifier';

(function () {
  'use strict';
  if (window.R10ModernEditor) return;

  /* ---------------- sabitler ---------------- */
  var MODE_KEY = 'r10me:mode';
  var DRAFT_PREFIX = 'r10me:draft:';
  var DRAFT_TTL = 7 * 24 * 3600 * 1000;
  var SIZES = [
    { n: 1, px: 10, label: 'Çok küçük' }, { n: 2, px: 13, label: 'Küçük' }, { n: 3, px: 16, label: 'Normal' },
    { n: 4, px: 18, label: 'Orta' }, { n: 5, px: 24, label: 'Büyük' }, { n: 6, px: 32, label: 'Çok büyük' },
    { n: 7, px: 48, label: 'Dev' }
  ];
  var FONTS = ['Arial', 'Georgia', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Courier New', 'Impact', 'Comic Sans MS', 'Lucida Console'];
  var COLORS = [
    '#61BD6D', '#1ABC9C', '#54ACD2', '#2C82C9', '#9365B8', '#475577', '#CCCCCC',
    '#41A85F', '#00A885', '#3D8EB9', '#2969B0', '#553982', '#28324E', '#000000',
    '#F7DA64', '#FBA026', '#EB6B56', '#E25041', '#A38F84', '#EFEFEF', '#FFFFFF',
    '#FAC51C', '#F37934', '#D14841', '#B8312F', '#7C706B', '#D1D5D8', '#F39C1E'
  ];
  var EMOJI = ('😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😎 🤩 🥳 🤔 🤨 😐 😏 😒 🙄 😬 😴 😷 🤒 🤯 😱 😡 😭 😢 🥺 ' +
    '👍 👎 👌 ✌️ 🤞 🤝 🙏 👏 💪 👋 👉 👈 👆 👇 ✋ 🖐️ ' +
    '🔥 ⭐ 🌟 ✨ ⚡ 💯 ✅ ☑️ ✔️ ❌ ❗ ❓ ⚠️ 🚀 🎯 🎉 🎁 🏆 💰 💵 💳 📈 📉 📊 💼 📌 📍 📎 🔗 🔒 🔑 🛡️ ⚙️ 🛠️ 💡 📢 📣 📞 📱 💻 🖥️ 🌐 ✉️ 📩 📦 🕒 ⏳ 🔔 💬 ❤️ 🧡 💛 💚 💙 💜 🖤 🔹 🔸 ▶️ ➡️ ⬅️ ⬆️ ⬇️ 🆕 🆓 🔝').split(' ');

  /* ---------------- yardımcılar ---------------- */
  function icon(node, cls) {
    var el = createElement(node);
    el.setAttribute('aria-hidden', 'true');
    if (cls) el.setAttribute('class', cls);
    return el;
  }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
  }
  function enabled() {
    var d = document.documentElement;
    return d.getAttribute('data-r10fix') !== 'off' && d.getAttribute('data-r10me') !== 'off' && !!window.R10BB;
  }
  function isDark() {
    var b = document.body;
    if (b && /\bnight\b/.test(b.className)) return true;
    try {
      var c = getComputedStyle(b).backgroundColor.match(/\d+/g);
      if (c) return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) < 110;
    } catch (e) {}
    return false;
  }
  function getMode() { try { return localStorage.getItem(MODE_KEY) || 'modern'; } catch (e) { return 'modern'; } }
  function setMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch (e) {} }
  function draftKey() {
    var q = new URLSearchParams(location.search);
    var id = ['do', 'f', 't', 'p', 'pmid'].map(function (k) { return q.get(k) ? k + '=' + q.get(k) : ''; }).filter(Boolean).join('&');
    // R10 özel mesajları: konuşmalar AJAX ile değişir, adres değişmez
    var pm = document.querySelector('.privateMessages .privateMessage[data-pmid]');
    if (pm && pm.getAttribute('data-pmid')) id = (id ? id + '&' : '') + 'conv=' + pm.getAttribute('data-pmid');
    return DRAFT_PREFIX + location.pathname + (id ? '?' + id : '');
  }
  function stickyTop() {
    var max = 0;
    var els = document.querySelectorAll('body > *, header, .header, #header, nav');
    for (var i = 0; i < els.length && i < 60; i++) {
      var cs = getComputedStyle(els[i]);
      if ((cs.position === 'fixed' || cs.position === 'sticky') && parseFloat(cs.top || '0') <= 1) {
        var r = els[i].getBoundingClientRect();
        if (r.top <= 1 && r.height < 220 && r.width > window.innerWidth * 0.5) max = Math.max(max, r.bottom);
      }
    }
    return Math.round(max);
  }
  function injectCSS() {
    if (document.getElementById('r10me-style')) return;
    var st = document.createElement('style');
    st.id = 'r10me-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  function timeStr(t) {
    var d = new Date(t);
    return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  /* ---------------- Tiptap eklentileri ---------------- */
  var FontSize = Extension.create({
    name: 'fontSize',
    addOptions: function () { return { types: ['textStyle'] }; },
    addGlobalAttributes: function () {
      return [{
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: function (el) { return el.style.fontSize || null; },
            renderHTML: function (a) { return a.fontSize ? { style: 'font-size: ' + a.fontSize } : {}; }
          }
        }
      }];
    },
    addCommands: function () {
      return {
        setFontSize: function (size) { return function (p) { return p.chain().setMark('textStyle', { fontSize: size }).run(); }; },
        unsetFontSize: function () { return function (p) { return p.chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(); }; }
      };
    }
  });

  var Indent = Extension.create({
    name: 'indent',
    addOptions: function () { return { types: ['paragraph', 'heading'], max: 4 }; },
    addGlobalAttributes: function () {
      return [{
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: function (el) { var v = parseInt(el.style.marginLeft || '0', 10); return v > 0 ? Math.min(4, Math.round(v / 20)) : 0; },
            renderHTML: function (a) { return a.indent ? { style: 'margin-left: ' + (a.indent * 20) + 'px' } : {}; }
          }
        }
      }];
    },
    addCommands: function () {
      var types = this.options.types, max = this.options.max;
      function change(delta) {
        return function (p) {
          var tr = p.tr, changed = false;
          p.state.doc.nodesBetween(p.state.selection.from, p.state.selection.to, function (node, pos) {
            if (types.indexOf(node.type.name) !== -1) {
              var cur = node.attrs.indent || 0;
              var nv = Math.max(0, Math.min(max, cur + delta));
              if (nv !== cur) { tr.setNodeMarkup(pos, null, Object.assign({}, node.attrs, { indent: nv })); changed = true; }
            }
          });
          if (changed && p.dispatch) p.dispatch(tr);
          return changed;
        };
      }
      return { indent: function () { return change(1); }, outdent: function () { return change(-1); } };
    }
  });

  /* ---------------- düzeltme vurgusu ---------------- */
  var proofKey = new PluginKey('r10meProof');
  var ProofHighlight = Extension.create({
    name: 'proofHighlight',
    addProseMirrorPlugins: function () {
      return [new Plugin({
        key: proofKey,
        state: {
          init: function () { return DecorationSet.empty; },
          apply: function (tr, set) {
            set = set.map(tr.mapping, tr.doc);
            var meta = tr.getMeta(proofKey);
            if (meta && meta.clear) return DecorationSet.empty;
            if (meta && meta.ranges) {
              return DecorationSet.create(tr.doc, meta.ranges.filter(function (r) { return r.to > r.from; }).map(function (r) {
                return Decoration.inline(r.from, r.to, { class: 'r10me-fixed' });
              }));
            }
            return set;
          }
        },
        props: { decorations: function (state) { return proofKey.getState(state); } }
      })];
    }
  });

  /* ---------------- R10 sunucu yardımcıları ---------------- */
  function r10Token() {
    if (window.SECURITYTOKEN) return window.SECURITYTOKEN;
    var i = document.querySelector('input[name="securitytoken"]');
    return i ? i.value : null;
  }
  function r10AjaxURL(doParam) {
    var base = window.ajaxBase || (location.origin + '/');
    return base + 'ajax.php' + (doParam ? '?do=' + encodeURIComponent(doParam) : '');
  }
  async function r10Ajax(params, signal) {
    var tok = r10Token();
    if (!tok) throw new Error('R10 oturumu bulunamadı');
    var body = new URLSearchParams();
    Object.keys(params).forEach(function (k) { body.append(k, params[k]); });
    body.append('securitytoken', tok);
    var r = await fetch(r10AjaxURL(params.do), {
      method: 'POST', credentials: 'include', signal: signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: body.toString()
    });
    var txt = await r.text();
    return new DOMParser().parseFromString(txt, 'text/xml');
  }
  function xmlText(node, sel) { var n = node.querySelector(sel); return n ? n.textContent : ''; }
  function absURL(u) { return /^\/\//.test(u) ? 'https:' + u : u; }

  /* ---------------- R10 emojileri ---------------- */
  var SMILIES = null; // { list: [{id, code, src, desc, cat}] }
  var smiliesLoading = null;
  function loadSmilies(fr) {
    if (SMILIES) return Promise.resolve(SMILIES);
    if (smiliesLoading) return smiliesLoading;
    var set = (fr && fr.opts && fr.opts.emoticonsSet) || [];
    if (!set.length) return Promise.resolve(null);
    smiliesLoading = (async function () {
      var ids = set.map(function (e) { return e.id; }).join(',');
      var KEY = 'r10me:smilies:v1', map = null;
      try {
        var c = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (c && c.ids === ids && Date.now() - c.t < 7 * 864e5) map = c.map;
      } catch (e) {}
      if (!map && r10Token()) {
        // R10'un kendi dönüştürücüsüyle emoji kimliği -> metin kodu eşlemesini çıkar
        var html = set.map(function (e) { return '<p>⟦' + e.id + '⟧<span class="fr-emoticon" smilieid="' + e.id + '">&nbsp;</span></p>'; }).join('');
        var body = 'securitytoken=' + encodeURIComponent(r10Token()) + '&do=editorswitchmodern&towysiwyg=0&parsetype=172&allowsmilie=1&message=' + encodeURIComponent(html);
        var txt = await fetch(r10AjaxURL('editorswitchmodern'), {
          method: 'POST', credentials: 'include', body: body,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
        }).then(function (r) { return r.text(); });
        var m = txt.match(/<message>([\s\S]*)<\/message>/);
        var bb = m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '') : '';
        map = {};
        bb.split('⟦').slice(1).forEach(function (part) {
          var mm = part.match(/^(\d+)⟧\s*([\s\S]*?)\s*$/);
          if (mm && mm[2] && !/\[IMG\]/i.test(mm[2])) map[mm[1]] = mm[2];
        });
        if (Object.keys(map).length) { try { localStorage.setItem(KEY, JSON.stringify({ ids: ids, t: Date.now(), map: map })); } catch (e) {} }
      }
      map = map || {};
      if (window.R10BB) window.R10BB.smilies = map;
      SMILIES = {
        list: set.filter(function (e) { return map[e.id]; }).map(function (e) {
          return { id: e.id, code: map[e.id], src: absURL(e.code), desc: e.desc || '', cat: e.category === 'Genel' ? 'Genel' : 'Rokito' };
        })
      };
      return SMILIES;
    })().catch(function () { smiliesLoading = null; return null; });
    return smiliesLoading;
  }

  var Smilie = TNode.create({
    name: 'smilie', group: 'inline', inline: true, atom: true, selectable: false, draggable: false,
    addAttributes: function () {
      return {
        code: { default: null, parseHTML: function (el) { return el.getAttribute('data-smilie'); } },
        src: { default: null, parseHTML: function (el) { return el.getAttribute('src'); } }
      };
    },
    parseHTML: function () { return [{ tag: 'img[data-smilie]', priority: 100 }]; },
    renderHTML: function (p) {
      return ['img', { src: p.node.attrs.src, 'data-smilie': p.node.attrs.code, alt: p.node.attrs.code, title: p.node.attrs.code, class: 'r10me-smilie', draggable: 'false' }];
    },
    renderText: function (p) { return p.node.attrs.code; }
  });

  /* ---------------- @kullanıcı etiketleme ---------------- */
  var mentionCtl = null, mentionLast = { q: null, res: [] };
  async function mentionSearch(query) {
    if (!r10Token() || !query) return [];
    if (mentionLast.q === query) return mentionLast.res;
    await new Promise(function (r) { setTimeout(r, 180); });
    if (mentionCtl) mentionCtl.abort();
    mentionCtl = new AbortController();
    try {
      var doc = await r10Ajax({ do: 'uyeArama', fragment: query }, mentionCtl.signal);
      var out = [];
      doc.querySelectorAll('user').forEach(function (u) {
        var name = xmlText(u, 'username'), id = xmlText(u, 'userid');
        if (name && name.toLowerCase().indexOf(query.toLowerCase()) !== -1) out.push({ id: id, name: name });
      });
      mentionLast = { q: query, res: out.slice(0, 8) };
      return mentionLast.res;
    } catch (e) { return []; }
  }

  var R10Mention = Extension.create({
    name: 'r10mention',
    addProseMirrorPlugins: function () {
      var editor = this.editor;
      return [Suggestion({
        editor: editor,
        char: '@',
        allowSpaces: false,
        items: function (p) { return mentionSearch(p.query); },
        command: function (p) {
          p.editor.chain().focus().insertContentAt(p.range, '@' + p.props.name + '; ').run();
        },
        render: function () {
          var el = null, items = [], idx = 0, cmd = null, dark = false;
          function paint(loading) {
            if (!el) return;
            el.innerHTML = '';
            if (!items.length) {
              el.appendChild(h('div', { class: 'r10me-mention-empty', text: loading ? 'Aranıyor…' : 'Kullanıcı bulunamadı' }));
              return;
            }
            items.forEach(function (it, i) {
              el.appendChild(h('button', {
                type: 'button', class: 'r10me-mention-item' + (i === idx ? ' is-active' : ''),
                onmousedown: function (e) { e.preventDefault(); },
                onclick: function () { cmd(it); }
              }, [h('img', { src: 'https://cdn.r10.net/image.php?u=' + encodeURIComponent(it.id), alt: '' }), h('span', { text: it.name })]));
            });
          }
          function place(rectFn) {
            if (!el || !rectFn) return;
            var r = rectFn();
            if (!r) return;
            el.style.left = Math.min(r.left, window.innerWidth - 260) + 'px';
            el.style.top = (r.bottom + 6) + 'px';
          }
          return {
            onStart: function (p) {
              dark = isDark();
              items = p.items || []; idx = 0; cmd = p.command;
              el = h('div', { class: 'r10me-pop r10me-mention' + (dark ? ' r10me--dark' : '') });
              document.body.appendChild(el);
              paint(!items.length && p.query);
              place(p.clientRect);
            },
            onUpdate: function (p) {
              items = p.items || []; idx = 0; cmd = p.command;
              paint(false);
              place(p.clientRect);
            },
            onKeyDown: function (p) {
              var e = p.event;
              if (!items.length) return e.key === 'Escape';
              if (e.key === 'ArrowDown') { idx = (idx + 1) % items.length; paint(); return true; }
              if (e.key === 'ArrowUp') { idx = (idx + items.length - 1) % items.length; paint(); return true; }
              if (e.key === 'Enter' || e.key === 'Tab') { cmd(items[idx]); return true; }
              if (e.key === 'Escape') { if (el) { el.remove(); el = null; } return true; }
              return false;
            },
            onExit: function () { if (el) el.remove(); el = null; }
          };
        }
      })];
    }
  });

  /* ---------------- modal ---------------- */
  function showModal(title, dark, opts) {
    opts = opts || {};
    var overlay = h('div', { class: 'r10me-modal-overlay' + (dark ? ' r10me--dark' : '') });
    var closeBtn = h('button', { type: 'button', class: 'r10me-modal-x', title: 'Kapat', onclick: function () { close(); } }, [icon(X)]);
    var bodyEl = h('div', { class: 'r10me-modal-body' });
    var footEl = h('div', { class: 'r10me-modal-foot' });
    var titleEl = h('h3', { text: title });
    var dlg = h('div', { class: 'r10me-modal' + (opts.wide ? ' is-wide' : '') + (dark ? ' r10me--dark' : ''), role: 'dialog' }, [
      h('div', { class: 'r10me-modal-head' }, [titleEl, closeBtn]), bodyEl, footEl
    ]);
    overlay.appendChild(dlg);
    document.body.appendChild(overlay);
    var onKey = function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    function close() {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (opts.onClose) opts.onClose();
    }
    return { body: bodyEl, foot: footEl, title: titleEl, close: close, el: dlg };
  }

  /* ---------------- sözlük: şüpheli kelime işaretleri ---------------- */
  var spellKey = new PluginKey('r10meSpell');
  var SpellMarks = Extension.create({
    name: 'spellMarks',
    addProseMirrorPlugins: function () {
      return [new Plugin({
        key: spellKey,
        state: {
          init: function () { return DecorationSet.empty; },
          apply: function (tr, set) {
            var meta = tr.getMeta(spellKey);
            if (meta && meta.set) return meta.set;
            if (meta && meta.clear) return DecorationSet.empty;
            set = set.map(tr.mapping, tr.doc);
            if (meta && meta.remove) {
              set = set.remove(set.find(undefined, undefined, function (spec) { return spLower(spec.word) === meta.remove; }));
            }
            if (tr.docChanged) {
              var bad = set.find().filter(function (d) { return d.from >= d.to || tr.doc.textBetween(d.from, d.to) !== d.spec.word; });
              if (bad.length) set = set.remove(bad);
            }
            return set;
          }
        },
        props: { decorations: function (state) { return spellKey.getState(state); } }
      })];
    }
  });

  var IGNORE_KEY = 'r10me:ignore';
  function getIgnore() {
    try { var a = JSON.parse(localStorage.getItem(IGNORE_KEY) || '[]'); var o = {}; a.forEach(function (w) { o[w] = 1; }); return o; } catch (e) { return {}; }
  }
  function addIgnore(w) {
    try {
      var a = JSON.parse(localStorage.getItem(IGNORE_KEY) || '[]');
      var lw = spLower(w);
      if (a.indexOf(lw) === -1) { a.push(lw); if (a.length > 3000) a = a.slice(-3000); localStorage.setItem(IGNORE_KEY, JSON.stringify(a)); }
    } catch (e) {}
  }

  var spellSeq = 0, spellWait = {};
  window.addEventListener('message', function (e) {
    if (e.source !== window || !e.data || e.data.__r10spell !== 'res') return;
    var cb = spellWait[e.data.id];
    if (cb) { delete spellWait[e.data.id]; cb(e.data.res); }
  });
  function spellCall(payload, timeout) {
    return new Promise(function (resolve) {
      if (document.documentElement.getAttribute('data-r10spell') !== 'on') { resolve(null); return; }
      var id = 's' + (++spellSeq) + '_' + Date.now();
      var t = setTimeout(function () { delete spellWait[id]; resolve(null); }, timeout || 45000);
      spellWait[id] = function (res) { clearTimeout(t); resolve(res); };
      window.postMessage({ __r10spell: 'req', id: id, payload: payload }, location.origin);
    });
  }
  async function dictLookup(words, onProgress) {
    var first = await spellCall({ words: words.map(function (x) { return { w: x.w, alts: x.alts }; }), suggest: false });
    if (!first || !first.ok) return null;
    var res = first.res || {};
    var need = words.filter(function (x) { var r = res[x.w]; return x.wantSugg && r && !r.ok && !r.alt; }).slice(0, 80);
    for (var i = 0; i < need.length; i += 8) {
      if (onProgress) onProgress(i, need.length);
      var part = await spellCall({ words: need.slice(i, i + 8).map(function (x) { return { w: x.w }; }), suggest: true, maxSuggest: 8 });
      if (part && part.ok) Object.keys(part.res).forEach(function (k) { if (part.res[k].sugg) res[k].sugg = part.res[k].sugg; });
    }
    return res;
  }
  var deasciifier = null;
  function deasciify(s) {
    if (!deasciifier) deasciifier = new Deasciifier();
    return deasciifier.deasciify(s);
  }
  var PROPER_SET = {};
  Object.keys(PROPER).forEach(function (k) { PROPER_SET[k] = 1; });

  /* ---------------- boyutlandırılabilir görsel ---------------- */
  var MIN_IMG = 32;
  var ResizableImage = Image.extend({
    addAttributes: function () {
      var parent = this.parent ? this.parent() : {};
      return Object.assign({}, parent, {
        width: {
          default: null,
          parseHTML: function (el) {
            var v = (el.style && el.style.width) || el.getAttribute('width') || '';
            if (!v || /%|auto/i.test(v)) return null;
            var n = Math.round(parseFloat(v));
            return n > 0 ? n : null;
          },
          renderHTML: function (a) { return a.width ? { style: 'width: ' + a.width + 'px' } : {}; }
        }
      });
    },
    addNodeView: function () {
      return function (props) {
        var node = props.node, editor = props.editor, getPos = props.getPos;
        var dom = document.createElement('span');
        dom.className = 'r10me-img';
        dom.contentEditable = 'false';
        var img = document.createElement('img');
        img.draggable = false;
        var badge = document.createElement('span');
        badge.className = 'r10me-img-badge';
        dom.appendChild(img);
        dom.appendChild(badge);
        var handles = ['nw', 'ne', 'sw', 'se'].map(function (pos) {
          var hd = document.createElement('span');
          hd.className = 'r10me-img-h r10me-img-h-' + pos;
          hd.setAttribute('data-pos', pos);
          dom.appendChild(hd);
          return hd;
        });
        function paint() {
          img.src = node.attrs.src;
          if (node.attrs.alt) img.alt = node.attrs.alt;
          img.style.width = node.attrs.width ? node.attrs.width + 'px' : '';
          badge.textContent = node.attrs.width ? node.attrs.width + ' px' : 'Orijinal';
        }
        paint();
        function maxWidth() {
          var pm = editor.view.dom;
          var cs = getComputedStyle(pm);
          return Math.max(MIN_IMG, pm.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
        }
        handles.forEach(function (hd) {
          hd.addEventListener('mousedown', function (e) {
            e.preventDefault(); e.stopPropagation();
            var left = /w$/.test(hd.getAttribute('data-pos'));
            var startX = e.clientX;
            var startW = img.getBoundingClientRect().width;
            var maxW = maxWidth();
            var cur = startW;
            dom.classList.add('is-resizing');
            function move(ev) {
              var dx = ev.clientX - startX;
              cur = Math.round(Math.max(MIN_IMG, Math.min(maxW, startW + (left ? -dx : dx))));
              img.style.width = cur + 'px';
              badge.textContent = cur + ' px';
            }
            function up() {
              document.removeEventListener('mousemove', move, true);
              document.removeEventListener('mouseup', up, true);
              dom.classList.remove('is-resizing');
              var pos = typeof getPos === 'function' ? getPos() : null;
              if (pos == null) return;
              editor.chain().focus().command(function (p) {
                p.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, { width: cur }));
                return true;
              }).setNodeSelection(pos).run();
            }
            document.addEventListener('mousemove', move, true);
            document.addEventListener('mouseup', up, true);
          });
        });
        return {
          dom: dom,
          update: function (n) {
            if (n.type !== node.type) return false;
            node = n; paint(); return true;
          },
          selectNode: function () { dom.classList.add('is-selected'); },
          deselectNode: function () { dom.classList.remove('is-selected'); },
          stopEvent: function (e) { return !!(e.target && e.target.classList && e.target.classList.contains('r10me-img-h')); },
          ignoreMutation: function () { return true; }
        };
      };
    }
  });

  /* ---------------- açılır panel yöneticisi ---------------- */
  var openPop = null;
  function closePop() {
    if (openPop) {
      openPop.el.remove();
      document.removeEventListener('mousedown', openPop.out, true);
      document.removeEventListener('keydown', openPop.esc, true);
      window.removeEventListener('resize', closePop);
      var cb = openPop.onClose; openPop = null;
      if (cb) cb();
    }
  }
  function showPop(anchor, content, dark, onClose) {
    closePop();
    var el = h('div', { class: 'r10me-pop' + (dark ? ' r10me--dark' : '') }, [content]);
    // düğmelere basınca editör odağını/seçimini kaybetmesin (inputlar hariç)
    el.addEventListener('mousedown', function (e) {
      var t = e.target;
      if (t.closest && t.closest('button') && !(t.closest('input,textarea,select'))) e.preventDefault();
    });
    document.body.appendChild(el);
    var r = anchor.getBoundingClientRect();
    var w = el.offsetWidth, ht = el.offsetHeight;
    var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    var top = r.bottom + 6;
    if (top + ht > window.innerHeight - 8) top = Math.max(8, r.top - ht - 6);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    var out = function (e) { if (!el.contains(e.target) && !anchor.contains(e.target)) closePop(); };
    var esc = function (e) { if (e.key === 'Escape') { e.stopPropagation(); closePop(); } };
    document.addEventListener('mousedown', out, true);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('resize', closePop);
    openPop = { el: el, out: out, esc: esc, onClose: onClose, anchor: anchor };
    return el;
  }

  /* ================= ModernEditor ================= */
  function ModernEditor(fr) {
    this.fr = fr;
    this.active = false;
    this.view = 'write';
    this.dark = isDark();
    this.form = fr.$oel[0].form;
    // R10 özel mesaj ekranı: sabit yükseklikli sohbet düzeni
    this.compact = !!(fr.$box && fr.$box[0] && fr.$box[0].closest && fr.$box[0].closest('.privateMessages'));
    this.buildDOM();
    this.buildEditor();
    this.bindGlobal();
    this.hookFroala();
    if (this.compact) this.bindCompactLayout();
  }

  ModernEditor.prototype.buildDOM = function () {
    var self = this;
    injectCSS();
    var box = this.fr.$box[0];

    // değiştirici
    this.btnR10 = h('button', { type: 'button', title: 'R10\'un kendi editörü', onclick: function () { self.deactivate(true); } }, [icon(Type), 'R10 Editörü']);
    this.btnModern = h('button', { type: 'button', class: 'is-modern', title: 'Modern editör', onclick: function () { self.activate(true); } }, [icon(Sparkles), 'Modern Editör']);
    this.switchEl = h('div', { class: 'r10me-switch' }, [
      h('div', { class: 'r10me-seg' }, [this.btnR10, this.btnModern]),
      h('span', { class: 'r10me-hint', text: 'Biçimlendirme kayıpsız aktarılır' })
    ]);
    box.parentNode.insertBefore(this.switchEl, box);

    // kutu
    this.root = h('div', { class: 'r10me', hidden: true });
    this.toolbar = h('div', { class: 'r10me-toolbar', role: 'toolbar' });
    this.banner = h('div', { class: 'r10me-banner', hidden: true });
    this.scroll = h('div', { class: 'r10me-scroll' });
    this.editorHost = h('div', { class: 'r10me-host' });
    this.source = h('textarea', { class: 'r10me-source', spellcheck: 'false', hidden: true, placeholder: 'BBCode…', form: 'r10me-detached' });
    this.preview = h('div', { hidden: true });
    this.scroll.appendChild(this.editorHost);
    this.scroll.appendChild(this.source);
    this.scroll.appendChild(this.preview);
    this.body = h('div', { class: 'r10me-body' }, [this.scroll]);
    this.statusChars = h('span');
    this.statusDraft = h('span');
    this.status = h('div', { class: 'r10me-status' }, [
      this.statusChars, this.statusDraft, h('span', { class: 'r10me-spacer' }),
      h('span', {}, [h('span', { class: 'r10me-kbd', text: 'Ctrl' }), ' + ', h('span', { class: 'r10me-kbd', text: 'Enter' }), ' gönder'])
    ]);
    this.root.appendChild(this.toolbar);
    this.root.appendChild(this.banner);
    this.root.appendChild(this.body);
    this.root.appendChild(this.status);
    box.parentNode.insertBefore(this.root, box.nextSibling);
    // Editör içindeki hiçbir alan R10 formuna dahil olmasın (doğrulama/gönderim etkilenmesin)
    var detach = function (root) {
      root.querySelectorAll('input, textarea, select, button').forEach(function (el) {
        if (!el.hasAttribute('form')) el.setAttribute('form', 'r10me-detached');
        if (el.tagName === 'BUTTON' && !el.getAttribute('type')) el.type = 'button';
      });
    };
    new MutationObserver(function () { detach(self.root); detach(self.switchEl); }).observe(this.root, { childList: true, subtree: true });
    detach(this.root); detach(this.switchEl);

    if (this.compact) { this.root.classList.add('is-compact'); this.switchEl.classList.add('is-compact'); }
    var minH = this.compact ? 96 : Math.max(320, (this.fr.opts && this.fr.opts.heightMin) || 0);
    this.scroll.style.minHeight = minH + 'px';
    this.applyTheme();
  };

  ModernEditor.prototype.applyTheme = function () {
    this.dark = isDark();
    [this.root, this.switchEl].forEach(function (el) { el.classList.toggle('r10me--dark', this.dark); }, this);
    var st = stickyTop();
    this.root.style.setProperty('--me-sticky', st + 'px');
    this.updateScrollMargins(st);
  };

  // Sayfa kaydırılırken imleç yapışkan başlık + araç çubuğunun altında kalmasın
  ModernEditor.prototype.updateScrollMargins = function (st) {
    if (!this.editor || !this.toolbar) return;
    if (st == null) st = stickyTop();
    var full = this.root.classList.contains('is-full');
    var top = full ? 20 : st + (this.toolbar.offsetHeight || 80) + 16;
    try {
      this.editor.setOptions({ editorProps: Object.assign({}, this.editor.options.editorProps, {
        scrollThreshold: { top: top, bottom: 60, left: 0, right: 0 },
        scrollMargin: { top: top, bottom: 60, left: 0, right: 0 }
      }) });
    } catch (e) {}
  };

  // BBCode sekmesindeki metin kutusu da içerik kadar uzasın
  ModernEditor.prototype.fitSource = function () {
    if (this.source.hidden || this.root.classList.contains('is-full')) { this.source.style.height = ''; return; }
    this.source.style.height = 'auto';
    this.source.style.height = Math.max(this.source.scrollHeight + 2, this.compact ? 96 : 320) + 'px';
  };

  // Özel mesaj ekranı: R10 sohbet alanının yüksekliğini editör yüksekliğine göre
  // hesaplıyor (pmHeight). Editör boyu değiştikçe yeniden hesaplat.
  ModernEditor.prototype.bindCompactLayout = function () {
    var self = this, raf = 0, last = -1;
    var relayout = function () {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var host = self.root.closest('.editor') || self.root.parentNode;
        var hgt = host ? host.offsetHeight : 0;
        if (hgt === last) return;
        last = hgt;
        try { if (typeof window.pmHeight === 'function') window.pmHeight(); } catch (e) {}
      });
    };
    this.relayout = relayout;
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(relayout);
      ro.observe(this.root); ro.observe(this.switchEl);
      try { ro.observe(this.fr.$box[0]); } catch (e) {}
    }
  };

  // R10'un kendi kodu gizli Froala'ya doğrudan yazdığında (konuşma değişimi,
  // gönderim sonrası temizleme, alıntı ekleme) modern editör de güncellensin.
  ModernEditor.prototype.hookFroala = function () {
    var self = this, fr = this.fr;
    if (!fr.html || fr.__r10meHooked) return;
    fr.__r10meHooked = true;
    var origSet = fr.html.set, origInsert = fr.html.insert;
    if (typeof origSet === 'function') {
      fr.html.set = function () {
        var r = origSet.apply(this, arguments);
        if (!self._writing && self.active) { try { self.onExternalSet(arguments[0]); } catch (e) {} }
        return r;
      };
    }
    if (typeof origInsert === 'function') {
      fr.html.insert = function () {
        if (!self._writing && self.active) {
          try { self.onExternalInsert(arguments[0]); return; } catch (e) {}
        }
        return origInsert.apply(this, arguments);
      };
    }
  };

  ModernEditor.prototype.onExternalSet = function (html) {
    var bb = window.R10BB.htmlToBB(String(html || ''));
    if (bb !== this.getBB()) { this.setBB(bb); closePop(); }
    this.syncedBB = bb;
    this.banner.hidden = true;
    if (!bb.trim()) {
      // gönderimden hemen sonra boşaltıldıysa gönderilen taslağı sil
      if (this.pendingSent && Date.now() - this.pendingSent.t < 60000) {
        try { localStorage.removeItem(this.pendingSent.key); } catch (e) {}
      }
      this.pendingSent = null;
      var self = this;
      setTimeout(function () { if (self.active) self.checkDraft(); }, 60);
    }
  };

  ModernEditor.prototype.onExternalInsert = function (html) {
    var bb = window.R10BB.htmlToBB(String(html || ''));
    if (!bb) return;
    this.insertBBAtCursor(bb);
    this.onChange();
  };

  ModernEditor.prototype.buildEditor = function () {
    var self = this;
    this.editor = new Editor({
      element: this.editorHost,
      extensions: [
        StarterKit.configure({ codeBlock: false, code: false, blockquote: false, horizontalRule: false, heading: { levels: [1, 2, 3] } }),
        Underline, TextStyle.configure({ mergeNestedSpanStyles: true }), Color, FontFamily, FontSize, Indent,
        TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] }),
        Link.extend({ inclusive: function () { return false; } }).configure({ openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: null, target: null, class: null } }),
        ResizableImage.configure({ inline: true, allowBase64: false }),
        Placeholder.configure({ placeholder: 'Mesajınızı yazın… (Ctrl+Enter ile gönderin)' }),
        CharacterCount, ProofHighlight, SpellMarks, Smilie, R10Mention
      ],
      content: '',
      editorProps: {
        attributes: { spellcheck: 'true' },
        scrollThreshold: { top: 0, bottom: 60, left: 0, right: 0 },
        scrollMargin: { top: 0, bottom: 60, left: 0, right: 0 },
        handleKeyDown: function (view, e) {
          // Görsel seçiliyken yazı yazmak/Enter görseli silmesin: imleci görselin arkasına al
          var ns = view.state.selection;
          if (ns.node && ns.node.type.name === 'image' && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key.length === 1 || e.key === 'Enter')) {
            var after = ns.from + ns.node.nodeSize;
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, after)));
            if (e.key === ' ') { view.dispatch(view.state.tr.insertText(' ')); e.preventDefault(); return true; }
            return false;
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); self.submit(); return true; }
          if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); self.openLink(self.btn.link); return true; }
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); self.runProofread(self.btn.proof); return true; }
          if (e.key === 'Tab' && !self.editor.isActive('listItem')) {
            e.preventDefault();
            if (e.shiftKey) self.editor.commands.outdent(); else self.editor.commands.indent();
            return true;
          }
          return false;
        },
        handleClick: function (view, pos, e) {
          var set = spellKey.getState(view.state);
          if (!set || set === DecorationSet.empty) return false;
          var hit = set.find(pos, pos).filter(function (d) { return d.from <= pos && pos <= d.to; })[0];
          if (!hit) return false;
          var el = e.target && e.target.closest ? e.target.closest('.r10me-misspell') : null;
          self.openSpellPop(el || self.btn.proof, hit);
          return false;
        },
        handlePaste: function (view, e) {
          var files = e.clipboardData && e.clipboardData.files;
          if (files && files.length && /^image\//.test(files[0].type)) { e.preventDefault(); self.uploadFiles(files); return true; }
          return false;
        },
        handleDrop: function (view, e) {
          var files = e.dataTransfer && e.dataTransfer.files;
          if (files && files.length && /^image\//.test(files[0].type)) { e.preventDefault(); self.uploadFiles(files); return true; }
          return false;
        }
      },
      onUpdate: function () { self.onChange(); self.updateImageBar(); },
      onBlur: function () { setTimeout(function () { self.updateImageBar(); }, 150); },
      onSelectionUpdate: function () { self.refreshToolbar(); self.updateImageBar(); },
      onTransaction: function () { self.refreshToolbar(); }
    });
    this.buildToolbar();
    this.refreshStatus();
  };

  /* ---------------- araç çubuğu ---------------- */
  ModernEditor.prototype.buildToolbar = function () {
    var self = this, ed = this.editor, tb = this.toolbar;
    this.btn = {};
    function btn(key, ic, title, run, opts) {
      opts = opts || {};
      var kids = [];
      if (ic) kids.push(icon(ic));
      if (opts.label) { var lb = h('span', { class: 'r10me-label', text: opts.label }); kids.push(lb); }
      if (opts.caret) kids.push(icon(ChevronDown, 'r10me-caret'));
      var b = h('button', {
        type: 'button', class: 'r10me-btn' + (opts.swatch ? ' has-swatch' : ''), title: title, 'aria-label': title,
        onmousedown: function (e) { e.preventDefault(); },
        onclick: function (e) { e.preventDefault(); run(b, e); }
      }, kids);
      if (opts.swatch) { b.swatch = h('span', { class: 'r10me-swatch' }); b.appendChild(b.swatch); }
      self.btn[key] = b;
      tb.appendChild(b);
      return b;
    }
    function sep() { tb.appendChild(h('span', { class: 'r10me-sep' })); }

    btn('undo', Undo2, 'Geri al (Ctrl+Z)', function () { ed.chain().focus().undo().run(); });
    btn('redo', Redo2, 'Yinele (Ctrl+Y)', function () { ed.chain().focus().redo().run(); });
    sep();
    btn('block', Pilcrow, 'Paragraf biçimi', function (b) { self.openBlock(b); }, { label: 'Paragraf', caret: true });
    btn('size', null, 'Yazı boyutu', function (b) { self.openSize(b); }, { label: 'Boyut', caret: true });
    btn('font', null, 'Yazı tipi', function (b) { self.openFont(b); }, { label: 'Yazı tipi', caret: true });
    sep();
    btn('bold', Bold, 'Kalın (Ctrl+B)', function () { ed.chain().focus().toggleBold().run(); });
    btn('italic', Italic, 'İtalik (Ctrl+I)', function () { ed.chain().focus().toggleItalic().run(); });
    btn('underline', UnderlineIcon, 'Altı çizili (Ctrl+U)', function () { ed.chain().focus().toggleUnderline().run(); });
    btn('strike', Strikethrough, 'Üstü çizili', function () { ed.chain().focus().toggleStrike().run(); });
    btn('color', Palette, 'Yazı rengi', function (b) { self.openColor(b); }, { swatch: true });
    sep();
    btn('left', AlignLeft, 'Sola hizala', function () { ed.chain().focus().setTextAlign('left').run(); });
    btn('center', AlignCenter, 'Ortala', function () { ed.chain().focus().setTextAlign('center').run(); });
    btn('right', AlignRight, 'Sağa hizala', function () { ed.chain().focus().setTextAlign('right').run(); });
    sep();
    btn('ul', List, 'Madde işaretli liste', function () { ed.chain().focus().toggleBulletList().run(); });
    btn('ol', ListOrdered, 'Numaralı liste', function () { ed.chain().focus().toggleOrderedList().run(); });
    btn('outdent', IndentDecrease, 'Girintiyi azalt (Shift+Tab)', function () { ed.chain().focus().outdent().run(); });
    btn('indent', IndentIncrease, 'Girinti (Tab)', function () { ed.chain().focus().indent().run(); });
    sep();
    btn('link', LinkIcon, 'Bağlantı (Ctrl+K)', function (b) { self.openLink(b); });
    btn('image', ImageIcon, 'Resim ekle', function (b) { self.openImage(b); });
    btn('emoji', Smile, 'Emoji', function (b) { self.openEmoji(b); });
    btn('gif', ImagePlay, 'GIF', function (b) { self.openGif(b); });
    sep();
    btn('quote', Quote, 'Alıntı [QUOTE]', function () { self.wrapBB('[QUOTE]', '[/QUOTE]'); });
    btn('spoiler', EyeOff, 'Spoiler [SPOILER]', function () { self.wrapBB('[SPOILER]', '[/SPOILER]'); });
    btn('code', Code, 'Kod bloğu', function (b) { self.openCode(b); }, { caret: true });
    sep();
    if (r10Token()) btn('replies', MessageSquareText, 'Hazır Cevaplarım', function () { self.openReplies(); });
    btn('markdown', Hash, 'Markdown ekle', function () { self.openMarkdown(); });
    btn('proof', SpellCheck, 'Yazım ve noktalama hatalarını düzelt (seçim varsa yalnız seçimi)', function (b) { self.runProofread(b); }, { label: 'Düzelt' });
    btn('clear', RemoveFormatting, 'Biçimlendirmeyi temizle', function () { ed.chain().focus().unsetAllMarks().unsetTextAlign().run(); ed.commands.outdent(); ed.commands.outdent(); ed.commands.outdent(); ed.commands.outdent(); });

    tb.appendChild(h('span', { class: 'r10me-spacer' }));
    this.tabWrite = h('button', { type: 'button', class: 'is-on', onclick: function () { self.setView('write'); } }, [icon(PenLine), 'Yaz']);
    this.tabSource = h('button', { type: 'button', onclick: function () { self.setView('source'); } }, [icon(FileCode), 'BBCode']);
    this.tabPreview = h('button', { type: 'button', onclick: function () { self.setView('preview'); } }, [icon(Eye), 'Önizle']);
    tb.appendChild(h('div', { class: 'r10me-tabs' }, [this.tabWrite, this.tabSource, this.tabPreview]));
    this.fullBtn = btn('full', Maximize2, 'Tam ekran', function () { self.toggleFull(); });
  };

  ModernEditor.prototype.refreshToolbar = function () {
    if (!this.btn || !this.active) return;
    var ed = this.editor, b = this.btn, writing = this.view === 'write';
    var set = function (k, on) { if (b[k]) b[k].classList.toggle('is-active', !!on); };
    set('bold', ed.isActive('bold')); set('italic', ed.isActive('italic'));
    set('underline', ed.isActive('underline')); set('strike', ed.isActive('strike'));
    var align = ed.isActive({ textAlign: 'center' }) ? 'center' : ed.isActive({ textAlign: 'right' }) ? 'right' : 'left';
    set('left', align === 'left'); set('center', align === 'center'); set('right', align === 'right');
    set('ul', ed.isActive('bulletList')); set('ol', ed.isActive('orderedList'));
    set('link', ed.isActive('link'));
    var ts = ed.getAttributes('textStyle') || {};
    var sz = SIZES.filter(function (s) { return ts.fontSize === s.px + 'px'; })[0];
    b.size.querySelector('.r10me-label').textContent = sz ? sz.px + 'px' : 'Boyut';
    b.font.querySelector('.r10me-label').textContent = ts.fontFamily ? String(ts.fontFamily).replace(/["']/g, '').split(',')[0] : 'Yazı tipi';
    b.color.swatch.style.background = ts.color || 'transparent';
    var lvl = [1, 2, 3].filter(function (l) { return ed.isActive('heading', { level: l }); })[0];
    b.block.querySelector('.r10me-label').textContent = lvl ? 'Başlık ' + lvl : 'Paragraf';
    b.undo.classList.toggle('is-disabled', !writing || !ed.can().undo());
    b.redo.classList.toggle('is-disabled', !writing || !ed.can().redo());
    Object.keys(b).forEach(function (k) {
      if (k === 'full' || k === 'undo' || k === 'redo') return;
      b[k].classList.toggle('is-disabled', !writing);
    });
  };

  /* ---------------- paneller ---------------- */
  ModernEditor.prototype.menu = function (anchor, title, items) {
    var self = this;
    var wrap = h('div', {}, title ? [h('div', { class: 'r10me-title', text: title })] : []);
    items.forEach(function (it) {
      var el = h('button', {
        type: 'button', class: 'r10me-item' + (it.active ? ' is-active' : ''), style: it.style || null,
        onclick: function () { closePop(); it.run(); }
      }, [it.icon ? icon(it.icon) : null, h('span', { text: it.label }), it.hint ? h('small', { text: it.hint }) : null]);
      wrap.appendChild(el);
    });
    showPop(anchor, wrap, self.dark);
  };

  ModernEditor.prototype.openBlock = function (b) {
    var ed = this.editor;
    this.menu(b, 'Paragraf biçimi', [
      { label: 'Paragraf', icon: Pilcrow, active: ed.isActive('paragraph'), run: function () { ed.chain().focus().setParagraph().run(); } },
      { label: 'Başlık 1', style: 'font-size:20px;font-weight:700', active: ed.isActive('heading', { level: 1 }), run: function () { ed.chain().focus().toggleHeading({ level: 1 }).run(); } },
      { label: 'Başlık 2', style: 'font-size:17px;font-weight:700', active: ed.isActive('heading', { level: 2 }), run: function () { ed.chain().focus().toggleHeading({ level: 2 }).run(); } },
      { label: 'Başlık 3', style: 'font-size:15px;font-weight:700', active: ed.isActive('heading', { level: 3 }), run: function () { ed.chain().focus().toggleHeading({ level: 3 }).run(); } }
    ]);
  };

  ModernEditor.prototype.openSize = function (b) {
    var ed = this.editor, cur = (ed.getAttributes('textStyle') || {}).fontSize;
    var items = [{ label: 'Varsayılan', active: !cur, run: function () { ed.chain().focus().unsetFontSize().run(); } }];
    SIZES.forEach(function (s) {
      items.push({
        label: s.label, hint: s.px + 'px', active: cur === s.px + 'px', style: 'font-size:' + Math.min(s.px, 26) + 'px',
        run: function () { ed.chain().focus().setFontSize(s.px + 'px').run(); }
      });
    });
    this.menu(b, 'Yazı boyutu', items);
  };

  ModernEditor.prototype.openFont = function (b) {
    var ed = this.editor, cur = (ed.getAttributes('textStyle') || {}).fontFamily;
    var items = [{ label: 'Varsayılan', active: !cur, run: function () { ed.chain().focus().unsetFontFamily().run(); } }];
    FONTS.forEach(function (f) {
      items.push({ label: f, style: 'font-family:"' + f + '"', active: cur && cur.replace(/["']/g, '') === f, run: function () { ed.chain().focus().setFontFamily(f).run(); } });
    });
    this.menu(b, 'Yazı tipi', items);
  };

  ModernEditor.prototype.openColor = function (b) {
    var self = this, ed = this.editor, cur = ((ed.getAttributes('textStyle') || {}).color || '').toUpperCase();
    var grid = h('div', { class: 'r10me-grid' });
    COLORS.forEach(function (c) {
      grid.appendChild(h('button', {
        type: 'button', title: c, class: cur === c ? 'is-active' : null, style: 'background:' + c,
        onclick: function () { closePop(); ed.chain().focus().setColor(c).run(); }
      }));
    });
    var picker = h('input', { type: 'color', value: /^#[0-9A-F]{6}$/.test(cur) ? cur.toLowerCase() : '#f39c1e' });
    picker.addEventListener('change', function () { closePop(); ed.chain().focus().setColor(picker.value.toUpperCase()).run(); });
    var form = h('div', { class: 'r10me-form', style: 'min-width:0;padding:2px' }, [
      h('div', { class: 'r10me-title', text: 'Yazı rengi' }), grid,
      h('div', { class: 'r10me-color-custom' }, [picker, h('span', { text: 'Özel renk' }), h('span', { class: 'r10me-spacer', style: 'flex:1' }),
        h('button', { type: 'button', class: 'is-ghost', onclick: function () { closePop(); ed.chain().focus().unsetColor().run(); } }, ['Kaldır'])])
    ]);
    showPop(b, form, self.dark);
  };

  ModernEditor.prototype.insertSmilie = function (sm) {
    this.collapseImageSelection();
    this.editor.chain().focus().insertContent([{ type: 'smilie', attrs: { code: sm.code, src: sm.src } }, { type: 'text', text: ' ' }]).run();
  };

  ModernEditor.prototype.openEmoji = function (b) {
    var self = this, ed = this.editor;
    var wrap = h('div', { class: 'r10me-tabpanel' });
    var tabs = h('div', { class: 'r10me-ptabs' });
    var grid = h('div', { class: 'r10me-emoji r10me-emoji-img' });
    wrap.appendChild(tabs); wrap.appendChild(grid);
    var cats = [];
    if (SMILIES && SMILIES.list.length) cats.push('Rokito', 'Genel');
    cats.push('Emoji');
    var cur = this._emojiTab && cats.indexOf(this._emojiTab) !== -1 ? this._emojiTab : cats[0];
    function render() {
      tabs.innerHTML = '';
      cats.forEach(function (c) {
        tabs.appendChild(h('button', { type: 'button', class: c === cur ? 'is-on' : null, text: c, onclick: function () { cur = c; self._emojiTab = c; render(); } }));
      });
      grid.innerHTML = '';
      grid.classList.toggle('r10me-emoji-img', cur !== 'Emoji');
      if (cur === 'Emoji') {
        EMOJI.forEach(function (em) {
          if (!em) return;
          grid.appendChild(h('button', { type: 'button', text: em, onclick: function () { self.collapseImageSelection(); ed.chain().focus().insertContent(em).run(); } }));
        });
      } else {
        SMILIES.list.filter(function (x) { return x.cat === cur; }).forEach(function (sm) {
          grid.appendChild(h('button', { type: 'button', title: (sm.desc ? sm.desc + ' ' : '') + sm.code, onclick: function () { self.insertSmilie(sm); } }, [h('img', { src: sm.src, alt: sm.code, loading: 'lazy' })]));
        });
      }
    }
    render();
    showPop(b, wrap, this.dark);
    if (!SMILIES) loadSmilies(this.fr).then(function (r) { if (r && document.body.contains(wrap)) { cats = ['Rokito', 'Genel', 'Emoji']; cur = 'Rokito'; render(); } });
  };

  /* ---------------- GIF ---------------- */
  var ROKITO_GIFS = [['Çekirdek', 1], ['Kahkaha', 2], ['Kalp Gözler', 3], ['Pasta', 4], ['Alkış', 5], ['Puro', 6], ['Sinirli 1', 7], ['Sinirli 2', 8], ['Gözleri Şaşı', 9], ['Şaşıran', 10]];

  ModernEditor.prototype.insertGif = function (src) {
    closePop();
    this.collapseImageSelection();
    this.editor.chain().focus().insertContent([{ type: 'image', attrs: { src: src } }, { type: 'text', text: ' ' }]).run();
    this.selectInsertedImage(src);
  };

  ModernEditor.prototype.openGif = function (b) {
    var self = this;
    var wrap = h('div', { class: 'r10me-tabpanel r10me-gifpanel' });
    var tabs = h('div', { class: 'r10me-ptabs' });
    var search = h('input', { type: 'text', class: 'r10me-gif-search', placeholder: 'GIF ara (en az 3 harf)…', form: 'r10me-detached' });
    var grid = h('div', { class: 'r10me-gifs' });
    var note = h('div', { class: 'r10me-gif-note', text: 'Powered by GIPHY' });
    wrap.appendChild(tabs); wrap.appendChild(search); wrap.appendChild(grid); wrap.appendChild(note);
    var cur = this._gifTab || 'Rokito';
    var page = 1, q = '', loading = false, done = false, seq = 0;
    function gifCell(thumb, full, title) {
      return h('button', { type: 'button', title: title, onclick: function () { self.insertGif(full); } }, [h('img', { src: thumb, alt: title, loading: 'lazy' })]);
    }
    function loadGiphy(reset) {
      if (loading || (done && !reset)) return;
      if (reset) { page = 1; done = false; grid.innerHTML = ''; }
      if (page > 10) { done = true; return; }
      loading = true;
      var my = ++seq;
      var url = 'https://api.r10.net/vb3/giphy?p=' + page + (q ? '&q=' + encodeURIComponent(q) : '');
      var spin = h('div', { class: 'r10me-gif-loading', text: 'Yükleniyor…' });
      grid.appendChild(spin);
      fetch(url).then(function (r) { return r.json(); }).then(function (list) {
        if (my !== seq) return;
        spin.remove();
        if (!Array.isArray(list) || !list.length) { done = true; if (page === 1) grid.appendChild(h('div', { class: 'r10me-gif-loading', text: 'Sonuç bulunamadı' })); return; }
        list.forEach(function (g) {
          grid.appendChild(gifCell('https://media3.giphy.com/media/' + g.id + '/100.gif', 'https://media3.giphy.com/media/' + g.id + '/200.gif', g.name || 'GIF'));
        });
        page++;
      }).catch(function () { spin.textContent = 'GIF\'ler yüklenemedi'; }).then(function () { loading = false; });
    }
    function render() {
      tabs.innerHTML = '';
      ['Rokito', 'Giphy'].forEach(function (c) {
        tabs.appendChild(h('button', { type: 'button', class: c === cur ? 'is-on' : null, text: c, onclick: function () { cur = c; self._gifTab = c; render(); } }));
      });
      search.hidden = cur !== 'Giphy';
      note.hidden = cur !== 'Giphy';
      grid.innerHTML = '';
      if (cur === 'Rokito') {
        ROKITO_GIFS.forEach(function (g) {
          var u = 'https://cdn.r10.net/gifs/' + g[1] + '.gif';
          grid.appendChild(gifCell(u, u, g[0]));
        });
      } else {
        loadGiphy(true);
        setTimeout(function () { search.focus(); }, 0);
      }
    }
    var tmr = null;
    search.addEventListener('input', function () {
      clearTimeout(tmr);
      tmr = setTimeout(function () {
        var v = search.value.trim();
        var nq = v.length >= 3 ? v : '';
        if (nq !== q) { q = nq; loadGiphy(true); }
      }, 250);
    });
    search.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') e.preventDefault(); });
    grid.addEventListener('scroll', function () {
      if (cur === 'Giphy' && grid.scrollTop + grid.clientHeight > grid.scrollHeight - 80) loadGiphy(false);
    });
    render();
    showPop(b, wrap, this.dark);
  };

  /* ---------------- Hazır Cevaplarım ---------------- */
  function parseReplies(doc) {
    var out = [];
    doc.querySelectorAll('cevap').forEach(function (c) {
      out.push({ id: xmlText(c, 'id'), title: xmlText(c, 'baslik'), message: xmlText(c, 'mesaj') });
    });
    return out;
  }

  ModernEditor.prototype.insertBBAtCursor = function (bb) {
    var ed = this.editor;
    this.collapseImageSelection();
    var html = window.R10BB.bbToHTML(bb, { emptyParagraph: '', smilies: SMILIES && SMILIES.list });
    if (ed.isEmpty) {
      ed.chain().focus().setContent(html, true).focus('end').run();
    } else {
      ed.chain().focus().insertContent(html).run();
    }
  };

  ModernEditor.prototype.openReplies = function () {
    var self = this;
    closePop();
    var md = showModal('Hazır Cevaplarım', this.dark);
    var list = [];
    var searchEl = h('input', { type: 'text', class: 'r10me-input', placeholder: 'Cevaplarımda ara…', form: 'r10me-detached' });
    var listEl = h('div', { class: 'r10me-replies' });
    md.body.appendChild(h('div', { class: 'r10me-search' }, [icon(Search), searchEl]));
    md.body.appendChild(listEl);
    var newBtn = h('button', { type: 'button', class: 'r10me-mbtn is-primary', onclick: function () { showForm(null); } }, [icon(Plus), 'Yeni cevap oluştur']);
    md.foot.appendChild(newBtn);

    function cleanMsg(m) {
      return String(m || '').replace(/<br\s*\/?>/gi, '\n').replace(/&nbsp;/g, ' ').replace(/\r\n?/g, '\n').replace(/^\s+|\s+$/g, '');
    }
    function renderList() {
      var qv = searchEl.value.trim().toLocaleLowerCase('tr-TR');
      var terms = qv ? qv.split(/\s+/) : [];
      listEl.innerHTML = '';
      var shown = list.filter(function (r) {
        if (!terms.length) return true;
        var t = (r.title + ' ' + r.message).toLocaleLowerCase('tr-TR');
        return terms.some(function (x) { return t.indexOf(x) !== -1; });
      });
      if (!shown.length) {
        listEl.appendChild(h('div', { class: 'r10me-empty', text: list.length ? 'Eşleşen cevap yok' : 'Henüz hazır cevabınız yok. "Yeni cevap oluştur" ile ekleyebilirsiniz.' }));
        return;
      }
      shown.forEach(function (r) {
        var delBtn = h('button', { type: 'button', class: 'r10me-icbtn is-danger', title: 'Sil' }, [icon(Trash2)]);
        var armed = false;
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!armed) { armed = true; delBtn.classList.add('is-armed'); delBtn.title = 'Silmek için tekrar tıklayın'; delBtn.innerHTML = ''; delBtn.appendChild(document.createTextNode('Sil?')); setTimeout(function () { armed = false; delBtn.classList.remove('is-armed'); delBtn.innerHTML = ''; delBtn.appendChild(icon(Trash2)); }, 3000); return; }
          busy(true);
          r10Ajax({ do: 'hazirCevapIslem', i: '1', id: r.id }).then(function (doc) { list = parseReplies(doc); renderList(); self.toast('Cevap silindi'); })
            .catch(function (er) { self.toast(er.message || 'Silinemedi', true); }).then(function () { busy(false); });
        });
        var editBtn = h('button', { type: 'button', class: 'r10me-icbtn', title: 'Düzenle', onclick: function (e) { e.stopPropagation(); showForm(r); } }, [icon(Pencil)]);
        listEl.appendChild(h('div', { class: 'r10me-reply', title: 'Mesaja eklemek için tıklayın', onclick: function () {
          md.close(); self.insertBBAtCursor(cleanMsg(r.message)); self.toast('“' + r.title + '” eklendi');
        } }, [
          h('div', { class: 'r10me-reply-top' }, [h('b', { text: r.title }), h('span', { class: 'r10me-spacer' }), editBtn, delBtn]),
          h('div', { class: 'r10me-reply-msg', text: cleanMsg(r.message).slice(0, 220) })
        ]));
      });
    }
    function busy(on) { md.el.classList.toggle('is-busy', !!on); }
    function load() {
      busy(true);
      listEl.innerHTML = '';
      listEl.appendChild(h('div', { class: 'r10me-empty', text: 'Yükleniyor…' }));
      r10Ajax({ do: 'hazirCevaplar' }).then(function (doc) { list = parseReplies(doc); renderList(); })
        .catch(function (er) { listEl.innerHTML = ''; listEl.appendChild(h('div', { class: 'r10me-empty', text: 'Cevaplar yüklenemedi: ' + (er.message || '') })); })
        .then(function () { busy(false); setTimeout(function () { searchEl.focus(); }, 0); });
    }
    function showForm(r) {
      var fm = showModal(r ? 'Hazır Cevabı Düzenle' : 'Hazır Cevap Ekle', self.dark);
      var t = h('input', { type: 'text', class: 'r10me-input', placeholder: 'Başlık', value: r ? r.title : '', form: 'r10me-detached' });
      var m = h('textarea', { class: 'r10me-input', rows: '9', placeholder: 'Mesajınız (BBCode kullanabilirsiniz)', form: 'r10me-detached' });
      m.value = r ? cleanMsg(r.message) : (self.editor.isEmpty ? '' : self.getBB());
      fm.body.appendChild(h('label', { class: 'r10me-label', text: 'Başlık' })); fm.body.appendChild(t);
      fm.body.appendChild(h('label', { class: 'r10me-label', text: 'Mesaj' })); fm.body.appendChild(m);
      if (!r && !self.editor.isEmpty) fm.body.appendChild(h('div', { class: 'r10me-hint2', text: 'Editördeki mevcut metin hazır olarak getirildi.' }));
      var save = h('button', { type: 'button', class: 'r10me-mbtn is-primary' }, [icon(Check), r ? 'Kaydet' : 'Ekle']);
      fm.foot.appendChild(h('button', { type: 'button', class: 'r10me-mbtn', onclick: function () { fm.close(); } }, ['İptal']));
      fm.foot.appendChild(save);
      [t, m].forEach(function (x) { x.addEventListener('keydown', function (e) { e.stopPropagation(); }); });
      save.addEventListener('click', function () {
        if (!t.value.trim() || !m.value.trim()) { self.toast('Lütfen tüm alanları doldurun', true); return; }
        fm.el.classList.add('is-busy');
        var params = { do: 'hazirCevapIslem', title: t.value.trim(), response: m.value };
        if (r) params.id = r.id;
        r10Ajax(params).then(function (doc) {
          list = parseReplies(doc); renderList(); fm.close(); self.toast(r ? 'Cevap güncellendi' : 'Cevap eklendi');
        }).catch(function (er) { fm.el.classList.remove('is-busy'); self.toast(er.message || 'Kaydedilemedi', true); });
      });
      setTimeout(function () { t.focus(); }, 0);
    }
    searchEl.addEventListener('input', renderList);
    searchEl.addEventListener('keydown', function (e) { e.stopPropagation(); });
    load();
  };

  /* ---------------- Markdown ---------------- */
  var CODE_LANG = { php: 'PHPR', html: 'HTMLR', xml: 'HTMLR', htm: 'HTMLR', css: 'CSSR', scss: 'CSSR', js: 'JSR', javascript: 'JSR', ts: 'JSR', typescript: 'JSR', jsx: 'JSR', json: 'JSR' };
  function markdownToBB(md) {
    var html = marked.parse(md || '', { gfm: true, breaks: true });
    var doc = new DOMParser().parseFromString('<!doctype html><body>' + html + '</body>', 'text/html');
    var b = doc.body;
    function para(text) { var p = doc.createElement('p'); p.textContent = text; return p; }
    b.querySelectorAll('pre').forEach(function (pre) {
      var code = pre.querySelector('code');
      var lang = code && (code.className.match(/language-([\w-]+)/) || [])[1];
      var tag = (lang && CODE_LANG[lang.toLowerCase()]) || 'CODE';
      var lines = (code ? code.textContent : pre.textContent).replace(/\n$/, '').split('\n');
      var frag = doc.createDocumentFragment();
      lines.forEach(function (ln, i) {
        var p2 = para((i === 0 ? '[' + tag + ']' : '') + ln + (i === lines.length - 1 ? '[/' + tag + ']' : ''));
        p2.setAttribute('data-code', '1');
        frag.appendChild(p2);
      });
      pre.replaceWith(frag);
    });
    b.querySelectorAll('code').forEach(function (c) { c.replaceWith(doc.createTextNode(c.textContent)); });
    b.querySelectorAll('blockquote').forEach(function (q) {
      var first = q.firstElementChild, last = q.lastElementChild;
      if (first) first.insertBefore(doc.createTextNode('[QUOTE]'), first.firstChild); else q.insertBefore(doc.createTextNode('[QUOTE]'), q.firstChild);
      if (last) last.appendChild(doc.createTextNode('[/QUOTE]')); else q.appendChild(doc.createTextNode('[/QUOTE]'));
      var frag = doc.createDocumentFragment();
      while (q.firstChild) frag.appendChild(q.firstChild);
      q.replaceWith(frag);
    });
    b.querySelectorAll('hr').forEach(function (hr) { hr.replaceWith(doc.createElement('p')); });
    b.querySelectorAll('table').forEach(function (t) {
      var frag = doc.createDocumentFragment();
      t.querySelectorAll('tr').forEach(function (tr) {
        var p = doc.createElement('p');
        var cells = Array.prototype.map.call(tr.children, function (c) { return c.textContent.trim(); });
        if (tr.querySelector('th')) { var s2 = doc.createElement('strong'); s2.textContent = cells.join(' | '); p.appendChild(s2); }
        else p.textContent = cells.join(' | ');
        frag.appendChild(p);
      });
      t.replaceWith(frag);
    });
    b.querySelectorAll('input[type="checkbox"]').forEach(function (c) { c.replaceWith(doc.createTextNode(c.checked ? '☑ ' : '☐ ')); });
    // bloklar arasına boş satır (Markdown'daki paragraf aralığı); kod satırları bitişik kalır
    var blocks = Array.prototype.slice.call(b.children);
    blocks.forEach(function (el, i) {
      if (i === 0) return;
      var prevEl = blocks[i - 1];
      if (el.hasAttribute('data-code') && prevEl.hasAttribute('data-code') && !/^\[(CODE|PHPR|HTMLR|CSSR|JSR)\]/.test(el.textContent)) return;
      if (/^(LI)$/.test(el.tagName)) return;
      b.insertBefore(doc.createElement('p'), el);
    });
    return window.R10BB.htmlToBB(b.innerHTML);
  }

  ModernEditor.prototype.openMarkdown = function () {
    var self = this;
    closePop();
    var md = showModal('Markdown ekle', this.dark, { wide: true });
    var ta = h('textarea', { class: 'r10me-input r10me-md-input', spellcheck: 'false', form: 'r10me-detached',
      placeholder: '# Başlık\n\n**Kalın**, *italik*, ~~üstü çizili~~, [bağlantı](https://r10.net)\n\n- madde\n- madde\n\n1. bir\n2. iki\n\n> alıntı\n\n```php\n<?php echo "kod"; ?>\n```' });
    var prev = h('div', { class: 'r10me-preview r10me-md-preview' });
    md.body.appendChild(h('div', { class: 'r10me-md-grid' }, [
      h('div', {}, [h('div', { class: 'r10me-label', text: 'Markdown' }), ta]),
      h('div', {}, [h('div', { class: 'r10me-label', text: 'Önizleme (R10 biçimi)' }), prev])
    ]));
    var lastBB = '';
    var update = debounce(function () {
      try { lastBB = markdownToBB(ta.value); } catch (e) { lastBB = ''; }
      prev.innerHTML = window.R10BB.bbToHTML(lastBB, { smilies: SMILIES && SMILIES.list }) || '<p class="r10me-empty">Önizleme burada görünecek</p>';
    }, 200);
    ta.addEventListener('input', update);
    ta.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Tab') { e.preventDefault(); var st = ta.selectionStart; ta.value = ta.value.slice(0, st) + '  ' + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = st + 2; update(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); add(); }
    });
    function add() {
      var bb;
      try { bb = markdownToBB(ta.value); } catch (e) { self.toast('Markdown dönüştürülemedi', true); return; }
      if (!bb.trim()) { md.close(); return; }
      md.close();
      self.insertBBAtCursor(bb);
      self.toast('Markdown eklendi');
    }
    md.foot.appendChild(h('span', { class: 'r10me-hint2', text: 'Ctrl+Enter ile ekle' }));
    md.foot.appendChild(h('span', { class: 'r10me-spacer' }));
    md.foot.appendChild(h('button', { type: 'button', class: 'r10me-mbtn', onclick: function () { md.close(); } }, ['İptal']));
    md.foot.appendChild(h('button', { type: 'button', class: 'r10me-mbtn is-primary', onclick: add }, [icon(Check), 'Ekle']));
    update();
    setTimeout(function () { ta.focus(); }, 0);
  };

  ModernEditor.prototype.openCode = function (b) {
    var self = this;
    var T = function (label, tag) { return { label: label, hint: '[' + tag + ']', icon: Code, run: function () { self.wrapBB('[' + tag + ']', '[/' + tag + ']'); } }; };
    this.menu(b, 'Kod bloğu', [
      T('Genel', 'CODE'), T('PHP', 'PHPR'), T('HTML', 'HTMLR'), T('CSS', 'CSSR'), T('JS', 'JSR'), T('CodePen', 'CODEPEN'), T('JSFiddle', 'JSFIDDLE')
    ]);
  };

  ModernEditor.prototype.openLink = function (b) {
    var self = this, ed = this.editor;
    var href = ed.getAttributes('link').href || '';
    var sel = ed.state.selection;
    var url = h('input', { type: 'url', placeholder: 'https://', value: href });
    var text = h('input', { type: 'text', placeholder: 'Görünen metin (isteğe bağlı)' });
    var needText = sel.empty && !href;
    function apply() {
      var u = url.value.trim();
      if (!u) { closePop(); return; }
      if (!/^(https?:|mailto:|\/)/i.test(u)) u = (/@/.test(u) && !/\//.test(u) ? 'mailto:' : 'https://') + u;
      closePop();
      if (needText) {
        var t = text.value.trim() || u.replace(/^mailto:/i, '');
        ed.chain().focus().insertContent({ type: 'text', text: t, marks: [{ type: 'link', attrs: { href: u } }] }).unsetMark('link').run();
      } else {
        ed.chain().focus().extendMarkRange('link').setLink({ href: u }).run();
      }
    }
    [url, text].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); apply(); } }); });
    var form = h('div', { class: 'r10me-form' }, [
      h('label', { text: 'Bağlantı adresi' }), url,
      needText ? h('label', { text: 'Metin' }) : null, needText ? text : null,
      h('div', { class: 'r10me-row' }, [
        href ? h('button', { type: 'button', class: 'is-danger', onclick: function () { closePop(); ed.chain().focus().extendMarkRange('link').unsetLink().run(); } }, [icon(Unlink), 'Kaldır']) : null,
        h('span', { class: 'r10me-spacer' }),
        h('button', { type: 'button', class: 'is-ghost', onclick: closePop }, ['Vazgeç']),
        h('button', { type: 'button', class: 'is-primary', onclick: apply }, [icon(Check), 'Uygula'])
      ])
    ]);
    showPop(b, form, this.dark);
    setTimeout(function () { url.focus(); url.select(); }, 0);
  };

  // Seçili bir görsel varsa, yeni içerik onun yerine geçmesin: imleci görselin arkasına al
  ModernEditor.prototype.collapseImageSelection = function () {
    var ed = this.editor, sel = ed.state.selection;
    if (sel.node && sel.node.type.name === 'image') {
      ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, sel.from + sel.node.nodeSize)));
    }
  };

  // Yeni eklenen görseli seçili yap: köşe tutamaçları + görsel menüsü hemen görünsün
  ModernEditor.prototype.selectInsertedImage = function (src) {
    var ed = this.editor, doc = ed.state.doc, head = ed.state.selection.from, best = null;
    doc.descendants(function (node, pos) {
      if (node.type.name === 'image' && node.attrs.src === src) {
        if (best === null || (pos <= head && pos > best) || (best > head && pos < best)) best = pos;
      }
    });
    if (best === null) return;
    var tr = ed.state.tr.setSelection(NodeSelection.create(doc, best)).scrollIntoView();
    ed.view.dispatch(tr);
    ed.view.focus();
    var self = this;
    // görsel yüklendikçe boyutu değişir: menüyü yeniden konumla
    var dom = ed.view.nodeDOM(best);
    var img = dom && dom.querySelector ? dom.querySelector('img') : null;
    if (img && !img.complete) img.addEventListener('load', function () { self.updateImageBar(); }, { once: true });
    this.updateImageBar();
  };

  // R10 varsayılanı: görsel kendi satırında ortalanmış
  ModernEditor.prototype.insertImageBlock = function (src) {
    var ed = this.editor;
    this.collapseImageSelection();
    var node = { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'image', attrs: { src: src } }] };
    var $f = ed.state.selection.$from;
    if ($f.parent.type.name === 'paragraph' && $f.parent.content.size === 0) {
      // boş satırdaysa o satırı kullan
      ed.chain().focus().command(function (p) {
        var pos = $f.before($f.depth);
        p.tr.replaceWith(pos, pos + $f.parent.nodeSize, p.state.schema.nodeFromJSON(node));
        return true;
      }).run();
    } else {
      ed.chain().focus().insertContent(node).run();
    }
    this.selectInsertedImage(src);
  };

  ModernEditor.prototype.openImage = function (b, replacePos) {
    var self = this;
    var replacing = typeof replacePos === 'number';
    var url = h('input', { type: 'url', placeholder: 'https://…/resim.png', form: 'r10me-detached' });
    var file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif', multiple: !replacing, style: 'display:none', form: 'r10me-detached' });
    file.addEventListener('change', function () { closePop(); if (file.files.length) self.uploadFiles(file.files, replacing ? replacePos : null); });
    function apply() {
      var u = url.value.trim();
      closePop();
      if (!u) return;
      if (replacing) self.replaceImageSrc(replacePos, u); else self.insertImageBlock(u);
    }
    url.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    var o = this.fr.opts || {};
    var canUpload = !!o.imageUploadURL;
    var canGallery = !!o.imageManagerLoadURL;
    var form = h('div', { class: 'r10me-form' }, [
      h('label', { text: replacing ? 'Yeni görsel adresi' : 'Resim adresi' }), url,
      h('div', { class: 'r10me-row' }, [
        canUpload ? h('button', { type: 'button', class: 'is-ghost', onclick: function () { file.click(); } }, [icon(Upload), 'Yükle']) : null,
        canGallery ? h('button', { type: 'button', class: 'is-ghost', onclick: function () { closePop(); self.openGallery(replacing ? replacePos : null); } }, [icon(Images), 'Yüklediklerim']) : null,
        h('span', { class: 'r10me-spacer' }),
        h('button', { type: 'button', class: 'is-primary', onclick: apply }, [icon(Check), replacing ? 'Değiştir' : 'Ekle'])
      ]), file
    ]);
    showPop(b, form, this.dark);
    setTimeout(function () { url.focus(); }, 0);
  };

  /* ---------------- Yüklediklerim (R10 görsel galerisi) ---------------- */
  ModernEditor.prototype.openGallery = function (replacePos) {
    var self = this, o = this.fr.opts || {};
    var replacing = typeof replacePos === 'number';
    var md = showModal('Yüklediklerim', this.dark, { wide: true });
    var grid = h('div', { class: 'r10me-gallery' });
    var info = h('span', { class: 'r10me-hint2' });
    md.body.appendChild(grid);
    md.foot.appendChild(info);
    md.foot.appendChild(h('span', { class: 'r10me-spacer' }));
    var uploadIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif', multiple: true, style: 'display:none', form: 'r10me-detached' });
    uploadIn.addEventListener('change', function () { if (uploadIn.files.length) { md.close(); self.uploadFiles(uploadIn.files, replacing ? replacePos : null); } });
    md.foot.appendChild(uploadIn);
    if (o.imageUploadURL) md.foot.appendChild(h('button', { type: 'button', class: 'r10me-mbtn', onclick: function () { uploadIn.click(); } }, [icon(Upload), 'Yeni yükle']));
    md.foot.appendChild(h('button', { type: 'button', class: 'r10me-mbtn', onclick: function () { md.close(); } }, ['Kapat']));
    var all = [], shown = 0, PAGE = 60;
    function req(urlStr, method, params) {
      var body = new URLSearchParams();
      Object.keys(params || {}).forEach(function (k) { body.append(k, params[k]); });
      var m = (method || 'GET').toUpperCase();
      var u = m === 'GET' ? urlStr + (urlStr.indexOf('?') === -1 ? '?' : '&') + body.toString() : urlStr;
      return fetch(u, {
        method: m, body: m === 'GET' ? undefined : body,
        credentials: o.requestWithCredentials ? 'include' : 'same-origin', headers: o.requestHeaders || {}
      });
    }
    function cell(it) {
      var src = absURL(it.thumb || it.url);
      var del = h('button', { type: 'button', class: 'r10me-gal-del', title: 'Sil' }, [icon(Trash2)]);
      var armed = false;
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!o.imageManagerDeleteURL) return;
        if (!armed) { armed = true; del.classList.add('is-armed'); del.title = 'Kalıcı olarak silmek için tekrar tıklayın'; setTimeout(function () { armed = false; del.classList.remove('is-armed'); }, 3000); return; }
        var p = Object.assign({ src: it.url }, o.imageManagerDeleteParams || {});
        c.classList.add('is-busy');
        req(o.imageManagerDeleteURL, o.imageManagerDeleteMethod || 'POST', p).then(function (r) {
          if (!r.ok) throw new Error('Silinemedi');
          all = all.filter(function (x) { return x !== it; }); shown--;
          c.remove(); info.textContent = all.length + ' görsel';
          self.toast('Görsel silindi');
        }).catch(function (er) { c.classList.remove('is-busy'); self.toast(er.message || 'Silinemedi', true); });
      });
      var c = h('div', { class: 'r10me-gal-item', title: 'Eklemek için tıklayın' }, [h('img', { src: src, loading: 'lazy', alt: '' }), o.imageManagerDeleteURL ? del : null]);
      c.addEventListener('click', function () {
        md.close();
        var full = absURL(it.url);
        if (replacing) self.replaceImageSrc(replacePos, full); else self.insertImageBlock(full);
      });
      return c;
    }
    function more() {
      all.slice(shown, shown + PAGE).forEach(function (it) { grid.appendChild(cell(it)); });
      shown = Math.min(all.length, shown + PAGE);
    }
    md.body.addEventListener('scroll', function () {
      if (md.body.scrollTop + md.body.clientHeight > md.body.scrollHeight - 200 && shown < all.length) more();
    });
    grid.appendChild(h('div', { class: 'r10me-empty', text: 'Yükleniyor…' }));
    req(o.imageManagerLoadURL, o.imageManagerLoadMethod || 'GET', o.imageManagerLoadParams || {})
      .then(function (r) { return r.json(); })
      .then(function (list) {
        grid.innerHTML = '';
        all = (Array.isArray(list) ? list : []).filter(function (x) { return x && x.url; }).reverse();
        info.textContent = all.length + ' görsel';
        if (!all.length) { grid.appendChild(h('div', { class: 'r10me-empty', text: 'Henüz yüklediğiniz görsel yok.' })); return; }
        more();
      })
      .catch(function () { grid.innerHTML = ''; grid.appendChild(h('div', { class: 'r10me-empty', text: 'Görseller yüklenemedi.' })); });
  };

  /* ---------------- boş alana tıklama ---------------- */
  ModernEditor.prototype.onEmptyAreaMouseDown = function (e) {
    if (e.button !== 0 || this.view !== 'write' || !this.active) return;
    var view = this.editor.view, pm = view.dom, sc = this.scroll;
    var t = e.target;
    // içerik öğelerine (paragraf, görsel, tutamaç vb.) yapılan tıklamalar normal işlesin
    if (pm.contains(t) && t !== pm) return;
    if (t !== pm && t !== sc && t !== this.editorHost) return;
    // kaydırma çubuğu ve sağ-alt boyutlandırma köşesi
    var sr = sc.getBoundingClientRect();
    if (e.clientX > sr.left + sc.clientWidth || e.clientY > sr.top + sc.clientHeight) return;
    if (e.clientX > sr.right - 18 && e.clientY > sr.bottom - 18) return;

    var last = pm.lastElementChild;
    var lastBottom = last ? last.getBoundingClientRect().bottom : -Infinity;
    var ed = this.editor;
    e.preventDefault();
    if (e.clientY > lastBottom) {
      // içeriğin altı: son bloğun sonuna git; son blok paragraf değilse yeni paragraf aç
      var doc = ed.state.doc, lastNode = doc.lastChild;
      if (lastNode && lastNode.type.name !== 'paragraph') {
        ed.chain().insertContentAt(doc.content.size, { type: 'paragraph' }).focus('end').run();
      } else {
        ed.commands.focus('end');
      }
      return;
    }
    // içeriğin yanı (sol/sağ boşluk): aynı yükseklikteki satırın en yakın noktası
    var pr = pm.getBoundingClientRect();
    var cs = getComputedStyle(pm);
    var x = Math.min(Math.max(e.clientX, pr.left + parseFloat(cs.paddingLeft) + 1), pr.right - parseFloat(cs.paddingRight) - 1);
    var hit = view.posAtCoords({ left: x, top: e.clientY });
    if (hit) ed.chain().focus().setTextSelection(hit.pos).run();
    else ed.commands.focus('end');
  };

  /* ---------------- yazım / noktalama düzeltme ---------------- */
  var CODE_OPEN = /\[(CODE|PHP|HTML|NOPARSE|PHPR|HTMLR|CSSR|JSR|CODEPEN|JSFIDDLE)(?:=[^\]]*)?\]/i;

  // Belgedeki metin bloklarını (konum haritasıyla) topla; kod alanlarını maskele
  ModernEditor.prototype.collectBlocks = function () {
    var doc = this.editor.state.doc;
    var sel = this.editor.state.selection;
    var limit = (!sel.empty && !sel.node) ? { from: sel.from, to: sel.to } : null;
    var blocks = [];
    var codeTag = null;
    doc.descendants(function (node, pos) {
      if (!node.isTextblock) return true;
      var text = '', map = [];
      node.forEach(function (child, offset) {
        var p = pos + 1 + offset;
        if (child.isText) { for (var i = 0; i < child.text.length; i++) map.push(p + i); text += child.text; }
        else if (child.type.name === 'hardBreak') { map.push(p); text += '\n'; }
        else { map.push(p); text += '￼'; }
      });
      var end = pos + 1 + node.content.size;
      var pre = '', i2 = 0;
      while (i2 < text.length) {
        if (codeTag) {
          var cm = text.slice(i2).match(new RegExp('\\[\\/' + codeTag + '\\]', 'i'));
          var stop = cm ? i2 + cm.index + cm[0].length : text.length;
          for (var q = i2; q < stop; q++) pre += '';
          i2 = stop;
          if (cm) codeTag = null;
        } else {
          var om = text.slice(i2).match(CODE_OPEN);
          if (!om) { pre += text.slice(i2); break; }
          pre += text.slice(i2, i2 + om.index);
          var st = i2 + om.index;
          for (var q2 = st; q2 < st + om[0].length; q2++) pre += '';
          i2 = st + om[0].length;
          codeTag = om[1];
        }
      }
      if (!text) return false;
      if (limit && (end < limit.from || pos > limit.to)) return false;
      blocks.push({ text: text, map: map, end: end, pre: pre });
      return false;
    });
    return { blocks: blocks, limit: limit };
  };

  // Orijinal ve düzeltilmiş metinden belge düzenlemeleri + görüntüleme listesi üret
  ModernEditor.prototype.buildEdits = function (blocks, finals, limit) {
    var edits = [], groups = [];
    blocks.forEach(function (b, bi) {
      var fixed = finals[bi];
      if (fixed == null || fixed === b.pre) return;
      var parts = diffChars(b.pre, fixed);
      var idx = 0, local = [];
      for (var k = 0; k < parts.length; k++) {
        if (!parts[k].added && !parts[k].removed) { idx += parts[k].value.length; continue; }
        var a = idx, e2 = idx, ins = '';
        while (k < parts.length && (parts[k].added || parts[k].removed)) {
          if (parts[k].removed) e2 += parts[k].value.length; else ins += parts[k].value;
          k++;
        }
        k--;
        idx = e2;
        var from = a < b.map.length ? b.map[a] : b.end;
        var to = e2 > a ? b.map[e2 - 1] + 1 : from;
        if (limit && (from < limit.from || to > limit.to)) continue;
        local.push({ a: a, b: e2, ins: ins, from: from, to: to });
      }
      if (!local.length) return;
      Array.prototype.push.apply(edits, local);
      var isSp = function (c) { return /\s/.test(c); };
      var g = null;
      local.forEach(function (e) {
        var ws = e.a; while (ws > 0 && !isSp(b.text.charAt(ws - 1))) ws--;
        var we = e.b; while (we < b.text.length && !isSp(b.text.charAt(we))) we++;
        if (g && ws <= g.we) { g.we = Math.max(g.we, we); g.edits.push(e); }
        else { g = { ws: ws, we: we, edits: [e], text: b.text }; groups.push(g); }
      });
    });
    var list = groups.map(function (g) {
      var oldS = g.text.slice(g.ws, g.we), newS = '', cur = g.ws;
      g.edits.forEach(function (e) { newS += g.text.slice(cur, e.a) + e.ins; cur = e.b; });
      newS += g.text.slice(cur, g.we);
      var clean = function (x) { return x.replace(/￼/g, '▣').replace(/\n/g, ' ↵ ').trim(); };
      return { old: clean(oldS), neu: clean(newS) };
    });
    return { edits: edits, list: list };
  };

  ModernEditor.prototype.setProofBusy = function (on, text) {
    var b = this.btn.proof;
    if (!b) return;
    b.classList.toggle('is-busy', !!on);
    var lb = b.querySelector('.r10me-label');
    if (lb) lb.textContent = on ? (text || 'Denetleniyor…') : 'Düzelt';
  };

  ModernEditor.prototype.runProofread = async function (anchor) {
    var self = this, ed = this.editor;
    if (this.view !== 'write' || this._proofBusy) return;
    this._proofBusy = true;
    closePop();
    this.setProofBusy(true);
    try {
      var docAtStart = ed.state.doc;
      var col = this.collectBlocks();
      var blocks = col.blocks;
      var dictOk = true;
      var results = null;
      try {
        results = await processBlocks(blocks.map(function (b) { return b.pre; }), {
          proofread: proofread, mask: prMask, deasciify: deasciify, ignore: getIgnore(), proper: PROPER_SET,
          lookup: function (words) {
            return dictLookup(words, function (done, total) { self.setProofBusy(true, 'Sözlük ' + done + '/' + total); });
          }
        });
      } catch (e) { results = null; }
      if (!results) {
        dictOk = false;
        results = blocks.map(function (b) { var f; try { f = proofread(b.pre); } catch (e) { f = b.pre; } return { final: f, fixes: [], flags: [] }; });
      }
      if (ed.state.doc !== docAtStart) { this.toast('Denetim sırasında metin değişti, tekrar deneyin', true); return; }

      var built = this.buildEdits(blocks, results.map(function (r) { return r.final; }), col.limit);
      var flags = {};
      results.forEach(function (r) { r.flags.forEach(function (f) { if (!flags[f.w]) flags[f.w] = f.sugg; }); });
      var flagWords = Object.keys(flags);

      if (built.edits.length) {
        var edits = built.edits.slice().sort(function (x, y) { return y.from - x.from; });
        var tr = ed.state.tr;
        edits.forEach(function (e) {
          if (e.ins) tr.insertText(e.ins, e.from, e.to); else tr.delete(e.from, e.to);
          e.step = tr.steps.length;
        });
        var ranges = [];
        edits.forEach(function (e) {
          if (!e.ins) return;
          var m = tr.mapping.slice(e.step);
          var f = m.map(e.from, 1), t = m.map(e.from + e.ins.length, -1);
          if (/^\s+$/.test(e.ins)) { f = Math.max(0, f - 1); t = Math.min(tr.doc.content.size, t + 1); }
          if (t > f) ranges.push({ from: f, to: t });
        });
        tr.setMeta(proofKey, { ranges: ranges });
        tr.setMeta('addToHistory', true);
        closeHistory(tr);
        ed.view.dispatch(tr);
        clearTimeout(this._proofT);
        this._proofT = setTimeout(function () {
          try { ed.view.dispatch(ed.state.tr.setMeta(proofKey, { clear: true }).setMeta('addToHistory', false)); } catch (e) {}
        }, 4000);
      }
      this.markSpelling(flags);
      ed.commands.focus();

      if (!built.edits.length && !flagWords.length) {
        this.toast((col.limit ? 'Seçili metinde' : 'Metinde') + ' hata bulunamadı ✓' + (dictOk ? '' : ' (sözlük yüklenemedi, yalnız kurallar)'));
        return;
      }
      this.showProofResult(anchor || this.btn.proof, { list: built.list, flags: flags, scoped: !!col.limit, dictOk: dictOk, count: built.list.length });
    } finally {
      this._proofBusy = false;
      this.setProofBusy(false);
    }
  };

  // Şüpheli kelimelerin altını çiz
  ModernEditor.prototype.markSpelling = function (flags) {
    var ed = this.editor, doc = ed.state.doc;
    var words = Object.keys(flags);
    if (!words.length) { ed.view.dispatch(ed.state.tr.setMeta(spellKey, { clear: true }).setMeta('addToHistory', false)); return; }
    var esc = function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    var LT = 'A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû';
    var re = new RegExp('(?<![' + LT + '\\d])(' + words.map(esc).join('|') + ')(?![' + LT + '\\d])', 'gu');
    var decos = [];
    doc.descendants(function (node, pos) {
      if (!node.isTextblock) return true;
      var text = '', map = [];
      node.forEach(function (child, offset) {
        var p = pos + 1 + offset;
        if (child.isText) { for (var i = 0; i < child.text.length; i++) map.push(p + i); text += child.text; }
        else { map.push(p); text += '￼'; }
      });
      var m;
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
        var from = map[m.index], to = map[m.index + m[0].length - 1] + 1;
        decos.push(Decoration.inline(from, to, { class: 'r10me-misspell', title: 'Sözlükte bulunamadı — öneriler için tıklayın' }, { word: m[0], sugg: flags[m[0]] || [] }));
      }
      return false;
    });
    ed.view.dispatch(ed.state.tr.setMeta(spellKey, { set: DecorationSet.create(doc, decos) }).setMeta('addToHistory', false));
  };

  // Bir kelimenin tüm işaretli geçişlerini değiştir
  ModernEditor.prototype.replaceFlagged = function (word, repl, onlyDeco) {
    var ed = this.editor;
    var set = spellKey.getState(ed.state);
    var decos = onlyDeco ? [onlyDeco] : set.find(undefined, undefined, function (spec) { return spec.word === word; });
    if (!decos.length) return;
    var tr = ed.state.tr;
    decos.slice().sort(function (a, b) { return b.from - a.from; }).forEach(function (d) {
      tr.insertText(spMatchCase(d.spec.word, repl), d.from, d.to);
    });
    closeHistory(tr);
    ed.view.dispatch(tr);
    ed.commands.focus();
  };

  ModernEditor.prototype.ignoreWord = function (word) {
    addIgnore(word);
    this.editor.view.dispatch(this.editor.state.tr.setMeta(spellKey, { remove: spLower(word) }).setMeta('addToHistory', false));
  };

  ModernEditor.prototype.openSpellPop = function (anchor, deco) {
    var self = this;
    var word = deco.spec.word, sugg = deco.spec.sugg || [];
    var items = h('div', { class: 'r10me-spell-pop' });
    items.appendChild(h('div', { class: 'r10me-title', text: '“' + word + '” sözlükte yok' }));
    if (sugg.length) {
      var chips = h('div', { class: 'r10me-chips' });
      sugg.slice(0, 6).forEach(function (sg) {
        chips.appendChild(h('button', { type: 'button', class: 'r10me-chip', text: spMatchCase(word, sg), onclick: function () {
          closePop();
          var set = spellKey.getState(self.editor.state);
          var cur = set.find(deco.from, deco.to).filter(function (d) { return d.spec.word === word; })[0];
          if (cur) self.replaceFlagged(word, sg, cur);
        } }));
      });
      items.appendChild(chips);
    } else {
      items.appendChild(h('div', { class: 'r10me-proof-note', style: 'padding:2px 8px 6px', text: 'Öneri bulunamadı.' }));
    }
    items.appendChild(h('div', { class: 'r10me-row', style: 'display:flex;gap:4px;padding:4px' }, [
      sugg.length ? h('button', { type: 'button', class: 'r10me-item', style: 'width:auto', onclick: function () { closePop(); self.replaceFlagged(word, sugg[0]); } }, [h('span', { text: 'Tümünü “' + spMatchCase(word, sugg[0]) + '” yap' })]) : null,
      h('button', { type: 'button', class: 'r10me-item', style: 'width:auto', onclick: function () { closePop(); self.ignoreWord(word); self.toast('“' + word + '” sözlüğünüze eklendi'); } }, [h('span', { text: 'Sözlüğe ekle' })])
    ]));
    showPop(anchor, items, this.dark);
  };

  ModernEditor.prototype.showProofResult = function (anchor, res) {
    var self = this, ed = this.editor;
    var n = res.count;
    var flagWords = Object.keys(res.flags);
    var body = h('div', { class: 'r10me-proof-body' });
    if (n) {
      var listEl = h('div', { class: 'r10me-proof-list' });
      res.list.slice(0, 80).forEach(function (it) {
        listEl.appendChild(h('div', { class: 'r10me-proof-row' }, [
          h('span', { class: 'r10me-proof-old', text: it.old || '␣' }),
          h('span', { class: 'r10me-proof-arrow', text: '→' }),
          h('span', { class: 'r10me-proof-new', text: it.neu || '␣' })
        ]));
      });
      if (n > 80) listEl.appendChild(h('div', { class: 'r10me-proof-more', text: '+' + (n - 80) + ' düzeltme daha' }));
      body.appendChild(listEl);
    }
    if (flagWords.length) {
      body.appendChild(h('div', { class: 'r10me-title', style: 'padding:8px 2px 4px', text: 'Kontrol edin (' + flagWords.length + ')' }));
      var fl = h('div', { class: 'r10me-proof-list' });
      flagWords.slice(0, 40).forEach(function (w) {
        var row = h('div', { class: 'r10me-flag-row' });
        row.appendChild(h('span', { class: 'r10me-flag-word', text: w }));
        var chips = h('span', { class: 'r10me-chips' });
        (res.flags[w] || []).slice(0, 5).forEach(function (sg) {
          chips.appendChild(h('button', { type: 'button', class: 'r10me-chip', text: spMatchCase(w, sg), onclick: function () {
            self.replaceFlagged(w, sg); row.remove();
          } }));
        });
        chips.appendChild(h('button', { type: 'button', class: 'r10me-chip is-ghost', title: 'Bu kelimeyi bir daha işaretleme', text: 'Sözlüğe ekle', onclick: function () {
          self.ignoreWord(w); row.remove();
        } }));
        row.appendChild(chips);
        fl.appendChild(row);
      });
      body.appendChild(fl);
    }
    var head = n ? (n + ' düzeltme yapıldı' + (res.scoped ? ' (seçim)' : '')) : 'Otomatik düzeltme yok';
    var box = h('div', { class: 'r10me-form r10me-proof' }, [
      h('div', { class: 'r10me-proof-head' }, [icon(Check), h('b', { text: head }), flagWords.length ? h('span', { class: 'r10me-proof-flagcount', text: '· ' + flagWords.length + ' kelime kontrol edilmeli' }) : null]),
      body,
      h('div', { class: 'r10me-proof-note', text: res.dictOk
        ? 'Hunspell Türkçe sözlüğü (371 bin kök), Türkçe karakter düzeltici ve yazım/noktalama kuralları. Metin cihazınızdan çıkmaz. Altı kırmızı çizili kelimelere tıklayarak öneri seçebilirsiniz.'
        : 'Sözlük yüklenemedi; yalnız yazım/noktalama kuralları uygulandı.' }),
      h('div', { class: 'r10me-row' }, [
        n ? h('button', { type: 'button', class: 'is-ghost', onclick: function () {
          closePop(); ed.chain().focus().undo().run();
          try { ed.view.dispatch(ed.state.tr.setMeta(proofKey, { clear: true }).setMeta('addToHistory', false)); } catch (e) {}
          self.toast('Düzeltmeler geri alındı');
        } }, [icon(Undo2), 'Geri al']) : null,
        h('span', { class: 'r10me-spacer' }),
        h('button', { type: 'button', class: 'is-primary', onclick: closePop }, [icon(Check), 'Tamam'])
      ])
    ]);
    showPop(anchor, box, this.dark);
  };

  /* ---------------- görsel boyut çubuğu ---------------- */
  ModernEditor.prototype.selectedImage = function () {
    var sel = this.editor.state.selection;
    if (sel && sel.node && sel.node.type.name === 'image') return { node: sel.node, pos: sel.from };
    return null;
  };

  ModernEditor.prototype.setImageWidth = function (w) {
    var im = this.selectedImage();
    if (!im) return;
    this.editor.chain().focus().command(function (p) {
      p.tr.setNodeMarkup(im.pos, undefined, Object.assign({}, im.node.attrs, { width: w }));
      return true;
    }).setNodeSelection(im.pos).run();
  };

  ModernEditor.prototype.imageInfo = function () {
    var im = this.selectedImage();
    if (!im) return null;
    var link = (im.node.marks || []).filter(function (m) { return m.type.name === 'link'; })[0];
    var $p = this.editor.state.doc.resolve(im.pos);
    return { node: im.node, pos: im.pos, href: link ? link.attrs.href : null, align: $p.parent.attrs && $p.parent.attrs.textAlign || 'left' };
  };

  // Görseli kendi paragrafına al ve hizala (R10: [LEFT]/[CENTER]/[RIGHT][IMG]..)
  ModernEditor.prototype.alignImage = function (dir) {
    var im = this.selectedImage();
    if (!im) return;
    var ed = this.editor, tr = ed.state.tr, pos = im.pos;
    var $p = tr.doc.resolve(pos);
    if ($p.parent.type.name === 'paragraph' && $p.parent.childCount > 1) {
      var after = pos + im.node.nodeSize;
      if (after < $p.end()) tr.split(after);
      if (pos > $p.start()) { tr.split(pos); pos += 2; }
    }
    var $n = tr.doc.resolve(pos);
    if ($n.parent.type.name === 'paragraph' || $n.parent.type.name === 'heading') {
      tr.setNodeMarkup($n.before($n.depth), undefined, Object.assign({}, $n.parent.attrs, { textAlign: dir }));
    }
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    ed.view.dispatch(tr);
    ed.commands.focus();
    this.updateImageBar();
  };

  ModernEditor.prototype.setImageLink = function (href) {
    var im = this.selectedImage();
    if (!im) return;
    var ed = this.editor, tr = ed.state.tr, type = ed.schema.marks.link;
    tr.removeMark(im.pos, im.pos + im.node.nodeSize, type);
    if (href) tr.addMark(im.pos, im.pos + im.node.nodeSize, type.create({ href: href }));
    tr.setSelection(NodeSelection.create(tr.doc, im.pos));
    ed.view.dispatch(tr);
    ed.commands.focus();
    this.updateImageBar();
  };

  ModernEditor.prototype.replaceImageSrc = function (pos, src) {
    var ed = this.editor;
    var node = ed.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'image') return;
    var tr = ed.state.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, { src: src }));
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    ed.view.dispatch(tr);
    ed.view.focus();
    this.updateImageBar();
  };

  ModernEditor.prototype.openImageLink = function (anchor) {
    var self = this, info = this.imageInfo();
    if (!info) return;
    var url = h('input', { type: 'url', placeholder: 'https://', value: info.href || '', form: 'r10me-detached' });
    function apply() {
      var u = url.value.trim();
      closePop();
      if (!u) { self.setImageLink(null); return; }
      if (!/^(https?:|mailto:|\/)/i.test(u)) u = 'https://' + u;
      self.setImageLink(u);
    }
    url.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    showPop(anchor, h('div', { class: 'r10me-form' }, [
      h('label', { text: 'Görsel bağlantısı' }), url,
      h('div', { class: 'r10me-row' }, [
        info.href ? h('button', { type: 'button', class: 'is-danger', onclick: function () { closePop(); self.setImageLink(null); } }, [icon(Unlink), 'Kaldır']) : null,
        h('span', { class: 'r10me-spacer' }),
        h('button', { type: 'button', class: 'is-ghost', onclick: closePop }, ['Vazgeç']),
        h('button', { type: 'button', class: 'is-primary', onclick: apply }, [icon(Check), 'Uygula'])
      ])
    ]), this.dark);
    setTimeout(function () { url.focus(); url.select(); }, 0);
  };

  ModernEditor.prototype.updateImageBar = function () {
    var self = this;
    var info = this.active && this.view === 'write' ? this.imageInfo() : null;
    if (!info) { if (this.imgBar) this.imgBar.hidden = true; return; }
    var nb = function (attrs, kids) {
      attrs.type = 'button';
      attrs.onmousedown = function (e) { e.preventDefault(); };
      return h('button', attrs, kids);
    };
    if (!this.imgBar) {
      this.imgInput = h('input', { type: 'text', inputmode: 'numeric', title: 'Genişlik (px)', form: 'r10me-detached', autocomplete: 'off' });
      this.imgInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); var v = parseInt(self.imgInput.value, 10); if (v >= MIN_IMG) self.setImageWidth(v); }
        e.stopPropagation();
      });
      this.imgInput.addEventListener('change', function () { var v = parseInt(self.imgInput.value, 10); if (v >= MIN_IMG) self.setImageWidth(v); });
      var preset = function (label, w, title) {
        return nb({ title: title || label, onclick: function () { self.setImageWidth(w === 'fit' ? self.fitWidth() : w); } }, [label]);
      };
      this.ib = {};
      this.ib.replace = nb({ class: 'r10me-ib', title: 'Görseli değiştir', onclick: function () { var inf = self.imageInfo(); if (inf) self.openImage(self.ib.replace, inf.pos); } }, [icon(RefreshCw), h('span', { text: 'Değiştir' })]);
      this.ib.left = nb({ class: 'r10me-ib is-ic', title: 'Sola hizala', onclick: function () { self.alignImage('left'); } }, [icon(AlignLeft)]);
      this.ib.center = nb({ class: 'r10me-ib is-ic', title: 'Ortala', onclick: function () { self.alignImage('center'); } }, [icon(AlignCenter)]);
      this.ib.right = nb({ class: 'r10me-ib is-ic', title: 'Sağa hizala', onclick: function () { self.alignImage('right'); } }, [icon(AlignRight)]);
      this.ib.link = nb({ class: 'r10me-ib', title: 'Bağlantı ekle / düzenle', onclick: function () { self.openImageLink(self.ib.link); } }, [icon(LinkIcon), h('span', { text: 'Bağlantı' })]);
      this.ib.open = nb({ class: 'r10me-ib is-ic', title: 'Bağlantıyı aç', onclick: function () { var inf = self.imageInfo(); if (inf && inf.href) window.open(inf.href, '_blank', 'noopener'); } }, [icon(ExternalLink)]);
      this.ib.unlink = nb({ class: 'r10me-ib is-ic', title: 'Bağlantıyı kaldır', onclick: function () { self.setImageLink(null); } }, [icon(Unlink)]);
      this.ib.remove = nb({ class: 'r10me-ib is-danger', title: 'Görseli sil', onclick: function () { self.editor.chain().focus().deleteSelection().run(); } }, [icon(Trash2), h('span', { text: 'Sil' })]);
      this.imgBar = h('div', { class: 'r10me-imgbar', hidden: true }, [
        h('div', { class: 'r10me-imgbar-row' }, [
          this.ib.replace, h('span', { class: 'r10me-imgbar-sep' }),
          this.ib.left, this.ib.center, this.ib.right, h('span', { class: 'r10me-imgbar-sep' }),
          this.ib.link, this.ib.open, this.ib.unlink, h('span', { class: 'r10me-imgbar-sep' }),
          this.ib.remove
        ]),
        h('div', { class: 'r10me-imgbar-row' }, [
          h('span', { class: 'r10me-imgbar-t', text: 'Boyut' }),
          preset('Küçük', 200, '200 px'), preset('Orta', 400, '400 px'), preset('Büyük', 640, '640 px'),
          preset('Tam', 'fit', 'Alan genişliği'), preset('Orijinal', null, 'Gerçek boyut'),
          h('span', { class: 'r10me-imgbar-sep' }),
          this.imgInput, h('span', { class: 'r10me-imgbar-u', text: 'px' })
        ])
      ]);
      this.body.appendChild(this.imgBar);
    }
    this.imgInput.value = info.node.attrs.width || '';
    this.imgInput.placeholder = 'oto';
    ['left', 'center', 'right'].forEach(function (d) { self.ib[d].classList.toggle('is-active', info.align === d || (d === 'left' && !info.align)); });
    this.ib.link.classList.toggle('is-active', !!info.href);
    this.ib.open.hidden = !info.href;
    this.ib.unlink.hidden = !info.href;
    this.imgBar.hidden = false;
    var dom = this.editor.view.nodeDOM(info.pos);
    if (!dom || !dom.getBoundingClientRect) return;
    var r = dom.getBoundingClientRect(), br = this.body.getBoundingClientRect();
    var top = r.top - br.top - this.imgBar.offsetHeight - 8;
    if (top < 4) top = r.bottom - br.top + 8;
    var left = Math.max(6, Math.min(r.left - br.left, br.width - this.imgBar.offsetWidth - 6));
    this.imgBar.style.top = top + 'px';
    this.imgBar.style.left = left + 'px';
  };

  ModernEditor.prototype.fitWidth = function () {
    var pm = this.editor.view.dom, cs = getComputedStyle(pm);
    return Math.round(pm.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  };

  /* ---------------- resim yükleme (R10 CDN) ---------------- */
  ModernEditor.prototype.uploadFiles = function (files, replacePos) {
    var self = this;
    var o = this.fr.opts || {};
    if (!o.imageUploadURL) { this.toast('Bu sayfada resim yükleme kullanılamıyor', true); return; }
    var list = Array.prototype.slice.call(files, 0, 10);
    var max = o.imageMaxSize || 2 * 1024 * 1024;
    var types = (o.imageAllowedTypes || ['jpeg', 'jpg', 'png', 'gif']).map(function (t) { return String(t).toLowerCase(); });
    var busy = h('div', { class: 'r10me-busy' }, [h('span', { class: 'r10me-spin' }), h('span', { text: 'Resim yükleniyor…' })]);
    this.body.appendChild(busy);
    var chain = Promise.resolve();
    list.forEach(function (f) {
      chain = chain.then(function () {
        var ext = (f.type.split('/')[1] || '').toLowerCase();
        if (types.indexOf(ext) === -1) throw new Error(f.name + ': desteklenmeyen biçim');
        if (f.size > max) throw new Error(f.name + ': en fazla ' + Math.round(max / 1048576) + ' MB');
        var fd = new FormData();
        fd.append(o.imageUploadParam || 'file', f, f.name);
        var p = o.imageUploadParams || {};
        Object.keys(p).forEach(function (k) { fd.append(k, p[k]); });
        return fetch(o.imageUploadURL, {
          method: o.imageUploadMethod || 'POST', body: fd,
          credentials: o.requestWithCredentials ? 'include' : 'same-origin',
          headers: o.requestHeaders || {}
        }).then(function (r) { return r.text(); }).then(function (txt) {
          var j; try { j = JSON.parse(txt); } catch (e) { throw new Error('Sunucu yanıtı okunamadı'); }
          var link = j.link || j.url || (j.data && (j.data.link || j.data.url));
          if (!link) throw new Error(j.error || j.message || 'Yükleme başarısız');
          if (typeof replacePos === 'number') self.replaceImageSrc(replacePos, link);
          else self.insertImageBlock(link);
        });
      });
    });
    chain.then(function () { busy.remove(); self.toast('Resim eklendi'); })
      .catch(function (e) { busy.remove(); self.toast(e.message || 'Yükleme başarısız', true); });
  };

  ModernEditor.prototype.toast = function (msg, err) {
    var t = h('div', { class: 'r10me-toast' + (err ? ' is-error' : ''), text: msg });
    this.root.appendChild(t);
    setTimeout(function () { t.remove(); }, err ? 4000 : 2200);
  };

  /* ---------------- BBCode sarmalayıcılar ---------------- */
  ModernEditor.prototype.wrapBB = function (open, close) {
    this.collapseImageSelection();
    var ed = this.editor, s = ed.state.selection;
    if (s.empty) {
      var pos = s.from;
      ed.chain().focus().insertContent(open + close).setTextSelection(pos + open.length).run();
    } else {
      var from = s.from, to = s.to;
      ed.chain().focus().insertContentAt(to, close).insertContentAt(from, open).run();
    }
  };

  /* ---------------- görünümler ---------------- */
  ModernEditor.prototype.setView = function (v) {
    if (v === this.view) return;
    var prev = this.view;
    if (prev === 'source') this.applySource();
    var currentBB = this.getBB();
    this.view = v;
    this.tabWrite.classList.toggle('is-on', v === 'write');
    this.tabSource.classList.toggle('is-on', v === 'source');
    this.tabPreview.classList.toggle('is-on', v === 'preview');
    this.editorHost.hidden = v !== 'write';
    this.source.hidden = v !== 'source';
    this.preview.hidden = v !== 'preview';
    if (v === 'source') {
      this.source.value = currentBB;
      this.sourceDirty = false;
      this.fitSource();
      this.source.focus();
    } else if (v === 'preview') {
      this.renderPreview();
    } else {
      this.editor.commands.focus();
    }
    closePop();
    this.refreshToolbar();
  };

  ModernEditor.prototype.applySource = function () {
    if (!this.sourceDirty) return;
    this.setBB(this.source.value);
    this.sourceDirty = false;
  };

  ModernEditor.prototype.renderPreview = function () {
    var bb = this.getBB();
    var html = window.R10BB.bbToHTML(bb);
    // [QUOTE] / [SPOILER] / [CODE] bloklarını görsel olarak işaretle (yaklaşık)
    var map = { QUOTE: 'Alıntı', SPOILER: 'Spoiler', CODE: 'Kod', PHP: 'PHP', HTML: 'HTML' };
    html = html.replace(/\[(QUOTE|SPOILER|CODE|PHP|HTML)(?:=[^\]]*)?\]([\s\S]*?)\[\/\1\]/gi, function (m, tag, inner) {
      if (/<\/?(p|ul|ol|li)\b/i.test(inner)) return m;
      return '<span class="r10me-bb"><span class="r10me-bb-title">' + map[tag.toUpperCase()] + '</span>' + inner + '</span>';
    });
    this.preview.innerHTML = '';
    this.preview.appendChild(h('div', { class: 'r10me-preview-note', text: 'Hızlı önizleme — kesin görünüm için R10\'un "Önizleme" düğmesini kullanın.' }));
    var p = h('div', { class: 'r10me-preview' });
    p.innerHTML = html;
    this.preview.appendChild(p);
  };

  ModernEditor.prototype.toggleFull = function () {
    var on = !this.root.classList.contains('is-full');
    this.root.classList.toggle('is-full', on);
    this.fullBtn.innerHTML = '';
    this.fullBtn.appendChild(icon(on ? Minimize2 : Maximize2));
    this.fullBtn.title = on ? 'Tam ekrandan çık' : 'Tam ekran';
    this.fullBtn.setAttribute('aria-label', this.fullBtn.title);
    this.updateScrollMargins();
    if (this.view === 'source') this.fitSource();
    if (on) {
      this.backdrop = h('div', { class: 'r10me-backdrop', onclick: this.toggleFull.bind(this) });
      document.body.appendChild(this.backdrop);
      document.documentElement.style.overflow = 'hidden';
    } else {
      if (this.backdrop) this.backdrop.remove();
      document.documentElement.style.overflow = '';
    }
    this.editor.commands.focus();
  };

  /* ---------------- içerik ---------------- */
  ModernEditor.prototype.getBB = function () {
    if (this.view === 'source') return this.source.value.replace(/\s+$/, '');
    return window.R10BB.htmlToBB(this.editor.getHTML());
  };

  ModernEditor.prototype.setBB = function (bb) {
    var html = window.R10BB.bbToHTML(bb || '', { emptyParagraph: '', smilies: SMILIES && SMILIES.list });
    // yükleme geri alma geçmişine girmesin (Ctrl+Z editörü boşaltmasın)
    this.editor.chain().setMeta('addToHistory', false).setContent(html || '<p></p>', false).run();
    this.lastBB = this.getBB();
    this.refreshStatus();
  };

  ModernEditor.prototype.readFroala = function () {
    var fr = this.fr;
    try {
      if (fr.bbCode && fr.bbCode.isBbCodeView && fr.bbCode.isBbCodeView()) {
        var ta = fr.bbCode.getTextArea();
        return ta ? String(ta.val() || '') : '';
      }
    } catch (e) {}
    return window.R10BB.htmlToBB(fr.html.get());
  };

  ModernEditor.prototype.writeFroala = function (bb) {
    var fr = this.fr;
    try {
      if (fr.bbCode && fr.bbCode.isBbCodeView && fr.bbCode.isBbCodeView()) {
        var ta = fr.bbCode.getTextArea();
        if (ta) { ta.val(bb); return; }
      }
    } catch (e) {}
    this._writing = true;
    try { fr.html.set(window.R10BB.bbToHTML(bb)); } finally { this._writing = false; }
    try { fr.undo.saveStep(); } catch (e) {}
  };

  ModernEditor.prototype.syncToFroala = function (bb) {
    if (bb == null) bb = this.getBB();
    if (bb === this.syncedBB) return;
    this.syncedBB = bb;
    this.writeFroala(bb);
  };

  ModernEditor.prototype.onChange = function () {
    var self = this;
    this.refreshStatus();
    if (!this._deb) {
      this._deb = debounce(function () {
        if (!self.active) return;
        var bb = self.getBB();
        self.syncToFroala(bb);
        self.saveDraft(bb);
      }, 900);
    }
    this._deb();
  };

  ModernEditor.prototype.refreshStatus = function () {
    var cc = this.editor && this.editor.storage.characterCount;
    if (cc) this.statusChars.textContent = cc.characters().toLocaleString('tr-TR') + ' karakter · ' + cc.words().toLocaleString('tr-TR') + ' kelime';
  };

  /* ---------------- taslak ---------------- */
  ModernEditor.prototype.saveDraft = function (bb) {
    try {
      if (!bb || !bb.trim()) { localStorage.removeItem(draftKey()); this.statusDraft.textContent = ''; return; }
      localStorage.setItem(draftKey(), JSON.stringify({ bb: bb, t: Date.now() }));
      this.statusDraft.innerHTML = '';
      this.statusDraft.appendChild(h('span', { class: 'r10me-ok', text: '● ' }));
      this.statusDraft.appendChild(document.createTextNode('Taslak kaydedildi ' + new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })));
    } catch (e) {}
  };

  ModernEditor.prototype.clearDraft = function () {
    try { localStorage.removeItem(draftKey()); } catch (e) {}
  };

  ModernEditor.prototype.checkDraft = function () {
    var self = this, d;
    try { d = JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (e) { d = null; }
    if (!d || !d.bb || Date.now() - d.t > DRAFT_TTL) return;
    var cur = this.getBB();
    if (cur.trim() === d.bb.trim()) return;
    if (cur.trim()) return; // editörde içerik var: üzerine yazmayı önerme
    this.banner.innerHTML = '';
    this.banner.appendChild(h('span', {}, ['Kaydedilmemiş bir taslak bulundu ', h('b', { text: '(' + timeStr(d.t) + ')' })]));
    this.banner.appendChild(h('span', { class: 'r10me-spacer' }));
    this.banner.appendChild(h('button', { type: 'button', class: 'is-primary', onclick: function () { self.setBB(d.bb); self.syncToFroala(); self.banner.hidden = true; } }, ['Geri yükle']));
    this.banner.appendChild(h('button', { type: 'button', class: 'is-ghost', onclick: function () { self.clearDraft(); self.banner.hidden = true; } }, ['Sil']));
    this.banner.hidden = false;
  };

  /* ---------------- etkinleştirme ---------------- */
  ModernEditor.prototype.activate = function (user) {
    if (this.active) return;
    var bb = this.readFroala();
    this.setBB(bb);
    this.syncedBB = bb;
    this.active = true;
    this.fr.$box[0].style.display = 'none';
    this.root.hidden = false;
    this.btnModern.classList.add('is-on');
    this.btnR10.classList.remove('is-on');
    this.applyTheme();
    this.refreshToolbar();
    if (user) { setMode('modern'); this.editor.commands.focus('end'); }
    this.checkDraft();
    if (this.relayout) this.relayout();
  };

  ModernEditor.prototype.deactivate = function (user) {
    if (!this.active) { this.btnR10.classList.add('is-on'); this.btnModern.classList.remove('is-on'); return; }
    if (this.view === 'source') this.applySource();
    if (this.root.classList.contains('is-full')) this.toggleFull();
    var bb = this.getBB();
    this.syncedBB = null;
    this.syncToFroala(bb);
    this.active = false;
    this.root.hidden = true;
    this.fr.$box[0].style.display = '';
    this.btnR10.classList.add('is-on');
    this.btnModern.classList.remove('is-on');
    if (user) { setMode('r10'); try { this.fr.events.focus(); } catch (e) {} }
    closePop();
    if (this.relayout) this.relayout();
  };

  ModernEditor.prototype.isActive = function () { return this.active && enabled(); };

  ModernEditor.prototype.submit = function () {
    var f = this.form;
    if (!f) return;
    var b = f.querySelector('input[type="submit"][name="sbutton"], button[name="sbutton"]') ||
      Array.prototype.filter.call(f.querySelectorAll('input[type="submit"], button[type="submit"], button:not([type])'), function (x) {
        return !/preview|önizle/i.test((x.name || '') + ' ' + (x.value || x.textContent || ''));
      })[0];
    if (b) b.click(); else if (f.requestSubmit) f.requestSubmit(); else f.submit();
  };

  ModernEditor.prototype.bindGlobal = function () {
    var self = this;
    this.source.addEventListener('input', function () { self.sourceDirty = true; self.fitSource(); self.onChangeSource(); });
    // görsel boyut çubuğu sayfa kaydırmasında da yerini korusun
    window.addEventListener('scroll', function () { if (self.imgBar && !self.imgBar.hidden) self.updateImageBar(); }, { passive: true });
    window.addEventListener('resize', function () { self.updateScrollMargins(); if (self.view === 'source') self.fitSource(); });
    if (this.form) {
      this.form.addEventListener('click', function (e) {
        var b = e.target && e.target.closest && e.target.closest('button, input[type="submit"]');
        if (!b || !self.active || b.closest('.r10me, .r10me-switch')) return;
        var type = (b.getAttribute('type') || (b.tagName === 'BUTTON' ? 'submit' : '')).toLowerCase();
        if (type !== 'submit' || /preview/i.test(b.name || '')) return;
        self.pendingSent = { key: draftKey(), t: Date.now() };
      }, true);
      this.form.addEventListener('submit', function (e) {
        var s = e.submitter;
        var isPreview = s && /preview/i.test(s.name || '');
        if (self.active && !isPreview) self.clearDraft();
      });
    }
    this.scroll.addEventListener('scroll', function () { if (self.imgBar && !self.imgBar.hidden) self.updateImageBar(); });
    // Boş alana tıklama: içeriğin altına/yanına tıklayınca imleci uygun yere koy
    this.scroll.addEventListener('mousedown', function (e) { self.onEmptyAreaMouseDown(e); });
    // dosya sürükle-bırak görsel geri bildirimi
    this.scroll.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1) self.scroll.classList.add('r10me-drop'); });
    ['dragleave', 'drop'].forEach(function (ev) { self.scroll.addEventListener(ev, function () { self.scroll.classList.remove('r10me-drop'); }); });
  };

  ModernEditor.prototype.onChangeSource = function () {
    var self = this;
    if (!this._debS) {
      this._debS = debounce(function () {
        if (!self.active || self.view !== 'source') return;
        var bb = self.source.value.replace(/\s+$/, '');
        self.syncToFroala(bb);
        self.saveDraft(bb);
      }, 900);
    }
    this._debS();
  };

  ModernEditor.prototype.setEnabled = function (on) {
    this.switchEl.style.display = on ? '' : 'none';
    if (!on && this.active) this.deactivate(false);
  };

  ModernEditor.prototype.destroy = function () {
    try { this.editor.destroy(); } catch (e) {}
    this.switchEl.remove();
    this.root.remove();
    if (this.backdrop) this.backdrop.remove();
  };

  /* ================= yönetici ================= */
  var managed = [];

  function instances() {
    var F = window.FroalaEditor;
    return (F && F.INSTANCES) ? F.INSTANCES.filter(function (ed) { return ed && ed.$box && ed.$box[0] && ed.$oel && ed.$oel[0]; }) : [];
  }

  function attachAll() {
    if (!window.R10BB || !document.body) return;
    // kaldırılmış editörleri temizle
    managed = managed.filter(function (m) {
      if (!document.contains(m.fr.$box[0])) { m.destroy(); m.fr.__r10me = null; return false; }
      return true;
    });
    if (!enabled()) { managed.forEach(function (m) { m.setEnabled(false); }); return; }
    instances().forEach(function (fr) {
      if (fr.__r10me || !document.contains(fr.$box[0])) return;
      if (fr.$box[0].offsetParent === null && !fr.$box[0].getClientRects().length) return; // görünmeyen editör
      try {
        var m = new ModernEditor(fr);
        fr.__r10me = m;
        managed.push(m);
        if (getMode() === 'modern') m.activate(false); else m.deactivate(false);
        if (!SMILIES) {
          loadSmilies(fr).then(function (r) {
            if (r && m.active && m.view === 'write' && !m.editor.isFocused) {
              var cur = m.getBB();
              if (/:[^\s:]{1,20}:|[:;][)(DPpOo]/.test(cur)) m.setBB(cur);
            }
          });
        }
      } catch (e) {
        try { console.warn('[R10 Modern Editör]', e); } catch (x) {}
      }
    });
    managed.forEach(function (m) { m.setEnabled(true); });
  }

  function start() {
    var first = instances()[0];
    if (first) loadSmilies(first);
    attachAll();
    setInterval(attachAll, 1500);
    new MutationObserver(function () {
      managed.forEach(function (m) { m.applyTheme(); });
      attachAll();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-r10fix', 'data-r10me'] });
    if (document.body) {
      new MutationObserver(function () { managed.forEach(function (m) { m.applyTheme(); }); })
        .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
  }

  window.R10ModernEditor = {
    version: '1.6.2',
    attachAll: attachAll,
    forFroala: function (fr) { return fr && fr.__r10me; },
    managed: function () { return managed.slice(); }
  };

  function boot() {
    if (window.__R10FIX_READY__) { start(); return; }
    var started = false;
    var go = function () { if (!started) { started = true; start(); } };
    window.addEventListener('r10fix:ready', go, { once: true });
    // fixer yoksa veya geç kalırsa
    var seen = 0, waited = 0;
    (function poll() {
      if (started) return;
      if (instances().length && ++seen > 15) { go(); return; }
      if (++waited > 600) return; // ~2 dk sonra vazgeç
      setTimeout(poll, 200);
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
