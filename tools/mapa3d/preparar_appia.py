"""Vía Appia: traza, relieve y agua reales para el mapa 3D.

Uso (desde la raíz del repositorio):
    python tools/mapa3d/preparar_appia.py \
        --itinere tools/mapa3d/datos/via-appia-itinere.geojson \
        --dem-contexto /ruta/noaa-italia-contexto.tif \
        --dem-corredor /ruta/noaa-appia-corredor.tif \
        --natural-earth /ruta/a/geojson-natural-earth

Salidas:
    mobile/services/mapa3d/escenas/viaAppia.trazado.js   (viaja con la app)
    mobile/scripts/mapa3d/viaAppia.relieve.json/.bin     (sólo para hornear)
    tools/mapa3d/datos/appia-verificacion.json           (control geográfico)

La app no ejecuta este script ni descarga datos: recibe el horneado final.
Requiere Python 3 con numpy, scipy y Pillow, y Node para leer los hitos.

Tres capas separadas:
  1. Geografía real (WGS84): traza Itiner-e, costa/lagos Natural Earth, DEM NOAA.
  2. Progreso virtual: 0-611 km, anclado a los 13 hitos de services/desafios/viaAppia.js.
  3. Representación: exageración, colores y miniaturas (en la escena, no aquí).
"""
import argparse, base64, gzip, hashlib, json, math, subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import map_coordinates, gaussian_filter, distance_transform_edt

RAIZ = Path(__file__).resolve().parents[2]
APP = RAIZ / 'mobile'
DATOS = RAIZ / 'tools/mapa3d/datos'

# Proyección local idéntica a terrenoCore.crearProyeccion (equirectangular).
CENTRO = {'lat': 41.2, 'lon': 15.2}
KM_LAT = 111.2
KM_LON = KM_LAT * math.cos(math.radians(CENTRO['lat']))
a_x = lambda lon: (np.asarray(lon) - CENTRO['lon']) * KM_LON
a_z = lambda lat: -(np.asarray(lat) - CENTRO['lat']) * KM_LAT
de_x = lambda x: CENTRO['lon'] + np.asarray(x) / KM_LON
de_z = lambda z: CENTRO['lat'] - np.asarray(z) / KM_LAT

# Grillas de relieve (km locales). El corredor detallado cubre la ruta con
# margen; el contexto cubre toda la malla horneada (validado al hornear).
DETALLE = {'minX': -290.0, 'maxX': 290.0, 'minZ': -132.0, 'maxZ': 176.0, 'pasoKm': 0.8}
CONTEXTO = {'minX': -1300.0, 'maxX': 1300.0, 'minZ': -1290.0, 'maxZ': 1290.0, 'pasoKm': 2.0}
# Agua: 0 tierra, 1 mar/laguna a nivel 0, >=2 lagos interiores (nivel propio).
TIERRA_MIN_M = 2.0     # sobre el plano del mar (1,5 m): sin tierra "inundada"
MAR_MAX_M = -3.0       # debajo del plano: sin islas falsas por remuestreo
FONDO_MIN_M = -400.0   # batimetría visible acotada (el agua es casi opaca)

# Proyección inversa EPSG:3395 (World Mercator, elipsoide WGS84) de Itiner-e.
A, E = 6378137.0, 0.0818191908426215
def inv3395(x, y):
    lon = math.degrees(x / A); t = math.exp(-y / A); phi = math.pi / 2 - 2 * math.atan(t)
    for _ in range(20):
        es = E * math.sin(phi)
        phi = math.pi / 2 - 2 * math.atan(t * ((1 - es) / (1 + es)) ** (E / 2))
    return math.degrees(phi), lon

def km_geo(a, b):
    return math.hypot((a[0] - b[0]) * KM_LAT, (a[1] - b[1]) * KM_LAT * math.cos(math.radians((a[0] + b[0]) / 2)))

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

# ── Traza ─────────────────────────────────────────────────────────────────
def encadenar(itinere, inicio, fin):
    """Une los tramos de Itiner-e en una polilínea Roma→Brindisi, sin saltos."""
    tramos = []
    for f in itinere['features']:
        g = f['geometry']
        for linea in ([g['coordinates']] if g['type'] == 'LineString' else g['coordinates']):
            tramos.append({'nombre': f['properties']['Name'], 'certeza': f['properties']['Segment_s'],
                           'itinerario': f['properties']['Itinerary'], 'pts': [inv3395(c[0], c[1]) for c in linea]})
    usados, cadena, actual, saltos = set(), [], inicio, []
    while km_geo(actual, fin) > 0.05:
        mejor = min(((km_geo(actual, t['pts'][-1] if r else t['pts'][0]), i, r)
                     for i, t in enumerate(tramos) if i not in usados for r in (False, True)), default=None)
        if mejor is None or mejor[0] > 0.05:
            raise ValueError(f'Traza discontinua cerca de {actual}: {mejor}')
        d, i, r = mejor
        usados.add(i); saltos.append(d * 1000)
        pts = tramos[i]['pts'][::-1] if r else tramos[i]['pts']
        cadena.append({**tramos[i], 'pts': pts}); actual = pts[-1]
    if len(usados) != len(tramos):
        raise ValueError('Quedaron tramos de la Appia sin usar: revisar variantes')
    puntos = []
    for t in cadena:
        for p in t['pts']:
            if not puntos or km_geo(puntos[-1], p) > 1e-4: puntos.append(p)
    return puntos, cadena, max(saltos)

def proyectar_en(puntos, lat, lon):
    c = math.cos(math.radians(lat)); mejor = (1e9, 0, 0)
    for i in range(len(puntos) - 1):
        a, b = puntos[i], puntos[i + 1]
        ax, az = (a[1] - lon) * KM_LAT * c, (a[0] - lat) * KM_LAT
        bx, bz = (b[1] - lon) * KM_LAT * c, (b[0] - lat) * KM_LAT
        dx, dz = bx - ax, bz - az
        t = max(0.0, min(1.0, -(ax * dx + az * dz) / ((dx * dx + dz * dz) or 1e-12)))
        d = math.hypot(ax + dx * t, az + dz * t)
        if d < mejor[0]: mejor = (d, i, t)
    return mejor

def simplificar(puntos, tolerancia_km, fijos):
    """Douglas-Peucker en km locales; conserva los índices fijos (hitos)."""
    xy = np.column_stack([a_x([p[1] for p in puntos]), a_z([p[0] for p in puntos])])
    conservar = np.zeros(len(puntos), bool); conservar[[0, len(puntos) - 1, *fijos]] = True
    pila = []
    cortes = sorted(set([0, len(puntos) - 1, *fijos]))
    for a, b in zip(cortes, cortes[1:]): pila.append((a, b))
    while pila:
        a, b = pila.pop()
        if b <= a + 1: continue
        p, q = xy[a], xy[b]; v = q - p; n = np.hypot(*v) or 1e-12
        w = xy[a + 1:b] - p
        d = np.abs(v[0] * w[:, 1] - v[1] * w[:, 0]) / n
        k = int(np.argmax(d))
        if d[k] > tolerancia_km:
            m = a + 1 + k; conservar[m] = True; pila += [(a, m), (m, b)]
    return [i for i in range(len(puntos)) if conservar[i]]

# ── Rasterización de polígonos Natural Earth en una grilla local ───────────
def anillos(geom):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    return polys

def rasterizar(grilla, features, sobremuestreo=4, valor_de=lambda f: 1, base=0):
    """Fracción cubierta por cada celda (antialias por sobremuestreo)."""
    nx, nz = grilla['nx'], grilla['nz']
    W, H = nx * sobremuestreo, nz * sobremuestreo
    lon0, lon1 = de_x(grilla['minX'] - grilla['pasoKm'] / 2), de_x(grilla['maxX'] + grilla['pasoKm'] / 2)
    lat0, lat1 = de_z(grilla['minZ'] - grilla['pasoKm'] / 2), de_z(grilla['maxZ'] + grilla['pasoKm'] / 2)
    img = Image.new('L', (W, H), base)
    dib = ImageDraw.Draw(img)
    a_px = lambda c: ((c[0] - lon0) / (lon1 - lon0) * W, (lat0 - c[1]) / (lat0 - lat1) * H)
    for f in features:
        v = valor_de(f)
        for poly in anillos(f['geometry']):
            xs = [c[0] for c in poly[0]]; ys = [c[1] for c in poly[0]]
            if max(xs) < lon0 or min(xs) > lon1 or max(ys) < lat1 or min(ys) > lat0: continue
            dib.polygon([a_px(c) for c in poly[0]], fill=v)
            for hueco in poly[1:]: dib.polygon([a_px(c) for c in hueco], fill=base)
    a = np.asarray(img, dtype=np.float32).reshape(nz, sobremuestreo, nx, sobremuestreo)
    return a, img

def fraccion(grilla, features, s=4):
    a, _ = rasterizar(grilla, features, s, lambda f: 255)
    return a.mean(axis=(1, 3)) / 255.0

def ejes(g):
    g['nx'] = int(round((g['maxX'] - g['minX']) / g['pasoKm'])) + 1
    g['nz'] = int(round((g['maxZ'] - g['minZ']) / g['pasoKm'])) + 1
    xs = g['minX'] + np.arange(g['nx']) * g['pasoKm']; zs = g['minZ'] + np.arange(g['nz']) * g['pasoKm']
    return np.meshgrid(xs, zs)

def leer_dem(ruta):
    im = Image.open(ruta); dem = np.array(im, dtype=np.float32)
    dx, dy, _ = im.tag_v2[33550]; _, _, _, lon0, lat0, _ = im.tag_v2[33922]
    if not np.isfinite(dem).all() or (dem < -20000).any(): raise ValueError(f'{ruta}: celdas sin datos')
    return dem, dx, dy, lon0, lat0

def muestrear_dem(dem, dx, dy, lon0, lat0, X, Z, sigma_km=0.0):
    lon, lat = de_x(X), de_z(Z)
    fi = (lon - lon0) / dx - .5; fj = (lat0 - lat) / dy - .5
    if fi.min() < 0 or fj.min() < 0 or fi.max() > dem.shape[1] - 1 or fj.max() > dem.shape[0] - 1:
        raise ValueError('El recorte NOAA no cubre la grilla pedida')
    if sigma_km > 0:  # pasabajos previo: evita aliasing al bajar de resolución
        dem = gaussian_filter(dem, (sigma_km / (dy * KM_LAT), sigma_km / (dx * KM_LON)))
    return map_coordinates(dem, [fj, fi], order=1, mode='nearest')

def niveles_lagos(lagos_feats, dem_det, dem_ctx):
    """Nivel de cada lago: mediana del DEM dentro del polígono (corredor si lo cubre)."""
    out = []
    for n, f in enumerate(lagos_feats):
        nivel = None
        for grilla, dem_info in ((dict(DETALLE), dem_det), (dict(CONTEXTO), dem_ctx)):
            X, Z = ejes(grilla)
            dentro = fraccion(grilla, [f]) > .5
            if dentro.sum() >= 2:
                nivel = float(np.median(muestrear_dem(*dem_info, X[dentro], Z[dentro])))
                break
        if nivel is None: continue
        nombre = f['properties'].get('name') or 'lago sin nombre'
        # Lagunas costeras (nivel ~0): se tratan como mar, con el mismo plano.
        out.append({'feature': f, 'nombre': nombre, 'nivelM': 0 if nivel < 3 else round(nivel)})
    codigo = 2
    for l in out:
        if l['nivelM'] == 0: l['codigo'] = 1
        else: l['codigo'] = codigo; codigo += 1
    if codigo > 250: raise ValueError('Demasiados lagos para Uint8')
    return out

COSTA_CLARA_M = 8.0    # fuera de ±8 m el DEM decide; dentro, la costa de Natural Earth
PLANO_MAR_M = 1.5      # elevación del plano de mar continuo (escena.agua.elevacionM por defecto)
COSTA_RAMPA_M = 5.0    # ±5 m alrededor del plano en la franja costera
RUTA_EN_TIERRA_KM = 0.9  # la vía romana es terrestre: su franja nunca es mar

def componer(grilla, dem_info, sigma, tierra, lagos, nombre, ruta_xz):
    X, Z = ejes(grilla)
    dem = muestrear_dem(*dem_info, X, Z, sigma)
    frac_tierra = np.clip(fraccion(grilla, tierra), 0, 1)
    # Natural Earth 1:10M generaliza la costa ~1 km: en una costa urbana (Formia,
    # istmo de Taranto) dejaría la vía en el agua. El DEM decide donde su signo
    # es inequívoco; Natural Earth sólo resuelve la franja baja y ambigua.
    es_mar = np.where(dem > COSTA_CLARA_M, False, np.where(dem < -COSTA_CLARA_M, True, frac_tierra < .5))
    # Franja de la ruta: siempre tierra (distancia a la polilínea en celdas).
    marca = np.zeros(dem.shape, bool)
    fi = np.round((ruta_xz[:, 0] - grilla['minX']) / grilla['pasoKm']).astype(int)
    fj = np.round((ruta_xz[:, 1] - grilla['minZ']) / grilla['pasoKm']).astype(int)
    ok = (fi >= 0) & (fj >= 0) & (fi < grilla['nx']) & (fj < grilla['nz'])
    marca[fj[ok], fi[ok]] = True
    franja = distance_transform_edt(~marca) * grilla['pasoKm'] <= RUTA_EN_TIERRA_KM
    forzadas = int((es_mar & franja).sum())
    es_mar &= ~franja
    agua = np.zeros(dem.shape, np.uint8)
    agua[es_mar] = 1
    usados = []
    for l in lagos:
        dentro = fraccion(grilla, [l['feature']]) > .5
        if not dentro.any(): continue
        agua[dentro] = l['codigo']; usados.append(l['nombre'])
    h = dem.copy()
    # Tierra siempre sobre el plano de mar; mar siempre bajo él.
    tierra_m = (agua == 0)
    h[tierra_m] = np.maximum(h[tierra_m], TIERRA_MIN_M)
    h[agua == 1] = np.clip(h[agua == 1], FONDO_MIN_M, MAR_MAX_M)
    # Franja costera ambigua: la altura sigue la fracción de tierra de la celda
    # (lineal, 0,5 = nivel del plano de mar). La costa cruza el plano dentro de
    # la celda, siguiendo Natural Earth, sin dientes de escalera en diagonal.
    cobertura = np.where(franja, 1.0, frac_tierra)
    banda = (np.abs(dem) <= COSTA_CLARA_M) & (agua <= 1) & (cobertura > 0) & (cobertura < 1)
    costa = PLANO_MAR_M + (cobertura - 0.5) * 2 * COSTA_RAMPA_M
    h[banda] = costa[banda]
    agua[banda] = np.where(costa[banda] < PLANO_MAR_M, 1, 0)
    for l in lagos:
        if l['codigo'] < 2: continue
        m = agua == l['codigo']; h[m] = np.minimum(h[m], l['nivelM'] - 4)
    # Islas que sólo existen en el DEM (sin tierra en Natural Earth): se informan.
    from scipy.ndimage import label
    comp, n = label(agua == 0)
    solo_dem = [int((comp == k).sum()) for k in range(1, n + 1) if frac_tierra[comp == k].max() < .05]
    estad = {'celdas': int(h.size), 'tierra': int((agua == 0).sum()), 'mar': int((agua == 1).sum()),
             'franjaRutaForzadaATierra': forzadas, 'islasSoloDEM': {'cantidad': len(solo_dem), 'celdasMax': max(solo_dem, default=0)},
             'lagos': usados, 'minM': int(h.min()), 'maxM': int(h.max())}
    print(nombre, grilla['nx'], 'x', grilla['nz'], estad)
    return np.round(h).astype('<i2'), agua, estad, frac_tierra

def features_en(path, bbox, filtro=lambda p: True):
    d = json.load(gzip.open(path, 'rt') if str(path).endswith('.gz') else open(path))
    out = []
    for f in d['features']:
        if not f.get('geometry') or not filtro(f['properties']): continue
        cs = [c for poly in anillos(f['geometry']) for c in poly[0]]
        xs = [c[0] for c in cs]; ys = [c[1] for c in cs]
        if max(xs) < bbox[0] or min(xs) > bbox[2] or max(ys) < bbox[1] or min(ys) > bbox[3]: continue
        out.append(f)
    return out

RECORTES = {
    'tierra': 'appia-tierra-ne10m.geojson.gz',
    'lagos': 'appia-lagos-ne10m.geojson.gz',
    'regiones': 'appia-regiones-ne10m.geojson.gz',
}
BBOX_CONTEXTO = (-1.5, 29.0, 32.0, 53.5)
BBOX_LAGOS = (11.0, 39.0, 19.6, 43.6)  # Italia central y sur y la costa adriática visible: más lejos
                                       # una celda mide decenas de km y cada lago sumaría un draw call

def leer_recorte(nombre):
    return json.load(gzip.open(DATOS / RECORTES[nombre], 'rt'))['features']

def extraer_natural_earth(ne):
    """Regenera los recortes de Natural Earth 10m guardados en el repositorio."""
    from shapely.geometry import shape, box, mapping
    caja = box(*BBOX_CONTEXTO)
    def recortar(feats):
        out = []
        for f in feats:
            g = shape(f['geometry']).intersection(caja)
            if g.is_empty: continue
            out.append({'type': 'Feature', 'properties': {k: f['properties'].get(k) for k in ('name', 'featurecla', 'region', 'name_es')},
                        'geometry': mapping(g)})
        return out
    tierra = recortar(features_en(ne / 'ne_10m_land.geojson', BBOX_CONTEXTO) + features_en(ne / 'ne_10m_minor_islands.geojson', BBOX_CONTEXTO))
    lagos = features_en(ne / 'ne_10m_lakes_europe.geojson', BBOX_LAGOS)
    nombres = {(f['properties'].get('name') or '').lower() for f in lagos}
    def en_italia(f):
        cs = [c for p in anillos(f['geometry']) for c in p[0]]
        lon, lat = np.mean([c[0] for c in cs]), np.mean([c[1] for c in cs])
        return 6 < lon < 19 and 36 < lat < 47.5
    # ne_10m_lakes duplica y nombra mal algunos lagos italianos: sólo se usan los ausentes en lakes_europe.
    lagos += [f for f in features_en(ne / 'ne_10m_lakes.geojson', BBOX_LAGOS)
              if not en_italia(f) and (f['properties'].get('name') or '').lower() not in nombres]
    regiones = features_en(ne / 'ne_10m_admin_1_states_provinces.geojson', (11, 39, 19, 43), lambda p: p.get('admin') == 'Italy')
    for nombre, feats in (('tierra', tierra), ('lagos', recortar(lagos)), ('regiones', recortar(regiones))):
        with gzip.open(DATOS / RECORTES[nombre], 'wt', compresslevel=9) as fh:
            json.dump({'type': 'FeatureCollection', 'fuente': 'Natural Earth 1:10m, dominio público (naturalearthdata.com), '
                       'recorte para Vía Appia', 'features': feats}, fh, separators=(',', ':'))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--itinere', type=Path, default=DATOS / 'via-appia-itinere.geojson')
    ap.add_argument('--dem-contexto', type=Path, required=True)
    ap.add_argument('--dem-corredor', type=Path, required=True)
    ap.add_argument('--natural-earth', type=Path, help='(opcional) carpeta con los geojson 10m de Natural Earth '
                    'para volver a extraer los recortes guardados en tools/mapa3d/datos')
    args = ap.parse_args()

    hitos = json.loads(subprocess.check_output(['node', '-e',
        "console.log(JSON.stringify(require('./mobile/services/desafios/viaAppia').checkpoints.map(c=>({id:c.id,nombre:c.nombre,km:c.kmFisico,lat:c.lat,lon:c.lon}))))"],
        cwd=RAIZ, text=True))
    itinere = json.load(open(args.itinere))

    # Inicio: extremo urbano de Itiner-e junto a Porta Capena; fin: columnas de Brindisi.
    puntos, cadena, salto = encadenar(itinere, (41.8844, 12.4890), (40.6411, 17.9471))
    # Inserta en la polilínea el punto exacto más cercano a cada hito.
    anclas = {}
    for h in hitos:
        d, i, t = proyectar_en(puntos, h['lat'], h['lon'])
        if t > 1e-6 and t < 1 - 1e-6:
            a, b = puntos[i], puntos[i + 1]
            puntos.insert(i + 1, (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)); i += 1
        elif t >= 1 - 1e-6: i += 1
        anclas[h['id']] = (i, d)
    # Los índices pudieron moverse por inserciones posteriores: recalcular.
    for h in hitos:
        d, i, t = proyectar_en(puntos, h['lat'], h['lon'])
        anclas[h['id']] = (i + (1 if t > .5 else 0), anclas[h['id']][1])
    orden = [anclas[h['id']][0] for h in hitos]
    if orden != sorted(orden) or len(set(orden)) != len(orden):
        raise ValueError(f'Hitos fuera de orden sobre la traza: {orden}')
    idx = simplificar(puntos, 0.03, orden)
    nuevo = {v: k for k, v in enumerate(idx)}
    pts = [puntos[i] for i in idx]
    acum = [0.0]
    for i in range(1, len(pts)): acum.append(acum[-1] + km_geo(pts[i - 1], pts[i]))
    largo_original = sum(km_geo(puntos[i], puntos[i + 1]) for i in range(len(puntos) - 1))

    # Regiones atravesadas (Natural Earth admin-1) para verificar capítulos.
    if args.natural_earth: extraer_natural_earth(args.natural_earth)
    regiones_ne = leer_recorte('regiones')
    from matplotlib.path import Path as Ruta
    def region_de(lat, lon):
        for f in regiones_ne:
            for poly in anillos(f['geometry']):
                if Ruta(np.asarray(poly[0])[:, :2]).contains_point((lon, lat)): return f['properties']['region']
        return None
    regiones, previa = [], None
    for k in range(0, len(pts)):
        r = region_de(*pts[k])
        if r and r != previa:
            regiones.append({'region': r, 'desdeKmReal': round(acum[k], 2)}); previa = r

    verificacion = {
        'fuente': {
            'traza': 'Itiner-e static version 2024 v1.3 (de Soto, Pažout, Brughmans, Vahlstrup), doi:10.5281/zenodo.17122148, CC BY 4.0',
            'archivo': args.itinere.name, 'sha256': sha(args.itinere), 'filtro': itinere.get('fuente', {}).get('filtro'),
            'proyeccionOrigen': 'EPSG:3395 (World Mercator) -> WGS84',
        },
        'tramos': [{'nombre': t['nombre'], 'certeza': t['certeza'], 'itinerario': t['itinerario'], 'puntos': len(t['pts'])} for t in cadena],
        'saltoMaximoEntreTramosM': round(salto, 1),
        'largoKmOriginal': round(largo_original, 2), 'largoKmSimplificado': round(acum[-1], 2),
        'puntosOriginales': len(puntos), 'puntos': len(pts), 'toleranciaSimplificacionKm': 0.03,
        'hitos': [], 'regiones': regiones,
    }
    previo = None
    for h in hitos:
        i = nuevo[anclas[h['id']][0]]
        fila = {'id': h['id'], 'kmVirtual': h['km'], 'kmReal': round(acum[i], 2), 'desvioKm': round(anclas[h['id']][1], 3)}
        if previo: fila['razonTramo'] = round((h['km'] - previo[1]) / max(.1, acum[i] - previo[0]), 3)
        verificacion['hitos'].append(fila); previo = (acum[i], h['km'])

    certeza = []
    for t in cadena:
        certeza += [t['certeza']] * (len(t['pts']) - 1)
    salida_js = APP / 'services/mapa3d/escenas/viaAppia.trazado.js'
    cuerpo = {
        'fuente': verificacion['fuente']['traza'],
        'nota': 'Traza académica de la Appia Antica (Roma-Benevento-Venusia-Tarentum-Brundisium). '
                'No es un itinerario de caminata moderno ni coincide metro a metro con cada resto arqueológico: '
                'sólo Roma-Terracina figura como "Certain"; el resto es "Conjectured" en Itiner-e.',
        'puntos': [[round(p[0], 5), round(p[1], 5)] for p in pts],
        'anclas': {h['id']: nuevo[anclas[h['id']][0]] for h in hitos},
        'kmRealAnclas': {f['id']: f['kmReal'] for f in verificacion['hitos']},
        'regiones': regiones,
    }
    salida_js.write_text('// GENERADO por tools/mapa3d/preparar_appia.py — no editar a mano.\n'
                         '/* eslint-disable */\nmodule.exports = ' + json.dumps(cuerpo, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')

    # ── Relieve ──
    tierra, lagos = leer_recorte('tierra'), leer_recorte('lagos')

    det = dict(DETALLE); ctx = dict(CONTEXTO)
    dem_det, dem_ctx = leer_dem(args.dem_corredor), leer_dem(args.dem_contexto)
    lagos_n = niveles_lagos(lagos, dem_det, dem_ctx)
    # Ruta densa (antes de simplificar) en km locales, para la franja terrestre.
    ruta_xz = np.column_stack([a_x([p[1] for p in puntos]), a_z([p[0] for p in puntos])])
    h_det, a_det, e_det, _ = componer(det, dem_det, 0.35, tierra, lagos_n, 'detalle', ruta_xz)
    h_ctx, a_ctx, e_ctx, _ = componer(ctx, dem_ctx, 0.0, tierra, lagos_n, 'contexto', ruta_xz)

    # Validación de la traza contra el agua: ningún punto de ruta en el mar.
    rx, rz = a_x([p[1] for p in pts]), a_z([p[0] for p in pts])
    fi = (rx - det['minX']) / det['pasoKm']; fj = (rz - det['minZ']) / det['pasoKm']
    agua_ruta = a_det[np.round(fj).astype(int), np.round(fi).astype(int)]
    verificacion['puntosRutaSobreAgua'] = int((agua_ruta > 0).sum())

    bin_path = APP / 'scripts/mapa3d/viaAppia.relieve.bin'
    with open(bin_path, 'wb') as fh:
        for arr in (h_det, a_det, h_ctx, a_ctx): fh.write(np.ascontiguousarray(arr).tobytes())
    meta = {
        'fuente': {
            'relieve': 'NOAA NCEI DEM Global Mosaic (elevación y batimetría), servicio ImageServer exportImage, F32, bilineal',
            'servicio': 'https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer',
            'exportaciones': [
                {'archivo': args.dem_contexto.name, 'bbox': [-1, 29.5, 31.5, 53], 'size': [1625, 1175], 'sha256': sha(args.dem_contexto)},
                {'archivo': args.dem_corredor.name, 'bbox': [11.7, 39.6, 18.7, 42.4], 'size': [1750, 700], 'sha256': sha(args.dem_corredor)},
            ],
            'descargado': '2026-11-08',
            'costaYLagos': 'Natural Earth 1:10m (dominio público): land, minor_islands, lakes_europe, lakes',
        },
        'centro': CENTRO, 'kmPorGradoLat': KM_LAT,
        'detalle': {k: det[k] for k in ('minX', 'minZ', 'pasoKm', 'nx', 'nz')} | {'pasabajosKm': 0.35},
        'contexto': {k: ctx[k] for k in ('minX', 'minZ', 'pasoKm', 'nx', 'nz')},
        'codigosAgua': {'0': 'tierra', '1': 'mar o laguna (nivel 0 m)', '2+': 'lagos interiores'},
        'lagos': [{'codigo': l['codigo'], 'nombre': l['nombre'], 'nivelM': l['nivelM']} for l in lagos_n],
        'reglas': {'tierraMinM': TIERRA_MIN_M, 'marMaxM': MAR_MAX_M, 'fondoMinM': FONDO_MIN_M, 'planoMarM': PLANO_MAR_M, 'rampaCostaM': COSTA_RAMPA_M,
                   'costaClaraM': COSTA_CLARA_M, 'rutaEnTierraKm': RUTA_EN_TIERRA_KM},
        'orden': 'detalle alturas Int16, detalle agua Uint8, contexto alturas Int16, contexto agua Uint8 (fila = z)',
        'estadisticas': {'detalle': e_det, 'contexto': e_ctx},
        'sha256Bin': sha(bin_path),
    }
    (APP / 'scripts/mapa3d/viaAppia.relieve.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    (DATOS / 'appia-verificacion.json').write_text(json.dumps(verificacion, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('traza:', len(pts), 'puntos,', round(acum[-1], 1), 'km; ruta sobre agua:', verificacion['puntosRutaSobreAgua'])

if __name__ == '__main__':
    main()
