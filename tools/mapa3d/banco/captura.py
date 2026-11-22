import sys, json, asyncio, os
RAIZ = os.path.dirname(os.path.abspath(__file__))
from playwright.async_api import async_playwright
async def main():
    vistas = json.loads(sys.argv[1]); out = sys.argv[2]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 390, 'height': 560}, device_scale_factor=2)
        logs=[]; pg.on('console', lambda m: logs.append(m.text)); pg.on('pageerror', lambda e: logs.append('ERR '+str(e)))
        for nombre, qs in vistas.items():
            await pg.goto(f'file://{RAIZ}/index.html?{qs}')
            await pg.wait_for_function('window.LISTO === true', timeout=120000)
            m = await pg.evaluate('[window.METRICAS, window.AJUSTE||null]')
            await pg.locator('#w').screenshot(path=f'{out}/{nombre}.png')
            print(nombre, json.dumps(m))
        print('\n'.join(logs[:10]))
        await b.close()
asyncio.run(main())
