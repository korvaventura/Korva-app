const test=require('node:test');const assert=require('node:assert/strict');
process.env.SUPABASE_URL ||= 'https://example.supabase.co';process.env.SUPABASE_SECRET ||= 'test-not-secret';
const express=require('express');const {crearRutasLibresRoutes}=require('../routes/rutasLibres');const {ISLANDIA}=require('../lib/rutasLibres');
async function conServidor(repo,fn){
  const app=express();app.use(express.json());app.use('/rutas-libres',crearRutasLibresRoutes({supabase:repo,log:()=>{},auth:(req,res,next)=>{if(req.headers.authorization!=='Bearer test')return res.sendStatus(401);req.userId='usuario-real';next();}}));
  const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));
  const pedir=async(path,body,token=true)=>{const r=await fetch(`http://127.0.0.1:${s.address().port}/rutas-libres/islandia${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer test'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,json:r.headers.get('content-type')?.includes('json')?await r.json():null,cache:r.headers.get('cache-control')};};
  try{await fn(pedir);}finally{s.closeAllConnections();await new Promise(r=>s.close(r));}
}
test('rutas: requiere sesión y aceptación explícita versionada antes de llamar RPC',async()=>{
  let llamadas=0;await conServidor({rpc:async()=>{llamadas++;return{error:null};}},async pedir=>{
    assert.equal((await pedir('/aceptar',{acepto:true,version:ISLANDIA.aceptacion_version},false)).status,401);
    for(const b of [{},{acepto:'true',version:ISLANDIA.aceptacion_version},{acepto:true,version:'vieja'}])assert.equal((await pedir('/aceptar',b)).status,400);
    assert.equal(llamadas,0);
  });
});
test('rutas: aceptación toma identidad del JWT, ignora user_id del body y no crea documentos',async()=>{
  let args;await conServidor({rpc:async(nombre,p)=>{args={nombre,p};return{error:null};}},async pedir=>{
    const r=await pedir('/aceptar',{acepto:true,version:ISLANDIA.aceptacion_version,user_id:'intruso'});assert.equal(r.status,200);assert.equal(r.cache,'private, no-store');
    assert.equal(args.nombre,'korva_free_route_action');assert.equal(args.p.p_user_id,'usuario-real');assert.equal(args.p.p_route_id,ISLANDIA.id);
  });
});
test('rutas: migración ausente es 503 y no una inscripción exitosa',async()=>{
  await conServidor({rpc:async()=>({error:{code:'PGRST202',message:'missing'}})},async pedir=>assert.equal((await pedir('/pausar',{})).status,503));
});
test('rutas: consulta inexistente no inventa progreso y filtra participación por usuario autenticado',async()=>{
  const filtros=[];const q={select(){return this;},eq(k,v){filtros.push([k,v]);return this;},async maybeSingle(){return{data:null,error:null};}};
  await conServidor({from:tabla=>{assert.equal(tabla,'free_route_participations');return q;}},async pedir=>{
    const r=await pedir('');assert.equal(r.status,200);assert.equal(r.json.participacion,null);assert.deepEqual(filtros,[['user_id','usuario-real'],['route_id',ISLANDIA.id]]);
  });
});
