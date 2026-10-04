import { supabase } from '../../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

export const confirmarActividadGps = async (sesion, resumen) => {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) throw new Error('sesion_no_disponible');
  if (!sesion?.sessionId || !sesion?.iniciadaAt) throw new Error('actividad_invalida');

  const res = await fetch(`${BACKEND_URL}/actividades/gps`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      session_id: sesion.sessionId,
      sport_type: resumen.sport_type,
      duration_seconds: resumen.duration_seconds,
      puntos: (sesion.puntos || []).map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy: p.accuracy,
        timestamp: p.timestamp,
      })),
      recorded_at: new Date(sesion.iniciadaAt).toISOString(),
    }),
  });

  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const error = new Error(data.error || 'No se pudo guardar la actividad.');
    error.status = res.status;
    throw error;
  }
  return data;
};


export const obtenerRutaGps = async (activityId) => {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) throw new Error('sesion_no_disponible');
  const res = await fetch(`${BACKEND_URL}/actividades/gps/${encodeURIComponent(activityId)}/ruta`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (res.status === 404) return null;
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || 'No se pudo cargar el recorrido.');
  return data;
};
