import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, Animated, Dimensions } from 'react-native';
import Svg, { Path, Circle, Rect, Text as SvgText, Defs, LinearGradient, Stop, Mask } from 'react-native-svg';

const DISTANCIA_FISICA = 103;
const SCREEN_WIDTH = Dimensions.get('window').width;
const MAPA_WIDTH_VIRTUAL = 800; // El ancho real del mapa para hacer scroll

// Segmentos estirados para el mapa panorámico
const ROUTE_SEGMENTS = [
  { km: 0,   x: 720, y: 35 },
  { km: 5,   x: 680, y: 42 },
  { km: 10,  x: 630, y: 48 },
  { km: 15,  x: 580, y: 55 },
  { km: 20,  x: 520, y: 62 },
  { km: 25,  x: 480, y: 65 },
  { km: 30,  x: 440, y: 68 },
  { km: 35,  x: 400, y: 75 },
  { km: 40,  x: 370, y: 88 },
  { km: 45,  x: 350, y: 105 },
  { km: 48,  x: 390, y: 115 },  
  { km: 52,  x: 340, y: 125 },  
  { km: 60,  x: 300, y: 135 },
  { km: 70,  x: 240, y: 142 },
  { km: 80,  x: 180, y: 148 },
  { km: 90,  x: 120, y: 160 },
  { km: 103, x: 60,  y: 175 },
];

const RUTA_BASE_PATH = ROUTE_SEGMENTS.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

const CHECKPOINTS_DEFAULT = [
  { id: 'tolhuin', nombre: 'Tolhuin', kmFisico: 0, emoji: '🏘️', x: 720, y: 35, pista: 'El punto de partida...', desc: 'El corazón de Tierra del Fuego. Su nombre en lengua Selk\'nam significa "corazón"...', datoRaro: '🧭 Km 0 de tu aventura.' },
  { id: 'lago_fagnano', nombre: 'Lago Fagnano', kmFisico: 20, emoji: '💧', x: 520, y: 62, pista: 'Un lago que guarda...', desc: 'El más grande de Tierra del Fuego. La Falla de Magallanes lo atraviesa...', datoRaro: '⚡ Estás corriendo sobre una falla tectónica activa.' },
  { id: 'paso_garibaldi', nombre: 'Paso Garibaldi', kmFisico: 45, emoji: '⛰️', x: 350, y: 105, pista: 'Un secreto guardado...', desc: 'Descubierto en 1935 por Luis Garibaldi Honte...', datoRaro: '🚙 El primer vehículo en cruzarlo tardó 10 horas.' },
  { id: 'monte_olivia', nombre: 'Monte Olivia', kmFisico: 80, emoji: '🗻', x: 180, y: 148, pista: 'Los yamanas le daban...', desc: 'En lengua yamana se llama "Uliwai"...', datoRaro: '🏔️ 1.326 metros. El guardián silencioso.' },
  { id: 'ushuaia', nombre: 'Ushuaia', kmFisico: 103, emoji: '🏁', x: 60, y: 175, pista: 'El fin del mundo...', desc: '¡Lo lograste! La ciudad más austral...', datoRaro: '🌍 Estás en el fin del mundo.' },
];

const getPuntoEnRuta = (kmFisicos) => {
  if (kmFisicos <= 0) return ROUTE_SEGMENTS[0];
  if (kmFisicos >= DISTANCIA_FISICA) return ROUTE_SEGMENTS[ROUTE_SEGMENTS.length - 1];

  for (let i = 0; i < ROUTE_SEGMENTS.length - 1; i++) {
    const p1 = ROUTE_SEGMENTS[i];
    const p2 = ROUTE_SEGMENTS[i + 1];
    if (kmFisicos >= p1.km && kmFisicos <= p2.km) {
      const pct = (kmFisicos - p1.km) / (p2.km - p1.km);
      return { x: p1.x + (p2.x - p1.x) * pct, y: p1.y + (p2.y - p1.y) * pct };
    }
  }
  return ROUTE_SEGMENTS[ROUTE_SEGMENTS.length - 1];
};

const getCompletedPathString = (kmFisicos) => {
  if (kmFisicos <= 0) return "";
  let d = "";
  for (let i = 0; i < ROUTE_SEGMENTS.length; i++) {
    const p = ROUTE_SEGMENTS[i];
    if (p.km <= kmFisicos) {
      d += `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y} `;
    } else {
      const prev = ROUTE_SEGMENTS[i - 1];
      if (prev) {
        const pct = (kmFisicos - prev.km) / (p.km - prev.km);
        d += `L ${prev.x + (p.x - prev.x) * pct} ${prev.y + (p.y - prev.y) * pct}`;
      }
      break;
    }
  }
  return d;
};

// --- COMPONENTE DE CLIMA DINÁMICO (NIEVE) ---
const CopoNieve = ({ delay, startX, size, duration }) => {
  const translateY = useRef(new Animated.Value(-20)).current;
  const translateX = useRef(new Animated.Value(startX)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 280,
          duration: duration,
          delay: delay,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(translateX, { toValue: startX + 15, duration: duration / 2, useNativeDriver: true }),
          Animated.timing(translateX, { toValue: startX - 15, duration: duration / 2, useNativeDriver: true }),
        ])
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#F8FAFC',
        opacity: 0.7,
        shadowColor: '#FFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
        transform: [{ translateY }, { translateX }]
      }}
    />
  );
};

const EfectoNieve = () => {
  const copos = useRef(
    Array.from({ length: 35 }).map((_, i) => ({
      id: i,
      startX: Math.random() * SCREEN_WIDTH,
      delay: Math.random() * 3000,
      size: Math.random() * 3 + 2,
      duration: Math.random() * 2500 + 2000,
    }))
  ).current;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 10 }]} pointerEvents="none">
      {copos.map(c => <CopoNieve key={c.id} {...c} />)}
    </View>
  );
};
// --- FIN DEL COMPONENTE DE CLIMA ---

export default function MapaRecorrido({ kmCompletados, distanciaTotal, checkpointsData }) {
  const [modalVisible, setModalVisible] = useState(null);
  const scrollViewRef = useRef(null);
  
  const pulseAnim = useRef(new Animated.Value(0)).current;

  const factor = (distanciaTotal || DISTANCIA_FISICA) / DISTANCIA_FISICA;
  const kmFisicos = Math.min(parseFloat(kmCompletados || 0) / factor, DISTANCIA_FISICA);
  const pinPos = getPuntoEnRuta(kmFisicos);
  const pathCompletado = getCompletedPathString(kmFisicos);

  const checkpoints = (checkpointsData && checkpointsData.length > 0)
    ? checkpointsData.map((cp, i) => ({ ...CHECKPOINTS_DEFAULT[i], ...cp }))
    : CHECKPOINTS_DEFAULT;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { 
          toValue: 1, 
          duration: 1500, 
          useNativeDriver: false 
        })
      ])
    ).start();
  }, []);

  const animatedRadiusRadar = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 28] });
  const animatedRadiusSpotlight = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 32] });
  const animatedOpacity = pulseAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.6, 0.1, 0] });

  useEffect(() => {
    if (scrollViewRef.current) {
      const scrollToX = Math.max(0, pinPos.x - (SCREEN_WIDTH / 2));
      setTimeout(() => {
        scrollViewRef.current.scrollTo({ x: scrollToX, y: 0, animated: true });
      }, 500);
    }
  }, [kmFisicos]);

  const desbloqueado = (cp) => kmFisicos >= cp.kmFisico;
  const esInicio = modalVisible?.id === 'tolhuin';
  const esFin = modalVisible?.id === 'ushuaia';
  const estaDesbloqueado = modalVisible ? desbloqueado(modalVisible) : false;

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>🗺️ Explora el Fin del Mundo</Text>

      <View style={styles.mapaWrapper}>
        <ScrollView 
          ref={scrollViewRef}
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ width: MAPA_WIDTH_VIRTUAL }}
        >
          <Svg width={MAPA_WIDTH_VIRTUAL} height={260} viewBox={`0 0 ${MAPA_WIDTH_VIRTUAL} 260`}>
            <Defs>
              <LinearGradient id="gradBg" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#0F172A" stopOpacity="1" />
                <Stop offset="1" stopColor="#1E293B" stopOpacity="1" />
              </LinearGradient>
              
              {/* Máscara de Niebla (Fog of War) */}
              <Mask id="fogMask">
                <Rect x="0" y="0" width={MAPA_WIDTH_VIRTUAL} height="260" fill="white" />
                
                {pathCompletado !== "" && (
                  <Path d={pathCompletado} fill="none" stroke="black" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
                )}
                
                {checkpoints.filter(desbloqueado).map(cp => (
                  <Circle key={cp.id} cx={cp.x} cy={cp.y} r="20" fill="black" />
                ))}

                {kmFisicos > 0 && (
                  <AnimatedCircle 
                    key={`spot-${kmFisicos}`} 
                    cx={pinPos.x} 
                    cy={pinPos.y} 
                    r={animatedRadiusSpotlight} 
                    fill="black" 
                  />
                )}
              </Mask>
            </Defs>

            <Rect x="0" y="0" width={MAPA_WIDTH_VIRTUAL} height="260" fill="url(#gradBg)" />
            <Path d={`M0,140 Q${MAPA_WIDTH_VIRTUAL/4},90 ${MAPA_WIDTH_VIRTUAL/2},150 T${MAPA_WIDTH_VIRTUAL},100 L${MAPA_WIDTH_VIRTUAL},260 L0,260 Z`} fill="#334155" opacity="0.3" />
            
            <Path d="M400,40 Q550,20 700,50 T800,45 L800,0 L400,0 Z" fill="#0284C7" opacity="0.35" />
            <SvgText x="550" y="25" fill="#7DD3FC" fontSize="12" textAnchor="middle">Lago Fagnano</SvgText>

            <Path d={`M0,240 Q${MAPA_WIDTH_VIRTUAL/2},220 ${MAPA_WIDTH_VIRTUAL},245 L${MAPA_WIDTH_VIRTUAL},260 L0,260 Z`} fill="#0284C7" opacity="0.35" />
            <SvgText x="300" y="250" fill="#7DD3FC" fontSize="12" textAnchor="middle">Canal Beagle</SvgText>

            <Path d={RUTA_BASE_PATH} fill="none" stroke="#475569" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            {pathCompletado !== "" && (
              <Path d={pathCompletado} fill="none" stroke="#EA580C" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            )}

            {checkpoints.map((cp) => {
              const isDesbloqueado = desbloqueado(cp);
              return (
                <React.Fragment key={cp.id}>
                  <Circle cx={cp.x} cy={cp.y} r={isDesbloqueado ? 10 : 8} fill={isDesbloqueado ? '#F97316' : '#334155'} stroke={isDesbloqueado ? '#FFFFFF' : '#64748B'} strokeWidth="3" onPress={() => setModalVisible(cp)} />
                  {!isDesbloqueado && <SvgText x={cp.x} y={cp.y + 4} fill="#94A3B8" fontSize="10" textAnchor="middle">🔒</SvgText>}
                  <SvgText x={cp.x} y={cp.y - 18} fill="#F8FAFC" fontSize="12" textAnchor="middle" fontWeight="bold">{cp.nombre}</SvgText>
                </React.Fragment>
              );
            })}

            {/* Capa oscura que genera la niebla */}
            <Rect 
              x="0" y="0" 
              width={MAPA_WIDTH_VIRTUAL} height="260" 
              fill="#0D1B2A" 
              opacity="0.85" 
              mask="url(#fogMask)"
            />

            {/* Elementos de Progreso Activos (Por encima de la niebla) */}
            {kmFisicos > 0 && (
              <AnimatedCircle 
                key={`radar-${kmFisicos}`}
                cx={pinPos.x} 
                cy={pinPos.y} 
                r={animatedRadiusRadar} 
                fill="#EA580C" 
                opacity={animatedOpacity} 
              />
            )}
            
            {kmFisicos > 0 && (
              <>
                <Circle cx={pinPos.x} cy={pinPos.y} r={8} fill="#FFFFFF" stroke="#EA580C" strokeWidth="4" />
                
                {/* Fondo Oscuro del Kilometraje Centrado */}
                <Rect 
                  x={pinPos.x - 24} 
                  y={pinPos.y + 16} 
                  width="48" 
                  height="20" 
                  rx="10" 
                  fill="#1E293B" 
                />
                
                {/* Texto del Kilometraje Centrado */}
                <SvgText 
                  x={pinPos.x} 
                  y={pinPos.y + 26} 
                  fill="#F97316" 
                  fontSize="11" 
                  textAnchor="middle" 
                  alignmentBaseline="middle" 
                  fontWeight="900"
                >
                  {(kmFisicos * factor).toFixed(0)} km
                </SvgText>
              </>
            )}
          </Svg>
        </ScrollView>

        {/* 🏔️ CLIMA DINÁMICO: Nieva en la alta montaña (Km 40 al 85) */}
        {kmFisicos >= 40 && kmFisicos <= 85 && (
          <EfectoNieve />
        )}
      </View>
      
      <Text style={styles.scrollHint}>👈 Desliza para explorar la ruta 👉</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leyendaScroll}>
        {checkpoints.map((cp) => {
          const bloqueado = !desbloqueado(cp);
          return (
            <TouchableOpacity key={cp.id} style={[styles.leyendaItem, !bloqueado && styles.leyendaItemActivo]} onPress={() => setModalVisible(cp)}>
              <Text style={styles.leyendaEmoji}>{bloqueado ? '🔒' : cp.emoji}</Text>
              <View style={styles.leyendaTextos}>
                <Text style={[styles.leyendaNombre, !bloqueado && styles.leyendaNombreActivo]}>{cp.nombre}</Text>
                <Text style={styles.leyendaKm}>{(cp.kmFisico * factor).toFixed(0)} km</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={!!modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(null)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setModalVisible(null)}>
          <View style={[styles.modalCard, esInicio && styles.modalCardInicio, esFin && styles.modalCardFin, !estaDesbloqueado && styles.modalCardBloqueado]}>
            <Text style={styles.modalEmoji}>{estaDesbloqueado ? modalVisible?.emoji : '🔒'}</Text>
            <Text style={styles.modalNombre}>{modalVisible?.nombre}</Text>
            <Text style={styles.modalKm}>{((modalVisible?.kmFisico || 0) * factor).toFixed(0)}km de {distanciaTotal}km</Text>

            {estaDesbloqueado ? (
              <>
                {(esInicio || esFin) && (
                  <View style={styles.mensajeEspecialBox}>
                    <Text style={styles.mensajeEspecial}>
                      {esInicio ? '🚀 ¡Bienvenido al desafío! Cada Paso Cuenta y te acerca al fin del mundo.' : '🏅 ¡Lo lograste! Llegaste al fin del mundo. Tu medalla está en camino.'}
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

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  titulo: { fontSize: 16, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 12 },
  mapaWrapper: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#334155', backgroundColor: '#0F172A', position: 'relative' },
  scrollHint: { textAlign: 'center', color: '#64748B', fontSize: 11, marginTop: 8, marginBottom: 12, fontStyle: 'italic' },
  leyendaScroll: { marginBottom: 8 },
  leyendaItem: { flexDirection: 'row', backgroundColor: '#1E293B', borderRadius: 12, padding: 12, marginRight: 10, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  leyendaItemActivo: { borderColor: '#EA580C', backgroundColor: '#0F172A' },
  leyendaEmoji: { fontSize: 20, marginRight: 8 },
  leyendaTextos: { justifyContent: 'center' },
  leyendaNombre: { fontSize: 12, color: '#64748B', fontWeight: 'bold' },
  leyendaNombreActivo: { color: '#F8FAFC' },
  leyendaKm: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: '#1E293B', borderRadius: 24, padding: 28, alignItems: 'center', width: '100%', borderColor: '#334155', borderWidth: 1 },
  modalCardInicio: { borderColor: '#3B82F6' },
  modalCardFin: { borderColor: '#EA580C' },
  modalCardBloqueado: { borderColor: '#334155' },
  modalEmoji: { fontSize: 48, marginBottom: 12 },
  modalNombre: { fontSize: 24, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 4 },
  modalKm: { fontSize: 14, color: '#94A3B8', marginBottom: 20 },
  mensajeEspecialBox: { backgroundColor: '#0F172A', borderRadius: 12, padding: 14, marginBottom: 16, width: '100%' },
  mensajeEspecial: { fontSize: 14, color: '#EA580C', textAlign: 'center', fontWeight: 'bold', lineHeight: 22 },
  modalDesc: { fontSize: 14, color: '#E2E8F0', textAlign: 'center', lineHeight: 24, marginBottom: 16 },
  datoRaroBox: { backgroundColor: '#0F172A', borderRadius: 10, padding: 12, marginBottom: 20, width: '100%', borderLeftWidth: 3, borderLeftColor: '#3B82F6' },
  datoRaroTexto: { fontSize: 13, color: '#3B82F6', textAlign: 'center', fontStyle: 'italic' },
  pistaBox: { backgroundColor: '#0F172A', borderRadius: 12, padding: 14, marginBottom: 16, width: '100%', borderWidth: 1, borderColor: '#334155' },
  pistaTexto: { fontSize: 14, color: '#CBD5E1', textAlign: 'center', fontStyle: 'italic', lineHeight: 22 },
  difuminadoWrapper: { width: '100%', marginBottom: 16, overflow: 'hidden', borderRadius: 10, maxHeight: 40 },
  difuminadoTexto: { fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 22, opacity: 0.3 },
  difuminadoOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#1E293B', opacity: 0.85 },
  desbloqueoBox: { backgroundColor: '#0F172A', borderRadius: 12, padding: 14, marginBottom: 20, width: '100%', borderWidth: 1, borderColor: '#EA580C' },
  desbloqueoTexto: { fontSize: 13, color: '#EA580C', textAlign: 'center', fontWeight: 'bold' },
  modalBtn: { backgroundColor: '#EA580C', paddingVertical: 14, paddingHorizontal: 36, borderRadius: 12, width: '100%', alignItems: 'center' },
  modalBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
});