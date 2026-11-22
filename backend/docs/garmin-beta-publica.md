# Garmin: beta pública

Base de esta entrega: integracion/app-garmin-20261121 @ f33508c. No modifica routes/notificaciones.js, routes/strava.js, lib/toleranciaDuplicados.js ni lib/progresoRepositorioSupabase.js.

## Interruptores (Railway)

- GARMIN_PUBLIC_BETA_ENABLED=1: OAuth para cualquier usuario autenticado, captura y worker para todos los conectados con ACTIVITY_EXPORT.
- GARMIN_PUBLIC_BETA_ENABLED=0 o ausente: vuelve a GARMIN_OAUTH_TEST_USER_IDS. Una lista vacía no abre acceso.
- GARMIN_OAUTH_ENABLED=0: cierra altas, captura y procesamiento para todos. Los endpoints de consentimiento y DELETE /garmin/connection siguen funcionando. El estado permite ver/desconectar una conexión previa aunque la integración esté cerrada.
- Para procesar, además se necesitan GARMIN_ACTIVITIES_ENABLED=1 y GARMIN_PUSH_CAPTURE_ENABLED=1. El cambio de variables necesita aplicarse y reiniciar/desplegar el servicio. No se habilitan estos interruptores desde este PR.

En las RPC solo service_role puede pasar p_allowed_ids=NULL (modo público explícito); array vacío deniega. Las credenciales y tokens siguen exclusivamente en servidor. El origen de los callbacks se verifica igual que Activities Push mediante rangos Garmin y X-Real-IP del edge Railway.

## Migraciones y orden

1. Validar CI completo.
2. Aplicar 20261121194000_garmin_connection_lease.sql (PR #26, si no está aplicada).
3. Aplicar 20261122010000_garmin_public_beta.sql. No reemplaza el trigger de duplicados revisado por Claude.
4. Desplegar esta implementación junto con la rama de integración. Mantener modo privado para probar recepción, progreso, aviso y desconexión antes de abrir el interruptor público.
5. Configurar y habilitar en Garmin los endpoints Common indicados abajo, sin on hold.
6. Tras la prueba, abrir beta con GARMIN_PUBLIC_BETA_ENABLED=1. Cerrar con 0 para volver a la cuenta de prueba; cerrar todo con GARMIN_OAUTH_ENABLED=0.

## Endpoints

- POST /garmin/auth, GET /garmin/status: JWT Korva, identidad exclusivamente del middleware.
- DELETE /garmin/connection: JWT Korva, sin depender de los interruptores de alta. Renueva token si corresponde, revoca en Garmin y después borra la conexión. Conserva credenciales locales ante fallo de proveedor y serializa renovación/desconexión con una reserva de PostgreSQL. Si el webhook ya borró la conexión, la operación es idempotente.
- Common Deregistration: https://korva-app-production.up.railway.app/garmin/deregistration
- Common User Permissions: https://korva-app-production.up.railway.app/garmin/permissions

Los dos callbacks admiten HTTPS POST, responden 200 después del guardado transaccional y 503 si falla (reintentar). Siguen funcionando con beta/OAuth cerrados. Desconexión remota elimina credenciales y captura pendiente por cascade; cambios de permisos actualizan ACTIVITY_EXPORT y descartan resúmenes pendientes al revocarlo. Cambios de permisos atrasados no pisan uno más reciente ni una conexión posterior al cambio. No se borran las actividades históricas ya importadas por una desconexión: la eliminación de datos es un flujo diferente.

El formato oficial de deregistrations contiene solo userId, sin grant id ni fecha: no permite distinguir con certeza un aviso retrasado de una inscripción anterior tras reconectar la misma cuenta. No se inventa un timestamp del proveedor.

## Push

El worker usa el informe del motor (escrito, actualizar_km, active, km_nuevo > km_leido), relee propiedad/pausa/estado, calcula objetivo de la versión y llama al notifier existente con { external_id: 'garmin:...' }. La completitud conserva sus efectos propios. Un reenvío que no aumenta progreso no genera un nuevo aviso. Como el notifier compartido de Strava, la entrega push no tiene garantía exactly-once frente a una caída entre recálculo y envío.

## Fuentes revisadas

OAuth2PKCE 2.0, secciones 6–9 (descargado y revisado localmente):
https://developerportal.garmin.com/sites/default/files/OAuth2PKCE%202.0.pdf

Registra DELETE en https://apis.garmin.com/partner-gateway/rest/user/registration, deregistrations:[{userId}], userPermissionsChange:[{userId,summaryId,permissions,changeTimeInSeconds}]. Se conserva el intercambio OAuth/identidad ya probado; solo la nueva revocación usa la URL de esta versión de la guía.

## Validación

Tests Garmin: acceso público/privado, JWT, desconexión, reserva y rotación de token, webhooks con beta apagada, origen, rechazo de payloads, fallas de DB, formato de push y desafíos pausados/completados. Prueba PostgreSQL nueva comprueba scope NULL/array vacío, importación, revocación, permisos atrasados, deregistrations repetidas y privilegios. Los cuatro archivos protegidos deben permanecer idénticos a la rama base.
