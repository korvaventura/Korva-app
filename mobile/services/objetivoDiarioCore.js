const claveObjetivo = (userId) => {
  if (typeof userId !== 'string' || !userId.trim()) throw new Error('Sesión requerida');
  return `korva_objetivo_pasos_v1_${userId}`;
};
const objetivoValido = (n) => Number.isInteger(n) && n > 0 && n <= 100000;
function leerObjetivoTexto(texto) {
  const limpio = String(texto).trim();
  if (!/^\d+$/.test(limpio) || !objetivoValido(Number(limpio))) {
    throw new Error('Elegí un objetivo entre 1 y 100.000 pasos.');
  }
  return Number(limpio);
}
function crearObjetivosDiarios(storage) {
  return {
    async leer(userId) {
      const texto = await storage.getItem(claveObjetivo(userId));
      if (texto === null) return null;
      const valor = JSON.parse(texto);
      if (!objetivoValido(valor)) throw new Error('Objetivo guardado inválido');
      return valor;
    },
    async guardar(userId, valor) {
      const clave = claveObjetivo(userId);
      if (valor === null) return storage.removeItem(clave);
      if (!objetivoValido(valor)) throw new Error('Objetivo inválido');
      return storage.setItem(clave, JSON.stringify(valor));
    },
  };
}
function progresoObjetivo(objetivo, pasos) {
  if (!objetivoValido(objetivo) || !Number.isInteger(pasos) || pasos < 0) return null;
  return { fraccion: Math.min(1, pasos / objetivo), restantes: Math.max(0, objetivo - pasos), cumplido: pasos >= objetivo };
}
module.exports = { crearObjetivosDiarios, leerObjetivoTexto, progresoObjetivo };
