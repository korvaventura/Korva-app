import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme/korvaTheme';
import MovimientoPersonalCard from './MovimientoPersonalCard';
import { plataformaSoportada } from '../services/health/healthkitLectura';
import { autoSyncActivado } from '../services/health/syncAutomatico';
import { consultarAportesHealth } from '../services/health/aportesDesafios';
import { OPCIONES_REGISTRO, estadoSaludTarjeta, fmt, numerosHoy, textoPasos } from '../services/comoSumasCore';

// Tarjeta "Cómo sumás km": de dónde salen los km de hoy y a qué suma cada fuente.
// Reemplaza al resumen "Tu movimiento · hoy" del Home. No cambia ningún cálculo:
// sólo muestra lo que ya existe y lleva directo a la configuración de Salud.
export default function ComoSumasKmCard({ userId, movimiento, onActualizarMovimiento, stravaConectado, onStrava, navigation }) {
  const [conectada, setConectada] = useState(false);
  const [aportes, setAportes] = useState(null);
  const [detalle, setDetalle] = useState(null); // null | 'resumen' | 'aportes'
  const [otraApp, setOtraApp] = useState(false);
  const vivo = useRef(true);

  const leerSalud = useCallback(async () => {
    if (!userId || !plataformaSoportada) return;
    try { const v = await autoSyncActivado(userId); if (vivo.current) setConectada(!!v); } catch { /* sin estado */ }
    try { const a = await consultarAportesHealth(userId); if (vivo.current) setAportes(a); } catch { if (vivo.current) setAportes(null); }
  }, [userId]);

  useEffect(() => {
    vivo.current = true;
    leerSalud();
    const sub = DeviceEventEmitter.addListener('korva:movimiento-actualizado', leerSalud);
    return () => { vivo.current = false; sub.remove(); };
  }, [leerSalud]);

  const salud = estadoSaludTarjeta({ soportada: plataformaSoportada, conectada, aportes });
  const hoy = numerosHoy(movimiento);
  const cerrar = () => { setDetalle(null); leerSalud(); };

  return (
    <View style={styles.card}>
      <View style={styles.cabecera}>
        <Text style={styles.eyebrow}>CÓMO SUMÁS KM</Text>
        <TouchableOpacity onPress={() => setDetalle('resumen')} accessibilityRole="button" hitSlop={10}>
          <Text style={styles.verMas}>Tu semana ›</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.fila, !salud && styles.filaUltima]}>
        <View style={[styles.icono, styles.iconoActividad]}><Ionicons name="walk" size={18} color={colors.brandOrange} /></View>
        <View style={styles.filaTexto}>
          <Text style={styles.filaTitulo}>Actividades</Text>
          <Text style={styles.filaDetalle}>GPS Korva, Strava o manual · suman a todos tus desafíos</Text>
          <TouchableOpacity onPress={() => setOtraApp(true)} accessibilityRole="button" hitSlop={8} style={styles.filaLink}>
            <Ionicons name="watch-outline" size={13} color={colors.actionBlue} />
            <Text style={styles.filaLinkTxt}>¿Usás Garmin u otro reloj? ›</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.km}>{hoy ? `${fmt(hoy.actividades)} km` : '—'}</Text>
      </View>

      {!!salud && (
        <View style={[styles.fila, styles.filaUltima]}>
          <View style={[styles.icono, styles.iconoSalud]}><Ionicons name="heart" size={17} color="#8ACBF1" /></View>
          <View style={styles.filaTexto}>
            <Text style={styles.filaTitulo}>Movimiento del día <Text style={styles.opcional}>Salud · opcional</Text></Text>
            <Text style={styles.filaDetalle}>{salud.texto}</Text>
            {conectada && hoy && <Text style={styles.filaNota}>{textoPasos(hoy.pasos)}</Text>}
            {!!salud.accion && (
              <TouchableOpacity onPress={() => setDetalle('aportes')} accessibilityRole="button" hitSlop={8} style={styles.filaLink}>
                <Text style={styles.filaLinkTxt}>{salud.accion.texto} ›</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[styles.km, !conectada && styles.kmApagado]}>{conectada && hoy ? `+${fmt(hoy.salud)} km` : ''}</Text>
        </View>
      )}
      {!!salud?.activos.length && hoy?.salud > 0 && (
        <Text style={styles.aclaracion}>La distancia de Salud se confirma 48 h después y nunca repite una actividad.</Text>
      )}

      <Modal visible={otraApp} transparent animationType="fade" onRequestClose={() => setOtraApp(false)}>
        <View style={styles.velo}>
          <View style={styles.aviso}>
            <Text style={styles.avisoTitulo}>Seguí usando tu app</Text>
            {OPCIONES_REGISTRO.map((o, n) => (
              <View key={o.id} style={styles.opcion}>
                <Text style={styles.opcionNumero}>{n + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.opcionTitulo}>{o.titulo}</Text>
                  <Text style={styles.opcionTexto}>{o.texto}</Text>
                  {o.id === 'strava' && (stravaConectado
                    ? <Text style={styles.opcionOk}>✓ Strava conectado</Text>
                    : <TouchableOpacity onPress={() => { setOtraApp(false); onStrava?.(); }}><Text style={styles.opcionLink}>Conectar Strava ›</Text></TouchableOpacity>)}
                  {o.id === 'manual' && <TouchableOpacity onPress={() => { setOtraApp(false); navigation?.navigate('Registrar'); }}><Text style={styles.opcionLink}>Ir a Registrar ›</Text></TouchableOpacity>}
                  {o.id === 'gps' && <TouchableOpacity onPress={() => { setOtraApp(false); navigation?.navigate('GpsTracker'); }}><Text style={styles.opcionLink}>Abrir Korva GPS ›</Text></TouchableOpacity>}
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.avisoCerrar} onPress={() => setOtraApp(false)} accessibilityRole="button">
              <Text style={styles.avisoCerrarTxt}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!detalle} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal
        onRequestClose={cerrar} onDismiss={cerrar}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.hoja} edges={['top', 'bottom']}>
            <View style={styles.hojaCabecera}>
              <Text style={styles.hojaTitulo}>{detalle === 'aportes' ? 'Salud y desafíos' : 'Tu movimiento'}</Text>
              <TouchableOpacity onPress={cerrar} accessibilityRole="button" accessibilityLabel="Cerrar">
                <Ionicons name="close" size={24} color={colors.textSoft} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.hojaContenido}>
              <MovimientoPersonalCard estado={movimiento} onActualizar={onActualizarMovimiento} abrirAportes={detalle === 'aportes'} />
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl || 22, borderWidth: 1, borderColor: colors.borderSoft, padding: 18 },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  eyebrow: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  verMas: { color: colors.actionBlue, fontSize: 12, fontWeight: '700' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  icono: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  iconoActividad: { backgroundColor: 'rgba(252,76,2,0.14)' },
  iconoSalud: { backgroundColor: 'rgba(138,203,241,0.14)' },
  filaTexto: { flex: 1 },
  filaTitulo: { color: colors.text, fontSize: 15, fontWeight: '700' },
  opcional: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  filaDetalle: { color: colors.textSoft, fontSize: 12, lineHeight: 17, marginTop: 2 },
  filaNota: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  km: { color: colors.text, fontSize: 16, fontWeight: '800', minWidth: 54, textAlign: 'right' },
  kmApagado: { color: colors.textMuted },
  aclaracion: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  filaUltima: { borderBottomWidth: 0, paddingBottom: 2 },
  filaLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start' },
  filaLinkTxt: { color: colors.actionBlue, fontSize: 12, fontWeight: '800' },
  velo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  aviso: { backgroundColor: colors.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.borderSoft },
  avisoTitulo: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  opcion: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  opcionNumero: { width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, overflow: 'hidden', backgroundColor: colors.background, color: colors.brandOrange, fontWeight: '800', fontSize: 12 },
  opcionTitulo: { color: colors.text, fontSize: 14, fontWeight: '700' },
  opcionTexto: { color: colors.textSoft, fontSize: 12, lineHeight: 17, marginTop: 2 },
  opcionLink: { color: colors.actionBlue, fontSize: 12, fontWeight: '800', marginTop: 6 },
  opcionOk: { color: '#7FD49A', fontSize: 12, fontWeight: '700', marginTop: 6 },
  avisoCerrar: { marginTop: 10, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.background, alignItems: 'center' },
  avisoCerrarTxt: { color: colors.text, fontSize: 14, fontWeight: '700' },
  hoja: { flex: 1, backgroundColor: colors.background },
  hojaCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  hojaTitulo: { color: colors.text, fontSize: 20, fontWeight: '800' },
  hojaContenido: { paddingHorizontal: 20, paddingBottom: 40 },
});
