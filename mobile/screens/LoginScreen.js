import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';

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
  const [verPassword, setVerPassword] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [verPasswordConfirm, setVerPasswordConfirm] = useState(false);
  const [biometriaDisponible, setBiometriaDisponible] = useState(false);
  const [savedPassword, setSavedPassword] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
    // Cargar email guardado
    AsyncStorage.getItem('ultimo_email').then(e => { if (e) setEmail(e); });
    // Verificar si biometría disponible y hay credenciales guardadas
    const checkBiometria = async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const pass = await AsyncStorage.getItem('saved_password');
      setBiometriaDisponible(compatible && enrolled && !!pass);
      if (pass) setSavedPassword(pass);
    };
    checkBiometria();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) { setMensaje('Completá todos los campos'); return; }
    setCargando(true); setMensaje('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await AsyncStorage.setItem('ultimo_email', email);
      await AsyncStorage.setItem('saved_password', password);
      setSavedPassword(password);
      setBiometriaDisponible(true);
      onLogin(data.user);
    } catch (error) {
      setMensaje('Email o contraseña incorrectos');
    } finally { setCargando(false); }
  };

  const handleRegistro = async () => {
    if (!email || !password || !nombre) { setMensaje('Completá todos los campos'); return; }
    if (password.length < 8) { setMensaje('La contraseña debe tener al menos 8 caracteres'); return; }
    if (!/[A-Z]/.test(password)) { setMensaje('La contraseña debe tener al menos una mayúscula'); return; }
    if (!/[0-9]/.test(password)) { setMensaje('La contraseña debe tener al menos un número'); return; }
    if (password !== passwordConfirm) { setMensaje('Las contraseñas no coinciden'); return; }
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
      await AsyncStorage.setItem('ultimo_email', email);
      onLogin(data.user);
    } catch (error) {
      setMensaje(error.message || 'Error al registrarse');
    } finally { setCargando(false); }
  };

  const handleReset = async () => {
    if (!email) { setMensaje('Ingresá tu email primero'); return; }
    setCargando(true); setMensaje('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'korva://reset-password',
      });
      if (error) throw error;
      setResetEnviado(true);
    } catch (error) {
      setMensaje('Error al enviar el email. Intentá de nuevo.');
    } finally { setCargando(false); }
  };

  const loginConBiometria = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Usá tu huella para entrar a Korva',
        cancelLabel: 'Cancelar',
        fallbackLabel: 'Usar contraseña',
      });
      if (result.success) {
        const savedEmail = await AsyncStorage.getItem('ultimo_email');
        const savedPass = await AsyncStorage.getItem('saved_password');
        if (!savedEmail || !savedPass) { setMensaje('No hay credenciales guardadas'); return; }
        setCargando(true);
        const { data, error } = await supabase.auth.signInWithPassword({ email: savedEmail, password: savedPass });
        if (error) throw error;
        onLogin(data.user);
      }
    } catch (e) {
      setMensaje('No se pudo autenticar con biometría');
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
            <View style={styles.btnRow}>
              <Text style={styles.buttonText}>Volver al login</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </View>
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
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#4a6a8a"
                  secureTextEntry={!verPassword}
                />
                <TouchableOpacity style={styles.ojito} onPress={() => setVerPassword(!verPassword)}>
                  <Text style={{ fontSize: 18 }}>{verPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
              {modo === 'registro' && password.length > 0 && (
                <View style={styles.verificadorBox}>
                  <Text style={[styles.verificadorItem, password.length >= 8 && styles.verificadorOk]}>
                    {password.length >= 8 ? '✅' : '❌'} 8 caracteres mínimo
                  </Text>
                  <Text style={[styles.verificadorItem, /[A-Z]/.test(password) && styles.verificadorOk]}>
                    {/[A-Z]/.test(password) ? '✅' : '❌'} Una mayúscula
                  </Text>
                  <Text style={[styles.verificadorItem, /[0-9]/.test(password) && styles.verificadorOk]}>
                    {/[0-9]/.test(password) ? '✅' : '❌'} Un número
                  </Text>
                </View>
              )}
            </View>

            {modo === 'registro' && (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>CONFIRMAR CONTRASEÑA</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]}
                    value={passwordConfirm}
                    onChangeText={setPasswordConfirm}
                    placeholder="••••••••"
                    placeholderTextColor="#4a6a8a"
                    secureTextEntry={!verPasswordConfirm}
                  />
                  <TouchableOpacity style={styles.ojito} onPress={() => setVerPasswordConfirm(!verPasswordConfirm)}>
                    <Text style={{ fontSize: 18 }}>{verPasswordConfirm ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
                {passwordConfirm.length > 0 && (
                  <Text style={[styles.verificadorItem, password === passwordConfirm ? styles.verificadorOk : styles.verificadorError, { marginTop: 6 }]}>
                    {password === passwordConfirm ? '✅ Las contraseñas coinciden' : '❌ Las contraseñas no coinciden'}
                  </Text>
                )}
              </View>
            )}

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
                <View style={styles.btnRow}>
                  <Text style={styles.buttonText}>
                    {modo === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {modo === 'login' && biometriaDisponible && (
              <TouchableOpacity style={styles.biometriaBtn} onPress={loginConBiometria}>
                <Text style={styles.biometriaBtnText}>🔑 Entrar con huella / Face ID</Text>
              </TouchableOpacity>
            )}

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
                <View style={styles.btnRow}>
                  <Text style={styles.buttonText}>Enviar link</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setResetMode(false)} style={styles.olvideBtnContainer}>
              <View style={styles.btnRowBack}>
                <Ionicons name="arrow-back" size={14} color="#4a6a8a" />
                <Text style={styles.olvideBtnText}>Volver al login</Text>
              </View>
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
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  ojito: { backgroundColor: '#0D1B2A', padding: 14, borderTopRightRadius: 12, borderBottomRightRadius: 12, borderWidth: 1, borderColor: '#2a4a6a', borderLeftWidth: 0 },
  mensajeBox: { backgroundColor: '#2a1a1a', borderRadius: 10, padding: 12, marginBottom: 12 },
  mensaje: { color: '#FC4C02', fontSize: 13, textAlign: 'center' },
  button: { backgroundColor: '#FC4C02', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 4, marginBottom: 16 },
  buttonDisabled: { backgroundColor: '#2a3a4a' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnRowBack: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  verificadorBox: { marginTop: 8, gap: 4 },
  verificadorItem: { fontSize: 12, color: '#4a6a8a' },
  verificadorOk: { color: '#4CAF50' },
  verificadorError: { color: '#FC4C02' },
  biometriaBtn: { backgroundColor: '#1E3A5F', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#1E6FD9' },
  biometriaBtnText: { color: '#A8CFFF', fontWeight: 'bold', fontSize: 14 },
});