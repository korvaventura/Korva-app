const { crearRepositorioSupabase } = require('./progresoRepositorioSupabase');
const { tomarMarca } = require('./marcaRecalculo');
const { recalcularConReintentos } = require('./recuperacionRecalculo');
const { healthConsentActivo } = require('./flagsMotor');
const { traerTodo } = require('./progresoSombra');
async function prepararRecalculoHealth(supabase, userId) {
  if (!healthConsentActivo()) return null;
  const repo = crearRepositorioSupabase(supabase);
  const data = await traerTodo(() => supabase.from('health_challenge_consents').select('participacion_id')
    .eq('user_id', userId).eq('tipo', 'pago'));
  const ids = new Set((data || []).map((v) => v.participacion_id));
  const desafios = await repo.leerMarcasDesafiosActivos({ userId });
  const marcas = [];
  for (const uc of desafios.filter((d) => ids.has(d.id))) {
    const m = await tomarMarca({ repo, id: uc.id, marcaLeida: uc.recalculo_pendiente_desde });
    if (m) marcas.push(m);
  }
  return { repo, marcas };
}
async function terminarRecalculoHealth(preparado, userId, dispararEfectos = () => {}) {
  if (!preparado || preparado.marcas.length === 0) return { ok: true };
  const r = await recalcularConReintentos({ repo: preparado.repo, userId, motivo: 'health_sync',
    marcasALimpiar: preparado.marcas.filter((m) => m.propia).map((m) => ({ id: m.id, marca: m.marca })) });
  if (r.ok && r.informe.eventos_para_procesar.length) dispararEfectos(r.informe.eventos_para_procesar);
  return r;
}
module.exports = { prepararRecalculoHealth, terminarRecalculoHealth };
