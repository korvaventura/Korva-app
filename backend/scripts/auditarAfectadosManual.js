// Diagnóstico read-only de los retos detectados con progreso reconstruido mayor.
// No escribe datos.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { progresoSombraUsuario } = require('../lib/progresoSombra');

const IDS = [
  '53cf8b5b-4dfe-4754-874b-ded48a3ab1c7',
  '90b337ed-225e-4986-a505-4bf11973e2f3',
  'd73eeb21-cbe0-4c3c-9e83-73bf044190b3',
  '601b9956-78ea-4ef7-8652-3739e7962a3e',
  'a9843d30-220d-4edc-b3c1-7371df69fdf9',
];

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET);

(async () => {
  console.log('=== DIAGNÓSTICO READ-ONLY AFECTADOS ===');
  for (const userId of IDS) {
    const r = await progresoSombraUsuario(supabase, userId);
    for (const d of r.desafios.filter(x => x.status === 'active' && x.diferencia_km < -0.001)) {
      console.log('\n', {
        user_id: d.user_id,
        user_challenge_id: d.user_challenge_id,
        challenge: d.challenge_titulo,
        started_at: d.started_at_utc,
        km_guardado: d.km_completed_actual,
        km_calculado: d.km_progreso_sombra,
        diferencia_km: d.diferencia_km,
      });
      console.table((d.detalle_actividades || [])
        .filter(a => a.motivo === 'cuenta')
        .map(a => ({ id: a.id, km: a.km, fecha: a.recorded_at_utc, motivo: a.motivo })));
    }
  }
})().catch(e => {
  console.error('Diagnóstico falló:', e.message);
  process.exit(1);
});
