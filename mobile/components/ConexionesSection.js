import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { estadoGarmin, iniciarGarmin, GARMIN_RETURN_URL } from '../services/garminApi';
import { colors, radius, spacing } from '../theme/korvaTheme';

const { filaGarmin, filaStrava, mensajeGarmin, resultadoDeUrl, urlAutorizacionValida } = require('../services/conexionesCore');

// Perfil → Conexiones: Strava y Garmin con la misma fila.
// Strava funciona como siempre (sus acciones vienen de PerfilScreen).
// Garmin aparece solo si el servidor la habilita para esta cuenta, y por ahora
// solo vincula la cuenta: no se muestra "sincronizando" ni se prometen km.
export default function ConexionesSection({ stravaConectado, onConectarStrava, onReconectarStrava, onDesconectarStrava, onComoFuncionaStrava, tourRef }) {
  const [garmin, setGarmin] = useState(null);
  const [conectandoGarmin, setConectandoGarmin] = useState(false);
  const pidiendo = useRef(false);

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
      const m = mensajeGarmin({ conectado: actual.connected === true, tipo: r?.type, resultado: r?.type === 'success' ? resultadoDeUrl(r.url) : null });
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

  const fStrava = filaStrava(stravaConectado);
  const fGarmin = filaGarmin(garmin);

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
                <Text style={s.prueba}>PRUEBA</Text>
              </View>
              <Text style={[s.estado, fGarmin.estado !== 'sin_conectar' && s.estadoOk]}>{fGarmin.titulo}</Text>
              <Text style={s.detalle}>{fGarmin.detalle}</Text>
            </View>
            {fGarmin.accion === 'conectar' && (
              <TouchableOpacity style={s.boton} onPress={conectarGarmin} disabled={conectandoGarmin} accessibilityRole="button">
                {conectandoGarmin ? <ActivityIndicator color={colors.text} size="small" /> : <Text style={s.botonTexto}>Conectar</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
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
  ayudaTexto: { color: colors.actionBlue, fontSize: 12, fontWeight: '700' },
});
