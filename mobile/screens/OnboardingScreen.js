import { StyleSheet, Text, View, TouchableOpacity, Dimensions } from 'react-native';
import { useState } from 'react';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    emoji: '🏅',
    titulo: 'Bienvenido a Korva',
    descripcion: 'Completá distancias reales y ganá medallas físicas que llegan a tu puerta.',
    color: '#1E6FD9',
  },
  {
    emoji: '🏃',
    titulo: 'Elegí tu reto',
    descripcion: 'Running o Ciclismo, a tu ritmo. Tenés tiempo para completar la distancia desde donde estés.',
    color: '#FC4C02',
  },
  {
    emoji: '📱',
    titulo: 'Conectá Strava',
    descripcion: 'Tu progreso se sincroniza automáticamente. También podés cargar tus km manualmente.',
    color: '#1E6FD9',
  },
  {
    emoji: '📦',
    titulo: 'Tu medalla te espera',
    descripcion: 'Al completar el reto te avisamos y enviamos tu medalla a cualquier parte del mundo.',
    color: '#FC4C02',
  },
];

export default function OnboardingScreen({ onTerminar }) {
  const [slide, setSlide] = useState(0);

  const siguiente = () => {
    if (slide < SLIDES.length - 1) {
      setSlide(slide + 1);
    } else {
      onTerminar();
    }
  };

  const current = SLIDES[slide];

  return (
    <View style={styles.container}>
      <View style={styles.slide}>
        <Text style={styles.emoji}>{current.emoji}</Text>
        <Text style={styles.titulo}>{current.titulo}</Text>
        <Text style={styles.descripcion}>{current.descripcion}</Text>
      </View>

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === slide && styles.dotActivo]} />
        ))}
      </View>

      {/* Botones */}
      <View style={styles.botonesRow}>
        {slide < SLIDES.length - 1 ? (
          <>
            <TouchableOpacity style={styles.skipBtn} onPress={onTerminar}>
              <Text style={styles.skipText}>Saltar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.siguienteBtn, { backgroundColor: current.color }]} onPress={siguiente}>
              <Text style={styles.siguienteText}>Siguiente →</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.empezarBtn, { backgroundColor: current.color }]} onPress={onTerminar}>
            <Text style={styles.empezarText}>🚀 Empezar ahora</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B2A', justifyContent: 'space-between', paddingVertical: 80, paddingHorizontal: 32 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 80, marginBottom: 32 },
  titulo: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center', marginBottom: 16 },
  descripcion: { fontSize: 16, color: '#A8CFFF', textAlign: 'center', lineHeight: 26 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2a4a6a' },
  dotActivo: { backgroundColor: '#1E6FD9', width: 24 },
  botonesRow: { flexDirection: 'row', gap: 12 },
  skipBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#2a4a6a', alignItems: 'center' },
  skipText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 15 },
  siguienteBtn: { flex: 2, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  siguienteText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  empezarBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  empezarText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
});