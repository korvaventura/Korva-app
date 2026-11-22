const BACKEND_URL = 'https://korva-app-production.up.railway.app';
async function solicitarGrupo({ fetchImpl = fetch, session, accion, datos = {} }) {
  if (!session?.user?.id || !session.access_token) throw new Error('Volvé a iniciar sesión para gestionar tus grupos.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const lectura = accion === 'listar';
    const path = lectura ? `mis-grupos/${session.user.id}` : accion;
    const res = await fetchImpl(`${BACKEND_URL}/grupos/${path}`, {
      method: lectura ? 'GET' : 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      ...(lectura ? {} : { body: JSON.stringify({ ...datos, user_id: session.user.id }) }),
    });
    if (res.status === 404 && (lectura || !(res.headers?.get('content-type') || '').includes('application/json'))) {
      throw new Error('Los grupos todavía no están disponibles en el servidor. Podés seguir registrando tus actividades.');
    }
    let data;
    try { data = await res.json(); } catch { throw new Error('El servidor no pudo responder. Intentá nuevamente.'); }
    if (!res.ok || data?.error) throw new Error(typeof data?.error === 'string' ? data.error : 'No se pudo completar la solicitud. Intentá nuevamente.');
    if (lectura) {
      if (!Array.isArray(data) || data.some(g => !g?.id || typeof g.nombre !== 'string' || typeof g.codigo !== 'string')) throw new Error('No pudimos leer tus grupos. Intentá nuevamente.');
    } else if (accion !== 'salir' && (!data?.grupo?.id || typeof data.grupo.nombre !== 'string' || typeof data.grupo.codigo !== 'string')) {
      throw new Error('El servidor no confirmó el grupo. Revisá tus grupos antes de volver a intentar.');
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('La conexión tardó demasiado. Revisá tus grupos antes de volver a intentar.');
    throw error;
  } finally { clearTimeout(timer); }
}
module.exports = { solicitarGrupo };
