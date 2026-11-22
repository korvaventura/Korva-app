const test = require('node:test');
const assert = require('node:assert/strict');
const escena = require('../services/mapa3d/escenas/caminoSantiago');
const europa = require('../scripts/mapa3d/caminoSantiago.europa.json');
const { conRelieveReal } = require('../scripts/mapa3d/caminoSantiago.relieveReal');
const { deserializarDiorama } = require('../services/mapa3d/horneadoCore');
const { separarPinesCamino } = require('../services/mapa3d/pinesCaminoCore');
const m = conRelieveReal(escena).relieve.real.muestrear;
const lonKm = 111.2 * Math.cos(42.7 * Math.PI / 180);
const muestrear = (lat, lon) => m((lon + 4.9) * lonKm, -(lat - 42.7) * 111.2);

test('Europa: el contexto de Portugal, Francia y sur de España conserva relieve real', () => {
  for (const [lat, lon, minimo] of [[40.3, -7.6, 1000], [45.8, 6.9, 1800], [37.1, -3.3, 2000]]) {
    const p = muestrear(lat, lon);
    assert(p.h > minimo && p.agua === -Infinity, `relieve en ${lat}, ${lon}`);
  }
});

test('Europa: los antiguos límites rectangulares ya no cortan la tierra en mar', () => {
  for (const [lat, lon, dLat, dLon] of [[38, -4, .00001, 0], [48, 1, .00001, 0], [45, 6, 0, .00001]]) {
    const a = muestrear(lat - dLat, lon - dLon), b = muestrear(lat + dLat, lon + dLon);
    assert(a.h > 0 && b.h > 0 && a.agua === -Infinity && b.agua === -Infinity);
    assert(Math.abs(a.h - b.h) < 5, 'continuidad en el límite del recorte anterior');
  }
});

test('Europa: toda la malla horneada queda cubierta por el modelo de elevaciones', () => {
  const datos = deserializarDiorama(escena, require('../services/mapa3d/escenas/caminoSantiago.horneado'));
  assert(datos.campo.minX >= europa.minX && datos.campo.maxX <= europa.minX + (europa.nx - 1) * europa.pasoKm);
  assert(datos.campo.minZ >= europa.minZ && datos.campo.maxZ <= europa.minZ + (europa.nz - 1) * europa.pasoKm);
});

const pin = (i, x, y) => ({ cp: { id: String(i) }, cabeza: { x, y, visible: true }, base: { x, y: y + 15, visible: true } });
test('Camino: separa cuatro pines próximos y conserva sus coordenadas base', () => {
  const entrada = [pin(0, 190, 280), pin(1, 192, 281), pin(2, 190, 284), pin(3, 193, 287)];
  const copia = JSON.parse(JSON.stringify(entrada));
  const salida = separarPinesCamino(entrada, 390, 625);
  assert.deepEqual(entrada, copia, 'no mutar los datos de proyección');
  salida.forEach((p, i) => assert.deepEqual(p.base, entrada[i].base));
  for (let i = 0; i < salida.length; i++) for (let j = i + 1; j < salida.length; j++) {
    assert(Math.hypot(salida[i].cabeza.x - salida[j].cabeza.x, salida[i].cabeza.y - salida[j].cabeza.y) >= 27.8);
  }
});

test('Camino: separar pines es determinista, acotado y no mueve los que ya están separados', () => {
  const entrada = [pin(0, 150, 200), pin(1, 150, 200), pin(2, 280, 400)];
  const a = separarPinesCamino(entrada, 390, 625), b = separarPinesCamino(entrada, 390, 625);
  assert.deepEqual(a, b);
  assert.deepEqual(a[2].cabeza, entrada[2].cabeza);
  a.forEach((p, i) => assert(Math.hypot(p.cabeza.x - entrada[i].cabeza.x, p.cabeza.y - entrada[i].cabeza.y) <= 48.01));
});
