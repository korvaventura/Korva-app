import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { colors } from '../../theme/korvaTheme';
import { PASOS, desplazamientoNecesario, huecoOverlay, posicionGlobo, rectTab } from '../../services/tour/tourCore';

// Recorrido guiado: oscurece la pantalla, resalta un elemento y explica qué hace.
// Se dibuja ENCIMA de la app (no reemplaza ninguna pantalla) y, si algo falla,
// se cierra solo y la app sigue normal.
const TourContext = createContext(null);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export function TourProvider({ navigationRef, children }) {
  const objetivos = useRef(new Map()); // id → nodo nativo
  const desplazables = useRef(new Map()); // pantalla → { ref, offset }
  const [activo, setActivo] = useState(false);
  const [paso, setPaso] = useState(0);
  const [rect, setRect] = useState(null);
  const [listo, setListo] = useState(false);
  const turno = useRef(0);

  const registrar = useCallback((id, nodo) => {
    if (nodo) objetivos.current.set(id, nodo); else objetivos.current.delete(id);
  }, []);
  const registrarScroll = useCallback((pantalla, datos) => {
    if (datos) desplazables.current.set(pantalla, datos); else desplazables.current.delete(pantalla);
  }, []);

  const terminar = useCallback(() => { turno.current += 1; setActivo(false); setRect(null); setListo(false); }, []);
  const iniciar = useCallback(() => { turno.current += 1; setPaso(0); setRect(null); setListo(false); setActivo(true); }, []);

  const valor = useMemo(() => ({ registrar, registrarScroll, iniciar, terminar, activo }), [registrar, registrarScroll, iniciar, terminar, activo]);

  return (
    <TourContext.Provider value={valor}>
      {children}
      {activo && (
        <SeguroTour onError={terminar}>
          <Overlay
            paso={paso} setPaso={setPaso} rect={rect} setRect={setRect} listo={listo} setListo={setListo}
            objetivos={objetivos} desplazables={desplazables} navigationRef={navigationRef} turno={turno} terminar={terminar}
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

function Overlay({ paso, setPaso, rect, setRect, listo, setListo, objetivos, desplazables, navigationRef, turno, terminar }) {
  const pantalla = useWindowDimensions();
  const insetInferior = initialWindowMetrics?.insets?.bottom || 0;
  const actual = PASOS[paso];

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
        const pestana = actual.tab || actual.pantalla;
        navigationRef.navigate?.('HomeTabs', { screen: pestana });
        await espera(420);
        if (!vigente()) return;
        if (actual.tab) {
          const rutas = rutasDeTabs(navigationRef);
          const i = rutas ? rutas.indexOf(actual.tab) : -1;
          if (i < 0) { setPaso((p) => p + 1); return; }
          setRect(rectTab(i, rutas.length, pantalla, insetInferior));
          setListo(true);
          return;
        }
        let r = await medir(objetivos.current.get(actual.id));
        if (!r) { if (vigente()) setPaso((p) => p + 1); return; }
        const delta = desplazamientoNecesario(r, pantalla);
        const scroll = desplazables.current.get(actual.pantalla);
        if (delta && scroll?.ref?.current) {
          scroll.ref.current.scrollTo({ y: Math.max(0, (scroll.offset.current || 0) + delta), animated: true });
          await espera(450);
          if (!vigente()) return;
          r = await medir(objetivos.current.get(actual.id));
          if (!r) { setPaso((p) => p + 1); return; }
        }
        if (vigente()) { setRect(r); setListo(true); }
      } catch {
        if (vigente()) terminar();
      }
    })();
    return () => { cancelado = true; };
  }, [paso]);

  // Nunca cambiar estado durante el dibujado (eso era lo que rompía el tutorial viejo).
  useEffect(() => { if (!actual) terminar(); }, [actual, terminar]);
  if (!actual) return null;
  const huecos = huecoOverlay(listo ? rect : null, pantalla);
  const globo = posicionGlobo(listo ? rect : null, pantalla);
  const ultimo = paso === PASOS.length - 1;
  const total = PASOS.length - 1;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {huecos.map((h, i) => (
        <View key={i} style={[styles.velo, { left: h.x, top: h.y, width: h.w, height: h.h }]} />
      ))}
      {listo && !!rect && (
        <View pointerEvents="none" style={[styles.marco, { left: rect.x - 8, top: rect.y - 8, width: rect.width + 16, height: rect.height + 16 }]} />
      )}
      {listo && (
        <View style={[styles.globo, globo]}>
          {!ultimo && <Text style={styles.contador}>{paso + 1} DE {total}</Text>}
          <Text style={styles.titulo}>{actual.titulo}</Text>
          <Text style={styles.texto}>{actual.texto}</Text>
          <View style={styles.acciones}>
            {!ultimo ? (
              <TouchableOpacity onPress={terminar} hitSlop={10} accessibilityRole="button"><Text style={styles.saltar}>Saltar</Text></TouchableOpacity>
            ) : <View />}
            <TouchableOpacity style={styles.siguiente} onPress={() => (ultimo ? terminar() : setPaso(paso + 1))} accessibilityRole="button">
              <Text style={styles.siguienteTxt}>{ultimo ? 'Empezar' : 'Siguiente'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// Para marcar un elemento: <View ref={useTourTarget('gps')} collapsable={false}>…</View>
export function useTourTarget(id) {
  const tour = useContext(TourContext);
  return useCallback((nodo) => { tour?.registrar(id, nodo); }, [tour, id]);
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

export function useTour() {
  return useContext(TourContext) || { iniciar: () => {}, terminar: () => {}, activo: false };
}

const styles = StyleSheet.create({
  velo: { position: 'absolute', backgroundColor: 'rgba(2,8,15,0.78)' },
  marco: { position: 'absolute', borderRadius: 18, borderWidth: 2, borderColor: colors.brandOrange },
  globo: { position: 'absolute', left: 20, right: 20, backgroundColor: colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.borderSoft },
  contador: { color: colors.brandOrange, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  titulo: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 4 },
  texto: { color: colors.textSoft, fontSize: 14, lineHeight: 20, marginTop: 6 },
  acciones: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  saltar: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  siguiente: { backgroundColor: colors.brandOrange, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999 },
  siguienteTxt: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
