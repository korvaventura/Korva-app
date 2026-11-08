# Camino de Santiago: integración local sin publicación

La rama `test/camino-integracion-20261108` conserva la versión del móvil donde
se aprobó el mapa, sus mejoras visuales y sus pantallas. Incorpora el backend
de `main` de61303 y la conexión de Santiago en una copia independiente.
No se cambió la rama de los proyectos existentes ni se desplegó código.

## Configuración preparada

- Challenge: `e6424df6-3949-4503-8af0-69408b4b34a2`, inactivo.
- Producto Shopify: `15473077878962`, borrador.
- Medalla: `1001-ry-005`.
- Estándar: 775 km. Extendida: 2325 km, misma regla de los desafíos existentes.
- 13 hitos del mapa aprobado, con contenido y curiosidades.
- Dorsal y postal propios en `korva-images/Plantillas`.
- Imágenes de medalla, portada y galería pendientes para una etapa posterior.

## Pruebas

`cd backend` y `npm test`: 456 pruebas aprobadas. Incluyen ocho de Santiago y
el flujo de inscripción pendiente, compra firmada simulada, activación, tres
actividades (caminar, correr y bicicleta), progreso hasta 775 km, certificado
y aviso administrativo. Un reintento no duplica los efectos. Los datos de otra
cuenta permanecen iguales y Santiago sigue oculto del catálogo.

`cd mobile` y `npm run test:camino`: 31 pruebas aprobadas. La exportación web
de Expo también compila. El recorrido visual y los gestos en un teléfono
todavía requieren la revisión manual.

La suite general del móvil conserva siete fallas: sincronización del horneado
de San Andrés; tres comprobaciones de Islandia que asumen terreno generado
cuando esa escena usa un modelo; dos expectativas de sensibilidad de gestos;
y otra comprobación genérica que asume `escena.ruta` en Islandia. Se reprodujo
exactamente el mismo conjunto de fallas en la copia anterior. No se cambiaron
otros mapas ni se presentan las pruebas generales del móvil como aprobadas.

Las dos plantillas descargadas de Storage generaron PDF personalizados con
nombre y dorsal de prueba. No se enviaron correos ni se crearon pedidos o
inscripciones reales durante estas comprobaciones.

## Revisar en el teléfono

Instalar dependencias en `mobile` con `npm ci` y arrancar `npx expo start --clear`.
La opción de prueba de Camino sigue limitada a administradores en desarrollo.
Permite inspeccionar 0 %, 50 %, 100 %, monumentos, vista general y replay.
El botón nuevo `Ver ficha del desafío` abre la pantalla existente de catálogo
con los datos locales de Santiago y sus historias. La compra de esa vista
está bloqueada: solo muestra un aviso, sin abrir Shopify ni crear inscripción.

No iniciar una compra real para esta revisión. No hacer merge, push a ramas
de despliegue, `eas update`, `eas build` ni deploy. El lanzamiento requiere
una instrucción posterior de Fabricio.
