function crearGarminPushRepositorio(supabase) {
  return {
    async registrar(rows, allowedIds) {
      const { data, error } = await supabase.rpc('korva_garmin_capture_push', { p_rows: rows, p_allowed_ids: allowedIds })
        .abortSignal(AbortSignal.timeout(10000));
      if (error) throw error;
      if (!data || !Number.isInteger(data.received) || !Number.isInteger(data.inserted) || !Number.isInteger(data.eligible)) throw Error('invalid_capture_result');
      return data;
    },
  };
}
module.exports = { crearGarminPushRepositorio };
