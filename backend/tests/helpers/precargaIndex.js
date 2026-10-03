// Precarga para levantar backend/index.js REAL en un proceso hijo durante los tests,
// pero con Supabase y Resend reemplazados por dobles en memoria (sin red ni base real).
//   PRUEBA_DB_JSON   ruta a un JSON con las tablas iniciales
//   PRUEBA_SALIDA    ruta donde se vuelca el estado final + el registro de operaciones
//
// Cómo se pide el volcado: por el canal IPC de Node (el test hace hijo.send({ tipo: 'volcar' })).
// NO se usan señales: en Windows hijo.kill('SIGTERM') no entrega ninguna señal, termina el
// proceso de golpe (como SIGKILL) y ningún handler llega a correr. IPC funciona igual en
// Windows, Linux y macOS.
const Module = require('module');
const fs = require('fs');
const path = require('path');
const { crearSupabaseMemoria } = require('./supabaseMemoria');

const tablas = JSON.parse(fs.readFileSync(process.env.PRUEBA_DB_JSON, 'utf8'));

// Efectos externos del código viejo (emails por Resend, push por Expo): se registran, no salen.
const efectos = { emails: [], push: [], certificados: [] };

// PRUEBA_MOTOR_GANA_ANTES_DE=<user_challenge_id>: justo antes de que un writer viejo ejecute el
// UPDATE que completa ese desafío, el motor lo completa por la RPC (la carrera de convivencia).
const idCarrera = process.env.PRUEBA_MOTOR_GANA_ANTES_DE || null;
let carreraHecha = false;
let memoria;
// PRUEBA_FALLAR_TABLA=<tabla>: toda escritura en esa tabla falla (p. ej. la bandeja del webhook).
const tablaQueFalla = process.env.PRUEBA_FALLAR_TABLA || null;
const interceptar = (op) => {
  if (tablaQueFalla && op.tabla === tablaQueFalla && op.tipo !== 'select') return true;
  if (!idCarrera || carreraHecha || op.tabla !== 'user_challenges' || op.tipo !== 'update') return false;
  if (!op.valores || op.valores.status !== 'completed') return false;
  if (!op.filtros.some(([t, c, v]) => t === 'eq' && c === 'id' && v === idCarrera)) return false;
  carreraHecha = true;
  const fila = memoria.db.user_challenges.find((u) => u.id === idCarrera);
  memoria.cliente.rpc('completar_desafio_motor', {
    p_id: idCarrera, p_km_leido: fila.km_completed ?? null, p_km_nuevo: op.valores.km_completed,
    p_completed_at: new Date().toISOString(), p_datos: { motivo: 'carrera_de_prueba' },
  });
  return false; // el UPDATE viejo sigue y se ejecuta DESPUÉS de la completitud del motor
};
memoria = crearSupabaseMemoria(tablas, { fallar: interceptar });

const fetchOriginal = global.fetch;
global.fetch = async (url, init) => {
  // PRUEBA_STRAVA_JSON=<ruta>: la API de Strava devuelve esa lista de actividades (sin red).
  if (process.env.PRUEBA_STRAVA_JSON && String(url).startsWith('https://www.strava.com/api/v3/athlete/activities')) {
    const lista = JSON.parse(fs.readFileSync(process.env.PRUEBA_STRAVA_JSON, 'utf8'));
    return { ok: true, status: 200, json: async () => lista };
  }
  // Misma lista para GET /api/v3/activities/:id (webhook). Si no está: 404 como Strava.
  const individual = String(url).match(/^https:\/\/www\.strava\.com\/api\/v3\/activities\/([^/?]+)$/);
  // PRUEBA_STRAVA_COLGADO=1: Strava nunca responde la actividad (el proceso queda "a mitad de camino").
  if (process.env.PRUEBA_STRAVA_COLGADO === '1' && individual) return new Promise(() => {});
  if (process.env.PRUEBA_STRAVA_JSON && individual) {
    const lista = JSON.parse(fs.readFileSync(process.env.PRUEBA_STRAVA_JSON, 'utf8'));
    const a = lista.find((x) => String(x.id) === individual[1]);
    if (a) return { ok: true, status: 200, json: async () => a };
    return { ok: false, status: 404, json: async () => ({ message: 'Record Not Found', errors: [{ resource: 'Activity', field: 'id', code: 'invalid' }] }) };
  }
  if (String(url).startsWith('https://exp.host/')) {
    efectos.push.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ data: { status: 'ok' } }) };
  }
  return fetchOriginal(url, init);
};

const original = Module._load;
Module._load = function cargar(pedido, padre, esPrincipal) {
  if (pedido === '@supabase/supabase-js') {
    return { createClient: () => memoria.cliente };
  }
  // PRUEBA_PDF_FALSO=1: el certificado se "genera" sin Python ni Storage (PDF de prueba).
  if (process.env.PRUEBA_PDF_FALSO === '1' && /generador_bib$/.test(pedido)) {
    const real = original.apply(this, [pedido, padre, esPrincipal]);
    return {
      ...real,
      generarCertificado: async (_s, nombre, desafio, km, bib, fecha, serial) => {
        efectos.certificados.push({ nombre, desafio, km, serial }); // la distancia impresa (D-V1)
        return Buffer.from(`PDF ${serial} ${nombre} ${desafio} ${km}`).toString('base64');
      },
      generarBibYPostal: async () => null, // sin plantillas ni Storage: el código manda el email sin adjuntos
      asignarBibNumber: async () => '0001',
    };
  }
  if (pedido === 'resend') {
    return { Resend: class { constructor() { this.emails = { send: async (payload) => { efectos.emails.push({ para: payload.to, asunto: payload.subject, adjuntos: (payload.attachments || []).length }); return { data: { id: `simulado-${efectos.emails.length}` }, error: null }; } }; } } };
  }
  return original.apply(this, [pedido, padre, esPrincipal]);
};

// Escribe salida.json. Si algo falla, lo deja en stderr y sale con código 3 para que el test
// pueda mostrar la causa exacta en vez de un ENOENT.
// { caida: true }: vuelca YA lo que quedó en la base (como si el proceso muriera en este instante).
const volcar = async ({ caida = false } = {}) => {
  if (!caida) await esperarWebhooks();
  try {
    fs.writeFileSync(process.env.PRUEBA_SALIDA, JSON.stringify({ db: memoria.db, registro: memoria.registro, efectos }));
  } catch (e) {
    process.stderr.write(`[precarga] no se pudo escribir ${process.env.PRUEBA_SALIDA}: ${e && e.stack}\n`);
    process.exit(3);
  }
  process.exit(0);
};

const esperarWebhooks = async () => {
  // Webhooks de Strava respondidos con 200 que todavía se están procesando: se esperan, y después
  // un momento para los efectos que dispararon (sin esperar) antes de volcar.
  try {
    const strava = require(path.join(__dirname, '..', '..', 'routes', 'strava.js'));
    if (typeof strava.esperarWebhooksEnCurso === 'function') {
      const recibidos = await strava.esperarWebhooksEnCurso();
      if (recibidos > 0) await new Promise((r) => setTimeout(r, 300));
    }
  } catch (e) {
    process.stderr.write(`[precarga] no se pudo esperar los webhooks: ${e && e.stack}\n`);
  }
};

if (typeof process.send === 'function') {
  process.on('message', (m) => { if (m && m.tipo === 'volcar') volcar({ caida: m.caida === true }); });
  // Si el proceso del test muere, el canal se cierra: el hijo termina y no queda huérfano.
  process.on('disconnect', () => process.exit(4));
} else {
  process.stderr.write('[precarga] sin canal IPC: hay que lanzar este proceso con stdio "ipc"\n');
}

// No se agregan handlers de uncaughtException/unhandledRejection: el comportamiento por defecto
// de Node (stack en stderr y salida con código != 0) ya queda capturado por el test y no se
// altera cómo se comporta index.js.

module.exports = { raiz: path.resolve(__dirname, '..', '..') };