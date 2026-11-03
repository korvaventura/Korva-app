// Pausa segura: una sola solicitud cambia el estado; errores de Supabase nunca se anuncian como éxito.
// No modifica km_completed, km_base, periodos_pausados ni actividades.
const pausarDesafio = async ({ supabase, userId, challengeId, ahora = () => new Date().toISOString() }) => {
  if (!userId || !challengeId) {
    return { status: 400, body: { error: 'Faltan datos del desafío' } };
  }
  const buscar = async () => {
    const { data, error } = await supabase.from('user_challenges')
      .select('id, pausado').eq('user_id', userId).eq('challenge_id', challengeId).limit(2);
    if (error) throw error;
    if (!data?.length) return { estado: 'no_encontrado' };
    if (data.length !== 1) return { estado: 'duplicado' };
    return { estado: 'ok', uc: data[0] };
  };

  const lectura = await buscar();
  if (lectura.estado !== 'ok') return { status: 404, body: { error: 'Desafío no encontrado' } };
  if (lectura.uc.pausado) return { status: 200, body: { mensaje: 'Ya estaba pausado' } };

  // Compare-and-set: dos solicitudes paralelas no deben sobreescribir pausado_at.
  const { data, error } = await supabase.from('user_challenges')
    .update({ pausado: true, pausado_at: ahora() })
    .eq('id', lectura.uc.id).eq('user_id', userId).eq('pausado', false)
    .select('id');
  if (error) throw error;
  if (Array.isArray(data) && data.length === 1) {
    return { status: 200, body: { mensaje: 'Desafío pausado' } };
  }

  // Si perdió una carrera contra otra pausa, informar estado real (no éxito falso).
  const despues = await buscar();
  if (despues.estado === 'ok' && despues.uc.pausado) {
    return { status: 200, body: { mensaje: 'Ya estaba pausado' } };
  }
  return { status: 409, body: { error: 'No se pudo confirmar la pausa; intentá de nuevo' } };
};

module.exports = { pausarDesafio };
