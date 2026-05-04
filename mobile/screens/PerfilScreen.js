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
      if (session?.user?.id) {
        setUserId(session.user.id);
      }
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

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        {usuario?.avatar_url ? (
          <Image source={{ uri: usuario.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarLetra}>
              {usuario?.name?.charAt(0) || 'K'}
            </Text>
          </View>
        )}
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
          <Text style={styles.statNumero}>{stats?.challenges_activos || 0}</Text>
          <Text style={styles.statLabel}>Retos activos</Text>
        </View>
      </View>

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>Medallas ganadas</Text>
        {stats?.medallas === 0 || !stats?.medallas ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Todavia no ganaste ninguna medalla</Text>
            <Text style={styles.emptySubtext}>Completa tu primer reto para ganar la tuya</Text>
          </View>
        ) : (
          <Text style={styles.medallaCount}>{stats?.medallas} medallas</Text>
        )}
      </View>

      <TouchableOpacity style={styles.stravaButton}>
        <Text style={styles.stravaButtonText}>Conectar con Strava</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cerrarButton} onPress={cerrarSesion}>
        <Text style={styles.cerrarButtonText}>Cerrar sesion</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60, alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  avatar: { width: 90, height: 90, borderRadius: 45, marginBottom: 12 },
  avatarPlaceholder: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#1E6FD9', alignItems: 'center',
    justifyContent: 'center', marginBottom: 12
  },
  avatarLetra: { fontSize: 36, fontWeight: 'bold', color: '#FFFFFF' },
  nombre: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  email: { fontSize: 13, color: '#A8CFFF' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24, width: '100%' },
  statCard: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 12, padding: 16, alignItems: 'center' },
  statNumero: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  statLabel: { fontSize: 11, color: '#A8CFFF', textAlign: 'center' },
  seccion: { width: '100%', marginBottom: 24 },
  seccionTitulo: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 12 },
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 12, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#FFFFFF', marginBottom: 4 },
  emptySubtext: { fontSize: 12, color: '#A8CFFF', textAlign: 'center' },
  medallaCount: { fontSize: 20, color: '#FC4C02', fontWeight: 'bold' },
  stravaButton: { backgroundColor: '#FC4C02', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 12 },
  stravaButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  cerrarButton: { borderWidth: 1, borderColor: '#555', paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center' },
  cerrarButtonText: { color: '#555', fontWeight: 'bold', fontSize: 15 },
});