import React, { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import MapaRecorrido3D from '../components/MapaRecorrido3D';
import DetalleScreen from './DetalleScreen';

// Acceso únicamente desde la ruta de administrador en desarrollo.
// No consulta ni escribe progreso, compras o desafíos.
const { escenaParaConfig } = require('../services/mapa3d/escenas');
const historia = require('../services/desafios/viaAppia');
const { fichaPrueba } = require('../services/desafios/viaAppiaMapa');
const paradas = historia.checkpoints.map(({ id, nombre, kmFisico }) => ({ id, nombre, km: kmFisico, kmFisico }));
// Anclas de inspección: funcionan sin miniaturas cargadas.
const anclas = [['Inicio', 'brindisi'], ['Oria', 'oria'], ['Gravina', 'gravina'], ['Benevento', 'benevento'], ['Cecilia', 'cecilia_metella'], ['Roma', 'roma'], ['General', null]];

export default function ViaAppiaPruebaScreen() {
  const insets = useSafeAreaInsets();
  const [mapa] = useState(() => escenaParaConfig('via_appia'));
  const [foco, setFoco] = useState(null);
  const [progreso, setProgreso] = useState(0);
  const [seleccion, setSeleccion] = useState(null);
  const [altura, setAltura] = useState(0);
  const [error, setError] = useState('');
  const [verFicha, setVerFicha] = useState(false);
  if (!__DEV__) return null;
  if (verFicha) return <DetalleScreen challenge={fichaPrueba} onVolver={() => setVerFicha(false)}
    onInscribir={() => Alert.alert('Prueba local', 'Compra deshabilitada: no abre Shopify ni crea una inscripción.')} />;
  const abrir = (url) => Linking.openURL(url).catch(() => setError('No se pudo abrir el enlace.'));
  return <View style={[styles.pantalla, { paddingTop: insets.top + 4, paddingBottom: Math.max(insets.bottom, 12) }]}>
    <Text style={styles.texto}>Vía Appia · prueba local · no guarda kilómetros</Text>
    <TouchableOpacity accessibilityRole="button" style={styles.boton} onPress={() => setVerFicha(true)}>
      <Text style={styles.texto}>Ver ficha del desafío</Text>
    </TouchableOpacity>
    <View style={styles.controles}>{[0, 0.5, 1].map((valor) =>
      <TouchableOpacity key={valor} accessibilityRole="button" accessibilityState={{ selected: progreso === valor }}
        style={[styles.boton, progreso === valor && styles.activo]}
        onPress={() => { setProgreso(valor); setSeleccion(null); setFoco(null); }}>
        <Text style={styles.texto}>{valor * 100} %</Text>
      </TouchableOpacity>)}</View>
    <View style={styles.controles}>{anclas.map(([nombre, id]) =>
      <TouchableOpacity key={nombre} accessibilityRole="button" style={styles.boton}
        onPress={() => setFoco(id == null ? { general: true } : { id })}>
        <Text style={styles.texto}>{nombre}</Text>
      </TouchableOpacity>)}</View>
    <View style={{ flex: 1 }} onLayout={(e) => setAltura(e.nativeEvent.layout.height)}>
      {altura > 0 && <MapaRecorrido3D key={progreso} escena={mapa.escena} horneado={mapa.horneado}
        focoMonumento={foco}
        checkpoints={paradas} progreso={progreso} completado={progreso === 1}
        kmUsuario={611 * progreso} kmTotalUsuario={611} altura={altura}
        seleccionadoId={seleccion?.id} onSelect={setSeleccion} />}
    </View>
    {seleccion && <Text style={styles.texto}>{seleccion.nombre} · {seleccion.kmFisico} km</Text>}
    <Text style={styles.credito} onPress={() => abrir('https://doi.org/10.5281/zenodo.17122148')}>Traza: Itiner-e (de Soto, Pažout, Brughmans, Vahlstrup) · CC BY 4.0</Text>
    <Text style={styles.credito} onPress={() => abrir('https://www.ncei.noaa.gov/products/etopo-global-relief-model')}>Relieve: NOAA NCEI DEM Global Mosaic</Text>
    <Text style={styles.credito}>Costa y lagos: Natural Earth · Relieve exagerado ×3</Text>
    {!!error && <Text style={styles.texto}>{error}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#0a1a26', padding: 8, paddingBottom: 24 },
  texto: { color: '#fff', textAlign: 'center', padding: 4 },
  controles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 5, marginVertical: 6 },
  boton: { backgroundColor: '#294351', paddingHorizontal: 7, paddingVertical: 8, borderRadius: 8 },
  activo: { backgroundColor: '#e86400' },
  credito: { color: '#c6d3db', fontSize: 10, textAlign: 'center', paddingTop: 4 },
});
