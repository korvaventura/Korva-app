// Sync AUTOMÁTICO de Apple Health → daily_movement. Solo iOS, solo admins por ahora.
//
// - Opt-in explícito: solo corre si el admin lo activó en la pantalla de diagnóstico.
// - Nunca pide permisos: si el pedido de permiso no se mostró antes, no hace nada.
// - Últimos 7 días, incluido hoy (cada sync reemplaza el snapshot de cada día).
// - Máximo un sync exitoso cada 3 horas; después de un error, nuevo intento a los 30 minutos.
// - Nunca lanza errores ni muestra alertas: solo guarda el último resultado.
// No toca activities, user_challenges ni ningún progreso.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { plataformaSoportada, estadoSalud, leerMovimientoDiario } from './healthkitLectura';
import { construirPayload, enviarMovimiento } from './movimientoSync';

const DIAS = 7;
const INTERVALO_EXITO_MS = 3 * 60 * 60 * 1000;
const INTERVALO_ERROR_MS = 30 * 60 * 1000;

const claveActivado = (userId) => `health_sync_auto_activado_${userId}`;
const claveEstado = (userId) => `health_sync_auto_estado_${userId}`;

// Evita dos syncs simultáneos (por ejemplo, abrir la app y volver de segundo plano casi juntos).
let enCurso = false;

export async function autoSyncActivado(userId) {
  if (!userId) return false;
  try {
    return (await AsyncStorage.getItem(claveActivado(userId))) === 'true';
  } catch {
    return false;
  }
}

export async function setAutoSyncActivado(userId, activado) {
  if (!userId) return;
  await AsyncStorage.setItem(claveActivado(userId), activado ? 'true' : 'false');
}

export async function leerEstadoAutoSync(userId) {
  if (!userId) return null;
  try {
    const texto = await AsyncStorage.getItem(claveEstado(userId));
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

// Guarda el resultado del intento actual. De lo anterior solo se conservan las
// marcas de tiempo, así no quedan mezclados datos de un sync viejo.
async function guardarEstado(userId, previo, cambios) {
  const estado = {
    ultimoExitoMs: previo?.ultimoExitoMs ?? null,
    ultimoErrorMs: previo?.ultimoErrorMs ?? null,
    ...cambios,
    ultimoIntentoMs: Date.now(),
  };
  try {
    await AsyncStorage.setItem(claveEstado(userId), JSON.stringify(estado));
  } catch {
    // Si no se puede guardar el estado, el sync no se rompe por eso.
  }
  return estado;
}

export async function ejecutarSyncAutomatico(userId) {
  if (!['ios', 'android'].includes(Platform.OS) || !plataformaSoportada || !userId) {
    return { ejecutado: false, motivo: 'no_disponible' };
  }
  if (enCurso) return { ejecutado: false, motivo: 'en_curso' };
  enCurso = true;

  let previo = null;
  try {
    if (!(await autoSyncActivado(userId))) {
      return { ejecutado: false, motivo: 'desactivado' };
    }

    previo = await leerEstadoAutoSync(userId);
    const ahora = Date.now();
    if (previo?.ultimoExitoMs && ahora - previo.ultimoExitoMs < INTERVALO_EXITO_MS) {
      return { ejecutado: false, motivo: 'reciente' };
    }
    const errorEsElUltimo = previo?.ultimoErrorMs && (!previo.ultimoExitoMs || previo.ultimoErrorMs > previo.ultimoExitoMs);
    if (errorEsElUltimo && ahora - previo.ultimoErrorMs < INTERVALO_ERROR_MS) {
      return { ejecutado: false, motivo: 'esperando_reintento' };
    }

    const salud = await estadoSalud();
    if (!salud.disponible || salud.estadoPermiso !== 'ya_pedido') {
      // Nunca se pide permiso automáticamente.
      await guardarEstado(userId, previo, {
        resultado: 'sin_permiso',
        error: null,
        status: null,
        ultimoErrorMs: Date.now(),
      });
      return { ejecutado: false, motivo: 'sin_permiso' };
    }

    const lectura = await leerMovimientoDiario(DIAS);
    const prep = construirPayload(lectura, { origen: 'sync_auto_v1' });
    const base = { enviados: prep.enviados, omitidosLocales: prep.omitidosLocales };

    if (prep.errorLocal) {
      await guardarEstado(userId, previo, {
        ...base, resultado: 'error', error: prep.errorLocal, status: null, ultimoErrorMs: Date.now(),
      });
      return { ejecutado: true, motivo: 'error_local' };
    }

    if (!prep.payload) {
      // Ningún día con distancia medida: no se llama al backend.
      await guardarEstado(userId, previo, {
        ...base, resultado: 'sin_datos', error: null, status: null, ultimoExitoMs: Date.now(),
      });
      return { ejecutado: true, motivo: 'sin_datos' };
    }

    const respuesta = await enviarMovimiento(prep.payload);
    if (respuesta.ok) {
      await guardarEstado(userId, previo, {
        ...base,
        resultado: 'ok',
        error: null,
        status: respuesta.status,
        guardados: respuesta.cuerpo?.guardados || [],
        omitidosBackend: respuesta.cuerpo?.omitidos || [],
        ultimoExitoMs: Date.now(),
      });
      return { ejecutado: true, motivo: 'ok' };
    }

    await guardarEstado(userId, previo, {
      ...base,
      resultado: 'error',
      error: respuesta.error,
      detalle: Array.isArray(respuesta.cuerpo?.detalle) ? respuesta.cuerpo.detalle : null,
      status: respuesta.status,
      ultimoErrorMs: Date.now(),
    });
    return { ejecutado: true, motivo: 'error_backend' };
  } catch (e) {
    await guardarEstado(userId, previo, {
      resultado: 'error', error: e?.message || String(e), status: null, ultimoErrorMs: Date.now(),
    });
    return { ejecutado: true, motivo: 'error' };
  } finally {
    enCurso = false;
  }
}