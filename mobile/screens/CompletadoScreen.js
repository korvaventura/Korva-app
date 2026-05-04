import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { supabase } from '../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

export default function CompletadoScreen({ challenge, userId, onVolver }) {
  const [paso, setPaso] = useState(1);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [pais, setPais] = useState('');
  const [cargando, setCargando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const guardarDireccion = async () => {
    if (!nombre || !direccion || !ciudad || !pais) {
      alert('Completa todos los campos');
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
          shipping_address: { nombre, direccion, ciudad, pais }
        })
      });
      setGuardado(true);
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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Text style={styles.titulo}>Donde te enviamos la medalla?</Text>
        <Text style={styles.subtitulo}>Completa tu direccion de envio</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Nombre completo</Text>
          <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Tu nombre" placeholderTextColor="#A8CFFF" />

          <Text style={styles.label}>Direccion</Text>
          <TextInput style={styles.input} value={direccion} onChangeText={setDireccion} placeholder="Calle, numero, piso" placeholderTextColor="#A8CFFF" />

          <Text style={styles.label}>Ciudad</Text>
          <TextInput style={styles.input} value={ciudad} onChangeText={setCiudad} placeholder="Tu ciudad" placeholderTextColor="#A8CFFF" />

          <Text style={styles.label}>Pais</Text>
          <TextInput style={styles.input} value={pais} onChangeText={setPais} placeholder="Tu pais" placeholderTextColor="#A8CFFF" />
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
    <View
    
