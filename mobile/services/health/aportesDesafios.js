import { supabase } from '../../supabase';
const URL = 'https://korva-app-production.up.railway.app/movimiento-diario/desafios';
export async function consultarAportesHealth(userId, cambio = null) {
  const { data, error } = await supabase.auth.getSession();
  const sesion = data?.session;
  if (error || !sesion?.access_token || sesion.user?.id !== userId) throw Error('Volvé a iniciar sesión.');
  const res = await fetch(URL, { method: cambio ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${sesion.access_token}`, 'Content-Type': 'application/json' },
    ...(cambio ? { body: JSON.stringify(cambio) } : {}) });
  let cuerpo;
  try { cuerpo = await res.json(); } catch { throw Error('Los aportes de Salud todavía no están disponibles.'); }
  if (!res.ok) throw Error(cuerpo?.error || 'No pudimos consultar los aportes.');
  if (!cambio && (typeof cuerpo?.disponible !== 'boolean' || !Array.isArray(cuerpo.desafios)
    || (cuerpo.disponible && (cuerpo.version !== 'movimiento-desafios-v1' || cuerpo.desafios.some((d) =>
      typeof d.id !== 'string' || !['pago','libre'].includes(d.tipo) || typeof d.titulo !== 'string'
      || typeof d.activo !== 'boolean' || (d.activo && !Number.isFinite(Date.parse(d.desde)))))))) {
    throw Error('No pudimos validar la configuración de tus desafíos.');
  }
  if (cambio && cuerpo?.ok !== true) throw Error('El cambio no fue confirmado por el servidor.');
  return cuerpo;
}
