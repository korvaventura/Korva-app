const express = require('express');
const requireUser = require('../middleware/requireUser');
const { crearSocialGroups } = require('../lib/socialGroups');
function crearGruposRoutes({supabase, autenticar=requireUser, log=console.error}) {
  const router=express.Router();const servicio=crearSocialGroups({supabase});
  router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');res.vary('Authorization');next();});
  router.use(autenticar);
  const manejar = (fn) => async(req,res)=>{
    try { res.json(await fn(req)); }
    catch(error){ if(!error.status) log('[grupos]',error.message);res.status(error.status||500).json({error:error.status?error.message:'No pudimos completar la solicitud de grupos. Intentá nuevamente.'}); }
  };
  router.get('/mis-grupos/:userId',manejar(req=>{
    if(req.params.userId!==req.userId) {const e=new Error('Solo podés consultar tus grupos.');e.status=403;throw e;}
    return servicio.listar(req.userId);
  }));
  for(const accion of ['crear','unirse','salir']) router.post('/'+accion,manejar(req=>servicio.modificar(req.userId,accion,req.body||{})));
  router.get('/resumen/:groupId',manejar(req=>servicio.resumen(req.userId,req.params.groupId)));
  router.get('/ranking/:groupId/:challengeId',manejar(req=>servicio.progreso(req.userId,req.params.groupId,req.params.challengeId)));
  return router;
}
module.exports={crearGruposRoutes};
