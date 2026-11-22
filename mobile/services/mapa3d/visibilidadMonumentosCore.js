// En General se ven todas las miniaturas; en detalle destaca sólo la elegida.
// No modifica geometría, coordenadas, progreso ni materiales.
function mostrarMonumentos(monumentos, hitoActivo = null) {
  for (const [id, mesh] of Object.entries(monumentos || {})) mesh.visible = !hitoActivo || id === hitoActivo;
}
module.exports = { mostrarMonumentos };
