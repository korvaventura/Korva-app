// Etapa 4B-1 — Health + motor 4A en SOMBRA, solo admin y solo lectura.
// GET /admin/progreso-health-sombra?user_id=<uuid>&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
// También acepta email=<email>. Máximo 31 días de daily_movement por consulta.
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const requireAdmin = require('../middleware/requireAdmin');
const { calcularProgresoChallenge } = require('../lib/progresoDesafio');
const { calcularResidualDia, sumarDias } = require('../lib/residualMovimiento');
const { REGLA_VERSION, simularHealthParaDesafio } = require('../lib/progresoHealthSombra');

const getSupabase = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET);
const MAX_DIAS = 31;
const PAGINA = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UC_FIELDS = 'id, user_id, challenge_id, status, started_at, pausado, pausado_at, periodos_pausados, version, modalidad, km_completed, km_base, km_base_motivo';
const CH_FIELDS = 'id, title, modalidades, total_distance_km';
const ACT_FIELDS = 'id, user_id, source, sport_type, distance_km, duration_seconds, recorded_at, excluida';
const DM_FIELDS = 'fecha, timezone, distancia_caminando_km, distancia_bici_km, pasos, tipo_medicion, plataforma, cerrado, raw_payload, updated_at';

const fechaValida = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number); const x = new Date(Date.UTC(a, m - 1, d));
  return x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
};
const rangoFechas = (desde, hasta) => { const r = []; for (let f = desde; f <= hasta; f = sumarDias(f, 1)) r.push(f); return r; };
const traerTodo = async (crear) => {
  const out = [];
  for (let i = 0; ; i += PAGINA) {
    const { data, error } = await crear().order('id', { ascending: true }).range(i, i + PAGINA - 1);
    if (error) throw error; out.push(...(data || [])); if (!data || data.length < PAGINA) break;
  }
  return out;
};

router.get('/', requireAdmin, async (req, res) => {
  const { user_id: userIdParam, email, desde, hasta } = req.query;
  const errores = [];
  if (!userIdParam && !email) errores.push('Falta user_id o email');
  if (userIdParam && !UUID_RE.test(String(userIdParam))) errores.push('user_id inválido');
  if (!fechaValida(desde)) errores.push('desde inválida (AAAA-MM-DD)');
  if (!fechaValida(hasta)) errores.push('hasta inválida (AAAA-MM-DD)');
  if (errores.length === 0) {
    if (desde > hasta) errores.push('desde no puede ser posterior a hasta');
    else if (rangoFechas(desde, hasta).length > MAX_DIAS) errores.push(`máximo ${MAX_DIAS} días por consulta`);
  }
  if (errores.length) return res.status(400).json({ error: 'Parámetros inválidos', detalle: errores });

  try {
    const db = getSupabase();
    let userId = userIdParam ? String(userIdParam) : null;
    if (!userId) {
      const { data, error } = await db.from('users').select('id').eq('email', String(email).trim().toLowerCase()).maybeSingle();
      if (error) throw error; if (!data) return res.status(404).json({ error: 'Usuario no encontrado' }); userId = data.id;
    }

    const [ucResp, dmResp, actividades] = await Promise.all([
      db.from('user_challenges').select(UC_FIELDS).eq('user_id', userId).eq('status', 'active'),
      db.from('daily_movement').select(DM_FIELDS).eq('user_id', userId).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: true }),
      traerTodo(() => db.from('activities').select(ACT_FIELDS).eq('user_id', userId)),
    ]);
    if (ucResp.error) throw ucResp.error;
    if (dmResp.error) throw dmResp.error;
    const userChallenges = ucResp.data || [];
    const daily = dmResp.data || [];

    const ids = [...new Set(userChallenges.map((x) => x.challenge_id).filter(Boolean))];
    const challenges = new Map();
    if (ids.length) {
      const { data, error } = await db.from('challenges').select(CH_FIELDS).in('id', ids);
      if (error) throw error; (data || []).forEach((c) => challenges.set(c.id, c));
    }

    const ahoraMs = Date.now();
    const residuales = daily.map((d) => calcularResidualDia(d, actividades, ahoraMs));
    const desafios = userChallenges.map((uc) => {
      const progreso4a = calcularProgresoChallenge({ uc, challenge: challenges.get(uc.challenge_id) || null, actividades });
      return simularHealthParaDesafio({ uc, progreso4a, residuales });
    });
    const suma = (campo) => Math.round(desafios.reduce((a, d) => a + (Number(d[campo]) || 0), 0) * 1000) / 1000;

    return res.json({
      regla_version: REGLA_VERSION,
      generado_at: new Date(ahoraMs).toISOString(),
      user_id: userId, desde, hasta,
      modo: 'sombra_solo_lectura',
      dias_daily_movement: daily.length,
      desafios,
      resumen: {
        desafios_activos: desafios.length,
        residual_elegible_km: suma('residual_elegible_km'),
        residual_elegible_cierre_hipotetico_km: suma('residual_elegible_cierre_hipotetico_km'),
        completarian_sin_resolver_cierre: desafios.filter((d) => d.completaria_sin_resolver_cierre).length,
        completarian_con_cierre_hipotetico: desafios.filter((d) => d.completaria_con_cierre_hipotetico).length,
      },
      avisos: [
        '4B-1 es solo lectura: no escribe km_completed, status, eventos ni daily_movement.',
        'Health solo aporta días locales completos: un día tocado por started_at o por una pausa se excluye entero.',
        'La regla definitiva de cierre todavía NO está decidida; se muestran por separado residual elegible y residual bajo la hipótesis 48h + sync posterior.',
        'Los estados terminales no se incluyen: solo se simulan desafíos active.',
      ],
    });
  } catch (e) {
    console.error('Error en /admin/progreso-health-sombra:', e.message);
    return res.status(500).json({ error: 'No se pudo simular progreso Health.' });
  }
});

module.exports = router;
