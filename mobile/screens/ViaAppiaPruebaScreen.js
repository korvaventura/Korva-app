import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapaRecorrido from './MapaRecorrido';
import DetalleScreen from './DetalleScreen';
const { fichaPrueba } = require('../services/desafios/viaAppiaMapa');

export default function ViaAppiaPruebaScreen() {
  const [progreso, setProgreso] = useState(0);
  const [ficha, setFicha] = useState(false);
  const insets = useSafeAreaInsets();
  if (!__DEV__) return null;
  if (ficha) return <DetalleScreen challenge={fichaPrueba} onVolver={() => setFicha(false)}
    onInscribir={() => Alert.alert('Prueba local', 'Compra deshabilitada: no abre Shopify ni crea una inscripción.')} />;
  return <View style={{ flex: 1, paddingTop: insets.top + 8, paddingHorizontal: 12, backgroundColor: '#0a1a26' }}>
    <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 12 }}>Vía Appia · prueba local · no guarda kilómetros</Text>
    <Text style={{ color: '#c6d3db', textAlign: 'center', marginBottom: 12 }}>Esquema de los hitos. El mapa 3D propio sigue pendiente.</Text>
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
      {[0, .5, 1].map(p => <TouchableOpacity key={p} accessibilityRole="button" onPress={() => setProgreso(p)}
        style={{ backgroundColor: progreso === p ? '#e86400' : '#294351', padding: 14, borderRadius: 12 }}>
        <Text style={{ color: '#fff' }}>{p * 100} %</Text>
      </TouchableOpacity>)}
      <TouchableOpacity accessibilityRole="button" onPress={() => setFicha(true)} style={{ padding: 14 }}>
        <Text style={{ color: '#fff' }}>Ver ficha</Text>
      </TouchableOpacity>
    </View>
    <MapaRecorrido key={progreso} challengeId={fichaPrueba.id} challengeTitle={fichaPrueba.title}
      distanciaTotal={611} kmCompletados={611 * progreso} porcentaje={String(progreso * 100)} />
  </View>;
}
