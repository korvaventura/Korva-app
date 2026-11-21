# Garmin: recepción privada de Activities Push

## Alcance desplegable

POST https://korva-app-production.up.railway.app/garmin/webhook captura resúmenes de Activities Push de la cuenta de prueba. No escribe en activities, no suma kilómetros, no envía notificaciones y no cambia activities_enabled:false. No hay un worker de procesamiento activado en esta entrega. Los registros quedan en garmin_push_events.state='capturado' para validar la primera salida real antes del writer común y la deduplicación transaccional con Strava.

## Contrato contrastado

Fuentes oficiales revisadas: Activity API 2.1 (Push Service, páginas 5-6), Start Guide 2.0 (Endpoint configuration), OAuth2 2.0. Los PDF se revisaron localmente y no se incluyen en el repositorio:

- https://developerportal.garmin.com/sites/default/files/Activity_API%202.1.pdf
- https://developerportal.garmin.com/sites/default/files/Garmin%20Developer%20Program_Start_Guide_2.0_0.pdf
- https://developerportal.garmin.com/sites/default/files/OAuth2PKCE%202.0.pdf

Garmin entrega HTTPS POST con un objeto { activities: [resúmenes] }. Se confirma con HTTP 200 antes del procesamiento de negocio; Garmin fija un plazo de 30 segundos y reintenta cada hora hasta siete días si no recibe 200. La captura se persiste primero en una transacción corta (plazo cliente 10 segundos), y recién entonces se confirma. Si falla el guardado se responde 503 y puede reintentarse sin duplicar.

Los rangos de origen publicados se permiten en garminPushCore.js mediante node:net.BlockList. En Railway se usa exclusivamente el X-Real-IP que añade el edge; nunca X-Forwarded-For ni un campo del JSON. Antes de configurar Garmin hay que probar contra el dominio público que falsificar X-Real-IP y X-Forwarded-For no permite pasar. Ante un cambio de proxy/hosting se debe volver a verificar esta condición; no abrir rangos ni desactivar el filtro para resolver errores. Esta es una restricción de origen, no una firma criptográfica; las secciones revisadas no describen una firma HMAC para Activities Push.

Referencia del encabezado del edge: https://docs.railway.com/networking/public-networking/specs-and-limits

## Restricción privada y persistencia

Requiere GARMIN_PUSH_CAPTURE_ENABLED=1, GARMIN_OAUTH_ENABLED=1 y GARMIN_OAUTH_TEST_USER_IDS con UUIDs explícitos. No hay modo público implícito. La RPC solo admite registros que correspondan a garmin_connections, estén en esa lista y tengan ACTIVITY_EXPORT.

La tabla tiene RLS y permisos exclusivos de service_role. Clave única (user_id,summary_id,fingerprint): una retransmisión concurrente se guarda una sola vez y una revisión diferente preserva el resumen anterior. El usuario Korva siempre se obtiene de la conexión Garmin del servidor, nunca del cuerpo entrante.

Se conserva una lista mínima de campos para importar: identificador, deporte, distancia, duración, inicio UTC, dispositivo y marcas de actividad padre/hija/manual/web. No se guardan el JSON original, frecuencia cardíaca, coordenadas ni credenciales. Los logs contienen solo resultado y contadores. Se limita el cuerpo a 2 MiB y el lote a 1000 resúmenes. Los datos malformados no se confirman como capturados.

## Despliegue y primer paso del titular

1. Aplicar backend/migrations/20261121204251_garmin_push_capture.sql y desplegar la rama del receptor.
2. Habilitar GARMIN_PUSH_CAPTURE_ENABLED=1 manteniendo la misma cuenta de prueba.
3. Confirmar despliegue SUCCESS, /health operativo, y rechazo HTTP 403 desde fuera de Garmin, también con encabezados de origen falsificados.
4. En Endpoint Configuration completar SOLO ACTIVITY - Activities con la URL de arriba; marcar enabled, dejar on hold desmarcado y guardar. Dejar el resto sin configurar por ahora.
5. Validar una entrega mediante las herramientas de Garmin o sincronizando una salida nueva del reloj a Connect. Confirmar en logs captured y en la bandeja un resumen de la cuenta habilitada. Reenviar el mismo resumen no debe crear una segunda revisión. No esperar importación histórica en Starter.
6. Todavía no mostrar ni prometer kilómetros de Garmin. La siguiente entrega integrará el writer, el motor, el push para compartir y la deduplicación Garmin/Strava en una transacción compartida, con pruebas reales en ambos órdenes.

Si el portal advierte revisión del dominio, el Start Guide indica una revisión de seguridad de 24-48 horas; no desactivar controles de recepción para intentar evitarla.

## Duplicados con Strava

Esta rama incluye una función de PREVISUALIZACIÓN y sus pruebas: mismo usuario, fuentes Garmin/Strava, inicio ±10 min, distancia simétrica max(0.3 km,5% de la mayor), deporte compatible y filas no excluidas. Incluye cruces de medianoche, tipos incompatibles y dos entrenamientos distintos del mismo día. No se usa todavía para escribir. El writer definitivo debe resolver la carrera entre servidores dentro de PostgreSQL y conservar la primera fila; consultar antes de insertar desde JavaScript no basta.
