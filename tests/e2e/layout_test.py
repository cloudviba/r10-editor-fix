
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
EXT=os.path.join(ROOT,'extension')
OUT=os.environ.get('R10_SHOTS','/tmp/r10-shots'); os.makedirs(OUT,exist_ok=True)
exec(open('e2e_r10.py').read().split("fails=[]")[0])
import tempfile
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), executable_path='/usr/bin/google-chrome', headless=True,
        args=['--no-sandbox', f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', '--headless=new'], viewport={'width':1300,'height':950})
    page = ctx.new_page(); ctx.route('**/*', handler)
    page.goto('https://www.r10.net/newthread.php?do=newthread&f=474'); page.wait_for_selector('.r10me:not([hidden]) .ProseMirror', timeout=20000); page.wait_for_timeout(800)
    res = {}
    for name, sel, tab in [('gif-rokito','GIF',None), ('gif-giphy','GIF','Giphy'), ('emoji','Emoji',None)]:
        page.click(f'.r10me-btn[aria-label="{sel}"]'); page.wait_for_selector('.r10me-pop .r10me-ptabs')
        if tab: page.click(f'.r10me-ptabs button:has-text("{tab}")'); page.wait_for_timeout(600)
        page.wait_for_timeout(250)
        res[name] = page.evaluate("""(()=>{const pop=document.querySelector('.r10me-pop').getBoundingClientRect(); const bad=[];
          document.querySelectorAll('.r10me-pop *').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width && (r.right>pop.right+0.5 || r.left<pop.left-0.5)) bad.push(e.className||e.tagName)});
          const g=document.querySelector('.r10me-pop .r10me-gifs, .r10me-pop .r10me-emoji'); return {popW:Math.round(pop.width), overflow:bad.length, sample:bad.slice(0,3), hScroll: g ? g.scrollWidth>g.clientWidth : null}})()""")
        page.screenshot(path=os.path.join(OUT, f'shot-layout-{name}.png'), clip={'x':0,'y':0,'width':1300,'height':520})
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
    print(res)
    ctx.close()
