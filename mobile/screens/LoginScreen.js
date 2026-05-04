import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useState } from 'react';
import { supabase } from '../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

export default function LoginScreen({ onLogin }) {
  const [modo, setModo] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const handleLogin = async () => {
    if (!email || !password) { setMensaje('Completa todos los campos'); return; }
    setCargando(true); setMensaje('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onLogin(data.user);
    } catch (error) {
      setMensaje('Email o contrasena incorrectos');
    } finally { setCargando(false); }
  };

  const handleRegistro = async () => {
    if (!email || !password || !nombre) { setMensaje('Completa todos los campos'); return; }
    setCargando(true); setMensaje('');
    try {
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { name: nombre } }
      });
      if (error) throw error;
      await fetch(`${BACKEND_URL}/usuarios/perfil`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: data.user.id, email, name: nombre })
      });
      onLogin(data.user);
    } catch (error) {
      setMensaje(error.message || 'Error al registrarse');
    } finally { setCargando(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.medallaEmoji}>🏅</Text>
        <Text style={styles.logo}>KORVA</Text>
        <Text style={styles.tagline}>Desafios virtuales.</Text>
        <Text style={styles.taglineBold}>Medallas reales.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.modoRow}>
          <TouchableOpacity
            style={[styles.modoBtn, modo === 'login' && styles.modoBtnActivo]}
            onPress={() => { setModo('login'); setMensaje(''); }}
          >
            <Text style={[styles.modoBtnText, modo === 'login' && styles.modoBtnTextActivo]}>
              Iniciar sesion
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modoBtn, modo === 'registro' && styles.modoBtnActivo]}
            onPress={() => { setModo('registro'); setMensaje(''); }}
          >
            <Text style={[styles.modoBtnText, modo === 'registro' && styles.modoBtnTextActivo]}>
              Registrarse
            </Text>
          </TouchableOpacity>
        </View>

        {modo === 'registro' && (
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>NOMBRE COMPLETO</Text>
            <TextInput
              style={styles.input}
              value={nombre}
              onChangeText={setNombre}
              placeholder="Tu nombre"
              placeholderTextColor="#4a6a8a"
            />
          </View>
        )}

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>EMAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="tu@email.com"
            placeholderTextColor="#4a6a8a"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>CONTRASENA</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
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
          onPress={modo === 'login' ? handleLogin : handleRegistro}
          disabled={cargando}
        >
          {cargando ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>
              {modo === 'login' ? 'Iniciar sesion →' : 'Crear cuenta →'}
            </Text>
          )}
        </TouchableOpacity>

        {modo === 'login' && (
          <TouchableOpacity onPress={() => { setModo('registro'); setMensaje(''); }}>
            <Text style={styles.switchText}>No tenes cuenta? <Text style={styles.switchLink}>Registrate</Text></Text>
          </TouchableOpacity>
        )}
        {modo === 'registro' && (
          <TouchableOpacity onPress={() => { setModo('login'); setMensaje(''); }}>
            <Text style={styles.switchText}>Ya tenes cuenta? <Text style={styles.switchLink}>Inicia sesion</Text></Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B2A', justifyContent: 'center', padding: 24 },
  hero: { alignItems: 'center', marginBottom: 32 },
  medallaEmoji: { fontSize: 56, marginBottom: 8 },
  logo: { fontSize: 42, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 4, marginBottom: 8 },
  tagline: { fontSize: 16, color: '#A8CFFF' },
  taglineBold: { fontSize: 16, fontWeight: 'bold', color: '#FC4C02' },
  card: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 28 },
  modoRow: { flexDirection: 'row', marginBottom: 24, backgroundColor: '#0D1B2A', borderRadius: 12, padding: 4 },
  modoBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  modoBtnActivo: { backgroundColor: '#1E6FD9' },
  modoBtnText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 14 },
  modoBtnTextActivo: { color: '#FFFFFF' },
  inputContainer: { marginBottom: 16 },
  inputLabel: { fontSize: 10, fontWeight: 'bold', color: '#4a6a8a', letterSpacing: 2, marginBottom: 6 },
  input: { backgroundColor: '#0D1B2A', borderRadius: 12, padding: 14, color: '#FFFFFF', fontSize: 15, borderWidth: 1, borderColor: '#2a4a6a' },
  mensajeBox: { backgroundColor: '#2a1a1a', borderRadius: 10, padding: 12, marginBottom: 12 },
  mensaje: { color: '#FC4C02', fontSize: 13, textAlign: 'center' },
  button: { backgroundColor: '#1E6FD9', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 4, marginBottom: 16 },
  buttonDisabled: { backgroundColor: '#2a3a4a' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  switchText: { color: '#4a6a8a', fontSize: 13, textAlign: 'center' },
  switchLink: { color: '#1E6FD9', fontWeight: 'bold' },
});