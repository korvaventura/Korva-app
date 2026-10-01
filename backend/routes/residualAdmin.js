// Residual Health vs activities — Etapa 3, MODO SOMBRA (solo admin).
//
// GET /admin/residual?user_id=<uuid>&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
//   (en lugar de user_id se puede pasar email=<email del usuario>)
//
// SOLO LECTURA: este archivo únicamente hace SELECT sobre users (para resolver
// el email), daily_movement y activities. No escribe nada en ninguna tabla,
// no toca user_challenges ni km_completed y no llama a ningún recálculo.
// El resultado no se guarda: se calcula al vuelo en cada consulta.
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const requireAdmin = require('../middleware/requireAdmin');
const {
  REGLA_VERSION,
  calcularResidualDia,
  rangoBusquedaActividades,
  msATimestampUTCSinZona,
  sumarDias,
} = require('../lib/residualMovimiento');

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const MAX_DIAS_RANGO = 31;
const LIMITE_FILAS = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esFechaValida = (fecha) => {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [a, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const diasEntre = (desde, hasta) => {
  const lista = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) lista.push(f);
  return lista;
};

router.get('/', requireAdmin, async (req, res) => {
  const { user_id: userIdParam, email, desde, hasta } = req.query;
  const errores = [];

  if (!userIdParam && !email) errores.push('Falta user_id o email');
  if (userIdParam && !UUID_RE.test(String(userIdParam))) errores.push('user_id inválido');
  if (!esFechaValida(desde)) errores.push('desde inválida (AAAA-MM-DD)');
  if (!esFechaValida(hasta)) errores.push('hasta inválida (AAAA-MM-DD)');
  if (errores.length === 0) {
    if (desde > hasta) errores.push('desde no puede ser posterior a hasta');
    else if (diasEntre(desde, hasta).length > MAX_DIAS_RANGO) errores.push(`máximo ${MAX_DIAS_RANGO} días por consulta`);
  }
  if (errores.length > 0) {
    return res.status(400).json({ error: 'Parámetros inválidos', detalle: errores });
  }

  try {
    const supabase = getSupabase();

    // 1. Resolver usuario (solo lectura).
    let userId = userIdParam ? String(userIdParam) : null;
    if (!userId) {
      const { data: usuario, error: errorUsuario } = await supabase
        .from('users')
        .select('id')
        .eq('email', String(email).trim().toLowerCase())
        .maybeSingle();
      if (errorUsuario) throw errorUsuario;
      if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
      userId = usuario.id;
    }

    // 2. Días de daily_movement en el rango (solo lectura).
    const { data: dias, error: errorDias } = await supabase
      .from('daily_movement')
      .select('fecha, timezone, distancia_caminando_km, distancia_bici_km, pasos, tipo_medicion, plataforma, cerrado, raw_payload, updated_at')
      .eq('user_id', userId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true });
    if (errorDias) throw errorDias;

    const fechasConDatos = new Set((dias || []).map((d) => d.fecha));
    const diasSinDatos = diasEntre(desde, hasta).filter((f) => !fechasConDatos.has(f));

    const ahoraMs = Date.now();
    const avisos = [
      'Modo sombra: este cálculo no afecta km_completed, desafíos, insignias ni rachas.',
      'Residual crudo: no se aplica ningún umbral.',
      'BLOCKER antes de Etapa 4: la lectura de Apple Health todavía incluye km agregados a mano en la app Salud.',
      'Actividades manuales: su día se toma del momento de carga (aproximado).',
      'Cruces de medianoche: reparto proporcional por duración (aproximado).',
      'Hipótesis de cierre (48 h + sync posterior): solo informativa; no se escribe cerrado.',
    ];

    if (!dias || dias.length === 0) {
      return res.json({
        regla_version: REGLA_VERSION,
        generado_at: new Date(ahoraMs).toISOString(),
        user_id: userId,
        desde,
        hasta,
        dias: [],
        dias_sin_daily_movement: diasSinDatos,
        resumen: null,
        avisos,
      });
    }

    // 3. Actividades del usuario que pueden tocar esos días (solo lectura).
    //    recorded_at es timestamp without time zone en UTC: se compara con
    //    textos UTC sin zona. Incluye excluidas para informarlas aparte.
    const rango = rangoBusquedaActividades(dias);
    const { data: actividades, error: errorActividades } = await supabase
      .from('activities')
      .select('id, source, sport_type, distance_km, duration_seconds, recorded_at, excluida')
      .eq('user_id', userId)
      .gte('recorded_at', msATimestampUTCSinZona(rango.desdeMs))
      .lt('recorded_at', msATimestampUTCSinZona(rango.hastaMs))
      .order('recorded_at', { ascending: true })
      .limit(LIMITE_FILAS);
    if (errorActividades) throw errorActividades;

    if ((actividades || []).length >= LIMITE_FILAS) {
      avisos.push(`Se alcanzó el límite de ${LIMITE_FILAS} actividades: el resultado puede estar incompleto. Pedí un rango más corto.`);
    }

    // 4. Cálculo puro por día.
    const resultado = dias.map((dia) => calcularResidualDia(dia, actividades || [], ahoraMs));

    const sumar = (fn) => Math.round(resultado.reduce((acc, d) => acc + fn(d), 0) * 1000) / 1000;
    const resumen = {
      dias_calculados: resultado.length,
      health_total_km: sumar((d) => d.health.total_km),
      actividades_pie_km: sumar((d) => d.actividades.pie_km),
      actividades_bici_km: sumar((d) => d.actividades.bici_km),
      actividades_sin_clasificar_km: sumar((d) => d.actividades.sin_clasificar_km),
      actividades_no_compatibles_km: sumar((d) => d.actividades.no_compatibles_km),
      actividades_excluidas_km: sumar((d) => d.actividades.excluidas_km),
      residual_total_crudo_km: sumar((d) => d.residual.total_crudo_km),
      residual_total_crudo_dias_que_se_cerrarian_km: sumar((d) => (d.hipotesis_cierre.se_cerraria ? d.residual.total_crudo_km : 0)),
      dias_que_se_cerrarian: resultado.filter((d) => d.hipotesis_cierre.se_cerraria).length,
      dias_con_marcas: resultado.filter((d) => d.marcas.length > 0).length,
    };

    res.json({
      regla_version: REGLA_VERSION,
      generado_at: new Date(ahoraMs).toISOString(),
      user_id: userId,
      desde,
      hasta,
      dias: resultado,
      dias_sin_daily_movement: diasSinDatos,
      resumen,
      avisos,
    });
  } catch (error) {
    console.error('Error en /admin/residual:', error.message);
    res.status(500).json({ error: 'No se pudo calcular el residual.' });
  }
});

module.exports = router;