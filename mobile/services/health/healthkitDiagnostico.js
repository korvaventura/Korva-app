// Versión para plataformas que no son iOS (Android y web).
// No importa la librería de Apple Health, así Android carga el proyecto sin ella.
export const plataformaSoportada = false;

export async function estadoSalud() {
  return { disponible: false, estadoPermiso: 'no_disponible' };
}

export async function conectar() {
  return false;
}

export async function leerDiagnostico() {
  throw new Error('El diagnóstico de Apple Health solo está disponible en iPhone.');
}