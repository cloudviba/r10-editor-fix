import json, re, tempfile, urllib.parse
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
EXT=os.path.join(ROOT,'extension')
OUT=os.environ.get('R10_SHOTS','/tmp/r10-shots'); os.makedirs(OUT,exist_ok=True)
exec(open('e2e_r10.py').read().split("fails=[]")[0])
FAKE2 = FAKE.replace("this.opts={heightMin:200,", "this.opts={heightMin:200, imageUploadURL:'https://api.r10.net/vb3/cdn/editor', imageUploadParam:'image', imageUploadParams:{upload:'1',time:'1',token:'t'}, imageUploadMethod:'POST', imageMaxSize:2097152, imageAllowedTypes:['png','jpg','jpeg','gif'], imageManagerLoadURL:'https://api.r10.net/vb3/cdn/editor', imageManagerLoadMethod:'POST', imageManagerLoadParams:{list:'1',time:'1',token:'t'}, imageManagerDeleteURL:'https://api.r10.net/vb3/cdn/editor', imageManagerDeleteMethod:'POST', imageManagerDeleteParams:{delete:'1',time:'1',token:'t'},")
CONTENT2='<p>metin önce <img src="https://i.r10.net/x/inline.png"> metin sonra</p>'
def page_html2():
    return page_html().replace(FAKE, FAKE2).replace(CONTENT.replace('&','&amp;').replace('<','&lt;'), CONTENT2.replace('&','&amp;').replace('<','&lt;'))
gallery=[{'url':f'//i.r10.net/u/g{i}.png'} for i in range(75)]
deleted=[]; uploads=[]
def handler2(route, req):
    u=req.url
    if u.startswith('https://api.r10.net/vb3/cdn/editor'):
        ct=req.headers.get('content-type','')
        body=req.post_data_buffer or b''
        if b'name="image"' in body: uploads.append(1); route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'https://www.r10.net','Access-Control-Allow-Credentials':'true'}, body=json.dumps({'link':'https://i.r10.net/u/yeni.png'})); return
        d=urllib.parse.parse_qs(body.decode('utf-8','replace'))
        hdr={'Access-Control-Allow-Origin':'https://www.r10.net','Access-Control-Allow-Credentials':'true'}
        if 'list' in d: route.fulfill(status=200, content_type='application/json', headers=hdr, body=json.dumps(gallery)); return
        if 'delete' in d: deleted.append(d.get('src',[''])[0]); route.fulfill(status=200, content_type='application/json', headers=hdr, body='{}'); return
        route.fulfill(status=200, content_type='application/json', headers=hdr, body='{}'); return
    if u.startswith('https://i.r10.net/'): route.fulfill(status=200, content_type='image/png', body=PNG); return
    if req.method=='GET' and 'newthread.php' in u: route.fulfill(status=200, content_type='text/html; charset=utf-8', body=page_html2()); return
    handler(route, req)
fails=[]
def check(n,c,x=''):
    print(('ok   ' if c else 'FAIL ')+n+('  -> '+str(x) if (x and not c) else ''))
    if not c: fails.append(n)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), executable_path='/usr/bin/google-chrome', headless=True,
        args=['--no-sandbox', f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', '--headless=new'], viewport={'width':1300,'height':950})
    page = ctx.new_page(); errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
    ctx.route('**/*', handler2)
    page.goto('https://www.r10.net/newthread.php?do=newthread&f=474')
    page.wait_for_selector('.r10me:not([hidden]) .r10me-img img', timeout=20000); page.wait_for_timeout(800)
    BB = lambda: page.evaluate("FroalaEditor.INSTANCES[0].__r10me.getBB()")
    # 1) satır içindeki görseli ortala -> kendi satırına alınır
    page.click('.r10me-img img'); page.wait_for_selector('.r10me-imgbar:not([hidden])')
    btns = page.eval_on_selector_all('.r10me-imgbar button:not([hidden])', 'e=>e.map(x=>x.title)')
    check('görsel menüsü: değiştir/hizala/bağlantı/sil', all(t in btns for t in ['Görseli değiştir','Sola hizala','Ortala','Sağa hizala','Bağlantı ekle / düzenle','Görseli sil']), btns)
    page.wait_for_timeout(150); page.screenshot(path=os.path.join(OUT, 'shot-imgmenu.png'))
    page.click('.r10me-imgbar button[title="Ortala"]'); page.wait_for_timeout(150)
    check('ortala -> kendi satırında', BB() == 'metin önce\n[CENTER][IMG]https://i.r10.net/x/inline.png[/IMG][/CENTER]\nmetin sonra', BB())
    check('menü açık kaldı + ortala aktif', page.is_visible('.r10me-imgbar') and 'is-active' in page.get_attribute('.r10me-imgbar button[title="Ortala"]','class'))
    page.click('.r10me-imgbar button[title="Sağa hizala"]'); page.wait_for_timeout(100)
    check('sağa hizala', '[RIGHT][IMG]https://i.r10.net/x/inline.png[/IMG][/RIGHT]' in BB(), BB())
    # 2) bağlantı
    page.click('.r10me-imgbar button[title="Bağlantı ekle / düzenle"]'); page.wait_for_selector('.r10me-pop input[type=url]')
    page.fill('.r10me-pop input[type=url]', 'r10.net/profil'); page.click('.r10me-pop button:has-text("Uygula")'); page.wait_for_timeout(150)
    check('görsel bağlantısı', '[RIGHT][URL=https://r10.net/profil][IMG]https://i.r10.net/x/inline.png[/IMG][/URL][/RIGHT]' in BB(), BB())
    check('aç/kaldır göründü', page.is_visible('.r10me-imgbar button[title="Bağlantıyı aç"]') and page.is_visible('.r10me-imgbar button[title="Bağlantıyı kaldır"]'))
    # gidiş-dönüş: R10 editörü ve geri
    page.click('.r10me-seg button:has-text("R10 Editörü")'); page.click('.r10me-seg button:has-text("Modern Editör")'); page.wait_for_timeout(200)
    check('gidiş-dönüşte bağlantı+hizalama korunur', '[RIGHT][URL=https://r10.net/profil][IMG]https://i.r10.net/x/inline.png[/IMG][/URL][/RIGHT]' in BB(), BB())
    page.click('.r10me-img img'); page.wait_for_selector('.r10me-imgbar:not([hidden])')
    page.click('.r10me-imgbar button[title="Bağlantıyı kaldır"]'); page.wait_for_timeout(100)
    check('bağlantı kaldırıldı', '[URL' not in BB(), BB())
    # 3) değiştir (genişlik korunur)
    page.click('.r10me-imgbar button:has-text("Orta")'); page.wait_for_timeout(100)
    page.click('.r10me-imgbar button[title="Görseli değiştir"]'); page.wait_for_selector('.r10me-pop input[type=url]')
    page.fill('.r10me-pop input[type=url]', 'https://i.r10.net/x/yeni2.png'); page.click('.r10me-pop button:has-text("Değiştir")'); page.wait_for_timeout(150)
    check('değiştir: yeni adres + 400px korunur', '[IMG=400]https://i.r10.net/x/yeni2.png[/IMG]' in BB(), BB())
    # 4) URL ile yeni görsel -> ortalı kendi satırı
    page.click('.r10me .ProseMirror p >> nth=-1'); page.keyboard.press('End'); page.keyboard.press('Enter')
    page.click('.r10me-btn[aria-label="Resim ekle"]'); page.fill('.r10me-pop input[type=url]', 'https://i.r10.net/x/ek.png'); page.click('.r10me-pop button:has-text("Ekle")'); page.wait_for_timeout(150)
    check('yeni görsel ortalı', BB().endswith('[CENTER][IMG]https://i.r10.net/x/ek.png[/IMG][/CENTER]'), BB()[-90:])
    # 5) galeri
    page.click('.r10me-btn[aria-label="Resim ekle"]'); page.click('.r10me-pop button:has-text("Yüklediklerim")'); page.wait_for_selector('.r10me-gal-item')
    n = page.eval_on_selector_all('.r10me-gal-item', 'e=>e.length'); check('galeri ilk sayfa 60', n == 60, n)
    check('galeri sayacı', '75 görsel' in page.inner_text('.r10me-modal-foot'))
    page.wait_for_timeout(200); page.screenshot(path=os.path.join(OUT, 'shot-gallery.png'))
    page.hover('.r10me-gal-item >> nth=0'); page.click('.r10me-gal-item >> nth=0 >> .r10me-gal-del'); page.click('.r10me-gal-item >> nth=0 >> .r10me-gal-del.is-armed'); page.wait_for_timeout(300)
    check('galeriden silme isteği', deleted == ['//i.r10.net/u/g74.png'], deleted)
    page.click('.r10me-gal-item >> nth=0'); page.wait_for_timeout(200)
    check('galeriden eklendi (ortalı, ayrı satır)', BB().endswith('\n[IMG]https://i.r10.net/u/g73.png[/IMG][/CENTER]') and '[CENTER][IMG]https://i.r10.net/x/ek.png' in BB(), BB()[-120:])
    # 6) yükleme -> ortalı
    page.click('.r10me-btn[aria-label="Resim ekle"]')
    page.set_input_files('.r10me-pop input[type=file]', os.path.join(os.path.dirname(__file__), 'fixture.png')); page.wait_for_timeout(1200)
    check('yüklenen görsel ortalı eklendi', uploads and BB().endswith('\n[IMG]https://i.r10.net/u/yeni.png[/IMG][/CENTER]'), BB()[-120:])
    final = BB(); page.click('input[name=preview]'); page.wait_for_timeout(800)
    check('gönderim BB', posted and posted[-1]['message'][0].replace('\r\n','\n') == final, posted[-1]['message'][0][-150:] if posted else None)
    check('JS hatası yok', not errs, errs)
    ctx.close()
print('\n'+('ALL PASS' if not fails else f'{len(fails)} FAIL: {fails}'))
