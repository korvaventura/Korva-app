import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { estadoGarmin, iniciarGarmin, desconectarGarmin, GARMIN_RETURN_URL } from '../services/garminApi';
import { colors, radius, spacing } from '../theme/korvaTheme';
import { useTourDato } from './tour/Tour';

const { filaGarmin, filaStrava, mensajeGarmin, mensajeDesconectarGarmin, resultadoDeUrl, urlAutorizacionValida, AVISO_BETA_GARMIN, CLAVE_AVISO_BETA, debeMostrarAvisoBeta, urlWhatsappSoporte, urlMailSoporte } = require('../services/conexionesCore');

// Perfil → Conexiones: Strava y Garmin con la misma fila.
// Strava funciona como siempre (sus acciones vienen de PerfilScreen).
// Garmin aparece solo si el servidor la habilita para esta cuenta, y por ahora
// solo vincula la cuenta: no se muestra "sincronizando" ni se prometen km.
export default function ConexionesSection({ stravaConectado, onConectarStrava, onReconectarStrava, onDesconectarStrava, onComoFuncionaStrava, tourRef }) {
  const [garmin, setGarmin] = useState(null);
  const [conectandoGarmin, setConectandoGarmin] = useState(false);
  const pidiendo = useRef(false);
  const [avisoBeta, setAvisoBeta] = useState(false);

  useFocusEffect(useCallback(() => {
    let vivo = true;
    const refrescar = () => estadoGarmin().then((d) => { if (vivo) setGarmin(d); });
    refrescar();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refrescar(); });
    return () => { vivo = false; sub.remove(); };
  }, []));

  const conectarGarmin = async () => {
    if (pidiendo.current) return;
    pidiendo.current = true;
    setConectandoGarmin(true);
    try {
      const { authorization_url: url } = await iniciarGarmin();
      if (!urlAutorizacionValida(url)) throw new Error('No pudimos abrir la autorización de Garmin.');
      const r = await WebBrowser.openAuthSessionAsync(url, GARMIN_RETURN_URL);
      // Lo que vale es lo que dice el servidor, no el link de regreso.
      const actual = await estadoGarmin();
      setGarmin(actual);
      // Si ya suma km, en vez del cartel aparece el aviso de beta (una sola vez).
      const m = actual.connected === true && actual.activities_enabled === true ? null
        : mensajeGarmin({ conectado: actual.connected === true, tipo: r?.type, resultado: r?.type === 'success' ? resultadoDeUrl(r.url) : null });
      if (m) Alert.alert(m.titulo, m.texto);
    } catch (e) {
      Alert.alert('Conectar Garmin', e.status === 409
        ? 'Ya tenés Garmin vinculado o una conexión en curso. Esperá unos minutos y volvé a abrir Perfil.'
        : e.message || 'Intentá nuevamente.');
    } finally {
      pidiendo.current = false;
      setConectandoGarmin(false);
    }
  };

  const confirmarDesconectarGarmin = () => {
    Alert.alert('Desconectar Garmin', 'Tus próximas salidas de Garmin dejan de llegar a Korva. Lo que ya sumaste queda.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desconectar', style: 'destructive', onPress: async () => {
        if (pidiendo.current) return;
        pidiendo.current = true; setConectandoGarmin(true);
        let error = null;
        try { await desconectarGarmin(); } catch (e) { error = e; }
        try { setGarmin(await estadoGarmin()); } catch { /* se refresca al volver */ }
        pidiendo.current = false; setConectandoGarmin(false);
        const m = mensajeDesconectarGarmin(error);
        Alert.alert(m.titulo, m.texto);
      } },
    ]);
  };

  const fStrava = filaStrava(stravaConectado);
  const fGarmin = filaGarmin(garmin);
  // El tour nombra a Garmin solo si a esta persona le aparece.
  useTourDato('garmin', !!fGarmin);

  // Garmin en beta: la primera vez que suma km, un aviso para que nos cuenten si ven algo raro.
  const estadoFila = fGarmin?.estado;
  useEffect(() => {
    if (estadoFila !== 'sincroniza') return;
    let vivo = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const clave = CLAVE_AVISO_BETA(session?.user?.id);
        const visto = await AsyncStorage.getItem(clave);
        if (vivo && debeMostrarAvisoBeta(fGarmin, !!visto)) setAvisoBeta(true);
      } catch { /* sin aviso, la app sigue normal */ }
    })();
    return () => { vivo = false; };
  }, [estadoFila]);
  const cerrarAvisoBeta = async () => {
    setAvisoBeta(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await AsyncStorage.setItem(CLAVE_AVISO_BETA(session?.user?.id), '1');
    } catch { /* se vuelve a mostrar la próxima vez */ }
  };
  const avisarProblema = () => {
    Linking.openURL(urlWhatsappSoporte()).catch(() => Linking.openURL(urlMailSoporte()).catch(() => {}));
  };

  return (
    <View style={s.seccion} ref={tourRef} collapsable={false}>
      <Text style={s.titulo}>Conexiones</Text>
      <Text style={s.sub}>Apps desde donde pueden llegar tus salidas.</Text>
      <View style={s.tarjeta}>
        <View style={s.fila}>
          <View style={[s.icono, { backgroundColor: '#2A1A12' }]}><Text style={[s.iconoTexto, { color: '#FC4C02' }]}>S</Text></View>
          <View style={s.info}>
            <Text style={s.nombre}>Strava</Text>
            <Text style={[s.estado, fStrava.estado === 'sincroniza' && s.estadoOk]}>{fStrava.titulo}</Text>
            <Text style={s.detalle}>{fStrava.detalle}</Text>
          </View>
          {stravaConectado ? (
            <View style={s.acciones}>
              <TouchableOpacity onPress={onReconectarStrava} hitSlop={6}><Text style={s.link}>Reconectar</Text></TouchableOpacity>
              <TouchableOpacity onPress={onDesconectarStrava} hitSlop={6}><Text style={s.linkPeligro}>Desconectar</Text></TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.boton} onPress={onConectarStrava} accessibilityRole="button"><Text style={s.botonTexto}>Conectar</Text></TouchableOpacity>
          )}
        </View>

        {fGarmin && (
          <View style={[s.fila, s.filaBorde]}>
            <View style={[s.icono, { backgroundColor: '#11222F' }]}><Text style={[s.iconoTexto, { color: '#7FD1FF' }]}>G</Text></View>
            <View style={s.info}>
              <View style={s.nombreFila}>
                <Text style={s.nombre}>Garmin</Text>
                <Text style={s.prueba}>BETA</Text>
              </View>
              <Text style={[s.estado, fGarmin.estado !== 'sin_conectar' && s.estadoOk]}>{fGarmin.titulo}</Text>
              <Text style={s.detalle}>{fGarmin.detalle}</Text>
            </View>
            {fGarmin.accion === 'desconectar' && (
              <TouchableOpacity onPress={confirmarDesconectarGarmin} disabled={conectandoGarmin} hitSlop={6}>
                {conectandoGarmin ? <ActivityIndicator color={colors.textMuted} size="small" /> : <Text style={s.linkPeligro}>Desconectar</Text>}
              </TouchableOpacity>
            )}
            {fGarmin.accion === 'conectar' && (
              <TouchableOpacity style={s.boton} onPress={conectarGarmin} disabled={conectandoGarmin} accessibilityRole="button">
                {conectandoGarmin ? <ActivityIndicator color={colors.text} size="small" /> : <Text style={s.botonTexto}>Conectar</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
      {fGarmin && fGarmin.estado !== 'sin_conectar' && (
        <TouchableOpacity onPress={avisarProblema} style={s.ayuda}><Text style={s.ayudaTexto}>¿Algo raro con Garmin? Avisanos</Text></TouchableOpacity>
      )}
      <Modal visible={avisoBeta} transparent animationType="fade" onRequestClose={cerrarAvisoBeta}>
        <View style={s.velo}>
          <View style={s.aviso}>
            <Text style={s.avisoTitulo}>{AVISO_BETA_GARMIN.titulo}</Text>
            <Text style={s.avisoTexto}>{AVISO_BETA_GARMIN.texto}</Text>
            <TouchableOpacity style={s.avisoBoton} onPress={() => { cerrarAvisoBeta(); avisarProblema(); }} accessibilityRole="button">
              <Text style={s.avisoBotonTexto}>Avisar un problema</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.avisoSecundario} onPress={cerrarAvisoBeta} accessibilityRole="button">
              <Text style={s.avisoSecundarioTexto}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {stravaConectado && (
        <TouchableOpacity onPress={onComoFuncionaStrava} style={s.ayuda}><Text style={s.ayudaTexto}>¿Cómo funciona la sincronización con Strava?</Text></TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  seccion: { width: '100%', paddingHorizontal: 24, marginBottom: 24 },
  titulo: { fontSize: 17, fontWeight: '900', color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md },
  tarjeta: { backgroundColor: colors.surfaceSoft, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSoft, paddingHorizontal: spacing.lg },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  filaBorde: { borderTopWidth: 1, borderColor: colors.borderSoft },
  icono: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconoTexto: { fontSize: 15, fontWeight: '900' },
  info: { flex: 1 },
  nombreFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombre: { color: colors.text, fontSize: 15, fontWeight: '800' },
  prueba: { color: colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1.2, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  estado: { color: colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 2 },
  estadoOk: { color: '#5DCAA5' },
  detalle: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  acciones: { alignItems: 'flex-end', gap: 8 },
  link: { color: colors.actionBlue, fontSize: 12, fontWeight: '700' },
  linkPeligro: { color: colors.danger, fontSize: 12 },
  boton: { minWidth: 86, minHeight: 36, borderRadius: 10, backgroundColor: colors.brandOrange, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  botonTexto: { color: colors.text, fontSize: 12, fontWeight: '800' },
  ayuda: { paddingVertical: 10 },
  velo: { flex: 1, backgroundColor: 'rgba(2,8,15,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  aviso: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: 20, padding: 22, borderWidth: 1, borderColor: colors.borderSoft },
  avisoTitulo: { color: colors.text, fontSize: 18, fontWeight: '900' },
  avisoTexto: { color: colors.textSoft, fontSize: 14, lineHeight: 21, marginTop: 10 },
  avisoBoton: { marginTop: 18, minHeight: 46, borderRadius: 12, backgroundColor: colors.brandOrange, alignItems: 'center', justifyContent: 'center' },
  avisoBotonTexto: { color: colors.text, fontSize: 14, fontWeight: '800' },
  avisoSecundario: { marginTop: 8, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  avisoSecundarioTexto: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  ayudaTexto: { color: colors.actionBlue, fontSize: 12, fontWeight: '700' },
});
