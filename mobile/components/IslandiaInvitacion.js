import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/korvaTheme';
import { clave, debeInvitar, ocultarHasta } from '../services/islandiaInvitacionCore';

const VERDE = '#3DDC84';

// Invitación a Islandia, la ruta gratuita. En Inicio se puede ocultar 7 días;
// en el Catálogo queda fija arriba de todo.
export default function IslandiaInvitacion({ navigation, userId, participacion, lugar = 'inicio' }) {
  const [oculta, setOculta] = useState(lugar === 'inicio' ? null : 0);
  const pulso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (lugar !== 'inicio' || !userId) return;
    AsyncStorage.getItem(clave(userId)).then((v) => setOculta(Number(v) || 0)).catch(() => setOculta(0));
  }, [userId, lugar]);

  // Un pulso suave de la etiqueta GRATIS cada ~3 s (no titila todo el tiempo).
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulso, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulso, { toValue: 0, duration: 600, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.delay(1800),
    ]));
    anim.start();
    return () => anim.stop();
  }, [pulso]);

  if (oculta === null) return null;
  if (!debeInvitar({ participacion, ocultaHasta: oculta })) return null;

  const ahoraNo = () => {
    const hasta = ocultarHasta();
    setOculta(hasta);
    AsyncStorage.setItem(clave(userId), String(hasta)).catch(() => {});
  };
  const escala = pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const halo = pulso.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] });

  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.card} onPress={() => navigation.navigate('RutaLibre')} accessibilityRole="button"
      accessibilityLabel="Islandia, ruta gratuita. Empezar gratis">
      <View style={styles.fila}>
        <View>
          <Animated.View style={[styles.halo, { opacity: halo, transform: [{ scale: escala }] }]} />
          <Animated.View style={[styles.etiqueta, { transform: [{ scale: escala }] }]}>
            <Text style={styles.etiquetaTxt}>GRATIS</Text>
          </Animated.View>
        </View>
        <Text style={styles.km}>1.400 km</Text>
      </View>
      <Text style={styles.titulo}>Islandia · Ring Road</Text>
      <Text style={styles.texto}>Cascadas, glaciares y volcanes. Empezala gratis y tus próximas salidas suman.</Text>
      <View style={styles.acciones}>
        <View style={styles.boton}><Text style={styles.botonTxt}>Empezar gratis</Text></View>
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
  card: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(61,220,132,0.45)', padding: 18, marginBottom: 16 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  etiqueta: { backgroundColor: VERDE, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  halo: { position: 'absolute', left: -4, right: -4, top: -4, bottom: -4, borderRadius: 999, backgroundColor: VERDE },
  etiquetaTxt: { color: '#06281A', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  km: { color: colors.textSoft, fontSize: 12, fontWeight: '700' },
  titulo: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 12 },
  texto: { color: colors.textSoft, fontSize: 13, lineHeight: 19, marginTop: 4 },
  acciones: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  boton: { backgroundColor: 'rgba(61,220,132,0.14)', borderWidth: 1, borderColor: VERDE, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  botonTxt: { color: VERDE, fontSize: 14, fontWeight: '800' },
  ahoraNo: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
});
