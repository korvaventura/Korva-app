// Tests de los efectos REALES de completar (lib/efectosCompletado.js + certificadoSerial.js,
// Etapa 4A-3e) con dobles de Resend (con semántica real de idempotencia), Expo y el PDF.
// Garantías verificadas: un único serial por desafío (también contra el camino viejo), emails
// deterministas efectivamente una vez, email al usuario y push a lo sumo una vez, y caídas en
// cualquier punto que convergen sin duplicar.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  montarEfectos, usuario, ucCompletado, U, U_COMPRADOR, U_INVITADO, MIN, HORA,
} = require('./helpers/escenarioEfectos');
const { reservarSerialCertificado } = require('../lib/certificadoSerial');
const { clasificarResend } = require('../lib/efectosCompletado');
const { LEASE_MS_DEFECTO, ESPERAS_REINTENTO_MS, MAX_INTENTOS } = require('../lib/completionEventos');

const esperarHasta = async (cond, max = 10000) => {
  for (let i = 0; i < max && !cond(); i++) await new Promise((r) => setImmediate(r));
  if (!cond()) throw new Error('la condición nunca se cumplió');
};

const otroDesafio = () => ({ ...ucCompletado({ id: 'uc2', challenge_id: 'c2', status: 'active', completed_at: null }) });

// ---------------------------------------------------------------------------
// Casos normales
// ---------------------------------------------------------------------------

test('individual: un serial, "medalla lista", email con certificado y push; claves por evento y paso', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  const r = await s.procesar({ ids: [id] });
  assert.equal(r[0].estado, 'hecho');
  assert.equal(s.fila().certificado_serial, 'KORVA-2026-0001');
  assert.equal(s.resend.entregadosDe('email_admin_medalla').length, 1);
  const deUsuario = s.resend.entregadosDe('email_usuario');
  assert.equal(deUsuario.length, 1);
  assert.equal(deUsuario[0].adjuntos, 1);
  assert.equal(deUsuario[0].para, usuario(U).email);
  assert.equal(s.resend.entregadosDe('email_consolidado').length, 0); // no tiene otros desafíos
  assert.equal(s.expo.entregados.length, 1);
  assert.match(s.expo.entregados[0].body, /Dubrovnik 19K/);
  assert.ok(s.resend.llamadas.every((l) => l.clave === `korva-evt-${id}-${l.clave.split(`${id}-`)[1]}`));
  const ef = s.evento(id).resultado.efectos;
  assert.deepEqual(Object.fromEntries(Object.entries(ef).map(([k, v]) => [k, v.estado])), {
    serial: 'ok', contexto: 'ok', email_admin_medalla: 'ok', email_usuario: 'ok', email_consolidado: 'omitido', push_completado: 'ok',
  });
  assert.equal(ef.serial.propio, true);
  // El contexto congelado no guarda emails.
  assert.ok(!JSON.stringify(ef.contexto).includes('@'));
});

test('con otros desafíos: también sale el aviso de envío consolidado', async () => {
  const s = montarEfectos({ ucs: [ucCompletado(), otroDesafio()] });
  const id = await s.crearEvento();
  await s.procesar({ ids: [id] });
  const c = s.resend.entregadosDe('email_consolidado');
  assert.equal(c.length, 1);
  assert.match(c[0].asunto, /Envío consolidado/);
});

test('grupo — invitado: email de invitado, sin "medalla lista" ni consolidado', async () => {
  const s = montarEfectos({
    users: [usuario(U), usuario(U_COMPRADOR, { name: 'Ana Compradora' })],
    ucs: [ucCompletado({ group_id: U_COMPRADOR })],
  });
  const id = await s.crearEvento();
  await s.procesar({ ids: [id] });
  assert.equal(s.resend.entregadosDe('email_admin_medalla').length, 0);
  assert.equal(s.resend.entregadosDe('email_usuario').length, 1);
  assert.equal(s.evento(id).resultado.efectos.email_admin_medalla.estado, 'omitido');
  assert.equal(s.evento(id).estado, 'hecho');
});

test('grupo — comprador con otro miembro ya completado: sin "medalla lista" repetido', async () => {
  const s = montarEfectos({
    users: [usuario(U_COMPRADOR), usuario(U_INVITADO)],
    ucs: [
      ucCompletado({ user_id: U_COMPRADOR, group_id: U_COMPRADOR }),
      ucCompletado({ id: 'uc9', user_id: U_INVITADO, group_id: U_COMPRADOR, status: 'shipped' }),
    ],
  });
  const id = await s.crearEvento({ userId: U_COMPRADOR });
  await s.procesar({ ids: [id] });
  assert.equal(s.resend.entregadosDe('email_admin_medalla').length, 0);
  assert.equal(s.resend.entregadosDe('email_usuario').length, 1);
});

test('grupo — primer comprador en completar: "medalla lista" con la lista de miembros', async () => {
  const s = montarEfectos({
    users: [usuario(U_COMPRADOR), usuario(U_INVITADO)],
    ucs: [
      ucCompletado({ user_id: U_COMPRADOR, group_id: U_COMPRADOR }),
      ucCompletado({ id: 'uc9', user_id: U_INVITADO, group_id: U_COMPRADOR, status: 'active', completed_at: null }),
    ],
  });
  const id = await s.crearEvento({ userId: U_COMPRADOR });
  await s.procesar({ ids: [id] });
  assert.equal(s.resend.entregadosDe('email_admin_medalla').length, 1);
});

// ---------------------------------------------------------------------------
// Serial: único por desafío, también contra el camino viejo
// ---------------------------------------------------------------------------

test('el camino viejo ya emitió el certificado: el motor NO manda emails (sí el push)', async () => {
  const s = montarEfectos({ ucs: [ucCompletado({ certificado_serial: 'KORVA-2026-0999' })] });
  const id = await s.crearEvento();
  const r = await s.procesar({ ids: [id] });
  assert.equal(r[0].estado, 'hecho');
  assert.equal(s.fila().certificado_serial, 'KORVA-2026-0999');
  assert.equal(s.resend.entregados.length, 0);
  assert.equal(s.pdf.estado.llamadas, 0);
  assert.equal(s.evento(id).resultado.efectos.serial.propio, false);
  assert.equal(s.expo.entregados.length, 1);
});

test('carrera de seriales: motor vs camino viejo (reserva atómica) → un solo serial y un solo certificado', async () => {
  const ganadores = { viejo: 0, motor: 0 };
  for (let i = 0; i < 40; i++) {
    const s = montarEfectos();
    const id = await s.crearEvento();
    // El camino viejo arranca i "vueltas" más tarde: recorre todos los intercalados posibles.
    const viejo = async () => {
      for (let k = 0; k < i; k++) await new Promise((r) => setImmediate(r));
      return reservarSerialCertificado(s.m.cliente, 'uc1', s.secuencia.siguiente);
    };
    const resultados = await Promise.all([viejo(), s.procesar({ ids: [id] })]);
    const reservasViejas = resultados[0].reservado ? 1 : 0;
    ganadores[reservasViejas ? 'viejo' : 'motor'] += 1;
    const propioMotor = s.evento(id).resultado.efectos.serial.propio;
    assert.equal(reservasViejas + (propioMotor ? 1 : 0), 1, `corrida ${i}: hubo ${reservasViejas} reservas viejas y motor propio=${propioMotor}`);
    assert.equal(s.resend.entregadosDe('email_usuario').length, propioMotor ? 1 : 0);
  }
  assert.ok(ganadores.viejo > 0 && ganadores.motor > 0, `deben darse los dos resultados: ${JSON.stringify(ganadores)}`);
});

test('reservarSerialCertificado (camino viejo): concurrente → exactamente una reserva; si ya tiene, no reserva', async () => {
  const s = montarEfectos();
  const rs = await Promise.all(Array.from({ length: 10 }, () => reservarSerialCertificado(s.m.cliente, 'uc1', s.secuencia.siguiente)));
  assert.equal(rs.filter((r) => r.reservado).length, 1);
  const ganador = rs.find((r) => r.reservado).serial;
  assert.equal(s.fila().certificado_serial, ganador);
  assert.ok(rs.filter((r) => !r.reservado).every((r) => r.serial === ganador));
  assert.deepEqual(await reservarSerialCertificado(s.m.cliente, 'uc1', s.secuencia.siguiente), { reservado: false, serial: ganador });
});

test('caída después de reservar el serial y antes de guardar: el reintento lo reconoce como propio', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  // El proceso muere justo después del UPDATE que reserva el serial (antes de guardar 'ok').
  const original = s.repo.guardarAvanceEventoCAS;
  let reservas = 0;
  const repoQueMuere = { ...s.repo, guardarAvanceEventoCAS: async (args) => {
    if (s.fila().certificado_serial && args.resultado.efectos.serial?.estado === 'ok' && reservas++ === 0) return new Promise(() => {});
    return original(args);
  } };
  s.procesar({ repo: repoQueMuere, ids: [id] });
  await esperarHasta(() => reservas > 0);
  assert.equal(s.fila().certificado_serial, 'KORVA-2026-0001');
  assert.equal(s.evento(id).resultado.efectos.serial.estado, 'en_curso');
  s.reloj.ahora += LEASE_MS_DEFECTO + MIN;
  const r = await s.procesar();
  assert.equal(r[0].estado, 'hecho');
  assert.equal(s.evento(id).resultado.efectos.serial.propio, true);
  assert.equal(s.fila().certificado_serial, 'KORVA-2026-0001');
  assert.equal(s.resend.entregadosDe('email_usuario').length, 1);
});

// ---------------------------------------------------------------------------
// Clasificación de Resend y reintentos
// ---------------------------------------------------------------------------

test('clasificación de Resend', () => {
  const c = (respuesta, extra = {}) => clasificarResend({ respuesta, determinista: true, previo: null, ahoraMs: 0, ...extra }).estado;
  assert.equal(c({ data: { id: 'x' }, error: null }), 'ok');
  assert.equal(c({ data: null, error: { name: 'validation_error', statusCode: 422 } }), 'definitivo');
  assert.equal(c({ data: null, error: { name: 'rate_limit_exceeded', statusCode: 429 } }), 'error');
  assert.equal(c({ data: null, error: { name: 'concurrent_idempotent_requests', statusCode: 409 } }), 'error');
  assert.equal(c({ data: null, error: { name: 'invalid_idempotent_request', statusCode: 409 } }), 'incierto');
  assert.equal(c({ data: null, error: { name: 'missing_api_key', statusCode: 401 } }), 'error');
  assert.equal(c({ data: null, error: { name: 'internal_server_error', statusCode: 500 } }), 'error'); // determinista: reintento seguro
  assert.equal(c({ data: null, error: { name: 'internal_server_error', statusCode: 500 } }, { determinista: false }), 'incierto');
  assert.equal(clasificarResend({ excepcion: new Error('timeout'), determinista: false, previo: null, ahoraMs: 0 }).estado, 'incierto');
  // Determinista pero fuera de la ventana de 23 h: incierto.
  assert.equal(c({ data: null, error: { name: 'internal_server_error', statusCode: 500 } }, { previo: { desde: '2026-10-01T00:00:00Z' }, ahoraMs: Date.parse('2026-10-02T00:00:01Z') }), 'incierto');
});

test('"medalla lista": 5xx después de entregar → reintento con la misma clave → entregado UNA vez', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  s.resend.fallas.push({ paso: 'email_admin_medalla', veces: 1, entregarAntes: true, error: { name: 'internal_server_error', statusCode: 500, message: 'boom' } });
  const r1 = await s.procesar({ ids: [id] });
  assert.equal(r1[0].estado, 'error');
  assert.equal(s.evento(id).resultado.efectos.email_admin_medalla.ambiguo, true);
  s.reloj.ahora += ESPERAS_REINTENTO_MS[0] + 1;
  const r2 = await s.procesar();
  assert.equal(r2[0].estado, 'hecho');
  assert.equal(s.resend.entregadosDe('email_admin_medalla').length, 1);
  assert.equal(s.resend.llamadas.filter((l) => l.clave.endsWith('email_admin_medalla')).length, 2);
});

test('"medalla lista": 429 (no salió) → se reintenta y sale una vez', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  s.resend.fallas.push({ paso: 'email_admin_medalla', veces: 1, error: { name: 'rate_limit_exceeded', statusCode: 429 } });
  await s.procesar({ ids: [id] });
  s.reloj.ahora += ESPERAS_REINTENTO_MS[0] + 1;
  assert.equal((await s.procesar())[0].estado, 'hecho');
  assert.equal(s.resend.entregadosDe('email_admin_medalla').length, 1);
});

test('"medalla lista" con email inválido (validación): definitivo → intervención; el email al usuario igual sale', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  s.resend.fallas.push({ paso: 'email_admin_medalla', veces: 1, error: { name: 'validation_error', statusCode: 422 } });
  const r = await s.procesar({ ids: [id] });
  assert.equal(r[0].requiere_intervencion, true);
  assert.equal(s.resend.entregadosDe('email_usuario').length, 1);
  assert.equal(s.evento(id).intentos, MAX_INTENTOS);
});

test('email al usuario: 5xx (dudoso) → incierto, NO se reintenta → intervención', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  s.resend.fallas.push({ paso: 'email_usuario', veces: 1, entregarAntes: true, error: { name: 'internal_server_error', statusCode: 500 } });
  const r = await s.procesar({ ids: [id] });
  assert.equal(r[0].requiere_intervencion, true);
  assert.equal(s.evento(id).resultado.efectos.email_usuario.estado, 'incierto');
  s.reloj.ahora += 24 * HORA;
  assert.equal((await s.procesar()).length, 0);
  assert.equal(s.resend.entregadosDe('email_usuario').length, 1); // a lo sumo una vez
});

test('email al usuario: excepción de red → incierto', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  s.resend.fallas.push({ paso: 'email_usuario', veces: 1, tipo: 'excepcion' });
  await s.procesar({ ids: [id] });
  assert.equal(s.evento(id).resultado.efectos.email_usuario.estado, 'incierto');
});

test('409 de clave usada con otro contenido → incierto', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  s.resend.fallas.push({ paso: 'email_admin_medalla', veces: 1, error: { name: 'invalid_idempotent_request', statusCode: 409 } });
  await s.procesar({ ids: [id] });
  assert.equal(s.evento(id).resultado.efectos.email_admin_medalla.estado, 'incierto');
  assert.equal(s.evento(id).resultado.requiere_intervencion, true);
});

test('PDF que no se pudo generar: no se envía nada; el reintento manda el email una sola vez', async () => {
  const s = montarEfectos();
  const id = await s.crearEvento();
  s.pdf.estado.fallas = 1;
  const r1 = await s.procesar({ ids: [id] });
  assert.equal(r1[0].estado, 'error');
  assert.equal(s.resend.entregadosDe('email_usuario').length, 0);
  assert.equal(s.resend.entregadosDe('email_admin_medalla').length, 1);
  s.reloj.ahora += ESPERAS_REINTENTO_MS[0] + 1;
  assert.equal((await s.procesar())[0].estado, 'hecho');
  assert.equal(s.resend.entregadosDe('email_usuario').length, 1);
  assert.equal(s.resend.entregadosDe('email_admin_medalla').length, 1);
});

test('usuario sin email: definitivo → intervención', async () => {
  const s = montarEfectos({ users: [usuario(U, { email: null })] });
  const id = await s.crearEvento();
  const r = await s.procesar({ ids: [id] });
  assert.equal(r[0].requiere_intervencion, true);
  assert.equal(s.evento(id).resultado.efectos.email_usuario.estado, 'definitivo');
});

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

test('push: sin token → omitido; ticket con error → definitivo; 5xx → incierto (no crítico: evento hecho)', async () => {
  const sinToken = montarEfectos({ users: [usuario(U, { push_token: null })] });
  const a = await sinToken.crearEvento();
  await sinToken.procesar({ ids: [a] });
  assert.equal(sinToken.evento(a).resultado.efectos.push_completado.estado, 'omitido');
  assert.equal(sinToken.evento(a).estado, 'hecho');

  const ticket = montarEfectos();
  const b = await ticket.crearEvento();
  ticket.expo.fallas.push({ veces: 1, tipo: 'ticket_error' });
  await ticket.procesar({ ids: [b] });
  assert.equal(ticket.evento(b).resultado.efectos.push_completado.estado, 'definitivo');
  assert.equal(ticket.evento(b).estado, 'hecho');

  const caido = montarEfectos();
  const c = await caido.crearEvento();
  caido.expo.fallas.push({ veces: 1, tipo: 'http', status: 503, entregarAntes: true });
  await caido.procesar({ ids: [c] });
  assert.equal(caido.evento(c).resultado.efectos.push_completado.estado, 'incierto');
  caido.reloj.ahora += 24 * HORA;
  await caido.procesar();
  assert.equal(caido.expo.entregados.length, 1); // nunca se reenvía
});

test('cruce_75: con dirección → omitido; sin dirección → push de aviso', async () => {
  const conDir = montarEfectos();
  const a = await conDir.crearEvento({ tipo: 'cruce_75' });
  await conDir.procesar({ ids: [a] });
  assert.equal(conDir.evento(a).resultado.efectos.push_aviso_direccion.estado, 'omitido');
  const sinDir = montarEfectos({ users: [usuario(U, { shipping_address: null })] });
  const b = await sinDir.crearEvento({ tipo: 'cruce_75' });
  await sinDir.procesar({ ids: [b] });
  assert.equal(sinDir.expo.entregados.length, 1);
  assert.match(sinDir.expo.entregados[0].title, /Ya casi llegás/);
});

// ---------------------------------------------------------------------------
// Caídas en CADA punto: siempre converge, sin duplicados
// ---------------------------------------------------------------------------

test('caída antes y después de cada operación (base y servicios externos): converge sin duplicar', async () => {
  // Corrida normal: contar puntos de corte (operaciones del repo de eventos + llamadas externas).
  const normal = montarEfectos({ ucs: [ucCompletado(), otroDesafio()] });
  const idN = await normal.crearEvento();
  let puntos = 0;
  const contar = (obj) => Object.fromEntries(Object.entries(obj).map(([k, fn]) => [k, async (...a) => { puntos += 1; return fn(...a); }]));
  await normal.procesar({ repo: contar(normal.repo), ids: [idN] });
  const total = puntos + normal.resend.llamadas.length + normal.expo.entregados.length;
  assert.ok(total >= 12, `puntos de corte: ${total}`);

  for (let n = 1; n <= total; n++) {
    for (const momento of ['antes', 'despues']) {
      const s = montarEfectos({ ucs: [ucCompletado(), otroDesafio()] });
      const id = await s.crearEvento();
      let k = 0;
      let murio = false;
      const corte = async (fn) => {
        k += 1;
        if (k === n && momento === 'antes') { murio = true; return new Promise(() => {}); }
        const r = await fn();
        if (k === n && momento === 'despues') { murio = true; return new Promise(() => {}); }
        return r;
      };
      const repo = Object.fromEntries(Object.entries(s.repo).map(([nom, fn]) => [nom, (...a) => corte(() => fn(...a))]));
      const sendReal = s.resend.cliente.emails.send;
      s.resend.cliente.emails.send = (...a) => corte(() => sendReal(...a));
      const fetchReal = s.expo.fetchImpl;
      const efectosConCorte = require('../lib/efectosCompletado').crearEfectosCompletado({
        supabase: s.m.cliente, generarCertificado: s.pdf.generarCertificado, emails: require('../routes/emails'),
        obtenerResend: () => s.resend.cliente, fetchImpl: (...a) => corte(() => fetchReal(...a)), obtenerSerial: s.secuencia.siguiente,
      });
      s.procesar({ repo, efectos: efectosConCorte, ids: [id] });
      await esperarHasta(() => murio || (s.evento(id).estado !== 'pendiente' && s.evento(id).estado !== 'procesando'));
      s.resend.cliente.emails.send = sendReal;

      // Proceso nuevo, más tarde (lease vencido y esperas cumplidas), hasta que no quede nada.
      for (let ronda = 0; ronda < MAX_INTENTOS + 2; ronda++) {
        s.reloj.ahora += 9 * HORA;
        await s.procesar();
      }
      const ev = s.evento(id);
      const ctx = `caída ${momento} del punto ${n}/${total}`;
      assert.ok(['hecho', 'error'].includes(ev.estado), `${ctx}: estado ${ev.estado}`);
      if (ev.estado === 'error') assert.equal(ev.resultado.requiere_intervencion, true, `${ctx}: error sin intervención`);
      assert.equal(s.secuencia.usados() <= 2, true, `${ctx}: se pidieron ${s.secuencia.usados()} seriales`);
      assert.ok(s.fila().certificado_serial, `${ctx}: sin serial`);
      for (const paso of ['email_admin_medalla', 'email_usuario', 'email_consolidado']) {
        assert.ok(s.resend.entregadosDe(paso).length <= 1, `${ctx}: ${paso} entregado ${s.resend.entregadosDe(paso).length} veces`);
      }
      assert.ok(s.expo.entregados.length <= 1, `${ctx}: push entregado ${s.expo.entregados.length} veces`);
      // Email al usuario y push: un envío dudoso NUNCA se vuelve a intentar (ni siquiera la llamada).
      const llamadasUsuario = s.resend.llamadas.filter((l) => (l.clave || '').endsWith('-email_usuario')).length;
      assert.ok(llamadasUsuario <= 1, `${ctx}: email al usuario intentado ${llamadasUsuario} veces`);
      if (ev.estado === 'hecho') {
        assert.equal(s.resend.entregadosDe('email_admin_medalla').length, 1, `${ctx}: "medalla lista" no salió`);
        assert.equal(s.resend.entregadosDe('email_usuario').length, 1, `${ctx}: email al usuario no salió`);
      }
    }
  }
});
