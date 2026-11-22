const { recalcularConReintentos } = require('./recuperacionRecalculo');
// Durable capture remains separate from processing. Failed rounds leave events pending.
async function procesarGarmin({ supabase, repoMotor, allowedIds, dispararEfectos = async () => {}, recalcular = recalcularConReintentos, notificar = async () => {}, log = () => {} }) {
  if (allowedIds !== null && !allowedIds.length) return { procesados: 0 };
  let query = supabase.from('garmin_push_events').select('id,user_id,payload').eq('state', 'capturado');
  if (allowedIds !== null) query = query.in('user_id', allowedIds);
  const { data, error } = await query.order('received_at').limit(25);
  if (error) throw error;
  let procesados = 0;
  for (const event of data || []) {
    try {
    const { data: result, error: writeError } = await supabase.rpc('korva_garmin_import_event', {
      p_event_id: event.id, p_allowed_ids: allowedIds,
    });
    if (writeError) throw writeError;
    if (!result || result.result !== 'importado') continue;
    const progress = await recalcular({ repo: repoMotor, userId: event.user_id, motivo: 'garmin',
      marcasALimpiar: result.marcas || [] });
    if (!progress.ok) continue;
    await dispararEfectos(progress.informe.eventos_para_procesar);
    await notificar({ supabase, userId: event.user_id, desafios: progress.informe.desafios, externalId: event.payload?.external_id });
    const { error: finishError } = await supabase.from('garmin_push_events').update({ state: 'hecho' })
      .eq('id', event.id).eq('state', 'capturado');
    if (finishError) throw finishError;
    procesados++;
    } catch { log('korva_garmin_processing event_failed'); }
  }
  return { procesados };
}
function iniciarProcesamientoGarmin({ env = process.env, log = console.info, ...options }) {
  if (env.GARMIN_ACTIVITIES_ENABLED !== '1' || env.GARMIN_PUSH_CAPTURE_ENABLED !== '1' || env.GARMIN_OAUTH_ENABLED !== '1') return null;
  const allowedIds = require('./garminAcceso').cuentasGarmin(env);
  if (allowedIds !== null && !allowedIds.length) return null;
  let running = false;
  const round = async () => {
    if (running) return;
    running = true;
    try { const result = await procesarGarmin({ ...options, allowedIds, log });
      if (result.procesados) log('korva_garmin_processing', JSON.stringify(result));
    } catch { log('korva_garmin_processing failed'); }
    finally { running = false; }
  };
  const initial = setTimeout(round, 5000); initial.unref();
  const timer = setInterval(round, 30000); timer.unref();
  return { stop() { clearTimeout(initial); clearInterval(timer); } };
}
module.exports = { procesarGarmin, iniciarProcesamientoGarmin };
