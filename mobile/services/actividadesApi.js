import { supabase } from '../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

const tokenActual = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error('sesion_no_disponible');
  return session.access_token;
};

export const listarMisActividades = async () => {
  const token = await tokenActual();
  const res = await fetch(`${BACKEND_URL}/actividades`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar las actividades.');
  return Array.isArray(data) ? data : [];
};
