# Camino de Santiago y Vía Appia: preparación del backend

Esta rama agrega los productos de Shopify y sus plantillas propias al backend actual de main. No integra los mapas ni modifica las pantallas móviles. No activa los desafíos ni despliega código.

| Desafío | Distancia | Producto Shopify | Plantillas en korva-images/Plantillas |
| --- | --- | --- | --- |
| Camino de Santiago | 775 km | 15473077878962 | Dorsales_CaminoSantiago.pptx / Postales_CaminoSantiago.pptx |
| Vía Appia, Brindisi → Roma | 611 km | 15473077780658 | Dorsales_ViaAppia.pptx / Postales_ViaAppia.pptx |

El 8 de noviembre de 2026 se sincronizó el contenido inactivo de Appia en Supabase con el fixture aprobado: 13 hitos, desde Brindisi (0) hasta Roma (611), historia, descripción y coordenadas de inicio. La consulta exigió desafío inactivo, distancia 611, cero inscripciones y coincidencia con el estado leído. El estado anterior y la consulta exacta están en esta carpeta. No volver a ejecutarla como migración: ya fue aplicada y su comparación del estado anterior debe rechazar una repetición.

Después de la actualización se verificaron historia e hitos contra el fixture y se comprobaron ambos desafíos inactivos y sin inscripciones. Santiago no se modificó.

## Validación

- Suite completa del backend: 461/461.
- Pruebas Python del certificado: 4/4.
- Las 13 pruebas específicas de Camino/Appia simulan compra firmada, reintentos, inscripción, progreso, finalización, selección de plantillas y efectos con base y servicios de correo falsos. No envían correos reales.
- Las plantillas nuevas están cargadas. Sus bytes y campos se verificaron por separado. La conversión real de esos PPTX a PDF y su entrega por correo siguen pendientes: las pruebas de integración usan PDF falsos.

## Antes del lanzamiento

1. Revisar e integrar esta rama y autorizar el despliegue del backend por separado.
2. Probar PDF y correo con destinatario de prueba autorizado y las plantillas reales.
3. Completar la integración móvil y verificar el build instalado, incluido GPS Android con pantalla bloqueada.
4. Cargar imágenes de producto pendientes. Publicar productos y activar desafíos sólo con autorización de lanzamiento.

Railway usa main como rama de despliegue. Esta preparación debe permanecer fuera de main hasta autorizar esa actualización.
