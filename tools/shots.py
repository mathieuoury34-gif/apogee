# Captures d'écran de Quadra avec le jeu de démonstration (tools/demo.json).
# usage : shots.py base_url out_prefix route1,route2 [largeur hauteur] [light|dark] [vide]
import asyncio, sys, base64, os, json
from playwright.async_api import async_playwright
base, prefix, routes = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
w = int(sys.argv[4]) if len(sys.argv) > 4 else 390
h = int(sys.argv[5]) if len(sys.argv) > 5 else 844
theme = sys.argv[6] if len(sys.argv) > 6 else 'light'
empty = len(sys.argv) > 7 and sys.argv[7] == 'vide'
here = os.path.dirname(os.path.abspath(__file__))
def b64(p): return base64.b64encode(open(p, 'rb').read()).decode()
G = '/usr/share/fonts/truetype/google-fonts/'
N = '/usr/share/fonts/truetype/noto/'
noto = os.listdir(N) if os.path.isdir(N) else []
css = ''
for wgt, f in [(500, 'Poppins-Medium.ttf'), (600, 'Poppins-SemiBold.ttf' if os.path.exists(G + 'Poppins-SemiBold.ttf') else 'Poppins-Medium.ttf'), (700, 'Poppins-Bold.ttf')]:
    css += "@font-face{font-family:Montserrat;font-weight:%d;src:url(data:font/ttf;base64,%s)}" % (wgt, b64(G + f))
for wgt, name in [(400, 'NotoSans-Regular.ttf'), (600, 'NotoSans-SemiBold.ttf'), (700, 'NotoSans-Bold.ttf')]:
    if name in noto: css += "@font-face{font-family:'Open Sans';font-weight:%d;src:url(data:font/ttf;base64,%s)}" % (wgt, b64(N + name))
demo = open(os.path.join(here, 'demo.json')).read()
SEED = """async (rows) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('quadra', 1); r.onupgradeneeded = () => { r.result.createObjectStore('records'); r.result.createObjectStore('meta'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res, rej) => { const tx = db.transaction('records', 'readwrite'); const s = tx.objectStore('records'); s.clear(); for (const [k, v] of rows) s.put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        opts = {'user_agent': os.environ['UA']} if os.environ.get('UA') else {}
        ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if w < 800 else 1, color_scheme=theme, **opts)
        await ctx.add_init_script("try{localStorage.setItem('quadra:theme','%s');localStorage.setItem('quadra:lang','%s')}catch(e){}" % (theme, os.environ.get('APP_LANG', 'fr')))
        pg = await ctx.new_page()
        msgs = []
        pg.on('console', lambda m: msgs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: msgs.append('PAGEERROR: ' + str(e)))
        await pg.goto(base)
        if not empty:
            await pg.evaluate(SEED, json.loads(demo))
            await pg.reload()
        await pg.add_style_tag(content=css)
        await pg.wait_for_timeout(600)
        for i, r in enumerate(routes):
            await pg.evaluate("(r) => { location.hash = r }", r)
            await pg.wait_for_timeout(500)
            await pg.add_style_tag(content=css)
            await pg.wait_for_timeout(250)
            await pg.screenshot(path=f'{prefix}-{i}.png', full_page=os.environ.get('FULL', '1') == '1')
        print('\n'.join(msgs[:30]))
        await b.close()
asyncio.run(main())
