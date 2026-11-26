
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
EXT=os.path.join(ROOT,'extension')
OUT=os.environ.get('R10_SHOTS','/tmp/r10-shots'); os.makedirs(OUT,exist_ok=True)
exec(open('e2e.py').read().split("with sync_playwright() as p:")[0])
INITIAL2 = '<p>Önce</p><p><img src="https://www.r10.net/test.png" class="fr-fic fr-dii" style="width: 300px;"></p><p>Sonra</p>'
src_html = page_html(True).replace(INITIAL.replace('&','&amp;').replace('<','&lt;'), INITIAL2.replace('&','&amp;').replace('<','&lt;'))
png = open(os.path.join(os.path.dirname(__file__), 'fixture.png'),'rb').read()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    page = b.new_page(viewport={'width':1280,'height':900})
    errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
    def handler(route, req):
        if req.url.endswith('/test.png'): route.fulfill(status=200, content_type='image/png', body=png); return
        if req.method=='POST': posted.append(urllib.parse.parse_qs(req.post_data, keep_blank_values=True)); route.fulfill(status=200, content_type='text/html', body='ok'); return
        route.fulfill(status=200, content_type='text/html; charset=utf-8', body=src_html)
    page.route('https://www.r10.net/**', handler)
    page.goto('https://www.r10.net/newthread.php?do=newthread&f=474')
    page.wait_for_selector('.r10me:not([hidden]) .r10me-img img', timeout=15000); page.wait_for_timeout(400)
    BB = lambda: page.evaluate("FroalaEditor.INSTANCES[0].__r10me.getBB()")
    check('froala görsel genişliği aktarıldı', '[IMG=300]https://www.r10.net/test.png[/IMG]' in BB(), BB())
    w = page.eval_on_selector('.r10me-img img', 'e => Math.round(e.getBoundingClientRect().width)')
    check('editörde 300px görünüyor', abs(w-300) <= 2, w)
    # seç
    page.click('.r10me-img img'); page.wait_for_timeout(200)
    check('tutamaçlar görünür', page.is_visible('.r10me-img-h-se'))
    check('boyut çubuğu görünür', page.is_visible('.r10me-imgbar'))
    page.screenshot(path=os.path.join(OUT, 'shot-img-selected.png'))
    # sürükle: se tutamacını 150px sağa
    box = page.query_selector('.r10me-img-h-se').bounding_box()
    page.mouse.move(box['x']+6, box['y']+6); page.mouse.down(); page.mouse.move(box['x']+156, box['y']+80, steps=8); page.mouse.up()
    page.wait_for_timeout(200)
    bb = BB(); check('sürükleyerek 450px', '[IMG=450]' in bb, bb)
    # sol tutamaç: 100px sağa (küçült)
    box = page.query_selector('.r10me-img-h-sw').bounding_box()
    page.mouse.move(box['x']+6, box['y']+6); page.mouse.down(); page.mouse.move(box['x']+106, box['y']+6, steps=6); page.mouse.up()
    page.wait_for_timeout(200)
    bb = BB(); check('sol tutamaçla 350px', '[IMG=350]' in bb, bb)
    # hazır boyut
    page.click('.r10me-imgbar button:has-text("Küçük")'); page.wait_for_timeout(150)
    bb = BB(); check('hazır Küçük 200px', '[IMG=200]' in bb, bb)
    # sayı girişi
    page.fill('.r10me-imgbar input', '520'); page.press('.r10me-imgbar input', 'Enter'); page.wait_for_timeout(150)
    bb = BB(); check('elle 520px', '[IMG=520]' in bb, bb)
    page.wait_for_timeout(150); page.screenshot(path=os.path.join(OUT, 'shot-img-resized.png'))
    # orijinal
    page.click('.r10me-imgbar button:has-text("Orijinal")'); page.wait_for_timeout(150)
    bb = BB(); check('orijinal -> [IMG]', '[IMG]https://www.r10.net/test.png[/IMG]' in bb, bb)
    # tam genişlik sınırı
    page.click('.r10me-imgbar button:has-text("Tam")'); page.wait_for_timeout(150)
    bb = BB(); m = re.search(r'\[IMG=(\d+)\]', bb); check('tam genişlik değeri', m and 900 < int(m.group(1)) < 1200, bb)
    # yeni görsel ekleme (URL)
    page.click('.r10me .ProseMirror p:last-child'); page.keyboard.press('End')
    page.click('.r10me-btn[aria-label="Resim ekle"]'); page.fill('.r10me-pop input[type=url]', 'https://www.r10.net/test.png'); page.click('.r10me-pop button:has-text("Ekle")')
    page.wait_for_timeout(300)
    check('ikinci görsel eklendi', page.eval_on_selector_all('.r10me-img', 'e => e.length') == 2)
    page.click('.r10me-img >> nth=1'); page.wait_for_timeout(150)
    page.click('.r10me-imgbar button:has-text("Orta")'); page.wait_for_timeout(150)
    bb = BB(); check('ikinci görsel 400px', '[IMG=400]' in bb, bb)
    # R10 editörüne geç ve geri
    page.click('.r10me-seg button:has-text("R10 Editörü")')
    fr = page.evaluate("FroalaEditor.INSTANCES[0].html.get()")
    check('froalada genişlik', 'width: 400px' in fr, fr)
    page.click('.r10me-seg button:has-text("Modern Editör")')
    check('geri dönüşte aynı', BB() == bb, (BB(), bb))
    # gönder
    page.on('request', lambda r: print('REQ', r.method, r.url[:60]) if r.method=='POST' else None)
    page.on('console', lambda m: print('CONSOLE', m.type, m.text[:200]))
    print('preview box', page.query_selector('input[name=preview]').bounding_box())
    page.click('input[name=preview]'); page.wait_for_timeout(1500)
    print('url now', page.url)
    print('POSTED', len(posted), [list(x.keys()) for x in posted]); print(posted[-1]['message'][0] if posted else '')
    check('gönderimde [IMG=400]', posted and '[IMG=400]' in posted[-1]['message'][0], posted[-1]['message'][0] if posted else None)
    check('JS hatası yok', not errs, errs)
    b.close()
print('\n' + ('ALL PASS' if not fails else f'{len(fails)} FAIL: {fails}'))
