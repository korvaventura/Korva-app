import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SLIDES = [
  {
    emoji: '🏃‍♂️',
    titulo: '¡Bienvenido a Korva!',
    desc: 'Completá km a tu ritmo desde cualquier lugar del mundo. Caminando, corriendo, en bici o como quieras — todo suma igual.',
    color: '#FC4C02',
  },
  {
    emoji: '📏',
    titulo: 'Elegí tu distancia',
    desc: 'La versión Estándar es la distancia base y la Extendida ofrece una meta mayor. Podés cambiar entre las versiones disponibles desde Perfil. La medalla física es la misma.',
    color: '#F59E0B',
  },
  {
    emoji: '➕',
    titulo: 'Cargá tus km',
    desc: 'Abrí Registrar y elegí GPS para una salida con el teléfono o Manual para cargar una actividad ya hecha. Strava es opcional si está habilitado en tu cuenta.',
    color: '#1E6FD9',
  },
  {
    emoji: '🗑️',
    titulo: 'Borrá actividades',
    desc: 'En Perfil, abrí Tus actividades y usá la papelera si cargaste algo por error. Tocá una actividad para abrir el detalle y compartirla.',
    color: '#0D9488',
  },
  {
    emoji: '📦',
    titulo: 'Cargá tu dirección',
    desc: 'Revisá tu Dirección de envío en Perfil. El avance del desafío y el envío físico se gestionan por separado; recibirás el seguimiento por correo cuando esté disponible.',
    color: '#7C3AED',
  },
];

export default function TutorialScreen({ onTerminar }) {
  const [slide, setSlide] = useState(0);

  const siguiente = async () => {
    if (slide < SLIDES.length - 1) {
      setSlide(slide + 1);
    } else {
      await AsyncStorage.setItem('tutorial_visto', 'true');
      onTerminar();
    }
  };

  const saltar = async () => {
    await AsyncStorage.setItem('tutorial_visto', 'true');
    onTerminar();
  };

  const s = SLIDES[slide];

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.saltarBtn} onPress={saltar}>
        <Text style={styles.saltarTxt}>Saltar</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={[styles.emojiCircle, { backgroundColor: s.color + '22', borderColor: s.color, marginBottom: 20 }]}>
          <Text style={styles.emoji}>{s.emoji}</Text>
        </View>
        <Text style={[styles.titulo, { marginBottom: 16 }]}>{s.titulo}</Text>
        <Text style={styles.desc}>{s.desc}</Text>
      </View>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={styles.dotWrapper}>
            <View style={[styles.dot, i === slide && { backgroundColor: s.color, width: 20 }]} />
          </View>
        ))}
      </View>

      <TouchableOpacity style={[styles.btn, { backgroundColor: s.color }]} onPress={siguiente}>
        <Text style={styles.btnTxt}>{slide < SLIDES.length - 1 ? 'Siguiente →' : '¡Empezar!'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B2A', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 60, paddingHorizontal: 30 },
  saltarBtn: { alignSelf: 'flex-end' },
  saltarTxt: { color: '#4a6a8a', fontSize: 15 },
  content: { alignItems: 'center' },
  emojiCircle: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 10 },
  emoji: { fontSize: 52 },
  titulo: { fontSize: 26, fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center' },
  desc: { fontSize: 16, color: '#A8CFFF', textAlign: 'center', lineHeight: 24 },
  dots: { flexDirection: 'row', marginHorizontal: 4 },
  dotWrapper: { marginHorizontal: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1E3A5F' },
  btn: { width: '100%', padding: 18, borderRadius: 14, alignItems: 'center' },
  btnTxt: { color: '#FFFFFF', fontSize: 17, fontWeight: 'bold' },
});
