const ISLANDIA_MUNDI = Object.freeze({
  id: '3b211caf-ee16-54c8-a93c-343a5eb2d57e', title: 'Islandia · Ring Road',
  latitude: 65, longitude: -19, total_distance_km: 1400, gratuita: true,
  description: 'Una ruta gratuita entre cascadas, glaciares, volcanes y auroras. Sin medalla incluida.',
});
function destinoRutaLibre(participacion) {
  const p = participacion && !participacion.abandonado ? participacion : null;
  return { ...ISLANDIA_MUNDI, objetivo: 1400, km: p?.km || 0,
    porcentaje: p?.porcentaje || 0, completed_at: p?.completed_at || null,
    pausado: !!p?.pausado,
    estado: !p ? 'por_conquistar' : p.estado === 'completada' ? 'conquistado' : 'en_curso' };
}
module.exports = { ISLANDIA_MUNDI, destinoRutaLibre };
