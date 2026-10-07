const test = require('node:test');
const assert = require('node:assert/strict');
const { ISLANDIA, progresoRutaLibre } = require('../lib/rutasLibres');
const ahora = Date.parse('2026-10-10T00:00:00Z');
const p = (extra={}) => ({ id:'p',user_id:'u',route_id:ISLANDIA.id,accepted_at:'2026-10-07T10:00:00Z',paused_at:null,pause_periods:[],...extra });
const a = (id,fecha,km=5,extra={}) => ({id,user_id:'u',recorded_at:fecha,distance_km:km,excluida:false,...extra});
const calcular = (part,acts) => progresoRutaLibre(part,acts,'u',ahora);
test('ruta libre: explorar no crea participación; aceptar sin movimiento no cuenta como inicio',()=>{
  assert.equal(calcular(null,[]),null);
  const r=calcular(p(),[]);assert.equal(r.estado,'elegida');assert.equal(r.started_at,null);assert.equal(r.km,0);
});
test('ruta libre: primera actividad posterior inicia; Strava viejo importado después queda fuera',()=>{
  const r=calcular(p(),[a('vieja','2026-10-06T23:00:00Z',200,{source:'strava'}),a('nueva','2026-10-07T11:00:00Z',7,{source:'gps'}),a('otra','2026-10-08T11:00:00Z',3,{source:'manual'})]);
  assert.equal(r.km,10);assert.equal(r.started_at,'2026-10-07T11:00:00.000Z');
});
test('ruta libre: actividades se comparten con pagos sin filtrar por challenge_id ni duplicar filas',()=>{
  const acts=[a('a','2026-10-07T11:00:00Z',9,{challenge_id:'reto-pago'})];const copia=JSON.stringify(acts);
  assert.equal(calcular(p(),acts).km,9);assert.equal(JSON.stringify(acts),copia);
  assert.throws(()=>calcular(p(),[...acts,...acts]),/repetida/);
});
test('ruta libre: pausas históricas y abiertas excluyen por fecha de actividad, incluso importaciones tardías',()=>{
  const acts=[a('antes','2026-10-07T11:00:00Z'),a('en','2026-10-08T11:00:00Z'),a('despues','2026-10-09T11:00:00Z')];
  assert.equal(calcular(p({pause_periods:[{desde:'2026-10-08T00:00:00Z',hasta:'2026-10-09T00:00:00Z'}]}),acts).km,10);
  assert.equal(calcular(p({paused_at:'2026-10-08T00:00:00Z'}),acts).km,5);
});
test('ruta libre: pausa antes de primera actividad conserva estado sin inicio; abandonar conserva progreso',()=>{
  assert.equal(calcular(p({paused_at:'2026-10-07T10:01:00Z'}),[a('a','2026-10-07T11:00:00Z')]).started_at,null);
  const r=calcular(p({paused_at:'2026-10-08T00:00:00Z',left_at:'2026-10-08T00:00:00Z'}),[a('a','2026-10-07T11:00:00Z'),a('b','2026-10-09T11:00:00Z')]);assert.equal(r.estado,'abandonada');assert.equal(r.km,5);
});
test('ruta libre: descarta otro usuario, excluidas, futuras e inválidas',()=>{
  const r=calcular(p(),[a('1','2026-10-07T11:00:00Z',5,{user_id:'otro'}),a('2','2026-10-07T11:00:00Z',5,{excluida:true}),a('3','2026-10-11T11:00:00Z'),a('4','no-fecha'),a('5','2026-10-07T11:00:00Z',-1)]);
  assert.equal(r.km,0);assert.throws(()=>calcular(p({user_id:'otro'}),[]));
});
test('ruta libre: completa a 1400, conserva fecha del cruce y no completa por redondeo prematuro',()=>{
  const r=calcular(p(),[a('1','2026-10-07T11:00:00Z',1399.9999)]);assert.equal(r.estado,'en_curso');assert.equal(r.completed_at,null);
  const fin=calcular(p(),[a('1','2026-10-07T11:00:00Z',1399),a('2','2026-10-08T11:00:00Z',2),a('3','2026-10-09T11:00:00Z',5)]);
  assert.equal(fin.km,1400);assert.equal(fin.estado,'completada');assert.equal(fin.completed_at,'2026-10-08T11:00:00.000Z');
});
