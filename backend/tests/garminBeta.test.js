const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { cuentasGarmin, usuarioGarminPermitido } = require('../lib/garminAcceso');
const { crearGarminConsentRoutes, normalizarConsentimiento } = require('../routes/garminConsent');
const { notificarGarmin } = require('../lib/garminNotificacion');
const USER='11111111-1111-4111-8111-111111111111';
test('public opt-in, empty private allowlist denied, OAuth master switch closes intake',()=>{
 assert.deepEqual(cuentasGarmin({}),[]);
 assert.equal(usuarioGarminPermitido(USER,{GARMIN_OAUTH_ENABLED:'1'}),false);
 assert.equal(usuarioGarminPermitido(USER,{GARMIN_OAUTH_ENABLED:'1',GARMIN_PUBLIC_BETA_ENABLED:'1'}),true);
 assert.equal(usuarioGarminPermitido(USER,{GARMIN_PUBLIC_BETA_ENABLED:'1'}),false);
 assert.deepEqual(cuentasGarmin({GARMIN_PUBLIC_BETA_ENABLED:'0',GARMIN_OAUTH_TEST_USER_IDS:USER}),[USER]);
});
test('permission payload validates full batch, strips extra data and accepts removal of all permissions',()=>{
 const row={userId:'provider',permissions:[],changeTimeInSeconds:1700000000,secret:'never persist'};
 assert.deepEqual(normalizarConsentimiento({userPermissionsChange:[row]},'permissions'),[{garmin_user_id:'provider',permissions:[],changed_at:'2023-11-14T22:13:20.000Z'}]);
 assert.throws(()=>normalizarConsentimiento({userPermissionsChange:[row,{...row,permissions:'ACTIVITY_EXPORT'}]},'permissions'));
 assert.throws(()=>normalizarConsentimiento({deregistrations:[{userId:''}]},'deregistration'));
});
test('consent endpoints remain operational with beta OFF; validate origin and durable write before ACK',async()=>{
 let ip='185.207.94.248',fail=false,calls=0;
 const app=express();app.use('/garmin',crearGarminConsentRoutes({env:{},obtenerIp:()=>ip,supabase:{rpc:async()=>{calls++;return {error:fail?Error('db'):null};}}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const post=()=>fetch(`http://127.0.0.1:${server.address().port}/garmin/deregistration`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deregistrations:[{userId:'provider'}]})});
 try{assert.equal((await post()).status,200);fail=true;assert.equal((await post()).status,503);ip='127.0.0.1';assert.equal((await post()).status,403);assert.equal(calls,2);}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('Garmin push sends external_id only for actually increased active non-paused challenges',async()=>{
 const calls=[];const rows=[{id:'uc',status:'active',pausado:false,challenge_id:'challenge',challenges:{title:'Fuji',total_distance_km:68}}];
 const supabase={from:()=>({select(){return this;},eq(){return this;},in:async()=>({data:rows})})};
 const d={user_challenge_id:'uc',status_leido:'active',accion:'actualizar_km',escrito:true,km_leido:1,km_nuevo:3};
 const options={supabase,userId:USER,desafios:[d],externalId:'garmin:123',enviar:async(...args)=>calls.push(args)};
 await notificarGarmin(options);assert.equal(calls.length,1);assert.deepEqual(calls[0].at(-1),{external_id:'garmin:123'});
 for(const change of [{escrito:false},{km_nuevo:1},{accion:'completar'},{status_leido:'completed'}]) await notificarGarmin({...options,desafios:[{...d,...change}]});
 rows[0].pausado=true;await notificarGarmin(options);assert.equal(calls.length,1);
});
