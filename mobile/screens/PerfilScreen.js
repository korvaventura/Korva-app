import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

export default function PerfilScreen() {
  const [usuario, setUsuario] = useState(null);
  const [stats, setStats] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setUserId(session.user.id);
    });
  }, []);

  useEffect(() => {
    if (userId) cargarPerfil();
  }, [userId]);

  const cargarPerfil = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/perfil/${userId}`);
      const data = await res.json();
      setUsuario(data.usuario);
      setStats(data.stats);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
  };

  const direccion = usuario?.shipping_address;
  const inicial = usuario?.name?.charAt(0)?.toUpperCase() || 'K';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      {/* Header */}
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

      {/* Stats */}
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
          <Text style={styles.statNumero}>{stats?.challenges_activos || 0}</Text>
          <Text style={styles.statLabel}>Retos activos</Text>
        </View>
      </View>

      {/* Medallas */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>🏅 Medallas ganadas</Text>
        {!stats?.medallas ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyText}>Todavia sin medallas</Text>
            <Text style={styles.emptySubtext}>Completa tu primer reto para ganar la tuya</Text>
          </View>
        ) : (
          <View style={styles.medallaCard}>
            <Text style={styles.medallaNumero}>{stats.medallas}</Text>
            <Text style={styles.medallaLabel}>{stats.medallas === 1 ? 'medalla ganada' : 'medallas ganadas'}</Text>
          </View>
        )}
      </View>

      {/* Direccion */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>📦 Direccion de envio</Text>
        {direccion ? (
          <View style={styles.direccionCard}>
            <Text style={styles.direccionNombre}>{direccion.nombre}</Text>
            <Text style={styles.direccionLinea}>🏠 {direccion.direccion}</Text>
            <Text style={styles.direccionLinea}>🏙️ {direccion.ciudad}, {direccion.codigo_postal}</Text>
            <Text style={styles.direccionLinea}>🌍 {direccion.pais}</Text>
            {direccion.telefono && <Text style={styles.direccionTel}>📞 {direccion.telefono}</Text>}
            <TouchableOpacity style={styles.editarBtn} onPress={() => alert('Proximamente!')}>
              <Text style={styles.editarBtnText}>Editar direccion</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📍</Text>
            <Text style={styles.emptyText}>Sin direccion guardada</Text>
            <Text style={styles.emptySubtext}>Se pedira al completar tu primer reto</Text>
          </View>
        )}
      </View>

      {/* Botones */}
      <TouchableOpacity style={styles.stravaButton}>
        <Text style={styles.stravaButtonText}>🔗 Conectar con Strava</Text>
      </TouchableOpacity>

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
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 24, alignItems: 'center' },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyText: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  emptySubtext: { fontSize: 12, color: '#A8CFFF', textAlign: 'center' },
  medallaCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#FC4C02' },
  medallaNumero: { fontSize: 48, fontWeight: 'bold', color: '#FC4C02', marginBottom: 4 },
  medallaLabel: { fontSize: 14, color: '#A8CFFF' },
  direccionCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 20 },
  direccionNombre: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 10 },
  direccionLinea: { fontSize: 13, color: '#A8CFFF', marginBottom: 5 },
  direccionTel: { fontSize: 13, color: '#1E6FD9', marginTop: 4, marginBottom: 4 },
  editarBtn: { marginTop: 14, borderWidth: 1, borderColor: '#1E6FD9', borderRadius: 10, padding: 10, alignItems: 'center' },
  editarBtnText: { color: '#1E6FD9', fontSize: 13, fontWeight: 'bold' },
  stravaButton: { backgroundColor: '#FC4C02', paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 12, marginHorizontal: 24, paddingHorizontal: 24 },
  stravaButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  cerrarButton: { borderWidth: 1, borderColor: '#2a3a4a', paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center', paddingHorizontal: 24 },
  cerrarButtonText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 15 },
});