const test = require('node:test');
const assert = require('node:assert/strict');
const { solicitarGrupo } = require('../services/gruposCore');
const session = { user: { id: 'persona' }, access_token: 'token' };
const response = (status, data, contentType='application/json') => ({ status, ok:status>=200&&status<300, headers:{get:()=>contentType},json:async()=>data });
test('grupos: sin sesión no envía solicitudes',async()=>{
 await assert.rejects(solicitarGrupo({ session:null,accion:'crear',fetchImpl:()=>assert.fail('fetch inesperado') }),/iniciar sesión/);
});
test('grupos: crear usa la sesión actual y conserva datos',async()=>{
 const grupo={id:'g',nombre:'Amigos',codigo:'ABC123'};
 const data=await solicitarGrupo({session,accion:'crear',datos:{user_id:'otro',nombre:'Amigos'},fetchImpl:async(url,options)=>{
  assert.match(url,/\/grupos\/crear$/);assert.equal(options.headers.Authorization,'Bearer token');assert.deepEqual(JSON.parse(options.body),{user_id:'persona',nombre:'Amigos'});return response(200,{grupo});
 }});assert.deepEqual(data.grupo,grupo);
});
test('grupos: 404 HTML indica servicio no disponible sin parsear HTML',async()=>{
 await assert.rejects(solicitarGrupo({session,accion:'crear',fetchImpl:async()=>({...response(404,null,'text/html'),json:()=>assert.fail('no parsear HTML')})}),/no están disponibles/);
});
test('grupos: muestra el motivo del servidor y no acepta errores como éxito',async()=>{
 await assert.rejects(solicitarGrupo({session,accion:'crear',fetchImpl:async()=>response(400,{error:'Ya estás en tres grupos'})}),/tres grupos/);
 await assert.rejects(solicitarGrupo({session,accion:'salir',fetchImpl:async()=>response(500,{})}),/No se pudo/);
});
test('grupos: 404 JSON al unirse conserva código inexistente',async()=>{
 await assert.rejects(solicitarGrupo({session,accion:'unirse',fetchImpl:async()=>response(404,{error:'No existe ese código'})}),/No existe/);
});
test('grupos: valida respuesta de lista y confirmación de creación',async()=>{
 await assert.rejects(solicitarGrupo({session,accion:'listar',fetchImpl:async()=>response(200,{})}),/leer tus grupos/);
 await assert.rejects(solicitarGrupo({session,accion:'crear',fetchImpl:async()=>response(200,{})}),/no confirmó/);
 assert.deepEqual(await solicitarGrupo({session,accion:'listar',fetchImpl:async()=>response(200,[])}),[]);
});
