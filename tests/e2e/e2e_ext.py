import json, re, tempfile, urllib.parse, time
from playwright.sync_api import sync_playwright
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
EXT=os.path.join(ROOT,'extension')
OUT=os.environ.get('R10_SHOTS','/tmp/r10-shots'); os.makedirs(OUT,exist_ok=True)
FAKE = open('e2e.py').read().split('FAKE = r"""')[1].split('"""')[0]
CONTENT = ('<p>merhaba , herkez yanlız <strong>cok guzel</strong> birşey yaptı.peki geliyormusun ?</p><p><br></p>'
           '<p>siparisiniz onaylandiktan sonra kargoya verilir</p><p>Bu ürün önceliklidr ve miktarı yetrli değil</p>'
           '<p>Ahmet Bey ve Acme ekibi kitablarınızı inceler</p><p>[CODE]herkez , yanlız[/CODE]</p>')
def page_html():
    ta = CONTENT.replace('&','&amp;').replace('<','&lt;')
    return f"""<!doctype html><html><head><meta charset="utf-8"></head><body class="night orange" style="background:#383b50;color:#ddd;font-family:Arial;padding:24px">
<form action="/newthread.php" method="post"><input type="hidden" name="wysiwyg" value="0"><input type="text" name="subject" value="Test">
<div><textarea name="message" id="vB_Editor_001_editor">{ta}</textarea></div>
<input type="submit" name="sbutton" value="Konuyu Aç"> <input type="submit" name="preview" value="Önizleme"></form>
<script>{FAKE}</script></body></html>"""
fails=[]; posted=[]
def check(n,c,x=''):
    print(('ok   ' if c else 'FAIL ')+n+('  -> '+str(x) if (x and not c) else '')); 
    if not c: fails.append(n)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), executable_path='/usr/bin/google-chrome', headless=True,
        args=['--no-sandbox', f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', '--headless=new'], viewport={'width':1300,'height':950})
    page = ctx.new_page()
    errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
    def handler(route, req):
        if req.method=='POST': posted.append(urllib.parse.parse_qs(req.post_data, keep_blank_values=True)); route.fulfill(status=200, content_type='text/html', body='ok'); return
        route.fulfill(status=200, content_type='text/html; charset=utf-8', body=page_html())
    page.route('https://www.r10.net/**', handler)
    page.goto('https://www.r10.net/newthread.php?do=newthread&f=474')
    page.wait_for_selector('.r10me:not([hidden]) .ProseMirror', timeout=20000); page.wait_for_timeout(500)
    check('eklenti içerik betikleri yüklendi', page.evaluate("!!window.R10BB && !!window.R10ModernEditor && document.documentElement.getAttribute('data-r10spell')==='on'"))
    BB = lambda: page.evaluate("FroalaEditor.INSTANCES[0].__r10me.getBB()")
    t=time.time()
    page.click('.r10me-btn[aria-label^="Yazım"]')
    page.wait_for_selector('.r10me-proof', timeout=60000)
    print('süre', round(time.time()-t,1),'sn')
    bb = BB(); print(bb)
    check('kurallar + sözlük', bb.startswith('Merhaba, herkes yalnız [B]çok güzel[/B] bir şey yaptı. Peki geliyor musun?'), bb)
    check('ascii satır düzeldi', 'Siparişiniz onaylandıktan sonra kargoya verilir' in bb, bb)
    check('önceliklidr -> önceliklidir', 'önceliklidir' in bb, bb)
    check('kitablarınız -> kitaplarınız', 'kitaplarınızı' in bb, bb)
    check('özel adlar korunuyor', 'Ahmet Bey ve Acme' in bb, bb)
    check('kod bloğu korunuyor', '[CODE]herkez , yanlız[/CODE]' in bb, bb)
    marks = page.eval_on_selector_all('.r10me-misspell', 'e=>e.map(x=>x.textContent)')
    check('şüpheli kelime işaretlendi (yetrli)', 'yetrli' in marks, marks)
    check('panelde kontrol listesi', page.is_visible('.r10me-flag-row'))
    page.wait_for_timeout(300); page.screenshot(path=os.path.join(OUT, 'shot-spell-panel.png'))
    page.keyboard.press('Escape')
    # altı çizili kelimeye tıkla -> öneri
    page.click('.r10me-misspell:has-text("yetrli")'); page.wait_for_selector('.r10me-spell-pop', timeout=5000)
    page.wait_for_timeout(250); page.screenshot(path=os.path.join(OUT, 'shot-spell-pop.png'))
    chips = page.eval_on_selector_all('.r10me-spell-pop .r10me-chip', 'e=>e.map(x=>x.textContent)')
    check('öneriler içinde yeterli', 'yeterli' in chips, chips)
    page.click('.r10me-spell-pop .r10me-chip:has-text("yeterli")'); page.wait_for_timeout(200)
    check('öneri uygulandı', 'miktarı yeterli değil' in BB(), BB())
    check('işaret kalktı', 'yetrli' not in page.eval_on_selector_all('.r10me-misspell', 'e=>e.map(x=>x.textContent)'))
    # sözlüğe ekle
    rest = page.eval_on_selector_all('.r10me-misspell', 'e=>e.map(x=>x.textContent)')
    if rest:
        w = rest[0]; page.click(f'.r10me-misspell >> nth=0'); page.wait_for_selector('.r10me-spell-pop')
        page.click('.r10me-spell-pop button:has-text("Sözlüğe ekle")'); page.wait_for_timeout(200)
        check('sözlüğe eklenen işaret kalktı', w not in page.eval_on_selector_all('.r10me-misspell', 'e=>e.map(x=>x.textContent)'))
    # tekrar çalıştır: yeni düzeltme yok
    page.click('.r10me-btn[aria-label^="Yazım"]'); page.wait_for_timeout(4000)
    check('ikinci denetim temiz', page.is_visible('.r10me-toast') or page.eval_on_selector_all('.r10me-proof-row','e=>e.length')==0)
    # geri al tek adım (yeniden yükle ve dene)
    # gönderim
    final = BB(); page.click('input[name=preview]'); page.wait_for_timeout(800)
    check('gönderim BB', posted and posted[-1]['message'][0].replace('\r\n','\n') == final, (posted[-1]['message'][0][-120:] if posted else None))
    check('JS hatası yok', not errs, errs)
    ctx.close()
print('\n'+('ALL PASS' if not fails else f'{len(fails)} FAIL: {fails}'))
