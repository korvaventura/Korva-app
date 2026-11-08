"""Capturas del banco de territorio (Camino, Vía Appia) con Chrome headless.
Uso: python3 capturaTerritorio.py '{"nombre": "escena=viaAppia&km=0&w=390&h=640"}' carpeta_salida
Cada vista usa su propio tamaño de visor (w, h). Imprime las métricas en JSON."""
import sys, json, asyncio, os
from urllib.parse import parse_qs
RAIZ = os.path.dirname(os.path.abspath(__file__))
from playwright.async_api import async_playwright
async def main():
    vistas = json.loads(sys.argv[1]); out = sys.argv[2]; resultados = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'),
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'])
        for nombre, qs in vistas.items():
            a = parse_qs(qs); w = int(a.get('w', ['390'])[0]); h = int(a.get('h', ['560'])[0])
            pg = await b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=2)
            logs = []; pg.on('pageerror', lambda e: logs.append('ERR ' + str(e)))
            await pg.goto(f'file://{RAIZ}/territorio.html?{qs}')
            await pg.wait_for_function('window.LISTO === true || window.ERROR', timeout=180000)
            m = await pg.evaluate('window.METRICAS')
            await pg.locator('#w').screenshot(path=f'{out}/{nombre}.png')
            resultados[nombre] = m; print(nombre, json.dumps(m, ensure_ascii=False), *logs)
            await pg.close()
        await b.close()
    json.dump(resultados, open(f'{out}/metricas.json', 'w'), ensure_ascii=False, indent=1)
asyncio.run(main())
