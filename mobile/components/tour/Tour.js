import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { colors } from '../../theme/korvaTheme';
import { PASOS, desplazamientoNecesario, posicionGlobo, rectTab, rectCambio, textoPaso } from '../../services/tour/tourCore';

// Recorrido guiado: oscurece la pantalla, resalta un elemento y explica qué hace.
// Se dibuja ENCIMA de la app (no reemplaza ninguna pantalla) y, si algo falla,
// se cierra solo y la app sigue normal.
const TourContext = createContext(null);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// Valor animado que nunca baja de cero (para anchos y altos del velo).
const pos = (v) => v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp' });

export function TourProvider({ navigationRef, children }) {
  const objetivos = useRef(new Map()); // id → nodo nativo
  const acciones = useRef(new Map()); // id → función que prepara la pantalla (p. ej. elegir Manual)
  const direccion = useRef(1); // +1 avanzando, −1 volviendo (para saltear pasos sin elemento)
  const desplazables = useRef(new Map()); // pantalla → { ref, offset }
  const datos = useRef({}); // lo que tiene la persona (p. ej. { garmin: true }) para elegir textos
  const [activo, setActivo] = useState(false);
  const [paso, setPaso] = useState(0);
  const [rect, setRect] = useState(null);
  const [listo, setListo] = useState(false);
  const turno = useRef(0);

  const registrar = useCallback((id, nodo) => {
    if (nodo) objetivos.current.set(id, nodo); else objetivos.current.delete(id);
  }, []);
  const registrarAccion = useCallback((id, fn) => {
    if (fn) acciones.current.set(id, fn); else acciones.current.delete(id);
  }, []);
  const registrarScroll = useCallback((pantalla, info) => {
    if (info) desplazables.current.set(pantalla, info); else desplazables.current.delete(pantalla);
  }, []);
  const registrarDato = useCallback((clave, valor) => { datos.current = { ...datos.current, [clave]: valor }; }, []);

  const terminar = useCallback(() => { turno.current += 1; setActivo(false); setRect(null); setListo(false); }, []);
  const iniciar = useCallback(() => { turno.current += 1; direccion.current = 1; setPaso(0); setRect(null); setListo(false); setActivo(true); }, []);

  const valor = useMemo(() => ({ registrar, registrarAccion, registrarScroll, registrarDato, iniciar, terminar, activo }), [registrar, registrarAccion, registrarScroll, registrarDato, iniciar, terminar, activo]);

  return (
    <TourContext.Provider value={valor}>
      {children}
      {activo && (
        <SeguroTour onError={terminar}>
          <Overlay
            paso={paso} setPaso={setPaso} rect={rect} setRect={setRect} listo={listo} setListo={setListo}
            objetivos={objetivos} acciones={acciones} direccion={direccion} desplazables={desplazables} datos={datos} navigationRef={navigationRef} turno={turno} terminar={terminar}
          />
        </SeguroTour>
      )}
    </TourContext.Provider>
  );
}

// Si el overlay falla al dibujarse, se cierra el recorrido en vez de romper la app.
class SeguroTour extends Component {
  constructor(props) { super(props); this.state = { error: false }; }
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch() { this.props.onError?.(); }
  render() { return this.state.error ? null : this.props.children; }
}

function rutasDeTabs(navigationRef) {
  try {
    const raiz = navigationRef.getRootState?.();
    const tabs = raiz?.routes?.find((r) => r.name === 'HomeTabs');
    return tabs?.state?.routes?.map((r) => r.name) || null;
  } catch { return null; }
}

function medir(nodo) {
  return new Promise((resolve) => {
    if (!nodo?.measureInWindow) { resolve(null); return; }
    try {
      nodo.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
    } catch { resolve(null); }
  });
}

function Overlay({ paso, setPaso, rect, setRect, listo, setListo, objetivos, acciones, direccion, desplazables, datos, navigationRef, turno, terminar }) {
  const pantalla = useWindowDimensions();
  const insetInferior = initialWindowMetrics?.insets?.bottom || 0;
  // Lugar fijo donde queda el elemento después de desplazar: arriba, debajo de la barra de estado.
  const arriba = (initialWindowMetrics?.insets?.top || 24) + 70;
  // Salto sin animación (el velo tapa todo mientras tanto): así no se ve la pantalla bajando.
  // Devuelve la nueva medida, o null si no hizo falta o la pantalla ya no da para más.
  const llevarArriba = async (pantallaId, clave3, r) => {
    const scroll = desplazables.current.get(pantallaId);
    const delta = desplazamientoNecesario(r, pantalla, { arriba });
    if (!delta || !scroll?.ref?.current) return null;
    const previo = scroll.offset.current || 0;
    const y = Math.max(0, previo + delta);
    scroll.ref.current.scrollTo({ y, animated: false });
    await espera(90);
    const r2 = await medir(objetivos.current.get(clave3));
    // Si no se movió (fin de la pantalla), dejamos todo como estaba.
    if (!r2 || !rectCambio(r, r2)) return null;
    scroll.offset.current = previo + (r.y - r2.y);
    return r2;
  };
  const actual = PASOS[paso];
  const clave = actual?.objetivo || actual?.id;
  // Saltear un paso sin elemento en el sentido en que se viene moviendo.
  const saltear = () => setPaso((p) => {
    const siguiente = p + direccion.current;
    if (siguiente < 0) { direccion.current = 1; return p + 1; }
    return siguiente;
  });

  // Prepara el paso: navega a su pestaña, desplaza hasta el elemento y lo mide.
  // Si el elemento no existe para este usuario, el paso se saltea.
  useEffect(() => {
    const mio = ++turno.current;
    let cancelado = false;
    const vigente = () => !cancelado && mio === turno.current;
    (async () => {
      setListo(false);
      try {
        if (actual.id === 'fin') {
          navigationRef.navigate?.('HomeTabs', { screen: 'Mis Retos' });
          if (vigente()) { setRect(null); setListo(true); }
          return;
        }
        if (actual.stack) {
          // Pantalla propia (p. ej. Korva Mundi): se abre y se espera a que dibuje.
          navigationRef.navigate?.(actual.stack);
          await espera(900);
        } else {
          const pestana = actual.tab || actual.pantalla;
          navigationRef.navigate?.('HomeTabs', { screen: pestana });
          await espera(420);
        }
        if (!vigente()) return;
        if (actual.tab) {
          const rutas = rutasDeTabs(navigationRef);
          const i = rutas ? rutas.indexOf(actual.tab) : -1;
          if (i < 0) { saltear(); return; }
          setRect(rectTab(i, rutas.length, pantalla, insetInferior));
          setListo(true);
          return;
        }
        // La pantalla se prepara para el paso (por ejemplo, elegir Manual o pasar a Mapa).
        const preparar = acciones.current.get(actual.id);
        if (preparar) { try { preparar(); } catch { /* sigue igual */ } await espera(350); if (!vigente()) return; }
        // La pantalla puede seguir acomodándose (carga datos, termina el scroll):
        // medimos hasta que el elemento quede quieto antes de mostrar el recuadro.
        const medirQuieto = async () => {
          let previo = await medir(objetivos.current.get(clave));
          let quietas = 0;
          for (let i = 0; i < 12 && vigente(); i++) {
            await espera(130);
            const ahora = await medir(objetivos.current.get(clave));
            if (ahora && !rectCambio(previo, ahora)) { quietas += 1; if (quietas >= 2) return ahora; }
            else quietas = 0;
            previo = ahora;
          }
          return previo;
        };
        let r = await medirQuieto();
        if (!r) { if (vigente()) saltear(); return; }
        for (let intento = 0; intento < 2 && vigente(); intento++) {
          const movido = await llevarArriba(actual.pantalla, clave, r);
          if (!vigente()) return;
          if (!movido) break;
          r = (await medirQuieto()) || movido;
        }
        if (vigente()) { setRect(r); setListo(true); }
      } catch {
        if (vigente()) terminar();
      }
    })();
    return () => { cancelado = true; };
  }, [paso]);

  // Mientras el paso está a la vista, el recuadro sigue al elemento: si la
  // pantalla se mueve (cargan datos, aparece una fila), se redibuja solo.
  useEffect(() => {
    if (!listo || !rect || !actual || actual.tab || actual.id === 'fin') return undefined;
    const clave2 = actual.objetivo || actual.id;
    let vivo = true;
    const id = setInterval(async () => {
      const r = await medir(objetivos.current.get(clave2));
      if (!vivo || !r || !rectCambio(rect, r, 4)) return;
      // Si la pantalla se acomodó (cargaron datos), el recuadro se desliza al nuevo
      // lugar. Solo si el elemento quedó fuera de la vista lo volvemos a subir.
      const fuera = r.y > pantalla.height - 140 || r.y + r.height < 90;
      const movido = fuera && actual.pantalla ? await llevarArriba(actual.pantalla, clave2, r) : null;
      if (!vivo) return;
      setRect(movido || r);
    }, 350);
    return () => { vivo = false; clearInterval(id); };
  }, [listo, rect, paso]);

  // Transición suave entre pasos: el recuadro y el globo se desvanecen mientras
  // la pantalla se prepara detrás del velo, y aparecen cuando está todo quieto.
  const aparicion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(aparicion, { toValue: listo ? 1 : 0, duration: listo ? 240 : 140, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); // JS: comparte vista con posiciones animadas
  }, [listo]);
  // El recuadro se desliza al nuevo lugar en vez de saltar.
  const marcoAnim = useRef(null);
  if (!marcoAnim.current) marcoAnim.current = { x: new Animated.Value(0), y: new Animated.Value(0), w: new Animated.Value(0), h: new Animated.Value(0), globo: new Animated.Value(0), listoAntes: false };
  useEffect(() => {
    const m = marcoAnim.current;
    if (!rect) { m.listoAntes = false; m.globo.setValue(posicionGlobo(null, pantalla).top); return; }
    const destino = { x: rect.x, y: rect.y, w: rect.width, h: rect.height, globo: posicionGlobo(rect, pantalla).top };
    // Recién aparece (venía tapado): se ubica directo. Ya visible: se desliza.
    const recien = !m.listoAntes;
    m.listoAntes = listo;
    if (!listo || recien) { Object.keys(destino).forEach((k) => m[k].setValue(destino[k])); return; }
    Animated.parallel(Object.keys(destino).map((k) => Animated.timing(m[k], { toValue: destino[k], duration: 220, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }))).start();
  }, [rect, listo]);

  // Nunca cambiar estado durante el dibujado (eso era lo que rompía el tutorial viejo).
  useEffect(() => { if (!actual) terminar(); }, [actual, terminar]);
  if (!actual) return null;
  const ultimo = paso === PASOS.length - 1;
  const textos = textoPaso(actual, datos.current);
  const total = PASOS.length - 1;
  const conHueco = !!rect && actual.id !== 'fin';
  const m = marcoAnim.current;
  const subir = aparicion.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* El velo de afuera queda fijo; solo el hueco se aclara cuando el paso está listo.
          Así no parpadea la pantalla entre pasos. */}
      {conHueco ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <Animated.View style={[styles.velo, { left: 0, top: 0, width: pantalla.width, height: pos(Animated.subtract(m.y, 8)) }]} />
          <Animated.View style={[styles.velo, { left: 0, top: Animated.add(Animated.add(m.y, m.h), 8), width: pantalla.width, height: pantalla.height }]} />
          <Animated.View style={[styles.velo, { left: 0, top: Animated.subtract(m.y, 8), width: pos(Animated.subtract(m.x, 8)), height: Animated.add(m.h, 16) }]} />
          <Animated.View style={[styles.velo, { left: Animated.add(Animated.add(m.x, m.w), 8), top: Animated.subtract(m.y, 8), width: pantalla.width, height: Animated.add(m.h, 16) }]} />
          <Animated.View pointerEvents={listo ? 'none' : 'auto'} style={[styles.velo, { left: Animated.subtract(m.x, 8), top: Animated.subtract(m.y, 8), width: Animated.add(m.w, 16), height: Animated.add(m.h, 16), opacity: aparicion.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} />
          <Animated.View pointerEvents="none" style={[styles.marco, { left: Animated.subtract(m.x, 8), top: Animated.subtract(m.y, 8), width: Animated.add(m.w, 16), height: Animated.add(m.h, 16), opacity: aparicion }]} />
        </View>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.veloLleno]} />
      )}
      {listo && (
        <Animated.View style={[styles.globo, { top: m.globo }, { opacity: aparicion, transform: [{ translateY: subir }] }]}>
          {!ultimo && <Text style={styles.contador}>{paso + 1} DE {total}</Text>}
          <Text style={styles.titulo}>{textos.titulo}</Text>
          <Text style={styles.texto}>{textos.texto}</Text>
          <View style={styles.acciones}>
            {!ultimo ? (
              <TouchableOpacity onPress={terminar} hitSlop={10} accessibilityRole="button"><Text style={styles.saltar}>Saltar</Text></TouchableOpacity>
            ) : <View />}
            <View style={styles.botones}>
              {paso > 0 && (
                <TouchableOpacity style={styles.atras} onPress={() => { direccion.current = -1; setPaso(paso - 1); }} accessibilityRole="button">
                  <Text style={styles.atrasTxt}>Atrás</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.siguiente} onPress={() => { direccion.current = 1; if (ultimo) terminar(); else setPaso(paso + 1); }} accessibilityRole="button">
                <Text style={styles.siguienteTxt}>{ultimo ? 'Empezar' : 'Siguiente'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// Para marcar un elemento: <View ref={useTourTarget('gps')} collapsable={false}>…</View>
export function useTourTarget(id) {
  const tour = useContext(TourContext);
  return useCallback((nodo) => { tour?.registrar(id, nodo); }, [tour, id]);
}

// Para que la pantalla se prepare al llegar a un paso (elegir Manual, pasar a Mapa…).
export function useTourAccion(idPaso, fn) {
  const tour = useContext(TourContext);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    tour?.registrarAccion(idPaso, () => fnRef.current?.());
    return () => tour?.registrarAccion(idPaso, null);
  }, [tour, idPaso]);
}

// Para que el recorrido pueda desplazar la pantalla hasta el elemento.
export function useTourScroll(pantalla, scrollRef) {
  const tour = useContext(TourContext);
  const offset = useRef(0);
  useEffect(() => {
    tour?.registrarScroll(pantalla, { ref: scrollRef, offset });
    return () => tour?.registrarScroll(pantalla, null);
  }, [tour, pantalla, scrollRef]);
  return useCallback((e) => { offset.current = e?.nativeEvent?.contentOffset?.y || 0; }, []);
}

// Para que el recorrido sepa algo de la persona (p. ej. si le aparece Garmin).
export function useTourDato(clave, valor) {
  const tour = useContext(TourContext);
  useEffect(() => { tour?.registrarDato?.(clave, valor); }, [tour, clave, valor]);
}

export function useTour() {
  return useContext(TourContext) || { iniciar: () => {}, terminar: () => {}, activo: false };
}

const styles = StyleSheet.create({
  velo: { position: 'absolute', backgroundColor: 'rgba(2,8,15,0.78)' },
  veloLleno: { backgroundColor: 'rgba(2,8,15,0.78)' },
  marco: { position: 'absolute', borderRadius: 18, borderWidth: 2, borderColor: colors.brandOrange },
  globo: { position: 'absolute', left: 20, right: 20, backgroundColor: colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.borderSoft },
  contador: { color: colors.brandOrange, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  titulo: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 4 },
  texto: { color: colors.textSoft, fontSize: 14, lineHeight: 20, marginTop: 6 },
  acciones: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  saltar: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  botones: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  atras: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.borderSoft },
  atrasTxt: { color: colors.textSoft, fontSize: 14, fontWeight: '700' },
  siguiente: { backgroundColor: colors.brandOrange, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999 },
  siguienteTxt: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
