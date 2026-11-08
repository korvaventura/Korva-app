const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function montar({ registrada = false } = {}) {
  let iniciada = false;
  const altas = [], bajas = [], lotes = [], tareas = new Map();
  const Location = {
    Accuracy: { High: 4 }, ActivityType: { Fitness: 3 },
    hasStartedLocationUpdatesAsync: async () => iniciada,
    startLocationUpdatesAsync: async (id, opciones) => { altas.push({ id, opciones }); iniciada = true; },
    stopLocationUpdatesAsync: async id => { bajas.push(id); iniciada = false; },
  };
  const TaskManager = { isTaskDefined: () => registrada, defineTask: (id, tarea) => tareas.set(id, tarea) };
  const source = fs.readFileSync(path.join(__dirname, '../services/gps/gpsBackgroundTask.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const context = vm.createContext({ Location, TaskManager, procesarUbicacionesGpsLocal: async puntos => lotes.push(puntos) });
  vm.runInContext(source + '\nglobalThis.api = { iniciarGpsBackground, detenerGpsBackground };', context);
  return { ...context.api, altas, bajas, tareas, lotes };
}

test('GPS Android: inicia un servicio persistente con notificación y no duplica el inicio', async () => {
  const s = montar();
  await s.iniciarGpsBackground(); await s.iniciarGpsBackground();
  assert.equal(s.altas.length, 1);
  const c = s.altas[0].opciones;
  assert.equal(c.foregroundService.killServiceOnDestroy, false);
  assert.ok(c.foregroundService.notificationTitle && c.foregroundService.notificationBody);
  assert.equal(c.timeInterval, 2000);
  assert.equal(c.deferredUpdatesInterval, 0);
  assert.equal(c.pausesUpdatesAutomatically, false);
});

test('GPS Android: pausar/finalizar detiene el servicio y volver a iniciar lo registra otra vez', async () => {
  const s = montar();
  await s.iniciarGpsBackground(); await s.detenerGpsBackground(); await s.detenerGpsBackground();
  assert.equal(s.bajas.length, 1);
  await s.iniciarGpsBackground();
  assert.equal(s.altas.length, 2);
});

test('GPS en segundo plano: procesa el lote completo y descarta callbacks sin datos o con error', async () => {
  const s = montar();
  const callback = [...s.tareas.values()][0];
  const puntos = [{ timestamp: 1000, coords: { latitude: 0, longitude: 0 } }, { timestamp: 2000, coords: { latitude: 0, longitude: 0.001 } }];
  await callback({ data: { locations: puntos } });
  await callback({ error: new Error('Sin señal'), data: { locations: puntos } });
  await callback({ data: { locations: [] } });
  assert.equal(s.lotes.length, 1);
  assert.equal(s.lotes[0], puntos);
});

test('GPS: no redefine una tarea que el runtime ya tiene registrada', () => {
  assert.equal(montar({ registrada: true }).tareas.size, 0);
});
