// Reparación puntual y controlada del único reto activo afectado por Health pasivo.
// Recalcula Monte Fuji usando SOLO actividades explícitas (4A). Abortará si el estado
// no coincide con el caso auditado. No toca ningún otro usuario ni desafío.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
const { recalcularProgresoUsuario, MODOS } = require('../lib/progresoServicio');

const USER_ID = 'd4211bd2-38fa-4657-8c66-5c7d529b873c';
const CHALLENGE_ID = '881936a8-2282-4b7d-a94d-24a7c796d789';
const UC_ID = '82bdeab5-7317-4072-b8f1-a7b2b9b1ea4f';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET;
if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SECRET');

(async () => {
  const repo = crearRepositorioSupabase(createClient(url, key));

  const sim = await recalcularProgresoUsuario({
    repo, userId: USER_ID, challengeId: CHALLENGE_ID,
    motivo: 'reparar_health_pasivo_no_opt_in', modo: MODOS.SIMULAR, incluirHealth: false,
  });
  const d = sim.desafios.find((x) => x.user_challenge_id === UC_ID);
  if (!d) throw new Error('ABORTADO: no se encontró el user_challenge esperado');
  if (d.status_leido !== 'active') throw new Error(`ABORTADO: status inesperado: ${d.status_leido}`);
  if (d.accion !== 'actualizar_km') throw new Error(`ABORTADO: acción inesperada: ${d.accion}`);
  if (!(d.km_leido > d.km_nuevo)) throw new Error(`ABORTADO: no es una corrección descendente (${d.km_leido} -> ${d.km_nuevo})`);

  console.log('SIMULACIÓN VALIDADA:', {
    user_challenge_id: d.user_challenge_id,
    km_actual: d.km_leido,
    km_solo_actividades_explicitas: d.km_nuevo,
    km_actividades: d.km_actividades,
  });

  const escrito = await recalcularProgresoUsuario({
    repo, userId: USER_ID, challengeId: CHALLENGE_ID,
    motivo: 'reparar_health_pasivo_no_opt_in', modo: MODOS.ESCRIBIR, incluirHealth: false,
  });
  const fin = escrito.desafios.find((x) => x.user_challenge_id === UC_ID);
  if (!fin || !fin.escrito || escrito.conflictos_sin_resolver.length) {
    throw new Error(`REPARACIÓN NO CONFIRMADA: ${JSON.stringify(escrito)}`);
  }
  console.log('REPARACIÓN OK:', {
    user_challenge_id: fin.user_challenge_id,
    km_antes: fin.km_leido,
    km_despues: fin.km_nuevo,
    escrituras: escrito.escrituras,
    conflictos: escrito.conflictos_sin_resolver,
  });
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
