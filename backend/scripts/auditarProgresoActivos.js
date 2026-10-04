// Auditoría read-only de progreso activo.
// No inserta, actualiza ni elimina datos.
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const { reporteSombraActivos } = require('../lib/progresoSombra');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET;

if (!url || !key) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SECRET en el entorno.');
  process.exit(1);
}

(async () => {
  const supabase = createClient(url, key);
  const { desafios, resumen } = await reporteSombraActivos(supabase, { soloDiferencias: true });

  const filas = desafios.map((d) => ({
    user_id: d.user_id,
    user_challenge_id: d.user_challenge_id,
    challenge_id: d.challenge_id,
    status: d.status,
    km_guardado: d.km_completed_actual,
    km_calculado: d.km_progreso_sombra,
    km_actividades: d.km_actividades,
    objetivo_km: d.objetivo_km,
    diferencia_km: d.diferencia_km,
    categoria: d.categoria_diferencia,
    km_base: d.km_base,
    km_base_motivo: d.km_base_motivo,
  }));

  console.log('\n=== AUDITORÍA READ-ONLY DE PROGRESO ===');
  console.log('No se escribió ningún dato.\n');
  console.log('Resumen:', JSON.stringify(resumen, null, 2));
  console.log('\nRetos activos con diferencias:', filas.length);
  console.table(filas);
})().catch((error) => {
  console.error('Auditoría falló:', error.message);
  process.exit(1);
});
