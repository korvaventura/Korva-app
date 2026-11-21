const { recalcularConReintentos } = require('./recuperacionRecalculo');
// Durable capture remains separate from processing. Failed rounds leave events pending.
async function procesarGarmin({ supabase, repoMotor, allowedIds, dispararEfectos = async () => {}, recalcular = recalcularConReintentos }) {
  if (!allowedIds.length) return { procesados: 0 };
  const { data, error } = await supabase.from('garmin_push_events').select('id,user_id')
    .eq('state', 'capturado').in('user_id', allowedIds).order('received_at').limit(25);
  if (error) throw error;
  let procesados = 0;
  for (const event of data || []) {
    const { data: result, error: writeError } = await supabase.rpc('korva_garmin_import_event', {
      p_event_id: event.id, p_allowed_ids: allowedIds,
    });
    if (writeError) throw writeError;
    if (!result || result.result !== 'importado') continue;
    const progress = await recalcular({ repo: repoMotor, userId: event.user_id, motivo: 'garmin',
      marcasALimpiar: result.marcas || [] });
    if (!progress.ok) continue;
    await dispararEfectos(progress.informe.eventos_para_procesar);
    const { error: finishError } = await supabase.from('garmin_push_events').update({ state: 'hecho' })
      .eq('id', event.id).eq('state', 'capturado');
    if (finishError) throw finishError;
    procesados++;
  }
  return { procesados };
}
function iniciarProcesamientoGarmin({ env = process.env, log = console.info, ...options }) {
  if (env.GARMIN_ACTIVITIES_ENABLED !== '1' || env.GARMIN_PUSH_CAPTURE_ENABLED !== '1' || env.GARMIN_OAUTH_ENABLED !== '1') return null;
  const allowedIds = (env.GARMIN_OAUTH_TEST_USER_IDS || '').split(',').map(s => s.trim())
    .filter(s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));
  if (!allowedIds.length) return null;
  let running = false;
  const round = async () => {
    if (running) return;
    running = true;
    try { const result = await procesarGarmin({ ...options, allowedIds });
      if (result.procesados) log('korva_garmin_processing', JSON.stringify(result));
    } catch { log('korva_garmin_processing failed'); }
    finally { running = false; }
  };
  const initial = setTimeout(round, 5000); initial.unref();
  const timer = setInterval(round, 30000); timer.unref();
  return { stop() { clearTimeout(initial); clearInterval(timer); } };
}
module.exports = { procesarGarmin, iniciarProcesamientoGarmin };
