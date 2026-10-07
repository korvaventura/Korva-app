import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapaRecorrido from './MapaRecorrido';
import useRutaLibre from '../services/useRutaLibre';
import { consultarRutaLibre } from '../services/rutasLibresApi';
import { colors, spacing } from '../theme/korvaTheme';
const ID = '3b211caf-ee16-54c8-a93c-343a5eb2d57e';
export default function RutaLibreScreen({ navigation }) {
  const { estado, actualizar } = useRutaLibre();
  const [guardando, setGuardando] = useState(false), [error, setError] = useState(''), [scrollEnabled, setScrollEnabled] = useState(true);
  const scroll = useRef(null), pendiente = useRef(false), vivo = useRef(false);
  const scrollY = useRef(0);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  const p = estado.datos?.participacion;
  const actuar = async (accion) => {
    if (pendiente.current || !estado.datos) return;
    pendiente.current = true; setGuardando(true); setError('');
    try {
      await consultarRutaLibre({ userId: estado.datos.userId, accion,
        body: accion === 'aceptar' ? { acepto: true, version: estado.datos.ruta.aceptacion_version } : {} });
      if (vivo.current) await actualizar();
    } catch (e) { if (vivo.current) setError(e.message); }
    finally { pendiente.current = false; if (vivo.current) setGuardando(false); }
  };
  const aceptar = () => Alert.alert('Empezar Islandia',
    'Esta ruta es gratuita y no incluye medalla. Cuenta movimiento realizado desde tu aceptación y puede avanzar junto a tus desafíos activos. El recorrido comienza con la primera actividad válida posterior, de GPS, Manual o Strava. Podés pausarla o dejarla cuando quieras.',
    [{ text: 'Cancelar', style: 'cancel' }, { text: 'Aceptar y empezar', onPress: () => actuar('aceptar') }]);
  const bloquearMapa = useCallback((activo) => { setScrollEnabled(!activo); scroll.current?.setNativeProps?.({ scrollEnabled: !activo }); }, []);
  const mostrarHistoria = useCallback((historia) => {
    bloquearMapa(false);
    const nativo = scroll.current?.getNativeScrollRef?.() || scroll.current;
    nativo?.measureInWindow?.((_x, top) => historia?.measureInWindow?.((_hx, y) => {
      scroll.current?.scrollTo({ y: Math.max(0, scrollY.current + y - top - 16), animated: true });
    }));
  }, [bloquearMapa]);
  return <ScrollView ref={scroll} style={styles.screen} contentContainerStyle={styles.content} scrollEnabled={scrollEnabled}
    onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
    canCancelContentTouches onTouchEnd={() => bloquearMapa(false)} onTouchCancel={() => bloquearMapa(false)}>
    <Text style={styles.tag}>RUTA GRATUITA · SIN MEDALLA</Text>
    <Text style={styles.title}>Islandia · Ring Road</Text>
    <Text style={styles.copy}>1.400 km en cinco capítulos: cascadas, glaciares, fiordos, volcanes y sagas.</Text>
    {estado.cargando ? <ActivityIndicator color={colors.actionBlue} /> : estado.error ? <>
      <Text style={styles.error}>{estado.error}</Text><TouchableOpacity onPress={actualizar}><Text style={styles.link}>Reintentar</Text></TouchableOpacity>
    </> : p && !p.abandonado ? <>
      <Text style={styles.progress}>{p.km.toLocaleString('es-AR', { maximumFractionDigits: 2 })} / 1.400 km · {Math.floor(p.porcentaje)}%</Text>
      <Text style={styles.copy}>{p.estado === 'elegida' ? 'Elegida: esperando tu primera actividad posterior a la aceptación.' : p.estado === 'pausada' ? 'Pausada: conserva tu avance y no cuenta actividades durante la pausa.' : p.estado === 'completada' ? '¡Completaste la vuelta a Islandia!' : 'Tu recorrido está en curso.'}</Text>
      {p.started_at && <Text style={styles.copy}>Inicio: {new Date(p.started_at).toLocaleDateString('es-AR')}</Text>}
      {p.estado !== 'completada' && <View style={styles.actions}>
        <TouchableOpacity disabled={guardando} onPress={() => actuar(p.pausado ? 'reanudar' : 'pausar')}><Text style={styles.link}>{p.pausado ? 'Reanudar' : 'Pausar'}</Text></TouchableOpacity>
        <TouchableOpacity disabled={guardando} onPress={() => Alert.alert('Dejar la ruta', 'Se conserva tu avance. Si volvés a aceptarla, el movimiento realizado mientras estuvo abandonada no cuenta.', [{text:'Cancelar',style:'cancel'}, {text:'Dejar ruta',onPress:()=>actuar('dejar')}])}><Text style={styles.link}>Dejar ruta</Text></TouchableOpacity>
      </View>}
      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('HomeTabs', { screen: 'Registrar' })}><Text style={styles.buttonText}>Registrar actividad</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => Share.share({ message: `Estoy recorriendo Islandia con Korva: ${p.km.toLocaleString('es-AR', { maximumFractionDigits: 2 })} de 1.400 km. Una ruta gratuita de fuego, hielo y auroras. https://korva.run` }).catch(() => setError('No pudimos abrir las opciones para compartir.'))}><Text style={styles.link}>Compartir progreso</Text></TouchableOpacity>
    </> : <TouchableOpacity style={styles.button} disabled={guardando} onPress={aceptar}><Text style={styles.buttonText}>{p?.abandonado ? 'Retomar ruta gratuita' : 'Elegir esta ruta gratuita'}</Text></TouchableOpacity>}
    {guardando && <ActivityIndicator color={colors.actionBlue} />}
    {!!error && <Text style={styles.error}>{error}</Text>}
    <MapaRecorrido challengeId={ID} challengeTitle="Islandia · Ring Road" kmCompletados={p?.km || 0}
      distanciaTotal={1400} porcentaje={p?.porcentaje || 0} integrado alturaMapa={500} onInteraccionMapa={bloquearMapa} onHistoriaAbierta={mostrarHistoria} />
    <Text style={styles.footnote}>Mapa artístico basado en el modelo 3D. El recorrido representa el desafío virtual; no sirve para navegación GPS. No hay una medalla anunciada para esta ruta.</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, paddingBottom: 50 },
  tag: { color: colors.actionBlue, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', marginVertical: spacing.md },
  copy: { color: colors.textSoft, fontSize: 13, lineHeight: 20, marginBottom: spacing.sm },
  progress: { color: colors.text, fontSize: 20, fontWeight: '700', marginVertical: spacing.md },
  link: { color: colors.actionBlue, fontSize: 14, paddingVertical: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.xl },
  button: { backgroundColor: colors.brandOrange, borderRadius: 12, padding: 16, alignItems: 'center', marginVertical: spacing.md },
  buttonText: { color: colors.text, fontWeight: '700' }, error: { color: colors.brandOrangeSoft, fontSize: 13, marginVertical: spacing.sm },
  footnote: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: spacing.md },
});
