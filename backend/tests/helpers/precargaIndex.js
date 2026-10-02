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
const memoria = crearSupabaseMemoria(tablas);

const original = Module._load;
Module._load = function cargar(pedido, padre, esPrincipal) {
  if (pedido === '@supabase/supabase-js') {
    return { createClient: () => memoria.cliente };
  }
  if (pedido === 'resend') {
    return { Resend: class { constructor() { this.emails = { send: async () => ({ id: 'simulado' }) }; } } };
  }
  return original.apply(this, [pedido, padre, esPrincipal]);
};

// Escribe salida.json. Si algo falla, lo deja en stderr y sale con código 3 para que el test
// pueda mostrar la causa exacta en vez de un ENOENT.
const volcar = () => {
  try {
    fs.writeFileSync(process.env.PRUEBA_SALIDA, JSON.stringify({ db: memoria.db, registro: memoria.registro }));
  } catch (e) {
    process.stderr.write(`[precarga] no se pudo escribir ${process.env.PRUEBA_SALIDA}: ${e && e.stack}\n`);
    process.exit(3);
  }
  process.exit(0);
};

if (typeof process.send === 'function') {
  process.on('message', (m) => { if (m && m.tipo === 'volcar') volcar(); });
  // Si el proceso del test muere, el canal se cierra: el hijo termina y no queda huérfano.
  process.on('disconnect', () => process.exit(4));
} else {
  process.stderr.write('[precarga] sin canal IPC: hay que lanzar este proceso con stdio "ipc"\n');
}

// No se agregan handlers de uncaughtException/unhandledRejection: el comportamiento por defecto
// de Node (stack en stderr y salida con código != 0) ya queda capturado por el test y no se
// altera cómo se comporta index.js.

module.exports = { raiz: path.resolve(__dirname, '..', '..') };