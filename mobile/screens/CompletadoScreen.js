import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { supabase } from '../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

const PAISES = [
  { nombre: 'Argentina', codigo: '+54', bandera: '🇦🇷' },
  { nombre: 'Australia', codigo: '+61', bandera: '🇦🇺' },
  { nombre: 'Estados Unidos', codigo: '+1', bandera: '🇺🇸' },
  { nombre: 'España', codigo: '+34', bandera: '🇪🇸' },
  { nombre: 'Reino Unido', codigo: '+44', bandera: '🇬🇧' },
  { nombre: 'Alemania', codigo: '+49', bandera: '🇩🇪' },
  { nombre: 'Francia', codigo: '+33', bandera: '🇫🇷' },
  { nombre: 'Italia', codigo: '+39', bandera: '🇮🇹' },
  { nombre: 'Paises Bajos', codigo: '+31', bandera: '🇳🇱' },
  { nombre: 'Portugal', codigo: '+351', bandera: '🇵🇹' },
  { nombre: 'Irlanda', codigo: '+353', bandera: '🇮🇪' },
  { nombre: 'Suecia', codigo: '+46', bandera: '🇸🇪' },
  { nombre: 'Chile', codigo: '+56', bandera: '🇨🇱' },
  { nombre: 'Uruguay', codigo: '+598', bandera: '🇺🇾' },
  { nombre: 'Brasil', codigo: '+55', bandera: '🇧🇷' },
  { nombre: 'Colombia', codigo: '+57', bandera: '🇨🇴' },
  { nombre: 'Peru', codigo: '+51', bandera: '🇵🇪' },
  { nombre: 'Mexico', codigo: '+52', bandera: '🇲🇽' },
  { nombre: 'Otro', codigo: '', bandera: '🌍' },
];

export default function CompletadoScreen({ challenge, userId, onVolver }) {
  const [paso, setPaso] = useState(1);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [pais, setPais] = useState('');
  const [mostrarPaises, setMostrarPaises] = useState(false);
  const [codigoSeleccionado, setCodigoSeleccionado] = useState(null);
  const [mostrarCodigos, setMostrarCodigos] = useState(false);
  const [codigoManual, setCodigoManual] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cargando, setCargando] = useState(false);

  const codigoFinal = codigoSeleccionado?.nombre === 'Otro' ? codigoManual : codigoSeleccionado?.codigo;

  const guardarDireccion = async () => {
    if (!nombre || !direccion || !ciudad || !codigoPostal || !pais || !telefono || !codigoFinal) {
      alert('Completa todos los campos incluyendo el telefono');
      return;
    }
    setCargando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${BACKEND_URL}/usuarios/direccion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: session.user.id,
          shipping_address: {
            nombre,
            direccion,
            ciudad,
            codigo_postal: codigoPostal,
            pais,
            telefono: `${codigoFinal}${telefono}`
          }
        })
      });
      setPaso(3);
    } catch (error) {
      alert('Error guardando direccion');
    } finally {
      setCargando(false);
    }
  };

  if (paso === 1) {
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>🏅</Text>
        <Text style={styles.titulo}>Felicitaciones!</Text>
        <Text style={styles.subtitulo}>Completaste el reto</Text>
        <Text style={styles.challenge}>{challenge}</Text>
        <Text style={styles.descripcion}>
          Mereces cada gramo de esta medalla. Ahora necesitamos saber donde enviartela.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => setPaso(2)}>
          <Text style={styles.buttonText}>Cargar mi direccion de envio</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonSecundario} onPress={onVolver}>
          <Text style={styles.buttonSecundarioText}>Hacerlo despues</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (paso === 2) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.containerScroll}>
        <Text style={styles.titulo}>Donde te enviamos la medalla?</Text>
        <Text style={styles.subtitulo}>Completa tu direccion de envio</Text>
        <View style={styles.card}>

          <Text style={styles.label}>Nombre completo</Text>
          <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Tu nombre" placeholderTextColor="#A8CFFF" />

          <Text style={styles.label}>Direccion</Text>
          <TextInput style={styles.input} value={direccion} onChangeText={setDireccion} placeholder="Calle, numero, piso" placeholderTextColor="#A8CFFF" />

          <Text style={styles.label}>Ciudad</Text>
          <TextInput style={styles.input} value={ciudad} onChangeText={setCiudad} placeholder="Tu ciudad" placeholderTextColor="#A8CFFF" />

          <Text style={styles.label}>Codigo postal</Text>
          <TextInput style={styles.input} value={codigoPostal} onChangeText={setCodigoPostal} placeholder="Ej: 1234" placeholderTextColor="#A8CFFF" keyboardType="numeric" />

          <Text style={styles.label}>Pais</Text>
          <TextInput style={styles.input} value={pais} onChangeText={setPais} placeholder="Tu pais" placeholderTextColor="#A8CFFF" />

          <Text style={styles.label}>Telefono de contacto</Text>
          <View style={styles.telefonoRow}>
            <TouchableOpacity style={styles.codigoBtn} onPress={() => setMostrarCodigos(!mostrarCodigos)}>
              <Text style={styles.codigoBtnText}>
                {codigoSeleccionado ? `${codigoSeleccionado.bandera} ${codigoSeleccionado.nombre === 'Otro' ? '' : codigoSeleccionado.codigo}` : '🌍 +'}
              </Text>
              <Text style={styles.arrow}>{mostrarCodigos ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.telefonoInput}
              value={telefono}
              onChangeText={setTelefono}
              placeholder="Numero"
              placeholderTextColor="#A8CFFF"
              keyboardType="phone-pad"
            />
          </View>

          {mostrarCodigos && (
            <View style={styles.codigosLista}>
              {PAISES.map((p, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.codigoItem, codigoSeleccionado?.nombre === p.nombre && styles.codigoItemActivo]}
                  onPress={() => { setCodigoSeleccionado(p); setMostrarCodigos(false); }}
                >
                  <Text style={styles.codigoItemText}>{p.bandera} {p.nombre}</Text>
                  <Text style={styles.codigoItemCodigo}>{p.codigo}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {codigoSeleccionado?.nombre === 'Otro' && (
            <TextInput
              style={styles.input}
              value={codigoManual}
              onChangeText={setCodigoManual}
              placeholder="Codigo de pais (Ej: +598)"
              placeholderTextColor="#A8CFFF"
              keyboardType="phone-pad"
            />
          )}

        </View>

        <TouchableOpacity
          style={[styles.button, cargando && styles.buttonDisabled]}
          onPress={guardarDireccion}
          disabled={cargando}
        >
          {cargando ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Confirmar direccion</Text>}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>📦</Text>
      <Text style={styles.titulo}>Listo!</Text>
      <Text style={styles.descripcion}>
        Tu direccion fue guardada. En breve te avisamos cuando tu medalla este en camino.
      </Text>
      <TouchableOpacity style={styles.button} onPress={onVolver}>
        <Text style={styles.buttonText}>Volver a mis retos</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { flex: 1, backgroundColor: '#0D1B2A', alignItems: 'center', justifyContent: 'center', padding: 24 },
  containerScroll: { padding: 24, paddingTop: 60 },
  emoji: { fontSize: 80, marginBottom: 16 },
  titulo: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' },
  subtitulo: { fontSize: 16, color: '#A8CFFF', marginBottom: 8, textAlign: 'center' },
  challenge: { fontSize: 20, fontWeight: 'bold', color: '#FC4C02', marginBottom: 16, textAlign: 'center' },
  descripcion: { fontSize: 14, color: '#A8CFFF', textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  card: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 24, width: '100%', marginBottom: 16 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#A8CFFF', letterSpacing: 1, marginBottom: 8, marginTop: 8 },
  input: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 14, color: '#FFFFFF', fontSize: 15, borderWidth: 1, borderColor: '#1E6FD9', marginBottom: 8 },
  telefonoRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  codigoBtn: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#1E6FD9', flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 100 },
  codigoBtnText: { color: '#FFFFFF', fontSize: 13 },
  arrow: { color: '#A8CFFF', fontSize: 10 },
  telefonoInput: { flex: 1, backgroundColor: '#0D1B2A', borderRadius: 10, padding: 14, color: '#FFFFFF', fontSize: 15, borderWidth: 1, borderColor: '#1E6FD9' },
  codigosLista: { backgroundColor: '#0D1B2A', borderRadius: 10, borderWidth: 1, borderColor: '#1E6FD9', marginBottom: 8 },
  codigoItem: { padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: '#1E3A5F' },
  codigoItemActivo: { backgroundColor: '#1E3A5F' },
  codigoItemText: { color: '#FFFFFF', fontSize: 14 },
  codigoItemCodigo: { color: '#1E6FD9', fontSize: 13 },
  button: { backgroundColor: '#FC4C02', paddingVertical: 16, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 12 },
  buttonDisabled: { backgroundColor: '#555' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  buttonSecundario: { paddingVertical: 14, width: '100%', alignItems: 'center' },
  buttonSecundarioText: { color: '#A8CFFF', fontSize: 15 },
});