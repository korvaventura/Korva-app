import { supabase } from '../supabase';
const { crearClienteMovimientoPersonal } = require('./movimientoPersonalCore');

export const leerMovimientoPersonal = crearClienteMovimientoPersonal({
  getSession: () => supabase.auth.getSession(),
  fetchImpl: (...args) => fetch(...args),
  baseUrl: 'https://korva-app-production.up.railway.app',
});
