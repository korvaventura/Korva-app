// Tests del procesamiento durable de eventos (lib/completionEventos.js, Etapa 4A-3e) con efectos
// controlables: reclamo con CAS, fencing por token, intentos al reclamar, pasos parciales,
// 'en_curso' tras una caída, dependencias, máximo de intentos, esperas y gracia.
// Usa el repositorio Supabase REAL sobre la base en memoria.
const test = require('node:test');
const assert = require('node:assert/strict');
const { montarEfectos, MIN, HORA } = require('./helpers/escenarioEfectos');
const { procesarEvento, procesarEventosPendientes, MAX_INTENTOS, ESPERAS_REINTENTO_MS, LEASE_MS_DEFECTO } = require('../lib/completionEventos');

const PASOS = ['serial', 'contexto', 'email_admin_medalla', 'email_usuario', 'email_consolidado', 'push_completado'];
const EXTERNOS = ['email_admin_medalla', 'email_usuario', 'email_consolidado', 'push_completado'];

/**
 * Efectos falsos: cuentan ejecuciones y "envíos" reales. `plan[paso]` = lista de resultados por
 * llamada ('ok' | 'error' | 'definitivo' | 'incierto' | 'omitido' | 'colgar' | 'lanzar').
 * 'colgar' registra la intención y espera una barrera (simula un proceso que se cuelga/muere).
 */
const efectosFalsos = (plan = {}, { reintentoSeguro = ['email_admin_medalla', 'email_consolidado'] } = {}) => {
  const ejecuciones = Object.fromEntries(PASOS.map((p) => [p, 0]));
  const envios = Object.fromEntries(PASOS.map((p) => [p, 0]));
  const barreras = {};
  const efectos = {};
  for (const paso of PASOS) {
    efectos[paso] = {
      alEncontrarEnCurso: EXTERNOS.includes(paso) ? (reintentoSeguro.includes(paso) ? () => 'reintentar' : () => 'incierto') : () => 'reintentar',
      ejecutar: async (ctx) => {
        ejecuciones[paso] += 1;
        const accion = (plan[paso] || [])[ejecuciones[paso] - 1] || 'ok';
        if (EXTERNOS.includes(paso)) await ctx.guardarIntencion({});
        if (accion === 'colgar') {
          let soltar;
          barreras[paso] = new Promise((r) => { soltar = r; });
          barreras[`${paso}_soltar`] = soltar;
          await barreras[paso];
          envios[paso] += 1;
          return { estado: 'ok' };
        }
        if (accion === 'lanzar') throw new Error(`falla inesperada en ${paso}`);
        if (accion === 'ok' && EXTERNOS.includes(paso)) envios[paso] += 1;
        return { estado: accion, ...(accion === 'error' ? { error: `falla simulada ${paso}` } : {}) };
      },
    };
  }
  return { efectos, ejecuciones, envios, barreras };
};

const esperarHasta = async (cond, max = 10000) => {
  for (let i = 0; i < max && !cond(); i++) await new Promise((r) => setImmediate(r));
  if (!cond()) throw new Error('la condición nunca se cumplió');
};

test('todos los pasos una sola vez; una segunda pasada no reprocesa', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const f = efectosFalsos();
  const r1 = await procesarEventosPendientes({ repo: s.repo, efectos: f.efectos, ids: [id], ahoraMs: s.reloj.ahora });
  assert.equal(r1[0].estado, 'hecho');
  const r2 = await procesarEventosPendientes({ repo: s.repo, efectos: f.efectos, ahoraMs: s.reloj.ahora + HORA });
  assert.equal(r2.length, 0);
  assert.deepEqual(Object.values(f.ejecuciones), [1, 1, 1, 1, 1, 1]);
  assert.equal(s.evento(id).intentos, 1);
  assert.equal(s.evento(id).procesando_desde, null);
  assert.equal(s.evento(id).resultado.requiere_intervencion, false);
});

test('dos procesadores a la vez: solo uno reclama; cada efecto corre una vez', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const f = efectosFalsos();
  const ev = JSON.parse(JSON.stringify(s.evento(id)));
  const [a, b] = await Promise.all([
    procesarEvento({ repo: s.repo, efectos: f.efectos, evento: ev, ahoraMs: s.reloj.ahora, generarToken: s.generarToken }),
    procesarEvento({ repo: s.repo, efectos: f.efectos, evento: ev, ahoraMs: s.reloj.ahora, generarToken: s.generarToken }),
  ]);
  assert.equal([a, b].filter((x) => x.procesado).length, 1);
  assert.equal([a, b].filter((x) => x.motivo === 'no_reclamado').length, 1);
  assert.deepEqual(Object.values(f.envios), [0, 0, 1, 1, 1, 1]);
});

test('intentos se suma AL RECLAMAR (un proceso que muere también cuenta)', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const f = efectosFalsos({ push_completado: ['colgar'] });
  s.procesar({ efectos: f.efectos, ids: [id] }); // queda colgado en el push
  await esperarHasta(() => !!f.barreras.push_completado);
  assert.equal(s.evento(id).estado, 'procesando');
  assert.equal(s.evento(id).intentos, 1);
});

test('lease vencido: otro procesador toma el evento y el viejo queda CERCADO (no escribe ni repite)', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const f = efectosFalsos({ push_completado: ['colgar'] });
  const viejo = s.procesar({ efectos: f.efectos, ids: [id] });
  await esperarHasta(() => !!f.barreras.push_completado);
  // Pasa el lease: un procesador nuevo encuentra el push 'en_curso' → incierto (no lo reenvía).
  s.reloj.ahora += LEASE_MS_DEFECTO + MIN;
  const nuevo = await s.procesar({ efectos: f.efectos });
  assert.equal(nuevo[0].estado, 'hecho'); // el push no es crítico
  assert.equal(s.evento(id).resultado.efectos.push_completado.estado, 'incierto');
  // El viejo "despierta": su escritura falla por fencing; no pisa el resultado.
  f.barreras.push_completado_soltar();
  const r = await viejo;
  assert.equal(r[0].motivo, 'cercado');
  assert.equal(s.evento(id).estado, 'hecho');
  assert.equal(s.evento(id).resultado.efectos.push_completado.estado, 'incierto');
  assert.equal(f.envios.push_completado, 1); // a lo sumo una vez
  assert.equal(f.ejecuciones.email_usuario, 1); // lo ya hecho no se repitió
});

test('fencing: con el evento en manos de otro procesador, el viejo NO puede escribir ni seguir', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const f = efectosFalsos({ email_admin_medalla: ['colgar'], email_usuario: ['colgar'] });
  const viejo = s.procesar({ efectos: f.efectos, ids: [id] });
  await esperarHasta(() => !!f.barreras.email_admin_medalla);
  const soltarViejo = f.barreras.email_admin_medalla_soltar;
  s.reloj.ahora += LEASE_MS_DEFECTO + MIN;
  // El nuevo reclama, reintenta el email determinista y se cuelga en el email al usuario.
  delete f.barreras.email_usuario;
  const nuevo = s.procesar({ efectos: f.efectos });
  await esperarHasta(() => !!f.barreras.email_usuario);
  soltarViejo(); // el viejo "despierta" mientras el nuevo todavía tiene el evento
  const rv = await viejo;
  assert.equal(rv[0].motivo, 'cercado');
  assert.equal(s.evento(id).resultado.efectos.email_usuario.estado, 'en_curso'); // no pisó el avance del nuevo
  assert.equal(f.ejecuciones.email_usuario, 1); // el viejo no siguió con los pasos siguientes
  f.barreras.email_usuario_soltar();
  const rn = await nuevo;
  assert.equal(rn[0].estado, 'hecho');
  assert.equal(f.ejecuciones.email_usuario, 1);
});

test('fallo parcial: falla el push → reintento posterior solo repite el push', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const f = efectosFalsos({ push_completado: ['error'] });
  const r1 = await s.procesar({ efectos: f.efectos, ids: [id] });
  assert.equal(r1[0].estado, 'error');
  assert.equal(r1[0].requiere_intervencion, false);
  s.reloj.ahora += ESPERAS_REINTENTO_MS[0] + 1;
  const r2 = await s.procesar({ efectos: f.efectos });
  assert.equal(r2[0].estado, 'hecho');
  assert.deepEqual(f.envios, { serial: 0, contexto: 0, email_admin_medalla: 1, email_usuario: 1, email_consolidado: 1, push_completado: 1 });
  assert.equal(f.ejecuciones.push_completado, 2);
  assert.equal(f.ejecuciones.email_usuario, 1);
});

test('email determinista "en_curso" tras una caída: se reintenta (la clave lo protege)', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const f = efectosFalsos({ email_admin_medalla: ['colgar'] });
  s.procesar({ efectos: f.efectos, ids: [id] });
  await esperarHasta(() => !!f.barreras.email_admin_medalla);
  s.reloj.ahora += LEASE_MS_DEFECTO + MIN;
  const r = await s.procesar({ efectos: f.efectos });
  assert.equal(r[0].estado, 'hecho');
  assert.equal(f.ejecuciones.email_admin_medalla, 2);
});

test('email al usuario "en_curso" tras una caída: incierto, NO se reintenta, requiere intervención', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const f = efectosFalsos({ email_usuario: ['colgar'] });
  s.procesar({ efectos: f.efectos, ids: [id] });
  await esperarHasta(() => !!f.barreras.email_usuario);
  s.reloj.ahora += LEASE_MS_DEFECTO + MIN;
  const r = await s.procesar({ efectos: f.efectos });
  assert.equal(r[0].estado, 'error');
  assert.equal(r[0].requiere_intervencion, true);
  assert.equal(s.evento(id).resultado.efectos.email_usuario.estado, 'incierto');
  assert.equal(s.evento(id).intentos, MAX_INTENTOS); // ya no se lista
  assert.equal(f.ejecuciones.email_usuario, 1);
  s.reloj.ahora += 24 * HORA;
  assert.equal((await s.procesar({ efectos: f.efectos })).length, 0);
});

test('error inesperado DESPUÉS de registrar la intención: incierto (no se reintenta)', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const f = efectosFalsos({ push_completado: ['lanzar'] });
  const r = await s.procesar({ efectos: f.efectos, ids: [id] });
  assert.equal(s.evento(id).resultado.efectos.push_completado.estado, 'incierto');
  assert.equal(r[0].estado, 'hecho'); // no crítico
});

test('dependencias: si falla el contexto, los emails esperan; el push igual sale', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const f = efectosFalsos({ contexto: ['error'] });
  const r1 = await s.procesar({ efectos: f.efectos, ids: [id] });
  assert.equal(r1[0].estado, 'error');
  assert.equal(f.ejecuciones.email_admin_medalla, 0);
  assert.equal(f.envios.push_completado, 1);
  s.reloj.ahora += ESPERAS_REINTENTO_MS[0] + 1;
  const r2 = await s.procesar({ efectos: f.efectos });
  assert.equal(r2[0].estado, 'hecho');
  assert.deepEqual([f.envios.email_admin_medalla, f.envios.email_usuario, f.envios.push_completado], [1, 1, 1]);
});

test('paso crítico definitivo: los dependientes quedan bloqueados y el evento va a intervención', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const f = efectosFalsos({ contexto: ['definitivo'] });
  const r = await s.procesar({ efectos: f.efectos, ids: [id] });
  assert.equal(r[0].requiere_intervencion, true);
  const ef = s.evento(id).resultado.efectos;
  assert.deepEqual([ef.email_admin_medalla.estado, ef.email_usuario.estado, ef.email_consolidado.estado], ['bloqueado', 'bloqueado', 'bloqueado']);
  assert.equal(ef.push_completado.estado, 'ok');
  assert.equal(s.evento(id).intentos, MAX_INTENTOS);
  assert.ok(s.logs.some((l) => l.resultado === 'evento_requiere_intervencion'));
});

test('máximo de intentos: un error transitorio permanente termina en intervención al 8.º intento', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const f = efectosFalsos({ email_admin_medalla: Array(20).fill('error') });
  let r = await s.procesar({ efectos: f.efectos, ids: [id] });
  for (let i = 1; i < 20 && !r[0]?.requiere_intervencion; i++) {
    s.reloj.ahora += 9 * HORA; // más que cualquier espera
    r = await s.procesar({ efectos: f.efectos });
  }
  assert.equal(f.ejecuciones.email_admin_medalla, MAX_INTENTOS);
  assert.equal(s.evento(id).intentos, MAX_INTENTOS);
  assert.equal(s.evento(id).resultado.requiere_intervencion, true);
  assert.equal(f.envios.email_usuario, 1); // lo independiente salió una sola vez
  s.reloj.ahora += 9 * HORA;
  assert.equal((await s.procesar({ efectos: f.efectos })).length, 0);
});

test('esperas entre reintentos: no antes de la espera, sí después', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const f = efectosFalsos({ push_completado: ['error', 'error'] });
  await s.procesar({ efectos: f.efectos, ids: [id] });
  s.reloj.ahora += ESPERAS_REINTENTO_MS[0] - 1000;
  assert.equal((await s.procesar({ efectos: f.efectos })).length, 0);
  s.reloj.ahora += 2000;
  assert.equal((await s.procesar({ efectos: f.efectos })).length, 1); // 2.º intento
  s.reloj.ahora += ESPERAS_REINTENTO_MS[1] - 1000;
  assert.equal((await s.procesar({ efectos: f.efectos })).length, 0); // la 2.ª espera es más larga
  s.reloj.ahora += 2000;
  assert.equal((await s.procesar({ efectos: f.efectos }))[0].estado, 'hecho');
});

test('gracia: la ronda periódica no toma un pendiente recién creado; el pedido que lo creó sí', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const f = efectosFalsos();
  assert.equal((await s.procesar({ efectos: f.efectos })).length, 0);
  assert.equal((await s.procesar({ efectos: f.efectos, ids: [id] }))[0].estado, 'hecho');
});

test('un "procesando" abandonado que ya agotó los intentos se cierra para intervención sin ejecutar nada', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  Object.assign(s.evento(id), { estado: 'procesando', intentos: MAX_INTENTOS, procesando_desde: '2026-10-02T11:00:00.000001Z' });
  const f = efectosFalsos();
  const r = await s.procesar({ efectos: f.efectos });
  assert.equal(r[0].requiere_intervencion, true);
  assert.equal(s.evento(id).estado, 'error');
  assert.equal(s.evento(id).resultado.requiere_intervencion, true);
  assert.deepEqual(Object.values(f.ejecuciones), [0, 0, 0, 0, 0, 0]);
});

test('tipo de evento desconocido: requiere intervención (no se pierde en silencio)', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento({ tipo: 'otro' });
  const r = await s.procesar({ efectos: efectosFalsos().efectos, ids: [id] });
  assert.equal(r[0].requiere_intervencion, true);
  assert.match(s.evento(id).ultimo_error, /desconocido/);
});

test('efecto no configurado: error reintentable (no se marca hecho)', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const { efectos } = efectosFalsos();
  delete efectos.push_completado;
  const r = await s.procesar({ efectos, ids: [id] });
  assert.equal(r[0].estado, 'error');
  assert.match(s.evento(id).ultimo_error, /no configurado/);
});

test('repositorio: con un token que no es el dueño, ni el avance ni el cierre escriben', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const leido = JSON.parse(JSON.stringify(s.evento(id)));
  const reclamado = await s.repo.reclamarEventoCAS({ leido, token: 'TOKEN-A' });
  assert.equal(reclamado.intentos, 1);
  assert.equal(await s.repo.reclamarEventoCAS({ leido, token: 'TOKEN-B' }), null); // versión vieja: no reclama
  assert.equal(await s.repo.guardarAvanceEventoCAS({ id, token: 'TOKEN-B', resultado: { x: 1 } }), false);
  assert.equal(await s.repo.finalizarEventoCAS({ id, token: 'TOKEN-B', estado: 'hecho', resultado: {} }), false);
  assert.equal(s.evento(id).estado, 'procesando');
  assert.equal(await s.repo.guardarAvanceEventoCAS({ id, token: 'TOKEN-A', resultado: { x: 1 } }), true);
  assert.equal(await s.repo.finalizarEventoCAS({ id, token: 'TOKEN-A', estado: 'hecho', resultado: { x: 1 } }), true);
  assert.equal(s.evento(id).estado, 'hecho');
});
