// Hotfix controlado 2026-10-04.
// Repara SOLO los cinco user_challenges auditados cuyo progreso quedó detrás
// de sus actividades. CAS: si km_completed/status cambió desde la auditoría,
// NO toca esa fila. Nunca baja kilómetros.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const CASOS = [
  { id:'7d81576a-9ff4-49ed-aba1-04b02714ac64', antes:54.185, despues:58.308 },
  { id:'3f5498e8-ee0a-4a7f-abfd-b0f4e5b0049e', antes:33.73, despues:38.83 },
  { id:'164aadd6-74d9-4eb9-81b8-e0a692b1b78b', antes:54.41, despues:59.84 },
  { id:'79b10afd-1968-40f0-b6d7-3cd40f719194', antes:83.82, despues:91.02 },
  { id:'597defc8-ff97-40f4-b6cb-f51960009359', antes:20.368, despues:32.928 },
];

const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SECRET;
if(!url || !key){ console.error('Faltan SUPABASE_URL o SUPABASE_SECRET.'); process.exit(1); }
const db=createClient(url,key);

(async()=>{
  console.log('=== HOTFIX PROGRESO 2026-10-04 ===');
  const resultado=[];
  for(const c of CASOS){
    const {data:actual,error:e1}=await db.from('user_challenges')
      .select('id,status,km_completed,version').eq('id',c.id).maybeSingle();
    if(e1) throw e1;
    if(!actual || actual.status!=='active' || Math.abs(Number(actual.km_completed)-c.antes)>0.001){
      resultado.push({id:c.id,resultado:'NO TOCADO',actual:actual?.km_completed,status:actual?.status});
      continue;
    }
    let q=db.from('user_challenges')
      .update({km_completed:c.despues})
      .eq('id',c.id).eq('status','active');
    q = actual.version === null || actual.version === undefined
      ? q.is('version', null)
      : q.eq('version', actual.version);
    const {data,error}=await q.select('id,km_completed,version');
    if(error) throw error;
    if(data?.length===1) resultado.push({id:c.id,resultado:'REPARADO',antes:c.antes,despues:data[0].km_completed});
    else resultado.push({id:c.id,resultado:'NO TOCADO - CAS',actual:actual.km_completed});
  }
  console.table(resultado);
  console.log('Reparados:',resultado.filter(x=>x.resultado==='REPARADO').length,'/',CASOS.length);
})().catch(e=>{console.error('Hotfix falló:',e.message);process.exit(1);});
