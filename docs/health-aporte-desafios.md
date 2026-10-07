# Aporte explícito de Salud a desafíos

Implementado en la rama de trabajo. Pendiente de habilitación en producción y prueba en dispositivo.

## Comportamiento

Mi movimiento → Configurar movimiento diario → Usar movimiento diario en desafíos.
Cada participación paga/gratuita se elige y confirma por separado. Conectar Salud
no activa aportes. Los pasos nunca se convierten a kilómetros.

La autorización comienza el siguiente día local completo; no importa días anteriores.
Desactivar conserva los días completos autorizados y excluye el día parcial actual.
Reactivar no cubre el intervalo desactivado. Para cambiar la zona horaria hay que
desactivar y confirmar de nuevo. La distancia residual descuenta actividades por
categoría; las pausas excluyen el día tocado por la pausa. Salud provisional mueve
el progreso visible, pero solo datos estables durante 48 horas permiten completar.

## Implementación

- SQL con RLS, historial por usuario/participación, RPC service_role y reloj servidor.
- API autenticada `/movimiento-diario/desafios`: propiedad derivada del JWT,
  validación de confirmación y versión; disponibilidad explícita del servidor.
- Motor y recuperación cargan el consentimiento por participación: manual, GPS,
  Strava, modalidad y reanudaciones conservan el aporte autorizado.
- Sincronizar Salud marca recálculos antes del upsert, utiliza CAS y deja pendientes
  recuperables si falla. Los efectos de desafíos pagos siguen en el motor existente.
- Islandia usa el mismo residual y autorización, con cierre estable guardado aparte.
  No crea medallas, PDFs ni emails de desafíos pagos.
- La app actualiza las tarjetas después de sincronizar. No necesita nuevas dependencias nativas.

## Habilitación

1. Desplegar el backend con la variable nueva todavía ausente/apagada.
2. Ejecutar `backend/migrations/20261007_health_consent.sql` en Supabase.
3. Verificar que existen las migraciones previas del motor (km_base, marcas,
   eventos, RPC completar_desafio_motor, bandeja y lápidas de Strava).
4. Verificar Railway:
   - `MOTOR_PROGRESO_WRITERS`: reanudar,eliminar_actividad,modalidad,efectos,actividad_manual,strava_import,strava_webhook,strava_progreso.
   - `MOTOR_PROGRESO_GPS=1`.
   - `MOTOR_PROGRESO_HEALTH_CONSENT=1` (variable NUEVA; no depende de MOTOR_PROGRESO_HEALTH).
5. En cuenta común: conectar Salud, elegir un desafío y confirmar; contrastar Salud
   y el desglose tras el primer día completo. Probar pausa, desactivar, Strava/GPS
   tardío y cierre estable. No anunciar producción completa antes de esa prueba.

La disponibilidad del selector exige todos esos writers. El backend con la variable
nueva apagada conserva los cálculos anteriores y no consulta la tabla nueva.
Después de comenzar aportes NO apagar la variable ni volver a writers antiguos:
se perdería la inclusión de Salud en futuros recálculos. Para detener aportes,
revocar consentimientos conservando el motor que lee su historial.

La migración no se ejecutó desde este entorno y no se verificaron las variables de
Railway. La pantalla comunica la falta de disponibilidad si el servidor no está listo.
