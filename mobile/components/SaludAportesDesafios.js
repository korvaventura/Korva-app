import { useEffect, useRef, useState } from 'react';
import { Alert, DeviceEventEmitter, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { consultarAportesHealth } from '../services/health/aportesDesafios';
import { colors } from '../theme/korvaTheme';

export default function SaludAportesDesafios({ userId, conectado }) {
  const [abierto, setAbierto] = useState(false), [estado, setEstado] = useState(null);
  const [ocupado, setOcupado] = useState(false), [error, setError] = useState('');
  const vivo = useRef(true), bloqueado = useRef(false);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  const cargar = async () => {
    const datos = await consultarAportesHealth(userId);
    if (vivo.current) setEstado(datos);
  };
  const operar = async (fn) => {
    if (bloqueado.current || !vivo.current) return;
    bloqueado.current = true; setOcupado(true); setError('');
    try { await fn(); } catch (e) { if (vivo.current) setError(e.message || 'Intentá nuevamente.'); }
    finally { bloqueado.current = false; if (vivo.current) setOcupado(false); }
  };
  const elegir = (d) => {
    if (ocupado) return;
    if (!d.activo && !conectado) { Alert.alert('Conectá Salud', 'Primero conectá Salud para sincronizar la distancia medida.'); return; }
    const habilitar = !d.activo;
    const texto = habilitar
      ? 'La distancia medida de Salud empezará a aportar desde el próximo día completo. Los pasos no se convierten a km. Se descuenta la distancia ya registrada por actividades para evitar duplicaciones. Las pausas del desafío se respetan.'
      : 'Se detienen los nuevos aportes a este desafío. Se conservan los días completos que ya autorizaste; el día de hoy queda fuera.';
    Alert.alert(habilitar ? `Usar Salud en ${d.titulo}` : `Detener aportes a ${d.titulo}`, texto,
      [{ text: 'Cancelar', style: 'cancel' }, { text: habilitar ? 'Confirmar aporte' : 'Detener aportes', onPress: () => operar(async () => {
        await consultarAportesHealth(userId, { id: d.id, tipo: d.tipo, activo: habilitar,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          version: estado.version, confirmo: true });
        await cargar();
        if (vivo.current) DeviceEventEmitter.emit('korva:movimiento-actualizado', { userId });
      }) }]);
  };
  return <View style={s.section}>
    <Text style={s.title}>Movimiento en desafíos</Text>
    <Text style={s.copy}>Conectar Salud no activa aportes. Elegí y confirmá cada desafío donde querés usar tu distancia diaria.</Text>
    <TouchableOpacity accessibilityRole="button" disabled={ocupado} onPress={() => {
      setAbierto((v) => !v); if (!abierto) operar(cargar);
    }}><Text style={s.link}>{ocupado ? 'Cargando…' : abierto ? 'Cerrar selección' : 'Usar movimiento diario en desafíos'}</Text></TouchableOpacity>
    {abierto && <View style={s.list}>
      {!!error && <><Text style={s.copy}>{error}</Text><TouchableOpacity disabled={ocupado} onPress={() => operar(cargar)}><Text style={s.link}>Volver a intentar</Text></TouchableOpacity></>}
      {estado?.disponible === false && <Text style={s.copy}>Esta opción todavía no está habilitada. Tu movimiento sigue disponible en el resumen personal.</Text>}
      {estado?.disponible && estado.desafios.length === 0 && <Text style={s.copy}>No tenés desafíos en curso para configurar.</Text>}
      {estado?.disponible && estado.desafios.map((d) => <View key={`${d.tipo}:${d.id}`} style={s.row}>
        <View style={s.info}><Text style={s.title}>{d.titulo}</Text>
          <Text style={s.copy}>{d.activo ? `Aporte activado · desde ${new Date(d.desde).toLocaleDateString()}${d.pausado ? ' · desafío pausado' : ''}` : 'Sin aporte de Salud'}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" disabled={ocupado} onPress={() => elegir(d)}><Text style={s.link}>{d.activo ? 'Desactivar' : 'Elegir'}</Text></TouchableOpacity>
      </View>)}
      {estado?.disponible && <Text style={s.copy}>La distancia diaria puede corregirse con nuevas lecturas. Para completar un desafío, Salud necesita datos estables durante al menos 48 horas después del día registrado.</Text>}
    </View>}
  </View>;
}
const s = StyleSheet.create({ section: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 15, gap: 8 },
  title: { color: colors.text, fontSize: 13, fontWeight: '700' }, copy: { color: colors.textSoft, fontSize: 12, lineHeight: 19 },
  link: { color: colors.actionBlue, fontSize: 12, fontWeight: '700', paddingVertical: 10 }, list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSoft, paddingVertical: 8 }, info: { flex: 1 } });
