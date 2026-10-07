import { SafeAreaView } from 'react-native-safe-area-context';
import TerminosScreen from './TerminosScreen';
import { colors } from '../theme/korvaTheme';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Animated, ScrollView } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

export default function LoginScreen({ onLogin }) {
  const [verLegal, setVerLegal] = useState(false);
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
  const [fusionFallida, setFusionFallida] = useState(null); // null | 'notificada' | 'sin_notificar'

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const passwordRef = useRef(null);

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
    if (cargando) return;
    if (!email.trim() || !password) { setMensaje('Completá todos los campos'); return; }
    setCargando(true); setMensaje('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
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
    if (cargando) return;
    if (!email.trim() || !password || !nombre.trim()) { setMensaje('Completá todos los campos'); return; }
    if (password.length < 8) { setMensaje('La contraseña debe tener al menos 8 caracteres'); return; }
    if (!/[A-Z]/.test(password)) { setMensaje('La contraseña debe tener al menos una mayúscula'); return; }
    if (!/[0-9]/.test(password)) { setMensaje('La contraseña debe tener al menos un número'); return; }
    if (password !== passwordConfirm) { setMensaje('Las contraseñas no coinciden'); return; }
    setCargando(true); setMensaje('');
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(), password, options: { data: { name: nombre } }
      });
      if (error) throw error;
      const perfilRes = await fetch(`${BACKEND_URL}/usuarios/perfil`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: data.user.id, email, name: nombre })
      });
      const perfilData = await perfilRes.json();
      await AsyncStorage.setItem('ultimo_email', email);
      await AsyncStorage.setItem('saved_password', password);
      setSavedPassword(password);
      setBiometriaDisponible(true);

      if (perfilData.mensaje === 'fusion_fallida_notificada') {
        setFusionFallida('notificada');
        return;
      }
      if (perfilData.mensaje === 'fusion_fallida_sin_notificar') {
        setFusionFallida('sin_notificar');
        return;
      }
      onLogin(data.user);
    } catch (error) {
      setMensaje(error.message || 'Error al registrarse');
    } finally { setCargando(false); }
  };

  const handleReset = async () => {
    if (!email) { setMensaje('Ingresá tu email primero'); return; }
    setCargando(true); setMensaje('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: 'https://korva-app-production.up.railway.app/auth/reset',
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
        promptMessage: 'Confirmá tu identidad para entrar a Korva',
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

  if (fusionFallida) {
    return (
      <View style={styles.container}>
        <View style={styles.resetCard}>
          <Text style={styles.resetEmoji}>{fusionFallida === 'notificada' ? '⚙️' : '📞'}</Text>
          <Text style={styles.resetTitulo}>
            {fusionFallida === 'notificada' ? 'Estamos en ello' : 'Contactanos'}
          </Text>
          {fusionFallida === 'notificada' ? (
            <Text style={styles.resetTexto}>
              Detectamos un problema con tu cuenta y ya notificamos al equipo Korva automáticamente. Lo resolveremos en las próximas horas. No hace falta que nos escribas — te avisamos por email cuando esté solucionado.
            </Text>
          ) : (
            <Text style={styles.resetTexto}>
              Detectamos un problema con tu cuenta. Por favor escribinos por WhatsApp al +61474024238 para resolverlo.
            </Text>
          )}
          <TouchableOpacity style={styles.button} onPress={() => { setFusionFallida(null); setCargando(false); }}>
            <Text style={styles.buttonText}>Entendido</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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

  if (verLegal) return <TerminosScreen onVolver={() => setVerLegal(false)} />;

  return (
    <SafeAreaView style={styles.screen}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">

      <Animated.View style={[styles.hero, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <Ionicons name="compass-outline" size={36} color={colors.brandOrangeSoft} style={{ marginBottom: 12 }} />
        <Text style={styles.logo}>KORVA</Text>
        <Text style={styles.adventure}>AVENTURAS</Text>
        <Text style={styles.tagline}>Desafíos virtuales.</Text>
        <Text style={styles.taglineBold}>Medallas reales.</Text>
      </Animated.View>

      <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

        {!resetMode ? (
          <>
            <View style={styles.modoRow}>
              <TouchableOpacity
                style={[styles.modoBtn, modo === 'login' && styles.modoBtnActivo]}
                disabled={cargando}
                onPress={() => cambiarModo('login')}
              >
                <Text style={[styles.modoBtnText, modo === 'login' && styles.modoBtnTextActivo]}>
                  Iniciar sesión
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modoBtn, modo === 'registro' && styles.modoBtnActivo]}
                disabled={cargando}
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
                  placeholderTextColor={colors.textMuted}
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
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>CONTRASEÑA</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]}
                  ref={passwordRef}
                  value={password}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
                  textContentType={modo === 'login' ? 'password' : 'newPassword'}
                  returnKeyType={modo === 'login' ? 'go' : 'next'}
                  onSubmitEditing={() => { if (modo === 'login' && !cargando) handleLogin(); }}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!verPassword}
                />
                <TouchableOpacity style={styles.ojito} accessibilityRole="button" accessibilityLabel={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"} onPress={() => setVerPassword(!verPassword)}>
                  <Ionicons name={verPassword ? "eye-off-outline" : "eye-outline"} size={22} color={colors.textSoft} />
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
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    onChangeText={setPasswordConfirm}
                    placeholder="••••••••"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!verPasswordConfirm}
                  />
                  <TouchableOpacity style={styles.ojito} onPress={() => setVerPasswordConfirm(!verPasswordConfirm)}>
                    <Ionicons name={verPasswordConfirm ? "eye-off-outline" : "eye-outline"} size={22} color={colors.textSoft} />
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
              <TouchableOpacity style={styles.biometriaBtn} disabled={cargando} onPress={loginConBiometria}>
                <View style={styles.btnRow}><Ionicons name="finger-print-outline" size={20} color={colors.textSoft} /><Text style={styles.biometriaBtnText}>Usar Face ID o huella</Text></View>
              </TouchableOpacity>
            )}

            {modo === 'login' && (
              <TouchableOpacity onPress={() => setResetMode(true)} style={styles.olvideBtnContainer}>
                <Text style={styles.olvideBtnText}>¿Olvidaste tu contraseña?</Text>
              </TouchableOpacity>
            )}


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
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="go"
                onSubmitEditing={() => { if (!cargando) handleReset(); }}
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
        <TouchableOpacity accessibilityRole="button" onPress={() => setVerLegal(true)} style={{ paddingVertical: 20 }}><Text style={{ color: colors.actionBlue, textAlign: 'center' }}>Términos de uso y privacidad</Text></TouchableOpacity>
      </Animated.View>
    </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 },
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: 24 },
  hero: { alignItems: 'center', marginBottom: 32 },
  medallaEmoji: { fontSize: 64, marginBottom: 10 },
  logo: { fontSize: 34, fontWeight: 'bold', color: colors.text, letterSpacing: 5, marginBottom: 10 },
  adventure: { color: colors.brandOrangeSoft, fontSize: 13, fontWeight: '700', letterSpacing: 4, marginBottom: 18 },
  tagline: { fontSize: 16, color: colors.textSoft, marginBottom: 2 },
  taglineBold: { fontSize: 18, fontWeight: 'bold', color: colors.brandOrange },
  card: { backgroundColor: colors.surfaceSoft, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.borderSoft },
  modoRow: { flexDirection: 'row', marginBottom: 24, backgroundColor: colors.background, borderRadius: 12, padding: 4 },
  modoBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  modoBtnActivo: { backgroundColor: colors.surfaceRaised },
  modoBtnText: { color: colors.textMuted, fontWeight: 'bold', fontSize: 14 },
  modoBtnTextActivo: { color: colors.text },
  inputContainer: { marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: colors.textSoft, letterSpacing: 0.4, marginBottom: 6 },
  input: { backgroundColor: colors.background, borderRadius: 12, padding: 14, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  ojito: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 14, borderTopRightRadius: 12, borderBottomRightRadius: 12, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 0 },
  mensajeBox: { backgroundColor: '#2a1a1a', borderRadius: 10, padding: 12, marginBottom: 12 },
  mensaje: { color: colors.brandOrange, fontSize: 13, textAlign: 'center' },
  button: { backgroundColor: colors.brandOrange, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 4, marginBottom: 16 },
  buttonDisabled: { backgroundColor: '#2a3a4a' },
  buttonText: { color: colors.text, fontWeight: 'bold', fontSize: 16 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnRowBack: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  olvideBtnContainer: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginBottom: 4 },
  olvideBtnText: { color: colors.actionBlue, fontSize: 13 },
  switchText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  switchLink: { color: colors.actionBlue, fontWeight: 'bold' },
  resetTituloForm: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: 8 },
  resetSubtitulo: { fontSize: 13, color: colors.textSoft, lineHeight: 20, marginBottom: 20 },
  resetCard: { backgroundColor: colors.surfaceSoft, borderRadius: 24, padding: 40, margin: 24, alignItems: 'center' },
  resetEmoji: { fontSize: 48, marginBottom: 16 },
  resetTitulo: { fontSize: 22, fontWeight: 'bold', color: colors.text, marginBottom: 12 },
  resetTexto: { fontSize: 14, color: colors.textSoft, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  verificadorBox: { marginTop: 8, gap: 4 },
  verificadorItem: { fontSize: 12, color: colors.textMuted },
  verificadorOk: { color: '#4CAF50' },
  verificadorError: { color: colors.brandOrange },
  biometriaBtn: { backgroundColor: colors.surfaceSoft, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: colors.actionBlue },
  biometriaBtnText: { color: colors.textSoft, fontWeight: 'bold', fontSize: 14 },
});