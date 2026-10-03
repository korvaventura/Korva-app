import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
register('./cargador.mjs', import.meta.url);
const { transformarHealthConnect, fusionarIntervalos, proporcionEnIntervalos } = await import('../healthConnectTransform.js');
const { leerPaginado } = await import('../healthConnectPaginacion.js');

const inicio = new Date(2026, 9, 1, 0, 0, 0, 0);
const fin = new Date(2026, 9, 3, 12, 0, 0, 0);
const iso = (d,h,m=0) => new Date(2026,9,d,h,m).toISOString();
const meta = (origin='phone', method=2) => ({ dataOrigin: origin, recordingMethod: method, device: { manufacturer:'Test', model:'Phone' } });

test('excluye entradas manuales de pasos, distancia y sesiones', () => {
  const r = transformarHealthConnect({
    dias:3,inicio,fin,exerciseTypeBiking:8,
    pasos:[{startTime:iso(3,8),endTime:iso(3,9),count:1000,metadata:meta('phone',2)},{startTime:iso(3,9),endTime:iso(3,10),count:9000,metadata:meta('manual',3)}],
    distancias:[{startTime:iso(3,8),endTime:iso(3,9),distance:{inKilometers:2},metadata:meta('phone',2)},{startTime:iso(3,9),endTime:iso(3,10),distance:{inKilometers:9},metadata:meta('manual',3)}],
    sesiones:[{startTime:iso(3,8),endTime:iso(3,9),exerciseType:8,metadata:meta('manual',3)}],
  });
  const hoy=r.dias[2]; assert.equal(hoy.consolidado.pasos,1000); assert.equal(hoy.consolidado.caminando,2); assert.equal(hoy.consolidado.bici,0);
});

test('clasifica distancia proporcionalmente por superposición con bici', () => {
  const r=transformarHealthConnect({dias:3,inicio,fin,exerciseTypeBiking:8,pasos:[],
    distancias:[{startTime:iso(3,8),endTime:iso(3,10),distance:{inKilometers:10},metadata:meta()}],
    sesiones:[{startTime:iso(3,9),endTime:iso(3,9,30),exerciseType:8,metadata:meta()}]});
  assert.equal(r.dias[2].consolidado.bici,2.5); assert.equal(r.dias[2].consolidado.caminando,7.5);
});

test('fusiona sesiones superpuestas y nunca asigna más de 100% a bici',()=>{
 const f=fusionarIntervalos([[iso(3,8),iso(3,9,30)],[iso(3,9),iso(3,10)]]);
 assert.equal(f.length,1); assert.equal(proporcionEnIntervalos(iso(3,8),iso(3,10),f),1);
});

test('reparte un registro que cruza medianoche entre días locales',()=>{
 const r=transformarHealthConnect({dias:3,inicio,fin,exerciseTypeBiking:8,pasos:[],sesiones:[],
  distancias:[{startTime:iso(2,23),endTime:iso(3,1),distance:{inKilometers:4},metadata:meta()}]});
 assert.equal(r.dias[1].consolidado.caminando,2); assert.equal(r.dias[2].consolidado.caminando,2);
});

test('mantiene desglose por dataOrigin para detectar duplicados en canary',()=>{
 const r=transformarHealthConnect({dias:3,inicio,fin,exerciseTypeBiking:8,pasos:[],sesiones:[],distancias:[
  {startTime:iso(3,8),endTime:iso(3,9),distance:{inKilometers:1},metadata:meta('app.a')},
  {startTime:iso(3,8),endTime:iso(3,9),distance:{inKilometers:1},metadata:meta('app.b')},
 ]});
 assert.equal(r.dias[2].consolidado.caminando,2); assert.deepEqual(r.dias[2].porFuente.caminando.map(x=>x.bundleIdentifier).sort(),['app.a','app.b']);
 assert.match(r.diagnosticoHealthConnect.advertenciaDuplicados,/no deduplica/);
});


test('pagina readRecords hasta agotar pageToken sin perder opciones', async()=>{
 const llamadas=[];
 const reader=async(tipo,opts)=>{
  llamadas.push({tipo,opts});
  if(!opts.pageToken) return {records:[{id:1}],pageToken:'p2'};
  return {records:[{id:2}]};
 };
 const filtro={operator:'between',startTime:'a',endTime:'b'};
 const r=await leerPaginado(reader,'Distance',filtro,50);
 assert.deepEqual(r,[{id:1},{id:2}]);
 assert.equal(llamadas.length,2);
 assert.equal(llamadas[0].opts.pageSize,50);
 assert.equal(llamadas[1].opts.pageToken,'p2');
 assert.equal(llamadas[1].opts.timeRangeFilter,filtro);
});
