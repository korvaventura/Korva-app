const { recalcularConReintentos, logMotor } = require('./recuperacionRecalculo');
const { tomarMarca, generarMarcaUnica } = require('./marcaRecalculo');
const { candadoPorUsuario } = require('./candadoUsuario');

const logGps = (datos) => logMotor({ writer: 'korva_gps', ...datos });

const registrarActividadGpsConMotor = async ({
  repo,
  userId,
  sessionId,
  sportType,
  distanceKm,
  durationSeconds,
  recordedAt,
  ahoraMs = Date.now(),
  generarMarca = generarMarcaUnica,
  candado = candadoPorUsuario,
  dispararEfectos = () => {},
  log = logGps,
  esperasMs,
  esperar,
}) => candado(String(userId), async () => {
  const externalId = `korva_gps_${sessionId}`;

  const existente = await repo.buscarActividadPorExternalId({ userId, externalId });
  if (existente) {
    return {
      status: 200,
      body: { mensaje: 'Actividad ya registrada', actividad: existente, idempotente: true },
      eventos: [],
    };
  }

  const equivalente = await repo.buscarActividadEquivalenteGps({
    userId, sportType, distanceKm, recordedAt,
  });
  if (equivalente) {
    return {
      status: 200,
      body: {
        mensaje: 'Actividad equivalente ya registrada',
        actividad: equivalente,
        idempotente: true,
        duplicado_equivalente: true,
      },
      eventos: [],
    };
  }

  const activos = await repo.leerMarcasDesafiosActivos({ userId });
  const marcas = [];
  for (const uc of activos) {
    const marca = await tomarMarca({
      repo,
      id: uc.id,
      marcaLeida: uc.recalculo_pendiente_desde ?? null,
      ahoraMs,
      generarMarca,
    });
    if (marca) marcas.push(marca);
  }
  const propias = marcas.filter((m) => m.propia);

  let actividad;
  try {
    actividad = await repo.insertarActividadGps({
      actividad: {
        user_id: userId,
        challenge_id: null,
        source: 'korva_gps',
        external_id: externalId,
        sport_type: sportType,
        distance_km: distanceKm,
        duration_seconds: durationSeconds,
        recorded_at: recordedAt,
      },
    });
  } catch (e) {
    // Si hubo una carrera entre dos confirmaciones, la restricción de external_id deja una sola fila.
    const duplicada = await repo.buscarActividadPorExternalId({ userId, externalId });
    if (duplicada) {
      return {
        status: 200,
        body: { mensaje: 'Actividad ya registrada', actividad: duplicada, idempotente: true },
        eventos: [],
      };
    }
    throw e;
  }

  const r = await recalcularConReintentos({
    repo,
    userId,
    challengeId: null,
    marcasALimpiar: propias.map((m) => ({ id: m.id, marca: m.marca })),
    motivo: 'korva_gps',
    ahoraMs,
    esperasMs,
    esperar,
  });

  if (!r.ok) {
    log({ resultado: 'registrada_recalculo_pendiente', actividad_id: actividad.id });
    return {
      status: 200,
      body: {
        mensaje: 'Actividad registrada',
        actividad,
        idempotente: false,
        progreso: { motor: true, recalculo: 'pendiente', recuperacion: 'automatica' },
      },
      eventos: [],
    };
  }

  const eventos = r.informe.eventos_para_procesar || [];
  if (eventos.length) dispararEfectos(eventos);

  return {
    status: 200,
    body: {
      mensaje: 'Actividad registrada',
      actividad,
      idempotente: false,
      progreso: {
        motor: true,
        recalculo: 'ok',
        desafios: r.informe.desafios.map((d) => ({
          user_challenge_id: d.user_challenge_id,
          accion: d.accion,
          km_antes: d.km_leido,
          km_despues: d.km_nuevo,
        })),
        completados: r.informe.completados,
      },
    },
    eventos,
  };
});

module.exports = { registrarActividadGpsConMotor };
