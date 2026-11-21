import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { estadoGarmin, iniciarGarmin, GARMIN_RETURN_URL } from '../services/garminApi';

export default function GarminConnection() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const requesting = useRef(false);
  useFocusEffect(useCallback(() => {
    let mounted = true;
    const refresh = () => estadoGarmin().then((data) => { if (mounted) setStatus(data); }).catch(() => {});
    refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { mounted = false; subscription.remove(); };
  }, []));

  async function connect() {
    if (requesting.current) return;
    requesting.current = true;
    setBusy(true);
    try {
      const { authorization_url: url } = await iniciarGarmin();
      const parsed = new URL(url);
      if (parsed.origin !== 'https://korva-app-production.up.railway.app' || parsed.pathname !== '/garmin/authorize') {
        throw new Error('No pudimos abrir la autorización de Garmin.');
      }
      const result = await WebBrowser.openAuthSessionAsync(url, GARMIN_RETURN_URL);
      // The authenticated status is authoritative; a deep link alone cannot mark a connection as successful.
      const current = await estadoGarmin();
      setStatus(current);
      if (current.connected) {
        Alert.alert('Garmin conectado', 'Tu cuenta quedó vinculada. La sincronización de actividades estará disponible más adelante.');
      } else if (result.type === 'success') {
        const outcome = new URL(result.url).searchParams.get('result');
        if (outcome !== 'cancelled') Alert.alert('Conectar Garmin', outcome === 'permission_required'
          ? 'Autorizá compartir tus actividades en Garmin para conectar la cuenta.'
          : 'No pudimos completar la conexión. Intentá nuevamente.');
      }
    } catch (error) {
      Alert.alert('Conectar Garmin', error.message || 'Intentá nuevamente.');
    } finally {
      requesting.current = false;
      setBusy(false);
    }
  }

  if (!status?.available) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Garmin</Text>
      <Text style={styles.description}>{status.connected
        ? 'Cuenta conectada. La sincronización de actividades estará disponible más adelante.'
        : 'Vinculá tu cuenta Garmin.'}</Text>
      {status.connected ? <Text style={styles.connected}>Conectado</Text> : (
        <TouchableOpacity style={styles.button} onPress={connect} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Conectar Garmin</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 24, marginVertical: 12, padding: 18, borderRadius: 16, backgroundColor: '#14283B' },
  title: { color: '#FFFFFF', fontWeight: '700', fontSize: 18 },
  description: { color: '#A8B8C8', marginTop: 8, lineHeight: 20 },
  connected: { color: '#FFFFFF', marginTop: 12, fontWeight: '600' },
  button: { backgroundColor: '#FC4C02', borderRadius: 12, padding: 12, marginTop: 12, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
