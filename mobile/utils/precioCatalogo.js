// Supabase contiene precios de referencia; la tienda determina el importe final.
function precioReferencia(challenge) {
  const valor = challenge?.price_usd;
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  if (typeof valor === 'string' && !valor.trim()) return null;
  const precio = Number(valor);
  return Number.isFinite(precio) && precio > 0
    ? `USD ${precio.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
}
module.exports = { precioReferencia };
