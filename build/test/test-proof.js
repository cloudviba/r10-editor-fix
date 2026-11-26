const { proofread } = require('../src/tr-proofread.js');
let fail = 0;
function t(inp, exp) {
  const got = proofread(inp);
  if (got !== exp) { fail++; console.log('FAIL\n  in :', JSON.stringify(inp), '\n  got:', JSON.stringify(got), '\n  exp:', JSON.stringify(exp)); }
  else console.log('ok  ', JSON.stringify(inp).slice(0, 70));
}
// noktalama ve boşluk
t('merhaba , nasılsın ?', 'Merhaba, nasılsın?');
t('Bu bir test.Peki sonra', 'Bu bir test. Peki sonra');
t('harika!!! gerçekten??', 'Harika! Gerçekten?');
t('Not:bu önemli', 'Not: bu önemli');
t('çok  fazla   boşluk', 'Çok fazla boşluk');
t('hesap(TL)olarak', 'Hesap (TL) olarak');
t('( parantez içi )', '(Parantez içi)');
t('Fiyat 50tl ve 100 tl', 'Fiyat 50 TL ve 100 TL');
t('Bekle....', 'Bekle...');
// korunanlar
t('fiyat 1.250 TL, saat 14:30, oran 3,5', 'Fiyat 1.250 TL, saat 14:30, oran 3,5');
t('siteye bak: https://r10.net/a,b?x=1 tamam', 'Siteye bak: https://r10.net/a,b?x=1 tamam');
t('example.com adresine gir', 'example.com adresine gir');
t('mail at info@example.com tamam', 'Mail at info@example.com tamam');
t('harika :) çok iyi', 'Harika :) çok iyi');
t('[QUOTE]alıntı[/QUOTE] metin', '[QUOTE]alıntı[/QUOTE] metin');
t('dosya index.php içinde', 'Dosya index.php içinde');
t('@ornekuye ve #r10 etiketi', '@ornekuye ve #r10 etiketi');
// büyük harf
t('ilk cümle. ikinci cümle! üçüncü mü? dördüncü', 'İlk cümle. İkinci cümle! Üçüncü mü? Dördüncü');
t('1. madde ve 2. madde', '1. Madde ve 2. madde');
t('vb. şeyler olur', 'Vb. şeyler olur');
t('bekle... tamam', 'Bekle... tamam');
t('🔹 toplam tutar', '🔹 Toplam tutar');
t('3 adet hesap', '3 adet hesap');
t('satır bir\nsatır iki', 'Satır bir\nSatır iki');
// sözlük
t('herkez yanlız kaldı', 'Herkes yalnız kaldı');
t('Herkezin bildiği birşey', 'Herkesin bildiği bir şey');
t('herşeyi biliyorum, birşeyler yaptım', 'Her şeyi biliyorum, bir şeyler yaptım');
t('hiç bir sorun yok, bir çok kişi bir kaç gün', 'Hiçbir sorun yok, birçok kişi birkaç gün');
t('malesef deyil', 'Maalesef değil');
t('tabiki gelirim yada gelmem', 'Tabii ki gelirim ya da gelmem');
t('şuan müsait değilim', 'Şu an müsait değilim');
t('orjinal ürün, orjinali', 'Orijinal ürün, orijinali');
t('YANLIZ değil', 'YALNIZ değil');
t('cok guzel bir urun icin tesekkurler', 'Çok güzel bir ürün için teşekkürler');
t('hizli islem ve guvenli odeme', 'Hızlı işlem ve güvenli ödeme');
// mı/mi, ki
t('geliyormusun yarın', 'Geliyor musun yarın');
t('hesap varmı acaba', 'Hesap var mı acaba');
t('bu doğrumu', 'Bu doğru mu');
t('almışmı bilmiyorum', 'Almış mı bilmiyorum');
t('anlatırmısın lütfen', 'Anlatır mısın lütfen');
t('dediki gelecek, biliyorumki zor', 'Dedi ki gelecek, biliyorum ki zor');
t('şimdiki durum', 'Şimdiki durum');
// yanlış pozitif olmamalı
t('kedimi gördün mü', 'Kedimi gördün mü');
t('terminal ve termik', 'Terminal ve termik');
t('pazarmış öyle duydum', 'Pazarmış öyle duydum');
t('defterimi aldım', 'Defterimi aldım');
t('mermi ve sermaye', 'Mermi ve sermaye');
t('evdeki ve mutfaktaki', 'Evdeki ve mutfaktaki');
t('yarımı verdim', 'Yarımı verdim');
// özel isimler
t('türkiye ve istanbul, google ile whatsapp', 'Türkiye ve İstanbul, Google ile WhatsApp');
t('8 gb ram var, ram yapmak', '8 GB RAM var, ram yapmak'.replace('GB', 'gb'));
t('iban ile eft', 'IBAN ile EFT');
// değişiklik yoksa aynen
t('Her şey yolunda.', 'Her şey yolunda.');
t('', '');
console.log(fail ? `\n${fail} FAIL` : '\nALL PASS');
