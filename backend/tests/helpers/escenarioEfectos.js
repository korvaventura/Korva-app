// Armado común para los tests de efectos (Etapa 4A-3e): base en memoria, repositorio real,
// efectos reales con los dobles de Resend/Expo/PDF y un reloj controlable.
const { crearSupabaseMemoria } = require('./supabaseMemoria');
const { crearResendFalso, crearExpoFalso, crearPdfFalso, crearSecuenciaSerial } = require('./efectosFalsos');
const { crearRepositorioSupabase } = require('../../lib/progresoRepositorioSupabase');
const { crearEfectosCompletado } = require('../../lib/efectosCompletado');
const { procesarEventosPendientes, procesarEvento } = require('../../lib/completionEventos');
const emails = require('../../routes/emails');

const T0 = Date.parse('2026-10-02T12:00:00Z');
const MIN = 60 * 1000;
const HORA = 60 * MIN;

const U = '11111111-1111-4111-8111-111111111111';
const U_COMPRADOR = '33333333-3333-4333-8333-333333333333';
const U_INVITADO = '44444444-4444-4444-8444-444444444444';

const usuario = (id, extra = {}) => ({
  id, name: `Usuario ${id.slice(0, 4)}`, email: `${id.slice(0, 4)}@ejemplo.com`, bib_number: '0042',
  shipping_address: 'Calle 123', push_token: `ExponentPushToken[${id.slice(0, 4)}]`, ...extra,
});

const CHS = [
  { id: 'c1', title: 'Dubrovnik 19K', modalidades: [{ tipo: 'run', distancia_km: 19.4 }, { tipo: 'ride', distancia_km: 58.2 }], total_distance_km: 19.4 },
  { id: 'c2', title: 'Monte Fuji 68K', modalidades: [{ tipo: 'run', distancia_km: 68 }, { tipo: 'ride', distancia_km: 204 }], total_distance_km: 68 },
];

const ucCompletado = (extra = {}) => ({
  id: 'uc1', user_id: U, challenge_id: 'c1', status: 'completed', modalidad: 'run', started_at: '2026-09-01T00:00:00',
  completed_at: '2026-10-02T11:59:00', km_completed: 20, km_base: 0, km_base_motivo: null, pausado: false, pausado_at: null,
  periodos_pausados: [], group_id: null, certificado_serial: null, recalculo_pendiente_desde: null, ...extra,
});

/**
 * @param {object} [o]
 * @param {object[]} [o.users] [o.ucs] [o.eventos] tablas iniciales
 */
const montarEfectos = ({ users = [usuario(U)], ucs = [ucCompletado()], eventos = null, actividades = [] } = {}) => {
  const reloj = { ahora: T0 };
  const secuencia = crearSecuenciaSerial();
  const m = crearSupabaseMemoria(
    { users, user_challenges: ucs, challenges: CHS, activities: actividades, progreso_eventos: [] },
    { reloj: () => reloj.ahora },
  );
  const resend = crearResendFalso();
  const expo = crearExpoFalso();
  const pdf = crearPdfFalso();
  const repo = crearRepositorioSupabase(m.cliente);
  const efectos = crearEfectosCompletado({
    supabase: m.cliente, generarCertificado: pdf.generarCertificado, emails,
    obtenerResend: () => resend.cliente, fetchImpl: expo.fetchImpl, obtenerSerial: secuencia.siguiente,
  });
  const logs = [];
  let nTok = 0;
  const generarToken = (ms) => `${new Date(ms).toISOString().slice(0, -1)}${String(++nTok % 1000).padStart(3, '0')}Z`;

  /** Crea un evento 'completado' (o del tipo pedido) como lo haría el motor. */
  const crearEvento = async ({ tipo = 'completado', ucId = 'uc1', userId = U, datos } = {}) => {
    const r = await repo.registrarEvento({
      userChallengeId: ucId, userId, tipo,
      datos: datos || { km: 20, objetivo_km: 19.4, motivo: 'test', challenge_titulo: 'Dubrovnik 19K' },
    });
    return r.id;
  };
  const evento = (id) => m.db.progreso_eventos.find((e) => e.id === id);
  const procesar = (extra = {}) => procesarEventosPendientes({
    repo, efectos, ahoraMs: reloj.ahora, generarToken, log: (l) => logs.push(l), ...extra,
  });
  const procesarUno = (ev, extra = {}) => procesarEvento({
    repo, efectos, evento: JSON.parse(JSON.stringify(ev)), ahoraMs: reloj.ahora, generarToken, log: (l) => logs.push(l), ...extra,
  });
  const fila = (id = 'uc1') => m.db.user_challenges.find((x) => x.id === id);
  return { m, repo, efectos, resend, expo, pdf, secuencia, reloj, logs, crearEvento, evento, procesar, procesarUno, fila, generarToken };
};

module.exports = { montarEfectos, usuario, ucCompletado, CHS, U, U_COMPRADOR, U_INVITADO, T0, MIN, HORA };
