import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, TextInput, Alert, ActivityIndicator, Linking } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

export default function PerfilScreen() {
  const [usuario, setUsuario] = useState(null);
  const [stats, setStats] = useState(null);
  const [userId, setUserId] = useState(null);
  const [nivel, setNivel] = useState(null);
  const [insignias, setInsignias] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [editandoDireccion, setEditandoDireccion] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [formDireccion, setFormDireccion] = useState({
    nombre: '',
    direccion: '',
    ciudad: '',
    codigo_postal: '',
    pais: '',
    telefono: '',
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setUserId(session.user.id);
    });
  }, []);

  useEffect(() => {
    if (userId) {
      cargarPerfil();
      cargarActividades();
    }
  }, [userId]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('strava-connected')) cargarPerfil();
    });
    return () => subscription.remove();
  }, []);

  const cargarPerfil = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/perfil/${userId}`);
      const data = await res.json();
      setUsuario(data.usuario);
      setStats(data.stats);
      setNivel(data.nivel);
      setInsignias(data.insignias || []);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const cargarActividades = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/actividades/${userId}`);
      const data = await res.json();
      setActividades(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error cargando actividades:', error);
    }
  };

  const abrirEdicion = () => {
    const d = usuario?.shipping_address;
    setFormDireccion({
      nombre: d?.nombre || '',
      direccion: d?.direccion || '',
      ciudad: d?.ciudad || '',
      codigo_postal: d?.codigo_postal || '',
      pais: d?.pais || '',
      telefono: d?.telefono || '',
    });
    setEditandoDireccion(true);
  };

  const guardarDireccion = async () => {
    const { nombre, direccion, ciudad, pais } = formDireccion;
    if (!nombre || !direccion || !ciudad || !pais) {
      Alert.alert('Faltan datos', 'Por favor completá nombre, dirección, ciudad y país.');
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`${BACKEND_URL}/usuarios/direccion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, shipping_address: formDireccion }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.detalle);
      setUsuario(prev => ({ ...prev, shipping_address: formDireccion }));
      setEditandoDireccion(false);
      Alert.alert('✅ Dirección guardada', 'Tu dirección de envío fue actualizada.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar la dirección. Intentá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const conectarStrava = async () => {
    await Linking.openURL(`${BACKEND_URL}/strava/auth`);
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return '';
    return new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const deporteEmoji = (tipo) => {
    if (tipo === 'run') return '🏃';
    if (tipo === 'ride') return '🚴';
    return '🏅';
  };

  const stravaConectado = !!usuario?.strava_token;
  const direccion = usuario?.shipping_address;
  const inicial = usuario?.name?.charAt(0)?.toUpperCase() || 'K';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      <View style={styles.heroBg}>
        <View style={styles.avatarWrapper}>
          {usuario?.avatar_url ? (
            <Image source={{ uri: usuario.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarLetra}>{inicial}</Text>
            </View>
          )}
        </View>
        <Text style={styles.nombre}>{usuario?.name || 'Cargando...'}</Text>
        <Text style={styles.email}>{usuario?.email}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumero}>{stats?.total_actividades || 0}</Text>
          <Text style={styles.statLabel}>Actividades</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumero}>{stats?.total_km || 0}</Text>
          <Text style={styles.statLabel}>km totales</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumero}>{stats?.medallas || 0}</Text>
          <Text style={styles.statLabel}>Medallas</Text>
        </View>
      </View>

      {nivel && (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>⚡ Tu nivel</Text>
          <View style={styles.nivelCard}>
            <Text style={styles.nivelEmoji}>{nivel.emoji}</Text>
            <View style={styles.nivelInfo}>
              <Text style={styles.nivelNombre}>{nivel.nombre}</Text>
              {nivel.siguiente ? (
                <Text style={styles.nivelSiguiente}>Proximo nivel: {nivel.siguiente} retos completados</Text>
              ) : (
                <Text style={styles.nivelSiguiente}>Nivel maximo alcanzado 🔥</Text>
              )}
            </View>
          </View>
        </View>
      )}

      {insignias.length > 0 && (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>🎖️ Insignias</Text>
          <View style={styles.insigniasGrid}>
            {insignias.map((ins, i) => (
              <View key={i} style={styles.insigniaCard}>
                <Text style={styles.insigniaEmoji}>{ins.emoji}</Text>
                <Text style={styles.insigniaNombre}>{ins.nombre}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Historial de actividades */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>📋 Actividades recientes</Text>
        {actividades.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🏁</Text>
            <Text style={styles.emptyText}>Sin actividades todavia</Text>
            <Text style={styles.emptySubtext}>Conectá Strava o registrá tus km manualmente</Text>
          </View>
        ) : (
          actividades.map((act, i) => (
            <View key={i} style={styles.actividadRow}>
              <Text style={styles.actividadEmoji}>{deporteEmoji(act.sport_type)}</Text>
              <View style={styles.actividadInfo}>
                <Text style={styles.actividadFecha}>{formatearFecha(act.recorded_at)}</Text>
                <Text style={styles.actividadTipo}>
                  {act.sport_type === 'run' ? 'Running' : act.sport_type === 'ride' ? 'Ciclismo' : act.sport_type}
                  {act.source === 'manual' ? ' · manual' : ' · Strava'}
                </Text>
              </View>
              <Text style={styles.actividadKm}>{parseFloat(act.distance_km).toFixed(1)} km</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>📦 Direccion de envio</Text>

        {editandoDireccion ? (
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Nombre completo *</Text>
            <TextInput
              style={styles.input}
              value={formDireccion.nombre}
              onChangeText={v => setFormDireccion(p => ({ ...p, nombre: v }))}
              placeholder="Juan Pérez"
              placeholderTextColor="#4a6a8a"
            />
            <Text style={styles.formLabel}>Dirección *</Text>
            <TextInput
              style={styles.input}
              value={formDireccion.direccion}
              onChangeText={v => setFormDireccion(p => ({ ...p, direccion: v }))}
              placeholder="Calle 123, Piso 4"
              placeholderTextColor="#4a6a8a"
            />
            <Text style={styles.formLabel}>Ciudad *</Text>
            <TextInput
              style={styles.input}
              value={formDireccion.ciudad}
              onChangeText={v => setFormDireccion(p => ({ ...p, ciudad: v }))}
              placeholder="Buenos Aires"
              placeholderTextColor="#4a6a8a"
            />
            <Text style={styles.formLabel}>Código postal</Text>
            <TextInput
              style={styles.input}
              value={formDireccion.codigo_postal}
              onChangeText={v => setFormDireccion(p => ({ ...p, codigo_postal: v }))}
              placeholder="1425"
              placeholderTextColor="#4a6a8a"
              keyboardType="numeric"
            />
            <Text style={styles.formLabel}>País *</Text>
            <TextInput
              style={styles.input}
              value={formDireccion.pais}
              onChangeText={v => setFormDireccion(p => ({ ...p, pais: v }))}
              placeholder="Argentina"
              placeholderTextColor="#4a6a8a"
            />
            <Text style={styles.formLabel}>Teléfono (con código de país)</Text>
            <TextInput
              style={styles.input}
              value={formDireccion.telefono}
              onChangeText={v => setFormDireccion(p => ({ ...p, telefono: v }))}
              placeholder="+54 11 1234 5678"
              placeholderTextColor="#4a6a8a"
              keyboardType="phone-pad"
            />
            <View style={styles.formBotones}>
              <TouchableOpacity
                style={styles.cancelarBtn}
                onPress={() => setEditandoDireccion(false)}
                disabled={guardando}
              >
                <Text style={styles.cancelarBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.guardarBtn}
                onPress={guardarDireccion}
                disabled={guardando}
              >
                {guardando
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text style={styles.guardarBtnText}>Guardar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        ) : direccion ? (
          <View style={styles.direccionCard}>
            <Text style={styles.direccionNombre}>{direccion.nombre}</Text>
            <Text style={styles.direccionLinea}>🏠 {direccion.direccion}</Text>
            <Text style={styles.direccionLinea}>🏙️ {direccion.ciudad}, {direccion.codigo_postal}</Text>
            <Text style={styles.direccionLinea}>🌍 {direccion.pais}</Text>
            {direccion.telefono && <Text style={styles.direccionTel}>📞 {direccion.telefono}</Text>}
            <TouchableOpacity style={styles.editarBtn} onPress={abrirEdicion}>
              <Text style={styles.editarBtnText}>Editar direccion</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📍</Text>
            <Text style={styles.emptyText}>Sin direccion guardada</Text>
            <Text style={styles.emptySubtext}>Se pedira al completar tu primer reto</Text>
            <TouchableOpacity style={[styles.editarBtn, { marginTop: 16 }]} onPress={abrirEdicion}>
              <Text style={styles.editarBtnText}>Agregar direccion</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {stravaConectado ? (
        <View style={styles.stravaConectadoCard}>
          <Text style={styles.stravaConectadoText}>✅ Strava conectado</Text>
          <TouchableOpacity onPress={conectarStrava}>
            <Text style={styles.stravaReconectarText}>Reconectar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.stravaButton} onPress={conectarStrava}>
          <Text style={styles.stravaButtonText}>🔗 Conectar con Strava</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.cerrarButton} onPress={cerrarSesion}>
        <Text style={styles.cerrarButtonText}>Cerrar sesion</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { paddingBottom: 40, alignItems: 'center' },
  heroBg: { width: '100%', backgroundColor: '#1E3A5F', alignItems: 'center', paddingTop: 60, paddingBottom: 28, marginBottom: 24 },
  avatarWrapper: { marginBottom: 12 },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#1E6FD9' },
  avatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#1E6FD9', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FC4C02' },
  avatarLetra: { fontSize: 36, fontWeight: 'bold', color: '#FFFFFF' },
  nombre: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  email: { fontSize: 13, color: '#A8CFFF' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24, width: '100%', paddingHorizontal: 24 },
  statCard: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 14, padding: 14, alignItems: 'center' },
  statNumero: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  statLabel: { fontSize: 10, color: '#A8CFFF', textAlign: 'center', letterSpacing: 0.5 },
  seccion: { width: '100%', paddingHorizontal: 24, marginBottom: 20 },
  seccionTitulo: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 12 },
  nivelCard: { backgroundColor: '#1E3A5F', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  nivelEmoji: { fontSize: 36 },
  nivelInfo: { flex: 1 },
  nivelNombre: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  nivelSiguiente: { fontSize: 12, color: '#A8CFFF' },
  insigniasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  insigniaCard: { backgroundColor: '#1E3A5F', borderRadius: 12, padding: 14, alignItems: 'center', minWidth: 90 },
  insigniaEmoji: { fontSize: 28, marginBottom: 6 },
  insigniaNombre: { fontSize: 11, color: '#A8CFFF', textAlign: 'center' },
  actividadRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E3A5F', borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  actividadEmoji: { fontSize: 22 },
  actividadInfo: { flex: 1 },
  actividadFecha: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  actividadTipo: { fontSize: 11, color: '#A8CFFF' },
  actividadKm: { fontSize: 16, fontWeight: 'bold', color: '#1E6FD9' },
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 24, alignItems: 'center' },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyText: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  emptySubtext: { fontSize: 12, color: '#A8CFFF', textAlign: 'center' },
  direccionCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 20 },
  direccionNombre: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 10 },
  direccionLinea: { fontSize: 13, color: '#A8CFFF', marginBottom: 5 },
  direccionTel: { fontSize: 13, color: '#1E6FD9', marginTop: 4, marginBottom: 4 },
  editarBtn: { marginTop: 14, borderWidth: 1, borderColor: '#1E6FD9', borderRadius: 10, padding: 10, alignItems: 'center' },
  editarBtnText: { color: '#1E6FD9', fontSize: 13, fontWeight: 'bold' },
  formCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 20 },
  formLabel: { fontSize: 12, color: '#A8CFFF', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#0D1B2A', borderRadius: 10, borderWidth: 1, borderColor: '#2a3a4a', color: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  formBotones: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelarBtn: { flex: 1, borderWidth: 1, borderColor: '#2a3a4a', borderRadius: 10, padding: 12, alignItems: 'center' },
  cancelarBtnText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 14 },
  guardarBtn: { flex: 1, backgroundColor: '#1E6FD9', borderRadius: 10, padding: 12, alignItems: 'center' },
  guardarBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  stravaButton: { backgroundColor: '#FC4C02', paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 12, paddingHorizontal: 24 },
  stravaButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  stravaConectadoCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E3A5F', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, width: '100%', marginBottom: 12 },
  stravaConectadoText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  stravaReconectarText: { color: '#A8CFFF', fontSize: 13 },
  cerrarButton: { borderWidth: 1, borderColor: '#2a3a4a', paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center', paddingHorizontal: 24 },
  cerrarButtonText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 15 },
});