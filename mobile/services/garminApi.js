import { supabase } from '../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
export const GARMIN_RETURN_URL = 'korva://garmin-connected';

async function solicitar(path, method = 'GET') {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error('Volvé a iniciar sesión en Korva.');
  const response = await fetch(`${BACKEND_URL}/garmin/${path}`, {
    method, headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No pudimos conectar con Garmin.');
  return data;
}

export const estadoGarmin = () => solicitar('status');
export const iniciarGarmin = () => solicitar('auth', 'POST');
