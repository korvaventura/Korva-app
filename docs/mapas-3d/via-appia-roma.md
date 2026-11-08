> Informe de inversión del recorrido (6f0dffe). Los seis modelos ya se incorporaron después; ver `via-appia-monumentos.md` para el estado vigente.

# Vía Appia: Brindisi → Roma, 611 km

Cambio local desde `ae13f24`, la escena de Claude. Sin push, despliegue,
EAS Update, compras, correos ni cambios en Supabase/Shopify.

## Recorrido

Se conservan los datos WGS84 y las fuentes de Italia. `viaAppia.trazado.js`
permanece intacto como fuente académica Roma → Brindisi. El adaptador
`viaAppia.recorrido.js` recorre sus mismos vértices en sentido inverso, entre
las anclas de Brindisi y Roma, sin añadir carreteras inventadas. Se regeneró
el horneado de Appia con ese recorrido; Santiago no se volvió a hornear.

| Hito | km |
| --- | ---: |
| Brindisi | 0 |
| Oria | 31 |
| Taranto | 81 |
| Gravina | 156 |
| Venosa | 216 |
| Aeclanum | 311 |
| Benevento | 346 |
| Capua | 406 |
| Formia | 461 |
| Terracina | 506 |
| Albano | 586 |
| Cecilia Metella | 604 |
| Roma | 611 |

Capítulos: Puglia hasta 181; Basilicata hasta 276; Campania hasta 446;
Roma/Lazio hasta 611. Son los límites virtuales anteriores invertidos.
Se adaptaron relatos direccionales, inicio, cierre, ficha local, respaldo 2D
y fixture del backend. IDs y distancia total se conservan.

## Replay y rótulos

Appia activa `territorio.replayPorHitos`. Su reloj reserva 850 ms de lectura
por parada y al menos 450 ms de desplazamiento entre hitos; la duración
completa queda cerca de 25 segundos. La misma distancia publicada alimenta
estados de hitos, contador, título y próximo destino. La línea/posición usa
ese reloj con la interpolación de cada cuadro.

Durante el viaje el encabezado muestra el último hito alcanzado y el próximo
por separado; el mapa prioriza un solo nombre, evitando que inicio, destino,
selección antigua y siguiente compitan. El encabezado permanece legible
aunque una etiqueta geográfica no encuentre espacio. Los hitos cercanos a
Roma tienen pausas propias. Reiniciar limpia la selección previa. General y
las inspecciones interrumpen los callbacks del replay antes de mover la cámara.

El comportamiento nuevo se activa únicamente en Appia. Santiago conserva
sus cámaras, textos, duración y datos aprobados.

## Monumentos

- Brindisi: columnas romanas, inicio.
- Benevento: Arco de Trajano, km 346.
- Roma: Coliseo como símbolo de llegada, km 611.

**Los modelos todavía no están cargados.** Roma tiene ancla de llegada y
cámara provisional (rumbo 225°, marcado para verificar con el modelo).
La traza alcanza Porta Capena: no se movió el extremo histórico al Coliseo.
Al incorporar Meshy se ajustarán escala, orientación frontal y composición
de la miniatura simbólica. No es una ruta urbana de navegación.

## Verificación

- Appia: 25/25 (incluye reloj completo a 4 FPS, lectura de los 13 nombres,
  repetición, viaje parcial, datos invertidos y las 14 proporciones de pantalla).
- Santiago: 35/35; GPS: 29/29.
- Backend Camino + Appia: 13/13, dobles en memoria, sin servicios reales.
- Suite móvil general: los mismos 7 fallos que la base ae13f24 en este entorno
  (San Andrés, Islandia, gestos y comprobador genérico de horneados).
- Compilación Babel correcta de los tres componentes/pantallas modificados.
- Pendiente: comprobar el replay real en iPhone/Android y encuadrar Meshy.

## Prueba en teléfono

1. Admin → Vía Appia · prueba local. Al 0 %, Brindisi es el inicio.
2. Al 50 %, el último hito alcanzado es Venosa y el próximo Aeclanum (311).
3. Al 100 %, repetir dos veces Revivir conquista. Los 13 nombres deben
   avanzar en orden; Roma debe recibir el acercamiento y después el mensaje.
4. Detener a mitad, iniciar otra vez y tocar General/Inicio/Benevento/Roma
   mientras corre: no debe reanudarse sola una cámara anterior.
5. Revisar Catedral y replay de Santiago como control.

## Antes de integrar fuera de la prueba

La fila real de Appia en Supabase mantiene su contenido previo. Esta entrega
no la modifica ni activa el desafío. Antes de conectar el flujo real hay que
sincronizar capítulos, historias y km de sus checkpoints desde los datos
locales/fixture, comprobar que sigue inactivo y que no hay inscripciones.
La ficha de prueba usa los datos nuevos; el backend de las pruebas usa el
fixture nuevo. Revisar también el texto del producto Shopify en borrador.
Las imágenes y los tres modelos siguen pendientes.
