import { StyleSheet, Text, View, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
const { width } = Dimensions.get('window');

const SLIDES = [
  { emoji: 'compass-outline', titulo: 'Tu próxima aventura', descripcion: 'Sumá kilómetros desde donde estés y descubrí lugares, historias y checkpoints a tu ritmo.', color: '#FF7900' },
  { emoji: 'map-outline', titulo: 'Elegí cómo empezar', descripcion: 'Explorá una ruta gratuita como Islandia o elegí un desafío pago del catálogo. Las rutas gratuitas no incluyen medalla ni te comprometen a comprar.', color: '#FF7900' },
  { emoji: 'footsteps-outline', titulo: 'Registrá tus actividades', descripcion: 'Usá GPS para medir una salida, cargala manualmente o conectá Strava. Una actividad puede sumar a tus desafíos activos; podés pausar cada uno desde Perfil.', color: '#FF7900' },
  { emoji: 'heart-outline', titulo: 'Salud, solo si vos elegís', descripcion: 'En Inicio → Tu movimiento podés conectar Salud para ver pasos y distancia. Para sumar esa distancia a un desafío, elegilo y confirmá aparte. Los pasos no se convierten a km.', color: '#FF7900' },
  { emoji: 'medal-outline', titulo: 'Cada paso cuenta', descripcion: 'Explorá tus rutas y compartí tus avances. En desafíos pagos, el progreso y el envío de la medalla se gestionan por separado, según las condiciones de tu pedido.', color: '#FF7900' },
];

export default function OnboardingScreen({ onTerminar, onActivarAvisos }) {
  const [slide, setSlide] = useState(0);
  const [avisos, setAvisos] = useState(false);
  const activarAvisos = async () => { if(avisos)return; setAvisos(true); await onActivarAvisos?.(); };

  const siguiente = () => {
    if (slide < SLIDES.length - 1) {
      setSlide(slide + 1);
    } else {
      onTerminar();
    }
  };

  const current = SLIDES[slide];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.slide}>
        <View style={styles.icon}><Ionicons name={current.emoji} size={64} color="#FFAA6D" /></View>
        <Text style={styles.titulo}>{current.titulo}</Text>
        <Text style={styles.descripcion}>{current.descripcion}</Text>
      </ScrollView>

      {slide === SLIDES.length - 1 && onActivarAvisos && <TouchableOpacity disabled={avisos} accessibilityRole="button" onPress={activarAvisos} style={{ paddingVertical: 16 }}><Text style={{ color: '#A8CFFF', textAlign: 'center' }}>{avisos ? 'Avisos: revisá tu elección en Ajustes' : 'Activar avisos de Korva (opcional)'}</Text></TouchableOpacity>}
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
             <View style={styles.btnRow}>
                <Text style={styles.siguienteText}>Siguiente</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.empezarBtn, { backgroundColor: current.color }]} onPress={onTerminar}>
            <Text style={styles.empezarText}>Explorar Korva</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B2A', justifyContent: 'space-between', paddingVertical: 24, paddingHorizontal: 32 },
  slide: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { padding: 25, borderRadius: 70, backgroundColor: '#19354A', marginBottom: 28 },
  titulo: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center', marginBottom: 16 },
  descripcion: { fontSize: 16, color: '#A8CFFF', textAlign: 'center', lineHeight: 26 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2a4a6a' },
  dotActivo: { backgroundColor: '#1E6FD9', width: 24 },
  botonesRow: { flexDirection: 'row', gap: 12 },
  skipBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#2a4a6a', alignItems: 'center' },
  skipText: { color: '#A8CFFF', fontWeight: 'bold', fontSize: 15 },
  siguienteBtn: { flex: 2, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  siguienteText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  empezarBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  empezarText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
