import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Ionicons } from '@expo/vector-icons';
const BACKEND_URL = 'https://korva-app-production.up.railway.app';

const LIMITE_KM_DIA_RUN = 15;
const LIMITE_KM_DIA_RIDE = 40;

const formatearFecha = (fecha) => {
  if (!fecha) return '';
  return new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const diasEntre = (fecha1, fecha2) => {
  const d1 = new Date(fecha1);
  const d2 = new Date(fecha2);
  return Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)));
};

const getHitoActividad = (actividad, index, totalKmAcumulado, distanciaTotal) => {
  const pct = (totalKmAcumulado / distanciaTotal) * 100;
  if (index === 0) return { emoji: '🌱', texto: 'Primer paso' };
  if (pct >= 100) return { emoji: '🏅', texto: '¡Completado!' };
  if (pct >= 75) return { emoji: '🔥', texto: 'En la recta final' };
  if (pct >= 50) return { emoji: '⚡', texto: 'Mitad del camino' };
  if (pct >= 25) return { emoji: '💪', texto: 'Arrancando fuerte' };
  return { emoji: actividad.sport_type === 'ride' ? '🚴' : '🏃', texto: actividad.sport_type === 'ride' ? 'Pedaleando' : 'Corriendo' };
};

export default function DetalleRetoScreen({ route, navigation }) {
  const { item, userId } = route.params;
  const [actividades, setActividades] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [metaFecha, setMetaFecha] = useState('');
  const [editandoFecha, setEditandoFecha] = useState(false);
  const [inputFecha, setInputFecha] = useState('');

  const pct = Math.min(parseFloat(item.porcentaje), 100);
  const estaCompletado = pct >= 100;
  const modalidad = item.modalidad === 'Running' ? 'run' : 'ride';
  const limiteDiario = modalidad === 'run' ? LIMITE_KM_DIA_RUN : LIMITE_KM_DIA_RIDE;

  useEffect(() => {
    cargarActividades();
    cargarMeta();
  }, []);

  const cargarActividades = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/actividades/${userId}`);
      const data = await res.json();
      setActividades(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setCargando(false);
    }
  };

  const cargarMeta = async () => {
    try {
      const { data } = await supabase
        .from('user_challenges')
        .select('meta_fecha')
        .eq('user_id', userId)
        .eq('challenge_id', item.challenge_id)
        .maybeSingle();
      if (data?.meta_fecha) setMetaFecha(data.meta_fecha);
    } catch (error) {}
  };

  const guardarMeta = async () => {
    if (!inputFecha) {
      await supabase.from('user_challenges').update({ meta_fecha: null })
        .eq('user_id', userId).eq('challenge_id', item.challenge_id);
      setMetaFecha('');
      setEditandoFecha(false);
      return;
    }
    const partes = inputFecha.split('/');
    if (partes.length !== 3) { Alert.alert('Formato inválido', 'Usá DD/MM/AAAA'); return; }
    const fecha = new Date(`${partes[2]}-${partes[1]}-${partes[0]}`);
    if (isNaN(fecha.getTime())) { Alert.alert('Fecha inválida'); return; }
    if (fecha <= new Date()) { Alert.alert('La fecha debe ser futura'); return; }

    const kmRestantes = parseFloat(item.distancia_total) - parseFloat(item.km_completados);
    const diasRestantes = diasEntre(new Date(), fecha);
    const kmPorDia = kmRestantes / diasRestantes;

    if (kmPorDia > limiteDiario) {
      Alert.alert(
        '⚠️ Ritmo elevado',
        `Para llegar a tiempo necesitarías ${kmPorDia.toFixed(1)}km por día.\n\nLas guías de actividad física recomiendan no superar los ${limiteDiario}km diarios para ${modalidad === 'run' ? 'running' : 'ciclismo'} sin entrenamiento previo.\n\n¿Querés guardar igual?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Guardar igual', onPress: () => saveFecha(fecha.toISOString()) }
        ]
      );
      return;
    }
    saveFecha(fecha.toISOString());
  };

  const saveFecha = async (fechaISO) => {
    await supabase.from('user_challenges').update({ meta_fecha: fechaISO })
      .eq('user_id', userId).eq('challenge_id', item.challenge_id);
    setMetaFecha(fechaISO);
    setEditandoFecha(false);
  };

  const calcularStats = () => {
    if (actividades.length === 0) return null;
    const fechaInicio = new Date(item.started_at || actividades[actividades.length - 1]?.recorded_at);
    const fechaFin = estaCompletado ? new Date(item.completed_at || new Date()) : new Date();
    const diasTotales = diasEntre(fechaInicio, fechaFin);
    const sesiones = actividades.length;
    const kmPromedio = (parseFloat(item.km_completados) / sesiones).toFixed(1);
    const tiempoTotal = actividades.reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
    const horas = Math.floor(tiempoTotal / 3600);
    const minutos = Math.floor((tiempoTotal % 3600) / 60);

    const kmPorDia = actividades.reduce((acc, a) => {
      const dia = a.recorded_at?.split('T')[0];
      acc[dia] = (acc[dia] || 0) + a.distance_km;
      return acc;
    }, {});
    const mejorDia = Object.entries(kmPorDia).sort((a, b) => b[1] - a[1])[0];

    return { diasTotales, sesiones, kmPromedio, horas, minutos, mejorDia };
  };

  const stats = calcularStats();

  const kmRestantes = parseFloat(item.distancia_total) - parseFloat(item.km_completados);
  const diasDesdeInicio = item.started_at ? diasEntre(new Date(item.started_at), new Date()) : 1;
  const ritmoDiario = parseFloat(item.km_completados) / diasDesdeInicio;
  const diasParaTerminar = ritmoDiario > 0 ? Math.ceil(kmRestantes / ritmoDiario) : null;
  const fechaEstimada = diasParaTerminar ? new Date(Date.now() + diasParaTerminar * 86400000) : null;

  const factorDescanso = modalidad === 'run' ? 0.6 : 0.75;
  const sesionesporSemana = modalidad === 'run' ? 4 : 5;
  let acumulado = 0;
  const actividadesConHito = [...actividades].reverse().map((act, i) => {
    acumulado += act.distance_km;
    const hito = getHitoActividad(act, i, acumulado, parseFloat(item.distancia_total));
    return { ...act, hito, acumulado };
  });
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <View style={styles.backBtnRow}>
          <Ionicons name="arrow-back" size={16} color="#1E6FD9" />
          <Text style={styles.backBtnText}>Volver</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.titulo}>{item.challenge}</Text>
      <Text style={styles.subtitulo}>{item.modalidad} · {item.distancia_total}km</Text>

      <View style={styles.progresoCard}>
        <View style={styles.progresoHeader}>
          <Text style={styles.progresoKm}>{item.km_completados} km</Text>
          <Text style={styles.progresoPct}>{pct.toFixed(0)}%</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${pct}%` }, estaCompletado && styles.progressFillCompletado]} />
        </View>
        <Text style={styles.progresoSub}>de {item.distancia_total} km totales</Text>
        {item.started_at && (
          <Text style={styles.progresoFecha}>Comenzaste el {formatearFecha(item.started_at)}</Text>
        )}
      </View>

      {estaCompletado && stats && (
        <View style={styles.statsCompletadoCard}>
          <Text style={styles.statsCompletadoTitulo}>🏅 Reto completado</Text>
          <Text style={styles.statsCompletadoFrase}>
            Cruzaste el fin del mundo en {stats.diasTotales} días
          </Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statNumero}>{stats.diasTotales}</Text>
              <Text style={styles.statLabel}>Días</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumero}>{stats.sesiones}</Text>
              <Text style={styles.statLabel}>Sesiones</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumero}>{stats.kmPromedio}</Text>
              <Text style={styles.statLabel}>km/sesión</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumero}>{stats.horas}h {stats.minutos}m</Text>
              <Text style={styles.statLabel}>Tiempo total</Text>
            </View>
          </View>
          {stats.mejorDia && (
            <View style={styles.mejorDiaBox}>
              <Text style={styles.mejorDiaTexto}>
                🔥 Mejor día: {formatearFecha(stats.mejorDia[0])} con {stats.mejorDia[1].toFixed(1)}km
              </Text>
            </View>
          )}
        </View>
      )}

      {!estaCompletado && (
        <View style={styles.ritmoCard}>
          <Text style={styles.ritmoTitulo}>📈 Tu ritmo actual</Text>
         <Text style={styles.ritmoKm}>{ritmoDiario.toFixed(1)} km/sesión promedio</Text>
          <Text style={styles.ritmoSesiones}>{sesionesporSemana} sesiones por semana recomendadas</Text>
          {fechaEstimada && (
            <Text style={styles.ritmoPrediccion}>
              A este ritmo terminás el {formatearFecha(fechaEstimada)}
            </Text>
          )}
          <Text style={styles.ritmoRestante}>Faltan {kmRestantes.toFixed(1)}km</Text>
        </View>
      )}

      {!estaCompletado && (
        <View style={styles.metaCard}>
          <View style={styles.metaHeader}>
            <Text style={styles.metaTitulo}>🎯 Tu meta personal</Text>
            <TouchableOpacity onPress={() => { setInputFecha(metaFecha ? new Date(metaFecha).toLocaleDateString('es-AR') : ''); setEditandoFecha(!editandoFecha); }}>
              <Text style={styles.metaEditarBtn}>{editandoFecha ? 'Cancelar' : metaFecha ? 'Editar' : '+ Agregar'}</Text>
            </TouchableOpacity>
          </View>

          {editandoFecha ? (
            <View style={styles.metaInputRow}>
              <TextInput
                style={styles.metaInput}
                value={inputFecha}
                onChangeText={setInputFecha}
                placeholder="DD/MM/AAAA"
                placeholderTextColor="#4a6a8a"
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.metaGuardarBtn} onPress={guardarMeta}>
                <Text style={styles.metaGuardarBtnText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          ) : metaFecha ? (
            <>
              <Text style={styles.metaFecha}>📅 {formatearFecha(metaFecha)}</Text>
              <Text style={styles.metaDias}>
                {diasEntre(new Date(), new Date(metaFecha))} días restantes
              </Text>
              <Text style={styles.metaRitmo}>
                {(() => {
                  const diasRestantes = diasEntre(new Date(), new Date(metaFecha));
                  const sesionesRestantes = Math.floor(diasRestantes * factorDescanso);
                  const kmPorSesion = sesionesRestantes > 0 ? (kmRestantes / sesionesRestantes).toFixed(1) : '—';
                  return `${kmPorSesion}km por sesión · ${sesionesporSemana} veces/semana`;
                })()}
              </Text>
            </>
          ) : (
            <Text style={styles.metaVacio}>Sin meta definida. Podés agregar una fecha límite opcional.</Text>
          )}
        </View>
      )}

      <View style={styles.historialSection}>
        <Text style={styles.historialTitulo}>📖 Tu historia</Text>
        {cargando ? (
          <ActivityIndicator color="#1E6FD9" />
        ) : actividadesConHito.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🏁</Text>
            <Text style={styles.emptyText}>Sin actividades todavía</Text>
            <Text style={styles.emptySubtext}>Registrá tu primer km para empezar tu historia</Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {actividadesConHito.map((act, index) => (
              <View key={index} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, index === 0 && styles.timelineDotActivo]}>
                    <Text style={styles.timelineDotEmoji}>{act.hito.emoji}</Text>
                  </View>
                  {index < actividadesConHito.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineHito}>{act.hito.texto}</Text>
                  <Text style={styles.timelineFecha}>{formatearFecha(act.recorded_at)}</Text>
                  <View style={styles.timelineActRow}>
                    <Text style={styles.timelineEmoji}>{act.sport_type === 'ride' ? '🚴' : '🏃'}</Text>
                    <Text style={styles.timelineKm}>{parseFloat(act.distance_km).toFixed(1)} km</Text>
                    <Text style={styles.timelineTipo}>{act.sport_type === 'ride' ? 'Ciclismo' : 'Running'} · {act.source === 'manual' ? 'manual' : 'Strava'}</Text>
                  </View>
                  <Text style={styles.timelineAcumulado}>Total acumulado: {act.acumulado.toFixed(1)}km</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  backBtn: { marginBottom: 16 },
  backBtnText: { color: '#1E6FD9', fontSize: 15, fontWeight: 'bold' },
  titulo: { fontSize: 26, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  subtitulo: { fontSize: 14, color: '#A8CFFF', marginBottom: 20 },
  progresoCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 20, marginBottom: 16 },
  progresoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  progresoKm: { fontSize: 32, fontWeight: 'bold', color: '#FFFFFF' },
  progresoPct: { fontSize: 24, fontWeight: 'bold', color: '#FC4C02' },
  progressBar: { height: 8, backgroundColor: '#0D1B2A', borderRadius: 4, marginBottom: 8 },
  progressFill: { height: 8, backgroundColor: '#1E6FD9', borderRadius: 4 },
  progressFillCompletado: { backgroundColor: '#FC4C02' },
  progresoSub: { fontSize: 13, color: '#A8CFFF' },
  progresoFecha: { fontSize: 12, color: '#4a6a8a', marginTop: 6 },
  statsCompletadoCard: { backgroundColor: '#1a2a1a', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#FC4C02' },
  statsCompletadoTitulo: { fontSize: 18, fontWeight: 'bold', color: '#FC4C02', marginBottom: 8 },
  statsCompletadoFrase: { fontSize: 14, color: '#FFFFFF', marginBottom: 16, fontStyle: 'italic' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  statItem: { backgroundColor: '#0D1B2A', borderRadius: 12, padding: 14, alignItems: 'center', minWidth: '45%', flex: 1 },
  statNumero: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  statLabel: { fontSize: 11, color: '#A8CFFF', textAlign: 'center' },
  mejorDiaBox: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 12 },
  mejorDiaTexto: { fontSize: 13, color: '#FC4C02', textAlign: 'center', fontWeight: 'bold' },
  ritmoCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 18, marginBottom: 16 },
  ritmoTitulo: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  ritmoKm: { fontSize: 22, fontWeight: 'bold', color: '#1E6FD9', marginBottom: 4 },
  ritmoPrediccion: { fontSize: 13, color: '#A8CFFF', marginBottom: 4 },
  ritmoRestante: { fontSize: 12, color: '#4a6a8a' },
  metaCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 18, marginBottom: 16 },
  metaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  metaTitulo: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' },
  metaEditarBtn: { color: '#1E6FD9', fontWeight: 'bold', fontSize: 13 },
  metaInputRow: { flexDirection: 'row', gap: 10 },
  metaInput: { flex: 1, backgroundColor: '#0D1B2A', borderRadius: 10, padding: 12, color: '#FFFFFF', fontSize: 14, borderWidth: 1, borderColor: '#2a4a6a' },
  metaGuardarBtn: { backgroundColor: '#FC4C02', borderRadius: 10, padding: 12, alignItems: 'center', justifyContent: 'center' },
  metaGuardarBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  metaFecha: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  metaDias: { fontSize: 13, color: '#FC4C02', fontWeight: 'bold', marginBottom: 4 },
  metaRitmo: { fontSize: 12, color: '#A8CFFF' },
  metaVacio: { fontSize: 13, color: '#4a6a8a', fontStyle: 'italic' },
  historialSection: { marginTop: 8 },
  historialTitulo: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 16 },
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 24, alignItems: 'center' },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyText: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  emptySubtext: { fontSize: 12, color: '#A8CFFF', textAlign: 'center' },
  timeline: { gap: 0 },
  timelineItem: { flexDirection: 'row', gap: 12 },
  timelineLeft: { alignItems: 'center', width: 40 },
  timelineDot: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E3A5F', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#2a4a6a' },
  timelineDotActivo: { borderColor: '#FC4C02' },
  timelineDotEmoji: { fontSize: 18 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#2a4a6a', marginVertical: 4 },
  timelineContent: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 14, padding: 14, marginBottom: 12 },
  timelineHito: { fontSize: 13, fontWeight: 'bold', color: '#FC4C02', marginBottom: 2 },
  timelineFecha: { fontSize: 11, color: '#4a6a8a', marginBottom: 8 },
  timelineActRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  timelineEmoji: { fontSize: 16 },
  timelineKm: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  timelineTipo: { fontSize: 11, color: '#A8CFFF' },
  timelineAcumulado: { fontSize: 11, color: '#4a6a8a', marginTop: 4 },
  backBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ritmoSesiones: { fontSize: 12, color: '#4a6a8a', marginBottom: 4 },
});