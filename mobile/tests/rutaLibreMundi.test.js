const test=require('node:test');
const assert=require('node:assert/strict');
const {destinoRutaLibre,ISLANDIA_MUNDI}=require('../services/rutaLibreMundiCore');
test('Islandia existe en el globo sin inscripción, con ID estable y ubicación propia',()=>{
  const d=destinoRutaLibre(null);
  assert.equal(d.id,ISLANDIA_MUNDI.id);assert.equal(d.estado,'por_conquistar');
  assert.equal(d.latitude,65);assert.equal(d.longitude,-19);assert.equal(d.km,0);assert.equal(d.gratuita,true);
});
test('aceptada sin km, pausada y completada conservan progreso y nunca simulan una compra',()=>{
  const p={km:0,porcentaje:0,estado:'elegida',abandonado:false,pausado:false};
  assert.equal(destinoRutaLibre(p).estado,'en_curso');
  const pausada=destinoRutaLibre({...p,km:70,porcentaje:5,pausado:true});
  assert.equal(pausada.km,70);assert.equal(pausada.pausado,true);
  const fin=destinoRutaLibre({...p,km:1400,porcentaje:100,estado:'completada',completed_at:'2026-10-10'});
  assert.equal(fin.estado,'conquistado');assert.equal(fin.completed_at,'2026-10-10');
  assert.equal(destinoRutaLibre({...p,abandonado:true,km:70}).estado,'por_conquistar');
});
