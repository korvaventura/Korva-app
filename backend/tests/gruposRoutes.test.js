const test=require('node:test');const assert=require('node:assert/strict');const express=require('express');
process.env.SUPABASE_URL ||= 'https://example.supabase.co';process.env.SUPABASE_SECRET ||= 'test-secret';
const {crearGruposRoutes}=require('../routes/grupos');
const U='11111111-1111-4111-8111-111111111111';
async function servidor(t,opts){const app=express();app.use(express.json());app.use('/grupos',crearGruposRoutes({...opts,log:()=>{}}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));return `http://127.0.0.1:${server.address().port}/grupos`;}
test('rutas grupos: rechaza solicitudes sin JWT antes de leer o escribir',async t=>{
 const url=await servidor(t,{supabase:{rpc:()=>assert.fail('RPC inesperado'),from:()=>assert.fail('lectura inesperada')}});
 const res=await fetch(url+'/crear',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:U,nombre:'Amigos'})});assert.equal(res.status,401);
});
test('rutas grupos: body no suplanta la sesión y las respuestas no se cachean',async t=>{
 const url=await servidor(t,{autenticar:(req,res,next)=>{req.userId=U;next();},supabase:{rpc:async(name,args)=>{assert.equal(args.p_user,U);return{data:{grupo:{id:'g',nombre:'Amigos',codigo:'ABC123'}}};}}});
 const res=await fetch(url+'/crear',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:'otro',nombre:'Amigos'})});assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store');
 const other=await fetch(url+'/mis-grupos/otro');assert.equal(other.status,403);
});
