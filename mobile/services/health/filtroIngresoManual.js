// Filtro de Apple Health que EXCLUYE las muestras ingresadas a mano por el usuario
// (metadata HKWasUserEntered = true, p. ej. "Agregar datos" en la app Salud).
//
// Archivo sin dependencias nativas para poder probarlo en Node.
// Se arma con la API de @kingstinct/react-native-healthkit 16.0.0: FilterForSamples.metadata
// (PredicateWithMetadataKey) → HKQuery.predicateForObjects(withMetadataKey:operatorType:value:).
// Se usa "distinto de true" (y no "igual a false") porque la mayoría de las muestras automáticas
// NO traen la clave HKWasUserEntered: con "distinto de true" siguen contando.

// Valor crudo de HKMetadataKeyWasUserEntered.
export const CLAVE_INGRESO_MANUAL = 'HKWasUserEntered';

/**
 * Devuelve una copia del filtro con la condición "HKWasUserEntered != true".
 * @param {object} filtroBase                 filtro existente (p. ej. { date: { startDate, endDate } })
 * @param {number} operadorDistinto           ComparisonPredicateOperator.notEqualTo de la librería
 */
export const conSinIngresoManual = (filtroBase, operadorDistinto) => ({
  ...filtroBase,
  metadata: { withMetadataKey: CLAVE_INGRESO_MANUAL, operatorType: operadorDistinto, value: true },
});
