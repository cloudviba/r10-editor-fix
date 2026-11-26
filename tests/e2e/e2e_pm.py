# R10 özel mesaj ekranı: AJAX gönderimi, sıkı editör düzeni, R10'un Froala'ya doğrudan yazması
import json, os, urllib.parse
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
EXT = os.path.join(ROOT, 'extension')
OUT = os.environ.get('R10_SHOTS', '/tmp/r10-shots'); os.makedirs(OUT, exist_ok=True)
conv = open(os.path.join(EXT, 'converter.js')).read()
fixer = open(os.path.join(EXT, 'fixer.js')).read()
modern = open(os.path.join(EXT, 'modern-editor.js')).read()

FAKE = r"""
window.FroalaEditor = { INSTANCES: [] };
var QR_EditorID = 'vB_Editor_QR';
function FakeFroala(ta){
  var box=document.createElement('div'); box.className='fr-box fr-basic';
  var tb=document.createElement('div'); tb.style.cssText='height:40px;border-bottom:1px solid #555'; box.appendChild(tb);
  var el=document.createElement('div'); el.contentEditable='true'; el.className='fr-element fr-view';
  el.style.cssText='height:150px;overflow:auto;padding:8px;color:#ddd';
  box.appendChild(el); ta.style.display='none'; ta.parentNode.insertBefore(box, ta.nextSibling);
  var self=this, handlers={};
  this.$box=[box]; this.$oel=[ta]; this.$wp=[el]; this.opts={heightMin:150, heightMax:150};
  this.events={ on:function(n,f){(handlers[n]=handlers[n]||[]).push(f);}, trigger:function(n){(handlers[n]||[]).forEach(function(f){f.call(self);});}, focus:function(){} };
  var changed=function(){ ta.value=el.innerHTML; self.events.trigger('contentChanged'); };
  this.html={ get:function(){return el.innerHTML;},
    set:function(h){ el.innerHTML=h; changed(); },
    insert:function(h){ el.innerHTML+=h; changed(); } };
  el.addEventListener('input', changed);
  this.undo={saveStep:function(){}};
  this.bbCode={isBbCodeView:function(){return false;}};
  FroalaEditor.INSTANCES.push(this); window.r10Editor=this;
  // R10: içerik değişince Froala alanının kilidini açar
  this.events.on('contentChanged', function(){ var t=document.getElementById(QR_EditorID+'_editor'); if(t) t.removeAttribute('disabled'); });
}
// R10: sohbet yüksekliği = kap - başlık - editör
function pmHeight(){
  var c=document.querySelector('.privateMessages'), h=document.querySelector('.privateMessage .head'), e=document.querySelector('.privateMessage .editor');
  document.querySelector('.privateMessage .conversation').style.height=(c.offsetHeight-h.offsetHeight-e.offsetHeight)+'px';
  window.__pmHeightCalls=(window.__pmHeightCalls||0)+1;
}
window.__sent=[];
// R10: geniş ekranda özel mesaj AJAX ile, alanları elle okuyarak gönderilir
document.body.addEventListener('submit', function(){ window.r10Editor && window.r10Editor.events.trigger('blur'); });
document.body.addEventListener('click', function(e){
  var b=e.target.closest('#qr_submit'); if(!b) return;
  if(window.innerWidth>1000){
    var f=b.closest('form'); window.r10Editor.events.trigger('blur');
    var msg=f.querySelector('textarea[name="message"]'); // jQuery .val(): ilk eşleşen
    window.__sent.push({message: msg?msg.value:null, wysiwyg: f.querySelector('input[name="wysiwyg"]').value});
    e.preventDefault();
    setTimeout(function(){ // başarılı yanıt: konuşma yeniden yüklenir, editör boşaltılır
      var li=document.createElement('li'); li.textContent='gönderildi'; document.querySelector('.conversation ul').appendChild(li);
      window.r10Editor.html.set('');
    }, 150);
  }
});
setTimeout(function(){ new FakeFroala(document.getElementById('vB_Editor_QR_editor')); pmHeight(); }, 300);
"""

def page_html():
    msgs = ''.join(f'<li>Örnek mesaj {i}</li>' for i in range(1, 40))
    return f"""<!doctype html><html data-r10fix="on" data-r10me="on"><head><meta charset="utf-8"><title>Özel Mesajlar</title>
<style>body{{font-family:Arial;margin:0;background:#383b50;color:#ddd}} .privateMessages{{height:770px;width:1000px;margin:20px auto;display:flex;border:1px solid #555}}
.middle{{flex:1;display:flex;flex-direction:column}} .head{{height:76px;border-bottom:1px solid #555}} .conversation{{overflow:auto}} .conversation li{{padding:6px}}</style></head>
<body class="night orange"><div class="privateMessages single"><div class="middle"><div class="middleContainer"><div class="privateMessage" data-pmid="111">
<div class="head">Konu: Deneme</div><div class="conversation"><ul>{msgs}</ul></div>
<div class="editor"><form action="private.php?do=insertpm" method="post" id="message_form">
<textarea name="message" id="vB_Editor_QR_editor"></textarea>
<input type="hidden" name="wysiwyg" value="1"><input type="hidden" name="do" value="insertpm"><input type="hidden" name="title" value="Deneme">
<input type="submit" class="robtn rogreen button" id="qr_submit" name="sbutton" value="Mesaj Gönder">
</form></div></div></div></div></div>
<script>{FAKE}</script><script>{conv}</script><script>{fixer}</script><script>{modern}</script></body></html>"""

fails = []
def check(name, cond, extra=''):
    print(('ok   ' if cond else 'FAIL ') + name + (('  -> ' + str(extra)) if (extra and not cond) else ''))
    if not cond: fails.append(name)

posted = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1300, 'height': 900}, locale='tr-TR')
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    def handler(route, req):
        if req.method == 'POST':
            posted.append(urllib.parse.parse_qs(req.post_data, keep_blank_values=True))
            route.fulfill(status=200, content_type='text/html; charset=utf-8', body='<html><body>posted</body></html>')
        else:
            route.fulfill(status=200, content_type='text/html; charset=utf-8', body=page_html())
    page.route('https://www.r10.net/**', handler)
    URL = 'https://www.r10.net/private.php?do=showpm&pmid=111'
    sent = lambda: page.evaluate('window.__sent')
    def wait_ready(modern):
        page.wait_for_function('window.FroalaEditor && FroalaEditor.INSTANCES[0] && FroalaEditor.INSTANCES[0].__r10me', timeout=15000)
        if modern: page.wait_for_selector('.r10me:not([hidden]) .ProseMirror', timeout=15000)
        page.wait_for_timeout(300)

    # ---------- 1) R10 editörü kipi ----------
    page.goto(URL); page.evaluate("localStorage.clear(); localStorage.setItem('r10me:mode','r10')"); page.goto(URL); wait_ready(False)
    check('R10 kipinde modern editör gizli', page.evaluate("document.querySelector('.r10me').hidden"))
    page.evaluate("var el=document.querySelector('.fr-element'); el.innerHTML='<p>Merhaba <strong>dünya</strong></p><p>ikinci satır</p>'; el.dispatchEvent(new Event('input'))")
    page.click('#qr_submit'); page.wait_for_timeout(400)
    s = sent()
    check('R10 kipi: tek gönderim', len(s) == 1, s)
    check('R10 kipi: BBCode gitti, HTML gitmedi', s and s[0]['message'] == 'Merhaba [B]dünya[/B]\nikinci satır' and '<p>' not in s[0]['message'], s)
    check('R10 kipi: wysiwyg=0', s and s[0]['wysiwyg'] == '0', s)
    st = page.evaluate("""({oel: document.getElementById('vB_Editor_QR_editor').name, oelDis: document.getElementById('vB_Editor_QR_editor').disabled,
        fixName: document.querySelector('textarea[data-r10fix]').getAttribute('name'), wys: document.querySelector('input[name=wysiwyg]').value,
        firstMsg: document.querySelectorAll('textarea[name=message]').length})""")
    check('gönderim sonrası alanlar eski haline döndü', st['oel'] == 'message' and not st['oelDis'] and st['fixName'] is None and st['wys'] == '1' and st['firstMsg'] == 1, st)
    check('gönderim sonrası Froala boşaldı', page.evaluate("FroalaEditor.INSTANCES[0].html.get()") == '')

    # ---------- 2) Modern editör kipi ----------
    page.evaluate("localStorage.setItem('r10me:mode','modern')"); page.goto(URL); wait_ready(True)
    page.evaluate("window.__sent=[]")
    check('sıkı kip etkin', page.evaluate("document.querySelector('.r10me').classList.contains('is-compact')"))
    page.wait_for_timeout(300)
    lay = page.evaluate("""({editor: document.querySelector('.privateMessage .editor').offsetHeight, conv: document.querySelector('.conversation').offsetHeight,
        toolbar: document.querySelector('.r10me-toolbar').offsetHeight, status: getComputedStyle(document.querySelector('.r10me-status')).display, calls: window.__pmHeightCalls})""")
    print('   düzen:', lay)
    check('editör yüksekliği makul (<= 270px)', lay['editor'] <= 270, lay)
    check('sohbet alanı geniş (>= 420px)', lay['conv'] >= 420, lay)
    check('araç çubuğu tek satır', lay['toolbar'] <= 42, lay)
    check('durum çubuğu gizli', lay['status'] == 'none', lay)
    page.screenshot(path=os.path.join(OUT, 'shot-pm-compact.png'))
    # uzun metin: editör sınırlı kalır, içeride kayar
    page.click('.r10me .ProseMirror')
    for i in range(14): page.keyboard.type(f'satır {i}'); page.keyboard.press('Enter')
    page.wait_for_timeout(400)
    lay2 = page.evaluate("({editor: document.querySelector('.privateMessage .editor').offsetHeight, conv: document.querySelector('.conversation').offsetHeight, sc: document.querySelector('.r10me-scroll').scrollHeight > document.querySelector('.r10me-scroll').clientHeight})")
    check('uzun metinde editör büyümüyor, içeride kayıyor', lay2['editor'] <= 300 and lay2['sc'], lay2)
    check('uzun metinde sohbet görünür kalıyor (>= 380px)', lay2['conv'] >= 380, lay2)
    # içeriği sıfırla ve biçimli metin yaz
    page.keyboard.press('Control+a'); page.keyboard.press('Backspace')
    page.keyboard.type('selam '); page.keyboard.press('Control+b'); page.keyboard.type('kalın'); page.keyboard.press('Control+b'); page.keyboard.type(' yazı')
    page.wait_for_timeout(1300)
    keys = page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('r10me:draft:'))")
    check('taslak konuşmaya özel kaydedildi', any('conv=111' in k for k in keys), keys)
    page.click('#qr_submit'); page.wait_for_timeout(500)
    s = sent()
    check('modern kip: BBCode gitti', len(s) == 1 and s[0]['message'] == 'selam [B]kalın[/B] yazı' and s[0]['wysiwyg'] == '0', s)
    st = page.evaluate("({bb: FroalaEditor.INSTANCES[0].__r10me.getBB(), keys: Object.keys(localStorage).filter(k=>k.startsWith('r10me:draft:')), banner: document.querySelector('.r10me-banner').hidden})")
    check('gönderim sonrası modern editör boşaldı', st['bb'] == '', st)
    check('gönderilen taslak silindi', not any('conv=111' in k for k in st['keys']), st)
    check('taslak uyarısı çıkmadı', st['banner'], st)

    # ---------- 3) R10 alıntı ekleme (html.insert) ----------
    page.evaluate("window.r10Editor.html.insert('<p>alıntı <strong>metni</strong></p>')"); page.wait_for_timeout(1100)
    bb = page.evaluate("FroalaEditor.INSTANCES[0].__r10me.getBB()")
    check('R10 alıntısı modern editöre eklendi', 'alıntı [B]metni[/B]' in bb, bb)
    # ---------- 4) Ctrl+Enter ----------
    page.evaluate("window.__sent=[]"); page.click('.r10me .ProseMirror'); page.keyboard.press('Control+Enter'); page.wait_for_timeout(500)
    s = sent()
    check('Ctrl+Enter ile gönderim BBCode', len(s) == 1 and 'alıntı [B]metni[/B]' in s[0]['message'] and '<p>' not in s[0]['message'], s)

    # ---------- 5) konuşma değişimi: gönderilmemiş taslak korunur ----------
    page.click('.r10me .ProseMirror'); page.keyboard.type('gönderilmemiş taslak'); page.wait_for_timeout(1300)
    page.evaluate("document.querySelector('.privateMessage').setAttribute('data-pmid','222'); window.r10Editor.html.set('')"); page.wait_for_timeout(300)
    st = page.evaluate("({bb: FroalaEditor.INSTANCES[0].__r10me.getBB(), keys: Object.keys(localStorage).filter(k=>k.startsWith('r10me:draft:')), banner: document.querySelector('.r10me-banner').hidden})")
    check('başka konuşmaya geçince editör boşaldı', st['bb'] == '', st)
    check('önceki konuşmanın taslağı korundu', any('conv=111' in k for k in st['keys']), st)
    check('yeni konuşmada taslak uyarısı yok', st['banner'], st)
    page.evaluate("document.querySelector('.privateMessage').setAttribute('data-pmid','111'); window.r10Editor.html.set('')"); page.wait_for_timeout(300)
    check('eski konuşmaya dönünce taslak önerildi', not page.evaluate("document.querySelector('.r10me-banner').hidden"))

    # ---------- 6) dar ekran: normal form gönderimi ----------
    page.set_viewport_size({'width': 900, 'height': 900})
    page.evaluate("localStorage.removeItem('r10me:draft:/private.php?do=showpm&pmid=111&conv=111')")
    page.goto(URL); wait_ready(True)
    page.click('.r10me .ProseMirror'); page.keyboard.type('dar ekran mesajı'); page.wait_for_timeout(200)
    with page.expect_navigation(): page.click('#qr_submit')
    last = posted[-1] if posted else {}
    check('dar ekran: tek message alanı, BBCode', last.get('message') == ['dar ekran mesajı'] and last.get('wysiwyg') == ['0'], last)

    check('sayfa hatası yok', not errs, errs)
    b.close()
print('ALL PASS' if not fails else f'{len(fails)} FAIL: {fails}')
