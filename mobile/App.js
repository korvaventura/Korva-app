import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>KORVA</Text>
      <Text style={styles.tagline}>Desafios virtuales. Medallas reales.</Text>
      <View style={styles.card}>
        <Text style={styles.challengeTitle}>Fin del Mundo</Text>
        <Text style={styles.challengeDistance}>103 km</Text>
        <View style={styles.progressBar}>
          <View style={styles.progressFill} />
        </View>
        <Text style={styles.progressText}>72.93 km completados - 70.8%</Text>
      </View>
      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Conectar con Strava</Text>
      </TouchableOpacity>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1B2A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: '#A8CFFF',
    marginBottom: 40,
  },
  card: {
    backgroundColor: '#1E3A5F',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    marginBottom: 24,
  },
  challengeTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  challengeDistance: {
    fontSize: 14,
    color: '#A8CFFF',
    marginBottom: 16,
  },
  progressBar: {
    height: 10,
    backgroundColor: '#0D1B2A',
    borderRadius: 5,
    marginBottom: 8,
  },
  progressFill: {
    height: 10,
    width: '70%',
    backgroundColor: '#1E6FD9',
    borderRadius: 5,
  },
  progressText: {
    fontSize: 13,
    color: '#A8CFFF',
  },
  button: {
    backgroundColor: '#FC4C02',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});