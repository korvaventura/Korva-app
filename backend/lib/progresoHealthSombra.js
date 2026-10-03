// Etapa 4B-1 — integración Health en SOMBRA.
//
// Este módulo NO escribe nada. Combina el progreso canónico 4A con el residual
// diario de Health y aplica una regla conservadora de elegibilidad por desafío:
// Health solo puede aportar un día LOCAL completo que quede íntegramente dentro
// de la vida activa del desafío (después de started_at y sin tocar una pausa).
//
// El cierre del día NO se decide aquí. Se reportan dos escenarios:
//   - residual_elegible: todos los días completos elegibles;
//   - residual_elegible_cierre_hipotetico: además exige la hipótesis Etapa 3
//     (48 h desde fin de día + sync posterior al fin).
// Ninguno afecta km_completed en 4B-1.
const { instanteUTC, normalizarPausas } = require('./progresoDesafio');

const REGLA_VERSION = 'progreso_4b_sombra_v1_dia_completo_2026-10-03';

const redondear = (n, dec = 4) => {
  const f = 10 ** dec;
  return Math.round((Number(n) || 0) * f) / f;
};

const evaluarElegibilidadDia = (uc, residualDia) => {
  const inicioDiaMs = Date.parse(residualDia?.ventana_utc?.inicio || '');
  const finDiaMs = Date.parse(residualDia?.ventana_utc?.fin || '');
  if (!Number.isFinite(inicioDiaMs) || !Number.isFinite(finDiaMs) || finDiaMs <= inicioDiaMs) {
    return { elegible: false, motivo: 'ventana_dia_invalida' };
  }

  const inicioDesafioMs = instanteUTC(uc?.started_at);
  if (inicioDesafioMs === null) return { elegible: false, motivo: 'started_at_invalido' };
  // Si el desafío empezó en cualquier momento posterior al inicio del día, no
  // sabemos qué parte del total Health ocurrió antes de empezar.
  if (inicioDesafioMs > inicioDiaMs) return { elegible: false, motivo: 'dia_tocado_por_inicio' };

  const pausas = normalizarPausas(uc || {});
  if (pausas.invalidos.length > 0) return { elegible: false, motivo: 'pausa_invalida' };

  const solapa = (desdeMs, hastaMs) => desdeMs < finDiaMs && hastaMs > inicioDiaMs;
  if (pausas.validos.some((p) => solapa(p.desdeMs, p.hastaMs))) {
    return { elegible: false, motivo: 'dia_tocado_por_pausa' };
  }
  if (pausas.pausaAbiertaDesdeMs !== null && pausas.pausaAbiertaDesdeMs < finDiaMs) {
    return { elegible: false, motivo: 'dia_tocado_por_pausa_abierta' };
  }

  return { elegible: true, motivo: 'dia_completo_elegible' };
};

const simularHealthParaDesafio = ({ uc, progreso4a, residuales }) => {
  const dias = (residuales || []).map((r) => {
    const e = evaluarElegibilidadDia(uc, r);
    const residualKm = Number(r?.residual?.total_crudo_km) || 0;
    const cierreHipotetico = r?.hipotesis_cierre?.se_cerraria === true;
    return {
      fecha: r.fecha,
      timezone: r.timezone,
      elegible: e.elegible,
      motivo: e.motivo,
      residual_km: redondear(residualKm),
      cierre_hipotetico: cierreHipotetico,
      aportaria_sin_resolver_cierre_km: redondear(e.elegible ? residualKm : 0),
      aportaria_con_cierre_hipotetico_km: redondear(e.elegible && cierreHipotetico ? residualKm : 0),
      marcas_residual: r.marcas || [],
    };
  });

  const residualElegible = dias.reduce((a, d) => a + d.aportaria_sin_resolver_cierre_km, 0);
  const residualCierre = dias.reduce((a, d) => a + d.aportaria_con_cierre_hipotetico_km, 0);
  const km4a = Number(progreso4a?.km_reconstruido) || 0;
  const objetivo = Number(progreso4a?.objetivo_km) || 0;

  return {
    regla_version: REGLA_VERSION,
    user_challenge_id: uc.id,
    challenge_id: uc.challenge_id,
    status: uc.status,
    km_guardado: progreso4a?.km_guardado ?? null,
    km_4a: redondear(km4a),
    km_base: progreso4a?.km_base ?? 0,
    residual_elegible_km: redondear(residualElegible),
    residual_elegible_cierre_hipotetico_km: redondear(residualCierre),
    km_4b_sombra_sin_resolver_cierre: redondear(km4a + residualElegible),
    km_4b_sombra_con_cierre_hipotetico: redondear(km4a + residualCierre),
    objetivo_km: objetivo || null,
    completaria_sin_resolver_cierre: objetivo > 0 ? km4a + residualElegible >= objetivo : false,
    completaria_con_cierre_hipotetico: objetivo > 0 ? km4a + residualCierre >= objetivo : false,
    dias,
  };
};

module.exports = { REGLA_VERSION, evaluarElegibilidadDia, simularHealthParaDesafio };
