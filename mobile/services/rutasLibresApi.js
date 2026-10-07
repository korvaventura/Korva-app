import { supabase } from '../supabase';
const BASE = 'https://korva-app-production.up.railway.app/rutas-libres/islandia';
export async function consultarRutaLibre({ userId = null, accion = null, body = null, signal } = {}) {
  const { data, error } = await supabase.auth.getSession();
  const session = data?.session;
  if (error || !session?.access_token || (userId && session.user.id !== userId)) throw new Error('Volvé a iniciar sesión para gestionar tu ruta.');
  if (signal?.aborted) throw new Error('Consulta cancelada');
  const controller = new AbortController();
  const abortar = () => controller.abort();
  signal?.addEventListener('abort', abortar);
  const timer = setTimeout(abortar, 12000);
  try {
    const res = await fetch(accion ? `${BASE}/${accion}` : BASE, {
      method: accion ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      ...(accion ? { body: JSON.stringify(body || {}) } : {}), signal: controller.signal,
    });
    if (res.status === 404 || res.status === 503) throw new Error('Las rutas gratuitas todavía no están habilitadas. Podés explorar el mapa.');
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || 'No pudimos consultar tu ruta.');
    if (!accion && (payload.ruta?.clave !== 'islandia' || !Object.prototype.hasOwnProperty.call(payload, 'participacion'))) throw new Error('Respuesta de ruta inválida.');
    return { userId: session.user.id, ...payload };
  } catch (e) {
    if (controller.signal.aborted) throw new Error('La consulta tardó demasiado. Reintentá para confirmar el estado.');
    throw e;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abortar); }
}
