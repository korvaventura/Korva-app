// Escena 3D del Camino de Santiago (prototipo, todavía sin registrar en CONFIGS).
const test = require('node:test');
const assert = require('node:assert/strict');
const escena = require('../services/mapa3d/escenas/caminoSantiago');
const horneado = require('../services/mapa3d/escenas/caminoSantiago.horneado');
const trazado = require('../services/mapa3d/escenas/caminoSantiago.trazado');
const { construirDatosDiorama, crearFuncionAltura, puntoEnKm, indiceCercano } = require('../services/mapa3d/terrenoCore');
const { serializarDiorama, deserializarDiorama } = require('../services/mapa3d/horneadoCore');
const { escenaParaConfig } = require('../services/mapa3d/escenas');

const HITOS = {
  roncesvalles: [0, 43.00917, -1.32], pamplona: [44, 42.8169, -1.6432], puente_la_reina: [69, 42.6729, -1.8141],
  irache: [94, 42.65004, -2.04323], santo_domingo: [194, 42.4402, -2.9537], burgos: [269, 42.3502, -3.6753],
  fromista: [337, 42.2667, -4.4055], leon: [456, 42.6, -5.5703], astorga: [507, 42.4588, -6.056],
  ponferrada: [562, 42.5466, -6.5962], o_cebreiro: [615, 42.70791, -7.04263], portomarin: [679, 42.8062, -7.6164],
  santiago: [775, 42.8806, -8.5458],
};
const deco = deserializarDiorama(escena, horneado);
const { proy } = crearFuncionAltura(escena);
const distKm = (a, b) => Math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 111.2 * Math.cos((42.7 * Math.PI) / 180));
const distTrazado = (lat, lon) => Math.min(...trazado.puntos.slice(1).map((b, i) => {
  const a = trazado.puntos[i];
  const ax = 0; const az = 0; const bx = (b[1] - a[1]) * 81.7; const bz = (b[0] - a[0]) * 111.2;
  const px = (lon - a[1]) * 81.7; const pz = (lat - a[0]) * 111.2;
  const t = Math.max(0, Math.min(1, (px * bx + pz * bz) / ((bx * bx + bz * bz) || 1e-9)));
  return Math.hypot(ax + bx * t - px, az + bz * t - pz);
}));

test('[camino_santiago] horneado sincronizado con el generador', () => {
  assert.deepEqual(horneado, serializarDiorama(construirDatosDiorama(escena)), 'regenerar con: node scripts/hornearMapa3D.js caminoSantiago');
});

test('[camino_santiago] 775 km virtuales, monótonos, de Roncesvalles al Obradoiro', () => {
  assert.equal(deco.ruta[0].km, 0);
  assert.equal(deco.ruta.at(-1).km, 775);
  for (let i = 1; i < deco.ruta.length; i += 1) assert.ok(deco.ruta[i].km >= deco.ruta[i - 1].km);
  assert.deepEqual(trazado.puntos[0], [43.00917, -1.32]);
  assert.deepEqual(trazado.puntos.at(-1), [42.8806, -8.5458]);
});

test('[camino_santiago] cada hito cae en su km virtual y sobre su coordenada (<1 km)', () => {
  for (const [id, [km, lat, lon]] of Object.entries(HITOS)) {
    const ancla = escena.ruta.find((w) => w.km === km);
    assert.ok(ancla, `${id} sin ancla`);
    assert.ok(distKm([ancla.lat, ancla.lon], [lat, lon]) < 1, `${id} lejos de su coordenada`);
    const e = proy.aKm(ancla.lat, ancla.lon);
    const p = puntoEnKm(deco.ruta, km);
    assert.ok(Math.hypot(p.x - e.x, p.z - e.z) < 0.8, `${id} desplazado en el mapa`);
  }
});

test('[camino_santiago] variantes pedidas: San Martín del Camino, San Xil y Real Camino', () => {
  assert.ok(distTrazado(42.4949, -5.8094) < 1, 'debe pasar por San Martín del Camino');
  assert.ok(distTrazado(42.5167, -5.7674) < 1, 'debe pasar por Villadangos del Páramo');
  assert.ok(distTrazado(42.7664, -7.2705) < 1, 'debe pasar por San Xil');
  assert.ok(distTrazado(42.731, -7.3258) > 3, 'no debe ir por Samos');
  assert.ok(distTrazado(42.3875, -5.14417) < 1, 'debe pasar por Bercianos del Real Camino');
  assert.ok(distTrazado(42.42278, -5.22139) < 1, 'debe pasar por El Burgo Ranero');
});

test('[camino_santiago] no es una línea entre paradas: localidades intermedias sobre el trazado', () => {
  const intermedias = [[42.6718, -2.0323], [42.4667, -2.45], [42.4182, -2.7287], [42.4205, -3.1913], [42.3413, -4.6007],
    [42.3708, -5.0294], [42.4989, -5.4174], [42.4635, -5.8864], [42.606, -6.8107], [42.7815, -7.4143], [42.9138, -8.015], [42.9333, -8.15]];
  for (const [lat, lon] of intermedias) assert.ok(distTrazado(lat, lon) < 1, `${lat},${lon} fuera del trazado`);
  assert.ok(trazado.puntos.length > 500);
});

test('[camino_santiago] relieve: Cruz de Ferro y O Cebreiro son altos, la Meseta llana y Santiago baja', () => {
  const h = (km) => puntoEnKm(deco.ruta, km).h;
  const cruz = escena.perfilRuta.find(([, m]) => m === 1500)[0];
  assert.ok(h(cruz) > 1300, `Cruz de Ferro ${h(cruz)}`);
  assert.ok(h(615) > 1150, `O Cebreiro ${h(615)}`);
  assert.ok(h(775) < 400, `Santiago ${h(775)}`);
  for (let km = 340; km <= 450; km += 10) assert.ok(Math.abs(h(km) - 830) < 120, `Meseta km ${km}: ${h(km)}`);
});

test('[camino_santiago] la ruta nunca queda bajo el agua y la malla entra en presupuesto', () => {
  for (const p of deco.ruta) {
    const nivel = deco.campo.agua[indiceCercano(deco.campo, p.x, p.z)];
    assert.ok(!(nivel > -Infinity && p.h < nivel - 1), `km ${p.km.toFixed(1)} bajo el agua`);
  }
  assert.ok(deco.campo.nx * deco.campo.nz < 90000, 'malla más pesada que Fin del Mundo');
});

test('[camino_santiago] coordinación: no está activada ni tiene UUID', () => {
  assert.equal(escenaParaConfig('camino_santiago'), null);
});
