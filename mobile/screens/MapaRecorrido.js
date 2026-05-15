import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import Svg, { Path, Circle, Rect, Text as SvgText } from 'react-native-svg';

const DISTANCIA_FISICA = 103;

const CHECKPOINTS_DEFAULT = [
  {
    id: 'tolhuin',
    nombre: 'Tolhuin',
    kmFisico: 0,
    emoji: '🏘️',
    pista: 'El punto de partida. Todo gran viaje empieza con un primer paso...',
    desc: 'El corazón de Tierra del Fuego. Su nombre en lengua Selk\'nam significa exactamente eso: "corazón". Fundada en 1972 con solo 20 casas, hoy tiene el autódromo más austral del mundo. Sus calles fueron diseñadas con manzanas redondas para que los niños jugaran protegidos del viento patagónico.',
    datoRaro: '🧭 Km 0 de tu aventura. Desde acá hasta Ushuaia, la Ruta Nacional 3 — la misma que arranca en Buenos Aires — llega a su fin.',
    x: 280, y: 40,
  },
  {
    id: 'lago_fagnano',
    nombre: 'Lago Fagnano',
    kmFisico: 20,
    emoji: '💧',
    pista: 'Un lago que guarda dos mundos en sus orillas... ¿cuáles son?',
    desc: 'El Lago Fagnano es el más grande de Tierra del Fuego. La Falla de Magallanes lo atraviesa en profundidad, separando dos placas tectónicas. Sus aguas tocan suelo argentino y chileno. En 1949 un terremoto de 7.8 grados generó olas sísmicas que transformaron su costa para siempre.',
    datoRaro: '⚡ Las placas que lo rodean se mueven 5.4mm por año. Estás corriendo sobre una falla activa.',
    x: 210, y: 75,
  },
  {
    id: 'paso_garibaldi',
    nombre: 'Paso Garibaldi',
    kmFisico: 45,
    emoji: '⛰️',
    pista: 'Un secreto guardado por generaciones, descubierto por un niño...',
    desc: 'Este paso fue descubierto en 1935 por Luis Garibaldi Honte, un descendiente Selk\'nam que de niño escuchó a su abuela hablar de un paso secreto que usaban los haush para cruzar la cordillera. El nombre "Garibaldi" no viene del prócer italiano: viene de una frase en dialecto que le gritaban de niño para que fuera a buscar agua.',
    datoRaro: '🚙 El primer vehículo en cruzarlo tardó 10 horas. Vos llegás antes.',
    x: 150, y: 115,
  },
  {
    id: 'monte_olivia',
    nombre: 'Monte Olivia',
    kmFisico: 80,
    emoji: '🗻',
    pista: 'Los yamanas le daban un nombre que describía su filo... ¿cuál era?',
    desc: 'En lengua yamana se llama "Uliwai" — punta de arpón. La cima fue conquistada por primera vez en 1913 por el cura salesiano Alberto María de Agostini, sin clavos de escalada. 35 años después, el segundo escalador en llegar encontró todavía intacta la bandera argentina que de Agostini había plantado en la cumbre.',
    datoRaro: '🏔️ 1.326 metros. El guardián silencioso de Ushuaia. Solo expertos llegan a su cima.',
    x: 80, y: 150,
  },
  {
    id: 'ushuaia',
    nombre: 'Ushuaia',
    kmFisico: 103,
    emoji: '🏁',
    pista: 'El lugar donde termina el mundo conocido...',
    desc: '¡Lo lograste! La ciudad más austral del mundo te recibe. Fue una colonia penal hasta 1947. El Canal Beagle lleva el nombre del barco en que viajó Charles Darwin cuando desarrolló su teoría de la evolución. Desde acá, el próximo punto habitado hacia el sur es la Antártida.',
    datoRaro: '🌍 Estás en el fin del mundo. Y tu medalla está en camino.',
    x: 30, y: 180,
  },
];

const RUTA = "M280,40 C260,52 240,62 210,75 C185,88 170,100 150,115 C125,132 100,143 80,150 C60,158 45,168 30,180";

const getPuntoEnRuta = (kmFisicos) => {
  const pct = Math.min(kmFisicos / DISTANCIA_FISICA, 1);
  const x = 280 + (30 - 280) * pct;
  const y = 40 + (180 - 40) * pct;
  return { x, y };
};

export default function MapaRecorrido({ kmCompletados, distanciaTotal, checkpointsData }) {
  const [modalVisible, setModalVisible] = useState(null);

  const factor = (distanciaTotal || DISTANCIA_FISICA) / DISTANCIA_FISICA;
  const kmFisicos = Math.min(parseFloat(kmCompletados) / factor, DISTANCIA_FISICA);
  const pctFisico = (kmFisicos / DISTANCIA_FISICA) * 100;
  const pinPos = getPuntoEnRuta(kmFisicos);

  const checkpoints = (checkpointsData && checkpointsData.length > 0)
    ? checkpointsData.map((cp, i) => ({ ...CHECKPOINTS_DEFAULT[i], ...cp }))
    : CHECKPOINTS_DEFAULT;

  const desbloqueado = (cp) => kmFisicos >= cp.kmFisico;
  const esInicio = modalVisible?.id === 'tolhuin';
  const esFin = modalVisible?.id === 'ushuaia';
  const estaDesbloqueado = modalVisible ? desbloqueado(modalVisible) : false;

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>🗺️ Tu recorrido</Text>

      <View style={styles.mapaWrapper}>
        <Svg width="100%" height={220} viewBox="0 0 320 220">
          <Rect x="0" y="0" width="320" height="220" fill="#0D1B2A" rx="16" />
          <Path d="M165,58 C182,52 222,54 238,63 C248,69 243,82 226,84 C204,87 172,81 162,73 C155,67 157,61 165,58" fill="#1E3A5F" opacity="0.9" />
          <SvgText x="200" y="73" fill="#4a6a8a" fontSize="7" textAnchor="middle">Lago Fagnano</SvgText>
          <Path d="M95,165 L115,135 L135,165" fill="none" stroke="#1E3A5F" strokeWidth="1.5" />
          <Path d="M110,165 L138,122 L166,165" fill="none" stroke="#1E3A5F" strokeWidth="1.5" />
          <Path d="M55,190 L75,162 L95,190" fill="none" stroke="#1E3A5F" strokeWidth="1.5" />
          <Path d="M0,205 C50,200 100,203 160,205 C220,207 270,204 320,205 L320,220 L0,220" fill="#1E3A5F" opacity="0.6" />
          <SvgText x="160" y="215" fill="#4a6a8a" fontSize="7" textAnchor="middle">Canal Beagle</SvgText>
          <Path d={RUTA} fill="none" stroke="#2a4a6a" strokeWidth="4" strokeLinecap="round" strokeDasharray="6,4" />
          {pctFisico > 0 && (
            <Path d={RUTA} fill="none" stroke="#FC4C02" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${pctFisico * 3.2} ${(100 - pctFisico) * 3.2}`} />
          )}
          {checkpoints.map((cp) => {
            const bloqueado = !desbloqueado(cp);
            return (
              <React.Fragment key={cp.id}>
                <Circle cx={cp.x} cy={cp.y} r={bloqueado ? 5 : 7} fill={bloqueado ? '#1E3A5F' : '#FC4C02'} stroke={bloqueado ? '#2a4a6a' : '#FFFFFF'} strokeWidth="2" onPress={() => setModalVisible(cp)} />
                {!bloqueado && (
                  <SvgText x={cp.x} y={cp.y - 12} fill="#FFFFFF" fontSize="8" textAnchor="middle" fontWeight="bold">{cp.nombre}</SvgText>
                )}
              </React.Fragment>
            );
          })}
          {kmFisicos > 0 && (
            <>
              <Circle cx={pinPos.x} cy={pinPos.y} r={11} fill="#FC4C02" opacity="0.25" />
              <Circle cx={pinPos.x} cy={pinPos.y} r={6} fill="#FC4C02" stroke="#FFFFFF" strokeWidth="2" />
              <SvgText x={pinPos.x} y={pinPos.y - 14} fill="#FC4C02" fontSize="8" textAnchor="middle" fontWeight="bold">{(kmFisicos * factor).toFixed(0)}km</SvgText>
            </>
          )}
          <SvgText x="30" y="195" fill="#FC4C02" fontSize="8" textAnchor="middle">META</SvgText>
        </Svg>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leyendaScroll}>
        {checkpoints.map((cp) => {
          const bloqueado = !desbloqueado(cp);
          return (
            <TouchableOpacity key={cp.id} style={[styles.leyendaItem, !bloqueado && styles.leyendaItemActivo]} onPress={() => setModalVisible(cp)}>
              <Text style={styles.leyendaEmoji}>{bloqueado ? '🔒' : cp.emoji}</Text>
              <Text style={[styles.leyendaNombre, !bloqueado && styles.leyendaNombreActivo]}>{cp.nombre}</Text>
              <Text style={styles.leyendaKm}>{(cp.kmFisico * factor).toFixed(0)}km</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={!!modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(null)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setModalVisible(null)}>
          <View style={[styles.modalCard, esInicio && styles.modalCardInicio, esFin && styles.modalCardFin, !estaDesbloqueado && styles.modalCardBloqueado]}>

            <Text style={styles.modalEmoji}>{estaDesbloqueado ? modalVisible?.emoji : '🔒'}</Text>
            <Text style={styles.modalNombre}>{modalVisible?.nombre}</Text>
            <Text style={styles.modalKm}>Km {((modalVisible?.kmFisico || 0) * factor).toFixed(0)} de {distanciaTotal}km</Text>

            {estaDesbloqueado ? (
              <>
                {(esInicio || esFin) && (
                  <View style={styles.mensajeEspecialBox}>
                    <Text style={styles.mensajeEspecial}>
                      {esInicio ? '🚀 ¡Bienvenido al desafío! Cada paso que des desde acá te acerca al fin del mundo.' : '🏅 ¡Lo lograste! Llegaste al fin del mundo. Tu medalla está en camino.'}
                    </Text>
                  </View>
                )}
                <Text style={styles.modalDesc}>{modalVisible?.desc}</Text>
                {modalVisible?.datoRaro && (
                  <View style={styles.datoRaroBox}>
                    <Text style={styles.datoRaroTexto}>{modalVisible.datoRaro}</Text>
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={styles.pistaBox}>
                  <Text style={styles.pistaTexto}>💭 {modalVisible?.pista}</Text>
                </View>

                <View style={styles.difuminadoWrapper}>
                  <Text style={styles.difuminadoTexto}>{modalVisible?.desc}</Text>
                  <View style={styles.difuminadoOverlay} />
                </View>

                <View style={styles.desbloqueoBox}>
                  <Text style={styles.desbloqueoTexto}>
                    🔒 Llegá a {((modalVisible?.kmFisico || 0) * factor).toFixed(0)}km para descubrir la historia completa
                  </Text>
                </View>
              </>
            )}

            <TouchableOpacity style={styles.modalBtn} onPress={() => setModalVisible(null)}>
              <Text style={styles.modalBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 8 },
  titulo: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 12 },
  mapaWrapper: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#1E3A5F', marginBottom: 12 },
  leyendaScroll: { marginBottom: 8 },
  leyendaItem: { backgroundColor: '#1E3A5F', borderRadius: 12, padding: 10, marginRight: 8, alignItems: 'center', minWidth: 80, borderWidth: 1, borderColor: 'transparent' },
  leyendaItemActivo: { borderColor: '#FC4C02' },
  leyendaEmoji: { fontSize: 18, marginBottom: 4 },
  leyendaNombre: { fontSize: 10, color: '#4a6a8a', fontWeight: 'bold', textAlign: 'center' },
  leyendaNombreActivo: { color: '#FFFFFF' },
  leyendaKm: { fontSize: 9, color: '#4a6a8a', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: '#1E3A5F', borderRadius: 24, padding: 28, alignItems: 'center', width: '100%' },
  modalCardInicio: { borderWidth: 2, borderColor: '#1E6FD9' },
  modalCardFin: { borderWidth: 2, borderColor: '#FC4C02' },
  modalCardBloqueado: { borderWidth: 2, borderColor: '#2a4a6a' },
  modalEmoji: { fontSize: 48, marginBottom: 12 },
  modalNombre: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  modalKm: { fontSize: 13, color: '#A8CFFF', marginBottom: 16 },
  mensajeEspecialBox: { backgroundColor: '#0D1B2A', borderRadius: 12, padding: 14, marginBottom: 16, width: '100%' },
  mensajeEspecial: { fontSize: 14, color: '#FC4C02', textAlign: 'center', fontWeight: 'bold', lineHeight: 22 },
  modalDesc: { fontSize: 13, color: '#A8CFFF', textAlign: 'center', lineHeight: 22, marginBottom: 12 },
  datoRaroBox: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 12, marginBottom: 16, width: '100%' },
  datoRaroTexto: { fontSize: 12, color: '#1E6FD9', textAlign: 'center', fontStyle: 'italic' },
  pistaBox: { backgroundColor: '#0D1B2A', borderRadius: 12, padding: 14, marginBottom: 16, width: '100%', borderWidth: 1, borderColor: '#2a4a6a' },
  pistaTexto: { fontSize: 14, color: '#A8CFFF', textAlign: 'center', fontStyle: 'italic', lineHeight: 22 },
  difuminadoWrapper: { width: '100%', marginBottom: 12, overflow: 'hidden', borderRadius: 10, maxHeight: 40 },
  difuminadoTexto: { fontSize: 13, color: '#1E3A5F', textAlign: 'center', lineHeight: 22, opacity: 0.3 },
  difuminadoOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#1E3A5F', opacity: 0.85, borderRadius: 10 },
  desbloqueoBox: { backgroundColor: '#0D1B2A', borderRadius: 12, padding: 14, marginBottom: 16, width: '100%', borderWidth: 1, borderColor: '#FC4C02' },
  desbloqueoTexto: { fontSize: 13, color: '#FC4C02', textAlign: 'center', fontWeight: 'bold' },
  modalBtn: { backgroundColor: '#FC4C02', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12 },
  modalBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
});
