const test=require('node:test');const assert=require('node:assert/strict');
const {crearSocialGroups}=require('../lib/socialGroups');
const U='11111111-1111-4111-8111-111111111111',G='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
function repo(respuestas) {
 const llamadas=[];
 return {llamadas,from(tabla){const q={then(resolve,reject){return Promise.resolve(respuestas.shift()).then(resolve,reject);}};for(const op of ['select','eq','in','order','limit'])q[op]=(...args)=>{llamadas.push({tabla,op,args});return q;};return q;}};
}
test('grupos: las mutaciones usan la identidad del servidor y normalizan entrada',async()=>{
 const calls=[];const s=crearSocialGroups({supabase:{rpc:async(name,args)=>{calls.push([name,args]);return{data:{grupo:{id:G}}};}}});
 await s.modificar(U,'crear',{user_id:'otro',nombre:'  Amigos  '});await s.modificar(U,'unirse',{codigo:' abc123 '});
 assert.deepEqual(calls,[['korva_social_group_create',{p_user:U,p_nombre:'Amigos'}],['korva_social_group_join',{p_user:U,p_codigo:'ABC123'}]]);
});
test('grupos: valida entradas antes de escribir',async()=>{
 const s=crearSocialGroups({supabase:{rpc:()=>assert.fail('RPC inesperado')}});
 await assert.rejects(s.modificar(U,'crear',{nombre:'a'}),e=>e.status===400);
 await assert.rejects(s.modificar(U,'unirse',{codigo:'abcdefg'}),e=>e.status===400);
 await assert.rejects(s.modificar(U,'salir',{group_id:'otro'}),e=>e.status===400);
});
test('grupos: ausencia de migración y límite informado se distinguen',async()=>{
 for(const [error,status]of [[{code:'PGRST202'},503],[{code:'P0001',message:'Grupo lleno'},400]]){
  const s=crearSocialGroups({supabase:{rpc:async()=>({error})}});await assert.rejects(s.modificar(U,'unirse',{codigo:'ABC123'}),e=>e.status===status);
 }
});
test('grupos: salir requiere confirmación real del servidor',async()=>{
 const s=crearSocialGroups({supabase:{rpc:async(n,a)=>{assert.equal(n,'korva_social_group_leave');assert.equal(a.p_user,U);return{data:{ok:true}};}}});
 assert.deepEqual(await s.modificar(U,'salir',{group_id:G}),{ok:true});
 const malo=crearSocialGroups({supabase:{rpc:async()=>({data:null})}});await assert.rejects(malo.modificar(U,'salir',{group_id:G}),/inválida/);
});
test('grupos: alguien ajeno no puede consultar miembros ni progreso',async()=>{
 const db=repo([{data:[]}]);await assert.rejects(crearSocialGroups({supabase:db}).progreso(U,G,C),e=>e.status===403);
 assert.equal(db.llamadas.filter(c=>c.tabla==='user_challenges').length,0);
});
test('grupos: listado vacío no consulta ni expone grupos ajenos',async()=>{
 const db=repo([{data:[]}]);assert.deepEqual(await crearSocialGroups({supabase:db}).listar(U),[]);
 assert.equal(db.llamadas.some(c=>c.tabla==='social_groups'),false);
 assert.deepEqual(db.llamadas.find(c=>c.op==='eq').args,['user_id',U]);
});
test('grupos: progreso respeta objetivo de cada persona y deduplica inscripciones',async()=>{
 const V='44444444-4444-4444-8444-444444444444';
 const db=repo([
 {data:[{id:'membership'}]}, {data:[{user_id:U},{user_id:V}]},
 {data:[{user_id:U,km_completed:20,status:'completed',version:'estandar'},{user_id:U,km_completed:10,status:'active',version:'estandar'},{user_id:V,km_completed:20,status:'active',version:'extendida',pausado:true}]},
 {data:[{id:U,name:'Zoe',email:'no publicar'},{id:V,name:'Ana'}]},
 {data:[{modalidades:[{version:'estandar',distancia_km:20},{version:'extendida',distancia_km:60}]}]},
 ]);
 const rows=await crearSocialGroups({supabase:db}).progreso(U,G,C);
 assert.equal(rows.length,2);assert.equal(rows[0].nombre,'Ana');assert.equal(rows[0].porcentaje,'33');assert.equal(rows[0].pausado,true);assert.equal(rows[1].porcentaje,'100');assert.equal(rows.some(r=>'email'in r),false);
 assert.deepEqual(db.llamadas.find(c=>c.tabla==='user_challenges'&&c.op==='in'&&c.args[0]==='user_id').args[1],[U,V]);
});
