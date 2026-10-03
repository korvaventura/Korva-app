// Doble mínimo de @kingstinct/react-native-healthkit para Node: registra las consultas.
export const llamadas = [];
export const ComparisonPredicateOperator = { equalTo: 4, notEqualTo: 5 }; // valores de la librería 16.0.0
export const AuthorizationRequestStatus = { unknown: 0, shouldRequest: 1, unnecessary: 2 };
export const isHealthDataAvailableAsync = async () => true;
export const getRequestStatusForAuthorization = async () => AuthorizationRequestStatus.unnecessary;
const hoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const queryStatisticsCollectionForQuantity = async (id, estadisticas, ancla, intervalo, opciones) => {
  llamadas.push({ fn: 'consolidado', id, opciones });
  return [{ startDate: hoy(), sumQuantity: { quantity: 2.5 }, sources: [{ name: 'iPhone', bundleIdentifier: 'com.apple.health.X' }] }];
};
export const queryStatisticsCollectionForQuantitySeparateBySource = async (id, estadisticas, ancla, intervalo, opciones) => {
  llamadas.push({ fn: 'por_fuente', id, opciones });
  return [{ startDate: hoy(), sumQuantity: { quantity: 2.5 }, source: { name: 'iPhone', bundleIdentifier: 'com.apple.health.X' } }];
};
