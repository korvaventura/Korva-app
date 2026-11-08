# Camino de Santiago: revisión de cierre

Aplicación sobre la versión `korva-camino-europa.zip` probada localmente en `Korva-camino-prueba`.

## Alcance

- El corredor conserva su grilla de 1,6 km. El contexto visible crece gradualmente hasta 4,5 km y mantiene ese límite durante 360 km desde el área central; la simplificación fuerte queda más lejos.
- Se reduce el promedio de color del terreno del 25 % al 12 %.
- Un océano continuo de dos triángulos reemplaza la malla marina indexada. El terreno y el embalse conservan su profundidad y geometría.
- La protección del borde usa la profundidad en espacio de cámara que emplea el shader de niebla, incluyendo los cruces con el frustum.
- General calcula encuadre y centro a partir de todo el recorrido y de la altura de los pines, con márgenes para HUD y etiquetas. Se recalcula al cambiar el tamaño de la vista.
- Los gestos mantienen órbita completa y aproximación a los monumentos, con límites de alejamiento, desplazamiento e inclinación en la vista de territorio.
- Se mejora la legibilidad de los nombres de países. Se conserva la separación de pines de la versión anterior.

## Elementos conservados

Los 920 puntos de la ruta horneada (coordenadas, altura y kilómetros) son idénticos a la versión anterior. No se modificaron los modelos, sus texturas ni el encuadre final de la catedral. No se activó el desafío ni se modificaron servicios, UUID o progreso de usuarios.

La grilla graduada nueva es opcional y se configura sólo en Camino. Las otras escenas mantienen el cálculo anterior. Los límites de gestos y el encuadre automático también se aplican sólo al Camino.

## Geometría y validación

- Vértices de la grilla: 144.594 → 227.304.
- Triángulos de terreno y agua: 401.078 → 452.784 (aproximadamente +13 %). Los modelos de monumentos no cambiaron y no se incluyen en esa comparación.
- 39 pruebas específicas pasan. Incluyen generación sincronizada, toda la ruta, agua, relieve europeo, separación de pines, seis tamaños de encuadre, límites manuales, un giro completo en tres inclinaciones y presupuesto de geometría.
- Compilación JavaScript/JSX del componente y del constructor de mundo comprobada.
- La suite general conserva los mismos 7 fallos previos: San Andrés (horneado), Islandia (3), gestos antiguos (2) y el comprobador de horneados registrados. No aparecieron fallos nuevos en esa suite.

La apariencia final y la fluidez requieren la comprobación en el dispositivo. El render auxiliar de geometría no sustituye esa validación.

## Prueba final en el celular

1. Abrir General al 0 %, 50 % y 100 %; verificar inicio, llegada y nombres.
2. Girar el mapa y probar los límites de alejamiento y desplazamiento.
3. Inspeccionar Mojón, Puente y Catedral.
4. Ejecutar Revivir conquista al 100 % y verificar el cierre frontal de la catedral.

El instalador valida rama y parche antes de cambiar archivos; guarda copia de los archivos existentes. Ante una diferencia de versión se detiene sin aplicar parcialmente el parche.
