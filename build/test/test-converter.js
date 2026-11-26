const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body></body>');
global.DOMParser = dom.window.DOMParser;
global.window = undefined;
const C = require('../../extension/converter.js');

let fail = 0;
function eq(name, got, exp) {
  if (got !== exp) { fail++; console.log('FAIL', name, '\n  got:', JSON.stringify(got), '\n  exp:', JSON.stringify(exp)); }
  else console.log('ok  ', name);
}
function rt(name, bb) {
  const h = C.bbToHTML(bb);
  const back = C.htmlToBB(h);
  eq('roundtrip ' + name, back, bb);
  // ikinci tur (önizleme döngüsü)
  eq('roundtrip2 ' + name, C.htmlToBB(C.bbToHTML(back)), bb);
}

// HTML -> BB
eq('paragraf + boş satır', C.htmlToBB('<p>satir1</p><p><br></p><p>satir2</p>'), 'satir1\n\nsatir2');
eq('trailing br', C.htmlToBB('<p>a<br></p><p>b</p>'), 'a\nb');
eq('çift br', C.htmlToBB('<p>a<br><br>b</p>'), 'a\n\nb');
eq('px boyutlar', C.htmlToBB('<p><span style="font-size: 18px;">x</span> <span style="font-size: 24px;">y</span> <span style="font-size: 48px;">z</span></p>'), '[SIZE=4]x [/SIZE][SIZE=5]y [/SIZE][SIZE=7]z[/SIZE]');
eq('renk rgb', C.htmlToBB('<p><span style="color: rgb(251, 160, 38);">r</span></p>'), '[COLOR=#FBA026]r[/COLOR]');
eq('liste sonrası boşluk', C.htmlToBB('<ul><li>a</li><li>b</li></ul><p><br></p><p>sonra</p>'), '[LIST]\n[*]a\n[*]b\n[/LIST]\n\nsonra');
eq('liste hemen sonra', C.htmlToBB('<ul><li>a</li></ul><p>sonra</p>'), '[LIST]\n[*]a\n[/LIST]\nsonra');
eq('ortalı gruplama', C.htmlToBB('<p style="text-align: center;">a</p><p><br></p><p style="text-align: center;">b</p><p>c</p>'), '[CENTER]a\n\nb[/CENTER]\nc');
eq('div align + br', C.htmlToBB('<div align="center"><strong>T</strong><br>alt</div><p><br></p><p>x</p>'), '[CENTER][B]T[/B]\nalt[/CENTER]\n\nx');
eq('bold br üzerinden', C.htmlToBB('<p><strong>a<br>b</strong></p>'), '[B]a[/B]\n[B]b[/B]');
eq('font tag', C.htmlToBB('<p><font size="5" color="#ff0000">x</font></p>'), '[SIZE=5][COLOR=#FF0000]x[/COLOR][/SIZE]');
eq('h2', C.htmlToBB('<h2>Başlık</h2><p>m</p>'), '[B][SIZE=5]Başlık[/SIZE][/B]\nm');
eq('link', C.htmlToBB('<p><a href="https://example.com/iletisim">https://example.com/iletisim</a> ve <a href="https://x.com">site</a></p>'), '[URL]https://example.com/iletisim[/URL] ve [URL=https://x.com]site[/URL]');
eq('iç içe div', C.htmlToBB('<div><p>a</p><p>b</p></div>'), 'a\nb');
eq('boş editör', C.htmlToBB('<p><br></p>'), '');
eq('entity', C.htmlToBB('<p>a &lt; b &amp; [QUOTE]x[/QUOTE]</p>'), 'a < b & [QUOTE]x[/QUOTE]');
eq('nbsp', C.htmlToBB('<p>a&nbsp; b</p>'), 'a  b');
eq('sıralı liste', C.htmlToBB('<ol><li>a</li><li><strong>b</strong></li></ol>'), '[LIST=1]\n[*]a\n[*][B]b[/B]\n[/LIST]');
eq('iç içe liste', C.htmlToBB('<ul><li>a<ul><li>x</li></ul></li><li>b</li></ul>'), '[LIST]\n[*]a\n[LIST]\n[*]x\n[/LIST]\n[*]b\n[/LIST]');
eq('img', C.htmlToBB('<p><img src="https://i.r10.net/a.png" class="fr-fic fr-dii"></p>'), '[IMG]https://i.r10.net/a.png[/IMG]');
eq('sağ', C.htmlToBB('<p style="text-align: right;">s</p>'), '[RIGHT]s[/RIGHT]');
eq('marker', C.htmlToBB('<p>a<span class="fr-marker"></span>b</p>'), 'ab');
eq('font family', C.htmlToBB('<p><span style="font-family: Georgia, serif;">g</span></p>'), '[FONT=Georgia]g[/FONT]');
eq('underline/strike', C.htmlToBB('<p><u>u</u> <s>s</s> <em>i</em></p>'), '[U]u [/U][S]s [/S][I]i[/I]');
eq('çoklu boş satır', C.htmlToBB('<p>a</p><p><br></p><p><br></p><p>b</p>'), 'a\n\n\nb');

// sunucunun önizleme sonrası ürettiği HTML
const serverHtml = '<div align="center"><strong><font color="#FBA026"><font size="6">Duyuru</font></font></strong><br><font size="4">Toplam</font></div><p><br></p><p><strong><font size="5">📌 Yenilikler</font></strong></p><ul><li><font size="4">a</font></li><li><font size="4">b</font></li></ul><p><br></p><p><strong><font size="5">⚙️ İşlem</font></strong></p>';
eq('sunucu html', C.htmlToBB(serverHtml), '[CENTER][B][COLOR=#FBA026][SIZE=6]Duyuru[/SIZE][/COLOR][/B]\n[SIZE=4]Toplam[/SIZE][/CENTER]\n\n[B][SIZE=5]📌 Yenilikler[/SIZE][/B]\n[LIST]\n[*][SIZE=4]a[/SIZE]\n[*][SIZE=4]b[/SIZE]\n[/LIST]\n\n[B][SIZE=5]⚙️ İşlem[/SIZE][/B]');

// round-trip
rt('basit', 'satir1\n\nsatir2');
rt('boyut renk', '[SIZE=5][COLOR=#FBA026]x[/COLOR][/SIZE] y');
rt('etiket arası boşluk', '[SIZE=5]a [/SIZE][SIZE=6]b [/SIZE][B]c[/B]');
eq('boşluk taşıma', C.htmlToBB('<p><strong>a</strong> <em>b</em> <span style="color:red"><strong>c</strong></span> <u>d</u></p>'), '[B]a [/B][I]b [/I][COLOR=red][B]c [/B][/COLOR][U]d[/U]');
rt('liste', '[LIST]\n[*]a\n[*]b\n[/LIST]\n\nsonra');
rt('liste2', 'once\n[LIST=1]\n[*]a\n[*][B]b[/B]\n[/LIST]\nsonra');
rt('center', '[CENTER][B]T[/B]\nalt\n\nikinci[/CENTER]\n\nx\n[RIGHT]r[/RIGHT]');
rt('url', '[URL=https://x.com]site [/URL][URL]https://example.org[/URL]');
rt('indent', '[INDENT]i\nj[/INDENT]\nk');
{ const a=C.htmlToBB(C.bbToHTML('[QUOTE]alıntı[/QUOTE]\n[CODE]a  <b>\n  c[/CODE]')); eq('literal stabil', C.htmlToBB(C.bbToHTML(a)), a); eq('literal görünüm', a, '[QUOTE]alıntı[/QUOTE]\n[CODE]a  <b>\n  c[/CODE]'); }
rt('img', '[IMG]https://i.r10.net/a.png[/IMG]');
rt('iç içe liste', '[LIST]\n[*]a\n[LIST]\n[*]x\n[/LIST]\n[*]b\n[/LIST]');
rt('boşluklar', 'a\n\n\nb');

eq('img px genişlik', C.htmlToBB('<p><img src="https://i.r10.net/a.png" class="fr-fic fr-dii" style="width: 300px;"></p>'), '[IMG=300]https://i.r10.net/a.png[/IMG]');
eq('img width attr', C.htmlToBB('<p><img src="https://i.r10.net/a.png" width="250"></p>'), '[IMG=250]https://i.r10.net/a.png[/IMG]');
eq('img yüzde -> düz', C.htmlToBB('<p><img src="https://i.r10.net/a.png" style="width: 50%;"></p>'), '[IMG]https://i.r10.net/a.png[/IMG]');
eq('img tek başına satır', C.htmlToBB('<p>a</p><p><img src="https://x/y.png" style="width: 120px;"></p><p>b</p>'), 'a\n[IMG=120]https://x/y.png[/IMG]\nb');
rt('img genişlik', '[IMG=320]https://i.r10.net/a.png[/IMG]');
rt('ortalı img', '[CENTER][IMG=120]https://i.r10.net/a.png[/IMG][/CENTER]\nmetin');
// R10 emojileri
global.window = undefined;
C.smilies = { '1': ':)', '73': ':r1:' };
eq('froala emoji span', C.htmlToBB('<p>a <span class="fr-emoticon emojiImg fr-deletable fr-emoticon-img" style="background: url(\'//cdn.r10.net/emojis/smile.png\');" smilieid="1">&nbsp;</span>&nbsp;b</p>'), 'a :) b');
eq('emoji eşleme yoksa görsel', C.htmlToBB('<p><span class="fr-emoticon" style="background: url(\'//cdn.r10.net/emojis/x.png\');" smilieid="999">&nbsp;</span></p>'), '[IMG]https://cdn.r10.net/emojis/x.png[/IMG]');
eq('modern emoji img', C.htmlToBB('<p>selam<img data-smilie=":r1:" src="//cdn.r10.net/emojis/r1.gif"> naber</p>'), 'selam :r1: naber');
var smh = C.bbToHTML('selam :r1: ve :) ama http://x.com/:) ve [CODE]:)[/CODE]', { smilies: [{ code: ':r1:', src: 'R1' }, { code: ':)', src: 'S' }] });
eq('kod->görsel', (smh.match(/data-smilie/g) || []).length, 2);
eq('kod içinde dönüşmez', /\[CODE\]:\)\[\/CODE\]/.test(smh), true);
eq('emoji gidiş-dönüş', C.htmlToBB(C.bbToHTML('selam :r1: naber :)', { smilies: [{ code: ':r1:', src: 'R1' }, { code: ':)', src: 'S' }] })), 'selam :r1: naber :)');
rt('R10 kod etiketleri ham', '[PHPR]<?php echo "[B]x[/B]"; ?>[/PHPR]\n[CSSR]a{b:c}[/CSSR]\n[JSFIDDLE]abc[/JSFIDDLE]');
eq('yalnız BBCode satırları korunur', C.htmlToBB('<p>[QUOTE]</p><p>alıntı</p><p>[/QUOTE]</p><p>[CSSR][/CSSR]</p>'), '[QUOTE]\nalıntı\n[/QUOTE]\n[CSSR][/CSSR]');
eq('yan yana görseller', C.htmlToBB('<p><img src="https://a/1.gif"> <img src="https://a/2.gif"></p>'), '[IMG]https://a/1.gif[/IMG] [IMG]https://a/2.gif[/IMG]');
eq('biçimli boş satır yine boş', C.htmlToBB('<p>a</p><p><strong><br></strong></p><p>b</p>'), 'a\n\nb');
console.log(fail ? `\n${fail} FAIL` : '\nALL PASS');
process.exit(fail ? 1 : 0);
