import { supabase } from '../supabase';

// Contrato del backend: rama feat/garmin-oauth-20261121 (routes/garmin.js).
const BACKEND_URL = 'https://korva-app-production.up.railway.app';
export const GARMIN_RETURN_URL = 'korva://garmin-connected';

async function solicitar(path, method = 'GET') {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error('Volvé a iniciar sesión en Korva.');
  const response = await fetch(`${BACKEND_URL}/garmin/${path}`, {
    method, headers: { Authorization: `Bearer ${session.access_token}` },
  });
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const e = new Error(data.error || 'No pudimos conectar con Garmin.');
    e.status = response.status;
    throw e;
  }
  return data;
}

// Si el backend todavía no tiene Garmin (404/red), se trata como "no disponible".
export const estadoGarmin = () => solicitar('status').catch(() => ({ available: false, connected: false }));
export const iniciarGarmin = () => solicitar('auth', 'POST');
