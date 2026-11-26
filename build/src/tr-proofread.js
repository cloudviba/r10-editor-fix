/*
 * Türkçe yazım ve noktalama düzeltici (yerel, kural + sözlük tabanlı).
 * Metin hiçbir sunucuya gönderilmez.
 *
 * proofread(text, opts) -> düzeltilmiş metin
 *   text  : tek bir satır/blok metni (\n satır içi kırılım, ￼ satır içi nesne)
 *   opts.protectAll: true ise metne dokunmaz (kod blokları)
 */
'use strict';

var MASK = '';
var L = 'A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû';             // Türkçe harfler
var LOWER = 'a-zçğıöşüâîû';
var VOW_I = '[ıiuü]';

/* ---------------- yardımcılar ---------------- */
function trLower(s) { return s.toLocaleLowerCase('tr-TR'); }
function trUpper(s) { return s.toLocaleUpperCase('tr-TR'); }
function isAllUpper(s) { return s.length > 1 && s === trUpper(s) && s !== trLower(s); }
function isCapitalized(s) { var f = s.charAt(0); return f === trUpper(f) && f !== trLower(f); }
function matchCase(src, repl) {
  if (isAllUpper(src)) return trUpper(repl);
  if (isCapitalized(src)) return trUpper(repl.charAt(0)) + repl.slice(1);
  return repl;
}
function fill(n) { var s = ''; for (var i = 0; i < n; i++) s += MASK; return s; }

/* ---------------- korunan alanlar ---------------- */
var PROTECT = [
  /\[\/?[a-z*]+(?:=[^\]\n]*)?\]/gi,                                   // BBCode etiketleri
  /\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s\[\]<>"']+/gi,                // URL
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,                                    // e-posta
  new RegExp('(?<![' + L + '\\d@])(?:[a-z0-9-]+\\.)+(?:com|net|org|tr|io|co|info|biz|me|app|dev|edu|gov|xyz|online|store|shop|site|tech|ai|gg|tv|de|uk|us|eu|ru|az|ly|link)(?:\\.[a-z]{2})?(?:\\/[^\\s\\[\\]]*)?(?![' + L + '\\d])', 'gi'), // alan adı
  new RegExp('(?<![' + L + '\\d])[@#][' + L + '\\d_]+', 'g'),        // @kullanıcı #etiket
  /(?<!\S)(?::-?[)(DPpOo3*|\/\\]|;-?[)(DPp]|xD|XD|<3|:'\(|\^_?\^)(?!\S)/g, // ifadeler
  /:[A-Za-z0-9_]{1,24}:/g,                                            // R10 emoji kodları :r1: :gulme:
  /\d+(?:[.,:\/-]\d+)+/g,                                             // 1.250  3,5  14:30  01/01/2026
  /\b[A-Za-z0-9_]+\.(?:php|js|css|html?|png|jpe?g|gif|webp|pdf|zip|rar|exe|txt|json|xml)\b/gi // dosya adları
];

function mask(text) {
  var out = text;
  PROTECT.forEach(function (re) {
    out = out.replace(re, function (m) { return fill(m.length); });
  });
  return out;
}

/* ---------------- sözlük ---------------- */
// Tam kelime (ve "stem" işaretliler için ek alabilen kök) düzeltmeleri
var WORDS = {
  // TDK yaygın yanlışlar
  'herkez': ['herkes', 1], 'yanlız': ['yalnız', 1], 'yalnış': ['yanlış', 1], 'yanlıs': ['yanlış', 1],
  'birşey': ['bir şey', 1], 'bişey': ['bir şey', 1], 'birşi': ['bir şey', 0], 'herşey': ['her şey', 1],
  'hiçbirşey': ['hiçbir şey', 1], 'hiçbişey': ['hiçbir şey', 1], 'birsürü': ['bir sürü', 0], 'pekçok': ['pek çok', 0],
  'birkez': ['bir kez', 0], 'hergün': ['her gün', 0], 'herzaman': ['her zaman', 0], 'hiçbirzaman': ['hiçbir zaman', 0],
  'herhangibir': ['herhangi bir', 0], 'birtek': ['bir tek', 0], 'hiçkimse': ['hiç kimse', 1], 'herbiri': ['her biri', 1],
  'birgün': ['bir gün', 0], 'şuan': ['şu an', 0], 'şuanda': ['şu anda', 0], 'şuanki': ['şu anki', 0],
  'malesef': ['maalesef', 0], 'maalasef': ['maalesef', 0], 'deyil': ['değil', 1], 'diyil': ['değil', 1],
  'tabiki': ['tabii ki', 0], 'tabiiki': ['tabii ki', 0], 'yada': ['ya da', 0], 'veyada': ['veya da', 0],
  'orjinal': ['orijinal', 1], 'şarz': ['şarj', 1], 'sarj': ['şarj', 1], 'eşortman': ['eşofman', 1],
  'klavuz': ['kılavuz', 1], 'traş': ['tıraş', 1], 'egzos': ['egzoz', 1], 'eksoz': ['egzoz', 1],
  'şöför': ['şoför', 1], 'şöfor': ['şoför', 1], 'antreman': ['antrenman', 1], 'antremen': ['antrenman', 1],
  'makina': ['makine', 0], 'sandoviç': ['sandviç', 1], 'sandiviç': ['sandviç', 1], 'laboratuar': ['laboratuvar', 1],
  'provakasyon': ['provokasyon', 1], 'entellektüel': ['entelektüel', 1], 'süpriz': ['sürpriz', 1], 'sürpiz': ['sürpriz', 1],
  'mütevazi': ['mütevazı', 0], 'ünvan': ['unvan', 1], 'aşşağı': ['aşağı', 1], 'aşşa': ['aşağı', 0], 'yukarda': ['yukarıda', 0],
  'meyva': ['meyve', 0], 'zerafet': ['zarafet', 1], 'pantalon': ['pantolon', 1], 'proğram': ['program', 1],
  'ardarda': ['art arda', 0], 'yanısıra': ['yanı sıra', 0], 'öyleki': ['öyle ki', 0], 'şöyleki': ['şöyle ki', 0],
  'kontür': ['kontör', 1], 'acaip': ['acayip', 1], 'yalnışlık': ['yanlışlık', 1],
  'hersey': ['her şey', 1], 'birsey': ['bir şey', 1], 'bisey': ['bir şey', 1], 'hicbir': ['hiçbir', 1],
  'yalnızmı': ['yalnız mı', 0], 'kirbit': ['kibrit', 1],
  'hoşçakal': ['hoşça kal', 0], 'hoşcakal': ['hoşça kal', 0],   'insallah': ['inşallah', 0], 'maşşallah': ['maşallah', 0], 'masallah': ['maşallah', 0],
  // Türkçe karakter kullanılmadan yazılmış sık kelimeler (geçerli başka bir anlamı olmayanlar)
  'cok': ['çok', 0], 'icin': ['için', 0], 'degil': ['değil', 1], 'guzel': ['güzel', 1], 'tesekkur': ['teşekkür', 1],
  'tesekkurler': ['teşekkürler', 0], 'simdi': ['şimdi', 0], 'boyle': ['böyle', 1], 'soyle': ['şöyle', 1],
  'ozel': ['özel', 1], 'odeme': ['ödeme', 1], 'hizli': ['hızlı', 1], 'islem': ['işlem', 1], 'guven': ['güven', 1],
  'uye': ['üye', 1], 'musteri': ['müşteri', 1], 'gorusme': ['görüşme', 1], 'iletisim': ['iletişim', 1],
  'satis': ['satış', 0], 'alis': ['alış', 0], 'satislar': ['satışlar', 0], 'urun': ['ürün', 1], 'fiyati': ['fiyatı', 0], 'ucret': ['ücret', 1],
  'ucretsiz': ['ücretsiz', 1], 'basvuru': ['başvuru', 1], 'gunluk': ['günlük', 1], 'yillik': ['yıllık', 1],
  'aylik': ['aylık', 1], 'turkiye': ['Türkiye', 1], 'istanbul': ['İstanbul', 1]
};

// Özel isimler / markalar: yalnızca tamamen küçük yazılmışsa düzeltilir
var PROPER = {
  'türkiye': 'Türkiye', 'istanbul': 'İstanbul', 'ankara': 'Ankara', 'izmir': 'İzmir', 'trabzon': 'Trabzon', 'konya': 'Konya',
  'bursa': 'Bursa', 'antalya': 'Antalya', 'adana': 'Adana', 'gaziantep': 'Gaziantep', 'kayseri': 'Kayseri', 'samsun': 'Samsun',
  'google': 'Google', 'whatsapp': 'WhatsApp', 'instagram': 'Instagram', 'facebook': 'Facebook', 'youtube': 'YouTube',
  'tiktok': 'TikTok', 'telegram': 'Telegram', 'twitter': 'Twitter', 'linkedin': 'LinkedIn', 'microsoft': 'Microsoft',
  'windows': 'Windows', 'android': 'Android', 'iphone': 'iPhone', 'paypal': 'PayPal', 'papara': 'Papara',
  'iban': 'IBAN', 'eft': 'EFT', 'tl': 'TL', 'usd': 'USD', 'pdf': 'PDF', 'seo': 'SEO', 'vds': 'VDS', 'vps': 'VPS',
  'ssl': 'SSL', 'cpu': 'CPU', 'ram': 'RAM', 'ssd': 'SSD', 'r10': 'R10', 'ads': 'Ads'
};
var PROPER_SAFE_LOWER = { 'ram': 1, 'ads': 1 }; // tek başına sıradan kelime olabilenler: yalnız bağlamla (aşağıda)

// Çok kelimeli düzeltmeler
var PHRASES = [
  ['hiç bir', 'hiçbir'], ['bir çok', 'birçok'], ['bir kaç', 'birkaç'], ['her hangi', 'herhangi'],
  ['birden bire', 'birdenbire'], ['arda arda', 'art arda'], ['her kes', 'herkes'], ['bir takım', 'birtakım'],
  ['pek çoğu', 'pek çoğu'], ['ya da', 'ya da'], ['tabi ki', 'tabii ki'], ['şu anda', 'şu anda']
];

// Kısaltmalar: sonrasında büyük harf zorlanmaz
var ABBR = /(?:^|[^A-Za-zÇĞİÖŞÜçğıöşü])(?:vb|vs|vd|bkz|örn|sn|dr|prof|doç|av|st|no|tel|cad|sok|mah|apt|yy|bl|alb|yrd|müh|ş|a\.ş|ltd|şti|tic|san|inc)\.$/i;

/* ---------------- kurallar ---------------- */
function wordRe(body, flags) {
  return new RegExp('(?<![' + L + '\\d' + MASK + '])' + body + '(?![' + L + '\\d' + MASK + '])', flags || 'gu');
}

function applyWords(s) {
  return s.replace(new RegExp('(?<![' + L + '\\d' + MASK + '])([' + L + ']+)(?![' + L + '\\d' + MASK + '])', 'gu'), function (w) {
    var lw = trLower(w), le = w.toLowerCase();
    var key = WORDS[lw] ? lw : (WORDS[le] ? le : null);
    if (key) {
      var rep = WORDS[key][0];
      if (/^[A-ZÇĞİÖŞÜ]/.test(rep)) return rep; // özel isim
      return matchCase(w, rep);
    }
    // kök + ek
    for (var stem in WORDS) {
      if (!WORDS[stem][1]) continue;
      if (lw.length > stem.length && lw.indexOf(stem) === 0) {
        var r = WORDS[stem][0];
        var rest = w.slice(stem.length);
        var head = /^[A-ZÇĞİÖŞÜ]/.test(r) ? r : matchCase(w.slice(0, stem.length), r);
        if (isAllUpper(w)) return trUpper(r) + rest;
        return head + rest;
      }
    }
    return w;
  });
}

function applyProper(s) {
  return s.replace(new RegExp('(?<![' + L + '\\d' + MASK + '])([' + L + '0-9]+)(?![' + L + '\\d' + MASK + '])', 'gu'), function (w, _g, idx, all) {
    var lw = trLower(w), le = w.toLowerCase();
    var key = PROPER[lw] ? lw : (PROPER[le] ? le : null);
    if (!key) return w;
    if (w !== lw && w !== le) return w; // kullanıcı bilerek farklı yazmış
    if (PROPER_SAFE_LOWER[key]) {
      // "ram" / "ads": yalnız teknik bağlamda (sayıdan sonra ya da Google'dan sonra)
      var before = all.slice(Math.max(0, idx - 12), idx);
      if (key === 'ram' && !/\d\s*(gb|mb)?\s*$/i.test(before)) return w;
      if (key === 'ads' && !/google\s+$/i.test(before)) return w;
    }
    return PROPER[key];
  });
}

function applyPhrases(s) {
  PHRASES.forEach(function (p) {
    var parts = p[0].split(' ');
    var re = wordRe(parts.map(function (x) { return '(' + x + ')'; }).join('\\s+'), 'giu');
    s = s.replace(re, function (m) {
      var first = m.split(/\s+/)[0];
      return matchCase(first, p[1]);
    });
  });
  return s;
}

function applyQuestion(s) {
  var SUF = '(?:sınız|siniz|sunuz|sünüz|sın|sin|sun|sün|yım|yim|yum|yüm|yız|yiz|yuz|yüz|dır|dir|dur|dür|ydı|ydi|ydu|ydü)?';
  // bilinen kelimeler: varmı -> var mı
  var known = 'var|yok|olur|olmaz|tamam|doğru|değil|geldi|oldu|olacak|olmuş|gerek|lazım|mümkün|uygun|aktif|hazır|belli|güvenilir|kolay|zor|iyi|kötü|gerçek|ücretsiz|bedava|sorun|problem|hata|yeni|eski|orijinal|temiz|garanti|kesin|emin';
  s = s.replace(wordRe('(' + known + ')(m' + VOW_I + SUF + ')', 'giu'), '$1 $2');
  // fiil kalıpları: geliyormusun -> geliyor musun, almışmı -> almış mı, anlatırmısın -> anlatır mısın
  s = s.replace(wordRe('([' + L + ']{2,}(?:yor|mış|miş|muş|müş|acak|ecek|ır|ir|ur|ür|ar|er))(m' + VOW_I + SUF + ')', 'gu'), '$1 $2');
  return s;
}

var KI_EXCEPT = /^(şimdiki|şimdikiler|şimdikini|şimdikinin|deminki|geçenki)$/i;
function applyKi(s) {
  // dediki -> dedi ki, biliyorumki -> biliyorum ki
  return s.replace(wordRe('([' + L + ']{2,}(?:yorum|yoruz|yor|dı|di|du|dü|tı|ti|tu|tü|dım|dim|dum|düm))ki', 'gu'), function (m, a) {
    return KI_EXCEPT.test(m) ? m : a + ' ki';
  });
}

function applySpacing(s) {
  // birden fazla boşluk
  s = s.replace(/([^\s])[ \t]{2,}(?=[^\s])/g, '$1 ');
  // noktalamadan önceki boşluk
  s = s.replace(/[ \t]+([,.;:!?…)\]])/g, '$1');
  // "( metin" -> "(metin"
  s = s.replace(/\([ \t]+/g, '(');
  // tekrarlanan noktalama
  s = s.replace(/!{2,}/g, '!').replace(/\?{2,}/g, '?').replace(/,{2,}/g, ',').replace(/;{2,}/g, ';').replace(/\.{4,}/g, '...');
  s = s.replace(/([!?])(?:[!?])+/g, function (m) { return m.indexOf('?') !== -1 && m.indexOf('!') !== -1 ? '?!' : m.charAt(0); });
  // noktalamadan sonra boşluk (harf geliyorsa)
  s = s.replace(new RegExp('([,;!?])(?=[' + L + '])', 'gu'), '$1 ');
  s = s.replace(new RegExp('(?<=[' + L + ']{2})(:)(?=[' + L + '])', 'gu'), '$1 ');
  s = s.replace(new RegExp('(?<=[' + LOWER + ']{2})\\.(?=[' + L + '])', 'gu'), function (m, off, all) {
    // kısaltma değilse ve ardından gelen 1-3 harflik uzantı değilse
    var after = all.slice(off + 1).match(new RegExp('^[' + L + ']+'));
    if (after && after[0].length <= 3 && after[0] === after[0].toLowerCase()) return m; // dosya uzantısı vb.
    return '. ';
  });
  // kelimeye yapışık açılan parantez: "hesap(TL)" -> "hesap (TL)"
  s = s.replace(new RegExp('(?<=[' + L + '])\\((?=[' + L + '])', 'gu'), ' (');
  // kapanan parantezden sonra harf: "(TL)olarak" -> "(TL) olarak"
  s = s.replace(new RegExp('\\)(?=[' + L + '])', 'gu'), ') ');
  // sayı + TL
  s = s.replace(new RegExp('([\\d' + MASK + '])\\s?(tl|Tl|tL)(?![' + L + '])', 'gu'), '$1 TL');
  s = s.replace(new RegExp('([\\d' + MASK + '])(TL)(?![' + L + '])', 'gu'), '$1 $2');
  return s;
}

function capitalizeAt(s, i) {
  return s.slice(0, i) + trUpper(s.charAt(i)) + s.slice(i + 1);
}

function applyCapitals(s) {
  // satır başları (\n ile ayrılmış her satır)
  var lines = s.split('\n');
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];
    var m = line.match(new RegExp('^([^' + L + '\\d' + MASK + ']*(?:\\d{1,3}[.)][ \\t]+)?[^' + L + '\\d' + MASK + ']*)([' + LOWER + '])', 'u'));
    if (m) {
      var prefix = m[1];
      // önek yalnız sembol/emoji/boşluk ya da liste numarası olmalı
      if (!/[￼]/.test(prefix)) line = capitalizeAt(line, prefix.length);
    }
    // cümle sonları
    line = line.replace(new RegExp('([.!?])([ \\t]+)([' + LOWER + '])', 'gu'), function (all, p, sp, ch, off, str) {
      var before = str.slice(0, off + 1);
      if (p === '.') {
        if (/\.\.$/.test(before)) return all;            // üç nokta
        if (/\d\.$/.test(before)) return all;            // sıra sayısı: "1. madde"
        if (ABBR.test(before)) return all;               // kısaltma
      }
      return p + sp + trUpper(ch);
    });
    lines[li] = line;
  }
  return lines.join('\n');
}

function proofread(text, opts) {
  if (!text || (opts && opts.protectAll)) return text;
  var masked = mask(text);
  var s = masked;
  s = applySpacing(s);
  s = applyPhrases(s);
  s = applyWords(s);
  s = applyQuestion(s);
  s = applyKi(s);
  s = applyProper(s);
  s = applyCapitals(s);
  if (s === masked) return text;
  // maskeyi geri koy: maskeli karakterler kurallarca değiştirilmez/taşınmaz,
  // bu yüzden sırayla orijinal değerler yerleştirilir
  var orig = [];
  for (var i = 0; i < masked.length; i++) if (masked.charAt(i) === MASK) orig.push(text.charAt(i));
  var k = 0;
  return s.replace(//g, function () { return orig[k++]; });
}

module.exports = { proofread: proofread, mask: mask, MASK: MASK, PROPER: PROPER };
