/*
 * R10 Editör Düzeltici — HTML <-> BBCode dönüştürücü
 * R10'un sunucu tarafı HTML->BBCode çevirisi kayıplı olduğundan (boş satırlar,
 * 24px+ yazı boyutları, liste sonrası boşluklar vb.) dönüşüm burada yapılır.
 */
(function (global) {
  'use strict';

  var SIZE_PX = [10, 13, 16, 18, 24, 32, 48]; // vB SIZE=1..7
  var BLOCK_TAGS = /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|TABLE|THEAD|TBODY|TFOOT|TR|TD|TH|HR|SECTION|ARTICLE|HEADER|FOOTER|ADDRESS|FIGURE|FIGCAPTION|MAIN|NAV|ASIDE|DL|DT|DD|CENTER)$/;
  var SKIP_TAGS = /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|IFRAME|OBJECT|EMBED|INPUT|SELECT|BUTTON|TEXTAREA|META|LINK)$/;
  var HEADING = { H1: [6, true], H2: [5, true], H3: [4, true], H4: [3, true], H5: [3, true], H6: [2, true] };

  /* ---------------- yardımcılar ---------------- */
  function pxToSize(px) {
    var best = 3, d = Infinity;
    for (var i = 0; i < SIZE_PX.length; i++) {
      var dd = Math.abs(SIZE_PX[i] - px);
      if (dd < d) { d = dd; best = i + 1; }
    }
    return best;
  }

  function parseFontSize(v) {
    if (v == null) return null;
    v = String(v).trim().toLowerCase();
    var m;
    if ((m = v.match(/^([\d.]+)px$/))) return pxToSize(parseFloat(m[1]));
    if ((m = v.match(/^([\d.]+)pt$/))) return pxToSize(parseFloat(m[1]) * 4 / 3);
    if ((m = v.match(/^([\d.]+)r?em$/))) return pxToSize(parseFloat(m[1]) * 16);
    if ((m = v.match(/^([\d.]+)%$/))) return pxToSize(parseFloat(m[1]) * 0.16);
    var named = { 'xx-small': 1, 'x-small': 1, small: 2, medium: 3, large: 4, 'x-large': 5, 'xx-large': 6, 'xxx-large': 7 };
    return named[v] || null;
  }

  function fontTagSize(v) {
    v = String(v || '').trim();
    var m = v.match(/^([+-]?)(\d)$/);
    if (!m) return null;
    var n = parseInt(m[2], 10);
    if (m[1] === '+') n = 3 + n; else if (m[1] === '-') n = 3 - n;
    return Math.max(1, Math.min(7, n));
  }

  function toColor(c) {
    if (!c) return null;
    c = String(c).trim();
    var m = c.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,\/]+([\d.]+%?))?\s*\)$/i);
    if (m) {
      if (m[4] !== undefined) {
        var a = /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        if (a === 0) return null;
      }
      return '#' + [m[1], m[2], m[3]].map(function (x) {
        var h = Math.min(255, parseInt(x, 10)).toString(16);
        return h.length < 2 ? '0' + h : h;
      }).join('').toUpperCase();
    }
    if (/^#[0-9a-f]{3}$/i.test(c)) return ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toUpperCase();
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
    if (/^[a-z]+$/i.test(c) && !/^(inherit|initial|unset|revert|transparent|currentcolor|windowtext)$/i.test(c)) return c.toLowerCase();
    return null;
  }

  function firstFont(f) {
    if (!f) return null;
    var name = String(f).split(',')[0].replace(/["']/g, '').trim();
    if (!name || /^(inherit|initial|unset|sans-serif|serif|monospace|system-ui|-apple-system)$/i.test(name)) return null;
    return name.replace(/[\[\]]/g, '');
  }

  function styleOf(el) {
    var s = el.style || {};
    return {
      color: s.color,
      fontSize: s.fontSize,
      fontFamily: s.fontFamily,
      fontWeight: s.fontWeight,
      fontStyle: s.fontStyle,
      textDecoration: (s.textDecorationLine || '') + ' ' + (s.textDecoration || ''),
      textAlign: s.textAlign,
      marginLeft: s.marginLeft,
      paddingLeft: s.paddingLeft
    };
  }

  function imgWidth(el) {
    var sw = (el.style && el.style.width) || '';
    var aw = el.getAttribute('width') || '';
    var v = sw || aw;
    if (!v || /%|auto/i.test(v)) return null;
    var n = Math.round(parseFloat(v));
    return n > 0 && n < 5000 ? n : null;
  }

  function alignOf(el) {
    var st = styleOf(el);
    var a = (st.textAlign || el.getAttribute('align') || '').toLowerCase();
    if (el.tagName === 'CENTER') a = 'center';
    if (a === 'center' || a === 'right' || a === 'left') return a;
    if (a === 'justify' || a === 'start') return 'left';
    if (a === 'end') return 'right';
    return null;
  }

  function indentOf(el) {
    if (el.tagName === 'BLOCKQUOTE') return 1;
    var st = styleOf(el);
    var v = parseFloat(st.marginLeft || st.paddingLeft || '0');
    return v >= 20 ? 1 : 0;
  }

  /* ------------- inline biçim etiketlerini çıkar ------------- */
  function inlineTags(el, ctx) {
    var tags = [];
    var tag = el.tagName;
    var st = styleOf(el);
    var push = function (key, open, close, val) {
      if (ctx[key] === (val === undefined ? true : val)) return;
      tags.push({ key: key, val: val === undefined ? true : val, open: open, close: close });
    };

    var w = String(st.fontWeight || '');
    if (tag === 'B' || tag === 'STRONG' || w === 'bold' || w === 'bolder' || parseInt(w, 10) >= 600) push('b', '[B]', '[/B]');
    if (tag === 'I' || tag === 'EM' || tag === 'CITE' || tag === 'VAR' || st.fontStyle === 'italic' || st.fontStyle === 'oblique') push('i', '[I]', '[/I]');
    if (tag === 'U' || tag === 'INS' || /underline/.test(st.textDecoration)) push('u', '[U]', '[/U]');
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || /line-through/.test(st.textDecoration)) push('s', '[S]', '[/S]');

    var font = firstFont(st.fontFamily || (tag === 'FONT' ? el.getAttribute('face') : null));
    if (font) push('font', '[FONT=' + font + ']', '[/FONT]', font);

    var size = parseFontSize(st.fontSize);
    if (size == null && tag === 'FONT') size = fontTagSize(el.getAttribute('size'));
    if (size != null) push('size', '[SIZE=' + size + ']', '[/SIZE]', size);

    var color = toColor(st.color || (tag === 'FONT' ? el.getAttribute('color') : null));
    if (color) push('color', '[COLOR=' + color + ']', '[/COLOR]', color);

    if (tag === 'A' && el.getAttribute('href')) {
      var href = el.getAttribute('href').trim();
      if (/^mailto:/i.test(href)) {
        var mail = href.replace(/^mailto:/i, '');
        tags.push({ key: 'url', val: href, open: '[EMAIL=' + mail + ']', close: '[/EMAIL]' });
      } else if (!/^(javascript|data):/i.test(href)) {
        var txt = (el.textContent || '').trim();
        if (txt === href) tags.push({ key: 'url', val: href, open: '[URL]', close: '[/URL]' });
        else tags.push({ key: 'url', val: href, open: '[URL=' + href.replace(/\]/g, '%5D') + ']', close: '[/URL]' });
      }
    }
    return tags;
  }

  /* ============ HTML -> BBCode ============ */
  function htmlToBB(html) {
    var root;
    if (typeof html === 'string') {
      var doc = new DOMParser().parseFromString('<!doctype html><html><body>' + html + '</body></html>', 'text/html');
      root = doc.body;
    } else {
      root = html;
    }

    // Kapsayıcı: satırlar ve bloklar
    function newContainer() { return []; }

    function Writer(container, blockAttrs) {
      this.container = container;
      this.attrs = blockAttrs; // {align, indent}
      this.text = '';
      this.stack = [];   // açık inline etiketler
      this.emitted = 0;  // bu satırda açılmış etiket sayısı
      this.pushedInBlock = 0;
    }
    Writer.prototype.openPending = function () {
      while (this.emitted < this.stack.length) {
        this.text += this.stack[this.emitted].open;
        this.emitted++;
      }
    };
    Writer.prototype.append = function (s) {
      if (!s) return;
      if (this.text === '' && this.emitted === 0) {
        s = s.replace(/^[ \t\r\n]+/, '');
        if (!s) return;
      }
      this.openPending();
      this.text += s;
      if (/[^ \t\r\n]/.test(s)) this.real = true;
    };
    Writer.prototype.appendRaw = function (s) { // boşluk kırpmadan
      this.openPending();
      this.text += s;
      if (/[^ \t\r\n]/.test(s)) this.real = true;
    };
    // Satırda gerçek içerik var mı? (yalnızca bizim açtığımız biçim etiketleri içerik sayılmaz;
    // kullanıcının yazdığı "[/QUOTE]" gibi metinler içeriktir)
    Writer.prototype.hasContent = function () {
      return !!this.real;
    };
    Writer.prototype.flush = function (force) {
      var has = this.hasContent();
      if (!has && !force) { this.resetLine(); return false; }
      var t = this.text;
      for (var i = this.emitted - 1; i >= 0; i--) t += this.stack[i].close;
      t = t.replace(/[ \t]+$/, '');
      // içi boş biçim etiketlerini temizle
      var prev;
      do { prev = t; t = t.replace(/\[(B|I|U|S|COLOR|SIZE|FONT|URL|EMAIL)(=[^\]]*)?\]\[\/\1\]/g, ''); } while (t !== prev);
      this.container.push({ type: 'line', align: has ? this.attrs.align : null, indent: has ? this.attrs.indent : 0, text: has ? t : '' });
      this.pushedInBlock++;
      this.resetLine();
      return true;
    };
    Writer.prototype.resetLine = function () {
      this.text = '';
      this.emitted = 0;
      this.real = false;
    };
    Writer.prototype.pushTags = function (tags) {
      for (var i = 0; i < tags.length; i++) this.stack.push(tags[i]);
    };
    Writer.prototype.popTags = function (n) {
      for (var i = 0; i < n; i++) {
        var t = this.stack.pop();
        if (this.emitted > this.stack.length) {
          this.text += t.close;
          this.emitted--;
        }
      }
    };

    function ctxFromStack(stack) {
      var c = {};
      for (var i = 0; i < stack.length; i++) c[stack[i].key] = stack[i].val;
      return c;
    }

    function walkChildren(node, w, pre) {
      var kids = node.childNodes;
      for (var i = 0; i < kids.length; i++) walk(kids[i], w, pre);
    }

    function walk(node, w, pre) {
      if (node.nodeType === 3) {
        var t = node.nodeValue;
        if (pre) {
          var parts = t.split(/\r\n|\r|\n/);
          for (var p = 0; p < parts.length; p++) {
            if (p > 0) w.flush(true);
            if (parts[p]) w.appendRaw(parts[p]);
          }
        } else {
          t = t.replace(/[\t\r\n ]+/g, ' ');
          if (/^ +$/.test(t) && (w.text === '' || / $/.test(w.text))) return;
          w.append(t);
        }
        return;
      }
      if (node.nodeType !== 1) return;
      var el = node;
      var tag = el.tagName;
      if (SKIP_TAGS.test(tag)) return;
      if (el.classList && (el.classList.contains('fr-marker') || el.classList.contains('fr-placeholder'))) return;

      if (tag === 'BR') { w.flush(true); return; }

      // R10 emojileri: Froala <span smilieid> / modern editör <img data-smilie>
      if (el.hasAttribute && (el.hasAttribute('smilieid') || el.hasAttribute('data-smilie'))) {
        var scode = el.getAttribute('data-smilie');
        if (!scode) {
          var smap = (global.R10BB && global.R10BB.smilies) || {};
          scode = smap[el.getAttribute('smilieid')];
        }
        if (scode) {
          if (w.text && !/[\s(\[]$/.test(w.text)) w.appendRaw(' ');
          w.appendRaw(scode);
        } else {
          var bg = (el.getAttribute('style') || '').match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
          var ssrc = el.getAttribute('src') || (bg && bg[1]);
          if (ssrc) {
            if (/^\/\//.test(ssrc)) ssrc = 'https:' + ssrc;
            w.appendRaw('[IMG]' + ssrc + '[/IMG]');
          }
        }
        return;
      }

      if (tag === 'IMG') {
        var src = el.getAttribute('src') || '';
        var alt = el.getAttribute('alt') || '';
        if (el.classList.contains('fr-emoticon') || el.hasAttribute('data-emoji')) {
          w.append(alt || el.getAttribute('data-emoji') || '');
        } else if (src && !/^data:/i.test(src)) {
          var iw = imgWidth(el);
          w.appendRaw((iw ? '[IMG=' + iw + ']' : '[IMG]') + src + '[/IMG]');
        }
        return;
      }

      if (tag === 'HR') {
        if (w.hasContent()) w.flush(false);
        w.flush(true);
        return;
      }

      if (tag === 'UL' || tag === 'OL') {
        if (w.hasContent()) w.flush(false); else w.resetLine();
        var list = { type: 'list', ordered: tag === 'OL', items: [] };
        var lis = el.childNodes;
        var loose = null;
        for (var k = 0; k < lis.length; k++) {
          var li = lis[k];
          if (li.nodeType === 1 && li.tagName === 'LI') {
            loose = null;
            list.items.push(convertBlockInto(li, { align: null, indent: 0 }, w.stack, pre));
          } else if (li.nodeType === 1 && (li.tagName === 'UL' || li.tagName === 'OL')) {
            // iç içe liste doğrudan UL altında
            var target = list.items.length ? list.items[list.items.length - 1] : (list.items[0] = []);
            var sub = newContainer();
            var sw = new Writer(sub, { align: null, indent: 0 });
            sw.stack = w.stack.slice();
            walk(li, sw, pre);
            sw.flush(false);
            Array.prototype.push.apply(target, sub);
          } else if (li.nodeType === 3 && li.nodeValue.trim()) {
            if (!loose) { loose = []; list.items.push(loose); }
            loose.push({ type: 'line', align: null, indent: 0, text: li.nodeValue.trim() });
          }
        }
        if (list.items.length) { w.container.push(list); w.pushedInBlock++; }
        return;
      }

      if (BLOCK_TAGS.test(tag)) {
        if (w.hasContent()) w.flush(false); else w.resetLine();
        var a = alignOf(el);
        var ind = indentOf(el);
        var attrs = {
          align: a !== null ? (a === 'left' ? null : a) : w.attrs.align,
          indent: w.attrs.indent + ind
        };
        var sub2 = convertBlockInto(el, attrs, w.stack, pre || tag === 'PRE');
        Array.prototype.push.apply(w.container, sub2);
        w.pushedInBlock += sub2.length;
        if (tag === 'TD' || tag === 'TH') { /* hücreler satır olarak */ }
        return;
      }

      // inline öğe
      var tags = inlineTags(el, ctxFromStack(w.stack));
      w.pushTags(tags);
      walkChildren(el, w, pre);
      w.popTags(tags.length);
    }

    function convertBlockInto(el, attrs, stack, pre) {
      var out = newContainer();
      var w = new Writer(out, attrs);
      w.stack = stack.slice();
      var extra = [];
      if (HEADING[el.tagName]) {
        var h = HEADING[el.tagName];
        var ctx = ctxFromStack(w.stack);
        if (!ctx.b) extra.push({ key: 'b', val: true, open: '[B]', close: '[/B]' });
        if (ctx.size !== h[0]) extra.push({ key: 'size', val: h[0], open: '[SIZE=' + h[0] + ']', close: '[/SIZE]' });
      }
      var own = (el.tagName === 'LI' || BLOCK_TAGS.test(el.tagName)) ? inlineTags(el, ctxFromStack(w.stack)).filter(function (t) { return t.key !== 'url'; }) : [];
      w.pushTags(extra.concat(own));
      walkChildren(el, w, pre);
      // blok sonu: boş blok tek boş satırdır, sondaki <br> yok sayılır
      if (w.hasContent()) w.flush(false);
      else if (w.pushedInBlock === 0) w.flush(true);
      return out;
    }

    var container = convertBlockInto(root, { align: null, indent: 0 }, [], false);
    // kök gövdede boş blok yoksa tek boş satır ekleme
    return serialize(container, true);
  }

  function lineKey(it) {
    return (it.indent || 0) + '|' + (it.align || '');
  }

  function wrapGroup(lines, align, indent) {
    var body = lines.join('\n');
    if (align === 'center') body = '[CENTER]' + body + '[/CENTER]';
    else if (align === 'right') body = '[RIGHT]' + body + '[/RIGHT]';
    for (var i = 0; i < indent; i++) body = '[INDENT]' + body + '[/INDENT]';
    return body;
  }

  /*
   * R10 sunucusu: (1) iki etiket arasındaki salt boşluğu siler
   * ("[/SIZE] [SIZE=6]" -> bitişik), (2) U+00A0 karakterini bozar.
   * Boşluğu kapanış etiketlerinin içine taşı, NBSP'yi normal boşluğa çevir.
   */
  function fixServerQuirks(s) {
    s = s.replace(/ /g, ' ');
    var prev;
    do {
      prev = s;
      s = s.replace(/((?:\[\/(?:B|I|U|S|COLOR|SIZE|FONT|URL|EMAIL|LEFT|CENTER|RIGHT|INDENT)\])+)( +)(?=\[[A-Za-z*])/gi, '$2$1');
    } while (s !== prev);
    return s;
  }

  function serialize(container, top) {
    var parts = [];
    var i = 0;
    while (i < container.length) {
      var it = container[i];
      if (it.type === 'list') {
        var s = it.ordered ? '[LIST=1]' : '[LIST]';
        for (var j = 0; j < it.items.length; j++) {
          var inner = serialize(it.items[j], false);
          s += '\n[*]' + inner;
        }
        s += '\n[/LIST]';
        parts.push(s);
        i++;
        continue;
      }
      var key = lineKey(it);
      if (it.text === '' || key === '0|') {
        parts.push(it.text);
        i++;
        continue;
      }
      // aynı hizalı ardışık satırları grupla (aradaki boş satırlar dahil)
      var group = [it.text];
      var k = i + 1;
      var lastReal = i;
      while (k < container.length) {
        var nx = container[k];
        if (nx.type !== 'line') break;
        if (nx.text === '') { k++; continue; }
        if (lineKey(nx) !== key) break;
        for (var e = lastReal + 1; e < k; e++) group.push('');
        group.push(nx.text);
        lastReal = k;
        k++;
      }
      parts.push(wrapGroup(group, it.align, it.indent));
      i = lastReal + 1;
    }
    var out = parts.join('\n');
    if (top) {
      out = out.replace(/​/g, '').replace(/^\n+/, '').replace(/\s+$/, '');
      out = fixServerQuirks(out);
    } else {
      out = out.replace(/\n+$/, '');
    }
    return out;
  }

  /* ============ BBCode -> HTML (editöre geri yükleme) ============ */
  var INLINE = { b: 1, i: 1, u: 1, s: 1, color: 1, size: 1, font: 1, url: 1, email: 1 };
  var BLOCK = { center: 1, right: 1, left: 1, indent: 1, list: 1 };
  var RAW = { img: 1, code: 1, php: 1, html: 1, noparse: 1, phpr: 1, htmlr: 1, cssr: 1, jsr: 1, codepen: 1, jsfiddle: 1 };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function parseBB(src) {
    var re = /\[(\/?)([a-z*]+)(?:=("[^"]*"|[^\]]*))?\]/gi;
    var root = { tag: 'root', children: [] };
    var stack = [root];
    var last = 0, m;
    function top() { return stack[stack.length - 1]; }
    function text(s) { if (s) top().children.push(s); }
    while ((m = re.exec(src))) {
      var name = m[2].toLowerCase();
      var close = m[1] === '/';
      var known = INLINE[name] || BLOCK[name] || RAW[name] || name === '*';
      if (!known) continue;
      text(src.slice(last, m.index));
      last = re.lastIndex;
      if (RAW[name] && !close) {
        var endRe = new RegExp('\\[\\/' + name + '\\]', 'i');
        var rest = src.slice(last);
        var em = rest.match(endRe);
        if (!em) { text(m[0]); continue; }
        var content = rest.slice(0, em.index);
        if (name === 'img') top().children.push({ tag: 'img', opt: m[3] != null ? m[3].replace(/^"|"$/g, '') : null, children: [content] });
        else top().children.push({ tag: '#raw', text: m[0] + content + em[0] }); // olduğu gibi
        last = last + em.index + em[0].length;
        re.lastIndex = last;
        continue;
      }
      if (name === '*') {
        // liste öğesi
        var li = null;
        for (var s = stack.length - 1; s >= 0; s--) if (stack[s].tag === 'list') { li = s; break; }
        if (li === null) { text(m[0]); continue; }
        stack.length = li + 1;
        var item = { tag: '*', children: [] };
        stack[li].children.push(item);
        stack.push(item);
        continue;
      }
      if (!close) {
        var opt = m[3] != null ? m[3].replace(/^"|"$/g, '') : null;
        var node = { tag: name, opt: opt, children: [] };
        top().children.push(node);
        stack.push(node);
      } else {
        var found = -1;
        for (var t = stack.length - 1; t > 0; t--) {
          if (stack[t].tag === name) { found = t; break; }
          if (stack[t].tag === '*' && name === 'list') { continue; }
        }
        if (found === -1) { text(m[0]); continue; }
        stack.length = found;
      }
    }
    text(src.slice(last));
    return root;
  }

  function smilieRegex(list) {
    if (!list || !list.length) return null;
    var codes = list.map(function (x) { return x.code; }).filter(Boolean).sort(function (a, b) { return b.length - a.length; });
    var escRe = function (c) { return c.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); };
    return new RegExp('(?<![A-Za-z0-9ÇĞİÖŞÜçğıöşü:/])(' + codes.map(escRe).join('|') + ')(?![A-Za-z0-9ÇĞİÖŞÜçğıöşü])', 'g');
  }

  function bbToHTML(src, opts) {
    var emptyFill = opts && opts.emptyParagraph != null ? opts.emptyParagraph : '<br>';
    var smList = opts && opts.smilies;
    var smRe = smilieRegex(smList);
    var smBy = {};
    (smList || []).forEach(function (x) { smBy[x.code] = x; });
    function textHTML(t) {
      var e = esc(t);
      if (!smRe) return e;
      var out = '', last = 0, m;
      smRe.lastIndex = 0;
      while ((m = smRe.exec(t))) {
        out += esc(t.slice(last, m.index));
        var it = smBy[m[1]];
        out += '<img class="r10me-smilie" data-smilie="' + esc(it.code) + '" src="' + esc(it.src) + '" alt="' + esc(it.code) + '">';
        last = m.index + m[0].length;
      }
      return out + esc(t.slice(last));
    }
    src = String(src || '').replace(/\r\n?/g, '\n');
    var tree = parseBB(src);
    var container = [];

    function LineW(cont, attrs) {
      this.cont = cont; this.attrs = attrs; this.html = ''; this.open = []; this.emitted = 0; this.dirty = false;
    }
    LineW.prototype.add = function (h) {
      while (this.emitted < this.open.length) { this.html += this.open[this.emitted].o; this.emitted++; }
      this.html += h; this.dirty = true;
    };
    LineW.prototype.end = function (force) {
      if (!this.dirty && !force) return;
      var h = this.html;
      for (var i = this.emitted - 1; i >= 0; i--) h += this.open[i].c;
      this.cont.push({ type: 'line', align: this.attrs.align, indent: this.attrs.indent, html: h });
      this.html = ''; this.emitted = 0; this.dirty = false;
    };

    function inlineOpen(n) {
      var o = n.opt;
      switch (n.tag) {
        case 'b': return { o: '<strong>', c: '</strong>' };
        case 'i': return { o: '<em>', c: '</em>' };
        case 'u': return { o: '<u>', c: '</u>' };
        case 's': return { o: '<s>', c: '</s>' };
        case 'color': return { o: '<span style="color: ' + esc(o) + ';">', c: '</span>' };
        case 'size':
          var n2 = parseInt(o, 10);
          var px = SIZE_PX[Math.max(1, Math.min(7, isNaN(n2) ? 3 : n2)) - 1];
          return { o: '<span style="font-size: ' + px + 'px;">', c: '</span>' };
        case 'font': return { o: '<span style="font-family: ' + esc(o) + ';">', c: '</span>' };
        case 'url': return null;
        case 'email': return null;
      }
      return { o: '', c: '' };
    }

    // blok kapanışından sonraki tek \n'i yut
    var eatNL = false;

    function walkNodes(nodes, w) {
      for (var i = 0; i < nodes.length; i++) walkNode(nodes[i], w);
    }

    function walkText(s, w, noSm) {
      if (eatNL && s.charAt(0) === '\n') s = s.slice(1);
      eatNL = false;
      var parts = s.split('\n');
      for (var p = 0; p < parts.length; p++) {
        if (p > 0) w.end(true);
        if (parts[p]) {
          var seg = noSm ? esc(parts[p]) : textHTML(parts[p]);
          if (!w.dirty) seg = seg.replace(/^ /, '&nbsp;');
          w.add(seg.replace(/ {2}/g, ' &nbsp;'));
        }
      }
    }

    function walkNode(n, w) {
      if (typeof n === 'string') { walkText(n, w); return; }
      if (n.tag === '#raw') { walkText(n.text, w, true); return; }
      eatNL = false;
      if (n.tag === 'img') {
        var iwd = n.opt && /^\d{1,4}$/.test(String(n.opt).trim()) ? parseInt(n.opt, 10) : null;
        w.add('<img src="' + esc(String(n.children[0]).trim()) + '"' + (iwd ? ' style="width: ' + iwd + 'px;"' : '') + '>');
        return;
      }
      if (n.tag === 'url' || n.tag === 'email') {
        var inner = textOf(n);
        var href = n.opt || inner;
        if (n.tag === 'email' && !/^mailto:/i.test(href)) href = 'mailto:' + href;
        w.open.push({ o: '<a href="' + esc(href) + '">', c: '</a>' });
        walkNodes(n.children, w);
        closeInline(w);
        return;
      }
      if (INLINE[n.tag]) {
        w.open.push(inlineOpen(n));
        walkNodes(n.children, w);
        closeInline(w);
        return;
      }
      if (n.tag === 'list') {
        w.end(false);
        var list = { type: 'list', ordered: !!n.opt, items: [] };
        eatNL = true;
        for (var i = 0; i < n.children.length; i++) {
          var c = n.children[i];
          if (c && c.tag === '*') {
            var cont = [];
            var lw = new LineW(cont, { align: null, indent: 0 });
            lw.open = w.open.slice();
            eatNL = false;
            var kids = c.children.slice();
            // öğe sonundaki \n öğeye ait değil
            if (typeof kids[kids.length - 1] === 'string') kids[kids.length - 1] = kids[kids.length - 1].replace(/\n$/, '');
            walkNodes(kids, lw);
            lw.end(cont.length === 0);
            list.items.push(cont);
          }
        }
        w.cont.push(list);
        eatNL = true;
        return;
      }
      if (BLOCK[n.tag]) {
        w.end(false);
        var attrs = { align: w.attrs.align, indent: w.attrs.indent };
        if (n.tag === 'center' || n.tag === 'right') attrs.align = n.tag;
        else if (n.tag === 'left') attrs.align = null;
        else if (n.tag === 'indent') attrs.indent++;
        var bw = new LineW(w.cont, attrs);
        bw.open = w.open.slice();
        walkNodes(n.children, bw);
        bw.end(false);
        eatNL = true;
        return;
      }
      walkNodes(n.children, w);
    }

    function closeInline(w) {
      var t = w.open.pop();
      if (w.emitted > w.open.length) { w.html += t.c; w.emitted--; }
    }

    function textOf(n) {
      if (typeof n === 'string') return n;
      if (n.tag === '#raw') return n.text;
      return (n.children || []).map(textOf).join('');
    }

    var w0 = new LineW(container, { align: null, indent: 0 });
    walkNodes(tree.children, w0);
    w0.end(false);
    return renderContainer(container, emptyFill);
  }

  function renderContainer(cont, emptyFill) {
    if (emptyFill == null) emptyFill = '<br>';
    var html = '';
    for (var i = 0; i < cont.length; i++) {
      var it = cont[i];
      if (it.type === 'list') {
        var tag = it.ordered ? 'ol' : 'ul';
        html += '<' + tag + '>';
        for (var j = 0; j < it.items.length; j++) {
          var items = it.items[j];
          // tek satırlık öğe: <li>metin</li>
          if (items.length === 1 && items[0].type === 'line' && !items[0].align && !items[0].indent) html += '<li>' + (items[0].html || emptyFill) + '</li>';
          else html += '<li>' + renderContainer(items, emptyFill) + '</li>';
        }
        html += '</' + tag + '>';
        continue;
      }
      var style = [];
      if (it.align) style.push('text-align: ' + it.align + ';');
      if (it.indent) style.push('margin-left: ' + (20 * it.indent) + 'px;');
      html += '<p' + (style.length ? ' style="' + style.join(' ') + '"' : '') + '>' + (it.html || emptyFill) + '</p>';
    }
    return html;
  }

  var api = { htmlToBB: htmlToBB, bbToHTML: bbToHTML, version: '1.5.0' };
  global.R10BB = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
