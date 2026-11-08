# Camino de Santiago y Vía Appia: preparación del backend

Esta rama agrega los productos de Shopify y sus plantillas propias al backend actual de main. No integra los mapas ni modifica las pantallas móviles. No activa los desafíos ni despliega código.

| Desafío | Distancia | Producto Shopify | Plantillas en korva-images/Plantillas |
| --- | --- | --- | --- |
| Camino de Santiago | 775 km | 15473077878962 | Dorsales_CaminoSantiago.pptx / Postales_CaminoSantiago.pptx |
| Vía Appia, Brindisi → Roma | 611 km | 15473077780658 | Dorsales_ViaAppia.pptx / Postales_ViaAppia.pptx |

El 8 de noviembre de 2026 se sincronizó el contenido inactivo de Appia en Supabase con el fixture aprobado: 13 hitos, desde Brindisi (0) hasta Roma (611), historia, descripción y coordenadas de inicio. La consulta exigió desafío inactivo, distancia 611, cero inscripciones y coincidencia con el estado leído. El estado anterior y la consulta exacta están en esta carpeta. No volver a ejecutarla como migración: ya fue aplicada y su comparación del estado anterior debe rechazar una repetición.

Después de la actualización se verificaron historia e hitos contra el fixture y se comprobaron ambos desafíos inactivos y sin inscripciones. Santiago no se modificó.

## Validación

- Suite completa del backend: 464/464.
- Pruebas Python del certificado: 4/4.
- Las 14 pruebas específicas de Camino/Appia simulan compra firmada, reintentos, inscripción, progreso, finalización, selección de plantillas y efectos con base y servicios de correo falsos. No envían correos reales.
- Las plantillas nuevas están cargadas. Sus bytes y campos se verificaron por separado. La conversión real de esos PPTX a PDF y su entrega por correo siguen pendientes: las pruebas de integración usan PDF falsos.

## Antes del lanzamiento

1. Ejecutar el job `dorsales-postgres` de CI. Valida 50 reservas y 100 reintentos simultáneos en un PostgreSQL descartable, sin acceso a Supabase.
2. Revisar y aplicar `backend/migrations/20261109_dorsales_por_desafio.sql` antes del despliegue. Está preparada pero NO aplicada en Supabase. Revisar e integrar esta rama y autorizar el despliegue del backend por separado.
3. Probar PDF y correo con destinatario de prueba autorizado y las plantillas reales.
4. Completar la integración móvil y verificar el build instalado, incluido GPS Android con pantalla bloqueada.
5. Cargar imágenes de producto pendientes. Publicar productos y activar desafíos sólo con autorización de lanzamiento.

Railway usa main como rama de despliegue. Esta preparación debe permanecer fuera de main hasta autorizar esa actualización.

## Dorsales independientes

La RPC `asignar_dorsal_desafio` conserva los números existentes y reserva los nuevos con un contador persistente por desafío, dentro de la misma transacción que la actualización de la inscripción. Los bloqueos de PostgreSQL serializan reservas concurrentes y los reintentos de una inscripción devuelven su mismo número. No consulta el dorsal global del usuario ni altera inscripciones al instalarse.

Shopify usa esta reserva antes de activar la inscripción. Santiago y Appia empiezan cada uno en 0001 mientras no tengan dorsales asignados. Descargar el dorsal, generar el certificado y reenviarlo usan el número de la inscripción correspondiente. Si una inscripción histórica carece de dorsal, el certificado muestra `---`; no toma prestado el número global ni renumera certificados ya emitidos. El serial del certificado conserva su mecanismo existente y es distinto del dorsal.

Dorsal y postal reutilizan la conversión con directorio y perfil de LibreOffice independientes por archivo. Evita interferencia entre procesos concurrentes; no implica que se haya validado aquí la conversión real de las plantillas ni el correo.

Validación adicional local: la migración se ejecutó sobre PostgreSQL/PGlite descartable, con 50 reservas, 50 reintentos y comprobación de permisos. Eso valida SQL y secuencias, pero no múltiples conexiones simultáneas. Esa prueba real está en `tests/dorsales_postgres.py`, incorporada al workflow; queda pendiente ejecutarla en CI antes de aplicar la migración.
