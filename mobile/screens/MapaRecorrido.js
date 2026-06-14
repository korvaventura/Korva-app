import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, Animated, Dimensions } from 'react-native';
import Svg, { Path, Circle, Rect, Text as SvgText, Defs, LinearGradient, Stop, Mask, Ellipse, Polygon, G } from 'react-native-svg';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MAPA_WIDTH_VIRTUAL = 800;

const normalizar = (str) =>
  (str || '').toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

// ─── CONFIGURACIONES POR CHALLENGE ───────────────────────────────

const CONFIGS = {

  // ── FIN DEL MUNDO 103km ──────────────────────────────────────
  default: {
    titulo: '🗺️ Explora el Fin del Mundo',
    distanciaFisica: 103,
    clima: 'mixto',
    segmentos: [
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
    ],
    decoraciones: () => (
      <G pointerEvents="none">
        <Path d={`M0,140 Q${MAPA_WIDTH_VIRTUAL/4},90 ${MAPA_WIDTH_VIRTUAL/2},150 T${MAPA_WIDTH_VIRTUAL},100 L${MAPA_WIDTH_VIRTUAL},260 L0,260 Z`} fill="#334155" opacity="0.3" />
        <Path d="M400,40 Q550,20 700,50 T800,45 L800,0 L400,0 Z" fill="#0284C7" opacity="0.35" />
        <SvgText x="550" y="25" fill="#7DD3FC" fontSize="12" textAnchor="middle">Lago Fagnano</SvgText>
        <Path d={`M0,240 Q${MAPA_WIDTH_VIRTUAL/2},220 ${MAPA_WIDTH_VIRTUAL},245 L${MAPA_WIDTH_VIRTUAL},260 L0,260 Z`} fill="#0284C7" opacity="0.35" />
        <SvgText x="300" y="250" fill="#7DD3FC" fontSize="12" textAnchor="middle">Canal Beagle</SvgText>
      </G>
    ),
    checkpoints: [
      { id: 'tolhuin', nombre: 'Tolhuin', kmFisico: 0, emoji: '🏘️', x: 720, y: 35,
        pista: 'Dicen que su nombre significa algo que late. ¿Qué esconde este pueblo al borde del mundo?',
        desc: 'Tolhuin significa "corazón" en lengua Selk\'nam, el pueblo originario que habitó Tierra del Fuego por miles de años antes de ser exterminado en el siglo XX. Este pequeño pueblo de 2.000 habitantes es el punto medio exacto entre el Atlántico y el Pacífico en esta latitud. Su panadería "La Unión", abierta las 24 horas, es famosa en toda la Patagonia — los camioneros que cruzan la isla de noche la consideran un faro en la oscuridad.',
        datoRaro: '💀 El pueblo Selk\'nam fue casi exterminado entre 1890 y 1905. Los estancieros pagaban una libra esterlina por par de orejas. Tolhuin es su legado vivo.' },
      { id: 'lago_fagnano', nombre: 'Lago Fagnano', kmFisico: 20, emoji: '💧', x: 520, y: 62,
        pista: 'Hay una fuerza invisible que divide este lago en dos. Una fuerza que mueve continentes.',
        desc: 'El Lago Fagnano, o Kami en lengua Selk\'nam, está partido al medio por la Falla de Magallanes — la misma falla que separó América del Sur de la Antártida hace 30 millones de años. La orilla norte está en la Placa Sudamericana y la orilla sur en la Placa Scotia. El lago mide 105km de largo y sus aguas son tan frías que nunca superan los 9°C.',
        datoRaro: '🌍 Las dos orillas del lago están en placas tectónicas diferentes. Cada año se separan 7mm. En un millón de años, este lago será un estrecho marino.' },
      { id: 'paso_garibaldi', nombre: 'Paso Garibaldi', kmFisico: 45, emoji: '⛰️', x: 350, y: 105,
        pista: 'Un hombre cruzó este paso por primera vez en auto. Le tomó algo que hoy parece increíble.',
        desc: 'El Paso Garibaldi, a 433 metros sobre el nivel del mar, fue transitado por primera vez en vehículo motorizado en 1945. El viaje desde Ushuaia hasta Tolhuin en ese primer auto tardó 3 días. Hoy tardás 45 minutos. Los bosques de lenga que te rodean son de los más australes del planeta — un árbol que existía cuando los dinosaurios caminaban por la Patagonia.',
        datoRaro: '🦕 Los árboles de lenga son parientes directos de los bosques del supercontinente Gondwana, hace 180 millones de años. Son fósiles vivientes.' },
      { id: 'monte_olivia', nombre: 'Monte Olivia', kmFisico: 80, emoji: '🗻', x: 180, y: 148,
        pista: 'Los yamanas tenían un nombre para este pico. Un nombre que los científicos usaron para algo sorprendente.',
        desc: 'El Monte Olivia se llama "Aiken" en lengua yamana. Sus 1.326 metros dominan el Canal Beagle y fueron el primer punto de referencia que los marineros del HMS Beagle — el mismo barco de Darwin — usaron para orientarse en 1833. Darwin describió este pico como "el centinela del fin del mundo". El glaciar de su cara norte se retira 12 metros por año.',
        datoRaro: '🧬 La palabra "mamihlapinatapai" — yamana — está en el Libro Guinness como la palabra más concisa del mundo. La lengua yamana tenía más de 32.000 palabras.' },
      { id: 'ushuaia', nombre: 'Ushuaia', kmFisico: 103, emoji: '🏁', x: 60, y: 175,
        pista: 'La ciudad más austral del mundo esconde una historia oscura debajo de su fama turística.',
        desc: '¡Llegaste al fin del mundo! Ushuaia fue fundada en 1884 como presidio — una cárcel para los presos más peligrosos de Argentina. El mismo edificio que hoy es el Museo del Fin del Mundo albergó a asesinos, anarquistas y disidentes políticos hasta 1947. Hoy tiene 80.000 habitantes y es la puerta de entrada a la Antártida.',
        datoRaro: '🚢 A 1.000km al sur está el continente más frío, más seco y más ventoso del planeta. Llegaste tan al sur como se puede llegar por tierra.' },
    ],
  },

  // ── DUBROVNIK 19.4km — MURALLAS CON SEGMENTOS RECTOS ─────────
  dubrovnik: {
    titulo: '🗺️ Las Murallas de Dubrovnik',
    distanciaFisica: 19.4,
    clima: 'sol_mediterraneo',
    // Ruta sigue el perímetro de las murallas: segmentos RECTOS entre torres
    // Empieza en Pile Gate (oeste), sube al norte, cruza al este, baja al sur, vuelve al oeste
    segmentos: [
      { km: 0,    x: 120, y: 180 }, // Pile Gate (oeste, inicio)
      { km: 1.5,  x: 120, y: 120 }, // Torre noroeste
      { km: 3.5,  x: 120, y: 60  }, // Fort Lovrijenac área norte
      { km: 5,    x: 220, y: 60  }, // Torre norte-1
      { km: 6.5,  x: 320, y: 60  }, // Torre norte-2
      { km: 8,    x: 420, y: 60  }, // Stradun / torre norte-3
      { km: 9.5,  x: 520, y: 60  }, // Torre norte-4
      { km: 11,   x: 620, y: 60  }, // Torre noreste
      { km: 12,   x: 680, y: 100 }, // Fort Bokar área este
      { km: 13,   x: 680, y: 150 }, // Torre este-1
      { km: 14,   x: 680, y: 200 }, // Torre este-2 — Minčeta area
      { km: 15.5, x: 580, y: 200 }, // Torre sur-1
      { km: 16.5, x: 480, y: 200 }, // Torre sur-2
      { km: 17.5, x: 320, y: 200 }, // Torre sur-3
      { km: 18.5, x: 200, y: 200 }, // Torre suroeste
      { km: 19.4, x: 120, y: 180 }, // Ploče Gate — cierra el circuito
    ],
    decoraciones: () => (
      <G pointerEvents="none">
        {/* Fondo mar Adriático */}
        <Rect x="0" y="0" width={MAPA_WIDTH_VIRTUAL} height="260" fill="#0c4a6e" opacity="0.2" />
        {/* Ciudad interior */}
        <Rect x="120" y="60" width="560" height="140" fill="#78716c" opacity="0.12" rx="4" />
        <SvgText x="400" y="140" fill="#d4a76a" fontSize="11" textAnchor="middle" opacity="0.5">Ciudad Vieja · Ragusa</SvgText>
        {/* Mar al sur */}
        <Rect x="0" y="215" width={MAPA_WIDTH_VIRTUAL} height="45" fill="#0284C7" opacity="0.25" />
        <SvgText x="400" y="248" fill="#7DD3FC" fontSize="12" textAnchor="middle">Mar Adriático</SvgText>
        <SvgText x="60" y="30" fill="#A8CFFF" fontSize="11" textAnchor="middle">Dalmacia · Croacia</SvgText>
      </G>
    ),
    checkpoints: [
      { id: 'pile_gate', nombre: 'Pile Gate', kmFisico: 0, emoji: '🏰', x: 120, y: 180,
        pista: 'Por esta puerta entró y salió una república que desafió a imperios durante 450 años. ¿Cómo lo lograron?',
        desc: 'La Puerta Pile es la entrada principal a Dubrovnik desde el siglo XV. Detrás de este arco de piedra nació la República de Ragusa. Mientras Europa se desangraba en guerras religiosas, Ragusa abolió la esclavitud en 1416 — 400 años antes que Estados Unidos — y estableció el primer sistema de cuarentena del mundo en 1377. Su secreto: nunca pelear. Pagar tributo a todos, aliarse con todos, sobrevivir a todos.',
        datoRaro: '🏛️ Ragusa abolió la esclavitud en 1416. El primer país del mundo en hacerlo. Mientras tanto, el resto de Europa todavía la consideraba completamente normal.' },
      { id: 'fort_lovrijenac', nombre: 'Fort Lovrijenac', kmFisico: 4, emoji: '⚔️', x: 120, y: 60,
        pista: 'Sus muros tienen un secreto arquitectónico. En un lado son indestructibles. En el otro, papel.',
        desc: 'La Fortaleza de San Lorenzo fue construida en 3 meses para evitar que Venecia se instalara ahí primero. Sus muros tienen hasta 12 metros de grosor mirando al mar. Pero los muros que miran hacia la ciudad miden apenas 60 centímetros — una trampa intencional: si un traidor la tomaba, los ragusanos podían destruirla sin dañar la ciudad.',
        datoRaro: '🎭 Game of Thrones usó esta fortaleza como la Roca Casterly. El lema grabado dice: "La libertad no se vende por todo el oro del mundo" — y lo cumplieron por 450 años.' },
      { id: 'stradun', nombre: 'Stradun', kmFisico: 8, emoji: '🪨', x: 420, y: 60,
        pista: 'Esta calle fue destruida por un desastre natural. Lo que la reemplazó es más brillante que el original.',
        desc: 'El Stradun es el corazón de Dubrovnik. Antes del terremoto de 1667 que mató a la mitad de la población era irregular. La reconstrucción la transformó en piedra caliza blanca perfectamente uniforme, pulida por siglos de pasos hasta brillar como mármol. Bajo esta calle corre el canal que separaba la ciudad croata de la colonia romana.',
        datoRaro: '🌍 La piedra viene de la isla de Korčula — la misma donde nació Marco Polo. Cada vez que pisás estas piedras, pisás la misma cantera que pisó el explorador más famoso de la historia.' },
      { id: 'fort_bokar', nombre: 'Fort Bokar', kmFisico: 12, emoji: '🔭', x: 680, y: 100,
        pista: 'Es la fortaleza circular más antigua de Europa. Pero su verdadero poder no estaba en los cañones.',
        desc: 'El Fort Bokar fue diseñado por el mismo arquitecto que construyó palacios para los Médici en Florencia. Su forma circular eliminaba los ángulos muertos. Pero el secreto de Dubrovnik no era militar: la república mantenía embajadores en Estambul, Roma, Madrid y Londres al mismo tiempo, pagando tributo a todos.',
        datoRaro: '⚓ En 1991, la armada yugoslava bombardeó Dubrovnik. Fort Bokar, que había sobrevivido 500 años sin disparar un tiro en serio, vio caer bombas a metros de sus muros. La ciudad resistió igual.' },
      { id: 'minceta_tower', nombre: 'Torre Minčeta', kmFisico: 16, emoji: '👑', x: 480, y: 200,
        pista: 'Desde acá arriba, una ciudad entera parece un mapa. Pero lo que ves también lo vio alguien que cambió la historia.',
        desc: 'La Torre Minčeta es el punto más alto de las murallas. Desde aquí, los vigías podían ver barcos enemigos con horas de anticipación. Esa ventaja les dio tiempo para esconder el tesoro de la república o preparar la diplomacia de emergencia. En 500 años de república, nunca necesitaron defenderse por la fuerza.',
        datoRaro: '👁️ Desde aquí se puede ver la isla de Lokrum, donde Ricardo Corazón de León naufragó en 1192 de regreso de las Cruzadas. Ragusa lo rescató y él prometió construir una catedral. La catedral todavía está en pie.' },
      { id: 'ploce_gate', nombre: 'Ploče Gate', kmFisico: 19.4, emoji: '🌊', x: 120, y: 180,
        pista: 'La puerta oriental de la ciudad. Por aquí entraban las especias de Oriente. Y también los espías.',
        desc: '¡Lo lograste! La Puerta Ploče era la entrada oriental de Ragusa, por donde llegaban las caravanas desde el Imperio Otomano cargadas de plata, especias y seda. Ragusa sobrevivió a Venecia, al Imperio Otomano y a Napoleón no por su ejército, sino por saber siempre más que sus vecinos.',
        datoRaro: '🏅 Ragusa fue república independiente desde 1358 hasta 1808, cuando Napoleón la disolvió. Duró 450 años. La mayoría de los países modernos tienen menos de 100.' },
    ],
  },

  // ── SAN ANDRÉS 27km — ARCHIPIÉLAGO SALTANDO ENTRE ISLAS ─────
  san_andres: {
    titulo: '🗺️ El Archipiélago de San Andrés',
    distanciaFisica: 57,
    clima: 'caribe',
    // Ruta salta entre: isla principal → Johnny Cay → Rose Cay → Haynes Cay → Acuario → vuelta sur
    segmentos: [
      { km: 0,  x: 280, y: 160 }, // San Andrés Town (isla principal, norte)
      { km: 6,  x: 340, y: 100 }, // Norte de la isla
      { km: 10, x: 420, y: 70  }, // Johnny Cay (salto al cayo)
      { km: 15, x: 520, y: 55  }, // Rose Cay
      { km: 21, x: 640, y: 70  }, // Haynes Cay
      { km: 27, x: 700, y: 130 }, // El Acuario (arrecife este)
      { km: 34, x: 660, y: 190 }, // Cueva de Morgan (sur isla)
      { km: 40, x: 540, y: 215 }, // El Hoyo (costa oeste)
      { km: 44, x: 400, y: 220 }, // Costa suroeste
      { km: 48, x: 280, y: 210 }, // La Piscinita
      { km: 53, x: 160, y: 200 }, // Costa sur
      { km: 57, x: 100, y: 180 }, // Punta Sur
    ],
    decoraciones: () => (
      <G pointerEvents="none">
        {/* Fondo mar Caribe */}
        <Rect x="0" y="0" width={MAPA_WIDTH_VIRTUAL} height="260" fill="#0891b2" opacity="0.15" />
        {/* Isla principal San Andrés */}
        <Path d="M230,90 L260,70 L310,65 L350,70 L370,90 L375,120 L365,155 L340,175 L300,185 L265,180 L240,165 L225,140 L220,115 Z"
          fill="#16a34a" opacity="0.35" />
        <SvgText x="295" y="130" fill="#bbf7d0" fontSize="10" textAnchor="middle">San Andrés</SvgText>
        {/* Cayos principales */}
        <Ellipse cx="420" cy="65" rx="22" ry="12" fill="#16a34a" opacity="0.4" />
        <SvgText x="420" y="50" fill="#bbf7d0" fontSize="9" textAnchor="middle">Johnny Cay</SvgText>
        <Ellipse cx="640" cy="65" rx="20" ry="10" fill="#16a34a" opacity="0.4" />
        <SvgText x="640" y="52" fill="#bbf7d0" fontSize="9" textAnchor="middle">Haynes Cay</SvgText>
        <SvgText x="680" y="248" fill="#7DD3FC" fontSize="12" textAnchor="middle">Mar Caribe · Colombia</SvgText>
      </G>
    ),
    checkpoints: [
      { id: 'san_andres_town', nombre: 'San Andrés Town', kmFisico: 0, emoji: '🏝️', x: 280, y: 160,
        pista: 'Esta isla tiene un mar con siete nombres. Y una identidad que ningún país supo bien qué hacer con ella.',
        desc: 'San Andrés es colombiana por decreto pero caribeña por alma. Sus habitantes originales, los raizales, son descendientes de esclavos africanos, piratas ingleses y colonos puritanos que llegaron en 1629 — antes que Colombia existiera. Hablan creole y se sienten más cercanos a Jamaica que a Bogotá. Colombia los reclamó en 1822, Nicaragua los disputó hasta 2012. La identidad raizal sobrevivió a todo.',
        datoRaro: '🌊 El "Sea of Seven Colors" no es marketing. La combinación de profundidades y refracción de luz crea literalmente siete tonos de azul y verde visibles desde el aire.' },
      { id: 'johnny_cay', nombre: 'Johnny Cay', kmFisico: 11, emoji: '🏖️', x: 420, y: 70,
        pista: 'Un islote tan pequeño que podés rodearlo caminando en 10 minutos. Pero su arrecife es otro mundo.',
        desc: 'Johnny Cay es un islote coralino de apenas 4 hectáreas rodeado por uno de los arrecifes más coloridos del Caribe. Sus aguas tienen visibilidad de hasta 30 metros. Es reserva natural protegida — no se puede construir nada. La única infraestructura permitida es la que ya existía antes de la declaración de reserva.',
        datoRaro: '🐠 El pez loro come coral y lo excreta como arena blanca. El 85% de la arena blanca de las playas caribeñas es, técnicamente, excremento de pez loro.' },
      { id: 'haynes_cay', nombre: 'Haynes Cay', kmFisico: 21, emoji: '🤿', x: 640, y: 70,
        pista: 'Una piscina que no construyó nadie. Y que tardó miles de años en formarse.',
        desc: 'Haynes Cay y el área del Acuario forman una laguna natural protegida por la barrera de coral. Visibilidad de hasta 30 metros. Las tortugas verdes que anidan aquí hacen migraciones de hasta 2.000km para volver exactamente a la misma playa donde nacieron.',
        datoRaro: '🐢 Las tortugas marinas existen desde hace 110 millones de años. Vieron nacer y morir a los dinosaurios. Su linaje es 50 veces más antiguo que el ser humano moderno.' },
      { id: 'cueva_morgan', nombre: 'Cueva de Morgan', kmFisico: 34, emoji: '💰', x: 660, y: 190,
        pista: 'El pirata más rico de su época escondió algo acá. Cuatrocientos años después, nadie lo encontró.',
        desc: 'Henry Morgan no era un pirata común — era un corsario con patente inglesa. En 1671 saqueó Panamá City y desapareció con un botín equivalente a cientos de millones actuales. La leyenda dice que parte llegó a San Andrés. Arqueólogos exploraron la cueva varias veces. No encontraron nada. O eso dicen.',
        datoRaro: '🏴‍☠️ Morgan murió siendo el Gobernador de Jamaica, condecorado por la Corona inglesa. El rey Carlos II lo nombró caballero en 1674.' },
      { id: 'el_hoyo', nombre: 'El Hoyo', kmFisico: 44, emoji: '🌀', x: 540, y: 215,
        pista: 'Hay un lugar en esta isla donde el mar respira. Los isleños lo saben desde siempre. La ciencia tardó en entenderlo.',
        desc: 'El Hoyo es una depresión coralina donde el agua del mar entra por grietas y emerge en burbujas y remolinos impredecibles. Los raizales lo usan como indicador meteorológico natural: cuando El Hoyo está muy activo, viene tormenta. La ciencia moderna confirmó que tienen razón.',
        datoRaro: '🌀 San Andrés tiene 27 km² de superficie pero su plataforma de coral se extiende por 300.000 km² bajo el mar. Lo que ves es menos del 0.01% de lo que realmente es la isla.' },
      { id: 'punta_sur', nombre: 'Punta Sur', kmFisico: 57, emoji: '🌅', x: 100, y: 180,
        pista: 'El punto más al sur del archipiélago. Desde acá, el siguiente país está a más de 1.000km.',
        desc: '¡Lo lograste! Punta Sur es el extremo meridional de la isla, marcado por un faro blanco. Mirando al sur no hay tierra hasta Colombia continental — a 750km. San Andrés es geográficamente más cercana a Nicaragua que a Colombia, lo que explica la disputa territorial que duró hasta 2012.',
        datoRaro: '🌅 San Andrés recibe más de un millón de turistas por año en 27 km². Es una de las densidades turísticas más altas del Caribe. Pero el 40% de la isla sigue siendo selva tropical protegida.' },
    ],
  },
};

// ─── HELPERS ────────────────────────────────────────────────────

const getConfig = (challengeId, challengeTitle) => {
  // Primero por ID exacto (más confiable)
  if (challengeId === '64442b1d-12b8-4a58-a951-50ea10cb2131') return CONFIGS.dubrovnik;
  if (challengeId === '85a362a5-eee7-456d-9027-358d44446004') return CONFIGS.san_andres;
  // Fallback por título normalizado
  const titulo = normalizar(challengeTitle);
  if (titulo.includes('dubrovnik')) return CONFIGS.dubrovnik;
  if (titulo.includes('andres') || titulo.includes('san andr')) return CONFIGS.san_andres;
  return CONFIGS.default;
};

const getPuntoEnRuta = (segmentos, kmFisicos, distanciaFisica) => {
  if (kmFisicos <= 0) return segmentos[0];
  if (kmFisicos >= distanciaFisica) return segmentos[segmentos.length - 1];
  for (let i = 0; i < segmentos.length - 1; i++) {
    const p1 = segmentos[i];
    const p2 = segmentos[i + 1];
    if (kmFisicos >= p1.km && kmFisicos <= p2.km) {
      const pct = (kmFisicos - p1.km) / (p2.km - p1.km);
      return { x: p1.x + (p2.x - p1.x) * pct, y: p1.y + (p2.y - p1.y) * pct };
    }
  }
  return segmentos[segmentos.length - 1];
};

const getRutaBasePath = (segmentos) =>
  segmentos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

const getCompletedPathString = (segmentos, kmFisicos) => {
  if (kmFisicos <= 0) return '';
  let d = '';
  for (let i = 0; i < segmentos.length; i++) {
    const p = segmentos[i];
    if (p.km <= kmFisicos) {
      d += `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y} `;
    } else {
      const prev = segmentos[i - 1];
      if (prev) {
        const pct = (kmFisicos - prev.km) / (p.km - prev.km);
        d += `L ${prev.x + (p.x - prev.x) * pct} ${prev.y + (p.y - prev.y) * pct}`;
      }
      break;
    }
  }
  return d;
};

// ─── EFECTOS CLIMÁTICOS ─────────────────────────────────────────

const CopoNieve = ({ delay, startX, size, duration }) => {
  const translateY = useRef(new Animated.Value(-20)).current;
  const translateX = useRef(new Animated.Value(startX)).current;
  useEffect(() => {
    Animated.loop(Animated.parallel([
      Animated.timing(translateY, { toValue: 280, duration, delay, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(translateX, { toValue: startX + 15, duration: duration / 2, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: startX - 15, duration: duration / 2, useNativeDriver: true }),
      ])
    ])).start();
  }, []);
  return <Animated.View style={{ position: 'absolute', top: 0, width: size, height: size, borderRadius: size / 2, backgroundColor: '#F8FAFC', opacity: 0.7, transform: [{ translateY }, { translateX }] }} />;
};

const EfectoNieve = () => {
  const copos = useRef(Array.from({ length: 35 }).map((_, i) => ({ id: i, startX: Math.random() * SCREEN_WIDTH, delay: Math.random() * 3000, size: Math.random() * 3 + 2, duration: Math.random() * 2500 + 2000 }))).current;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} pointerEvents="none">
      {copos.map(c => <CopoNieve key={c.id} {...c} />)}
    </View>
  );
};

const GotaLluvia = ({ delay, startX, duration, color = '#60A5FA' }) => {
  const translateY = useRef(new Animated.Value(-20)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(translateY, { toValue: 280, duration, delay, useNativeDriver: true })).start();
  }, []);
  return <Animated.View style={{ position: 'absolute', top: 0, left: startX, width: 1.5, height: 15, backgroundColor: color, opacity: 0.5, transform: [{ translateY }, { rotate: '-10deg' }] }} />;
};

const EfectoLluvia = ({ tropical = false }) => {
  const gotas = useRef(Array.from({ length: tropical ? 70 : 50 }).map((_, i) => ({ id: i, startX: Math.random() * SCREEN_WIDTH, delay: Math.random() * 2000, duration: Math.random() * (tropical ? 500 : 800) + (tropical ? 400 : 700) }))).current;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} pointerEvents="none">
      {gotas.map(g => <GotaLluvia key={g.id} color={tropical ? '#34d399' : '#60A5FA'} {...g} />)}
    </View>
  );
};

// Destello dorado — Dubrovnik sol mediterráneo
const DestelloDorado = ({ delay, startX, startY }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.8, duration: 800, delay, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
    ])).start();
  }, []);
  return <Animated.View style={{ position: 'absolute', top: startY, left: startX, width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#FCD34D', opacity }} />;
};

const EfectoSolMediterraneo = () => {
  const destellos = useRef(Array.from({ length: 25 }).map((_, i) => ({ id: i, startX: Math.random() * SCREEN_WIDTH, startY: Math.random() * 260, delay: Math.random() * 4000 }))).current;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} pointerEvents="none">
      {destellos.map(d => <DestelloDorado key={d.id} {...d} />)}
    </View>
  );
};

// Burbuja caribeña — San Andrés
const BurbujaCaribe = ({ delay, startX }) => {
  const translateY = useRef(new Animated.Value(260)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.parallel([
      Animated.timing(translateY, { toValue: -10, duration: 3000, delay, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, duration: 300, delay, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 2700, useNativeDriver: true }),
      ])
    ])).start();
  }, []);
  return <Animated.View style={{ position: 'absolute', bottom: 0, left: startX, width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#7DD3FC', opacity, transform: [{ translateY }] }} />;
};

const EfectoCaribe = () => {
  const burbujas = useRef(Array.from({ length: 20 }).map((_, i) => ({ id: i, startX: Math.random() * SCREEN_WIDTH, delay: Math.random() * 3000 }))).current;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} pointerEvents="none">
      {burbujas.map(b => <BurbujaCaribe key={b.id} {...b} />)}
    </View>
  );
};

// ─── ESTRELLA FUGAZ ─────────────────────────────────────────────
const Estrella = ({ delay, startX, startY }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 300, delay, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 1000, useNativeDriver: true }),
      Animated.delay(Math.random() * 2000),
    ])).start();
  }, []);
  return <Animated.View style={{ position: 'absolute', top: startY, left: startX, width: 2, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF', opacity }} />;
};

const EfectoCieloEstrellado = () => {
  const estrellas = useRef(Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    startX: Math.random() * SCREEN_WIDTH,
    startY: Math.random() * 180,
    delay: Math.random() * 4000,
  }))).current;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} pointerEvents="none">
      {estrellas.map(e => <Estrella key={e.id} {...e} />)}
    </View>
  );
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function MapaRecorrido({ kmCompletados, distanciaTotal, porcentaje, challengeId, challengeTitle, onScrollBegin, onScrollEnd }) {
  const [modalVisible, setModalVisible] = useState(null);
  const scrollViewRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  const config = getConfig(challengeId, challengeTitle);
  const { titulo, distanciaFisica, clima, segmentos, checkpoints, decoraciones } = config;

  const factor = (distanciaTotal || distanciaFisica) / distanciaFisica;
  const kmFisicos = Math.min(parseFloat(kmCompletados || 0) / factor, distanciaFisica);
  const pinPos = getPuntoEnRuta(segmentos, kmFisicos, distanciaFisica);
  const rutaBasePath = getRutaBasePath(segmentos);
  const pathCompletado = getCompletedPathString(segmentos, kmFisicos);

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
      Animated.timing(pulseAnim, { toValue: 0, duration: 0, useNativeDriver: false }),
    ])).start();
  }, []);

  const animatedRadiusRadar = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 28] });
  const animatedRadiusSpotlight = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 32] });
  const animatedOpacity = pulseAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.6, 0.1, 0] });

  useEffect(() => {
    if (scrollViewRef.current) {
      const scrollToX = Math.max(0, pinPos.x - (SCREEN_WIDTH / 2));
      setTimeout(() => { scrollViewRef.current.scrollTo({ x: scrollToX, y: 0, animated: true }); }, 500);
    }
  }, [kmFisicos]);

  const desbloqueado = (cp) => kmFisicos >= cp.kmFisico;
  const esInicio = modalVisible?.id === checkpoints[0]?.id;
  const esFin = modalVisible?.id === checkpoints[checkpoints.length - 1]?.id;
  const estaDesbloqueado = modalVisible ? desbloqueado(modalVisible) : false;

  const mostrarClima = () => {
    if (clima === 'sol_mediterraneo') return <EfectoSolMediterraneo />;
    if (clima === 'caribe') return <EfectoCaribe />;
    if (clima === 'mixto') {
      if (kmFisicos < 40) return <EfectoLluvia />;
      if (kmFisicos >= 40 && kmFisicos < 80) return <EfectoNieve />;
      if (kmFisicos >= 80) return <EfectoCieloEstrellado />;
    }
    return null;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>{titulo}</Text>

      <View
        style={styles.mapaWrapper}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
      >
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ width: MAPA_WIDTH_VIRTUAL }}
          onTouchStart={() => onScrollBegin && onScrollBegin()}
          onScrollEndDrag={() => onScrollEnd && onScrollEnd()}
          onMomentumScrollEnd={() => onScrollEnd && onScrollEnd()}
        >
          <Svg width={MAPA_WIDTH_VIRTUAL} height={260} viewBox={`0 0 ${MAPA_WIDTH_VIRTUAL} 260`}>
            <Defs>
              <LinearGradient id="gradBg" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#0F172A" stopOpacity="1" />
                <Stop offset="1" stopColor="#1E293B" stopOpacity="1" />
              </LinearGradient>
              <Mask id="fogMask">
                <Rect x="0" y="0" width={MAPA_WIDTH_VIRTUAL} height="260" fill="white" />
                {kmFisicos > 0 && <Rect x={pinPos.x - 5} y="0" width={MAPA_WIDTH_VIRTUAL} height="260" fill="black" />}
                {pathCompletado !== '' && <Path d={pathCompletado} fill="none" stroke="black" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />}
                {checkpoints.filter(desbloqueado).map(cp => <Circle key={cp.id} cx={cp.x} cy={cp.y} r="20" fill="black" />)}
                {kmFisicos > 0 && <AnimatedCircle cx={pinPos.x} cy={pinPos.y} r={animatedRadiusSpotlight} fill="black" />}
              </Mask>
            </Defs>

            <Rect x="0" y="0" width={MAPA_WIDTH_VIRTUAL} height="260" fill="url(#gradBg)" />
            {decoraciones()}
            <Path d={rutaBasePath} fill="none" stroke="#475569" strokeWidth="6" strokeLinecap="square" strokeLinejoin="miter" />
            {pathCompletado !== '' && <Path d={pathCompletado} fill="none" stroke="#EA580C" strokeWidth="6" strokeLinecap="square" strokeLinejoin="miter" />}
            <Rect x="0" y="0" width={MAPA_WIDTH_VIRTUAL} height="260" fill="#0D1B2A" opacity="0.85" mask="url(#fogMask)" />

            {checkpoints.map((cp) => {
              const isDesbloqueado = desbloqueado(cp);
              return (
                <React.Fragment key={cp.id}>
                  <Circle cx={cp.x} cy={cp.y} r={isDesbloqueado ? 12 : 10} fill={isDesbloqueado ? '#F97316' : '#334155'} stroke={isDesbloqueado ? '#FFFFFF' : '#64748B'} strokeWidth="3" onPress={() => setModalVisible(cp)} />
                  {!isDesbloqueado && <SvgText x={cp.x} y={cp.y + 4} fill="#94A3B8" fontSize="10" textAnchor="middle">🔒</SvgText>}
                  <SvgText x={cp.x} y={cp.y - 18} fill="#F8FAFC" fontSize="12" textAnchor="middle" fontWeight="bold">{cp.nombre}</SvgText>
                </React.Fragment>
              );
            })}

            {kmFisicos > 0 && <AnimatedCircle cx={pinPos.x} cy={pinPos.y} r={animatedRadiusRadar} fill="#EA580C" opacity={animatedOpacity} />}
            {kmFisicos > 0 && (
              <>
                <Circle cx={pinPos.x} cy={pinPos.y} r={8} fill="#FFFFFF" stroke="#EA580C" strokeWidth="4" />
                <Rect x={pinPos.x - 24} y={pinPos.y + 16} width="48" height="20" rx="10" fill="#1E293B" />
                <SvgText x={pinPos.x} y={pinPos.y + 26} fill="#F97316" fontSize="11" textAnchor="middle" alignmentBaseline="middle" fontWeight="900">
                  {(kmFisicos * factor).toFixed(0)} km
                </SvgText>
              </>
            )}
          </Svg>
        </ScrollView>
        {mostrarClima()}
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
                      {esInicio ? '🚀 ¡Bienvenido al desafío! Cada paso te acerca a tu medalla.' : '🏅 ¡Lo lograste! Tu medalla está en camino.'}
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