import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme/korvaTheme';
import MovimientoPersonalCard from './MovimientoPersonalCard';
import { plataformaSoportada } from '../services/health/healthkitLectura';
import { autoSyncActivado } from '../services/health/syncAutomatico';
import { consultarAportesHealth } from '../services/health/aportesDesafios';
import { estadoSaludTarjeta, fmt, numerosHoy, textoPasos } from '../services/comoSumasCore';

// Tarjeta "Cómo sumás km": de dónde salen los km de hoy y a qué suma cada fuente.
// Reemplaza al resumen "Tu movimiento · hoy" del Home. No cambia ningún cálculo:
// sólo muestra lo que ya existe y lleva directo a la configuración de Salud.
export default function ComoSumasKmCard({ userId, movimiento, onActualizarMovimiento, stravaConectado, onStrava }) {
  const [conectada, setConectada] = useState(false);
  const [aportes, setAportes] = useState(null);
  const [detalle, setDetalle] = useState(null); // null | 'resumen' | 'aportes'
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

      <View style={styles.fila}>
        <View style={[styles.icono, styles.iconoActividad]}><Ionicons name="walk" size={18} color={colors.brandOrange} /></View>
        <View style={styles.filaTexto}>
          <Text style={styles.filaTitulo}>Actividades</Text>
          <Text style={styles.filaDetalle}>GPS Korva, Strava o manual · suman a todos tus desafíos</Text>
        </View>
        <Text style={styles.km}>{hoy ? `${fmt(hoy.actividades)} km` : '—'}</Text>
      </View>

      {!!salud && (
        <View style={styles.fila}>
          <View style={[styles.icono, styles.iconoSalud]}><Ionicons name="heart" size={17} color="#8ACBF1" /></View>
          <View style={styles.filaTexto}>
            <Text style={styles.filaTitulo}>Distancia de Salud <Text style={styles.opcional}>opcional</Text></Text>
            <Text style={styles.filaDetalle}>{salud.texto}</Text>
            {conectada && hoy && <Text style={styles.filaNota}>{textoPasos(hoy.pasos)}</Text>}
          </View>
          <Text style={[styles.km, !conectada && styles.kmApagado]}>{conectada && hoy ? `+${fmt(hoy.salud)} km` : ''}</Text>
        </View>
      )}
      {!!salud?.activos.length && hoy?.salud > 0 && (
        <Text style={styles.aclaracion}>La distancia de Salud se confirma 48 h después y nunca repite una actividad.</Text>
      )}

      <View style={styles.fuentes}>
        <Fuente nombre="GPS Korva" ok />
        <Fuente nombre="Strava" ok={stravaConectado} onPress={onStrava} />
        {!!salud && <Fuente nombre="Salud" ok={conectada} onPress={() => setDetalle('aportes')} />}
      </View>

      {!!salud?.accion && (
        <TouchableOpacity style={styles.boton} onPress={() => setDetalle('aportes')} accessibilityRole="button">
          <Text style={styles.botonTxt}>{salud.accion.texto}</Text>
        </TouchableOpacity>
      )}

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

function Fuente({ nombre, ok, onPress }) {
  const Contenedor = onPress ? TouchableOpacity : View;
  return (
    <Contenedor onPress={onPress} style={[styles.fuente, ok ? styles.fuenteOk : styles.fuentePendiente]} accessibilityRole={onPress ? 'button' : undefined}>
      <Ionicons name={ok ? 'checkmark' : 'add'} size={13} color={ok ? '#7FD49A' : colors.textSoft} />
      <Text style={[styles.fuenteTxt, ok ? styles.fuenteTxtOk : null]}>{ok ? nombre : `Conectar ${nombre}`}</Text>
    </Contenedor>
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
  fuentes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  fuente: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  fuenteOk: { backgroundColor: 'rgba(127,212,154,0.10)', borderColor: 'rgba(127,212,154,0.35)' },
  fuentePendiente: { borderColor: colors.borderSoft },
  fuenteTxt: { color: colors.textSoft, fontSize: 11, fontWeight: '700' },
  fuenteTxtOk: { color: '#7FD49A' },
  boton: { marginTop: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.brandOrange, alignItems: 'center' },
  botonTxt: { color: colors.brandOrange, fontSize: 14, fontWeight: '800' },
  hoja: { flex: 1, backgroundColor: colors.background },
  hojaCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  hojaTitulo: { color: colors.text, fontSize: 20, fontWeight: '800' },
  hojaContenido: { paddingHorizontal: 20, paddingBottom: 40 },
});
