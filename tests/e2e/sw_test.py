import json, time, tempfile
from playwright.sync_api import sync_playwright
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
EXT=os.path.join(ROOT,'extension')
OUT=os.environ.get('R10_SHOTS','/tmp/r10-shots'); os.makedirs(OUT,exist_ok=True)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), executable_path='/usr/bin/google-chrome', headless=True,
        args=['--no-sandbox', f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', '--headless=new'])
    page = ctx.new_page()
    page.route('https://www.r10.net/**', lambda r,q: r.fulfill(status=200, content_type='text/html; charset=utf-8', body='<!doctype html><html><body>test</body></html>'))
    page.goto('https://www.r10.net/test.php')
    page.wait_for_timeout(1500)
    print('attrs', page.evaluate("[document.documentElement.getAttribute('data-r10fix'), document.documentElement.getAttribute('data-r10spell'), !!window.R10BB, !!window.R10ModernEditor]"))
    t=time.time()
    res = page.evaluate("""() => new Promise(res => {
      const id = 'x1';
      window.addEventListener('message', e => { if (e.data && e.data.__r10spell === 'res' && e.data.id === id) res(e.data.res); });
      window.postMessage({ __r10spell: 'req', id, payload: { suggest: true, words: [
        {w:'herkes'},{w:'guzel', alts:['güzel']},{w:'önceliklidr'},{w:'kitablarınız'},{w:'geliyormusun'},{w:'alicam'},{w:'kitaplarımızdan'}] } }, location.origin);
    })""")
    print('elapsed', round(time.time()-t,2)); print(json.dumps(res, ensure_ascii=False, indent=1))
    sw = [w.url for w in ctx.service_workers]; print('sw', sw)
    ctx.close()
