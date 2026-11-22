"""Relieve real del Camino de Santiago, simplificado para móvil.

Entradas (tools/mapa3d/datos/):
  - ign-mdt500-camino-41.6_44.0N_9.6_0.8W.tif: MDT500 del IGN (WCS
    servicios.idee.es/wcs-inspire/mdt, cobertura Elevacion4258_500, ETRS89,
    CC BY 4.0 scne.es). Paso ~0,0045° (~370 x 500 m). Fuera de España vale 0.
  - regiones-espana-ne10m.geojson.gz: límite de España (Natural Earth, dominio público).
  - tierra-ne10m-iberia.geojson.gz: tierra firme (Natural Earth 1:10m, dominio público).
  - ign-hidrografia-belesar-mino.json: Encoro de Belesar (IGN Hidrografía INSPIRE,
    CC BY 4.0 scne.es).

Salida: mobile/scripts/mapa3d/caminoSantiago.relieve.bin (+ .json con la grilla).

Reglas (cada celda de 1 km en la proyección de la escena):
  - Dentro de España: altura media del MDT500 del IGN en la celda. Si el IGN no
    tiene dato (0) dentro de España, es mar: así la costa española es la del IGN.
  - Fuera de España y sobre tierra según Natural Earth (Portugal, Francia):
    relleno artístico por difusión desde la tierra vecina (no hay dato IGN).
  - Fuera de España y fuera de tierra: mar.
  - Encoro de Belesar: polígono IGN ensanchado 0,5 km (exageración de ancho
    documentada) con su nivel de agua tomado del propio MDT.

Uso (desde tools/mapa3d):  python3 preparar_relieve_camino.py
"""
import gzip, json, math, os
import numpy as np
import tifffile
from matplotlib.path import Path

AQUI = os.path.dirname(os.path.abspath(__file__))
DATOS = os.path.join(AQUI, 'datos')
SALIDA = os.path.join(AQUI, '..', '..', 'mobile', 'scripts', 'mapa3d', 'caminoSantiago.relieve')

CENTRO = (42.7, -4.9)          # = escena.centro
KM_LAT = 111.2                 # = terrenoCore KM_POR_GRADO_LAT
KM_LON = KM_LAT * math.cos(math.radians(CENTRO[0]))
PASO_KM = 1.0
MAR, BELESAR = 1, 2
FONDO_MAR_M = -60
ENSANCHE_BELESAR_KM = 0.5


def anillos(geom):
    t = geom['type']
    if t == 'Polygon':
        return [geom['coordinates']]
    if t == 'MultiPolygon':
        return geom['coordinates']
    return []


def mascara(poligonos, lon, lat):
    """Punto-en-polígono (con agujeros) para grillas lon/lat."""
    pts = np.column_stack([lon.ravel(), lat.ravel()])
    dentro = np.zeros(len(pts), bool)
    for poli in poligonos:
        ext = Path(np.asarray(poli[0])[:, :2])
        m = ext.contains_points(pts)
        for hueco in poli[1:]:
            m &= ~Path(np.asarray(hueco)[:, :2]).contains_points(pts)
        dentro |= m
    return dentro.reshape(lon.shape)


def leer_geojson(nombre):
    with gzip.open(os.path.join(DATOS, nombre), 'rt', encoding='utf-8') as f:
        return json.load(f)


def main():
    tif = tifffile.TiffFile(os.path.join(DATOS, 'ign-mdt500-camino-41.6_44.0N_9.6_0.8W.tif'))
    pag = tif.pages[0]
    dem = pag.asarray().astype(np.float32)
    sx, sy, _ = pag.tags['ModelPixelScaleTag'].value
    _, _, _, lon0, lat0, _ = pag.tags['ModelTiepointTag'].value
    filas, cols = dem.shape
    dem_lon = lon0 + (np.arange(cols) + 0.5) * sx
    dem_lat = lat0 - (np.arange(filas) + 0.5) * sy

    # Grilla de la escena (km): cubre el MDT entero.
    lat_min, lat_max = dem_lat[-1], dem_lat[0]
    lon_min, lon_max = dem_lon[0], dem_lon[-1]
    min_x = math.ceil((lon_min - CENTRO[1]) * KM_LON)
    max_x = math.floor((lon_max - CENTRO[1]) * KM_LON)
    min_z = math.ceil(-(lat_max - CENTRO[0]) * KM_LAT)
    max_z = math.floor(-(lat_min - CENTRO[0]) * KM_LAT)
    xs = np.arange(min_x, max_x + 1e-9, PASO_KM)
    zs = np.arange(min_z, max_z + 1e-9, PASO_KM)
    nx, nz = len(xs), len(zs)

    # Promedio por bloque: cada píxel del MDT cae en una celda de 1 km.
    LON, LAT = np.meshgrid(dem_lon, dem_lat)
    ci = np.clip(np.round(((LON - CENTRO[1]) * KM_LON - min_x) / PASO_KM).astype(int), 0, nx - 1)
    cj = np.clip(np.round((-(LAT - CENTRO[0]) * KM_LAT - min_z) / PASO_KM).astype(int), 0, nz - 1)
    conDato = dem > 0
    suma = np.zeros((nz, nx)); n = np.zeros((nz, nx)); total = np.zeros((nz, nx))
    np.add.at(suma, (cj[conDato], ci[conDato]), dem[conDato])
    np.add.at(n, (cj[conDato], ci[conDato]), 1)
    np.add.at(total, (cj, ci), 1)
    fraccion = np.where(total > 0, n / np.maximum(total, 1), 0)

    X, Z = np.meshgrid(xs, zs)
    LONc = CENTRO[1] + X / KM_LON
    LATc = CENTRO[0] - Z / KM_LAT
    espana = mascara([p for f in leer_geojson('regiones-espana-ne10m.geojson.gz')['features'] for p in anillos(f['geometry'])], LONc, LATc)
    tierra = mascara([p for f in leer_geojson('tierra-ne10m-iberia.geojson.gz')['features'] for p in anillos(f['geometry'])], LONc, LATc)

    altura = np.where(n > 0, suma / np.maximum(n, 1), np.nan)
    ign = (fraccion >= 0.5) & (n > 0)
    agua = np.zeros((nz, nx), np.uint8)
    # España: manda el IGN. Fuera: manda Natural Earth.
    agua[(espana | ~tierra) & ~ign] = MAR
    relleno = ~ign & (agua == 0)
    altura[~ign] = np.nan

    # Relleno artístico (Portugal/Francia y celdas mixtas): difusión desde tierra conocida.
    conocido = ~np.isnan(altura)
    h = np.where(conocido, altura, 0.0)
    peso = conocido.astype(float)
    for _ in range(400):
        hp = np.pad(h, 1, mode='edge'); pp = np.pad(peso, 1, mode='edge')
        s = hp[:-2, 1:-1] + hp[2:, 1:-1] + hp[1:-1, :-2] + hp[1:-1, 2:]
        c = pp[:-2, 1:-1] + pp[2:, 1:-1] + pp[1:-1, :-2] + pp[1:-1, 2:]
        nuevo = np.where(c > 0, s / np.maximum(c, 1e-9), 0)
        h = np.where(conocido, altura, np.where(c > 0, nuevo, h))
        peso = np.where(conocido, 1.0, (c > 0).astype(float))
    altura = np.where(agua == MAR, FONDO_MAR_M, h)

    # Encoro de Belesar (IGN).
    with open(os.path.join(DATOS, 'ign-hidrografia-belesar-mino.json'), encoding='utf-8') as f:
        hidro = json.load(f)
    polis = [[[[lon, lat] for lat, lon in a] for a in feat['anillos']] for feat in hidro['belesar']]
    dentro_real = mascara(polis, LONc, LATc)
    # Ensanche: celdas a menos de ENSANCHE km de una celda del polígono o de su contorno.
    contorno = np.array([[lat, lon] for p in polis for lon, lat in p[0]])
    cx = (contorno[:, 1] - CENTRO[1]) * KM_LON; cz = -(contorno[:, 0] - CENTRO[0]) * KM_LAT
    cerca = np.zeros_like(dentro_real)
    ii = np.clip(np.round((cx - min_x) / PASO_KM).astype(int), 0, nx - 1)
    jj = np.clip(np.round((cz - min_z) / PASO_KM).astype(int), 0, nz - 1)
    cerca[jj, ii] = True
    base = dentro_real | cerca
    radio = int(math.ceil(ENSANCHE_BELESAR_KM / PASO_KM))
    for dj in range(-radio, radio + 1):
        for di in range(-radio, radio + 1):
            if math.hypot(di, dj) * PASO_KM <= ENSANCHE_BELESAR_KM + 1e-9:
                cerca |= np.roll(np.roll(base, dj, 0), di, 1)
    belesar = (dentro_real | cerca) & (agua == 0)
    # Nivel: mínimo del MDT500 dentro del polígono real (la superficie del agua; la
    # mediana sale alta porque cada píxel de 500 m mezcla agua y laderas).
    pix = mascara(polis, LON[::2, ::2], LAT[::2, ::2]) & (dem[::2, ::2] > 0)
    nivel = float(np.min(dem[::2, ::2][pix]))
    agua[belesar] = BELESAR
    altura[belesar] = nivel - 15

    alturas16 = np.round(altura).astype(np.int16)
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA + '.bin', 'wb') as f:
        f.write(alturas16.tobytes(order='C'))
        f.write(agua.tobytes(order='C'))
    meta = {
        'fuente': {
            'relieve': 'MDT500 © Instituto Geográfico Nacional (IGN), CC BY 4.0 scne.es — WCS servicios.idee.es/wcs-inspire/mdt, Elevacion4258_500',
            'costaYFronteras': 'Natural Earth 1:10m (dominio público): tierra firme y límite de España',
            'embalse': 'Encoro de Belesar © IGN, Hidrografía INSPIRE (servicios.idee.es/wfs-inspire/hidrografia), CC BY 4.0 scne.es',
        },
        'centro': {'lat': CENTRO[0], 'lon': CENTRO[1]},
        'minX': float(xs[0]), 'minZ': float(zs[0]), 'pasoKm': PASO_KM, 'nx': nx, 'nz': nz,
        'codigosAgua': {'0': 'tierra', str(MAR): 'mar (nivel 0 m)', str(BELESAR): 'Encoro de Belesar'},
        'nivelesAguaM': {str(MAR): 0, str(BELESAR): round(nivel)},
        'fondoMarM': FONDO_MAR_M,
        'ensancheBelesarKm': ENSANCHE_BELESAR_KM,
        'celdas': {
            'ign': int(ign.sum()), 'rellenoArtistico': int((relleno & (agua == 0)).sum()),
            'mar': int((agua == MAR).sum()), 'belesar': int(belesar.sum()), 'belesarSinEnsanche': int(dentro_real.sum()),
        },
        'orden': 'alturas Int16 (nz*nx, fila = z) seguidas de agua Uint8 (nz*nx)',
    }
    with open(SALIDA + '.json', 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(json.dumps(meta['celdas']), 'nivel Belesar', round(nivel), 'grilla', nx, 'x', nz)


if __name__ == '__main__':
    main()
