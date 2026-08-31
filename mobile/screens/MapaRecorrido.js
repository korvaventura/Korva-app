import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, Animated, Dimensions } from 'react-native';
import Svg, { Path, Circle, Rect, Text as SvgText, Defs, LinearGradient, Stop, Mask, Ellipse, Polygon, G } from 'react-native-svg';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MAPA_WIDTH_VIRTUAL = 800;

const normalizar = (str) =>
  (str || '').toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const CONFIGS = {
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
        <Path d={`M0,240 Q${MAPA_WIDTH_VIRTUAL/2},220 ${MAPA_WIDTH_VIRTUAL},245 L${MAPA_WIDTH_VIRTUAL},260 L0,260 Z`} fill="#0284C7" opacity="0.35" />
        <SvgText x="300" y="250" fill="#7DD3FC" fontSize="12" textAnchor="middle">Canal Beagle</SvgText>
      </G>
    ),
    checkpoints: [
      { id: 'tolhuin', nombre: 'Tolhuin', kmFisico: 0, emoji: '🏘️', x: 720, y: 35,
        pista: 'Dicen que su nombre significa algo que late. ¿Qué esconde este pueblo al borde del mundo?',
        desc: 'Tolhuin significa "corazón" en lengua Selk\'nam, el pueblo originario que habitó Tierra del Fuego por miles de años antes de ser exterminado en el siglo XX. Este pueblo de cerca de 10.000 habitantes es el punto medio exacto entre el Atlántico y el Pacífico en esta latitud. Su panadería "La Unión", abierta las 24 horas, es famosa en toda la Patagonia.',
        datoRaro: '🧭 Tolhuin nació recién en 1972, pero hoy ya tiene casi 10.000 habitantes — multiplicó su población por diez en apenas medio siglo.' },
      { id: 'lago_fagnano', nombre: 'Lago Fagnano', kmFisico: 20, emoji: '💧', x: 520, y: 62,
        pista: 'Hay una fuerza invisible que divide este lago en dos. Una fuerza que mueve continentes.',
        desc: 'El Lago Fagnano está partido al medio por la Falla de Magallanes — la misma falla que separó América del Sur de la Antártida hace 30 millones de años. La orilla norte está en la Placa Sudamericana y la orilla sur en la Placa Scotia.',
        datoRaro: '🌍 Las dos orillas del lago están en placas tectónicas diferentes. Cada año se separan 7mm. En un millón de años, este lago será un estrecho marino.' },
      { id: 'paso_garibaldi', nombre: 'Paso Garibaldi', kmFisico: 45, emoji: '⛰️', x: 350, y: 105,
        pista: 'Un hombre cruzó este paso por primera vez en auto. Le tomó algo que hoy parece increíble.',
        desc: 'El Paso Garibaldi, a 433 metros sobre el nivel del mar, fue transitado por primera vez en vehículo motorizado en 1945. El viaje desde Ushuaia hasta Tolhuin en ese primer auto tardó 3 días. Hoy tardás 45 minutos.',
        datoRaro: '🦕 Los árboles de lenga son parientes directos de los bosques del supercontinente Gondwana, hace 180 millones de años. Son fósiles vivientes.' },
      { id: 'monte_olivia', nombre: 'Monte Olivia', kmFisico: 80, emoji: '🗻', x: 180, y: 148,
        pista: 'Los yamanas tenían un nombre para este pico. Un nombre que los científicos usaron para algo sorprendente.',
        desc: 'El Monte Olivia se llama "Aiken" en lengua yamana. Sus 1.326 metros dominan el Canal Beagle y fueron el primer punto de referencia que los marineros del HMS Beagle — el mismo barco de Darwin — usaron para orientarse en 1833.',
        datoRaro: '"Mamihlapinatapai" está en el Libro Guinness como la palabra más concisa del mundo. La lengua yamana tenía más de 32.000 palabras.' },
      { id: 'ushuaia', nombre: 'Ushuaia', kmFisico: 103, emoji: '🏁', x: 60, y: 175,
        pista: 'La ciudad más austral del mundo esconde una historia oscura debajo de su fama turística.',
        desc: '¡Llegaste al fin del mundo! Ushuaia fue fundada en 1884 como subprefectura naval. A comienzos del siglo XX se construyó el famoso presidio para los reclusos más peligrosos del país.',
        datoRaro: '🚢 A 1.000km al sur está el continente más frío, más seco y más ventoso del planeta. Llegaste tan al sur como se puede llegar por tierra.' },
    ],
  },
  dubrovnik: {
    titulo: '🗺️ Las Murallas de Dubrovnik',
    distanciaFisica: 19.4,
    clima: 'sol_mediterraneo',
    segmentos: [
      { km: 0,    x: 120, y: 140 },
      { km: 1.5,  x: 120, y: 100 },
      { km: 3.5,  x: 120, y: 60  },
      { km: 5,    x: 220, y: 60  },
      { km: 6.5,  x: 320, y: 60  },
      { km: 8,    x: 420, y: 60  },
      { km: 9.5,  x: 520, y: 60  },
      { km: 11,   x: 620, y: 60  },
      { km: 12,   x: 680, y: 100 },
      { km: 13,   x: 680, y: 150 },
      { km: 14,   x: 680, y: 200 },
      { km: 15.5, x: 580, y: 200 },
      { km: 16.5, x: 480, y: 200 },
      { km: 17.5, x: 360, y: 200 },
      { km: 18.5, x: 250, y: 220 },
      { km: 19.4, x: 120, y: 230 },
    ],
    decoraciones: () => (
      <G pointerEvents="none">
        <Rect x="0" y="0" width={MAPA_WIDTH_VIRTUAL} height="260" fill="#0c4a6e" opacity="0.2" />
        <Rect x="120" y="60" width="560" height="140" fill="#78716c" opacity="0.12" rx="4" />
        <SvgText x="400" y="140" fill="#d4a76a" fontSize="11" textAnchor="middle" opacity="0.5">Ciudad Vieja · Ragusa</SvgText>
        <Rect x="0" y="215" width={MAPA_WIDTH_VIRTUAL} height="45" fill="#0284C7" opacity="0.25" />
        <SvgText x="400" y="248" fill="#7DD3FC" fontSize="12" textAnchor="middle">Mar Adriático</SvgText>
        <SvgText x="60" y="30" fill="#A8CFFF" fontSize="11" textAnchor="middle">Dalmacia · Croacia</SvgText>
      </G>
    ),
    checkpoints: [
      { id: 'pile_gate', nombre: 'Pile Gate', kmFisico: 0, emoji: '🏰', x: 120, y: 140,
        pista: 'Por esta puerta entró y salió una república que desafió a imperios durante 450 años.',
        desc: 'La Puerta Pile es la entrada principal a Dubrovnik desde el siglo XV. Ragusa abolió el comercio de esclavos en 1416 y estableció uno de los primeros sistemas de cuarentena del mundo en 1377.',
        datoRaro: '🏛️ Ragusa abolió el comercio de esclavos en 1416, mucho antes que la mayoría de Europa.' },
      { id: 'fort_lovrijenac', nombre: 'Fort Lovrijenac', kmFisico: 4, emoji: '⚔️', x: 120, y: 60,
        pista: 'Sus muros tienen un secreto arquitectónico. En un lado son indestructibles. En el otro, papel.',
        desc: 'La Fortaleza de San Lorenzo fue construida en 3 meses. Sus muros tienen hasta 12 metros de grosor mirando al mar, pero apenas 60 centímetros mirando a la ciudad.',
        datoRaro: '🎭 Game of Thrones usó esta fortaleza como la Roca Casterly. El lema: "La libertad no se vende por todo el oro del mundo."' },
      { id: 'stradun', nombre: 'Stradun', kmFisico: 8, emoji: '🪨', x: 420, y: 60,
        pista: 'Esta calle fue destruida por un desastre natural. Lo que la reemplazó es más brillante.',
        desc: 'El Stradun es el corazón de Dubrovnik. El terremoto de 1667 la reconstruyó en piedra caliza blanca perfectamente uniforme, pulida por siglos hasta brillar como mármol.',
        datoRaro: '🌍 La piedra viene de la isla de Korčula — la misma donde nació Marco Polo.' },
      { id: 'fort_bokar', nombre: 'Fort Bokar', kmFisico: 12, emoji: '🔭', x: 680, y: 100,
        pista: 'Es la fortaleza circular más antigua de Europa.',
        desc: 'Fort Bokar fue diseñado por el arquitecto florentino Michelozzo. Su forma circular eliminaba ángulos muertos.',
        datoRaro: '⚓ En 1991, durante el asedio de Dubrovnik, las murallas volvieron a ser testigos de la guerra.' },
      { id: 'minceta_tower', nombre: 'Torre Minčeta', kmFisico: 16, emoji: '👑', x: 480, y: 200,
        pista: 'Desde acá arriba, una ciudad entera parece un mapa.',
        desc: 'La Torre Minčeta es el punto más alto de las murallas. Los vigías podían ver barcos enemigos con horas de anticipación.',
        datoRaro: '👁️ Desde aquí se puede ver la isla de Lokrum, donde Ricardo Corazón de León naufragó en 1192.' },
      { id: 'ploce_gate', nombre: 'Ploče Gate', kmFisico: 19.4, emoji: '🌊', x: 120, y: 230,
        pista: 'La puerta oriental de la ciudad. Por aquí entraban las especias de Oriente.',
        desc: '¡Lo lograste! La Puerta Ploče era la entrada oriental de Ragusa. Ragusa sobrevivió 450 años a fuerza de diplomacia, no de ejércitos.',
        datoRaro: '🏅 Ragusa fue república independiente desde 1358 hasta 1808. Duró 450 años.' },
    ],
  },
  monte_fuji: {
    titulo: '🗺️ Expedición Monte Fuji',
    distanciaFisica: 68,
    clima: 'japon',
    segmentos: [
      { km: 0,  x: 60,  y: 180 },
      { km: 5,  x: 120, y: 160 },
      { km: 10, x: 180, y: 145 },
      { km: 18, x: 260, y: 130 },
      { km: 22, x: 320, y: 120 },
      { km: 30, x: 400, y: 115 },
      { km: 40, x: 500, y: 120 },
      { km: 45, x: 560, y: 130 },
      { km: 50, x: 600, y: 115 },
      { km: 54, x: 620, y: 95  },
      { km: 58, x: 630, y: 70  },
      { km: 61, x: 640, y: 30  },
      { km: 65, x: 620, y: 55  },
      { km: 68, x: 600, y: 80  },
    ],
    decoraciones: () => (
      <G pointerEvents="none">
        <Rect x="0" y="0" width={MAPA_WIDTH_VIRTUAL} height="260" fill="#e0f2fe" opacity="0.12" />
        {/* Cielo y nieve en la cima */}
        <Path d="M580,0 L640,0 L640,50 L610,80 L580,50 Z" fill="#FFFFFF" opacity="0.4" />
        {/* Silueta del Fuji */}
        <Path d="M480,260 L610,30 L740,260 Z" fill="#64748b" opacity="0.12" />
        {/* Lagos */}
        <Ellipse cx="330" cy="125" rx="28" ry="10" fill="#0284C7" opacity="0.35" />
        <SvgText x="330" y="123" fill="#7DD3FC" fontSize="9" textAnchor="middle">Kawaguchiko</SvgText>
        <Ellipse cx="500" cy="122" rx="22" ry="8" fill="#0284C7" opacity="0.35" />
        <SvgText x="500" y="120" fill="#7DD3FC" fontSize="9" textAnchor="middle">Saiko</SvgText>
        {/* Bosque Aokigahara */}
        <Rect x="535" y="118" width="50" height="25" fill="#15803d" opacity="0.2" rx="4" />
        <SvgText x="400" y="250" fill="#94a3b8" fontSize="11" textAnchor="middle">Yamanashi · Japón 🇯🇵</SvgText>
        <SvgText x="640" y="25" fill="#FFFFFF" fontSize="10" textAnchor="middle">3.776m</SvgText>
      </G>
    ),
    checkpoints: [
      { id: 'fujiyoshida', nombre: 'Fujiyoshida & Chureito', kmFisico: 0, emoji: '⛩️', x: 60, y: 180,
        pista: 'Por estas escaleras sube quien busca la foto perfecta del Fuji. ¿Cuántas hay?',
        desc: 'Punto de partida entre templos y tradición japonesa. La Pagoda Chureito fue construida en 1963 como memorial de paz para los 960 ciudadanos de Fujiyoshida caídos en guerra.',
        datoRaro: '🪜 Para llegar a la pagoda hay que subir 398 escalones de piedra — y la foto del Fuji desde ahí es una de las más reproducidas del mundo.' },
      { id: 'oshino_hakkai', nombre: 'Oshino Hakkai', kmFisico: 18, emoji: '💧', x: 260, y: 130,
        pista: 'Este agua cayó sobre el Fuji hace décadas. ¿Cuántos años tardó en llegar hasta acá?',
        desc: 'Ocho manantiales sagrados alimentados por el deshielo del Fuji, declarados Monumento Natural Nacional en 1934. Pilgrims del Fuji-ko purificaban su cuerpo aquí antes del ascenso.',
        datoRaro: '⏳ El agua que brota aquí tardó más de 80 años en filtrarse desde la cima a través de roca volcánica. Podés tomarla directo del manantial.' },
      { id: 'kawaguchiko', nombre: 'Lago Kawaguchiko', kmFisico: 22, emoji: '🏔️', x: 320, y: 120,
        pista: 'En este lago, el Fuji aparece dos veces. Una arriba y una abajo.',
        desc: 'El más accesible de los Cinco Lagos del Fuji, a 830 metros sobre el nivel del mar. Su reflejo del Fuji durante la floración de los cerezos es una de las imágenes más buscadas de Japón.',
        datoRaro: '📸 Millones de turistas llegan solo por esa foto del reflejo. En temporada de cerezos, el lago se convierte en el lugar más fotografiado de Japón.' },
      { id: 'saiko', nombre: 'Lago Saiko', kmFisico: 40, emoji: '🎣', x: 500, y: 122,
        pista: 'El más salvaje de los Cinco Lagos. El menos visitado. El más auténtico.',
        desc: 'El lago más salvaje y menos visitado de los Cinco Lagos. Conectado con el Lago Motosu por corrientes subterráneas. Los Cinco Lagos se formaron por erupciones del Fuji hace más de 1.000 años.',
        datoRaro: '🌊 Las erupciones del Fuji bloquearon ríos con lava y crearon cuencas naturales — los lagos son cicatrices volcánicas llenas de agua.' },
      { id: 'aokigahara', nombre: 'Aokigahara — Jukai', kmFisico: 45, emoji: '🌲', x: 560, y: 130,
        pista: 'En este bosque las brújulas mienten. ¿Qué hay bajo la tierra que las confunde?',
        desc: '35 km² de bosque crecido sobre la lava de la erupción del año 864. Jukai significa Mar de Árboles en japonés. El suelo es roca volcánica pura con cuevas y cavidades.',
        datoRaro: '🧭 La roca volcánica tiene alto contenido de magnetita. Las brújulas comerciales se desorientan dentro del bosque. El ejército japonés entrena navegación aquí desde 1956.' },
      { id: 'quinta_estacion', nombre: '5ª Estación — Subaru Line', kmFisico: 54, emoji: '🚡', x: 620, y: 95,
        pista: 'La puerta de la montaña. Desde aquí empieza el ascenso real al punto más alto de Japón.',
        desc: 'A 2.305 metros de altura, es la puerta de entrada oficial al ascenso. El Yoshida Trail parte desde aquí — la ruta más antigua y popular al Fuji.',
        datoRaro: '⛩️ Desde 2024 el Yoshida Trail cobra 2.000 yenes y limita el acceso a 4.000 personas por día. La montaña entera es propiedad privada del santuario Fujisan Hongu Sengen Taisha.' },
      { id: 'cumbre', nombre: 'Kengamine — Cima 3.776m', kmFisico: 61, emoji: '🗻', x: 640, y: 30,
        pista: 'El punto más alto de Japón. ¿Cuánto mide el cráter que hay debajo?',
        desc: 'El punto más alto de Japón a 3.776 metros. Desde aquí se ven los Alpes del Norte en días despejados. La caminata por el borde del cráter lleva 90 minutos.',
        datoRaro: '🌋 El cráter tiene 780 metros de diámetro y 250 metros de profundidad — tan grande que el Tokyo Skytree caería tumbado dentro. La última erupción en 1707 cubrió de ceniza a Tokio.' },
      { id: 'llegada', nombre: 'Descenso — Meta Final', kmFisico: 68, emoji: '🏁', x: 600, y: 80,
        pista: 'El final de la expedición. Cultura, lagos, bosque y cumbre en 68 kilómetros.',
        desc: '¡Lo lograste! Completaste una expedición completa alrededor y hasta la cima del Monte Fuji. Templos, lagos, el bosque de Aokigahara y el punto más alto de Japón.',
        datoRaro: '🎌 Hay un dicho japonés: El sabio sube el Fuji una vez. Solo el tonto lo sube dos. Vos lo hiciste a tu manera — 68 kilómetros a puro esfuerzo.' },
    ],
  },
  san_andres: {
    titulo: '🗺️ El Archipiélago de San Andrés',
    distanciaFisica: 57,
    clima: 'caribe',
    segmentos: [
      { km: 0,  x: 280, y: 160 },
      { km: 6,  x: 340, y: 100 },
      { km: 10, x: 420, y: 70  },
      { km: 15, x: 520, y: 55  },
      { km: 21, x: 640, y: 70  },
      { km: 27, x: 700, y: 130 },
      { km: 34, x: 660, y: 190 },
      { km: 40, x: 540, y: 215 },
      { km: 44, x: 400, y: 220 },
      { km: 48, x: 280, y: 210 },
      { km: 53, x: 160, y: 200 },
      { km: 57, x: 100, y: 180 },
    ],
    decoraciones: () => (
      <G pointerEvents="none">
        <Rect x="0" y="0" width={MAPA_WIDTH_VIRTUAL} height="260" fill="#0891b2" opacity="0.15" />
        <Path d="M230,90 L260,70 L310,65 L350,70 L370,90 L375,120 L365,155 L340,175 L300,185 L265,180 L240,165 L225,140 L220,115 Z" fill="#16a34a" opacity="0.35" />
        <Ellipse cx="420" cy="65" rx="22" ry="12" fill="#16a34a" opacity="0.4" />
        <Ellipse cx="640" cy="65" rx="20" ry="10" fill="#16a34a" opacity="0.4" />
        <SvgText x="680" y="248" fill="#7DD3FC" fontSize="12" textAnchor="middle">Mar Caribe · Colombia</SvgText>
      </G>
    ),
    checkpoints: [
      { id: 'san_andres_town', nombre: 'San Andrés Town', kmFisico: 0, emoji: '🏝️', x: 280, y: 160,
        pista: 'Esta isla tiene un mar con siete nombres. Y una identidad que ningún país supo bien qué hacer con ella.',
        desc: 'San Andrés es colombiana por decreto pero caribeña por alma. Sus habitantes originales, los raizales, son descendientes de esclavos africanos, piratas ingleses y colonos puritanos que llegaron en 1629.',
        datoRaro: '🌊 El "Sea of Seven Colors" crea literalmente siete tonos de azul y verde visibles desde el aire.' },
      { id: 'johnny_cay', nombre: 'Johnny Cay', kmFisico: 11, emoji: '🏖️', x: 420, y: 70,
        pista: 'Un islote tan pequeño que podés rodearlo caminando en 10 minutos.',
        desc: 'Johnny Cay es un islote coralino de apenas 4 hectáreas rodeado por uno de los arrecifes más coloridos del Caribe. Visibilidad de hasta 30 metros.',
        datoRaro: '🐠 Gran parte de la arena blanca del Caribe proviene del pez loro, que tritura coral y lo transforma en arena.' },
      { id: 'haynes_cay', nombre: 'Haynes Cay', kmFisico: 21, emoji: '🤿', x: 640, y: 70,
        pista: 'Una piscina que no construyó nadie. Tardó miles de años en formarse.',
        desc: 'Haynes Cay y el Acuario forman una laguna natural protegida por la barrera de coral. Las tortugas verdes hacen migraciones de hasta 2.000km para volver a la misma playa donde nacieron.',
        datoRaro: '🐢 Las tortugas marinas existen desde hace 110 millones de años. Vieron nacer y morir a los dinosaurios.' },
      { id: 'cueva_morgan', nombre: 'Cueva de Morgan', kmFisico: 34, emoji: '💰', x: 660, y: 190,
        pista: 'El pirata más rico de su época escondió algo acá. Cuatrocientos años después, nadie lo encontró.',
        desc: 'Henry Morgan era un corsario con patente inglesa. En 1671 saqueó Panamá City con un botín equivalente a cientos de millones actuales. La leyenda dice que parte llegó a San Andrés.',
        datoRaro: '🏴‍☠️ Morgan murió siendo el Gobernador de Jamaica, condecorado por la Corona inglesa.' },
      { id: 'el_hoyo', nombre: 'El Hoyo', kmFisico: 44, emoji: '🌀', x: 540, y: 215,
        pista: 'Hay un lugar donde el mar respira. Los isleños lo saben desde siempre.',
        desc: 'El Hoyo es una depresión coralina donde el agua entra por grietas y emerge en burbujas. Los raizales lo usan como indicador meteorológico: cuando está activo, viene tormenta.',
        datoRaro: '🌀 San Andrés tiene 27 km² pero su plataforma de coral se extiende por 300.000 km² bajo el mar.' },
      { id: 'punta_sur', nombre: 'Punta Sur', kmFisico: 57, emoji: '🌅', x: 100, y: 180,
        pista: 'El punto más al sur del archipiélago.',
        desc: '¡Lo lograste! Punta Sur es el extremo meridional de la isla. Mirando al sur no hay tierra hasta Colombia continental — a 750km.',
        datoRaro: '🌅 San Andrés recibe más de un millón de turistas por año en 27 km². Pero el 40% sigue siendo selva tropical protegida.' },
    ],
  },
};

const getConfig = (challengeId, challengeTitle) => {
  if (challengeId === '64442b1d-12b8-4a58-a951-50ea10cb2131') return CONFIGS.dubrovnik;
  if (challengeId === '85a362a5-eee7-456d-9027-358d44446004') return CONFIGS.san_andres;
  if (challengeId === '881936a8-2282-4b7d-a94d-24a7c796d789') return CONFIGS.monte_fuji;
  const titulo = normalizar(challengeTitle);
  if (titulo.includes('dubrovnik')) return CONFIGS.dubrovnik;
  if (titulo.includes('andres') || titulo.includes('san andr')) return CONFIGS.san_andres;
  if (titulo.includes('fuji') || titulo.includes('monte fuji')) return CONFIGS.monte_fuji;
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

const BurbujaCaribe = ({ delay, startX }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const tamaño = useRef(4 + Math.random() * 5).current;
  useEffect(() => {
    Animated.loop(Animated.parallel([
      Animated.timing(translateY, { toValue: -240, duration: 3500, delay, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 300, delay, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.9, duration: 2600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ])
    ])).start();
  }, []);
  return <Animated.View style={{ position: 'absolute', bottom: 0, left: startX, width: tamaño, height: tamaño, borderRadius: tamaño / 2, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#7DD3FC', opacity, transform: [{ translateY }] }} />;
};

const EfectoCaribe = () => {
  const burbujas = useRef(Array.from({ length: 20 }).map((_, i) => ({ id: i, startX: Math.random() * SCREEN_WIDTH, delay: Math.random() * 3000 }))).current;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} pointerEvents="none">
      {burbujas.map(b => <BurbujaCaribe key={b.id} {...b} />)}
    </View>
  );
};

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
  const estrellas = useRef(Array.from({ length: 40 }).map((_, i) => ({ id: i, startX: Math.random() * SCREEN_WIDTH, startY: Math.random() * 180, delay: Math.random() * 4000 }))).current;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} pointerEvents="none">
      {estrellas.map(e => <Estrella key={e.id} {...e} />)}
    </View>
  );
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── SCROLL HINT ANIMADO ─────────────────────────────────────────
function ScrollHintAnimado() {
  const flechaIzq = useRef(new Animated.Value(0)).current;
  const flechaDer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(flechaIzq, { toValue: -6, duration: 400, useNativeDriver: true }),
      Animated.timing(flechaIzq, { toValue: 0, duration: 400, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.delay(200),
      Animated.timing(flechaDer, { toValue: 6, duration: 400, useNativeDriver: true }),
      Animated.timing(flechaDer, { toValue: 0, duration: 400, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 8 }}>
      <Animated.Text style={{ color: '#EA580C', fontSize: 16, transform: [{ translateX: flechaIzq }] }}>👈</Animated.Text>
      <Text style={{ color: '#94A3B8', fontSize: 11, fontStyle: 'italic' }}>Deslizá para explorar</Text>
      <Animated.Text style={{ color: '#EA580C', fontSize: 16, transform: [{ translateX: flechaDer }] }}>👉</Animated.Text>
    </View>
  );
}

// ─── HISTORIA INLINE ─────────────────────────────────────────────
function HistoriaInline({ cp, factor, distanciaTotal, estaDesbloqueado, esInicio, esFin, onCerrar }) {
  if (!cp) return null;
  return (
    <View style={styles.historiaContainer}>
      <View style={styles.historiaHeader}>
        <Text style={styles.historiaEmoji}>{estaDesbloqueado ? cp.emoji : '🔒'}</Text>
        <View style={styles.historiaTituloWrap}>
          <Text style={styles.historiaNombre}>{cp.nombre}</Text>
          <Text style={styles.historiaKm}>{((cp.kmFisico || 0) * factor).toFixed(0)} km de {distanciaTotal} km</Text>
        </View>
        <TouchableOpacity onPress={onCerrar} style={styles.historiaCerrarBtn} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
          <Text style={styles.historiaCerrarText}>✕</Text>
        </TouchableOpacity>
      </View>
      {estaDesbloqueado ? (
        <ScrollView style={styles.historiaScroll} showsVerticalScrollIndicator={false}>
          {(esInicio || esFin) && (
            <View style={styles.mensajeEspecialBox}>
              <Text style={styles.mensajeEspecial}>
                {esInicio ? '🚀 ¡Bienvenido al desafío! Cada paso te acerca a tu medalla.' : '🏅 ¡Lo lograste! Tu medalla está en camino.'}
              </Text>
            </View>
          )}
          <Text style={styles.historiaDesc}>{cp.desc}</Text>
          {cp.datoRaro && (
            <View style={styles.datoRaroBox}>
              <Text style={styles.datoRaroTexto}>{cp.datoRaro}</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <>
          <View style={styles.pistaBox}>
            <Text style={styles.pistaTexto}>💭 {cp.pista}</Text>
          </View>
          <View style={styles.desbloqueoBox}>
            <Text style={styles.desbloqueoTexto}>🔒 Llegá a {((cp.kmFisico || 0) * factor).toFixed(0)} km para descubrir la historia completa</Text>
          </View>
        </>
      )}
    </View>
  );
}

// ─── MAPA SVG ────────────────────────────────────────────────────
function MapaSVG({ config, kmFisicos, pinPos, rutaBasePath, pathCompletado, pulseAnim, onCheckpointPress }) {
  const { segmentos, checkpoints, decoraciones } = config;
  const animatedRadiusRadar = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 28] });
  const animatedRadiusSpotlight = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 32] });
  const animatedOpacity = pulseAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.6, 0.1, 0] });
  const desbloqueado = (cp) => kmFisicos >= cp.kmFisico;

  return (
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
            <Circle cx={cp.x} cy={cp.y} r={isDesbloqueado ? 12 : 10} fill={isDesbloqueado ? '#F97316' : '#334155'} stroke={isDesbloqueado ? '#FFFFFF' : '#64748B'} strokeWidth="3" onPress={() => onCheckpointPress(cp)} />
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
            {`${(kmFisicos).toFixed(0)} km`}
          </SvgText>
        </>
      )}
    </Svg>
  );
}

export default function MapaRecorrido({ kmCompletados, distanciaTotal, porcentaje, challengeId, challengeTitle, onScrollBegin, onScrollEnd, fullscreen = false }) {
  const [cpSeleccionado, setCpSeleccionado] = useState(null);
  const [modalMapaVisible, setModalMapaVisible] = useState(false);
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

  useEffect(() => { setCpSeleccionado(null); }, [challengeId]);

  useEffect(() => {
    if (scrollViewRef.current) {
      const scrollToX = Math.max(0, pinPos.x - (SCREEN_WIDTH / 2));
      setTimeout(() => { scrollViewRef.current.scrollTo({ x: scrollToX, y: 0, animated: true }); }, 500);
    }
  }, [kmFisicos]);

  useEffect(() => {
    if (modalMapaVisible && scrollViewRef.current) {
      const scrollToX = Math.max(0, pinPos.x - (SCREEN_WIDTH / 2));
      setTimeout(() => { scrollViewRef.current.scrollTo({ x: scrollToX, y: 0, animated: false }); }, 350);
    }
  }, [modalMapaVisible]);

  const desbloqueado = (cp) => kmFisicos >= cp.kmFisico;
  const esInicio = cpSeleccionado?.id === checkpoints[0]?.id;
  const esFin = cpSeleccionado?.id === checkpoints[checkpoints.length - 1]?.id;
  const estaDesbloqueado = cpSeleccionado ? desbloqueado(cpSeleccionado) : false;

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

  const handleCheckpointPress = (cp) => {
    setCpSeleccionado(prev => prev?.id === cp.id ? null : cp);
  };

  // ── MODO PREVIEW ────────────────────────────────────────────
  if (!fullscreen) {
    return (
      <View style={styles.container}>
        <Text style={styles.titulo}>{titulo}</Text>
        <TouchableOpacity style={styles.previewWrapper} onPress={() => setModalMapaVisible(true)} activeOpacity={0.85}>
          {(() => {
            const previewW = 360;
            const viewX = Math.max(0, Math.min(pinPos.x - previewW / 2, MAPA_WIDTH_VIRTUAL - previewW));
            return (
              <Svg width="100%" height={180} viewBox={`${viewX} 0 ${previewW} 260`}>
                <Rect x="0" y="0" width={MAPA_WIDTH_VIRTUAL} height="260" fill="#0F172A" />
                {decoraciones()}
                <Path d={rutaBasePath} fill="none" stroke="#475569" strokeWidth="6" strokeLinecap="square" strokeLinejoin="miter" />
                {pathCompletado !== '' && <Path d={pathCompletado} fill="none" stroke="#EA580C" strokeWidth="6" strokeLinecap="square" strokeLinejoin="miter" />}
                {checkpoints.map((cp) => (
                  <Circle key={cp.id} cx={cp.x} cy={cp.y} r={desbloqueado(cp) ? 10 : 8}
                    fill={desbloqueado(cp) ? '#F97316' : '#334155'}
                    stroke={desbloqueado(cp) ? '#FFFFFF' : '#64748B'} strokeWidth="2" />
                ))}
                {kmFisicos > 0 && <Circle cx={pinPos.x} cy={pinPos.y} r={8} fill="#FFFFFF" stroke="#EA580C" strokeWidth="4" />}
              </Svg>
            );
          })()}
          <View style={styles.previewOverlay}>
            <View style={styles.previewBtn}>
              <Text style={styles.previewBtnText}>🗺️ Explorar ruta</Text>
            </View>
          </View>
        </TouchableOpacity>

        <Modal visible={modalMapaVisible} transparent={false} animationType="slide" onRequestClose={() => setModalMapaVisible(false)}>
          <View style={styles.fullscreenContainer}>
            <View style={styles.fullscreenHeader}>
              <Text style={styles.fullscreenTitulo}>{titulo}</Text>
              <TouchableOpacity style={styles.cerrarBtn} onPress={() => setModalMapaVisible(false)}>
                <Text style={styles.cerrarBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.mapaFijoWrapper}>
              <ScrollView ref={scrollViewRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ width: MAPA_WIDTH_VIRTUAL }} style={{ flex: 1 }}>
                <MapaSVG config={config} kmFisicos={kmFisicos} pinPos={pinPos} rutaBasePath={rutaBasePath} pathCompletado={pathCompletado} pulseAnim={pulseAnim} onCheckpointPress={handleCheckpointPress} />
              </ScrollView>
              {mostrarClima()}
            </View>
            <ScrollHintAnimado />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leyendaScroll}>
              {checkpoints.map((cp) => {
                const bloqueado = !desbloqueado(cp);
                const seleccionado = cpSeleccionado?.id === cp.id;
                return (
                  <TouchableOpacity key={cp.id} style={[styles.leyendaItem, !bloqueado && styles.leyendaItemActivo, seleccionado && styles.leyendaItemSeleccionado]} onPress={() => handleCheckpointPress(cp)}>
                    <Text style={styles.leyendaEmoji}>{bloqueado ? '🔒' : cp.emoji}</Text>
                    <View style={styles.leyendaTextos}>
                      <Text style={[styles.leyendaNombre, !bloqueado && styles.leyendaNombreActivo]}>{cp.nombre}</Text>
                      <Text style={styles.leyendaKm}>{(cp.kmFisico * factor).toFixed(0)} km</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {cpSeleccionado ? (
              <HistoriaInline cp={cpSeleccionado} factor={factor} distanciaTotal={distanciaTotal} estaDesbloqueado={estaDesbloqueado} esInicio={esInicio} esFin={esFin} onCerrar={() => setCpSeleccionado(null)} />
            ) : (
              <View style={styles.historiaPlaceholder}>
                <Text style={styles.historiaPlaceholderText}>Tocá un punto del mapa o un checkpoint para leer su historia</Text>
              </View>
            )}
          </View>
        </Modal>
      </View>
    );
  }

  // ── MODO FULLSCREEN ──────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>{titulo}</Text>
      <View style={styles.mapaFijoWrapper}>
        <ScrollView ref={scrollViewRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ width: MAPA_WIDTH_VIRTUAL }}
          onScrollBeginDrag={() => onScrollBegin && onScrollBegin()}
          onScrollEndDrag={() => onScrollEnd && onScrollEnd()}
          onMomentumScrollEnd={() => onScrollEnd && onScrollEnd()}>
          <MapaSVG config={config} kmFisicos={kmFisicos} pinPos={pinPos} rutaBasePath={rutaBasePath} pathCompletado={pathCompletado} pulseAnim={pulseAnim} onCheckpointPress={handleCheckpointPress} />
        </ScrollView>
        {mostrarClima()}
      </View>
      <ScrollHintAnimado />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leyendaScroll}>
        {checkpoints.map((cp) => {
          const bloqueado = !desbloqueado(cp);
          const seleccionado = cpSeleccionado?.id === cp.id;
          return (
            <TouchableOpacity key={cp.id} style={[styles.leyendaItem, !bloqueado && styles.leyendaItemActivo, seleccionado && styles.leyendaItemSeleccionado]} onPress={() => handleCheckpointPress(cp)}>
              <Text style={styles.leyendaEmoji}>{bloqueado ? '🔒' : cp.emoji}</Text>
              <View style={styles.leyendaTextos}>
                <Text style={[styles.leyendaNombre, !bloqueado && styles.leyendaNombreActivo]}>{cp.nombre}</Text>
                <Text style={styles.leyendaKm}>{(cp.kmFisico * factor).toFixed(0)} km</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {cpSeleccionado ? (
        <HistoriaInline cp={cpSeleccionado} factor={factor} distanciaTotal={distanciaTotal} estaDesbloqueado={estaDesbloqueado} esInicio={esInicio} esFin={esFin} onCerrar={() => setCpSeleccionado(null)} />
      ) : (
        <View style={styles.historiaPlaceholder}>
          <Text style={styles.historiaPlaceholderText}>Tocá un punto del mapa o un checkpoint para leer su historia</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  titulo: { fontSize: 16, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 12 },
  previewWrapper: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#334155', backgroundColor: '#0F172A', position: 'relative', height: 180 },
  previewOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingBottom: 12, backgroundColor: 'rgba(13,27,42,0.5)' },
  previewBtn: { backgroundColor: '#EA580C', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  previewBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  fullscreenContainer: { flex: 1, backgroundColor: '#0F172A' },
  fullscreenHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  fullscreenTitulo: { fontSize: 16, fontWeight: 'bold', color: '#F8FAFC', flex: 1 },
  cerrarBtn: { backgroundColor: '#1E293B', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cerrarBtnText: { color: '#94A3B8', fontWeight: 'bold', fontSize: 16 },
  mapaFijoWrapper: { height: 260, position: 'relative', overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  leyendaScroll: { maxHeight: 72, paddingHorizontal: 16, marginBottom: 4 },
  leyendaItem: { flexDirection: 'row', backgroundColor: '#1E293B', borderRadius: 12, padding: 10, marginRight: 8, alignItems: 'center', borderWidth: 1, borderColor: '#334155', minWidth: 120, maxWidth: 160, height: 56 },
  leyendaItemActivo: { borderColor: '#3a5a7a', backgroundColor: '#0F172A' },
  leyendaItemSeleccionado: { borderColor: '#FFFFFF', backgroundColor: '#1a1000', borderWidth: 2 },
  leyendaEmoji: { fontSize: 16, marginRight: 8 },
  leyendaTextos: { justifyContent: 'center', flex: 1 },
  leyendaNombre: { fontSize: 11, color: '#64748B', fontWeight: 'bold' },
  leyendaNombreActivo: { color: '#F8FAFC' },
  leyendaKm: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  historiaContainer: { backgroundColor: '#1E293B', borderRadius: 16, marginHorizontal: 16, marginTop: 4, marginBottom: 8, padding: 16, borderWidth: 1, borderColor: '#334155', maxHeight: 280 },
  historiaHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  historiaEmoji: { fontSize: 28, marginRight: 12 },
  historiaTituloWrap: { flex: 1 },
  historiaNombre: { fontSize: 16, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 2 },
  historiaKm: { fontSize: 12, color: '#94A3B8' },
  historiaCerrarBtn: { backgroundColor: '#2a3a4a', borderRadius: 18, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  historiaCerrarText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  historiaScroll: { maxHeight: 180 },
  historiaDesc: { fontSize: 14, color: '#E2E8F0', lineHeight: 22, marginBottom: 12 },
  historiaPlaceholder: { marginHorizontal: 16, marginTop: 4, marginBottom: 8, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#1E293B', borderStyle: 'dashed', alignItems: 'center' },
  historiaPlaceholderText: { color: '#475569', fontSize: 13, textAlign: 'center', fontStyle: 'italic' },
  mensajeEspecialBox: { backgroundColor: '#0F172A', borderRadius: 12, padding: 12, marginBottom: 12 },
  mensajeEspecial: { fontSize: 13, color: '#EA580C', textAlign: 'center', fontWeight: 'bold', lineHeight: 20 },
  datoRaroBox: { backgroundColor: '#0F172A', borderRadius: 10, padding: 12, marginTop: 8, borderLeftWidth: 3, borderLeftColor: '#3B82F6' },
  datoRaroTexto: { fontSize: 12, color: '#3B82F6', fontStyle: 'italic', lineHeight: 18 },
  pistaBox: { backgroundColor: '#0F172A', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  pistaTexto: { fontSize: 13, color: '#CBD5E1', fontStyle: 'italic', lineHeight: 20 },
  desbloqueoBox: { backgroundColor: '#0F172A', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#EA580C' },
  desbloqueoTexto: { fontSize: 12, color: '#EA580C', textAlign: 'center', fontWeight: 'bold' },
});