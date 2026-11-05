# Asignación de actividades manuales sin depender de pausas — diseño previo a implementación

## Problema confirmado (noviembre de 2026)

Una usuaria alterna Monte Fuji individual y Fin del Mundo compartido. La pantalla de registro manual elige el primer desafío activo/no pausado, pero `activities.challenge_id` es metadato: el motor 4A suma actividades elegibles a **todos** los desafíos según fecha/pausas, sin utilizarlo como destino exclusivo. La pantalla podía mostrar éxito aunque el backend respondiera «no se sumaron kilómetros».

Ejemplo: los 4,82 km guardados para Monte Fuji caen dentro de un período pausado y no suman; no deben reasignarse al otro desafío ni duplicarse. Esta rama **no corrige esos kilómetros**: requiere una corrección de soporte separada y auditable.

## Contrato propuesto (no implementado)

1. La carga manual ofrece **Destino**: «Todos los desafíos» (comportamiento histórico) o «Elegir desafíos». La selección permite uno o varios destinos, incluyendo desafíos temporalmente pausados.
2. El backend persiste la intención de asignación de manera **inmutable con la actividad**: propuesta `activities.manual_target_uc_ids uuid[] NULL`.
   - `NULL`: comportamiento histórico/automático (incluye todas las actividades existentes).
   - array no vacío: aplicar **solo** a los IDs de participaciones seleccionadas por el usuario.
   - array vacío: libre / sin desafío. No confundir con `NULL`.
   - Nunca inferir intención exclusiva a partir de `challenge_id`, porque ese campo ya existe con otra semántica.
3. Para actividades `source='manual'` con destinos explícitos, el cálculo **no usa los períodos de pausa para esas participaciones seleccionadas**. Conserva validaciones de fecha de inicio y `inicio_protegido_at` para reinicios administrativos, estado, exclusiones y límites de distancia. No suma a participaciones no seleccionadas.
4. Para Strava, GPS, Health y actividades manuales antiguas (`manual_target_uc_ids IS NULL`), se mantienen sin cambios el cálculo y las pausas actuales.
5. La API debe verificar autenticación y pertenencia de **cada** `user_challenges.id`, que la participación sea elegible y que la selección no se modifique en un recálculo. Rechazar explícitamente si el backend no tiene habilitado el nuevo writer; nunca guardar en modo antiguo ignorando la selección.
6. Elegir un destino **no debe reescribir** actividades anteriores ni recálculos de otras participaciones. Ediciones futuras de asignación requieren operación atómica, auditable, y marcación de recálculo.
7. La fecha manual debe distinguir **fecha/hora efectiva del entrenamiento** de fecha de creación; «Ayer» no debe asumir silenciosamente que la hora de entrenamiento coincide con la hora actual. Proponer hora opcional explícita y mostrar el instante antes de confirmar.
8. Responder con el detalle de lo que **sumó** y lo que **no sumó** y por qué. Nunca usar «registrado» como sinónimo de «acreditado».

## Secuencia de implementación segura

- Migración compatible con `NULL` por defecto, RLS y permisos revisados; no ejecutarla en producción hasta aprobación.
- Pruebas puras del motor: selección única, múltiple, destino pausado, modo automático, actividad previa al inicio, inicio protegido, exclusión, terminal, deduplicación, zonas horarias y retroactividad.
- Actualizar `CAMPOS_ACTIVIDAD` de todos los lectores y writers; igualar caminos legacy/motor o rechazar la funcionalidad en el legacy.
- Nuevo selector de la pantalla manual solo después de que backend admita la nueva semántica; pruebas de Android/iOS, reintentos, errores y resumen de progreso.
- Revisar progresos históricos antes de habilitar. Lanzamiento controlado con flag separada y rollback sin borrar historial.

## Corrección inmediata en esta rama

Solo mejora de feedback: si el backend indica «actividad registrada pero no sumó», la app deja de anunciar falsamente que el progreso avanzó. No se cambian kilómetros, pausas ni API.
