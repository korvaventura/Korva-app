// Escena "Las Murallas de Dubrovnik" — 19.4 km, Croacia.
// Solo datos: mismo motor que el resto de las escenas.
//
// Un circuito representativo del casco viejo; los kilómetros del desafío se
// distribuyen entre sus checkpoints. No es una escala cartográfica ni un GPS.
// Pile → Lovrijenac → Stradun → San Juan → Bokar → Minčeta → Ploče.
// Costa, murallas y tejados son aproximaciones procedurales a esta geografía.

const MURALLA = '#E6DCC3'; // piedra caliza
const TEJA = '#C2653C'; // tejados de terracota
const PIEDRA_CALLE = '#9E978A'; // roca y empedrado, más oscuro que la muralla

const torre = (id, lat, lon, radioKm, alturaM) => ({
  id, costaM: alturaM, alturaM, interiorKm: 0.002, taludMporKm: 3000, irregularidadKm: 0, alcanceKm: 0.05,
  color: MURALLA, variacionColor: 0.06, frecuenciaColor: 300,
  eje: [[lat, lon, radioKm], [lat + 0.00001, lon, radioKm]],
});

const muralla = (id, alturaM, eje) => ({
  id, costaM: alturaM, alturaM, interiorKm: 0.002, taludMporKm: 3000, irregularidadKm: 0, alcanceKm: 0.05,
  color: MURALLA, variacionColor: 0.07, frecuenciaColor: 320,
  eje: eje.map(([lat, lon]) => [lat, lon, 0.009]),
});

const dubrovnik = {
  id: 'dubrovnik',
  colorRecorrido: '#44F2DC',
  zoomReplay: .86,
  modeloMeshy: true, // Visual trial; set false to restore the procedural world.
  distanciaKm: 19.4,
  mostrarRelacionRecorrido: true,
  presentacion: {
    eyebrow: 'CROACIA · RAGUSA',
    titulo: 'Las Murallas de Dubrovnik',
  },
  semilla: 1358,
  centro: { lat: 42.640, lon: 18.108 },
  limitesKm: { minX: -0.9, maxX: 1.4, minZ: -0.75, maxZ: 1.2 },
  resolucionKm: 0.012,
  mundo: { extensionKm: 30, crecimiento: 1.15 },
  kmPorUnidad: 0.3,
  exageracion: 1.2,
  pasoRutaKm: 0.006,
  pasoPerfilKm: 0.006,
  elevacionRutaUnidades: 0.006, // ruta y pines en unidades: constantes en pantalla
  alturaPinUnidades: 0.075,
  grosorRuta: 0.48, // deja ver calles y murallas bajo el recorrido
  suavizadoAlturaRutaKm: 0.012, // la ruta corre sobre muros: evita el serrucho en los bordes

  ruta: [
    { lat: 42.6416, lon: 18.1057, km: 0 }, // Puerta Pile
    { lat: 42.6414, lon: 18.1049 },
    { lat: 42.6411, lon: 18.1042 },
    { lat: 42.6409, lon: 18.1036, km: 4 }, // Fuerte Lovrijenac
    { lat: 42.6412, lon: 18.1044 },
    { lat: 42.6416, lon: 18.1057 }, // de vuelta por Pile
    { lat: 42.6414, lon: 18.1063 },
    { lat: 42.64139, lon: 18.10806, km: 8 }, // Stradun
    { lat: 42.6413, lon: 18.1099 }, // plaza Luža
    { lat: 42.6409, lon: 18.1110 },
    { lat: 42.6404, lon: 18.1117 }, // muralla del puerto
    { lat: 42.6398, lon: 18.1120 }, // San Juan
    { lat: 42.6394, lon: 18.1108 },
    { lat: 42.6395, lon: 18.1092 },
    { lat: 42.6399, lon: 18.1076 },
    { lat: 42.6403, lon: 18.1064 },
    { lat: 42.6409, lon: 18.1055, km: 12 }, // Fuerte Bokar
    { lat: 42.6416, lon: 18.1057 },
    { lat: 42.6421, lon: 18.1066 },
    { lat: 42.6425, lon: 18.1078, km: 16 }, // Torre Minčeta
    { lat: 42.6426, lon: 18.1092 },
    { lat: 42.6424, lon: 18.1106 },
    { lat: 42.6420, lon: 18.1115, km: 19.4 }, // Puerta Ploče
  ],

  perfilRuta: 'terreno',
  corredor: { planoKm: 0.004, paredM: 100000, potencia: 1, suavizadoM: 1, suavizadoPerfilKm: 0.015 },

  mar: { nivelM: 0 },
  aguas: [],

  relieve: {
    colinas: { base: -70, amp: 20 }, // fondo del Adriático cerca de la costa
    fajas: [],
    masas: [
      // Interior de tierra firme (Dalmacia del sur).
      {
        id: 'interior', costaM: 120, alturaM: 380, interiorKm: 3, forma: 1, rugosidadM: 60, taludMporKm: 200, irregularidadKm: 0.6, alcanceKm: 4,
        eje: [[42.700, 17.90, 5], [42.705, 18.10, 5], [42.690, 18.30, 5]],
      },
      // Franja costera: costa rocosa de Lapad a Ploče y hacia el sureste.
      {
        id: 'costa', costaM: 2, alturaM: 140, interiorKm: 1.2, forma: 1.3, rugosidadM: 18, taludMporKm: 90, irregularidadKm: 0.06, alcanceKm: 1,
        eje: [
          // Eje 1.85 km tierra adentro: el borde sur del eje es la costa.
          [42.6650, 18.060, 1.7], [42.6620, 18.093, 1.85], [42.6580, 18.103, 1.85], [42.6585, 18.110, 1.85],
          [42.6580, 18.118, 1.85], [42.6550, 18.132, 1.85], [42.6480, 18.150, 1.9],
        ],
      },
      // Promontorio del casco viejo: piso de piedra donde no hay tejados.
      {
        id: 'promontorio', costaM: 2, alturaM: 16, interiorKm: 0.08, taludMporKm: 140, irregularidadKm: 0.01, alcanceKm: 0.2, rugosidadM: 1,
        color: PIEDRA_CALLE, variacionColor: 0.05, frecuenciaColor: 200,
        eje: [[42.6416, 18.1058, 0.06], [42.6408, 18.1075, 0.13], [42.6404, 18.1095, 0.12], [42.6409, 18.1112, 0.07]],
      },
      // Roca de Lovrijenac y el fuerte encima.
      {
        id: 'roca_lovrijenac', costaM: 6, alturaM: 37, interiorKm: 0.03, taludMporKm: 700, irregularidadKm: 0.004, alcanceKm: 0.1, rugosidadM: 2,
        eje: [[42.6409, 18.1036, 0.035], [42.6408, 18.1033, 0.03]],
      },
      torre('fuerte_lovrijenac', 42.6409, 18.1036, 0.018, 50),
      // Tejados: dos manzanas separadas por el Stradun.
      {
        id: 'tejados_norte', costaM: 34, alturaM: 34, interiorKm: 0.004, taludMporKm: 2500, irregularidadKm: 0.004, alcanceKm: 0.05,
        color: TEJA, variacionColor: 0.18, frecuenciaColor: 260,
        eje: [[42.64205, 18.1068, 0.032], [42.64215, 18.1101, 0.028]],
      },
      {
        id: 'tejados_sur', costaM: 22, alturaM: 22, interiorKm: 0.004, taludMporKm: 2500, irregularidadKm: 0.004, alcanceKm: 0.05,
        color: TEJA, variacionColor: 0.18, frecuenciaColor: 260,
        eje: [[42.6406, 18.1066, 0.045], [42.6402, 18.1090, 0.05], [42.6406, 18.1107, 0.035]],
      },
      // Murallas (1.940 m): más altas del lado de tierra.
      muralla('muralla_norte', 56, [[42.6416, 18.1057], [42.6421, 18.1066], [42.6425, 18.1078], [42.6426, 18.1092], [42.6424, 18.1106]]),
      muralla('muralla_este', 30, [[42.6424, 18.1106], [42.6419, 18.1111], [42.6411, 18.1115], [42.6404, 18.1117]]),
      muralla('muralla_mar', 26, [[42.6404, 18.1117], [42.6398, 18.1120], [42.6394, 18.1108], [42.6395, 18.1092], [42.6399, 18.1076], [42.6403, 18.1064], [42.6409, 18.1055]]),
      muralla('muralla_oeste', 30, [[42.6409, 18.1055], [42.6416, 18.1057]]),
      // Torres y fortalezas.
      torre('minceta', 42.6425, 18.1078, 0.017, 74),
      torre('bokar', 42.6409, 18.1055, 0.013, 34),
      torre('san_juan', 42.6398, 18.1120, 0.018, 32),
      torre('revelin', 42.6420, 18.1123, 0.022, 30),
      // Isla de Lokrum (96 m), a 600 m al sureste.
      {
        id: 'lokrum', costaM: 2, alturaM: 96, interiorKm: 0.3, forma: 1.2, rugosidadM: 8, taludMporKm: 120, irregularidadKm: 0.05, alcanceKm: 0.6,
        eje: [[42.6330, 18.1175, 0.22], [42.6270, 18.1220, 0.3], [42.6215, 18.1270, 0.2]],
      },
    ],
    picos: [
      { id: 'srd', lat: 42.6495, lon: 18.1125, alturaM: 412, radioKm: 1.15, agudeza: 1.05, elongacion: 1.4, suavizadoM: 12 },
    ],
  },

  pisos: {
    inicioBosqueM: 0,
    bosqueAlSurZ: -999,
    lineaArbolesM: 260,
    lineaNieveM: 99999,
    nieveBajaHaciaSurM: 0,
    intensidadOtono: 0,
    profundidadColorM: 30,
  },

  // sRGB. Karst mediterráneo: pinos, macchia, caliza clara.
  paleta: {
    estepa: '#8C9466',
    turba: '#7D8459',
    bosque: '#3B5733',
    bosqueClaro: '#5C7442',
    lengaOtono: '#5C7442',
    pedrero: '#A29C88',
    roca: '#B3AE9F',
    nieve: '#FFFFFF',
    costa: '#CFC4A8',
    vega: '#7C8F55',
    fondoSomero: '#C9D9C8',
    fondoProfundo: '#0E3F6A',
    sombra: '#4A5C8E',
  },

  agua: { elevacionM: 0.05, somero: '#4FC3C9', medio: '#1C8FB0', profundo: '#0D4775', profundidadColorM: 28, opacidad: 0.86, rugosidad: 0.2, espuma: '#F4FBFF', espumaHastaM: 0.6 },

  luz: {
    intensidadSol: 1.6, intensidadHemi: 1.1,
    solDir: [-0.8, 0.45, 0.2], // tarde, sol desde el oeste sobre el Adriático
    alcanceSombraKm: 1.5,
    radioOclusionKm: 0.05,
    sombraMin: 0.5,
  },

  // Desde el mar: ciudad en primer plano y monte Srđ al fondo.
  camara: { objetivo: [0, 0.22, 0.65], elevacionGrados: 58, azimutGrados: 180, distancia: 8.6, fov: 42, aspectoReferencia: 0.82 },
  atmosfera: {
    horizonte: '#C6D8E6',
    resplandor: '#F6C89A',
    medio: '#6FA3D2',
    cenit: '#2A5F9E',
    cerca: 1.4,
    lejos: 3.4,
  },

  etiquetas: [
    { id: 'adriatico', texto: 'MAR ADRIÁTICO', lat: 42.6345, lon: 18.0985, tipo: 'agua' },
    
    
  ],
};

// Interpretación visual procedural: barrios y monumentos, no levantamiento catastral.
dubrovnik.relieve.masas = dubrovnik.relieve.masas.filter((m) => !m.id.startsWith('tejados_'));
dubrovnik.arquitectura = {
  alturaTejadoM: 1.2, edificios: [], colorPared: '#D5C7A8', colorTejado: '#B75A37', colorMuralla: MURALLA,
  // La altura de las fortificaciones sigue en el perfil del recorrido. En el
  // render se separa de la tierra para obtener paredes verticales, no colinas.
  suelo: { latMin: 42.63925, latMax: 42.6428, lonMin: 18.10525, lonMax: 18.11245, alturaM: 16 },
  murallas: dubrovnik.relieve.masas.filter((m) => m.id.startsWith('muralla_')),
  torres: dubrovnik.relieve.masas.filter((m) => ['minceta', 'bokar', 'san_juan', 'revelin', 'fuerte_lovrijenac'].includes(m.id)),
};
for (let fila = 0; fila < 18; fila += 1) {
  const lat = 42.64005 + fila * 0.00015;
  for (let col = 0; col < 24; col += 1) {
    const lon = 18.10615 + col * 0.00022;
    // El Stradun queda libre entre los dos barrios; recorte del promontorio.
    if (Math.abs(lat - 42.64139) < 0.00014) continue;
    if (fila < 3 && (col < 6 - fila || col > 16 + fila)) continue;

    // Plazas y edificios singulares rompen la trama repetitiva.
    if (lat < 42.64135 && lon > 18.1099) continue;
    if (lat > 42.64145 && lat < 42.64185 && lon > 18.1102) continue;
    const clave = fila * 11 + col * 7;
    dubrovnik.arquitectura.edificios.push({ lat, lon, anchoM: 12 + clave % 5, largoM: 12 + fila % 4, alturaM: 7 + clave % 10, alturaTejadoM: 1.2 + clave % 3 * 0.35, orientacion: fila > 8 ? 0.12 : -0.08, tono: clave % 5, chimenea: clave % 4 === 0 });
  }
}
// Barrios construidos sobre calles continuas, con parcelas y patios compartidos.
dubrovnik.arquitectura.calles = [];
dubrovnik.arquitectura.arboles = [];
for (let fila = 0; fila < 18; fila += 1) {
  const lat = 42.64305 + fila * 0.00024 + Math.sin(fila * 0.8) * 0.000035;
  const curva = (lon) => lat + Math.sin((lon - 18.102) * 720 + fila * 0.16) * 0.00014;
  // Contorno irregular y densidad decreciente hacia Srđ: ningún borde
  // rectangular común para todas las calles y parcelas.
  const inicio = -3 + Math.floor(Math.sin(fila * 0.72) * 3) + Math.max(0, fila - 9);
  const fin = 43 + Math.floor(Math.cos(fila * 0.61) * 3) - Math.max(0, fila - 8);
  const eje = [];
  for (let col = inicio; col <= fin; col += 1) {
    const lon = 18.102 + col * 0.00024;
    if (fila < 12 || col % 3 !== 0) eje.push([curva(lon) - 0.000105, lon]);
  }
  dubrovnik.arquitectura.calles.push({ anchoM: fila > 11 ? 2.5 : fila % 4 === 0 ? 7 : 4.5, eje });
  for (let col = inicio; col < fin; col += 1) {
    const clave = fila * 37 + col * 13;
    const lon = 18.102 + col * 0.00024;
    // Calles transversales y jardines: las casas siempre dan a una calle.
    if (col % 10 === 0) continue;
    const azar = ((Math.sin(clave * 127.1 + fila * 311.7) * 43758.5453) % 1 + 1) % 1;
    const borde = Math.min(col - inicio, fin - col);
    const densidad = Math.max(0.08, Math.min(1, (18 - fila) / 9)) * Math.min(1, (borde + 1) / 4);
    if (clave % 11 === 0 || azar > densidad) {
      if (azar < densidad + 0.18) dubrovnik.arquitectura.arboles.push({ lat: curva(lon) + Math.sin(clave) * 0.000065, lon: lon + Math.cos(clave * 3) * 0.00007, alturaM: 6 + Math.abs(clave % 4) });
      continue;
    }
    dubrovnik.arquitectura.edificios.push({ lat: curva(lon), lon, exterior: true, parcela: true, anchoM: 15 + clave % 4, largoM: 15 + clave % 5, alturaM: 7 + clave % 10, alturaTejadoM: 1.7, orientacion: -Math.atan(0.14 * Math.cos((lon - 18.102) * 720 + fila * 0.16)), tono: clave % 5, chimenea: clave % 6 === 0 });
  }
}
for (let col = 0; col <= 40; col += 10) {
  const lon = 18.102 + col * 0.00024;
  dubrovnik.arquitectura.calles.push({ anchoM: 6, eje: Array.from({ length: 42 + col % 7 }, (_, i) => [42.6428 + i * 0.000088, lon + Math.sin(i * 0.15 + col) * 0.00012]) });
}
// Continuidad urbana costera a ambos lados del casco. Detalle reducido
// en los barrios lejanos para mantener el costo del mapa al girar.
for (const lado of [-1, 1]) {
  for (let fila = 0; fila < 9; fila += 1) {
    const eje = [];
    for (let col = 0; col < 34; col += 1) {
      const lon = lado < 0 ? 18.1018 - col * 0.00025 : 18.1120 + col * 0.00025;
      const lat = 42.6431 + fila * 0.00025 + Math.sin(col * 0.22 + fila * 0.12) * 0.00024;
      eje.push([lat - 0.00011, lon]);
      const clave = fila * 41 + col * 17;
      if (col % 9 === 0 || (fila > 5 && clave % 3 === 0)) continue;
      dubrovnik.arquitectura.edificios.push({ lat, lon, exterior: true, parcela: col < 10, lejano: col > 10, anchoM: 15 + clave % 5, largoM: 16 + clave % 4, alturaM: 7 + clave % 9, alturaTejadoM: 1.7, orientacion: (lado < 0 ? 1 : -1) * Math.atan(0.28 * Math.cos(col * 0.22 + fila * 0.12)), tono: clave % 5 });
    }
    dubrovnik.arquitectura.calles.push({ anchoM: 4.5, eje });
  }
}
// Puerto viejo: aproximación visual de la ensenada oriental y sus amarres.
// Se recorta solo el render del litoral; la ruta y sus kilómetros no cambian.
dubrovnik.arquitectura.puerto = {
  contorno: [[42.64175,18.11175],[42.64195,18.1122],[42.6419,18.1137],[42.6404,18.1142],[42.6397,18.1130],[42.6401,18.11205],[42.6409,18.11185]],
  bordes: [
    { eje: [[42.64175,18.11175],[42.64195,18.1122],[42.6419,18.1137]], anchoM: 10, alturaM: 4 },
    { eje: [[42.64175,18.11175],[42.6409,18.11185],[42.6401,18.11205],[42.6397,18.1130]], anchoM: 8, alturaM: 5 },
    { eje: [[42.6419,18.1137],[42.6411,18.11385]], anchoM: 7, alturaM: 3 },
  ],
  muelles: [
    { eje: [[42.64169,18.11199],[42.64166,18.11308]], anchoM: 7 },
    { eje: [[42.64025,18.11245],[42.64028,18.11322]], anchoM: 8 },
    { eje: [[42.64132,18.11200],[42.64130,18.11255]], anchoM: 3 },
  ],
  botes: Array.from({length: 45}, (_, i) => ({lat:42.64066 + Math.floor(i / 15) * 0.00028, lon:18.11222 + i % 15 * 0.000085, largoM:5 + i % 4, anchoM:2.2, mastil:i % 3 !== 0, vela:i % 9 === 0})),
};
// Siluetas que permiten reconocer el casco: campanario, cúpula y palacios.
dubrovnik.arquitectura.edificios.push(
  { monumento: true, lat: 42.64137, lon: 18.11073, anchoM: 7, largoM: 7, alturaM: 31, alturaTejadoM: 2.5, tipo: 'campanario', tono: 1 },
  { monumento: true, lat: 42.64067, lon: 18.11041, anchoM: 27, largoM: 39, alturaM: 18, tipo: 'cupula', tono: 2 },
  { monumento: true, lat: 42.64104, lon: 18.11075, anchoM: 24, largoM: 28, alturaM: 15, alturaTejadoM: 2, tono: 1 },
  { monumento: true, lat: 42.64162, lon: 18.11064, anchoM: 24, largoM: 31, alturaM: 16, alturaTejadoM: 2, tono: 3 },
);
// Frente urbano oriental: manzanas alrededor de la catedral y del puerto.
for (let fila = 0; fila < 7; fila += 1) {
  for (let col = 0; col < 5; col += 1) {
    const lat = 42.6400 + fila * 0.00016; const lon = 18.11005 + col * 0.00022;
    if ((lat > 42.64040 && lat < 42.64093 && lon < 18.11070) || (lat > 42.64085 && lon > 18.11048)) continue;
    dubrovnik.arquitectura.edificios.push({lat,lon,monumento:true,anchoM:13 + col % 3,largoM:14,alturaM:10 + (fila * 3 + col * 7) % 9,alturaTejadoM:1.8,tono:(fila+col)%5,chimenea:col%3===0});
  }
}
dubrovnik.arquitectura.edificios.push(
  {lat:42.64135,lon:18.11130,monumento:true,anchoM:20,largoM:53,alturaM:15,alturaTejadoM:2.2,orientacion:Math.PI/2,tipo:'arsenal',tono:2},
  {lat:42.64089,lon:18.11137,monumento:true,anchoM:15,largoM:24,alturaM:13,alturaTejadoM:2,tono:1},
  {lat:42.64042,lon:18.11117,monumento:true,anchoM:15,largoM:27,alturaM:16,alturaTejadoM:1.8,tono:3},
);
// Conjunto con patio interior al noroeste: rompe la trama de casas idénticas.
// Silueta de claustro aproximada, sin ocupar el Stradun ni el paseo de ronda.
dubrovnik.arquitectura.edificios = dubrovnik.arquitectura.edificios.filter(e => e.exterior || e.monumento || !(e.lat > 42.64153 && e.lat < 42.64200 && e.lon > 18.10613 && e.lon < 18.10700));
dubrovnik.arquitectura.edificios.push(
  {lat:42.64189,lon:18.10660,monumento:true,anchoM:32,largoM:8,alturaM:13,alturaTejadoM:1.8,tono:2},
  {lat:42.64163,lon:18.10660,monumento:true,anchoM:32,largoM:8,alturaM:11,alturaTejadoM:1.8,tono:3},
  {lat:42.64176,lon:18.10638,monumento:true,anchoM:8,largoM:28,alturaM:13,alturaTejadoM:1.6,tono:1},
  {lat:42.64176,lon:18.10682,monumento:true,anchoM:8,largoM:28,alturaM:12,alturaTejadoM:1.6,tono:2},
);
module.exports = dubrovnik;

