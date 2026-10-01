// Sync MANUAL de validación: Apple Health → POST /movimiento-diario/sync. Solo admins.
//
// No importa HealthKit: trabaja únicamente con el resultado que ya devuelve
// leerDiagnostico(). Solo envía distancia REAL medida por HealthKit; los pasos
// se mandan como dato, nunca se convierten a km. No toca activities,
// user_challenges ni ningún progreso.
//
// Comportamiento del backend (verificado en backend/routes/movimiento.js):
// upsert por (user_id, fecha) que REEMPLAZA los valores del día con los recibidos.
// No aplica ningún máximo contra el valor anterior.
import { supabase } from '../../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
const MAX_LARGO_FUENTE = 100;
// Modelos técnicos de Apple, por ejemplo "iPhone14,3" o "Watch6,1".
const PATRON_MODELO = /^[A-Za-z]+\d+,\d+$/;

const redondear3 = (n) => Math.round(n * 1000) / 1000;

// bundleIdentifier → modelos técnicos conocidos (sin nombres personales).
const modelosPorFuente = (diag) => {
  const mapa = {};
  Object.values(diag.fuentes || {}).forEach((lista) => {
    (lista || []).forEach((f) => {
      (f.dispositivos || []).forEach((descripcion) => {
        const modelo = String(descripcion).split(' · ')[0];
        if (!PATRON_MODELO.test(modelo)) return;
        if (!mapa[f.bundleIdentifier]) mapa[f.bundleIdentifier] = new Set();
        mapa[f.bundleIdentifier].add(modelo);
      });
    });
  });
  return mapa;
};

const desgloseMinimo = (lista, redondeo) =>
  (lista || []).map((f) => ({ bundleIdentifier: f.bundleIdentifier, valor: redondeo(f.valor || 0) }));

export function construirPayload(diag) {
  const resultado = { payload: null, enviados: [], omitidosLocales: [], errorLocal: null };

  if (!diag || !Array.isArray(diag.dias)) {
    resultado.errorLocal = 'No hay una lectura de Salud para sincronizar.';
    return resultado;
  }
  if (!diag.zonaHoraria || diag.zonaHoraria === 'desconocida') {
    resultado.errorLocal = 'No se pudo obtener la zona horaria del teléfono.';
    return resultado;
  }

  const modelos = modelosPorFuente(diag);
  const dias = [];

  diag.dias.forEach((dia) => {
    const caminando = dia.consolidado?.caminando;
    const bici = dia.consolidado?.bici;
    const pasos = dia.consolidado?.pasos;
    const hayCaminando = typeof caminando === 'number';
    const hayBici = typeof bici === 'number';

    // Solo se envía si HealthKit devolvió al menos una distancia medida.
    if (!hayCaminando && !hayBici) {
      resultado.omitidosLocales.push({
        fecha: dia.fecha,
        motivo: typeof pasos === 'number' ? 'solo pasos, sin distancia medida' : 'sin datos',
      });
      return;
    }

    const bundles = new Set();
    ['caminando', 'bici', 'pasos'].forEach((clave) =>
      (dia.porFuente?.[clave] || []).forEach((f) => bundles.add(f.bundleIdentifier))
    );
    const modelosDia = new Set();
    bundles.forEach((b) => (modelos[b] || new Set()).forEach((m) => modelosDia.add(m)));
    const fuenteDispositivo = modelosDia.size
      ? [...modelosDia].join(', ').slice(0, MAX_LARGO_FUENTE)
      : null;

    dias.push({
      fecha: dia.fecha,
      distancia_caminando_km: hayCaminando ? redondear3(caminando) : 0,
      distancia_bici_km: hayBici ? redondear3(bici) : 0,
      // Solo como dato. Nunca se convierte a km.
      pasos: typeof pasos === 'number' ? Math.round(pasos) : null,
      tipo_medicion: 'medido',
      fuente_dispositivo: fuenteDispositivo,
      raw_payload: {
        origen: 'diagnostico_manual_v1',
        por_fuente: {
          caminando: desgloseMinimo(dia.porFuente?.caminando, redondear3),
          bici: desgloseMinimo(dia.porFuente?.bici, redondear3),
          pasos: desgloseMinimo(dia.porFuente?.pasos, Math.round),
        },
      },
    });
    resultado.enviados.push(dia.fecha);
  });

  if (dias.length > 0) {
    // Sin user_id (el backend lo toma del token) y sin distancia_km_total (lo calcula el backend).
    resultado.payload = { plataforma: 'apple_health', timezone: diag.zonaHoraria, dias };
  }
  return resultado;
}

export async function enviarMovimiento(payload) {
  const { data, error } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) {
    return { ok: false, status: null, cuerpo: null, error: 'No hay una sesión activa. Volvé a iniciar sesión.' };
  }

  let res;
  try {
    res = await fetch(`${BACKEND_URL}/movimiento-diario/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ok: false, status: null, cuerpo: null, error: `No se pudo conectar con el backend: ${e?.message || String(e)}` };
  }

  const texto = await res.text();
  let cuerpo = texto;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    // El cuerpo no era JSON: se conserva como texto.
  }

  return {
    ok: res.ok,
    status: res.status,
    cuerpo,
    error: res.ok ? null : (cuerpo && cuerpo.error) || `HTTP ${res.status}`,
  };
}