"""Construye el trazado del Camino Francés (Roncesvalles -> Obradoiro) para la escena 3D.
Entrada: traza de referencia GeoJSON (caminofrances.info vía vaadin/docs) + coordenadas de control.
Salida: JSON con puntos simplificados, anclas virtuales y reporte de verificación."""
import json, math, sys
src, out = sys.argv[1], sys.argv[2]  # uso: trazado_camino_santiago.py traza.geojson salida.json referencias.json
d = json.load(open(src))
T = [(c[1], c[0]) for c in d['features'][0]['geometry']['coordinates']]
def km(a, b):
    la = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0]-b[0])*111.2, (a[1]-b[1])*111.2*math.cos(la))
def nearest(p, L):
    return min(range(len(L)), key=lambda i: km(p, L[i]))

# Coordenadas de control (fuente en comentario).
CTRL = {
 'roncesvalles': (43.00917, -1.32000),   # Wikipedia
 'pamplona': (42.8169, -1.6432),         # GeoNames cities1000
 'puente_la_reina': (42.6729, -1.8141),  # GeoNames
 'irache': (42.65004, -2.04323),         # Wikipedia (Monasterio de Irache)
 'santo_domingo': (42.4402, -2.9537),    # GeoNames
 'burgos': (42.3502, -3.6753),           # GeoNames (centro urbano)
 'fromista': (42.2667, -4.4055),         # GeoNames
 'leon': (42.6000, -5.5703),             # GeoNames
 'astorga': (42.4588, -6.0560),          # GeoNames
 'ponferrada': (42.5466, -6.5962),       # GeoNames
 'o_cebreiro': (42.70791, -7.04263),     # mejoresrutas / IGN
 'portomarin': (42.8062, -7.6164),       # GeoNames
 'santiago': (42.8806, -8.5458),         # Wikipedia (Praza do Obradoiro)
}
# 1) Recorte en Roncesvalles.
i0 = nearest(CTRL['roncesvalles'], T)
T = [CTRL['roncesvalles']] + T[i0+1:]
# 2) Real Camino Sahagún -> Mansilla por Bercianos, El Burgo Ranero y Reliegos
#    (la traza de referencia toma la Calzada de los Hermanillos).
sah = nearest((42.3708, -5.0294), T); man = nearest((42.4989, -5.4174), T)
real = [(42.3708,-5.0294),(42.3800,-5.0870),(42.38750,-5.14417),(42.4040,-5.1830),(42.42278,-5.22139),
        (42.4480,-5.2890),(42.4743,-5.3549),(42.4880,-5.3900),(42.4989,-5.4174)]  # Wikipedia/GeoNames + intermedios
T = T[:sah] + real + T[man+1:]
# 3) León -> Hospital de Órbigo por Villadangos y San Martín del Camino (N-120),
#    la traza de referencia toma Villar de Mazarife.
vir = nearest((42.5777, -5.6450), T); hos = nearest((42.4635, -5.8864), T)
n120 = [(42.5777,-5.6450),(42.5680,-5.6840),(42.5500,-5.7150),(42.5167,-5.7674),
        (42.4949,-5.8094),(42.4780,-5.8480),(42.4635,-5.8864)]  # GeoNames (Villadangos, San Martín, Hospital)
T = T[:vir] + n120 + T[hos+1:]
# 4) Llegada al Obradoiro.
T[-1] = CTRL['santiago']
# Simplificación Douglas-Peucker (tolerancia 60 m) en coordenadas locales km.
lat0 = 42.7; kx = 111.2*math.cos(math.radians(lat0))
P = [((lo+1.32)*kx, -(la-lat0)*111.2) for la, lo in T]
def dp(a, b, tol, keep):
    ax, az = P[a]; bx, bz = P[b]; best, bi = 0, -1
    for i in range(a+1, b):
        px, pz = P[i]; dx, dz = bx-ax, bz-az; L2 = dx*dx+dz*dz or 1e-9
        t = max(0, min(1, ((px-ax)*dx+(pz-az)*dz)/L2)); d_ = math.hypot(ax+dx*t-px, az+dz*t-pz)
        if d_ > best: best, bi = d_, i
    if best > tol: keep.add(bi); dp(a, bi, tol, keep); dp(bi, b, tol, keep)
keep = {0, len(P)-1}
# Forzar que las coordenadas de control queden como vértices exactos.
anc = {}
for k, p in CTRL.items():
    i = nearest(p, T); dist = km(p, T[i])
    # Sólo se reemplaza el vértice si la coordenada de control está sobre la traza (<300 m);
    # si no (centroide urbano, p. ej. Burgos) el ancla es el vértice más cercano de la traza.
    if dist < 0.3: T[i] = p; P[i] = ((p[1]+1.32)*kx, -(p[0]-lat0)*111.2)
    keep.add(i); anc[k] = (i, dist)
ks = sorted(keep)
for a, b in zip(ks, ks[1:]): dp(a, b, 0.06, keep)
idx = sorted(keep)
pts = [T[i] for i in idx]
ancla = {k: idx.index(i) for k, (i, _) in anc.items()}
L = [0]
for i in range(1, len(pts)): L.append(L[-1] + km(pts[i-1], pts[i]))
# Reporte de verificación con localidades de referencia (distancia al trazado final).
def dist_traza(p):
    best = 1e9
    for a, b in zip(pts, pts[1:]):
        ax, az = (a[1]+1.32)*kx, -(a[0]-lat0)*111.2; bx, bz = (b[1]+1.32)*kx, -(b[0]-lat0)*111.2
        px, pz = (p[1]+1.32)*kx, -(p[0]-lat0)*111.2; dx, dz = bx-ax, bz-az; L2 = dx*dx+dz*dz or 1e-9
        t = max(0, min(1, ((px-ax)*dx+(pz-az)*dz)/L2)); best = min(best, math.hypot(ax+dx*t-px, az+dz*t-pz))
    return best
REF = json.load(open(sys.argv[3]))
rep = [{'lugar': n, 'lat': la, 'lon': lo, 'fuente': f, 'distKm': round(dist_traza((la, lo)), 2)} for n, la, lo, f in REF]
json.dump({'puntos': [[round(a, 5), round(b, 5)] for a, b in pts], 'anclas': ancla,
           'largoKm': round(L[-1], 1), 'kmGeoAnclas': {k: round(L[v], 1) for k, v in ancla.items()},
           'desvioControlKm': {k: round(v[1], 2) for k, v in anc.items()}, 'verificacion': rep}, open(out, 'w'), indent=1)
print('puntos', len(pts), 'largo', round(L[-1], 1))
for k, v in ancla.items(): print(f'{k:16s} geo={L[v]:6.1f}  desvio_ctrl={anc[k][1]:.2f}')
bad = [r for r in rep if r['distKm'] > 1.0]
print('verificacion', len(rep), 'lugares; >1km:', bad)
