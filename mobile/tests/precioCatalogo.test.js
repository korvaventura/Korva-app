const test = require('node:test');
const assert = require('node:assert/strict');
const { precioReferencia } = require('../utils/precioCatalogo');
test('catálogo: datos ausentes o inválidos no publican un precio inventado', () => {
  for (const price_usd of [undefined,null,'',' ',0,-1,Infinity,'NaN',true,[]]) assert.equal(precioReferencia({price_usd}),null);
});
test('catálogo: conserva el precio USD configurado con sus centavos', () => {
  assert.equal(precioReferencia({price_usd:29.9}),'USD 29,90');
  assert.equal(precioReferencia({price_usd:'34.90'}),'USD 34,90');
});
test('catálogo: no mezcla ARS con USD ni transforma el precio de referencia', () => {
  const reto=Object.freeze({price_usd:null,price_ars:29900});
  assert.equal(precioReferencia(reto),null);
  assert.equal(reto.price_ars,29900);
});
