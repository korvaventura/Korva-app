import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/korvaTheme';
import { clave, debeInvitar, ocultarHasta } from '../services/islandiaInvitacionCore';

const VERDE = '#3DDC84';

// Invitación a Islandia, la ruta libre (sin costo y, por ahora, sin medalla). En Inicio se puede ocultar 7 días;
// en el Catálogo queda fija arriba de todo.
export default function IslandiaInvitacion({ navigation, userId, participacion, lugar = 'inicio' }) {
  const [oculta, setOculta] = useState(lugar === 'inicio' ? null : 0);

  useEffect(() => {
    if (lugar !== 'inicio' || !userId) return;
    AsyncStorage.getItem(clave(userId)).then((v) => setOculta(Number(v) || 0)).catch(() => setOculta(0));
  }, [userId, lugar]);

  if (oculta === null) return null;
  if (!debeInvitar({ participacion, ocultaHasta: oculta })) return null;

  const ahoraNo = () => {
    const hasta = ocultarHasta();
    setOculta(hasta);
    AsyncStorage.setItem(clave(userId), String(hasta)).catch(() => {});
  };

  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.card} onPress={() => navigation.navigate('RutaLibre')} accessibilityRole="button"
      accessibilityLabel="Islandia, ruta libre sin costo y sin medalla por ahora. Empezar la ruta">
      <View style={styles.fila}>
        <View style={styles.etiqueta}>
          <Text style={styles.etiquetaTxt}>RUTA LIBRE · SIN COSTO</Text>
        </View>
        <Text style={styles.km}>1.400 km</Text>
      </View>
      <Text style={styles.titulo}>Islandia · Ring Road</Text>
      <Text style={styles.texto}>Cascadas, glaciares y volcanes. Recorrela a tu ritmo: tus próximas salidas suman.</Text>
      <Text style={styles.medalla}>Por ahora no incluye medalla. Más adelante vas a poder comprarla con tu recorrido validado.</Text>
      <View style={styles.acciones}>
        <View style={styles.boton}><Text style={styles.botonTxt}>Empezar la ruta</Text></View>
        {lugar === 'inicio' && (
          <TouchableOpacity onPress={ahoraNo} hitSlop={10} accessibilityRole="button">
            <Text style={styles.ahoraNo}>Ahora no</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.borderSoft, padding: 18, marginBottom: 16 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  etiqueta: { borderWidth: 1, borderColor: 'rgba(61,220,132,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  etiquetaTxt: { color: VERDE, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  medalla: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 8 },
  km: { color: colors.textSoft, fontSize: 12, fontWeight: '700' },
  titulo: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 12 },
  texto: { color: colors.textSoft, fontSize: 13, lineHeight: 19, marginTop: 4 },
  acciones: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  boton: { backgroundColor: 'rgba(61,220,132,0.14)', borderWidth: 1, borderColor: VERDE, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  botonTxt: { color: VERDE, fontSize: 14, fontWeight: '800' },
  ahoraNo: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
});
