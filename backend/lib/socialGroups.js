const { objetivoDeInscripcion, versionDeInscripcion } = require('./versionDesafio');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function problema(status, message) { const error = new Error(message); error.status = status; return error; }
async function consulta(query) { const { data, error } = await query; if (error) throw error; return data || []; }
function crearSocialGroups({ supabase }) {
  return {
    async listar(userId) {
      const miembros = await consulta(supabase.from('social_group_members').select('group_id').eq('user_id',userId));
      const ids = [...new Set(miembros.map(m=>m.group_id).filter(Boolean))];
      if (!ids.length) return [];
      return consulta(supabase.from('social_groups').select('id,nombre,codigo').in('id',ids).order('nombre'));
    },
    async modificar(userId,accion,body) {
      let rpc,params;
      if(accion==='crear') {
        const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
        if(nombre.length<2||nombre.length>60) throw problema(400,'El nombre debe tener entre 2 y 60 caracteres.');
        rpc='korva_social_group_create';params={p_user:userId,p_nombre:nombre};
      } else if(accion==='unirse') {
        const codigo = typeof body.codigo === 'string' ? body.codigo.trim().toUpperCase() : '';
        if(!/^[A-Z0-9]{6}$/.test(codigo)) throw problema(400,'El código debe tener 6 letras o números.');
        rpc='korva_social_group_join';params={p_user:userId,p_codigo:codigo};
      } else {
        if(!UUID.test(body.group_id||'')) throw problema(400,'Grupo inválido.');
        rpc='korva_social_group_leave';params={p_user:userId,p_group:body.group_id};
      }
      const {data,error}=await supabase.rpc(rpc,params);
      if(error) {
        if(error.code==='P0001') throw problema(400,error.message);
        if(error.code==='PGRST202'||error.code==='42883') throw problema(503,'Los grupos todavía no están habilitados. Intentá más tarde.');
        throw error;
      }
      if(accion==='salir' ? data?.ok!==true : !data?.grupo?.id) throw new Error('Respuesta de grupos inválida');
      return data;
    },
    async resumen(userId,groupId) {
      if(!UUID.test(groupId)) throw problema(400,'Grupo inválido.');
      const acceso=await consulta(supabase.from('social_group_members').select('id').eq('group_id',groupId).eq('user_id',userId).limit(1));
      if(!acceso.length) throw problema(403,'Necesitás ser parte del grupo para ver sus participantes.');
      const miembros=await consulta(supabase.from('social_group_members').select('user_id').eq('group_id',groupId));
      const ids=[...new Set(miembros.map(m=>m.user_id).filter(Boolean))];
      if(!ids.length) return { tipo:'grupo_resumen_v1', participantes:[] };
      const [usuarios,inscritos]=await Promise.all([
        consulta(supabase.from('users').select('id,name,avatar_url').in('id',ids)),
        consulta(supabase.from('user_challenges').select('user_id,challenge_id,km_completed,status,version,modalidad,pausado').in('user_id',ids).in('status',['active','completed','shipped','cargado']).order('km_completed',{ascending:false})),
      ]);
      const challengeIds=[...new Set(inscritos.map(i=>i.challenge_id).filter(Boolean))];
      const retos=challengeIds.length ? await consulta(supabase.from('challenges').select('id,title,modalidades,total_distance_km').in('id',challengeIds)) : [];
      const retoPorId=new Map(retos.map(r=>[r.id,r]));
      const desafiosPorUsuario=new Map(ids.map(id=>[id,[]]));
      const vistos=new Set();
      for(const uc of inscritos) {
        const clave=`${uc.user_id}:${uc.challenge_id}`;
        if(vistos.has(clave)) continue;
        vistos.add(clave);
        const reto=retoPorId.get(uc.challenge_id);
        const km=Number(uc.km_completed);
        const distancia=objetivoDeInscripcion(uc,reto).objetivo_km;
        desafiosPorUsuario.get(uc.user_id)?.push({
          challenge_id:uc.challenge_id,
          titulo:reto?.title||'Desafío Korva',
          km_completados:Number.isFinite(km)&&km>=0?km:0,
          porcentaje:distancia&&Number.isFinite(km)?Math.max(0,Math.min(100,km/distancia*100)).toFixed(0):null,
          distancia_total:distancia,
          version:versionDeInscripcion(uc),
          status:uc.status,
          pausado:!!uc.pausado,
        });
      }
      const usuarioPorId=new Map(usuarios.map(u=>[u.id,u]));
      const participantes=ids.map(id=>{
        const usuario=usuarioPorId.get(id);
        const desafios=(desafiosPorUsuario.get(id)||[]).sort((a,b)=>a.titulo.localeCompare(b.titulo,'es'));
        return { user_id:id,nombre:usuario?.name?.trim()||'Participante',avatar:usuario?.avatar_url||null,total_desafios:desafios.length,desafios };
      }).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
      return { tipo:'grupo_resumen_v1', participantes };
    },
    async progreso(userId,groupId,challengeId) {
      if(!UUID.test(groupId)||!UUID.test(challengeId)) throw problema(400,'Grupo o desafío inválido.');
      const acceso=await consulta(supabase.from('social_group_members').select('id').eq('group_id',groupId).eq('user_id',userId).limit(1));
      if(!acceso.length) throw problema(403,'Necesitás ser parte del grupo para ver su progreso.');
      const miembros=await consulta(supabase.from('social_group_members').select('user_id').eq('group_id',groupId));
      const ids=[...new Set(miembros.map(m=>m.user_id).filter(Boolean))];
      if (!ids.length) return [];
      const inscritos=await consulta(supabase.from('user_challenges').select('user_id,km_completed,status,version,modalidad,pausado').eq('challenge_id',challengeId).in('user_id',ids).in('status',['active','completed','shipped','cargado']).order('km_completed',{ascending:false}));
      if(!inscritos.length) return [];
      const [usuarios,retos]=await Promise.all([
        consulta(supabase.from('users').select('id,name,avatar_url').in('id',ids)),
        consulta(supabase.from('challenges').select('modalidades,total_distance_km').eq('id',challengeId).limit(1)),
      ]);
      const nombres=new Map(usuarios.map(u=>[u.id,u]));
      const vistos=new Set();
      return inscritos.filter(u=>{if(vistos.has(u.user_id))return false;vistos.add(u.user_id);return true;}).map(uc=>{
        const usuario=nombres.get(uc.user_id);
        const km=Number(uc.km_completed);const distancia=objetivoDeInscripcion(uc,retos[0]).objetivo_km;
        return {user_id:uc.user_id,nombre:usuario?.name?.trim()||'Participante',avatar:usuario?.avatar_url||null,km_completados:Number.isFinite(km)&&km>=0?km:0,porcentaje:distancia&&Number.isFinite(km)?Math.max(0,Math.min(100,km/distancia*100)).toFixed(0):null,distancia_total:distancia,version:versionDeInscripcion(uc),status:uc.status,pausado:!!uc.pausado};
      }).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
    },
  };
}
module.exports={crearSocialGroups};
