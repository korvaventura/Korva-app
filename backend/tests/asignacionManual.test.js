const test = require('node:test');
const assert = require('node:assert/strict');
const { cuentaParaParticipacion } = require('../lib/asignacionManual');
const uc = (id, extra={}) => ({
  id, started_at:'2026-10-01T00:00:00Z', pausado:false, periodos_pausados:[],
  ...extra,
});
const act = (extra={}) => ({
  source:'manual', excluida:false, distance_km:4.82,
  recorded_at:'2026-11-02T03:11:24Z', ...extra,
});

test('solo la participación seleccionada recibe km manuales durante una pausa', () => {
  const pausa = [{ desde:'2026-11-01T00:00:00Z',hasta:'2026-11-03T00:00:00Z' }];
  const a = act({manual_target_uc_ids:['fuji']});
  assert.equal(cuentaParaParticipacion(a, uc('fuji',{periodos_pausados:pausa})),true);
  assert.equal(cuentaParaParticipacion(a, uc('fin')),false);
});
test('las cargas antiguas conservan la interpretación de pausas',()=>{
  const pausa = [{ desde:'2026-11-01T00:00:00Z',hasta:'2026-11-03T00:00:00Z' }];
  assert.equal(cuentaParaParticipacion(act(),uc('fuji',{periodos_pausados:pausa})),false);
});
test('selección explícita no evade reinicio administrativo ni exclusión',()=>{
  assert.equal(cuentaParaParticipacion(act({manual_target_uc_ids:['fuji']}),uc('fuji',{inicio_protegido_at:'2026-11-03T00:00:00Z'})),false);
  assert.equal(cuentaParaParticipacion(act({manual_target_uc_ids:['fuji'],excluida:true}),uc('fuji')),false);
});
test('Strava y GPS mantienen lógica histórica de pausas',()=>{
  const pausa = [{ desde:'2026-11-01T00:00:00Z',hasta:'2026-11-03T00:00:00Z' }];
  for(const source of ['strava','gps']){
    assert.equal(cuentaParaParticipacion(act({source,manual_target_uc_ids:['fuji']}),uc('fuji',{periodos_pausados:pausa})),false);
  }
});
test('selección múltiple suma a todos los destinos elegidos',()=>{
  const a=act({manual_target_uc_ids:['fuji','fin']});
  assert.equal(cuentaParaParticipacion(a,uc('fuji')),true);
  assert.equal(cuentaParaParticipacion(a,uc('fin')),true);
  assert.equal(cuentaParaParticipacion(a,uc('otro')),false);
});
