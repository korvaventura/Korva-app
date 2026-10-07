const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=file=>fs.readFileSync(require.resolve(file),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
test('Salud pública: una lectura de la cuenta anterior nunca se envía con la nueva sesión',async()=>{
 let enviados=0;const ctx={Platform:{OS:'ios'},supabase:{auth:{getSession:async()=>({data:{session:{access_token:'x',user:{id:'otro'}}}})}},fetch:async()=>{enviados++;},Set,Date};
 const enviar=vm.runInNewContext(source('../services/health/movimientoSync')+'\nenviarMovimiento;',ctx);
 const r=await enviar({dias:[]},'original');assert.equal(r.ok,false);assert.equal(enviados,0);
});
test('Salud pública: frecuencia automática, actualización explícita y desconexión durante lectura',async()=>{
 let enviado=0,activo=true,desconectarAlLeer=false;const memoria=new Map([['health_sync_auto_estado_u1',JSON.stringify({ultimoExitoMs:Date.now()})]]);
 const ctx={Platform:{OS:'ios'},AsyncStorage:{getItem:async(k)=>k==='health_sync_auto_activado_u1'?String(activo):memoria.get(k)||null,setItem:async(k,v)=>memoria.set(k,v)},plataformaSoportada:true,estadoSalud:async()=>({disponible:true,estadoPermiso:'ya_pedido'}),leerMovimientoDiario:async()=>{if(desconectarAlLeer)activo=false;return {};},construirPayload:()=>({payload:{dias:[{}]},enviados:[],omitidosLocales:[]}),enviarMovimiento:async(p,id)=>{assert.equal(id,'u1');enviado++;return {ok:true,status:200,cuerpo:{}};},Date};
 const ejecutar=vm.runInNewContext(source('../services/health/syncAutomatico')+'\nejecutarSyncAutomatico;',ctx);
 assert.equal((await ejecutar('u1')).motivo,'reciente');assert.equal(enviado,0);
 assert.equal((await ejecutar('u1',{forzar:true})).motivo,'ok');assert.equal(enviado,1);
 desconectarAlLeer=true;assert.equal((await ejecutar('u1',{forzar:true})).motivo,'desactivado');assert.equal(enviado,1);
});
