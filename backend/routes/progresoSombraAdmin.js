// Progreso unificado — Etapa 4A, MODO SOMBRA (solo admin, solo lectura).
//
// GET /admin/progreso-sombra?user_id=<uuid>
//     → todos los desafíos de ese usuario, con detalle de cada actividad.
// GET /admin/progreso-sombra?todos=1[&solo_diferencias=1]
//     → reporte de TODOS los desafíos 'active' (sin detalle de actividades).
//
// SOLO LECTURA: usa únicamente lib/progresoSombra.js, que solo puede hacer
// SELECT sobre user_challenges, challenges y activities. No escribe nada,
// no lee Health/daily_movement/residual y no llama a ningún recálculo.
// La respuesta no incluye nombres, emails ni direcciones.
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const requireAdmin = require('../middleware/requireAdmin');
const { REGLA_VERSION } = require('../lib/progresoDesafio');
const { progresoSombraUsuario, reporteSombraActivos } = require('../lib/progresoSombra');

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AVISOS = [
  'Modo sombra 4A: no escribe nada; km_completed y los estados no se modifican.',
  'Cálculo solo con activities (sin Health, sin residual, sin km_base).',
  'km_base_candidato es solo diagnóstico: no se asigna ni altera el resultado (decisión D7 pendiente).',
  'Desafíos terminales (completed/cargado/shipped) se informan pero quedarían congelados.',
];

router.get('/', requireAdmin, async (req, res) => {
  const { user_id: userId, todos, solo_diferencias: soloDiferencias } = req.query;
  const modoTodos = todos === '1' || todos === 'true';

  if (!modoTodos && !userId) {
    return res.status(400).json({ error: 'Parámetros inválidos', detalle: ['Pasá user_id=<uuid> o todos=1'] });
  }
  if (modoTodos && userId) {
    return res.status(400).json({ error: 'Parámetros inválidos', detalle: ['Usá user_id o todos=1, no los dos'] });
  }
  if (userId && !UUID_RE.test(String(userId))) {
    return res.status(400).json({ error: 'Parámetros inválidos', detalle: ['user_id inválido'] });
  }

  try {
    const supabase = getSupabase();
    const inicio = Date.now();
    const resultado = modoTodos
      ? await reporteSombraActivos(supabase, { soloDiferencias: soloDiferencias === '1' || soloDiferencias === 'true' })
      : await progresoSombraUsuario(supabase, String(userId));

    res.json({
      regla_version: REGLA_VERSION,
      solo_lectura: true,
      modo: modoTodos ? 'todos_los_activos' : 'usuario',
      user_id: modoTodos ? null : String(userId),
      generado_at: new Date().toISOString(),
      duracion_ms: Date.now() - inicio,
      resumen: resultado.resumen,
      desafios: resultado.desafios,
      avisos: AVISOS,
    });
  } catch (error) {
    console.error('Error en /admin/progreso-sombra:', error.message);
    res.status(500).json({ error: 'No se pudo calcular el progreso en sombra.' });
  }
});

module.exports = router;