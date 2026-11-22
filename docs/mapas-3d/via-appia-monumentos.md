# Miniaturas Meshy de Vía Appia

Actualización local desde `6f0dffe` (Brindisi → Roma y replay aprobado).
Sin push, despliegue, OTA ni cambios de Supabase o Shopify.

## Modelos incorporados

| Hito | km | Archivo generado | Triángulos | Textura |
| --- | ---: | --- | ---: | --- |
| Brindisi | 0 | brindisi | 4.235 | 1024 × 1024 |
| Oria | 31 | oria | 8.465 | 1024 × 1024 |
| Gravina | 156 | gravina | 6.167 | 1024 × 1024 |
| Benevento | 346 | benevento | 7.921 | 1024 × 1024 |
| Cecilia Metella | 604 | cecilia_metella | 5.501 | 1024 × 1024 |
| Roma | 611 | coliseo | 16.386 | 1024 × 1024 |

Total: **48.675 triángulos**, seis materiales y seis texturas. Los GLB de
Meshy traían imágenes de 2048 × 2048; las seis se redujeron a 1024 × 1024,
JPEG calidad 85, conservando UV y geometría. Los archivos listos para la app
suman 4.645.226 bytes. La geometría decodificada de las miniaturas ocupa
menos de 2,3 MB; las texturas RGBA con mipmaps pueden consumir unos 32 MB
en GPU. No son mediciones de memoria de un teléfono.

## Preparación reproducible

```sh
python3 tools/mapa3d/preparar_objetos_appia.py CARPETA_CON_LOS_SEIS_GLB
```

Cada asset JS conserva nombre del GLB, SHA-256 del original y cantidad de
triángulos. Se centra el modelo y normaliza su lado mayor a 1, apoyando su
base en Y=0. No se cambió ni se volvió a hornear el relieve de Appia o Santiago.
Los originales del usuario se conservan aparte.

En la app no se decodifican GLB, PNG ni Draco en el hilo JS: se usa el mismo
formato de buffers y cargador de texturas que las miniaturas de Santiago.
La carga de estos buffers se ejecuta únicamente al construir Appia.

## Composición y cámaras

- Miniaturas simbólicas: no alteran traza WGS84, kilómetros, historias o progreso.
- El apoyo toma la altura del terreno, sin heredar la elevación de la línea naranja.
- El Coliseo y Cecilia Metella se desplazan lateralmente en la representación,
  7,7 km a lados opuestos, para separar modelos cuya escala está exagerada.
  Los pines y el trazado conservan sus coordenadas originales.
- Se verificaron visualmente cuatro lados de cada GLB. El Coliseo usa el eje
  local +X como frente de composición; los otros cinco usan +Z.
- Cada cámara encuadra los vértices del modelo entre cabecera y controles.
  El cálculo usa bucles escalares y se hace al inspeccionar/llegar, no por frame.
- En General y replay se ven las seis miniaturas. En una inspección o en el
  acercamiento final se muestra sólo la elegida para evitar que Cecilia Metella
  distraiga frente al Coliseo. General restaura todas.
- La llegada mantiene el acercamiento de 1,8 s y después muestra el mensaje.

## Fidelidad de las piezas

Coliseo, columnas, arco y mausoleo tienen siluetas reconocibles. Dos piezas
quedan **provisionales**: el castillo generado se aproxima a una planta
rectangular en lugar de la triangular de Oria; el puente quedó como una
arquería larga y baja, más genérica que el puente real de Gravina. No se
presentan como reconstrucciones arqueológicas. Se pueden sustituir sus
assets sin rehacer el mapa, la ruta o el motor de progreso.

## Verificación

- Appia: 30/30, incluyendo buffers, presupuesto, apoyo, separación, visibilidad
  y cámaras de los seis modelos en 14 tamaños de visor, con todos los vértices
  dentro del área útil y la cámara del lado frontal.
- Santiago: 35/35. Su configuración, miniaturas y horneado se conservan.
- Suite móvil general: 201/208; los mismos siete fallos previos que la base
  (San Andrés, Islandia, gestos y comprobador genérico de horneados).
- Babel: cinco componentes/pantallas modificados compilan.
- Revisión visual mediante render técnico por software del mundo y las
  cámaras reales. No reproduce los shaders ni acredita rendimiento de Expo GL.
- Pendiente: prueba física iOS/Android de texturas, iluminación, apertura,
  replay, temperatura y fluidez.

## Prueba en teléfono

Admin → Vía Appia · prueba local. Hay botones Inicio / Oria / Gravina /
Benevento / Cecilia / Roma / General. Revisar todas las vistas y General.
En 100 %, repetir Revivir conquista: los nombres siguen su orden y el
acercamiento final destaca al Coliseo, sin el mausoleo delante. Volver a
General debe restaurar las seis piezas. Revisar Catedral y replay de Santiago.
