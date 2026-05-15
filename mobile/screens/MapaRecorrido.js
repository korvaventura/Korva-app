import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import Svg, { Path, Circle, Rect, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';

const DISTANCIA_FISICA = 103;

// 1. NUEVA LÓGICA: Segmentos detallados para hacer la ruta sinuosa (Paso Garibaldi, etc.)
const ROUTE_SEGMENTS = [
  { km: 0,   x: 280, y: 35 },   // Tolhuin
  { km: 5,   x: 265, y: 42 },
  { km: 10,  x: 245, y: 48 },
  { km: 15,  x: 225, y: 55 },
  { km: 20,  x: 205, y: 62 },   // Lago Fagnano
  { km: 25,  x: 190, y: 65 },
  { km: 30,  x: 175, y: 68 },
  { km: 35,  x: 160, y: 75 },
  { km: 40,  x: 150, y: 88 },
  { km: 45,  x: 145, y: 105 },  // Paso Garibaldi (Inicio)
  { km: 48,  x: 160, y: 115 },  // Curva de herradura (Sale)
  { km: 52,  x: 140, y: 125 },  // Curva de herradura (Vuelve)
  { km: 60,  x: 125, y: 135 },
  { km: 70,  x: 100, y: 142 },
  { km: 80,  x: 75,  y: 148 },  // Monte Olivia
  { km: 90,  x: 50,  y: 160 },
  { km: 103, x: 25,  y: 175 },  // Ushuaia
];

// Genera el path base de toda la ruta uniendo los puntos
const RUTA_BASE_PATH = ROUTE_SEGMENTS.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

const CHECKPOINTS_DEFAULT = [
  {
    id: 'tolhuin', nombre: 'Tolhuin', kmFisico: 0, emoji: '🏘️',
    pista: 'El punto de partida. Todo gran viaje empieza con un primer paso...',
    desc: 'El corazón de Tierra del Fuego. Su nombre en lengua Selk\'nam significa "corazón". Fundada en 1972, tiene el autódromo más austral del mundo. Sus calles fueron diseñadas con manzanas redondas para proteger a los niños del viento.',
    datoRaro: '🧭 Km 0 de tu aventura. Acá empieza el fin de la Ruta Nacional 3.',
    x: 280, y: 35,
  },
  {
    id: 'lago_fagnano', nombre: 'Lago Fagnano', kmFisico: 20, emoji: '💧',
    pista: 'Un lago que guarda dos mundos en sus orillas... ¿cuáles son?',
    desc: 'El Lago Fagnano es el más grande de Tierra del Fuego. La Falla de Magallanes lo atraviesa en profundidad. Sus aguas tocan suelo argentino y chileno.',
    datoRaro: '⚡ Estás corriendo sobre una falla tectónica activa.',
    x: 205, y: 62,
  },
  {
    id: 'paso_garibaldi', nombre: 'Paso Garibaldi', kmFisico: 45, emoji: '⛰️',
    pista: 'Un secreto guardado por generaciones, descubierto por un niño...',
    desc: 'Descubierto en 1935 por Luis Garibaldi Honte, descendiente Selk\'nam. El nombre no viene del prócer, sino de una frase en dialecto que le gritaban de niño.',
    datoRaro: '🚙 El primer vehículo en cruzarlo tardó 10 horas. Vos llegás antes.',
    x: 145, y: 105,
  },
  {
    id: 'monte_olivia', nombre: 'Monte Olivia', kmFisico: 80, emoji: '🗻',
    pista: 'Los yamanas le daban un nombre que describía su filo... ¿cuál era?',
    desc: 'En lengua yamana se llama "Uliwai" (punta de arpón). La cima fue conquistada en 1913 por el cura Alberto de Agostini, sin clavos de escalada.',
    datoRaro: '🏔️ 1.326 metros. El guardián silencioso de Ushuaia.',
    x: 75, y: 148,
  },
  {
    id: 'ushuaia', nombre: 'Ushuaia', kmFisico: 103, emoji: '🏁',
    pista: 'El lugar donde termina el mundo conocido...',
    desc: '¡Lo lograste! La ciudad más austral del mundo te recibe. Fue una colonia penal hasta 1947. Desde acá, el próximo punto habitado hacia el sur es la Antártida.',
    datoRaro: '🌍 Estás en el fin del mundo. Y tu medalla está en camino.',
    x: 25, y: 175,
  },
];

// 2. Cálculo preciso de la posición interpolando entre segmentos
const getPuntoEnRuta = (kmFisicos) => {
  if (kmFisicos <= 0) return ROUTE_SEGMENTS[0];
  if (kmFisicos >= DISTANCIA_FISICA) return ROUTE_SEGMENTS[ROUTE_SEGMENTS.length - 1];

  for (let i = 0; i < ROUTE_SEGMENTS.length - 1; i++) {
    const p1 = ROUTE_SEGMENTS[i];
    const p2 = ROUTE_SEGMENTS[i + 1];

    if (kmFisicos >= p1.km && kmFisicos <= p2.km) {
      const pct = (kmFisicos - p1.km) / (p2.km - p1.km);
      return {
        x: p1.x + (p2.x - p1.x) * pct,
        y: p1.y + (p2.y - p1.y) * pct,
      };
    }
  }
  return ROUTE_SEGMENTS[ROUTE_SEGMENTS.length - 1];
};

// 3. Generar la línea naranja dinámicamente hasta el km actual
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
        const currentX = prev.x + (p.x - prev.x) * pct;
        const currentY = prev.y + (p.y - prev.y) * pct;
        d += `L ${currentX} ${currentY}`;
      }
      break;
    }
  }
  return d;
};

export default function MapaRecorrido({ kmCompletados, distanciaTotal, checkpointsData }) {
  const [modalVisible, setModalVisible] = useState(null);

  const factor = (distanciaTotal || DISTANCIA_FISICA) / DISTANCIA_FISICA;
  const kmFisicos = Math.min(parseFloat(kmCompletados || 0) / factor, DISTANCIA_FISICA);
  const pinPos = getPuntoEnRuta(kmFisicos);
  const pathCompletado = getCompletedPathString(kmFisicos);

  const checkpoints = (checkpointsData && checkpointsData.length > 0)
    ? checkpointsData.map((cp, i) => ({ ...CHECKPOINTS_DEFAULT[i], ...cp }))
    : CHECKPOINTS_DEFAULT;

  const desbloqueado = (cp) => kmFisicos >= cp.kmFisico;
  const esInicio = modalVisible?.id === 'tolhuin';
  const esFin = modalVisible?.id === 'ushuaia';
  const estaDesbloqueado = modalVisible ? desbloqueado(modalVisible) : false;

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>🗺️ Tu Recorrido</Text>

      <View style={styles.mapaWrapper}>
        <Svg width="100%" height={240} viewBox="0 0 320 240">
          <Defs>
            <LinearGradient id="gradBg" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#0F172A" stopOpacity="1" />
              <Stop offset="1" stopColor="#1E293B" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="320" height="240" fill="url(#gradBg)" />
          
          {/* Siluetas de montañas decorativas para textura (Sierra Alvear y Sorondo) */}
          <Path d="M0,120 Q40,90 80,130 T160,100 T240,110 T320,80 L320,240 L0,240 Z" fill="#334155" opacity="0.3" />
          <Path d="M0,150 Q60,110 120,160 T220,130 T320,140 L320,240 L0,240 Z" fill="#1E293B" opacity="0.6" />

          {/* Cuerpos de agua */}
          <Path d="M120,40 Q180,30 240,50 T320,45 L320,0 L120,0 Z" fill="#0284C7" opacity="0.15" />
          <SvgText x="180" y="25" fill="#7DD3FC" fontSize="8" textAnchor="middle" opacity="0.7">Lago Fagnano</SvgText>
          
          <Path d="M0,220 Q80,210 160,225 T320,215 L320,240 L0,240 Z" fill="#0284C7" opacity="0.15" />
          <SvgText x="160" y="235" fill="#7DD3FC" fontSize="8" textAnchor="middle" opacity="0.7">Canal Beagle</SvgText>

          {/* Ruta Base (Gris oscuro/Marrón) */}
          <Path d={RUTA_BASE_PATH} fill="none" stroke="#475569" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          
          {/* Ruta Completada (Naranja brillante) */}
          {pathCompletado !== "" && (
            <Path d={pathCompletado} fill="none" stroke="#EA580C" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* Checkpoints */}
          {checkpoints.map((cp) => {
            const bloqueado = !desbloqueado(cp);
            return (
              <React.Fragment key={cp.id}>
                {/* Sombra del punto */}
                <Circle cx={cp.x} cy={cp.y} r={bloqueado ? 5 : 8} fill="#000" opacity="0.3" translateY={2} />
                <Circle 
                  cx={cp.x} cy={cp.y} 
                  r={bloqueado ? 4 : 6} 
                  fill={bloqueado ? '#334155' : '#F97316'} 
                  stroke={bloqueado ? '#64748B' : '#FFFFFF'} 
                  strokeWidth="2" 
                  onPress={() => setModalVisible(cp)} 
                />
                {!bloqueado && (
                  <SvgText x={cp.x} y={cp.y - 12} fill="#F8FAFC" fontSize="9" textAnchor="middle" fontWeight="bold">
                    {cp.nombre}
                  </SvgText>
                )}
              </React.Fragment>
            );
          })}

          {/* Pin de progreso actual */}
          {kmFisicos > 0 && (
            <>
              {/* Resplandor del pin */}
              <Circle cx={pinPos.x} cy={pinPos.y} r={14} fill="#EA580C" opacity="0.3" />
              <Circle cx={pinPos.x} cy={pinPos.y} r={7} fill="#EA580C" stroke="#FFFFFF" strokeWidth="2.5" />
              <Rect x={pinPos.x - 18} y={pinPos.y - 28} width="36" height="16" rx="4" fill="#1E293B" opacity="0.9" />
              <SvgText x={pinPos.x} y={pinPos.y - 17} fill="#F97316" fontSize="9" textAnchor="middle" fontWeight="900">
                {(kmFisicos * factor).toFixed(0)}km
              </SvgText>
            </>
          )}
        </Svg>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leyendaScroll}>
        {checkpoints.map((cp) => {
          const bloqueado = !desbloqueado(cp);
          return (
            <TouchableOpacity 
              key={cp.id} 
              style={[styles.leyendaItem, !bloqueado && styles.leyendaItemActivo]} 
              onPress={() => setModalVisible(cp)}
            >
              <Text style={styles.leyendaEmoji}>{bloqueado ? '🔒' : cp.emoji}</Text>
              <View style={styles.leyendaTextos}>
                <Text style={[styles.leyendaNombre, !bloqueado && styles.leyendaNombreActivo]}>
                  {cp.nombre}
                </Text>
                <Text style={styles.leyendaKm}>{(cp.kmFisico * factor).toFixed(0)} km</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Modal - Se mantiene tu lógica original, con ligeros ajustes de color */}
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

const styles = StyleSheet.create({
  container: { marginBottom: 8 },
  titulo: { fontSize: 16, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 12 },
  mapaWrapper: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#334155', marginBottom: 16, backgroundColor: '#0F172A' },
  
  leyendaScroll: { marginBottom: 8 },
  leyendaItem: { 
    flexDirection: 'row',
    backgroundColor: '#1E293B', 
    borderRadius: 12, 
    padding: 12, 
    marginRight: 10, 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#334155' 
  },
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