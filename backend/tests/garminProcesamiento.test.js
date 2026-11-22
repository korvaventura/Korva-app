const test = require('node:test');
const assert = require('node:assert/strict');
const { procesarGarmin, iniciarProcesamientoGarmin } = require('../lib/garminProcesamiento');
function fixture({ ok = true, rpcError = null } = {}) {
 const calls = [];
 const supabase = { from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; }, limit: async () => ({data:[{id:'event',user_id:'user',payload:{external_id:'garmin:123'}}]}), update() { calls.push('finish'); return this; }, then(resolve) { resolve({error:null}); } }; },
 rpc: async () => { calls.push('write'); return {data:{result:'importado',marcas:[{id:'challenge',marca:'stamp'}]},error:rpcError}; } };
 return { calls, options:{supabase,repoMotor:{},allowedIds:['user'],recalcular:async p=>{calls.push('recalculate');assert.deepEqual(p.marcasALimpiar,[{id:'challenge',marca:'stamp'}]);return {ok,informe:{eventos_para_procesar:['completion']}};},dispararEfectos:async()=>calls.push('effects')} };
}
test('Garmin finishes only after durable import, successful motor and effects',async()=>{
 const {calls,options}=fixture();assert.equal((await procesarGarmin(options)).procesados,1);
 assert.deepEqual(calls,['write','recalculate','effects','finish']);
});
test('failed motor leaves durable event pending for retry',async()=>{
 const {calls,options}=fixture({ok:false});assert.equal((await procesarGarmin(options)).procesados,0);
 assert.deepEqual(calls,['write','recalculate']);
});
test('database error cannot acknowledge event as processed',async()=>{
 const {calls,options}=fixture({rpcError:Error('db')});assert.equal((await procesarGarmin(options)).procesados,0);assert.deepEqual(calls,['write']);
});
test('worker disabled by default and without explicit private accounts',()=>{
 assert.equal(iniciarProcesamientoGarmin({env:{}}),null);
 assert.equal(iniciarProcesamientoGarmin({env:{GARMIN_ACTIVITIES_ENABLED:'1',GARMIN_PUSH_CAPTURE_ENABLED:'1',GARMIN_OAUTH_ENABLED:'1'}}),null);
});

test('public worker avoids private filter and passes external id to progress push',async()=>{
 const {calls,options}=fixture();options.allowedIds=null;
 options.notificar=async p=>{assert.equal(p.externalId,'garmin:123');calls.push('push');};
 assert.equal((await procesarGarmin(options)).procesados,1);
 assert.deepEqual(calls,['write','recalculate','effects','push','finish']);
});
