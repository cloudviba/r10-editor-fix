
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
EXT=os.path.join(ROOT,'extension')
OUT=os.environ.get('R10_SHOTS','/tmp/r10-shots'); os.makedirs(OUT,exist_ok=True)
exec(open('e2e.py').read().split("with sync_playwright() as p:")[0])
INITIAL3 = '<p>merhaba , herkez yanlız <strong>cok guzel</strong> birşey yaptı.peki geliyormusun ?</p><p><br></p><p>fiyat 50tl , site example.com ve https://r10.net/a,b</p><p>[CODE]herkez , yanlız[/CODE]</p><p><br></p>'
src_html = page_html(True).replace(INITIAL.replace('&','&amp;').replace('<','&lt;'), INITIAL3.replace('&','&amp;').replace('<','&lt;'))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    page = b.new_page(viewport={'width':1280,'height':900})
    errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
    def handler(route, req):
        if req.method=='POST': posted.append(urllib.parse.parse_qs(req.post_data, keep_blank_values=True)); route.fulfill(status=200, content_type='text/html', body='ok'); return
        route.fulfill(status=200, content_type='text/html; charset=utf-8', body=src_html)
    page.route('https://www.r10.net/**', handler)
    page.goto('https://www.r10.net/newthread.php?do=newthread&f=474')
    page.wait_for_selector('.r10me:not([hidden]) .ProseMirror', timeout=15000); page.wait_for_timeout(400)
    BB = lambda: page.evaluate("FroalaEditor.INSTANCES[0].__r10me.getBB()")
    before = BB()
    page.click('.r10me-btn[aria-label^="Yazım"]'); page.wait_for_timeout(300)
    after = BB(); print(after)
    check('düzeltildi', after.startswith('Merhaba, herkes yalnız [B]çok güzel[/B] bir şey yaptı. Peki geliyor musun?'), after)
    check('TL ve korumalar', 'Fiyat 50 TL, site example.com ve https://r10.net/a,b' in after, after)
    check('kod bloğu dokunulmadı', '[CODE]herkez , yanlız[/CODE]' in after, after)
    check('kalın korundu', '[B]çok güzel[/B]' in after)
    check('vurgular görünüyor', page.eval_on_selector_all('.r10me-fixed', 'e=>e.length') > 3)
    check('panel açık', page.is_visible('.r10me-proof'))
    n = page.inner_text('.r10me-proof-head'); print('PANEL', n)
    page.wait_for_timeout(200); page.screenshot(path=os.path.join(OUT, 'shot-proof.png'))
    page.click('.r10me-proof button:has-text("Geri al")'); page.wait_for_timeout(200)
    check('geri alındı (tek adım)', BB() == before, BB())
    # seçimle sınırlı
    page.click('.r10me .ProseMirror p >> nth=0'); page.keyboard.press('Home'); page.keyboard.press('Shift+End'); page.wait_for_timeout(150)
    page.click('.r10me-btn[aria-label^="Yazım"]'); page.wait_for_timeout(200)
    a2 = BB(); check('yalnız seçim düzeltildi', a2.startswith('Merhaba, herkes') and 'fiyat 50tl' in a2, a2)
    page.keyboard.press('Escape')
    # Ctrl+Shift+Y kısayolu
    page.click('.r10me .ProseMirror p >> nth=2'); page.keyboard.press('Control+Shift+Y'); page.wait_for_timeout(200)
    check('kısayol çalıştı', 'Fiyat 50 TL' in BB(), BB())
    page.keyboard.press('Escape')
    # tekrar: düzeltilecek yok
    page.click('.r10me .ProseMirror p >> nth=0'); page.click('.r10me-btn[aria-label^="Yazım"]'); page.wait_for_timeout(200)
    check('ikinci çalıştırmada değişiklik yok', page.is_visible('.r10me-toast'), '')
    check('JS hatası yok', not errs, errs)
    b.close()
print('\n' + ('ALL PASS' if not fails else f'{len(fails)} FAIL: {fails}'))
