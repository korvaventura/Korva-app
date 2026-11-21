# Garmin: revisión y aplicación por Claude

Fabricio autorizó compartir estos cambios y pidió que Claude esté al tanto y aplique la integración. Este documento NO afirma que el candidato esté listo para producción.

## Estado comprobado

- Repositorio korvaventura/Korva-app. Railway despliega main, raíz backend. Último despliegue comprobado 492affc (PR #29), SUCCESS.
- OAuth y captura privada funcionan. Endpoint POST /garmin/webhook. ACTIVITY Activities ya enabled, no on hold.
- Se recibió directamente desde Garmin una actividad RUNNING, external_id garmin:25156751740, 0.01082 km, 168 s, inicio 2026-11-21T22:11:49Z. Un evento capturado confirmado en garmin_push_events.
- Strava está desconectado de Korva por decisión del usuario. Garmin debe funcionar por sí solo. No pedir más actividades hasta procesar esta.
- No se modificó progreso con Garmin todavía. GARMIN_ACTIVITIES_ENABLED no se habilitó.

## Candidato

Parche en docs/handoffs/garmin-progreso-20261121.patch, basado en 492affc. Implementación local original commit 41f47aa. No está aplicado en esta rama: contiene solo el parche y este encargo. Aplicar con git apply --check y después git apply sobre una rama de implementación desde main actualizado, revisando conflictos.

Agrega worker privado con flag GARMIN_ACTIVITIES_ENABLED=1, allowlist GARMIN_OAUTH_TEST_USER_IDS y flags OAuth/captura. La RPC importa eventos, marca desafíos antes de insertar en una transacción y conserva el evento pendiente hasta completar recálculo/efectos. Reutiliza recalcularConReintentos y procesadorEventos. Inserciones por external_id son idempotentes y no reviven actividades excluidas. Incluye trigger de deduplicación Garmin/Strava en ambos órdenes y pruebas.

## Validación pendiente obligatoria

1. Revisar el código y sus decisiones antes de aplicarlo: el trigger afecta INSERT en activities también para Strava y necesita validar compatibilidad con writers legados, concurrencia real y efectos secundarios. Evaluar restringir alcance a la cuenta privada. Verificar motor reconoce source garmin, constraints SQL y UI muestra origen Garmin.
2. Revisar política para revisiones del mismo external_id (candidato conserva primera fila), actividades padre/hija y manuales. Evitar duplicación con otras fuentes si corresponde.
3. npm test del backend previo pasó sin fallos; cuatro tests nuevos de garminProcesamiento pasaron aparte. Syntax checks Node/Python y git diff --check pasaron. Las pruebas nuevas PostgreSQL NO se ejecutaron aquí por falta de Postgres local. El parche agrega paso CI para ellas, que debe pasar antes de migrar producción.
4. Revisar dedup concurrente y pruebas en PostgreSQL con Garmin/Strava simultáneos y ambos órdenes, replay, exclusiones, pausas, sin desafíos activos y recuperación tras caída.
5. Completar docs y flags de estado: receptor actualmente reporta activities_enabled:false; actualizar status/UI solo cuando validado. Considerar notificaciones de actividad/push además de completitud si el flujo lo requiere.
6. Solo tras validar: aplicar migración backend/migrations/20261121223000_garmin_import.sql, desplegar implementación y habilitar worker únicamente para misma cuenta privada. Procesar evento ya capturado, comparar activities/progreso antes y después, reenviar para verificar no suma dos veces. No abrir a todos.

## Entrega

Informar a Fabricio qué se aplicó, pruebas, despliegue y kilómetros registrados. No declarar listo por haber aplicado solo el parche. No incluir credenciales ni tokens en commits o mensajes.
