// Etapa 4B-2 — Health integrado al motor unificado.
//
// Mantiene dos valores deliberadamente distintos mientras el desafío está activo:
//   kmProgreso:       4A + Health elegible (valor visible/materializable; puede subir o bajar).
//   kmAptoCompletar:  4A + Health elegible y estable (48 h + sync posterior al fin del día).
//
// Así una corrección Health puede ajustar el progreso activo, pero un dato provisional
// nunca completa un desafío ni queda congelado en un estado terminal.
const { calcularProgresoChallenge } = require('./progresoDesafio');
const { calcularResidualDia } = require('./residualMovimiento');
const { evaluarElegibilidadDia } = require('./progresoHealthSombra');
const { filtrarResidualesAutorizados } = require('./consentimientoHealth');

const REGLA_VERSION = 'progreso_4b_v1_health_estable_2026-10-03';

const calcularResidualesHealth = ({ dailyMovement = [], actividades = [], ahoraMs = Date.now() }) =>
  dailyMovement.map((dia) => calcularResidualDia(dia, actividades, ahoraMs));

const calcularProgresoChallengeHealth = ({ uc, challenge, actividades = [], residuales = [], consentimiento }) => {
  const progreso4a = calcularProgresoChallenge({ uc, challenge, actividades });
  if (uc.status !== 'active') return progreso4a;

  let kmHealthElegible = 0;
  let kmHealthEstable = 0;
  // La integración pública pasa consentimiento explícito. La llamada histórica
  // sin este argumento se conserva para las simulaciones internas existentes.
  const autorizados = consentimiento === undefined ? residuales : filtrarResidualesAutorizados({
    userId: uc.user_id, tipo: 'pago', participacionId: uc.id,
    ventanas: consentimiento || [], residuales,
  });
  for (const residual of autorizados) {
    const elegibilidad = evaluarElegibilidadDia(uc, residual);
    if (!elegibilidad.elegible) continue;
    const km = Number(residual?.residual?.total_crudo_km) || 0;
    kmHealthElegible += km;
    if (residual?.hipotesis_cierre?.se_cerraria === true) kmHealthEstable += km;
  }

  const exacto4a = progreso4a.exacto;
  const kmProgreso = exacto4a.kmProgreso + kmHealthElegible;
  const kmAptoCompletar = exacto4a.kmProgreso + kmHealthEstable;
  const resultado = {
    ...progreso4a,
    regla_version_health: REGLA_VERSION,
    km_health_elegible: kmHealthElegible,
    km_health_estable: kmHealthEstable,
  };
  Object.defineProperty(resultado, 'exacto', {
    enumerable: false,
    value: Object.freeze({
      ...exacto4a,
      kmProgreso,
      kmAptoCompletar,
      kmHealthElegible,
      kmHealthEstable,
    }),
  });
  return resultado;
};

module.exports = { REGLA_VERSION, calcularResidualesHealth, calcularProgresoChallengeHealth };
