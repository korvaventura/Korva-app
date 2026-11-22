const { objetivoDeInscripcion } = require('./versionDesafio');
// Reuses the app's existing compartir_actividad payload through the shared notifier.
async function notificarGarmin({ supabase, userId, desafios, externalId, enviar }) {
  const subieron = (desafios || []).filter(d => d.status_leido === 'active' && d.accion === 'actualizar_km'
    && d.escrito && Number(d.km_nuevo) > Number(d.km_leido || 0));
  if (!subieron.length || !externalId) return;
  const { data, error } = await supabase.from('user_challenges').select('*,challenges(*)')
    .eq('user_id', userId).in('id', subieron.map(d => d.user_challenge_id));
  if (error) throw error;
  for (const d of subieron) {
    const uc = (data || []).find(row => row.id === d.user_challenge_id);
    if (!uc || uc.pausado || uc.status !== 'active' || !uc.challenges) continue;
    const objetivo = objetivoDeInscripcion(uc, uc.challenges).objetivo_km || uc.challenges.total_distance_km;
    if (!(objetivo > 0) || Number(d.km_nuevo) >= objetivo) continue;
    await enviar(supabase, userId, uc.challenge_id, uc.challenges.title,
      Number(d.km_leido || 0), Number(d.km_nuevo), objetivo, { external_id: externalId });
  }
}
module.exports = { notificarGarmin };
