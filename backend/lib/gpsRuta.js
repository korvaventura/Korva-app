const normalizarPuntosRuta = (puntos = []) =>
  puntos.map((p) => ({
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    accuracy: p.accuracy == null ? null : Number(p.accuracy),
    timestamp: Number(p.timestamp),
  }));

const guardarRutaGps = async ({ supabase, userId, activityId, sessionId, puntos }) => {
  if (!userId || !activityId || !sessionId || !Array.isArray(puntos)) throw new Error('ruta_gps_invalida');
  const points = normalizarPuntosRuta(puntos);
  const { data, error } = await supabase
    .from('gps_routes')
    .upsert({
      user_id: userId,
      activity_id: activityId,
      session_id: sessionId,
      points,
      point_count: points.length,
    }, { onConflict: 'user_id,session_id', ignoreDuplicates: true })
    .select('id,activity_id,session_id,point_count')
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const leerRutaGps = async ({ supabase, userId, activityId }) => {
  if (!userId || !activityId) throw new Error('ruta_gps_invalida');
  const { data, error } = await supabase
    .from('gps_routes')
    .select('activity_id,session_id,points,point_count,created_at')
    .eq('user_id', userId)
    .eq('activity_id', activityId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

module.exports = { normalizarPuntosRuta, guardarRutaGps, leerRutaGps };
