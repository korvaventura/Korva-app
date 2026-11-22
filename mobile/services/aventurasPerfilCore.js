const TERMINADOS = new Set(['completed', 'shipped', 'cargado']);
function ordenarAventurasPerfil(pagos, participacionLibre) {
  const enCurso = pagos.filter(p => !TERMINADOS.has(p.status));
  const completados = pagos.filter(p => TERMINADOS.has(p.status));
  const libre = participacionLibre && !participacionLibre.abandonado
    ? [{ libre: true, challenge_id: 'islandia-libre', participacion: participacionLibre }] : [];
  return participacionLibre?.estado === 'completada'
    ? [...enCurso, ...completados, ...libre]
    : [...enCurso, ...libre, ...completados];
}
module.exports = { ordenarAventurasPerfil };
