# Garmin: estado y siguiente entrega (2026-11-21)

## Ya publicado

El PR #24 está integrado en main (b69e13d). Railway confirmó SUCCESS para el despliegue 296d3b9a-0715-46a7-a466-5c0610d878dd. Las cinco variables de Garmin están aplicadas. La prueba OAuth sigue limitada a la cuenta autorizada y activities_enabled permanece false. La migración OAuth inicial ya está aplicada. La autorización real en teléfono sigue pendiente del titular.

El PR móvil #25 se cerró sin integrar. El reemplazo indicado por Fabri es feat/garmin-conexiones-20261121 @ 4a53b7f, basado en mundi/globo-santiago-20261116 @ 49ff72f. Esta nueva rama todavía no aparecía en el remoto al preparar esta entrega. No recuperar PerfilScreen desde la rama antigua.

## Esta rama: ciclo de credenciales, todavía sin desplegar

- DELETE /garmin/connection: requiere sesión válida y la misma lista privada de OAuth. Revoca la inscripción en Garmin antes de borrar las credenciales locales. Si Garmin falla, conserva la conexión para poder reintentar. Sin conexión previa responde connected:false.
- Con un token de acceso vencido, renueva con grant_type=refresh_token y guarda cifrado el nuevo refresh token antes de usar el acceso nuevo.
- Renovación y desconexión comparten una reserva en PostgreSQL de 90 segundos por cuenta, válida entre procesos. Cada petición de red tiene un plazo de 15 segundos. Las escrituras verifican la propiedad y vigencia de la reserva.
- La renovación es un servicio interno bajo demanda; no existe una ruta HTTP que exponga tokens ni un trabajo periódico.
- Si también venció el refresh token, se requiere revocar desde Garmin Connect; no se anuncia una desconexión que no se haya podido ejecutar.
- Aplicar 20261121194000_garmin_connection_lease.sql antes de desplegar esta rama. No se aplicó a producción al preparar el PR.

La garantía es excluir operaciones concurrentes. Si Garmin rota el refresh token y el proceso muere antes de persistirlo, puede requerirse una nueva autorización; no existe transacción distribuida con Garmin. No abrir a todas las cuentas antes de completar el ciclo de revocación desde Garmin y la integración con el borrado de cuenta de Korva.

## Recepción y prevención de duplicados: pendientes

La página oficial del programa confirma Starter = Push only:
https://developerportal.garmin.com/developer-programs/connect-developer-api

Falta la documentación privada de Activity API que confirme el esquema de Activities Push, su autenticación/verificación de entrega, identificador estable de actividad, tipos de notificación (incluidas revocación/permisos), reintentos y respuestas esperadas. No aceptar JSON no autenticado que pueda aumentar kilómetros, ni inventar una firma que Garmin no envíe.

Pendiente de recuperar garmin-plan-sincronizacion.md y la rama móvil actual. En main todavía no existen backend/lib/toleranciaDuplicados.js ni el parámetro external_id para el push de progreso descritos en el handoff. Hay que inspeccionar esos cambios antes de integrarlos.

La siguiente implementación debe:

1. Persistir el evento antes de confirmar recepción y reutilizar el recálculo y los efectos existentes, sin crear un segundo cálculo de progreso.
2. Guardar la actividad con source=garmin y normalizar hora UTC, distancia y deporte según el esquema verificado. Usar identificador externo con ámbito de fuente, no asumir que los números de Garmin y Strava nunca coinciden.
3. Comprobar duplicados en ambos sentidos dentro de una transacción y un bloqueo compartido por cuenta. Consultar antes de insertar desde JavaScript no protege contra dos servidores simultáneos.
4. Candidata: mismo usuario, inicio a ±10 minutos y distancia con tolerancia max(0.3 km, 5%). Conservar la primera fila y su progreso. Probar deportes incompatibles, cruces de medianoche, dos salidas distintas del mismo día, eventos concurrentes, reintentos y actualizaciones/borrados de la copia descartada. Verificar antes la regla exacta de distancia simétrica.
5. Mantener las reglas de inscripción, pausas, desafíos completados y efectos idempotentes del motor actual. Una copia descartada no dispara un segundo push ni cambia la fila ganadora.
6. Pasar external_id al push para compartir, coordinando el contrato con la rama móvil actual.
7. Cambiar activities_enabled a true únicamente cuando la recepción, el motor y la deduplicación estén desplegados y aceptados en prueba privada.

## Prueba de vinculación en teléfono

Abrir la nueva versión de desarrollo con la cuenta Korva autorizada. Ir a Perfil → Conexiones → Garmin; autorizar la cuenta Garmin elegida (puede usar otro correo); verificar regreso a Korva y cuenta vinculada, con aviso de que aún no suma kilómetros. Reiniciar la app y comprobar persistencia. Probar cancelación antes del alta exitosa y confirmar que una segunda cuenta no ve Garmin. Nunca enviar claves, tokens ni URL completa del callback en capturas.
