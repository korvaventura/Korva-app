// Tests del núcleo de progreso 4A (modo sombra) y de la garantía de solo lectura.
// Ejecutar desde la carpeta backend:  npm test
// Usa el runner incluido en Node (node:test). No toca la base de datos.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calcularProgresoChallenge,
  resolverObjetivo,
  instanteUTC,
  resumirResultados,
  CATEGORIAS,
  REGLA_VERSION,
} = require('../lib/progresoDesafio');
const { clienteSoloLectura, traerTodo, progresoSombraUsuario, reporteSombraActivos } = require('../lib/progresoSombra');

// ---------------------------------------------------------------------------
// Datos de prueba
// ---------------------------------------------------------------------------

const CHALLENGE = {
  id: 'c1',
  title: 'Desafío de prueba',
  modalidades: [{ tipo: 'run', distancia_km: 100 }, { tipo: 'ride', distancia_km: 300 }],
  total_distance_km: 100,
};

const uc = (extra = {}) => ({
  id: 'uc1',
  user_id: 'u1',
  challenge_id: 'c1',
  status: 'active',
  started_at: '2026-09-01T10:00:00',
  pausado: false,
  pausado_at: null,
  periodos_pausados: [],
  modalidad: 'run',
  km_completed: 0,
  ...extra,
});

let n = 0;
const act = (recorded_at, km, extra = {}) => ({ id: `a${++n}`, user_id: 'u1', distance_km: km, recorded_at, excluida: false, ...extra });

const calc = (ucExtra, actividades, challenge = CHALLENGE) =>
  calcularProgresoChallenge({ uc: uc(ucExtra), challenge, actividades, incluirDetalle: true });

// ---------------------------------------------------------------------------
// Referencia: cálculo VIEJO copiado de producción (recalcularKmUsuario en index.js
// y calcularKmDeChallenge en strava.js). La base filtra excluida=false y
// recorded_at >= started_at; después JS descarta los períodos pausados.
// Se corre con el proceso en UTC, como Railway.
// ---------------------------------------------------------------------------

const calculoViejo = (reto, actividadesUsuario) => {
  const todasActividades = actividadesUsuario.filter(
    (a) => a.excluida === false && instanteUTC(a.recorded_at) >= instanteUTC(reto.started_at)
  );
  const actividadesValidas = todasActividades.filter((a) => {
    const fecha = new Date(a.recorded_at);
    for (const p of reto.periodos_pausados || []) {
      if (fecha >= new Date(p.desde) && fecha <= new Date(p.hasta)) return false;
    }
    return true;
  });
  return actividadesValidas.reduce((sum, a) => sum + (parseFloat(a.distance_km) || 0), 0);
};

const conZonaProceso = (tz, fn) => {
  const anterior = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (anterior === undefined) delete process.env.TZ;
    else process.env.TZ = anterior;
  }
};

// ---------------------------------------------------------------------------
// Paridad con el comportamiento viejo
// ---------------------------------------------------------------------------

test('paridad: caso simple sin casos especiales', () => {
  const actividades = [act('2026-09-02T07:00:00', 10), act('2026-09-03T18:30:00', 5.5), act('2026-09-04T06:00:00', 21.1)];
  const r = calc({ km_completed: 36.6 }, actividades);
  const viejo = conZonaProceso('UTC', () => calculoViejo(uc(), actividades));
  assert.equal(r.km_actividades, 36.6);
  assert.equal(r.km_actividades, Math.round(viejo * 1000) / 1000);
  assert.equal(r.categoria_diferencia, CATEGORIAS.COINCIDE);
  assert.equal(r.diferencia_sin_explicar_km, 0);
  assert.equal(r.regla_version, REGLA_VERSION);
});

test('paridad: 500 casos aleatorios con pausas cerradas y excluidas (proceso en UTC)', () => {
  const base = Date.parse('2026-08-01T00:00:00Z');
  const naive = (ms) => new Date(ms).toISOString().slice(0, 19);
  for (let i = 0; i < 500; i++) {
    const inicio = base + Math.floor(Math.random() * 20) * 86400000 + Math.floor(Math.random() * 86400000);
    const periodos = [];
    let cursor = inicio;
    for (let p = 0; p < Math.floor(Math.random() * 3); p++) {
      const desde = cursor + Math.floor(Math.random() * 10 * 86400000);
      const hasta = desde + Math.floor(Math.random() * 5 * 86400000);
      periodos.push({ desde: new Date(desde).toISOString(), hasta: new Date(hasta).toISOString() });
      cursor = hasta;
    }
    const actividades = Array.from({ length: Math.floor(Math.random() * 30) }, () =>
      act(naive(base + Math.floor(Math.random() * 60 * 86400000)), Math.round(Math.random() * 300) / 10, { excluida: Math.random() < 0.15 })
    );
    const reto = uc({ started_at: naive(inicio), periodos_pausados: periodos });
    const nuevo = calcularProgresoChallenge({ uc: reto, challenge: CHALLENGE, actividades });
    const viejo = conZonaProceso('UTC', () => calculoViejo(reto, actividades));
    assert.ok(Math.abs(nuevo.km_actividades - viejo) < 0.001, `caso ${i}: nuevo ${nuevo.km_actividades} viejo ${viejo}`);
  }
});

// ---------------------------------------------------------------------------
// started_at
// ---------------------------------------------------------------------------

test('started_at: la actividad en el mismo instante cuenta; un segundo antes no', () => {
  const r = calc({}, [act('2026-09-01T10:00:00', 4), act('2026-09-01T09:59:59', 6)]);
  assert.equal(r.actividades.cuentan.km, 4);
  assert.equal(r.actividades.anteriores_al_inicio.km, 6);
  assert.ok(r.flags.includes('hay_actividades_anteriores_al_inicio'));
});

test('started_at corrido hacia atrás: la misma actividad pasa a contar', () => {
  const actividades = [act('2026-08-25T08:00:00', 12)];
  assert.equal(calc({}, actividades).km_actividades, 0);
  assert.equal(calc({ started_at: '2026-08-20T00:00:00' }, actividades).km_actividades, 12);
});

// ---------------------------------------------------------------------------
// Pausas
// ---------------------------------------------------------------------------

test('pausas: bordes inclusivos (desde y hasta no cuentan), afuera sí', () => {
  const periodos = [{ desde: '2026-09-05T00:00:00.000Z', hasta: '2026-09-07T00:00:00.000Z' }];
  const actividades = [
    act('2026-09-05T00:00:00', 1), // borde desde → pausa
    act('2026-09-06T12:00:00', 2), // dentro → pausa
    act('2026-09-07T00:00:00', 3), // borde hasta → pausa
    act('2026-09-04T23:59:59', 4), // antes → cuenta
    act('2026-09-07T00:00:01', 5), // después → cuenta
  ];
  const r = calc({ periodos_pausados: periodos }, actividades);
  assert.equal(r.actividades.en_pausa.km, 6);
  assert.equal(r.actividades.cuentan.km, 9);
});

test('pausas: varios períodos', () => {
  const periodos = [
    { desde: '2026-09-05T00:00:00.000Z', hasta: '2026-09-06T00:00:00.000Z' },
    { desde: '2026-09-10T00:00:00.000Z', hasta: '2026-09-12T00:00:00.000Z' },
  ];
  const actividades = [act('2026-09-05T10:00:00', 2), act('2026-09-08T10:00:00', 3), act('2026-09-11T10:00:00', 4)];
  const r = calc({ periodos_pausados: periodos }, actividades);
  assert.equal(r.km_actividades, 3);
  assert.equal(r.actividades.en_pausa.cantidad, 2);
  assert.equal(r.pausas.periodos.length, 2);
});

test('pausa abierta: lo posterior a pausado_at no cuenta', () => {
  const actividades = [act('2026-09-10T09:00:00', 5), act('2026-09-10T11:00:00', 7)];
  const r = calc({ pausado: true, pausado_at: '2026-09-10T10:00:00' }, actividades);
  assert.equal(r.km_actividades, 5);
  assert.equal(r.actividades.en_pausa.de_ellas_en_pausa_abierta, 1);
  assert.ok(r.flags.includes('pausado_ahora'));
});

test('pausado sin pausado_at: no se excluye nada, se marca', () => {
  const r = calc({ pausado: true, pausado_at: null }, [act('2026-09-10T11:00:00', 7)]);
  assert.equal(r.km_actividades, 7);
  assert.ok(r.flags.includes('pausado_sin_pausado_at'));
});

test('pausas con formato inválido: se ignoran y se marcan', () => {
  const r = calc({ periodos_pausados: [{ desde: 'basura', hasta: '2026-09-07T00:00:00Z' }] }, [act('2026-09-06T00:00:00', 2)]);
  assert.equal(r.km_actividades, 2);
  assert.ok(r.flags.includes('pausas_con_formato_invalido'));
});

// ---------------------------------------------------------------------------
// Excluidas
// ---------------------------------------------------------------------------

test('excluidas: no cuentan y se informan; null también se trata como no válida (igual que .eq(false))', () => {
  const r = calc({}, [act('2026-09-02T07:00:00', 10, { excluida: true }), act('2026-09-02T08:00:00', 3, { excluida: null }), act('2026-09-03T07:00:00', 5)]);
  assert.equal(r.km_actividades, 5);
  assert.equal(r.actividades.excluidas_por_usuario.km, 13);
  assert.ok(r.flags.includes('hay_actividades_excluidas'));
});

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

test('estados: active se recalcularía; pending y terminales no', () => {
  const actividades = [act('2026-09-02T07:00:00', 10)];
  assert.equal(calc({ status: 'active' }, actividades).se_recalcularia, true);
  for (const status of ['completed', 'cargado', 'shipped']) {
    const r = calc({ status, km_completed: 100 }, actividades);
    assert.equal(r.se_recalcularia, false);
    assert.equal(r.diferencia_sin_explicar_km, null);
    assert.equal(r.categoria_diferencia, CATEGORIAS.NO_APLICA);
    assert.ok(r.flags.includes('terminal_congelado'));
  }
  const pending = calc({ status: 'pending' }, actividades);
  assert.equal(pending.se_recalcularia, false);
  assert.ok(pending.flags.includes('pending_sin_calculo'));
});

// ---------------------------------------------------------------------------
// Objetivo / modalidad
// ---------------------------------------------------------------------------

test('objetivo: modalidad elegida → primera modalidad → total_distance_km → sin objetivo', () => {
  assert.deepEqual(resolverObjetivo({ modalidad: 'ride' }, CHALLENGE), { objetivo_km: 300, origen: 'modalidad_elegida' });
  assert.deepEqual(resolverObjetivo({ modalidad: 'swim' }, CHALLENGE), { objetivo_km: 100, origen: 'primera_modalidad' });
  assert.deepEqual(resolverObjetivo({ modalidad: 'run' }, { modalidades: [], total_distance_km: 42 }), { objetivo_km: 42, origen: 'total_distance_km' });
  assert.deepEqual(resolverObjetivo({ modalidad: 'run' }, { modalidades: null, total_distance_km: null }), { objetivo_km: null, origen: 'sin_objetivo' });
  const r = calc({}, [act('2026-09-02T07:00:00', 10)], { title: 'x', modalidades: [], total_distance_km: null });
  assert.ok(r.flags.includes('sin_objetivo'));
  assert.equal(r.porcentaje_progreso, null);
});

test('modalidad no filtra deporte: todo suma (comportamiento actual)', () => {
  const r = calc({ modalidad: 'run' }, [act('2026-09-02T07:00:00', 40, { sport_type: 'ride' }), act('2026-09-03T07:00:00', 5, { sport_type: 'swim' })]);
  assert.equal(r.km_actividades, 45);
});

// ---------------------------------------------------------------------------
// Hacia arriba y hacia abajo
// ---------------------------------------------------------------------------

test('arriba y abajo: agregar sube, excluir baja, y la diferencia lo refleja', () => {
  const a1 = act('2026-09-02T07:00:00', 10);
  const a2 = act('2026-09-03T07:00:00', 5);
  assert.equal(calc({ km_completed: 10 }, [a1]).km_actividades, 10);
  const sube = calc({ km_completed: 10 }, [a1, a2]);
  assert.equal(sube.km_actividades, 15);
  assert.ok(sube.flags.includes('el_calculo_nuevo_subiria_km'));
  assert.equal(sube.categoria_diferencia, CATEGORIAS.RECONSTRUIDO_MAYOR);
  const baja = calc({ km_completed: 15 }, [a1, { ...a2, excluida: true }]);
  assert.equal(baja.km_actividades, 10);
  assert.equal(baja.diferencia_km, 5);
  assert.ok(baja.flags.includes('el_calculo_nuevo_bajaria_km'));
});

// ---------------------------------------------------------------------------
// Idempotencia y pureza
// ---------------------------------------------------------------------------

const congelar = (o) => {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(congelar);
    Object.freeze(o);
  }
  return o;
};

test('idempotencia: mismo input → mismo resultado, sin modificar los datos de entrada', () => {
  const entrada = congelar({
    uc: uc({ km_completed: 20, periodos_pausados: [{ desde: '2026-09-05T00:00:00Z', hasta: '2026-09-06T00:00:00Z' }] }),
    challenge: CHALLENGE,
    actividades: [act('2026-09-02T07:00:00', 10), act('2026-09-05T07:00:00', 3), act('2026-09-08T07:00:00', 4, { excluida: true })],
    incluirDetalle: true,
  });
  const r1 = calcularProgresoChallenge(entrada);
  const r2 = calcularProgresoChallenge(entrada);
  assert.deepEqual(r1, r2);
});

// ---------------------------------------------------------------------------
// Fechas sin zona → UTC explícito
// ---------------------------------------------------------------------------

test('timestamps sin zona se interpretan como UTC aunque el proceso corra en otra zona', () => {
  const actividades = [act('2026-09-01T09:30:00', 3), act('2026-09-01T10:30:00', 4)];
  const enUTC = conZonaProceso('UTC', () => calc({}, actividades));
  const enBA = conZonaProceso('America/Argentina/Buenos_Aires', () => calc({}, actividades));
  const enTokio = conZonaProceso('Asia/Tokyo', () => calc({}, actividades));
  assert.equal(enUTC.km_actividades, 4);
  assert.deepEqual(enBA, enUTC);
  assert.deepEqual(enTokio, enUTC);
  assert.equal(instanteUTC('2026-09-01T09:30:00'), Date.parse('2026-09-01T09:30:00Z'));
  assert.equal(instanteUTC('2026-09-01 09:30:00'), Date.parse('2026-09-01T09:30:00Z'));
  assert.equal(instanteUTC('2026-09-01T09:30:00.123456'), Date.parse('2026-09-01T09:30:00.123Z'));
  assert.equal(instanteUTC('2026-09-01T09:30:00+02:00'), Date.parse('2026-09-01T07:30:00Z'));
  assert.equal(instanteUTC(null), null);
  assert.equal(instanteUTC('basura'), null);
});

test('actividad con fecha inválida: no cuenta y se marca', () => {
  const r = calc({}, [act('basura', 9), act('2026-09-02T07:00:00', 1)]);
  assert.equal(r.km_actividades, 1);
  assert.ok(r.flags.includes('actividades_con_fecha_invalida'));
});

// ---------------------------------------------------------------------------
// Clasificación de diferencias (para revisar los 37 casos)
// ---------------------------------------------------------------------------

test('clasificación: migrado sin actividades', () => {
  const r = calc({ km_completed: 80 }, []);
  assert.equal(r.categoria_diferencia, CATEGORIAS.MIGRADO_SIN_ACTIVIDADES);
  assert.equal(r.diferencia_sin_explicar_km, 80);
  assert.equal(r.km_actividades, 0); // la diferencia NO se convierte en base
  assert.equal(r.km_base, 0);
  assert.equal(r.km_progreso_sombra, 0);
});

test('clasificación: actividades anteriores al inicio', () => {
  const r = calc({ km_completed: 30 }, [act('2026-08-20T07:00:00', 20), act('2026-09-02T07:00:00', 10)]);
  assert.equal(r.categoria_diferencia, CATEGORIAS.ANTERIORES_AL_INICIO);
});

test('clasificación: efecto de pausas', () => {
  const r = calc(
    { km_completed: 15, periodos_pausados: [{ desde: '2026-09-05T00:00:00Z', hasta: '2026-09-06T00:00:00Z' }] },
    [act('2026-09-02T07:00:00', 10), act('2026-09-05T07:00:00', 5)]
  );
  assert.equal(r.categoria_diferencia, CATEGORIAS.EFECTO_PAUSAS);
});

test('clasificación: actividad excluida', () => {
  const r = calc({ km_completed: 15 }, [act('2026-09-02T07:00:00', 10), act('2026-09-03T07:00:00', 5, { excluida: true })]);
  assert.equal(r.categoria_diferencia, CATEGORIAS.ACTIVIDAD_EXCLUIDA);
});

test('clasificación: combinación de causas', () => {
  const r = calc({ km_completed: 18 }, [act('2026-08-20T07:00:00', 4), act('2026-09-02T07:00:00', 10), act('2026-09-03T07:00:00', 4, { excluida: true })]);
  assert.equal(r.categoria_diferencia, CATEGORIAS.COMBINACION);
});

test('clasificación: diferencia pequeña / redondeo', () => {
  const r = calc({ km_completed: 10.4 }, [act('2026-09-02T07:00:00', 10)]);
  assert.equal(r.categoria_diferencia, CATEGORIAS.DIFERENCIA_PEQUENA);
});

test('clasificación: sin explicación', () => {
  const r = calc({ km_completed: 50 }, [act('2026-09-02T07:00:00', 10)]);
  assert.equal(r.categoria_diferencia, CATEGORIAS.SIN_EXPLICACION);
  assert.equal(r.diferencia_sin_explicar_km, 40);
});

test('clasificación: coincide dentro de la tolerancia', () => {
  const r = calc({ km_completed: 10.005 }, [act('2026-09-02T07:00:00', 10)]);
  assert.equal(r.categoria_diferencia, CATEGORIAS.COINCIDE);
});

test('resumen por categoría', () => {
  const resultados = [
    calc({ km_completed: 80 }, []),
    calc({ km_completed: 10 }, [act('2026-09-02T07:00:00', 10)]),
    calc({ status: 'shipped', km_completed: 100 }, []),
  ];
  const r = resumirResultados(resultados);
  assert.equal(r.desafios, 3);
  assert.equal(r.activos, 2);
  assert.equal(r.coinciden, 1);
  assert.equal(r.nuevo_bajaria, 1);
  assert.equal(r.diferencia_sin_explicar_total, 80);
  assert.equal(r.por_categoria[CATEGORIAS.MIGRADO_SIN_ACTIVIDADES].desafios, 1);
});

// ---------------------------------------------------------------------------
// Garantía de solo lectura
// ---------------------------------------------------------------------------

// Cliente simulado que registra cada método llamado.
const clienteSimulado = (datos, registro) => {
  const constructor = (tabla) => {
    const filtros = [];
    let rango = [0, Infinity];
    const q = {
      select: (campos) => { registro.push(`${tabla}.select`); return q; },
      eq: (c, v) => { filtros.push((f) => f[c] === v); return q; },
      in: (c, vs) => { filtros.push((f) => vs.includes(f[c])); return q; },
      order: () => q,
      range: (a, b) => { rango = [a, b]; return q; },
      then: (resolver) => {
        const filas = (datos[tabla] || []).filter((f) => filtros.every((fn) => fn(f))).sort((x, y) => String(x.id).localeCompare(String(y.id)));
        return resolver({ data: filas.slice(rango[0], rango[1] + 1), error: null });
      },
    };
    ['insert', 'update', 'upsert', 'delete'].forEach((m) => { q[m] = () => { registro.push(`${tabla}.${m}`); return q; }; });
    return q;
  };
  return { from: (t) => { registro.push(`from:${t}`); return constructor(t); }, rpc: () => registro.push('rpc') };
};

test('solo lectura: el cliente envuelto no expone escrituras ni otras tablas', () => {
  const db = clienteSoloLectura(clienteSimulado({}, []));
  const q = db.from('activities');
  assert.equal(typeof q.select, 'function');
  for (const m of ['insert', 'update', 'upsert', 'delete']) assert.equal(q[m], undefined, m);
  assert.equal(db.rpc, undefined);
  assert.throws(() => db.from('daily_movement'), /no permitida/);
  assert.throws(() => db.from('users'), /no permitida/);
  assert.ok(Object.isFrozen(db));
});

test('solo lectura: el reporte y el usuario individual solo hacen select sobre las 3 tablas', async () => {
  const datos = {
    user_challenges: [
      { ...uc({ id: 'uc1', user_id: 'u1', km_completed: 10 }) },
      { ...uc({ id: 'uc2', user_id: 'u2', km_completed: 50 }) },
      { ...uc({ id: 'uc3', user_id: 'u1', status: 'shipped', km_completed: 100 }) },
    ],
    challenges: [CHALLENGE],
    activities: [act('2026-09-02T07:00:00', 10, { user_id: 'u1' })],
  };
  const registro = [];
  const reporte = await reporteSombraActivos(clienteSimulado(datos, registro));
  const usuario = await progresoSombraUsuario(clienteSimulado(datos, registro), 'u1');
  assert.ok(registro.every((r) => /^from:(user_challenges|challenges|activities)$/.test(r) || /\.select$/.test(r)), registro.join(','));
  assert.equal(reporte.desafios.length, 2); // solo active
  assert.equal(reporte.resumen.por_categoria[CATEGORIAS.MIGRADO_SIN_ACTIVIDADES].desafios, 1);
  assert.equal(usuario.desafios.length, 2); // todos los del usuario
  assert.ok(Array.isArray(usuario.desafios[0].detalle_actividades));
  assert.equal(reporte.desafios[0].detalle_actividades, undefined); // sin detalle en el reporte global
});

test('paginación: trae más de 1000 filas sin perder ninguna', async () => {
  const filas = Array.from({ length: 2345 }, (_, i) => ({ id: String(i).padStart(5, '0'), user_id: 'u1' }));
  const db = clienteSoloLectura(clienteSimulado({ activities: filas }, []));
  const todas = await traerTodo(() => db.from('activities').select('id').eq('user_id', 'u1'));
  assert.equal(todas.length, 2345);
});
// ---------------------------------------------------------------------------
// 4A-2c: km_base como constante histórica
// Invariante: progreso = km_base + actividades válidas. El cálculo solo LEE
// km_base; nunca lo crea, modifica, recalcula ni absorbe diferencias en él.
// Cualquier fila puede tener base (no hay ids fijos): una operación
// administrativa explícita puede cargarla o corregirla en el futuro.
// ---------------------------------------------------------------------------

test('km_base = 0: el progreso es solo actividades (idéntico al cálculo previo)', () => {
  const actividades = [act('2026-09-02T07:00:00', 10), act('2026-09-03T07:00:00', 5)];
  const sinColumna = calc({ km_completed: 15 }, actividades);
  const conCero = calc({ km_completed: 15, km_base: 0, km_base_motivo: null }, actividades);
  assert.equal(conCero.km_base, 0);
  assert.equal(conCero.km_progreso_sombra, 15);
  assert.equal(conCero.categoria_diferencia, CATEGORIAS.COINCIDE);
  assert.equal(sinColumna.km_progreso_sombra, conCero.km_progreso_sombra);
  assert.ok(sinColumna.flags.includes('km_base_no_leido'));
  assert.ok(!conCero.flags.includes('tiene_km_base'));
});

test('base + actividades: progreso = km_base + actividades válidas', () => {
  const r = calc({ km_completed: 73.34, km_base: 63.2, km_base_motivo: 'legado_historico' }, [act('2026-09-02T07:00:00', 10.14)]);
  assert.equal(r.km_base, 63.2);
  assert.equal(r.km_actividades, 10.14);
  assert.equal(r.km_progreso_sombra, 73.34);
  assert.equal(r.diferencia_km, 0);
  assert.equal(r.categoria_diferencia, CATEGORIAS.COINCIDE);
  assert.equal(r.km_base_motivo, 'legado_historico');
  assert.ok(r.flags.includes('tiene_km_base'));
});

test('base sin actividades: el progreso es la base', () => {
  const r = calc({ km_completed: 95.7, km_base: 95.7, km_base_motivo: 'legado_historico' }, []);
  assert.equal(r.km_progreso_sombra, 95.7);
  assert.equal(r.categoria_diferencia, CATEGORIAS.COINCIDE);
  assert.equal(r.porcentaje_progreso, 95.7);
});

test('una actividad nueva siempre suma encima de la base (no la absorbe)', () => {
  const base = { km_completed: 61.29, km_base: 61.29, km_base_motivo: 'legado_historico' };
  const antes = calc(base, []);
  const despues = calc(base, [act('2026-09-20T07:00:00', 8)]);
  assert.equal(despues.km_base, 61.29); // la base no cambió
  assert.ok(Math.abs(despues.km_progreso_sombra - (antes.km_progreso_sombra + 8)) < 0.001);
  // km_completed todavía no subió (lo frena el Math.max viejo): el motor lo muestra como subida pendiente
  assert.ok(despues.flags.includes('el_calculo_nuevo_subiria_km'));
  assert.equal(despues.diferencia_sin_explicar_km, 0);
});

test('actividad excluida no suma, con base', () => {
  const r = calc({ km_completed: 20, km_base: 20, km_base_motivo: 'legado_historico' }, [act('2026-09-02T07:00:00', 9.41, { excluida: true })]);
  assert.equal(r.km_progreso_sombra, 20);
  assert.equal(r.actividades.excluidas_por_usuario.km, 9.41);
});

test('actividad durante una pausa no suma, con base (caso real: 11,9766 + 39,2202)', () => {
  const r = calc(
    {
      km_completed: 62.8795,
      km_base: 11.9766,
      km_base_motivo: 'legado_historico',
      periodos_pausados: [{ desde: '2026-09-16T11:58:28.785', hasta: '2026-09-16T15:13:49.459Z' }],
    },
    [act('2026-09-16T11:59:58', 11.6827), act('2026-09-14T12:15:30', 39.2202)]
  );
  assert.equal(r.actividades.en_pausa.km, 11.683);
  assert.equal(r.km_progreso_sombra, 51.197);
  assert.ok(r.flags.includes('el_calculo_nuevo_bajaria_km'));
});

test('recalcular varias veces da exactamente lo mismo y km_base nunca cambia', () => {
  const entrada = congelar({
    uc: uc({ km_completed: 30, km_base: 14.41, km_base_motivo: 'restitucion_bug_ago2026' }),
    challenge: CHALLENGE,
    actividades: [act('2026-09-02T07:00:00', 10), act('2026-09-05T07:00:00', 3, { excluida: true })],
    incluirDetalle: true,
  });
  const resultados = Array.from({ length: 5 }, () => calcularProgresoChallenge(entrada));
  resultados.forEach((r) => assert.deepEqual(r, resultados[0]));
  assert.equal(entrada.uc.km_base, 14.41); // la entrada congelada no se tocó
  assert.equal(resultados[0].km_base, 14.41);
  assert.equal(resultados[0].km_progreso_sombra, 24.41);
});

test('km_base sale idéntico a la entrada en 500 casos aleatorios (nunca se recalcula ni absorbe)', () => {
  for (let i = 0; i < 500; i++) {
    const kmBase = Math.random() < 0.5 ? 0 : Math.round(Math.random() * 1000000) / 10000;
    const kmCompleted = Math.round(Math.random() * 2000) / 10;
    const actividades = Array.from({ length: Math.floor(Math.random() * 10) }, () =>
      act(`2026-09-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}T12:00:00`, Math.round(Math.random() * 300) / 10, { excluida: Math.random() < 0.2 })
    );
    const r = calc({ km_completed: kmCompleted, km_base: kmBase, km_base_motivo: kmBase > 0 ? 'legado_historico' : null }, actividades);
    assert.equal(r.km_base, kmBase);
    assert.ok(Math.abs(r.km_progreso_sombra - (kmBase + r.km_actividades)) < 0.002);
  }
});

test('la base no depende de ids fijos: cualquier fila puede tenerla (migración administrativa futura)', () => {
  const nueva = calcularProgresoChallenge({
    uc: uc({ id: 'cualquier-id-nuevo', user_id: 'otro', km_completed: 42, km_base: 42, km_base_motivo: 'legado_historico' }),
    challenge: CHALLENGE,
    actividades: [],
  });
  assert.equal(nueva.km_progreso_sombra, 42);
  assert.equal(nueva.categoria_diferencia, CATEGORIAS.COINCIDE);
});

test('km_base inválido (no debería pasar por el CHECK): no se suma y se marca', () => {
  const negativo = calc({ km_completed: 10, km_base: -5 }, [act('2026-09-02T07:00:00', 10)]);
  assert.equal(negativo.km_base, 0);
  assert.ok(negativo.flags.includes('km_base_invalido'));
  const texto = calc({ km_completed: 10, km_base: 'abc' }, [act('2026-09-02T07:00:00', 10)]);
  assert.equal(texto.km_base, 0);
  assert.ok(texto.flags.includes('km_base_invalido'));
});

test('estados terminales con base: se informan, no se recalculan', () => {
  for (const status of ['completed', 'cargado', 'shipped']) {
    const r = calc({ status, km_completed: 120, km_base: 80, km_base_motivo: 'legado_historico' }, [act('2026-09-02T07:00:00', 10)]);
    assert.equal(r.se_recalcularia, false);
    assert.equal(r.categoria_diferencia, CATEGORIAS.NO_APLICA);
    assert.equal(r.diferencia_sin_explicar_km, null);
    assert.equal(r.km_base, 80);
    assert.ok(r.flags.includes('terminal_congelado'));
  }
  const pending = calc({ status: 'pending', km_completed: 0, km_base: 0 }, [act('2026-09-02T07:00:00', 10)]);
  assert.equal(pending.se_recalcularia, false);
});

test('la base alcanza el objetivo junto con las actividades', () => {
  const r = calc({ km_completed: 99.41, km_base: 99.41, km_base_motivo: 'legado_historico' }, [act('2026-09-02T07:00:00', 4)]);
  assert.equal(r.km_progreso_sombra, 103.41);
  assert.ok(r.flags.includes('progreso_alcanza_objetivo'));
  assert.equal(r.porcentaje_progreso, 100);
});

test('resumen con base: cuenta desafíos con base y total', () => {
  const resultados = [
    calc({ km_completed: 73.34, km_base: 63.2, km_base_motivo: 'legado_historico' }, [act('2026-09-02T07:00:00', 10.14)]),
    calc({ km_completed: 10 }, [act('2026-09-02T07:00:00', 10)]),
    calc({ status: 'shipped', km_completed: 100, km_base: 50, km_base_motivo: 'legado_historico' }, []),
  ];
  const r = resumirResultados(resultados);
  assert.equal(r.activos, 2);
  assert.equal(r.coinciden, 2);
  assert.equal(r.desafios_activos_con_km_base, 1);
  assert.equal(r.km_base_total_activos, 63.2);
  assert.equal(r.diferencia_sin_explicar_total, 0);
});

test('solo lectura: la capa de datos pide km_base y km_base_motivo y no escribe', async () => {
  const campos = [];
  const cliente = {
    from: (t) => {
      const q = {
        select: (c) => { campos.push(`${t}:${c}`); return q; },
        eq: () => q, in: () => q, order: () => q, range: () => q,
        then: (res) => res({ data: t === 'user_challenges' ? [uc({ km_completed: 5, km_base: 5, km_base_motivo: 'legado_historico' })] : t === 'challenges' ? [CHALLENGE] : [], error: null }),
      };
      ['insert', 'update', 'upsert', 'delete'].forEach((m) => { q[m] = () => { throw new Error(`escritura ${m}`); }; });
      return q;
    },
  };
  const rep = await reporteSombraActivos(cliente);
  assert.ok(campos.some((c) => c.startsWith('user_challenges:') && c.includes('km_base') && c.includes('km_base_motivo')));
  assert.equal(rep.desafios[0].km_progreso_sombra, 5);
  assert.equal(rep.resumen.coinciden, 1);
});