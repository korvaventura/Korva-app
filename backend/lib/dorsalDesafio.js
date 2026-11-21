// La numeración pertenece a la inscripción, nunca al número global del usuario.
const formatearDorsal = numero => numero == null ? '---' : String(numero).padStart(4, '0');

const leerDorsal = async (supabase, inscripcionId) => {
  const { data, error } = await supabase.from('user_challenges')
    .select('numero_bib').eq('id', inscripcionId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Inscripción no encontrada al leer el dorsal');
  return data.numero_bib;
};

const asignarDorsal = async (supabase, inscripcionId) => {
  const { data, error } = await supabase.rpc('asignar_dorsal_desafio', { p_inscripcion_id: inscripcionId });
  if (error) throw error;
  if (!Number.isSafeInteger(data) || data < 1) throw new Error('La base no devolvió un dorsal válido');
  return data;
};

module.exports = { asignarDorsal, leerDorsal, formatearDorsal };
