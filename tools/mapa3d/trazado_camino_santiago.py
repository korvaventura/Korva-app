"""Trazado del Camino Francés (Roncesvalles -> Praza do Obradoiro) para la escena 3D.

Fuente: OpenStreetMap (© colaboradores de OpenStreetMap, ODbL 1.0), superruta
"Camiño Francés" (relación 2163573) y sus seis etapas lineales, obtenidas con la
API de Waymarked Trails (hiking.waymarkedtrails.org/api/v1/details/relation/<id>),
que devuelve las vías ordenadas con su geometría en EPSG:3857.

Uso (desde tools/mapa3d):
  python3 trazado_camino_santiago.py datos/camino-frances-osm-etapas.json.gz \
      referencias_camino_santiago.json datos/regiones-espana-ne10m.geojson.gz \
      /tmp/verificacion-trazado.json \
      ../../mobile/services/mapa3d/escenas/caminoSantiago.trazado.js

No se agrega ni se dibuja ningún tramo a mano: la línea es la de OSM, recortada
en Roncesvalles y simplificada (Douglas-Peucker, 15 m). Las coordenadas de control
sólo se usan para verificar y para elegir el vértice de cada hito.
"""
import gzip, json, math, sys

ETAPAS = [2163569, 2163558, 2163560, 2163561, 2163565, 2163559]
TOLERANCIA_KM = 0.015
LAT_REF = 42.7
KX = 111.2 * math.cos(math.radians(LAT_REF))

HITOS = {  # id: (lat, lon) de control — fuente en referencias_camino_santiago.json
    'roncesvalles': (43.00917, -1.32000), 'pamplona': (42.8169, -1.6432),
    'puente_la_reina': (42.6729, -1.8141), 'irache': (42.65004, -2.04323),
    'santo_domingo': (42.4402, -2.9537), 'burgos': (42.3502, -3.6753),
    'fromista': (42.2667, -4.4055), 'leon': (42.6000, -5.5703),
    'astorga': (42.4588, -6.0560), 'ponferrada': (42.5466, -6.5962),
    'o_cebreiro': (42.70791, -7.04263), 'portomarin': (42.8062, -7.6164),
    'santiago': (42.8806, -8.5458),
}
# Variantes: el Camino debe pasar por unas localidades (< 300 m) y no por otras (> 3 km).
DEBE_PASAR = ['Villadangos del Páramo', 'San Martín del Camino', 'Bercianos del Real Camino',
              'El Burgo Ranero', 'Reliegos', 'San Xil']
NO_DEBE_PASAR = {'Villar de Mazarife': (42.4836, -5.7278),
                 'Calzadilla de los Hermanillos': (42.4331, -5.1393),
                 'Samos': (42.7310, -7.3258)}


def abrir(ruta):
    return gzip.open(ruta, 'rt', encoding='utf-8') if ruta.endswith('.gz') else open(ruta, encoding='utf-8')


def mercator_a_wgs84(x, y):
    r = 6378137.0
    return (math.degrees(2 * math.atan(math.exp(y / r)) - math.pi / 2), math.degrees(x / r))


def km(a, b):
    return math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * KX)


def local(p):
    return (p[1] * KX, -p[0] * 111.2)


def dist_segmento(p, a, b):
    px, pz = local(p); ax, az = local(a); bx, bz = local(b)
    dx, dz = bx - ax, bz - az
    l2 = dx * dx + dz * dz or 1e-12
    t = max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / l2))
    return math.hypot(ax + dx * t - px, az + dz * t - pz)


def dist_polilinea(p, pts):
    return min(dist_segmento(p, a, b) for a, b in zip(pts, pts[1:]))


def encadenar(etapas):
    """Une las vías de cada etapa en orden; invierte las que vienen al revés."""
    linea, saltos, info = [], [], []
    for rid in ETAPAS:
        rel = etapas[str(rid)]
        inicio = len(linea)
        for tramo in rel['route']['main']:
            for via in tramo.get('ways', []):
                c = [mercator_a_wgs84(x, y) for x, y in via['geometry']['coordinates']]
                if linea:
                    ult = linea[-1]
                    if km(ult, c[-1]) < km(ult, c[0]):
                        c.reverse()
                    salto = km(ult, c[0])
                    if salto > 0.05:
                        saltos.append((rid, via['id'], round(salto, 3)))
                    if salto < 0.001:
                        c = c[1:]
                linea.extend(c)
        info.append({'relacion': rid, 'nombre': rel['name'], 'largoOsmKm': round(rel['route']['length'] / 1000, 2),
                     'vias': sum(len(t.get('ways', [])) for t in rel['route']['main']), 'desde': inicio})
    return linea, saltos, info


def douglas_peucker(pts, forzar, tol):
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    for i in forzar:
        keep[i] = True
    anclas = sorted(i for i, k in enumerate(keep) if k)
    pila = list(zip(anclas, anclas[1:]))
    P = [local(p) for p in pts]
    while pila:
        a, b = pila.pop()
        ax, az = P[a]; bx, bz = P[b]
        dx, dz = bx - ax, bz - az
        l2 = dx * dx + dz * dz or 1e-12
        mejor, bi = 0.0, -1
        for i in range(a + 1, b):
            px, pz = P[i]
            t = max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / l2))
            d = math.hypot(ax + dx * t - px, az + dz * t - pz)
            if d > mejor:
                mejor, bi = d, i
        if mejor > tol:
            keep[bi] = True
            pila += [(a, bi), (bi, b)]
    return [i for i, k in enumerate(keep) if k]


def regiones(ruta_geojson, pts, acum):
    """Comunidad autónoma de cada vértice (Natural Earth admin-1, dominio público)."""
    from shapely.geometry import Point, shape
    from shapely.prepared import prep
    with abrir(ruta_geojson) as f:
        d = json.load(f)
    polis = [(f['properties']['region'], prep(shape(f['geometry']))) for f in d['features']]
    actual, cambios = None, []
    for p, s in zip(pts, acum):
        reg = next((r for r, g in polis if g.contains(Point(p[1], p[0]))), actual)
        if reg != actual:
            cambios.append({'region': reg, 'desdeKmReal': round(s, 2)})
            actual = reg
    return cambios


def main():
    origen, ref_ruta, regiones_ruta, salida = sys.argv[1:5]
    modulo = sys.argv[5] if len(sys.argv) > 5 else None
    with abrir(origen) as f:
        crudo = json.load(f)
    linea, saltos, info = encadenar(crudo['etapas'])
    if saltos:
        raise SystemExit(f'La traza OSM tiene huecos: {saltos[:5]}')
    total_osm = sum(km(a, b) for a, b in zip(linea, linea[1:]))
    i0 = min(range(len(linea)), key=lambda i: km(linea[i], HITOS['roncesvalles']))
    completo = linea[i0:]
    forzar = {min(range(len(completo)), key=lambda i: km(completo[i], p)) for p in HITOS.values()}
    idx = douglas_peucker(completo, forzar, TOLERANCIA_KM)
    pts = [completo[i] for i in idx]
    # Distancias reales: sobre la línea OSM completa (la simplificada acorta curvas).
    acumOsm = [0.0]
    for a, b in zip(completo, completo[1:]):
        acumOsm.append(acumOsm[-1] + km(a, b))
    acum = [acumOsm[i] for i in idx]
    largoSimplificado = sum(km(a, b) for a, b in zip(pts, pts[1:]))
    anclas = {h: idx.index(min(range(len(completo)), key=lambda i: km(completo[i], p))) for h, p in HITOS.items()}

    # Verificación 1: desvío máximo de la línea OSM completa respecto de la simplificada.
    desvio = 0.0
    j = 0
    for i, p in enumerate(completo):
        while j < len(idx) - 2 and idx[j + 1] < i:
            j += 1
        desvio = max(desvio, dist_segmento(p, pts[j], pts[j + 1]))
    # Verificación 2: localidades de control y variantes.
    with open(ref_ruta, encoding='utf-8') as f:
        refs = json.load(f)
    verif = [{'lugar': n, 'lat': la, 'lon': lo, 'fuente': fu, 'distKm': round(dist_polilinea((la, lo), pts), 3)}
             for n, la, lo, fu in refs]
    porNombre = {v['lugar']: v for v in verif}
    variantes = {
        'debePasar': {n: porNombre[n]['distKm'] for n in DEBE_PASAR},
        'noDebePasar': {n: round(dist_polilinea(p, pts), 2) for n, p in NO_DEBE_PASAR.items()},
    }
    fallas = [n for n, d in variantes['debePasar'].items() if d > 0.3] + \
             [n for n, d in variantes['noDebePasar'].items() if d < 3]
    if fallas:
        raise SystemExit(f'Variantes no verificadas: {fallas}')

    resultado = {
        'fuente': {
            'datos': '© colaboradores de OpenStreetMap, ODbL 1.0 (https://www.openstreetmap.org/copyright)',
            'superruta': 2163573, 'etapas': info, 'obtenido': crudo.get('descargado'),
            'via': crudo.get('fuente'), 'largoOsmSaintJeanObradoiroKm': round(total_osm, 2),
        },
        'simplificacion': {'algoritmo': 'Douglas-Peucker', 'toleranciaKm': TOLERANCIA_KM,
                           'puntosOsm': len(completo), 'puntos': len(pts), 'desvioMaximoKm': round(desvio, 4)},
        'largoKm': round(acum[-1], 2),
        'largoSimplificadoKm': round(largoSimplificado, 2),
        'anclas': anclas,
        'kmRealAnclas': {h: round(acum[i], 2) for h, i in anclas.items()},
        'desvioHitoKm': {h: round(km(pts[i], HITOS[h]), 3) for h, i in anclas.items()},
        'regiones': regiones(regiones_ruta, pts, acum),
        'variantes': variantes,
        'verificacion': verif,
        'puntos': [[round(a, 5), round(b, 5)] for a, b in pts],
    }
    with open(salida, 'w', encoding='utf-8') as f:
        json.dump(resultado, f, ensure_ascii=False, indent=1)
    if modulo:
        cuerpo = {k: resultado[k] for k in ('fuente', 'simplificacion', 'largoKm', 'anclas', 'kmRealAnclas', 'regiones')}
        cuerpo['kmReal'] = [round(a, 3) for a in acum]
        cuerpo['puntos'] = resultado['puntos']
        with open(modulo, 'w', encoding='utf-8') as f:
            f.write('// GENERADO por tools/mapa3d/trazado_camino_santiago.py — no editar a mano.\n'
                    '// Geografía real: [lat, lon] WGS84 de OpenStreetMap (© colaboradores de OSM, ODbL 1.0).\n'
                    '// kmReal: distancia sobre la línea OSM completa. Los km del desafío los fija la escena.\n'
                    '/* eslint-disable */\nmodule.exports = ')
            f.write(json.dumps(cuerpo, ensure_ascii=False, separators=(',', ':')))
            f.write(';\n')
    print(f"OSM {len(completo)} pts -> {len(pts)} pts, real {acum[-1]:.1f} km (simplificada {largoSimplificado:.1f}), desvío máx {desvio * 1000:.1f} m")
    print('kmReal', resultado['kmRealAnclas'])
    print('variantes', variantes)
    print('regiones', resultado['regiones'])


if __name__ == '__main__':
    main()
