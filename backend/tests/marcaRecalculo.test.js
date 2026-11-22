const test = require('node:test');
const assert = require('node:assert/strict');
const { tomarMarca, distintaDe, aMicros } = require('../lib/marcaRecalculo');
const A = '2026-11-21T12:00:00.000001Z';
const B = '2026-11-21T12:00:00.000002Z';
test('renewal cannot restore A after B, so stale owner A cannot clear pending work',async()=>{
 let current=null;
 const repo={leerMarcaRecalculo:async()=>current,marcarRecalculoCAS:async({marcaLeida,marcaNueva})=>{
  if(current!==marcaLeida)return false;current=marcaNueva;return true;
 }};
 const owner=await tomarMarca({repo,id:'challenge',marcaLeida:null,generarMarca:()=>A});
 const second=await tomarMarca({repo,id:'challenge',marcaLeida:A,generarMarca:()=>B});
 const repeated=await tomarMarca({repo,id:'challenge',marcaLeida:B,generarMarca:()=>A});
 assert.equal(owner.propia,true);assert.equal(second.propia,false);assert.equal(repeated.propia,false);
 assert.ok(aMicros(repeated.marca)>aMicros(second.marca));
 const staleCleanup=()=>{if(current!==owner.marca)return false;current=null;return true;};
 assert.equal(staleCleanup(),false);assert.equal(current,repeated.marca);
});
test('renewal stays increasing through timezone normalization, second rollover and backwards clocks',()=>{
 assert.equal(distintaDe(A,'2026-11-21T12:00:00.000002+00:00'),'2026-11-21T12:00:00.000003Z');
 assert.equal(distintaDe(A,'2026-11-21T12:00:00.999999Z'),'2026-11-21T12:00:01.000000Z');
 assert.equal(distintaDe(B,A),B);
});
