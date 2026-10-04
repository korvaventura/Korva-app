// Auditoría read-only del alcance de Health pasivo.
// Identifica usuarios con daily_movement, diferencias activas vs 4A y retos terminales a revisar.
// NO inserta, actualiza ni elimina datos.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { reporteSombraActivos } = require('../lib/progresoSombra');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET;
if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SECRET');

(async () => {
  const db = createClient(url, key);
  const usuarios = new Set();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from('daily_movement').select('user_id').order('user_id').range(desde, desde + 999);
    if (error) throw error;
    (data || []).forEach((x) => usuarios.add(x.user_id));
    if (!data || data.length < 1000) break;
  }

  const ids = [...usuarios];
  let terminales = [];
  if (ids.length) {
    const { data, error } = await db.from('user_challenges')
      .select('id,user_id,challenge_id,status,started_at,completed_at,km_completed')
      .in('user_id', ids)
      .in('status', ['completed','cargado','shipped']);
    if (error) throw error;
    terminales = data || [];
  }

  const { desafios } = await reporteSombraActivos(db, { soloDiferencias: true });
  const activosConHealth = desafios.filter((d) => usuarios.has(d.user_id));

  console.log('\n=== IMPACTO HEALTH READ-ONLY ===');
  console.log('No se escribió ningún dato.');
  console.log('Usuarios con daily_movement:', ids.length);
  console.log('Retos activos de esos usuarios con diferencia vs 4A:', activosConHealth.length);
  console.table(activosConHealth.map((d) => ({
    user_id: d.user_id,
    user_challenge_id: d.user_challenge_id,
    challenge: d.challenge_titulo || d.challenge_id,
    km_guardado: d.km_completed_actual,
    km_solo_explicito: d.km_progreso_sombra,
    diferencia_km: d.diferencia_km,
  })));
  console.log('Retos terminales de usuarios con daily_movement (solo revisión; no se infiere causa):', terminales.length);
  console.table(terminales);
})().catch((e) => {
  console.error('Auditoría falló:', e.message);
  process.exit(1);
});
