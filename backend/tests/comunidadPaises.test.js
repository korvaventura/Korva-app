const test = require('node:test');
const assert = require('node:assert/strict');
const { contarCompletadosPorPais, leerComunidadPaises, crearLecturaCache } = require('../lib/comunidadPaises');
const uc = (user_id, challenge_id, status = 'completed') => ({ user_id, challenge_id, status });
test('países: suma rutas diferentes de una persona y excluye pendientes y activos al 100%', () => {
  const r = contarCompletadosPorPais([uc('a', 'fuji'), uc('a', 'dubrovnik', 'shipped'), { ...uc('b', 'fuji', 'active'), porcentaje: 100 }, uc('c', 'fuji', 'pending')], [{ id: 'a', pais: 'Argentina' }]);
  assert.equal(r.total_completados, 2);
  assert.deepEqual(r.paises, [{ pais: 'Argentina', cantidad: 2 }]);
});
test('países: no duplica un desafío por estados o versiones legacy', () => {
  const r = contarCompletadosPorPais([uc('a', 'fuji'), { ...uc('a', 'fuji', 'cargado'), version: 'extendida' }], [{ id: 'a', pais: 'Argentina' }]);
  assert.equal(r.total_completados, 1);
});
test('países: normaliza variantes y conserva la diferencia de países ausentes', () => {
  const r = contarCompletadosPorPais([uc('a','1'),uc('b','1'),uc('c','1'),uc('d','1')], [{ id:'a',pais:' MEXICO ' },{ id:'b',pais:'México' },{ id:'c',pais:null }]);
  assert.deepEqual(r.paises, [{ pais:'México',cantidad:2 }]);
  assert.equal(r.sin_pais,2); assert.equal(r.total_completados,4); assert.equal(r.completados_con_pais,2);
});
test('países: sin completados produce un total real de cero', () => {
  assert.equal(contarCompletadosPorPais([], []).total_completados,0);
});
function dbFake(tablas, fallo = false) {
  return { from(tabla) {
    let filas = tablas[tabla] || [];
    return { select() { return this; }, in(campo, valores) { filas = filas.filter((f) => valores.includes(f[campo])); return this; }, order() { return this; },
      range(desde,hasta) { return Promise.resolve({data:filas.slice(desde,hasta+1),error:fallo ? new Error('consulta fallida') : null}); } };
  } };
}
test('países: pagina más de 1000 completados y consulta usuarios en lotes', async () => {
  const filas = Array.from({length:1005}, (_,i) => ({...uc(String(i),'fuji'), id:String(i)}));
  const r = await leerComunidadPaises(dbFake({user_challenges:filas,users:Array.from({length:1005},(_,i)=>({id:String(i),pais:'Argentina'}))}));
  assert.equal(r.total_completados,1005);
  assert.equal(r.paises[0].cantidad,1005);
});
test('países: un error de consulta no se convierte en cero', async () => {
  await assert.rejects(leerComunidadPaises(dbFake({},true)), /consulta fallida/);
});
test('países: comparte lecturas simultáneas y renueva el resumen al vencer 30 segundos', async () => {
  let llamadas=0, reloj=0;
  const leer=crearLecturaCache(async()=>({numero:++llamadas}),()=>reloj);
  assert.deepEqual(await Promise.all([leer(),leer()]),[{numero:1},{numero:1}]);
  reloj=29999; assert.equal((await leer()).numero,1);
  reloj=30000; assert.equal((await leer()).numero,2);
});
test('países: la caché no conserva errores ni retorna datos vencidos como actuales', async () => {
  let llamadas=0;
  const leer=crearLecturaCache(async()=>{ if(++llamadas===1) throw new Error('red'); return {ok:true}; });
  await assert.rejects(leer(), /red/); assert.deepEqual(await leer(),{ok:true});
});
