// Registro de escenas 3D por clave de configuración de desafío (CONFIGS en
// screens/MapaRecorrido.js). Agregar un desafío 3D = una escena + su horneado
// + una línea acá. Los require son perezosos: cada horneado se evalúa recién
// cuando se abre su mapa.

const ESCENAS = {
  dubrovnik: () => ({ escena: require('./dubrovnik'), horneado: require('./dubrovnik.horneado') }),
  san_andres: () => ({ escena: require('./sanAndres'), horneado: require('./sanAndres.horneado') }),
  default: () => ({ escena: require('./finDelMundo'), horneado: require('./finDelMundo.horneado') }),
  monte_fuji: () => ({ escena: require('./monteFuji'), horneado: require('./monteFuji.horneado') }),
};

function escenaParaConfig(clave) {
  const cargar = Object.prototype.hasOwnProperty.call(ESCENAS, clave) ? ESCENAS[clave] : null;
  return cargar ? cargar() : null;
}

const clavesConEscena = () => Object.keys(ESCENAS);

module.exports = { escenaParaConfig, clavesConEscena };
