function crearGarminRepositorio(supabase) {
  async function rpc(name, args) {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data?.[0] || null;
  }
  return {
    async estado(userId) {
      const { data, error } = await supabase.from('garmin_connections')
        .select('connected_at,refresh_expires_at,permissions').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data;
    },
    iniciar(userId, attempt, ticketHash) {
      return rpc('korva_garmin_start', { p_user_id: userId, p_state_hash: attempt.stateHash,
        p_launch_hash: ticketHash, p_binding_hash: attempt.bindingHash, p_payload: attempt.payload });
    },
    lanzar(ticketHash) { return rpc('korva_garmin_launch', { p_launch_hash: ticketHash }); },
    consumir(stateHash, bindingHash) {
      return rpc('korva_garmin_consume', { p_state_hash: stateHash, p_binding_hash: bindingHash });
    },
    async conectar(userId, connection, ciphertext) {
      const { error } = await supabase.from('garmin_connections').insert({ user_id: userId,
        garmin_user_id: connection.garminUserId, token_ciphertext: ciphertext,
        access_expires_at: connection.expiresAt, refresh_expires_at: connection.refreshExpiresAt,
        permissions: connection.permissions });
      if (error) throw error;
    },
  };
}
module.exports = { crearGarminRepositorio };
