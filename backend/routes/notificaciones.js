const enviarPushNotification = async (pushToken, title, body) => {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: pushToken, title, body, sound: 'default' }),
    });
  } catch (error) {
    console.error('Error enviando push notification:', error);
  }
};

// Checkpoints por challenge (km físicos)
const CHECKPOINTS = {
  'ae54af78-dc6f-4cf5-af31-2c077ba58048': [ // Fin del Mundo
    { km: 20,  nombre: 'Lago Fagnano',    emoji: '💧' },
    { km: 45,  nombre: 'Paso Garibaldi',  emoji: '⛰️' },
    { km: 80,  nombre: 'Monte Olivia',    emoji: '🗻' },
    { km: 103, nombre: 'Ushuaia',         emoji: '🏁' },
  ],
  '64442b1d-12b8-4a58-a951-50ea10cb2131': [ // Dubrovnik
    { km: 4,    nombre: 'Fort Lovrijenac', emoji: '⚔️' },
    { km: 8,    nombre: 'Stradun',         emoji: '🪨' },
    { km: 12,   nombre: 'Fort Bokar',      emoji: '🔭' },
    { km: 16,   nombre: 'Torre Minčeta',   emoji: '👑' },
    { km: 19.4, nombre: 'Ploče Gate',      emoji: '🌊' },
  ],
  '85a362a5-eee7-456d-9027-358d44446004': [ // San Andrés
    { km: 11, nombre: 'Johnny Cay',      emoji: '🏖️' },
    { km: 21, nombre: 'Haynes Cay',      emoji: '🤿' },
    { km: 34, nombre: 'Cueva de Morgan', emoji: '💰' },
    { km: 44, nombre: 'El Hoyo',         emoji: '🌀' },
    { km: 57, nombre: 'Punta Sur',       emoji: '🌅' },
  ],
};

/**
 * Evalúa el progreso y manda UNA sola notificación por actividad.
 * Prioridad: completado > checkpoint nuevo > hito % > confirmación km
 */
const enviarNotificacionProgreso = async (supabase, userId, challengeId, challengeTitle, kmAntesFloat, kmDespuesFloat, distanciaTotal) => {
  try {
    const { data: usuario } = await supabase
      .from('users')
      .select('push_token, name')
      .eq('id', userId)
      .maybeSingle();

    if (!usuario?.push_token) return;

    const token = usuario.push_token;
    const nombre = usuario.name?.split(' ')[0] || '';
    const pctAntes = (kmAntesFloat / distanciaTotal) * 100;
    const pctDespues = Math.min((kmDespuesFloat / distanciaTotal) * 100, 100);
    const kmRegistrados = (kmDespuesFloat - kmAntesFloat).toFixed(1);

    // 1. RETO COMPLETADO
    if (pctAntes < 100 && pctDespues >= 100) {
      await enviarPushNotification(token,
        '🏅 ¡Lo lograste!',
        `Completaste ${challengeTitle}. Tu medalla está en camino 🎉`
      );
      return;
    }

    // 2. CHECKPOINT NUEVO DESBLOQUEADO
    const checkpoints = CHECKPOINTS[challengeId] || [];
    // Factor para convertir km reales a km físicos del mapa
    const distanciaFisica = checkpoints.length > 0
      ? checkpoints[checkpoints.length - 1].km
      : distanciaTotal;
    const factor = distanciaTotal / distanciaFisica;
    const kmFisicosAntes = kmAntesFloat / factor;
    const kmFisicosDespues = kmDespuesFloat / factor;

    // Buscar el checkpoint más avanzado desbloqueado en esta actividad
    let checkpointNuevo = null;
    for (const cp of checkpoints) {
      if (cp.km > kmFisicosAntes && cp.km <= kmFisicosDespues) {
        checkpointNuevo = cp; // quedarse con el último
      }
    }

    if (checkpointNuevo) {
      await enviarPushNotification(token,
        `${checkpointNuevo.emoji} ¡${checkpointNuevo.nombre} desbloqueado!`,
        `Llevas ${kmDespuesFloat.toFixed(1)}km en ${challengeTitle}. ¡Seguí así${nombre ? `, ${nombre}` : ''}!`
      );
      return;
    }

    // 3. HITOS DE PORCENTAJE (75% y 90%)
    const hitos = [
      { pct: 90, title: '🔥 ¡Último tramo!', body: `Te quedan solo ${(distanciaTotal - kmDespuesFloat).toFixed(1)}km para terminar ${challengeTitle}. ¡No pares!` },
      { pct: 75, title: '💪 ¡Ya casi!',       body: `Completaste el 75% de ${challengeTitle}. Te quedan ${(distanciaTotal - kmDespuesFloat).toFixed(1)}km.` },
      { pct: 50, title: '⚡ ¡Mitad del camino!', body: `50% de ${challengeTitle} completado. ¡Seguís en racha!` },
    ];

    for (const hito of hitos) {
      if (pctAntes < hito.pct && pctDespues >= hito.pct) {
        await enviarPushNotification(token, hito.title, hito.body);
        return;
      }
    }

    // 4. CONFIRMACIÓN DE KM (siempre como fallback)
    await enviarPushNotification(token,
      `✅ +${kmRegistrados} km registrados`,
      `${pctDespues.toFixed(0)}% de ${challengeTitle} completado. ¡Muy bien${nombre ? `, ${nombre}` : ''}!`
    );

  } catch (error) {
    console.error('Error enviando notificación de progreso:', error);
  }
};

/**
 * Notificación de inactividad — llamar desde un cron job o manualmente
 */
const enviarNotificacionInactividad = async (supabase, userId, challengeTitle, diasSinActividad) => {
  try {
    const { data: usuario } = await supabase
      .from('users')
      .select('push_token, name')
      .eq('id', userId)
      .maybeSingle();

    if (!usuario?.push_token) return;

    const nombre = usuario.name?.split(' ')[0] || '';
    const mensajes = [
      { dias: 3,  title: `👋 ¡Hola${nombre ? `, ${nombre}` : ''}!`,    body: `Llevas 3 días sin correr en ${challengeTitle}. ¿Salís hoy?` },
      { dias: 7,  title: '😴 Tu medalla te extraña',                    body: `Una semana sin actividad en ${challengeTitle}. Cada km cuenta.` },
      { dias: 14, title: '🏅 Tu medalla sigue esperándote',             body: `${challengeTitle} sigue ahí. Retomá cuando quieras, sin presión.` },
    ];

    const msg = mensajes.find(m => m.dias === diasSinActividad);
    if (msg) {
      await enviarPushNotification(usuario.push_token, msg.title, msg.body);
    }
  } catch (error) {
    console.error('Error enviando notificación de inactividad:', error);
  }
};

module.exports = { enviarNotificacionProgreso, enviarNotificacionInactividad };