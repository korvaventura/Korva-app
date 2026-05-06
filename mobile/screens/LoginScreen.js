import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

export default function LoginScreen({ onLogin }) {
  const [modo, setModo] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) { setMensaje('Completá todos los campos'); return; }
    setCargando(true); setMensaje('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onLogin(data.user);
    } catch (error) {
      setMensaje('Email o contraseña incorrectos');
    } finally { setCargando(false); }
  };

  const handleRegistro = async () => {
    if (!email || !password || !nombre) { setMensaje('Completá todos los campos'); return; }
    if (password.length < 6) { setMensaje('La contraseña debe tener al menos 6 caracteres'); return; }
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

  const handleReset = async () => {
    if (!email) { setMensaje('Ingresá tu email primero'); return; }
    setCargando(true); setMensaje('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setResetEnviado(true);
    } catch (error) {
      setMensaje('Error al enviar el email. Intentá de nuevo.');
    } finally { setCargando(false); }
  };

  const cambiarModo = (nuevoModo) => {
    setModo(nuevoModo);
    setMensaje('');
    setResetMode(false);
    setResetEnviado(false);
  };

  if (resetEnviado) {
    return (
      <View style={styles.container}>
        <View style={styles.resetCard}>
          <Text style={styles.resetEmoji}>📧</Text>
          <Text style={styles.resetTitulo}>Email enviado</Text>
          <Text style={styles.resetTexto}>Revisá tu bandeja de entrada y seguí las instrucciones para restablecer tu contraseña.</Text>
          <TouchableOpacity style={styles.button} onPress={() => { setResetMode(false); setResetEnviado(false); }}>
            <Text style={styles.buttonText}>Volver al login →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>

      <Animated.View style={[styles.hero, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <Text style={styles.medallaEmoji}>🏅</Text>
        <Text style={styles.logo}>KORVA</Text>
        <Text style={styles.tagline}>Desafíos virtuales.</Text>
        <Text style={styles.taglineBold}>Medallas reales.</Text>
      </Animated.View>

      <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

        {!resetMode ? (
          <>
            <View style={styles.modoRow}>
              <TouchableOpacity
                style={[styles.modoBtn, modo === 'login' && styles.modoBtnActivo]}
                onPress={() => cambiarModo('login')}
              >
                <Text style={[styles.modoBtnText, modo === 'login' && styles.modoBtnTextActivo]}>
                  Iniciar sesión
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modoBtn, modo === 'registro' && styles.modoBtnActivo]}
                onPress={() => cambiarModo('registro')}
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
                  autoCapitalize="words"
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
              <Text style={styles.inputLabel}>CONTRASEÑA</Text>
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
                  {modo === 'login' ? 'Iniciar sesión →' : 'Crear cuenta →'}
                </Text>
              )}
            </TouchableOpacity>

            {modo === 'login' && (
              <TouchableOpacity onPress={() => setResetMode(true)} style={styles.olvideBtnContainer}>
                <Text style={styles.olvideBtnText}>¿Olvidaste tu contraseña?</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => cambiarModo(modo === 'login' ? 'registro' : 'login')}>
              <Text style={styles.switchText}>
                {modo === 'login'
                  ? <>¿No tenés cuenta? <Text style={styles.switchLink}>Registrate</Text></>
                  : <>¿Ya tenés cuenta? <Text style={styles.switchLink}>Iniciá sesión</Text></>
                }
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.resetTituloForm}>🔑 Restablecer contraseña</Text>
            <Text style={styles.resetSubtitulo}>Te enviamos un link a tu email para que puedas crear una nueva contraseña.</Text>

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
                <Text style={styles.buttonText}>Enviar link →</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setResetMode(false)} style={styles.olvideBtnContainer}>
              <Text style={styles.olvideBtnText}>← Volver al login</Text>
            </TouchableOpacity>
          </>
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B2A', justifyContent: 'center', padding: 24 },
  hero: { alignItems: 'center', marginBottom: 32 },
  medallaEmoji: { fontSize: 64, marginBottom: 10 },
  logo: { fontSize: 46, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 6, marginBottom: 10 },
  tagline: { fontSize: 16, color: '#A8CFFF', marginBottom: 2 },
  taglineBold: { fontSize: 18, fontWeight: 'bold', color: '#FC4C02' },
  card: { backgroundColor: '#1E3A5F', borderRadius: 24, padding: 28 },
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
  button: { backgroundColor: '#FC4C02', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 4, marginBottom: 16 },
  buttonDisabled: { backgroundColor: '#2a3a4a' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  olvideBtnContainer: { alignItems: 'center', marginBottom: 12 },
  olvideBtnText: { color: '#4a6a8a', fontSize: 13 },
  switchText: { color: '#4a6a8a', fontSize: 13, textAlign: 'center' },
  switchLink: { color: '#1E6FD9', fontWeight: 'bold' },
  resetTituloForm: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  resetSubtitulo: { fontSize: 13, color: '#A8CFFF', lineHeight: 20, marginBottom: 20 },
  resetCard: { backgroundColor: '#1E3A5F', borderRadius: 24, padding: 40, margin: 24, alignItems: 'center' },
  resetEmoji: { fontSize: 48, marginBottom: 16 },
  resetTitulo: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 12 },
  resetTexto: { fontSize: 14, color: '#A8CFFF', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
});