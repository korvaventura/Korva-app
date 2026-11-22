const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../App.js'),'utf8');
const gate=source.slice(source.indexOf('const chequearPantallas ='),source.indexOf('function HomeTabs'));
function sandbox(values,fail=false){return vm.createContext({AsyncStorage:{getItem:async key=>{if(fail)throw Error('storage');return values[key]??null;}},LEGAL_VERSION:'2026-10-08',legalKey:id=>`korva:legal:${id}`,onboardingKey:id=>`korva:onboarding:${id}`});}
async function state(ctx,id){let terms,onboard;await vm.runInContext('(()=>{'+gate+'\nreturn chequearPantallas;})()',ctx)(id,v=>terms=v,v=>onboard=v);return [terms,onboard];}
test('aceptación: la versión vieja y otra cuenta no autorizan el nuevo inicio',async()=>{
 const ctx=sandbox({'terminos_aceptados':'true','korva:legal:a':'2026-10-08','korva:onboarding:a':'true'});
 assert.deepEqual(await state(ctx,'a'),[false,false]);assert.deepEqual(await state(ctx,'b'),[true,false]);
 assert.deepEqual(await state(sandbox({'korva:legal:a':'2026-09-01'}),'a'),[true,false]);
});
test('onboarding aparece después de aceptar; error local no omite los términos',async()=>{
 assert.deepEqual(await state(sandbox({'korva:legal:a':'2026-10-08'}),'a'),[false,true]);
 assert.deepEqual(await state(sandbox({},true),'a'),[true,false]);
});
test('notificaciones: el inicio no pide permiso; una acción explícita sí',async()=>{
 const fn=source.slice(source.indexOf('const registrarPushToken ='),source.indexOf('const chequearPantallas ='));
 let requests=0;const ctx=vm.createContext({Notifications:{getPermissionsAsync:async()=>({status:'denied'}),requestPermissionsAsync:async()=>{requests++;return {status:'denied'};}},console});
 const register=vm.runInContext(fn+'\nregistrarPushToken',ctx);
 await register('a');assert.equal(requests,0);await register('a',true);assert.equal(requests,1);
});
