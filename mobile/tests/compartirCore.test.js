const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../services/compartirCore');

test('slug del desafío para el nombre de la foto', () => {
  assert.equal(c.slugDesafio('Monte Fuji 68K'), 'monte-fuji');
  assert.equal(c.slugDesafio('San Andrés 57K'), 'san-andres');
  assert.equal(c.slugDesafio('Dubrovnik 19K'), 'dubrovnik');
  assert.equal(c.slugDesafio('Fin del Mundo'), 'fin-del-mundo');
  assert.equal(c.slugDesafio('Camino de Santiago 775K'), 'camino-de-santiago');
  assert.equal(c.slugDesafio('Vía Appia 611K'), 'via-appia');
  assert.equal(c.slugDesafio('Islandia · Ring Road'), 'islandia');
  assert.equal(c.slugDesafio(''), '');
});

test('url pública de la foto en Storage', () => {
  assert.equal(c.urlFondo('Monte Fuji 68K', 'https://x.supabase.co'),
    'https://x.supabase.co/storage/v1/object/public/compartir/monte-fuji.jpg');
  assert.equal(c.urlFondo(''), null);
});

test('paleta: propia del desafío o la de Korva', () => {
  assert.equal(c.paletaDesafio('Monte Fuji 68K').acento, '#D9473C');
  assert.deepEqual(c.paletaDesafio('Desafío nuevo'), c.PALETA_KORVA);
});

test('formatos', () => {
  assert.equal(c.formatoKm(8.2), '8,2');
  assert.equal(c.formatoKm(8), '8');
  assert.equal(c.formatoKm(5.05), '5,05');
  assert.equal(c.formatoKm(12.46), '12,5');
  assert.equal(c.formatoKm(104.6), '105');
  assert.equal(c.formatoDuracion(2832), '47:12');
  assert.equal(c.formatoDuracion(3725), '1:02:05');
  assert.deepEqual(c.formatoRitmo(8.2, 2832, 'run'), { valor: '5:45', unidad: '/km' });
  assert.deepEqual(c.formatoRitmo(30, 3600, 'ride'), { valor: '30,0', unidad: 'km/h' });
  assert.equal(c.formatoRitmo(0, 100, 'run'), null);
});

test('avance antes y después de la salida', () => {
  const a = c.avanceDesafio({ distancia_total: 68, km_completados: '23' }, 8.2);
  assert.ok(Math.abs(a.antes - 14.8 / 68) < 1e-9);
  assert.ok(Math.abs(a.despues - 23 / 68) < 1e-9);
  assert.equal(c.avanceDesafio({ distancia_total: 0 }, 5), null);
  assert.equal(c.avanceDesafio({ distancia_total: 10, km_completados: 3 }, 8).antes, 0);
});

test('trazado encaja en la caja y marca el tramo de hoy', () => {
  const pts = [{ x: 0, z: 0, km: 0 }, { x: 10, z: 0, km: 10 }, { x: 10, z: 5, km: 15 }];
  const t = c.trazadoDesafio(pts, 0.2, 0.6, 200, 100, { pad: 0 });
  assert.match(t.base, /^M/);
  assert.match(t.hecho, /^M/);
  assert.match(t.hoy, /^M/);
  assert.ok(t.punto.x >= 0 && t.punto.x <= 200 && t.punto.y >= 0 && t.punto.y <= 100);
  assert.equal(c.trazadoDesafio(pts, 0, 0, 200, 100).hecho, '');
  assert.equal(c.trazadoDesafio([], 0, 1, 10, 10), null);
});

test('Islandia se puede compartir si la salida es posterior al inicio', () => {
  const p = { started_at: '2026-11-01T00:00:00Z', km: 120 };
  const r = c.retoIslandia(p, { recorded_at: '2026-11-20T10:00:00Z' });
  assert.equal(r.challenge, 'Islandia · Ring Road');
  assert.equal(r.distancia_total, 1400);
  assert.equal(c.slugDesafio(r.challenge), 'islandia');
  assert.equal(c.retoIslandia(p, { recorded_at: '2026-10-20T10:00:00Z' }), null);
  assert.equal(c.retoIslandia({ ...p, abandonado: true }, { recorded_at: '2026-11-20T10:00:00Z' }), null);
  assert.equal(c.retoIslandia(null, {}), null);
});

test('el aviso de Strava encuentra su salida', () => {
  const lista = [{ id: 'a', external_id: '99' }, { id: 'b', external_id: '123' }];
  assert.equal(c.actividadDeAviso({ tipo: 'compartir_actividad', external_id: 123 }, lista).id, 'b');
  assert.equal(c.actividadDeAviso({ tipo: 'otro', external_id: '123' }, lista), null);
  assert.equal(c.actividadDeAviso({ tipo: 'compartir_actividad', external_id: '5' }, lista), null);
  assert.equal(c.actividadDeAviso(null, lista), null);
});

test('foto: prueba .jpg y después .png', () => {
  assert.deepEqual(c.urlsFondo('Islandia · Ring Road', 'https://x'), [
    'https://x/storage/v1/object/public/compartir/islandia.jpg',
    'https://x/storage/v1/object/public/compartir/islandia.png',
  ]);
  assert.deepEqual(c.urlsFondo(''), []);
});
