import json, re, tempfile, urllib.parse, time, html as H
from playwright.sync_api import sync_playwright
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
EXT=os.path.join(ROOT,'extension')
OUT=os.environ.get('R10_SHOTS','/tmp/r10-shots'); os.makedirs(OUT,exist_ok=True)
PNG=open(os.path.join(os.path.dirname(__file__), 'fixture.png'),'rb').read()
FAKE = open('e2e.py').read().split('FAKE = r"""')[1].split('"""')[0]
FAKE = FAKE.replace("this.opts={heightMin:200};", "this.opts={heightMin:200, emoticonsSet:[{id:'1',category:'Genel',code:'//cdn.r10.net/emojis/smile.png',desc:'Gülümseme'},{id:'2',category:'Genel',code:'//cdn.r10.net/emojis/grin.png',desc:'Sırıtma'},{id:'73',category:'Rokito',code:'//cdn.r10.net/emojis/r1.gif',desc:'Rokito 1'},{id:'74',category:'Rokito',code:'//cdn.r10.net/emojis/r2.gif',desc:'Rokito 2'}]};")
SMAP={'1':':)','2':':D','73':':r1:','74':':r2:'}
CONTENT='<p>selam :r1: naber :)</p><p>ikinci satır</p>'
def page_html():
    ta = CONTENT.replace('&','&amp;').replace('<','&lt;')
    return f"""<!doctype html><html><head><meta charset="utf-8"><script>window.SECURITYTOKEN='tok123';window.ajaxBase='https://www.r10.net/';</script></head>
<body class="night orange" style="background:#383b50;color:#ddd;font-family:Arial;padding:24px">
<form action="/newthread.php" method="post"><input type="hidden" name="wysiwyg" value="0"><input type="text" name="subject" value="Test">
<div><textarea name="message" id="vB_Editor_001_editor">{ta}</textarea></div>
<input type="submit" name="sbutton" value="Konuyu Aç"> <input type="submit" name="preview" value="Önizleme"></form>
<script>{FAKE}</script></body></html>"""
store={'next':1,'items':[]}; posted=[]; calls=[]
def replies_xml():
    out='<?xml version="1.0" encoding="utf-8"?>\n<cevaplar>'
    for it in store['items']: out+=f"<cevap><id>{it['id']}</id><baslik>{H.escape(it['title'])}</baslik><mesaj>{H.escape(it['msg'])}</mesaj></cevap>"
    return out+'</cevaplar>'
def handler(route, req):
    u=req.url
    if u.startswith('https://cdn.r10.net/') or 'giphy.com/media' in u: route.fulfill(status=200, content_type='image/png', body=PNG); return
    if u.startswith('https://api.r10.net/vb3/giphy'):
        q=urllib.parse.parse_qs(urllib.parse.urlparse(u).query); calls.append(('giphy',q))
        pre=q.get('q',['trend'])[0]; p=q.get('p',['1'])[0]
        route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'*'}, body=json.dumps([{'id':f'{pre}{p}x{i}','name':f'{pre} {i}'} for i in range(6)])); return
    if '/ajax.php' in u and req.method=='POST':
        d=urllib.parse.parse_qs(req.post_data, keep_blank_values=True); act=d.get('do',[''])[0]; calls.append((act,d))
        if act=='editorswitchmodern':
            msg=d['message'][0]
            bb=re.sub(r'<p>⟦(\d+)⟧<span[^>]*smilieid="(\d+)"[^>]*>(&nbsp;|\xa0)</span></p>', lambda m: f'⟦{m.group(1)}⟧ {SMAP.get(m.group(2),"")}\n', msg)
            route.fulfill(status=200, content_type='text/xml', body=f'<?xml version="1.0" encoding="utf-8"?>\n<message><![CDATA[{bb}]]></message>'); return
        if act=='hazirCevaplar': route.fulfill(status=200, content_type='text/xml', body=replies_xml()); return
        if act=='hazirCevapIslem':
            if d.get('i',[''])[0]=='1': store['items']=[x for x in store['items'] if x['id']!=d['id'][0]]
            elif 'id' in d:
                for x in store['items']:
                    if x['id']==d['id'][0]: x['title']=d['title'][0]; x['msg']=d['response'][0]
            else: store['items'].append({'id':str(store['next']),'title':d['title'][0],'msg':d['response'][0]}); store['next']+=1
            route.fulfill(status=200, content_type='text/xml', body=replies_xml()); return
        if act=='uyeArama':
            fr=d['fragment'][0]; users=[('11','ornek'),('12','ornekuye'),('13','ahmet')]
            body='<?xml version="1.0"?><users>'+''.join(f'<user><userid>{i}</userid><username>{n}</username><musername>{n}</musername></user>' for i,n in users if fr.lower() in n)+'</users>'
            route.fulfill(status=200, content_type='text/xml', body=body); return
        route.fulfill(status=200, content_type='text/xml', body='<x/>'); return
    if req.method=='POST': posted.append(urllib.parse.parse_qs(req.post_data, keep_blank_values=True)); route.fulfill(status=200, content_type='text/html', body='ok'); return
    route.fulfill(status=200, content_type='text/html; charset=utf-8', body=page_html())
fails=[]
def check(n,c,x=''):
    print(('ok   ' if c else 'FAIL ')+n+('  -> '+str(x) if (x and not c) else ''))
    if not c: fails.append(n)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), executable_path='/usr/bin/google-chrome', headless=True,
        args=['--no-sandbox', f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', '--headless=new'], viewport={'width':1300,'height':950})
    page = ctx.new_page(); errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
    ctx.route('**/*', handler)
    page.goto('https://www.r10.net/newthread.php?do=newthread&f=474')
    page.wait_for_selector('.r10me:not([hidden]) .ProseMirror', timeout=20000); page.wait_for_timeout(1200)
    BB = lambda: page.evaluate("FroalaEditor.INSTANCES[0].__r10me.getBB()")
    # 1) emoji kodları görsel
    n = page.eval_on_selector_all('.r10me .ProseMirror img.r10me-smilie', 'e=>e.length')
    check('emoji kodları görsele dönüştü', n == 2, n)
    check('BB kodları koruyor', BB().startswith('selam :r1: naber :)'), BB())
    # 2) emoji paneli
    page.click('.r10me .ProseMirror p >> nth=1'); page.keyboard.press('End')
    page.click('.r10me-btn[aria-label="Emoji"]'); page.wait_for_selector('.r10me-ptabs')
    tabs = page.eval_on_selector_all('.r10me-ptabs button', 'e=>e.map(x=>x.textContent)')
    check('emoji sekmeleri', tabs == ['Rokito','Genel','Emoji'], tabs)
    page.wait_for_timeout(200); page.screenshot(path=os.path.join(OUT, 'shot-emoji.png'))
    page.click('.r10me-emoji-img button >> nth=1'); page.wait_for_timeout(150)
    check('rokito emoji eklendi', 'ikinci satır :r2:' in BB(), BB())
    page.keyboard.press('Escape')
    # 3) GIF
    page.click('.r10me-btn[aria-label="GIF"]'); page.wait_for_selector('.r10me-gifs button')
    page.click('.r10me-gifs button >> nth=0'); page.wait_for_timeout(200)
    check('rokito GIF eklendi', '[IMG]https://cdn.r10.net/gifs/1.gif[/IMG]' in BB(), BB())
    page.click('.r10me-btn[aria-label="GIF"]'); page.click('.r10me-ptabs button:has-text("Giphy")')
    page.wait_for_selector('.r10me-gifs button img[src*="giphy.com"]', timeout=8000)
    page.fill('.r10me-gif-search', 'kedi'); page.wait_for_timeout(900)
    check('giphy arama isteği', any(c[0]=='giphy' and c[1].get('q')==['kedi'] for c in calls), [c for c in calls if c[0]=='giphy'])
    page.wait_for_timeout(200); page.screenshot(path=os.path.join(OUT, 'shot-gif.png'))
    page.click('.r10me-gifs button >> nth=0'); page.wait_for_timeout(200)
    check('giphy GIF eklendi', '[IMG]https://media3.giphy.com/media/kedi1x0/200.gif[/IMG]' in BB(), BB()[-200:])
    # 4) kod menüsü
    page.click('.r10me .ProseMirror p >> nth=-1'); page.keyboard.press('End'); page.keyboard.press('Enter')
    print('SEL', page.evaluate("(()=>{const s=FroalaEditor.INSTANCES[0].__r10me.editor.state.selection;return [s.constructor.name||'', s.from, s.to, s.empty]})()"))
    page.click('.r10me-btn[aria-label="Kod bloğu"]'); page.wait_for_selector('.r10me-pop .r10me-item'); print('ITEMS', page.eval_on_selector_all('.r10me-pop .r10me-item','e=>e.map(x=>x.textContent)'))
    page.click('.r10me-pop .r10me-item:has-text("CSS")'); page.wait_for_timeout(100); print('AFTER', repr(BB()[-120:]))
    check('CSS kod etiketi', '[CSSR][/CSSR]' in BB(), BB()[-80:])
    page.keyboard.press('End'); page.keyboard.press('Enter')
    # 5) @etiketleme
    page.keyboard.type('Merhaba @orn'); page.wait_for_selector('.r10me-mention-item', timeout=6000)
    items = page.eval_on_selector_all('.r10me-mention-item', 'e=>e.map(x=>x.textContent)')
    check('etiket önerileri', items[:2] == ['ornek','ornekuye'], items)
    page.wait_for_timeout(150); page.screenshot(path=os.path.join(OUT, 'shot-mention.png'))
    page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); page.wait_for_timeout(150)
    check('etiket eklendi', 'Merhaba @ornekuye;' in BB(), BB()[-60:])
    # 6) Hazır cevaplar
    page.click('.r10me-btn[aria-label="Hazır Cevaplarım"]'); page.wait_for_selector('.r10me-modal')
    page.wait_for_selector('.r10me-empty'); check('boş liste mesajı', 'Henüz' in page.inner_text('.r10me-replies'))
    page.click('.r10me-modal button:has-text("Yeni cevap oluştur")'); page.wait_for_selector('.r10me-modal >> nth=1')
    page.fill('.r10me-modal >> nth=1 >> input', 'Teşekkür'); page.fill('.r10me-modal >> nth=1 >> textarea', 'İlginiz için teşekkürler, [B]iyi çalışmalar[/B]!')
    page.click('.r10me-modal >> nth=1 >> button:has-text("Ekle")'); page.wait_for_timeout(400)
    check('cevap oluşturuldu', store['items'] and store['items'][0]['title']=='Teşekkür', store)
    check('listede görünüyor', 'Teşekkür' in page.inner_text('.r10me-replies'))
    page.wait_for_timeout(150); page.screenshot(path=os.path.join(OUT, 'shot-replies.png'))
    page.click('.r10me-reply .r10me-icbtn[title="Düzenle"]'); page.wait_for_selector('.r10me-modal >> nth=1')
    page.fill('.r10me-modal >> nth=1 >> input', 'Teşekkür 2'); page.click('.r10me-modal >> nth=1 >> button:has-text("Kaydet")'); page.wait_for_timeout(400)
    check('cevap düzenlendi', store['items'][0]['title']=='Teşekkür 2', store)
    page.click('.r10me-reply'); page.wait_for_timeout(300)
    check('cevap editöre eklendi', '[B]iyi çalışmalar[/B]' in BB(), BB()[-120:])
    page.click('.r10me-btn[aria-label="Hazır Cevaplarım"]'); page.wait_for_selector('.r10me-reply')
    page.click('.r10me-reply .r10me-icbtn[title="Sil"]'); page.click('.r10me-reply .r10me-icbtn.is-armed'); page.wait_for_timeout(400)
    check('cevap silindi', store['items']==[], store)
    page.keyboard.press('Escape')
    # 7) Markdown
    page.click('.r10me-btn[aria-label="Markdown ekle"]'); page.wait_for_selector('.r10me-md-input')
    page.fill('.r10me-md-input', '## Başlık\n\n**kalın** ve *italik* [link](https://r10.net)\n\n- bir\n- iki\n\n> alıntı\n\n```php\n<?php echo 1; ?>\n```')
    page.wait_for_timeout(400)
    check('markdown önizleme', 'Başlık' in page.inner_text('.r10me-md-preview'))
    page.screenshot(path=os.path.join(OUT, 'shot-md.png'))
    page.click('.r10me-modal button:has-text("Ekle")'); page.wait_for_timeout(300)
    bb = BB(); print(bb[-260:])
    for frag in ['[SIZE=5][B]Başlık[/B][/SIZE]', '[B]kalın[/B] ve', '[I]italik [/I]', '[URL=https://r10.net]link[/URL]', '[LIST]\n[*]bir\n[*]iki\n[/LIST]', '[QUOTE]alıntı[/QUOTE]', '[PHPR]<?php echo 1; ?>[/PHPR]']:
        check('markdown: '+frag.replace('\n','⏎')[:30], frag in bb, '')
    # 8) gönderim (modern)
    final = BB(); page.click('input[name=preview]'); page.wait_for_timeout(800)
    check('gönderim BB', posted and posted[-1]['message'][0].replace('\r\n','\n') == final, posted[-1]['message'][0][-150:] if posted else None)
    check('JS hatası yok', not errs, errs)
    ctx.close()
    # 9) R10 editörü modunda emoji (Froala span) gönderimi
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), executable_path='/usr/bin/google-chrome', headless=True,
        args=['--no-sandbox', f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', '--headless=new'])
    page = ctx.new_page(); ctx.route('**/*', handler)
    page.goto('https://www.r10.net/newthread.php?do=newthread&f=474'); page.wait_for_selector('.r10me-switch', timeout=20000); page.wait_for_timeout(1000)
    page.click('.r10me-seg button:has-text("R10 Editörü")')
    page.evaluate("""FroalaEditor.INSTANCES[0].html.set('<p>naber <span class="fr-emoticon emojiImg fr-deletable fr-emoticon-img" style="background: url(\\'//cdn.r10.net/emojis/r1.gif\\');" smilieid="73">&nbsp;</span>&nbsp;tamam</p>')""")
    page.click('input[name=preview]'); page.wait_for_timeout(800)
    check('R10 modunda emoji korunuyor', posted and posted[-1]['message'][0] == 'naber :r1: tamam', posted[-1]['message'][0] if posted else None)
    ctx.close()
print('\n'+('ALL PASS' if not fails else f'{len(fails)} FAIL: {fails}'))
