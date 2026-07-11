import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useState } from 'react';
import { supabase } from '../supabase';
import { Ionicons } from '@expo/vector-icons';

export default function ResetPasswordScreen({ onVolver }) {
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [listo, setListo] = useState(false);

  const handleReset = async () => {
    if (!password || !confirmar) { setMensaje('Completá todos los campos'); return; }
    if (password.length < 8) { setMensaje('La contraseña debe tener al menos 8 caracteres'); return; }
    if (!/[A-Z]/.test(password)) { setMensaje('La contraseña debe tener al menos una mayúscula'); return; }
    if (!/[0-9]/.test(password)) { setMensaje('La contraseña debe tener al menos un número'); return; }
    if (password !== confirmar) { setMensaje('Las contraseñas no coinciden'); return; }
    setCargando(true); setMensaje('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setListo(true);
    } catch (error) {
      setMensaje('Error al actualizar la contraseña. Intentá de nuevo.');
    } finally { setCargando(false); }
  };

  if (listo) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.emoji}>✅</Text>
          <Text style={styles.titulo}>¡Contraseña actualizada!</Text>
          <Text style={styles.subtitulo}>Ya podés iniciar sesión con tu nueva contraseña.</Text>
          <TouchableOpacity style={styles.button} onPress={onVolver}>
            <View style={styles.btnRow}>
              <Text style={styles.buttonText}>Ir al login</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🔑</Text>
        <Text style={styles.titulo}>Nueva contraseña</Text>
        <Text style={styles.subtitulo}>Ingresá tu nueva contraseña para continuar.</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>NUEVA CONTRASEÑA</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#4a6a8a"
            secureTextEntry
          />
          {password.length > 0 && (
            <View style={{ marginTop: 8, gap: 4 }}>
              <Text style={{ fontSize: 12, color: password.length >= 8 ? '#4CAF50' : '#4a6a8a' }}>
                {password.length >= 8 ? '✅' : '❌'} 8 caracteres mínimo
              </Text>
              <Text style={{ fontSize: 12, color: /[A-Z]/.test(password) ? '#4CAF50' : '#4a6a8a' }}>
                {/[A-Z]/.test(password) ? '✅' : '❌'} Una mayúscula
              </Text>
              <Text style={{ fontSize: 12, color: /[0-9]/.test(password) ? '#4CAF50' : '#4a6a8a' }}>
                {/[0-9]/.test(password) ? '✅' : '❌'} Un número
              </Text>
            </View>
          )}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>CONFIRMAR CONTRASEÑA</Text>
          <TextInput
            style={styles.input}
            value={confirmar}
            onChangeText={setConfirmar}
            placeholder="••••••••"
            placeholderTextColor="#4a6a8a"
            secureTextEntry
          />
        </View>

        {mensaje ? (
          <View style={styles.mensajeBox}>
            <Text style={styles.mensaje}>⚠️ {mensaje}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.button, cargando && styles.buttonDisabled]}
          onPress={handleReset}
          disabled={cargando}
        >
          {cargando ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.btnRow}>
              <Text style={styles.buttonText}>Guardar contraseña</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={onVolver} style={styles.volverContainer}>
          <View style={styles.btnRowBack}>
            <Ionicons name="arrow-back" size={14} color="#4a6a8a" />
            <Text style={styles.volverText}>Volver al login</Text>
          </View>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B2A', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#1E3A5F', borderRadius: 24, padding: 28, alignItems: 'center' },
  emoji: { fontSize: 48, marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' },
  subtitulo: { fontSize: 14, color: '#A8CFFF', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  inputContainer: { marginBottom: 16, width: '100%' },
  inputLabel: { fontSize: 10, fontWeight: 'bold', color: '#4a6a8a', letterSpacing: 2, marginBottom: 6 },
  input: { backgroundColor: '#0D1B2A', borderRadius: 12, padding: 14, color: '#FFFFFF', fontSize: 15, borderWidth: 1, borderColor: '#2a4a6a' },
  mensajeBox: { backgroundColor: '#2a1a1a', borderRadius: 10, padding: 12, marginBottom: 12, width: '100%' },
  mensaje: { color: '#FC4C02', fontSize: 13, textAlign: 'center' },
  button: { backgroundColor: '#FC4C02', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 4, marginBottom: 16, width: '100%' },
  buttonDisabled: { backgroundColor: '#2a3a4a' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnRowBack: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  volverContainer: { alignItems: 'center' },
  volverText: { color: '#4a6a8a', fontSize: 13 },
});