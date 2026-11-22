import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radius, spacing } from '../theme/korvaTheme';
const { crearObjetivosDiarios, leerObjetivoTexto, progresoObjetivo } = require('../services/objetivoDiarioCore');
const objetivos = crearObjetivosDiarios(AsyncStorage);
const format = (n) => n.toLocaleString('es-AR');

// El padre usa key=userId: cada cuenta tiene su propia instancia y almacenamiento.
export default function ObjetivoDiarioCard({ userId, pasos, integrado = false }) {
  const [objetivo, setObjetivo] = useState(null);
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [lecturaLista, setLecturaLista] = useState(false);
  const vivo = useRef(false);
  const enCurso = useRef(false);
  useEffect(() => {
    vivo.current = true;
    let cancelado = false;
    setCargando(true);
    objetivos.leer(userId).then((valor) => {
      if (cancelado) return;
      setObjetivo(valor); setLecturaLista(true); setError('');
    }).catch(() => {
      if (!cancelado) setError('No pudimos leer tu objetivo. Reintentá.');
    }).finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; vivo.current = false; };
  }, [userId, intento]);
  const guardar = async (quitar = false) => {
    if (enCurso.current || !lecturaLista) return;
    let valor;
    try { valor = quitar ? null : leerObjetivoTexto(texto); }
    catch (e) { setError(e.message); return; }
    enCurso.current = true; setGuardando(true); setError('');
    try {
      await objetivos.guardar(userId, valor);
      if (vivo.current) { setObjetivo(valor); setEditando(false); }
    } catch {
      if (vivo.current) setError('No pudimos guardar el objetivo. Intentá nuevamente.');
    } finally {
      enCurso.current = false;
      if (vivo.current) setGuardando(false);
    }
  };
  const progreso = progresoObjetivo(objetivo, pasos);
  return (
    <View style={[styles.card, integrado && styles.integrada]}>
      <View style={styles.header}>
        <Text style={styles.title}>Objetivo diario · pasos</Text>
        {lecturaLista && !editando && <TouchableOpacity onPress={() => {
          setTexto(objetivo === null ? '' : String(objetivo)); setError(''); setEditando(true);
        }} accessibilityRole="button" accessibilityLabel={objetivo === null ? 'Elegir objetivo diario' : 'Editar objetivo diario'}>
          <Text style={styles.action}>{objetivo === null ? 'Elegir' : 'Editar'}</Text>
        </TouchableOpacity>}
      </View>
      {cargando ? <ActivityIndicator color={colors.actionBlue} /> : !lecturaLista ? (
        <TouchableOpacity onPress={() => setIntento((n) => n + 1)} accessibilityRole="button"><Text style={styles.action}>Reintentar</Text></TouchableOpacity>
      ) : editando ? (
        <>
          <TextInput style={styles.input} value={texto} onChangeText={setTexto} editable={!guardando}
            keyboardType="number-pad" maxLength={6} placeholder="Cantidad de pasos" placeholderTextColor={colors.textMuted}
            accessibilityLabel="Objetivo diario en pasos" />
          <View style={styles.buttons}>
            <TouchableOpacity disabled={guardando} onPress={() => guardar()} accessibilityRole="button"><Text style={styles.action}>{guardando ? 'Guardando…' : 'Guardar'}</Text></TouchableOpacity>
            <TouchableOpacity disabled={guardando} onPress={() => { setEditando(false); setError(''); }} accessibilityRole="button"><Text style={styles.note}>Cancelar</Text></TouchableOpacity>
            {objetivo !== null && <TouchableOpacity disabled={guardando} onPress={() => guardar(true)} accessibilityRole="button"><Text style={styles.note}>Quitar objetivo</Text></TouchableOpacity>}
          </View>
        </>
      ) : objetivo === null ? (integrado ? null : <Text style={styles.note}>Elegí una meta de pasos a tu ritmo. Es opcional.</Text>) : (
        <>
          <Text style={styles.value}>{format(objetivo)} pasos</Text>
          {progreso === null ? <Text style={styles.note}>Pendiente de lectura de pasos de hoy.</Text> : (
            <>
              <View style={styles.track} accessible accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: objetivo, now: Math.min(pasos, objetivo), text: `${format(pasos)} de ${format(objetivo)} pasos` }}>
                <View style={[styles.fill, { width: `${progreso.fraccion * 100}%` }]} />
              </View>
              <Text style={styles.note}>{progreso.cumplido ? 'Objetivo de hoy alcanzado' : `${format(progreso.restantes)} pasos para tu objetivo de hoy`}</Text>
            </>
          )}
        </>
      )}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {(!integrado || editando) && <Text style={styles.storage}>Guardado en este teléfono para tu cuenta.</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceSoft, marginBottom: spacing.lg },
  integrada: { backgroundColor: 'transparent', padding: 0, paddingTop: 10, marginBottom: 0, borderTopWidth: 1, borderColor: colors.borderSoft, borderRadius: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { color: colors.textSoft, fontSize: 12, fontWeight: '700' },
  action: { color: colors.actionBlue, fontSize: 13, fontWeight: '700', paddingVertical: 10 },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  value: { color: colors.text, fontSize: 20, fontWeight: '800' },
  input: { backgroundColor: colors.backgroundDeep, color: colors.text, padding: 12, borderRadius: radius.lg, fontSize: 18 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.borderSoft, marginVertical: spacing.sm },
  fill: { height: 6, backgroundColor: colors.actionBlue },
  error: { color: colors.brandOrangeSoft, fontSize: 12, marginTop: spacing.sm },
  storage: { color: colors.textMuted, fontSize: 10, marginTop: spacing.sm },
});
