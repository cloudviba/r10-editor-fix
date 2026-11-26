
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
EXT=os.path.join(ROOT,'extension')
OUT=os.environ.get('R10_SHOTS','/tmp/r10-shots'); os.makedirs(OUT,exist_ok=True)
exec(open('e2e_imgmenu.py').read().split("fails=[]\ndef check")[0])
fails=[]
def check(n,c,x=''):
    print(('ok   ' if c else 'FAIL ')+n+('  -> '+str(x) if (x and not c) else ''))
    if not c: fails.append(n)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), executable_path='/usr/bin/google-chrome', headless=True,
        args=['--no-sandbox', f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', '--headless=new'], viewport={'width':1300,'height':950})
    page = ctx.new_page(); errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
    ctx.route('**/*', handler2)
    page.goto('https://www.r10.net/newthread.php?do=newthread&f=474'); page.wait_for_selector('.r10me:not([hidden]) .r10me-img img', timeout=20000); page.wait_for_timeout(800)
    BB = lambda: page.evaluate("FroalaEditor.INSTANCES[0].__r10me.getBB()")
    sel = lambda: page.evaluate("(()=>{const s=FroalaEditor.INSTANCES[0].__r10me.editor.state.selection; return s.node ? s.node.type.name+':'+s.node.attrs.src : 'text'})()")
    def handles_visible():
        return page.evaluate("(()=>{const e=document.querySelector('.r10me-img.is-selected'); if(!e) return false; const h=e.querySelector('.r10me-img-h-se'); return getComputedStyle(h).display!=='none'})()")
    page.click('.r10me .ProseMirror p >> nth=-1'); page.keyboard.press('End'); page.keyboard.press('Enter')
    # URL ile ekle
    page.click('.r10me-btn[aria-label="Resim ekle"]'); page.fill('.r10me-pop input[type=url]', 'https://i.r10.net/x/a1.png'); page.click('.r10me-pop button:has-text("Ekle")'); page.wait_for_timeout(300)
    check('URL ekleme: görsel seçili', sel() == 'image:https://i.r10.net/x/a1.png', sel())
    check('URL ekleme: tutamaçlar görünür', handles_visible())
    check('URL ekleme: görsel menüsü açık', page.is_visible('.r10me-imgbar'))
    page.wait_for_timeout(150); page.screenshot(path=os.path.join(OUT, 'shot-autosel.png'))
    # seçiliyken yazı yazmak görseli silmemeli
    page.keyboard.type('yazı'); page.wait_for_timeout(100)
    check('seçiliyken yazınca görsel kalır', '[IMG]https://i.r10.net/x/a1.png[/IMG]' in BB() and 'yazı' in BB(), BB()[-120:])
    # Enter da silmemeli
    page.click('.r10me-img img >> nth=-1'); page.wait_for_timeout(100); page.keyboard.press('Enter'); page.keyboard.type('alt satır')
    check('seçiliyken Enter görseli silmez', '[IMG]https://i.r10.net/x/a1.png[/IMG]' in BB() and 'alt satır' in BB(), BB()[-120:])
    # Backspace siler
    page.click('.r10me-img img >> nth=-1'); page.wait_for_timeout(100); page.keyboard.press('Backspace'); page.wait_for_timeout(100)
    check('seçiliyken Backspace görseli siler', 'a1.png' not in BB(), BB()[-120:])
    # Galeri
    page.click('.r10me .ProseMirror p >> nth=-1'); page.keyboard.press('End'); page.keyboard.press('Enter')
    page.click('.r10me-btn[aria-label="Resim ekle"]'); page.click('.r10me-pop button:has-text("Yüklediklerim")'); page.wait_for_selector('.r10me-gal-item'); page.click('.r10me-gal-item >> nth=3'); page.wait_for_timeout(300)
    check('galeri: görsel seçili + tutamaçlar', sel().startswith('image:https://i.r10.net/u/g') and handles_visible(), sel())
    # Yükleme
    page.keyboard.press('ArrowRight'); page.keyboard.press('Enter')
    page.click('.r10me-btn[aria-label="Resim ekle"]'); page.set_input_files('.r10me-pop input[type=file]', os.path.join(os.path.dirname(__file__), 'fixture.png')); page.wait_for_timeout(1200)
    check('yükleme: görsel seçili + tutamaçlar', sel() == 'image:https://i.r10.net/u/yeni.png' and handles_visible(), sel())
    # GIF
    page.keyboard.press('ArrowRight'); page.keyboard.press('Enter')
    page.click('.r10me-btn[aria-label="GIF"]'); page.wait_for_selector('.r10me-gifs button'); page.click('.r10me-gifs button >> nth=2'); page.wait_for_timeout(300)
    check('GIF: görsel seçili + tutamaçlar', sel() == 'image:https://cdn.r10.net/gifs/3.gif' and handles_visible(), sel())
    # Tutamaçla hemen boyutlandırma
    box = page.query_selector('.r10me-img.is-selected .r10me-img-h-se').bounding_box()
    page.mouse.move(box['x']+6, box['y']+6); page.mouse.down(); page.mouse.move(box['x']-200, box['y']+6, steps=6); page.mouse.up(); page.wait_for_timeout(150)
    check('eklenir eklenmez boyutlandırılabilir', '[IMG=' in BB() and '/gifs/3.gif' in BB(), BB()[-120:])
    # Seçili görsel varken yeni görsel/emoji/GIF eklemek onu silmemeli
    before = BB().count('[IMG')
    page.click('.r10me-img img >> nth=0'); page.wait_for_timeout(100)
    page.click('.r10me-btn[aria-label="Resim ekle"]'); page.fill('.r10me-pop input[type=url]', 'https://i.r10.net/x/b2.png'); page.click('.r10me-pop button:has-text("Ekle")'); page.wait_for_timeout(200)
    check('seçili görsel varken ekleme: ikisi de kalır', BB().count('[IMG') == before + 1 and 'b2.png' in BB(), BB()[-200:])
    page.click('.r10me-btn[aria-label="GIF"]'); page.wait_for_selector('.r10me-gifs button'); page.click('.r10me-gifs button >> nth=4'); page.wait_for_timeout(200)
    check('seçili görselken GIF ekleme: önceki kalır', 'b2.png' in BB() and '/gifs/5.gif' in BB(), BB()[-200:])
    page.click('.r10me-btn[aria-label="Emoji"]'); page.click('.r10me-ptabs button:has-text("Rokito")'); page.click('.r10me-emoji-img button >> nth=0'); page.wait_for_timeout(150)
    check('seçili GIF varken emoji: GIF kalır', '/gifs/5.gif' in BB() and ':r1:' in BB(), BB()[-200:])
    check('JS hatası yok', not errs, errs)
    ctx.close()
print('\n'+('ALL PASS' if not fails else f'{len(fails)} FAIL: {fails}'))
