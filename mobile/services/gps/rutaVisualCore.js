// Núcleo puro para convertir una ruta GPS en una silueta visual.
// No conoce React Native ni dibuja mapas: conserva proporciones, centra y suaviza
// levemente el trazado para que pueda reutilizarse en detalle y piezas sociales.

const puntoValido = (p) => Number.isFinite(Number(p?.latitude)) && Number.isFinite(Number(p?.longitude));

const suavizarRuta = (puntos = []) => {
  const validos = puntos.filter(puntoValido).map((p) => ({
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
  }));
  if (validos.length < 5) return validos;
  return validos.map((p, i) => {
    if (i === 0 || i === validos.length - 1) return p;
    const a = validos[i - 1], b = validos[i + 1];
    return {
      latitude: (a.latitude + p.latitude * 2 + b.latitude) / 4,
      longitude: (a.longitude + p.longitude * 2 + b.longitude) / 4,
    };
  });
};

const proyectarRuta = (puntos = [], width = 300, height = 180, opciones = {}) => {
  const ruta = suavizarRuta(puntos);
  if (ruta.length < 2) return [];
  const pad = Math.max(0, Number(opciones.padding ?? 16));
  const visualScale = Math.min(1, Math.max(0.35, Number(opciones.visualScale ?? 0.9)));
  const lats = ruta.map((p) => p.latitude);
  const lons = ruta.map((p) => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const latMedia = ((minLat + maxLat) / 2) * Math.PI / 180;
  const cosLat = Math.max(0.2, Math.cos(latMedia));
  const rangoLat = Math.max(maxLat - minLat, 0.000001);
  const rangoLon = Math.max((maxLon - minLon) * cosLat, 0.000001);
  const disponibleW = Math.max(1, width - pad * 2);
  const disponibleH = Math.max(1, height - pad * 2);
  const escala = Math.min(disponibleW / rangoLon, disponibleH / rangoLat) * visualScale;
  const dibujoW = rangoLon * escala;
  const dibujoH = rangoLat * escala;
  const offsetX = (width - dibujoW) / 2;
  const offsetY = (height - dibujoH) / 2;
  return ruta.map((p) => ({
    x: offsetX + (p.longitude - minLon) * cosLat * escala,
    y: offsetY + (maxLat - p.latitude) * escala,
  }));
};

module.exports = { puntoValido, suavizarRuta, proyectarRuta };
