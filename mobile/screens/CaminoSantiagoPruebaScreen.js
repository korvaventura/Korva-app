import React, { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import MapaRecorrido3D from '../components/MapaRecorrido3D';
import DetalleScreen from './DetalleScreen';

// Acceso únicamente desde la ruta de administrador en desarrollo.
// No consulta ni escribe progreso, compras o desafíos.
const escena = require('../services/mapa3d/escenas/caminoSantiago');
const horneado = require('../services/mapa3d/escenas/caminoSantiago.horneado');
const historia = require('../services/desafios/caminoSantiago');
const { CHALLENGE_ID } = require('../services/desafios/caminoSantiagoMapa');
const fichaPrueba = {
  id: CHALLENGE_ID, title: 'Camino de Santiago 775K', is_active: false,
  total_distance_km: 775, price_usd: 34.4, medal_code: '1001-ry-005',
  description: 'Recorre virtualmente el Camino Francés desde Roncesvalles hasta Santiago de Compostela. Acumula 775 km a tu ritmo y descubre 13 hitos entre los Pirineos, la Meseta y Galicia.',
  historia: 'Desde la acogida medieval de Roncesvalles hasta la plaza del Obradoiro, el Camino une lugares, historias y personas. Tu recorrido virtual sigue trece hitos del Camino Francés. Cada actividad suma a una misma aventura, sin fecha límite: avanzar, descubrir y llegar a Santiago a tu propio ritmo.',
  checkpoints: historia.checkpoints, medal_image_url: null, imagen_portada: null, galeria: [],
  modalidades: [{ tipo: 'run', label: 'Estándar', version: 'estandar', distancia_km: 775 }],
};
const paradas = [
  ['roncesvalles', 'Roncesvalles', 0], ['pamplona', 'Pamplona', 44],
  ['puente_la_reina', 'Puente la Reina', 69], ['irache', 'Irache', 94],
  ['santo_domingo', 'Santo Domingo de la Calzada', 194], ['burgos', 'Burgos', 269],
  ['fromista', 'Frómista', 337], ['leon', 'León', 456], ['astorga', 'Astorga', 507],
  ['ponferrada', 'Ponferrada', 562], ['o_cebreiro', 'O Cebreiro', 615],
  ['portomarin', 'Portomarín', 679], ['santiago', 'Santiago de Compostela', 775],
].map(([id, nombre, km]) => ({ id, nombre, km, kmFisico: km }));

export default function CaminoSantiagoPruebaScreen() {
  const insets = useSafeAreaInsets();
  const [foco, setFoco] = useState(null);
  const [progreso, setProgreso] = useState(0);
  const [seleccion, setSeleccion] = useState(null);
  const [altura, setAltura] = useState(0);
  const [error, setError] = useState('');
  const [verFicha, setVerFicha] = useState(false);
  if (!__DEV__) return null;
  if (verFicha) return <DetalleScreen challenge={fichaPrueba} onVolver={() => setVerFicha(false)}
    onInscribir={() => Alert.alert('Prueba local', 'La compra está deshabilitada en esta vista. No se crea ninguna inscripción ni se abre Shopify.')} />;
  const abrir = (url) => Linking.openURL(url).catch(() => setError('No se pudo abrir el enlace.'));
  return <View style={[styles.pantalla, { paddingTop: insets.top + 4, paddingBottom: Math.max(insets.bottom, 12) }]}>
    <Text style={styles.texto}>Prueba local · no guarda kilómetros</Text>
    <TouchableOpacity accessibilityRole="button" style={styles.boton} onPress={() => setVerFicha(true)}>
      <Text style={styles.texto}>Ver ficha del desafío</Text>
    </TouchableOpacity>
    <View style={styles.controles}>{[0, 0.5, 1].map((valor) =>
      <TouchableOpacity key={valor} accessibilityRole="button" accessibilityState={{ selected: progreso === valor }}
        style={[styles.boton, progreso === valor && styles.activo]}
        onPress={() => { setProgreso(valor); setSeleccion(null); }}>
        <Text style={styles.texto}>{valor * 100} %</Text>
      </TouchableOpacity>)}</View>
    <View style={styles.controles}>{[['Mojón',0],['Puente',69],['Catedral',775],['General',null]].map(([nombre,km]) =>
      <TouchableOpacity key={nombre} accessibilityRole="button" style={styles.boton}
        onPress={() => setFoco(km == null ? {general:true} : {km})}>
        <Text style={styles.texto}>{nombre}</Text>
      </TouchableOpacity>)}</View>
    <View style={{ flex: 1 }} onLayout={(e) => setAltura(e.nativeEvent.layout.height)}>
      {altura > 0 && <MapaRecorrido3D key={progreso} escena={escena} horneado={horneado}
        focoMonumento={foco}
        checkpoints={paradas} progreso={progreso} completado={progreso === 1}
        kmUsuario={775 * progreso} kmTotalUsuario={775} altura={altura}
        seleccionadoId={seleccion?.id} onSelect={setSeleccion} />}
    </View>
    {seleccion && <Text style={styles.texto}>{seleccion.nombre} · {seleccion.kmFisico} km</Text>}
    <Text style={styles.credito} onPress={() => abrir('https://www.openstreetmap.org/copyright')}>© colaboradores de OpenStreetMap · ODbL</Text>
    <Text style={styles.credito} onPress={() => abrir('https://www.scne.es/productos.html')}>MDT y Hidrografía © Instituto Geográfico Nacional · CC BY 4.0</Text>
    <Text style={styles.credito} onPress={() => abrir('https://www.ncei.noaa.gov/products/etopo-global-relief-model')}>Contexto de Europa · NOAA DEM Global Mosaic</Text>
    <Text style={styles.credito}>Natural Earth · Relieve simplificado y exagerado ×3</Text>
    {!!error && <Text style={styles.texto}>{error}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#0a1a26', padding: 8, paddingBottom: 24 },
  texto: { color: '#fff', textAlign: 'center', padding: 4 },
  controles: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginVertical: 6 },
  boton: { backgroundColor: '#294351', paddingHorizontal: 7, paddingVertical: 8, borderRadius: 8 },
  activo: { backgroundColor: '#e86400' },
  credito: { color: '#c6d3db', fontSize: 10, textAlign: 'center', paddingTop: 4 },
});
