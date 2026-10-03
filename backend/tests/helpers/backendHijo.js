// Levanta backend/index.js REAL en un proceso hijo para tests de integración, con Supabase y
// Resend reemplazados por dobles en memoria (ver precargaIndex.js). Sin red ni base real.
//
// Portable (Windows / Linux / macOS):
//  - se lanza process.execPath con argumentos en un array, sin shell y con rutas absolutas;
//  - el volcado de la base se pide por IPC (hijo.send), NO con señales: en Windows
//    hijo.kill('SIGTERM') termina el proceso de golpe sin correr ningún handler;
//  - se espera 'close' (no 'exit') para tener stdout/stderr completos.
// Si salida.json no aparece, el error muestra exit code, signal, stdout, stderr, el comando
// y cualquier error previo (spawn, IPC, timeout).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ_BACKEND = path.resolve(__dirname, '..', '..');
const PRECARGA = path.join(__dirname, 'precargaIndex.js');
const INDEX = path.join(RAIZ_BACKEND, 'index.js');
const ESPERA_ARRANQUE_MS = 15000;
const ESPERA_CIERRE_MS = 10000;
const ESPERA_PEDIDO_MS = 30000;

/**
 * @param {object} opciones
 * @param {string} opciones.flag      valor de MOTOR_PROGRESO_WRITERS
 * @param {object} opciones.tablas    tablas iniciales de la base en memoria
 * @param {object} [opciones.entorno] variables de entorno extra para el proceso hijo
 * @returns {Promise<{ pedir, cerrar, forzarCierre }>}
 */
const levantarBackend = async ({ flag, tablas, entorno = {} }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'korva-backend-'));
  const dbJson = path.join(dir, 'db.json');
  const salida = path.join(dir, 'salida.json');
  fs.writeFileSync(dbJson, JSON.stringify(tablas));
  const puerto = 40000 + Math.floor(Math.random() * 20000);
  const args = ['-r', PRECARGA, INDEX];

  const estado = { stdout: '', stderr: '', errores: [], exitCode: undefined, signal: undefined, cerrado: false };
  const hijo = spawn(process.execPath, args, {
    cwd: RAIZ_BACKEND,
    env: { ...process.env, PORT: String(puerto), TZ: 'UTC', MOTOR_PROGRESO_WRITERS: flag, PRUEBA_DB_JSON: dbJson, PRUEBA_SALIDA: salida, SUPABASE_URL: 'http://memoria', SUPABASE_SECRET: 'x', ...entorno },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    shell: false,
    windowsHide: true,
  });
  hijo.stdout.setEncoding('utf8');
  hijo.stderr.setEncoding('utf8');
  hijo.stdout.on('data', (d) => { estado.stdout += d; });
  hijo.stderr.on('data', (d) => { estado.stderr += d; });
  hijo.on('error', (e) => { estado.errores.push(`spawn/ipc: ${e && e.stack}`); });
  const cerradoPromesa = new Promise((r) => hijo.on('close', (code, signal) => {
    estado.exitCode = code; estado.signal = signal; estado.cerrado = true; r();
  }));

  const diagnostico = (titulo) => [
    titulo,
    `  comando:   ${JSON.stringify(process.execPath)} ${args.map((a) => JSON.stringify(a)).join(' ')}`,
    `  cwd:       ${RAIZ_BACKEND}`,
    `  salida:    ${salida} (existe: ${fs.existsSync(salida)})`,
    `  exit code: ${estado.exitCode}`,
    `  signal:    ${estado.signal}`,
    `  errores previos: ${estado.errores.length ? estado.errores.join('\n    ') : '(ninguno)'}`,
    '  ---- stdout completo ----',
    estado.stdout || '(vacío)',
    '  ---- stderr completo ----',
    estado.stderr || '(vacío)',
  ].join('\n');

  const forzarCierre = async () => {
    if (!estado.cerrado) { hijo.kill('SIGKILL'); await cerradoPromesa; }
  };

  const limite = Date.now() + ESPERA_ARRANQUE_MS;
  while (!estado.stdout.includes('Servidor Korva corriendo') && !estado.cerrado && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!estado.stdout.includes('Servidor Korva corriendo')) {
    if (!estado.cerrado) estado.errores.push(`timeout de arranque (${ESPERA_ARRANQUE_MS} ms)`);
    await forzarCierre();
    throw new Error(diagnostico('El backend de prueba no arrancó'));
  }

  /** Pedido HTTP al backend hijo, igual que la app (JSON en el body). */
  // `crudo`: body tal cual (p. ej. webhook firmado); `headers`: extra. Respuestas no JSON → body = texto.
  const pedir = async ({ metodo, ruta, body, headers = {}, crudo }) => {
    try {
      const res = await fetch(`http://127.0.0.1:${puerto}${ruta}`, {
        method: metodo, headers: { 'Content-Type': 'application/json', ...headers }, body: crudo !== undefined ? crudo : JSON.stringify(body),
        // Un pedido que no responde termina en error con el diagnóstico del hijo, no en un cuelgue mudo.
        signal: AbortSignal.timeout(ESPERA_PEDIDO_MS),
      });
      const texto = await res.text();
      let cuerpo;
      try { cuerpo = JSON.parse(texto); } catch (e) { cuerpo = texto; }
      return { status: res.status, body: cuerpo };
    } catch (e) {
      await forzarCierre();
      throw new Error(`${diagnostico(`Falló el pedido ${metodo} ${ruta}`)}\n  error: ${e && e.stack}`);
    }
  };

  const cerrar = async () => {
    if (!estado.cerrado) {
      try {
        hijo.send({ tipo: 'volcar' }, (e) => { if (e) estado.errores.push(`ipc send: ${e && e.stack}`); });
      } catch (e) {
        estado.errores.push(`ipc send: ${e && e.stack}`);
      }
      let temporizador;
      const timeout = new Promise((r) => { temporizador = setTimeout(() => r('timeout'), ESPERA_CIERRE_MS); });
      const r = await Promise.race([cerradoPromesa, timeout]);
      clearTimeout(temporizador);
      if (r === 'timeout') {
        estado.errores.push(`el hijo no terminó ${ESPERA_CIERRE_MS} ms después de pedir el volcado`);
        await forzarCierre();
      }
    }
    if (!fs.existsSync(salida)) throw new Error(diagnostico('El proceso hijo terminó sin generar salida.json'));
    let volcado;
    try {
      volcado = JSON.parse(fs.readFileSync(salida, 'utf8'));
    } catch (e) {
      estado.errores.push(`leer/parsear salida.json: ${e && e.stack}`);
      throw new Error(diagnostico('salida.json existe pero no se pudo leer'));
    }
    fs.rmSync(dir, { recursive: true, force: true });
    return { ...volcado, logs: estado.stdout + estado.stderr, exitCode: estado.exitCode, signal: estado.signal };
  };

  return { pedir, cerrar, forzarCierre };
};

module.exports = { levantarBackend };