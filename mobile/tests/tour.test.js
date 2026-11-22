const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../services/tour/tourCore');

const leer = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const pantalla = { width: 390, height: 844 };

test('los pasos cubren lo importante de Korva y terminan con un cierre', () => {
  const ids = T.PASOS.map((p) => p.id);
  assert.deepEqual(ids, ['desafio', 'mundi', 'comoSumas', 'conectar', 'registrar-gps', 'gps-mapa', 'registrar-manual', 'actividades', 'direccion', 'tab-Catalogo', 'fin']);
  assert.equal(T.PASOS.find((p) => p.id === 'gps-mapa').stack, 'GpsTracker');
  assert.equal(T.PASOS.find((p) => p.id === 'registrar-manual').objetivo, 'registrar');
  assert.equal(T.PASOS.find((p) => p.id === 'mundi').stack, 'KorvaMundi');
  const dir = T.PASOS.find((p) => p.id === 'direccion');
  assert.match(dir.texto, /le llegan a nuestro equipo/);
  assert.match(dir.texto, /No son públicos: los demás participantes no los ven/);
  assert.match(T.PASOS.find((p) => p.id === 'actividades').texto, /se cargó dos veces, borrala/);
});

test('el velo deja un hueco alrededor del elemento y nada más', () => {
  const huecos = T.huecoOverlay({ x: 20, y: 300, width: 350, height: 100 }, pantalla, 8);
  assert.equal(huecos.length, 4);
  const area = huecos.reduce((s, h) => s + h.w * h.h, 0);
  assert.equal(area, pantalla.width * pantalla.height - (366 * 116));
  assert.deepEqual(T.huecoOverlay(null, pantalla), [{ x: 0, y: 0, w: 390, h: 844 }]);
});

test('el globito va abajo si entra, si no arriba', () => {
  assert.equal(T.posicionGlobo({ x: 0, y: 100, width: 10, height: 50 }, pantalla).top, 164);
  assert.ok(T.posicionGlobo({ x: 0, y: 700, width: 10, height: 80 }, pantalla).top < 700);
});

test('botones de la barra, desplazamiento y cuándo arrancar', () => {
  assert.deepEqual(T.rectTab(1, 6, pantalla, 34), { x: 65, y: 761, width: 65, height: 49 });
  assert.equal(T.desplazamientoNecesario({ x: 0, y: 300, width: 10, height: 100 }, pantalla), 0);
  assert.ok(T.desplazamientoNecesario({ x: 0, y: 1500, width: 10, height: 100 }, pantalla) > 1000);
  const ahora = Date.UTC(2026, 10, 21);
  assert.equal(T.modoInicioTour({ creadoEn: new Date(ahora - 86400000).toISOString(), ahora }), 'auto');
  assert.equal(T.modoInicioTour({ creadoEn: '2026-01-01', ahora }), 'ofrecer');
  assert.equal(T.modoInicioTour({ creadoEn: '2026-01-01', ofrecido: true, ahora }), null);
  assert.equal(T.modoInicioTour({ creadoEn: new Date(ahora).toISOString(), visto: true, ahora }), null);
});

test('el recorrido se dibuja encima de la app, no cambia estado al dibujar y está conectado', () => {
  const tour = leer('components/tour/Tour.js');
  assert.match(tour, /class SeguroTour extends Component/);
  assert.match(tour, /useEffect\(\(\) => \{ if \(!actual\) terminar\(\); \}/);
  const app = leer('App.js');
  assert.match(app, /<TourProvider navigationRef=\{navigationRef\}>/);
  assert.match(app, /<NavigationContainer ref=\{navigationRef\}>/);
  const home = leer('screens/HomeScreen.js');
  for (const id of ['desafio', 'comoSumas']) assert.match(home, new RegExp(`useTourTarget\\('${id}'\\)`));
  assert.match(leer('screens/RegistroManualScreen.js'), /useTourTarget\('registrar'\)/);
  assert.match(leer('screens/KorvaMundiScreen.js'), /useTourTarget\('mundi'\)/);
  assert.match(tour, /navigationRef\.navigate\?\.\(actual\.stack\)/);
  assert.match(home, /onRecorrido=/);
  const perfil = leer('screens/PerfilScreen.js');
  assert.match(perfil, /useTourTarget\('actividades'\)/);
  assert.match(perfil, /useTourTarget\('direccion'\)/);
  assert.match(perfil, /useTourTarget\('strava'\)/);
  for (const p of T.PASOS) for (const d of [{}, { garmin: true }]) assert.doesNotMatch(T.textoPaso(p, d).texto, /alcanza|la mejor forma|recomendad/);
  assert.match(T.PASOS.find((p) => p.id === 'gps-mapa').texto, /Lo propio de Korva GPS/);
  assert.match(T.PASOS.find((p) => p.id === 'comoSumas').texto, /las tres suman igual/);
  assert.match(leer('components/KorvaHelpSheet.js'), /Ver recorrido guiado/);
});

test('se puede volver atrás y cada pantalla se prepara para su paso', () => {
  const tour = leer('components/tour/Tour.js');
  assert.match(tour, />Atrás</);
  assert.match(tour, /direccion\.current = -1; setPaso\(paso - 1\)/);
  const registrar = leer('screens/RegistroManualScreen.js');
  assert.match(registrar, /useTourAccion\('registrar-manual', \(\) => setModoRegistro\('manual'\)\)/);
  assert.match(registrar, /useTourAccion\('registrar-gps', \(\) => setModoRegistro\('gps'\)\)/);
  const gps = leer('screens/GpsTrackerScreen.js');
  assert.match(gps, /useTourAccion\('gps-mapa', \(\) => irAPagina\(1\)\)/);
  assert.match(gps, /useTourTarget\('gps-mapa'\)/);
});

test('Forma 1 es conectar: nombra Garmin solo si a la persona le aparece', () => {
  const p = T.PASOS.find((x) => x.id === 'conectar');
  assert.equal(p.objetivo, 'strava');
  const sin = T.textoPaso(p, {});
  assert.equal(sin.titulo, 'Forma 1 · Conectá Strava');
  assert.doesNotMatch(sin.texto, /Garmin/);
  assert.match(sin.texto, /No es obligatorio/);
  const con = T.textoPaso(p, { garmin: true });
  assert.equal(con.titulo, 'Forma 1 · Conectá Strava o Garmin');
  assert.match(con.texto, /conectá una/);
  assert.equal(T.textoPaso(T.PASOS[0]).titulo, 'Tu desafío');
  assert.match(T.PASOS.find((x) => x.id === 'registrar-gps').titulo, /^Forma 2/);
  assert.match(T.PASOS.find((x) => x.id === 'registrar-manual').titulo, /^Forma 3/);
});

test('el recuadro se redibuja solo si el elemento se movió', () => {
  const a = { x: 10, y: 100, width: 300, height: 80 };
  assert.equal(T.rectCambio(a, { ...a, y: 101 }), false);
  assert.equal(T.rectCambio(a, { ...a, y: 140 }), true);
  assert.equal(T.rectCambio(null, a), true);
  assert.equal(T.rectCambio(null, null), false);
});

test('tour: desplaza para dejar el elemento arriba y el globo nunca queda fuera', () => {
  const pantalla = { width: 390, height: 844 };
  assert.equal(T.desplazamientoNecesario({ x: 0, y: 1500, width: 10, height: 100 }, pantalla, { arriba: 120 }), 1380);
  assert.equal(T.desplazamientoNecesario({ x: 0, y: 30, width: 10, height: 100 }, pantalla, { arriba: 120 }), -90);
  const alto = T.posicionGlobo({ x: 0, y: 100, width: 300, height: 700 }, pantalla);
  assert.ok(alto.top >= 50 && alto.top + 170 <= pantalla.height);
});
