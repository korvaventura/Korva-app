const test = require('node:test');
const assert = require('node:assert/strict');
const { GPS_ARCHIVE_MAX, construirArchivoGps } = require('../services/gps/gpsArchiveCore');

const sesion = (sessionId, puntos = [{ latitude: 1, longitude: 2 }]) => ({
  sessionId,
  estado: 'finalizada',
  puntos,
  distanciaM: 1234,
});

test('archivo GPS conserva puntos y datos de confirmacion', () => {
  const archivo = construirArchivoGps([], sesion('s1'), { id: 'a1', idempotente: false }, '2026-10-04T08:00:00.000Z');
  assert.equal(archivo.length, 1);
  assert.equal(archivo[0].sessionId, 's1');
  assert.equal(archivo[0].actividadId, 'a1');
  assert.equal(archivo[0].puntos.length, 1);
});

test('archivo GPS reemplaza el mismo sessionId en vez de duplicarlo', () => {
  const previo = construirArchivoGps([], sesion('s1'), { id: 'a1' }, '2026-10-04T08:00:00.000Z');
  const siguiente = construirArchivoGps(previo, sesion('s1', [{ latitude: 3, longitude: 4 }]), { id: 'a1', idempotente: true }, '2026-10-04T08:01:00.000Z');
  assert.equal(siguiente.length, 1);
  assert.equal(siguiente[0].puntos[0].latitude, 3);
  assert.equal(siguiente[0].idempotente, true);
});

test('archivo GPS conserva solo las ultimas 100 actividades', () => {
  const previo = Array.from({ length: GPS_ARCHIVE_MAX }, (_, i) => sesion(`vieja_${i}`));
  const siguiente = construirArchivoGps(previo, sesion('nueva'), { id: 'a_nueva' }, '2026-10-04T08:02:00.000Z');
  assert.equal(siguiente.length, GPS_ARCHIVE_MAX);
  assert.equal(siguiente[0].sessionId, 'nueva');
  assert.equal(siguiente.some((x) => x.sessionId === 'vieja_99'), false);
});

test('archivo GPS rechaza sesiones no finalizadas', () => {
  assert.throws(() => construirArchivoGps([], { ...sesion('s1'), estado: 'grabando' }), /sesion_gps_no_archivable/);
});
