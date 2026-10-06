// Base común confirmada en Dubrovnik. Cambiar estos valores afecta a todos
// los mapas de MapaRecorrido3D; validar en teléfono antes de ampliar cambios.
const AJUSTES_MAPA = Object.freeze({
  replayMs: 25000,
  camaraIntervaloMs: 33,
  fichaIntervaloMs: 100,
  frameMaximoMs: 80,
  seguimientoEsperaManualMs: 1200,
  seguimientoAmortiguacionMs: 750,
  seguimientoPeso: .45,
  sensibilidadGesto: .65,
  arrastreMinimoPx: 10,
  seleccionTrasArrastreMs: 180,
  seleccionIntervaloMs: 350,
  rutaProceduralIntervaloMs: 120,
});
module.exports = { AJUSTES_MAPA };
