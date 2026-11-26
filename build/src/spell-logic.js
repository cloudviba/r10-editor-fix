/*
 * Sözlük tabanlı düzeltme karar mantığı (saf fonksiyonlar, test edilebilir).
 * - Kelimeleri çıkarır (korunan alanlar hariç)
 * - Hunspell önerilerini Türkçeye özgü ağırlıklarla puanlar
 * - Yalnızca güvenli durumlarda otomatik düzeltme önerir
 */
'use strict';

var L = 'A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû';
var MASK = '';
var TOKEN_RE = new RegExp('(?<![' + L + '\\d' + MASK + '\'’_])[' + L + ']+(?:[\'’][' + L + ']+)?(?![' + L + '\\d' + MASK + '_])', 'gu');

function trLower(s) { return s.toLocaleLowerCase('tr-TR'); }
function trUpper(s) { return s.toLocaleUpperCase('tr-TR'); }
function isCap(s) { var f = s.charAt(0); return f !== trLower(f); }
function isAllUpper(s) { return s.length > 1 && s === trUpper(s) && s !== trLower(s); }
function isMixed(s) { return /[a-zçğıöşü][A-ZÇĞİÖŞÜ]/.test(s); }
function capFirst(s) { return trUpper(s.charAt(0)) + s.slice(1); }

/* Metindeki denetlenecek kelimeler */
function tokenize(masked) {
  var out = [], m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(masked))) {
    var w = m[0], i = m.index;
    var before = masked.slice(0, i);
    var sentenceStart = /^[^A-Za-zÇĞİÖŞÜçğıöşü\d]*$/.test(before.split('\n').pop()) || /[.!?…]["'”’)]*\s+$/.test(before);
    out.push({ w: w, i: i, sentenceStart: sentenceStart });
  }
  return out;
}

/* Denetimden hariç tutulacak kelimeler */
function shouldSkip(tok, ignore, proper) {
  var w = tok.w;
  if (w.length < 2) return true;
  if (isAllUpper(w) || isMixed(w)) return true;                 // kısaltma / marka
  var stem = w.split(/['’]/)[0];
  if (/['’]/.test(w) && isCap(stem)) return true;                // Özel ad + ek: Google'da
  var lw = trLower(w);
  if (ignore && ignore[lw]) return true;
  if (proper && proper[lw]) return true;
  return false;
}

/* Ağırlıklı Damerau-Levenshtein */
var TR_PAIRS = { 'ıi': 1, 'iı': 1, 'oö': 1, 'öo': 1, 'uü': 1, 'üu': 1, 'sş': 1, 'şs': 1, 'cç': 1, 'çc': 1, 'gğ': 1, 'ğg': 1 };
var SOFT = { 'bp': 1, 'pb': 1, 'dt': 1, 'td': 1, 'kğ': 1, 'ğk': 1, 'gk': 1, 'kg': 1, 'çc': 1, 'cç': 1 };
function subCost(a, b) {
  if (a === b) return 0;
  if (TR_PAIRS[a + b]) return 0.4;
  if (SOFT[a + b]) return 0.6;
  return 1;
}
function distance(a, b) {
  a = trLower(a); b = trLower(b);
  var n = a.length, m = b.length, d = [];
  for (var i = 0; i <= n; i++) { d[i] = [i]; }
  for (var j = 0; j <= m; j++) d[0][j] = j;
  for (i = 1; i <= n; i++) {
    for (j = 1; j <= m; j++) {
      var cb = b.charAt(j - 1);
      var ins = d[i][j - 1] + (cb === ' ' ? 0.4 : (/[aeıioöuü]/.test(cb) ? 0.8 : 1)); // unutulan ünlü en sık yazım hatası
      var del = d[i - 1][j] + 1;
      var sub = d[i - 1][j - 1] + subCost(a.charAt(i - 1), b.charAt(j - 1));
      var v = Math.min(ins, del, sub);
      if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
    }
  }
  return d[n][m];
}
/* Düz (Türkçeye özgü olmayan) harf değişimi var mı? Bu tür tek harf değişimleri belirsizdir. */
function hasPlainSub(a, b) {
  a = trLower(a); b = trLower(b);
  if (a.length !== b.length) return false;
  var diffs = [];
  for (var i = 0; i < a.length; i++) if (a.charAt(i) !== b.charAt(i)) diffs.push(i);
  if (diffs.length === 2 && diffs[1] === diffs[0] + 1 && a.charAt(diffs[0]) === b.charAt(diffs[1]) && a.charAt(diffs[1]) === b.charAt(diffs[0])) return false; // yer değiştirme
  return diffs.some(function (k) { return subCost(a.charAt(k), b.charAt(k)) === 1; });
}

function matchCase(src, repl) {
  if (isAllUpper(src)) return trUpper(repl);
  if (isCap(src)) return capFirst(repl);
  return repl;
}

/*
 * Bir bilinmeyen kelime için karar.
 * res: { ok, alt, sugg }
 * Döner: { action: 'ok'|'fix'|'flag'|'skip', to, sugg, reason }
 */
function decide(tok, res) {
  if (!res) return { action: 'ok' };
  var w = tok.w;
  if (res.ok) {
    // geçerli kelime; ancak blok Türkçe karaktersiz yazılmışsa bağlamsal düzeltme uygula (siparisiniz -> siparişiniz)
    if (tok.asciiMode && /^[\x00-\x7F]+$/.test(w) && res.alt && res.alt !== w) return { action: 'fix', to: matchCase(w, res.alt), reason: 'tr' };
    return { action: 'ok' };
  }
  if (res.alt && res.alt !== w) return { action: 'fix', to: matchCase(w, res.alt), reason: 'tr' };
  // büyük harfle yazılmış bilinmeyen kelime: büyük olasılıkla özel ad (Ahmet, Acme)
  if (isCap(w) && (tok.userCap || !tok.sentenceStart)) return { action: 'skip' };
  var seen = {};
  var lw = trLower(w);
  var sugg = (res.sugg || []).filter(function (s) {
    if (!s || /-/.test(s)) return false;
    var k = trLower(s);
    if (seen[k] || k === lw) return false;
    seen[k] = 1;
    return true;
  }).map(function (s) {
    var properNoun = isCap(s) && !isCap(w);
    return { s: properNoun ? s : matchCase(w, s), score: distance(w, s) + (properNoun ? 0.8 : 0), proper: properNoun };
  });
  // boşluklu öneri yalnızca soru eki / "ki" ayırma ise makul
  sugg = sugg.filter(function (x) {
    if (!/ /.test(x.s)) return true;
    var parts = x.s.split(' ');
    return parts.length === 2 && /^(m[ıiuü]\p{L}*|ki|de|da)$/u.test(trLower(parts[1])) && trLower(parts.join('')) === lw;
  });
  sugg.sort(function (a, b) { return a.score - b.score; });
  if (!sugg.length) return { action: 'flag', sugg: [], reason: 'nosugg' };
  var best = sugg[0], second = sugg[1];
  var unique = !second || second.score > best.score + 0.3;
  var sameStart = trLower(best.s).charAt(0) === lw.charAt(0);
  var auto = w.length >= 4 && unique && sameStart && !best.proper && best.score <= 1 && !hasPlainSub(w, best.s);
  if (auto) return { action: 'fix', to: best.s, reason: 'dict', sugg: sugg.map(function (x) { return x.s; }) };
  return { action: 'flag', sugg: sugg.slice(0, 6).map(function (x) { return x.s; }), reason: 'unsure' };
}

/*
 * Blokları işle: kurallar -> kelime çıkarma -> sözlük sorgusu -> karar.
 * pres: kod alanları maskelenmiş blok metinleri
 * deps: { proofread, mask, deasciify, lookup(async words[] -> {w: res}), ignore, proper, onProgress }
 */
async function processBlocks(pres, deps) {
  var stage = pres.map(function (pre) {
    var rule = deps.proofread(pre);
    var masked = deps.mask(rule);
    var de = masked;
    try { if (deps.deasciify) { var d = deps.deasciify(masked); if (d && d.length === masked.length) de = d; } } catch (e) {}
    var toks = tokenize(masked).filter(function (t) { return !shouldSkip(t, deps.ignore, deps.proper); });
    // Türkçe karaktersiz yazılmış blok mu? (hiç Türkçe harf yok ve düzeltici en az 2 kelimeyi değiştiriyor)
    var changed = 0;
    toks.forEach(function (t) { if (de.substr(t.i, t.w.length) !== t.w) changed++; });
    var asciiMode = !/[çğıöşüÇĞİÖŞÜ]/.test(pre) && changed >= 2;
    toks.forEach(function (t) {
      t.asciiMode = asciiMode;
      // kullanıcı bu kelimeyi kendisi büyük harfle mi yazdı? (kural motoru yalnız cümle başını büyütür)
      t.userCap = isCap(t.w) && new RegExp('(^|[^' + L + '])' + t.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![' + L + '])', 'u').test(pre);
      var alts = [];
      var ctx = de.substr(t.i, t.w.length);
      if (ctx !== t.w) alts.push(ctx);
      if (deps.deasciify) {
        try { var one = deps.deasciify(t.w); if (one && one !== t.w && alts.indexOf(one) === -1) alts.push(one); } catch (e) {}
      }
      t.alts = alts;
    });
    return { rule: rule, toks: toks };
  });
  var uniq = {};
  stage.forEach(function (s) {
    s.toks.forEach(function (t) {
      var e = uniq[t.w] || (uniq[t.w] = { w: t.w, alts: [], wantSugg: false });
      if (!(isCap(t.w) && (t.userCap || !t.sentenceStart))) e.wantSugg = true;
      t.alts.forEach(function (a) { if (e.alts.indexOf(a) === -1) e.alts.push(a); });
    });
  });
  var words = Object.keys(uniq).map(function (k) { return uniq[k]; });
  var res = words.length ? await deps.lookup(words) : {};
  if (!res) return null;
  return stage.map(function (s) {
    var out = s.rule, fixes = [], flags = [];
    s.toks.slice().sort(function (a, b) { return b.i - a.i; }).forEach(function (t) {
      var d = decide(t, res[t.w]);
      if (d.action === 'fix') {
        out = out.slice(0, t.i) + d.to + out.slice(t.i + t.w.length);
        fixes.push({ from: t.w, to: d.to, reason: d.reason });
      } else if (d.action === 'flag') {
        flags.push({ w: t.w, sugg: d.sugg || [] });
      }
    });
    return { final: out, fixes: fixes.reverse(), flags: flags.reverse() };
  });
}

module.exports = { processBlocks: processBlocks, tokenize: tokenize, shouldSkip: shouldSkip, decide: decide, distance: distance, hasPlainSub: hasPlainSub, matchCase: matchCase, isCap: isCap, trLower: trLower };
