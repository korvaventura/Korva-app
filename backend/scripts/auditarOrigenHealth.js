// Auditoría read-only: explica de qué días sale el residual Health de retos activos
// que difieren del cálculo 4A. No inserta, actualiza ni elimina datos.
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const { reporteSombraActivos } = require('../lib/progresoSombra');
const { calcularResidualDia } = require('../lib/residualMovimiento');
const { evaluarElegibilidadDia } = require('../lib/progresoHealthSombra');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SECRET en el entorno.');
  process.exit(1);
}

(async () => {
  const db = createClient(url, key);
  const { desafios } = await reporteSombraActivos(db, { soloDiferencias: true });
  console.log('\n=== ORIGEN READ-ONLY DE RESIDUAL HEALTH ===');
  console.log('No se escribió ningún dato.\n');

  if (!desafios.length) {
    console.log('No hay retos activos con diferencia contra 4A.');
    return;
  }

  for (const d of desafios) {
    const [{ data: uc, error: eUc }, { data: daily, error: eDm }, { data: acts, error: eAct }] = await Promise.all([
      db.from('user_challenges')
        .select('id,user_id,challenge_id,status,started_at,pausado,pausado_at,periodos_pausados,km_completed')
        .eq('id', d.user_challenge_id).single(),
      db.from('daily_movement')
        .select('fecha,timezone,distancia_caminando_km,distancia_bici_km,pasos,tipo_medicion,plataforma,cerrado,raw_payload,updated_at')
        .eq('user_id', d.user_id).order('fecha', { ascending: true }),
      db.from('activities')
        .select('id,user_id,source,sport_type,distance_km,duration_seconds,recorded_at,excluida')
        .eq('user_id', d.user_id),
    ]);
    if (eUc) throw eUc;
    if (eDm) throw eDm;
    if (eAct) throw eAct;

    const filas = (daily || []).map((dia) => {
      const residual = calcularResidualDia(dia, acts || [], Date.now());
      const eleg = evaluarElegibilidadDia(uc, residual);
      return {
        fecha: dia.fecha,
        health_pie_km: residual.health.pie_km,
        health_bici_km: residual.health.bici_km,
        actividades_pie_km: residual.actividades.pie_km,
        actividades_bici_km: residual.actividades.bici_km,
        residual_km: residual.residual.total_crudo_km,
        elegible: eleg.elegible,
        motivo: eleg.motivo,
        aporto_km: eleg.elegible ? residual.residual.total_crudo_km : 0,
      };
    });
    const aporto = filas.reduce((s, x) => s + Number(x.aporto_km || 0), 0);

    console.log('Reto:', d.challenge_titulo || d.challenge_id);
    console.log('started_at:', uc.started_at);
    console.log('km_guardado:', d.km_completed_actual, '| km_4A:', d.km_progreso_sombra);
    console.table(filas);
    console.log('TOTAL HEALTH ELEGIBLE:', Math.round(aporto * 1000) / 1000, 'km\n');
  }
})().catch((e) => {
  console.error('Auditoría Health falló:', e.message);
  process.exit(1);
});
