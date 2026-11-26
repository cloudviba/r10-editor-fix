import json, re, sys, urllib.parse
from playwright.sync_api import sync_playwright
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
EXT=os.path.join(ROOT,'extension')
OUT=os.environ.get('R10_SHOTS','/tmp/r10-shots'); os.makedirs(OUT,exist_ok=True)

EXT = os.path.join(EXT, '')
conv = open(EXT + 'converter.js').read()
fixer = open(EXT + 'fixer.js').read()
modern = open(EXT + 'modern-editor.js').read()

INITIAL = ('<div align="center"><strong><font color="#FBA026"><font size="6">Yeni Sürüm Duyurusu</font></font></strong>'
           '<br><font size="4">Sürüm <strong>2.0</strong> yayında</font></div><p><br></p>'
           '<p><strong><font size="5">📌 Yenilikler</font></strong></p><ul><li>Daha hızlı arayüz</li><li>Karanlık tema desteği</li></ul><p><br></p><p>son satır</p>')

FAKE = r"""
window.FroalaEditor = { INSTANCES: [] };
function FakeFroala(ta){
  var box=document.createElement('div'); box.className='fr-box fr-basic';
  var el=document.createElement('div'); el.contentEditable='true'; el.className='fr-element fr-view';
  el.style.cssText='min-height:200px;border:1px solid #888;padding:8px;color:#ddd';
  box.appendChild(el); ta.style.display='none'; ta.parentNode.insertBefore(box, ta.nextSibling);
  el.innerHTML = ta.value;
  this.$box=[box]; this.$oel=[ta]; this.opts={heightMin:200};
  var self=this;
  this.html={get:function(){return el.innerHTML;}, set:function(h){el.innerHTML=h; ta.value=h; self.setCount=(self.setCount||0)+1;}};
  this.undo={saveStep:function(){}}; this.events={focus:function(){}};
  this.bbCode={isBbCodeView:function(){return false;}};
  ta.form.addEventListener('submit', function(){ if(!ta.disabled) ta.value=el.innerHTML; });
  FroalaEditor.INSTANCES.push(this);
}
setTimeout(function(){ new FakeFroala(document.getElementById('vB_Editor_001_editor')); }, 300);
"""

def page_html(theme_night=True):
    ta = INITIAL.replace('&', '&amp;').replace('<', '&lt;')
    return f"""<!doctype html><html data-r10fix="on" data-r10me="on"><head><meta charset="utf-8"><title>R10 test</title>
<style>body{{font-family:Arial;margin:0;padding:24px;background:{'#383b50' if theme_night else '#f3f4f8'};color:{'#ddd' if theme_night else '#222'}}}
.wrap{{max-width:1100px;margin:auto}}</style></head>
<body class="{'night orange' if theme_night else 'orange'}"><div class="wrap"><h3>Yeni Konu aç</h3>
<form action="/newthread.php" method="post" id="f">
<input type="hidden" name="do" value="postthread"><input type="hidden" name="wysiwyg" value="0">
<input type="text" name="subject" value="Test konu" style="width:100%;margin-bottom:10px">
<div><textarea name="message" id="vB_Editor_001_editor">{ta}</textarea></div>
<p><input type="submit" name="sbutton" value="Konuyu Aç"> <input type="submit" name="preview" value="Önizleme"></p>
</form></div>
<script>{conv}</script><script>{fixer}</script><script>{FAKE}</script><script>{modern}</script>
</body></html>"""

posted = []
fails = []
def check(name, cond, extra=''):
    print(('ok   ' if cond else 'FAIL ') + name + (('  -> ' + str(extra)) if (extra and not cond) else ''))
    if not cond: fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 900}, locale='tr-TR')
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' else None)
    night = {'v': True}

    def handler(route, req):
        if req.method == 'POST':
            posted.append(urllib.parse.parse_qs(req.post_data, keep_blank_values=True))
            route.fulfill(status=200, content_type='text/html; charset=utf-8', body='<html><body>posted</body></html>')
        else:
            route.fulfill(status=200, content_type='text/html; charset=utf-8', body=page_html(night['v']))
    page.route('https://www.r10.net/**', handler)

    page.goto('https://www.r10.net/newthread.php?do=newthread&f=474')
    page.wait_for_selector('.r10me:not([hidden]) .ProseMirror', timeout=15000)
    check('modern editör açıldı', page.is_visible('.r10me .ProseMirror'))
    check('froala gizlendi', page.eval_on_selector('.fr-box', 'e => e.style.display') == 'none')
    check('değiştirici var', page.is_visible('.r10me-switch'))
    expected = page.evaluate("R10BB.htmlToBB(" + json.dumps(INITIAL) + ")")
    got = page.evaluate("FroalaEditor.INSTANCES[0].__r10me.getBB()")
    canon = lambda x: page.evaluate('''(bb)=>{const d=document.createElement('div');d.innerHTML=R10BB.bbToHTML(bb);
      const out=[];const walk=(n,st)=>{if(n.nodeType===3){out.push(n.nodeValue+'|'+[...st].sort().join(','));return}
      const s=new Set(st);const t=n.tagName;if(t==='STRONG')s.add('b');if(t==='EM')s.add('i');if(t==='U')s.add('u');if(t==='S')s.add('s');
      if(n.style&&n.style.color)s.add('c:'+n.style.color);if(n.style&&n.style.fontSize)s.add('z:'+n.style.fontSize);if(n.style&&n.style.textAlign)s.add('a:'+n.style.textAlign);
      if(t==='P'||t==='LI')out.push('~NL~');[...n.childNodes].forEach(c=>walk(c,s))};walk(d,new Set());return out.join('')}''', x)
    check('içerik kayıpsız aktarıldı (anlamsal)', canon(got) == canon(expected), (got, expected))
    page.wait_for_timeout(400); page.screenshot(path=os.path.join(OUT, 'shot-dark.png'))

    # Yazma + biçim
    page.click('.r10me .ProseMirror')
    page.keyboard.press('Control+End')
    page.keyboard.press('Enter')
    page.keyboard.type('Kırmızı büyük kalın')
    page.keyboard.press('Shift+Home'); page.wait_for_timeout(120)
    page.click('.r10me-btn[aria-label^="Kalın"]')
    page.click('.r10me-btn[aria-label="Yazı boyutu"]')
    page.click('.r10me-pop .r10me-item:has-text("Büyük")')
    page.click('.r10me-btn[aria-label="Yazı rengi"]')
    page.click('.r10me-pop .r10me-grid button[title="#E25041"]')
    page.keyboard.press('End'); page.wait_for_timeout(120)
    page.keyboard.press('Enter')
    page.keyboard.press('Enter')
    page.click('.r10me-btn[aria-label="Ortala"]')
    page.keyboard.type('Ortalı satır')
    bb = page.evaluate("FroalaEditor.INSTANCES[0].__r10me.getBB()")
    check('kalın+boyut+renk BB', '[COLOR=#E25041]' in bb and '[SIZE=5]' in bb and '[B]' in bb and 'Kırmızı büyük kalın' in bb, bb)
    check('ortalı satır BB', '[CENTER]Ortalı satır[/CENTER]' in bb, bb)
    check('boş satır korunuyor', '\n\n[CENTER]Ortalı satır' in bb, bb[-120:])

    # Menü ekran görüntüsü
    page.click('.r10me-btn[aria-label="Yazı boyutu"]')
    page.wait_for_timeout(350); page.screenshot(path=os.path.join(OUT, 'shot-menu.png'))
    page.keyboard.press('Escape')

    # BBCode sekmesi düzenleme
    page.click('.r10me-tabs button:has-text("BBCode")')
    src = page.input_value('.r10me-source')
    check('kaynak sekmesi BB', src == bb, (src, bb))
    page.fill('.r10me-source', src + '\n[U]altı çizili[/U]')
    page.click('.r10me-tabs button:has-text("Yaz")')
    bb2 = page.evaluate("FroalaEditor.INSTANCES[0].__r10me.getBB()")
    check('kaynaktan geri dönüş', bb2.endswith('[U]altı çizili[/U]'), bb2[-80:])

    # Önizleme sekmesi
    page.click('.r10me-tabs button:has-text("Önizle")')
    check('önizleme render', page.is_visible('.r10me-preview'))
    page.screenshot(path=os.path.join(OUT, 'shot-preview.png'))
    page.click('.r10me-tabs button:has-text("Yaz")')

    # Emoji + link
    page.click('.r10me .ProseMirror')
    page.keyboard.press('Control+End')
    page.click('.r10me-btn[aria-label="Emoji"]')
    page.click('.r10me-emoji button:has-text("🔥")')
    page.keyboard.press('Escape')
    page.keyboard.type(' ')
    page.click('.r10me-btn[aria-label^="Bağlantı"]')
    page.fill('.r10me-pop input[type=url]', 'example.com/iletisim')
    page.fill('.r10me-pop input[type=text]', 'İletişim')
    page.click('.r10me-pop button:has-text("Uygula")')
    bb3 = page.evaluate("FroalaEditor.INSTANCES[0].__r10me.getBB()")
    check('emoji eklendi', '🔥' in bb3, bb3[-80:])
    check('link eklendi', '[URL=https://example.com/iletisim]İletişim[/URL]' in bb3, bb3[-120:])

    # Quote sarmalama
    page.wait_for_timeout(150)
    page.keyboard.press('Enter')
    page.keyboard.type('alıntı metni')
    page.keyboard.press('Shift+Home'); page.wait_for_timeout(120)
    page.click('.r10me-btn[aria-label^="Alıntı"]')
    bb4 = page.evaluate("FroalaEditor.INSTANCES[0].__r10me.getBB()")
    check('quote sarmalandı', '[QUOTE]alıntı metni[/QUOTE]' in bb4, bb4[-80:])

    # R10 editörüne geç ve geri
    page.click('.r10me-seg button:has-text("R10 Editörü")')
    check('froala göründü', page.eval_on_selector('.fr-box', 'e => e.style.display') == '')
    fr_bb = page.evaluate("R10BB.htmlToBB(FroalaEditor.INSTANCES[0].html.get())")
    check('froalaya kayıpsız yazıldı', fr_bb == bb4, (fr_bb[-100:], bb4[-100:]))
    check('mod hatırlandı r10', page.evaluate("localStorage.getItem('r10me:mode')") == 'r10')
    page.click('.r10me-seg button:has-text("Modern Editör")')
    back = page.evaluate("FroalaEditor.INSTANCES[0].__r10me.getBB()")
    check('geri dönüşte aynı', back == bb4, (back[-100:], bb4[-100:]))

    # Tam ekran
    page.click('.r10me-btn[aria-label="Tam ekran"]')
    check('tam ekran', page.eval_on_selector('.r10me', 'e => e.classList.contains("is-full")'))
    page.screenshot(path=os.path.join(OUT, 'shot-full.png'))
    page.click('.r10me-btn[aria-label="Tam ekrandan çık"]')

    # Taslak kaydı
    page.wait_for_timeout(1300)
    draft = page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('r10me:draft:'))")
    check('taslak kaydedildi', len(draft) == 1, draft)

    # Önizleme gönderimi
    final_bb = page.evaluate("FroalaEditor.INSTANCES[0].__r10me.getBB()")
    page.click('input[name=preview]')
    page.wait_for_timeout(800)
    check('POST yakalandı', len(posted) == 1)
    if posted:
        d = posted[0]
        msgs = d.get('message', [])
        check('tek message alanı', len(msgs) == 1, msgs)
        check('gönderilen BB = editör BB', msgs and msgs[0].replace('\r\n', '\n') == final_bb, (msgs[0][-150:] if msgs else None, final_bb[-150:]))
        check('wysiwyg=0', d.get('wysiwyg') == ['0'], d.get('wysiwyg'))
        check('preview gönderildi', 'preview' in d)

    # Ctrl+Enter gönderimi (yeni sayfa yükle)
    page.goto('https://www.r10.net/newthread.php?do=newthread&f=474')
    page.wait_for_selector('.r10me:not([hidden]) .ProseMirror', timeout=15000)
    page.wait_for_timeout(300)
    page.click('.r10me .ProseMirror')
    page.keyboard.press('Control+End')
    page.keyboard.type(' ek')
    page.keyboard.press('Control+Enter')
    page.wait_for_timeout(800)
    check('Ctrl+Enter gönderdi (sbutton)', len(posted) == 2 and 'sbutton' in posted[-1], posted[-1].keys() if len(posted) == 2 else len(posted))
    if len(posted) == 2:
        check('Ctrl+Enter içerik', posted[-1]['message'][0].replace('\r\n', '\n').endswith('son satır ek'), posted[-1]['message'][0][-60:])

    # Açık tema
    night['v'] = False
    page.goto('https://www.r10.net/newthread.php?do=newthread&f=474')
    page.wait_for_selector('.r10me:not([hidden]) .ProseMirror', timeout=15000)
    check('açık tema', not page.eval_on_selector('.r10me', 'e => e.classList.contains("r10me--dark")'))
    page.wait_for_timeout(400); page.screenshot(path=os.path.join(OUT, 'shot-light.png'))

    # Devre dışı bırakma
    page.evaluate("document.documentElement.setAttribute('data-r10me','off')")
    page.wait_for_timeout(300)
    check('kapatınca froala geri', page.eval_on_selector('.fr-box', 'e => e.style.display') == '' and not page.is_visible('.r10me-switch'))

    check('JS hatası yok', not errs, errs)
    b.close()

print('\n' + ('ALL PASS' if not fails else f'{len(fails)} FAIL: {fails}'))
