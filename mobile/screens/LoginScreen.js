import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
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
    if (!email || !password) {
      setMensaje('Completa todos los campos');
      return;
    }
    setCargando(true);
    setMensaje('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onLogin(data.user);
    } catch (error) {
      setMensaje('Email o contrasena incorrectos');
    } finally {
      setCargando(false);
    }
  };

  const handleRegistro = async () => {
    if (!email || !password || !nombre) {
      setMensaje('Completa todos los campos');
      return;
    }
    setCargando(true);
    setMensaje('');
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: nombre } }
      });
      if (error) throw error;

      // Crear perfil en la tabla users
      await fetch(`${BACKEND_URL}/usuarios/perfil`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: data.user.id,
          email: email,
          name: nombre
        })
      });

      setMensaje('');
      onLogin(data.user);

    } catch (error) {
      setMensaje(error.message || 'Error al registrarse');
    } finally {
      setCargando(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🏅 KORVA</Text>
      <Text style={styles.tagline}>Desafios virtuales. Medallas reales.</Text>

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
          <TextInput
            style={styles.input}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Tu nombre completo"
            placeholderTextColor="#A8CFFF"
          />
        )}

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#A8CFFF"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Contrasena"
          placeholderTextColor="#A8CFFF"
          secureTextEntry
        />

        {mensaje ? (
          <Text style={styles.mensaje}>{mensaje}</Text>
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
              {modo === 'login' ? 'Iniciar sesion' : 'Crear cuenta'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B2A', alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { fontSize: 36, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  tagline: { fontSize: 14, color: '#A8CFFF', marginBottom: 40 },
  card: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 24, width: '100%' },
  modoRow: { flexDirection: 'row', marginBottom: 20, backgroundColor: '#0D1B2A', borderRadius: 10, padding: 4 },
  modoBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  modoBtnActivo: { backgroundColor: '#1E6FD9' },
  modoBtnText: { color: '#A8CFFF', fontWeight: 'bold', fontSize: 14 },
  modoBtnTextActivo: { color: '#FFFFFF' },
  input: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 14, color: '#FFFFFF', fontSize: 15, borderWidth: 1, borderColor: '#1E6FD9', marginBottom: 12 },
  mensaje: { color: '#FC4C02', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  button: { backgroundColor: '#1E6FD9', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { backgroundColor: '#555' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
});