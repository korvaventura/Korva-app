# Camino de Santiago: cobertura geográfica continua

El detalle del corredor del Camino conserva el MDT del IGN y sus 920 puntos horneados. El contexto de España, Portugal y Francia usa el servicio público NOAA DEM Global Mosaic, con elevación y batimetría reales, muestreado a una grilla de 2 km. La exageración visual sigue siendo ×3.

Fuente: https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer
Contexto del conjunto global: https://www.ncei.noaa.gov/products/etopo-global-relief-model

## Datos de preparación

`mobile/scripts/mapa3d/caminoSantiago.europa.json` incluye las elevaciones del contexto y los pesos de mezcla con el IGN. El corredor de 20 km alrededor del trazado queda protegido. La mezcla con el contexto es gradual; Portugal y Francia no dependen del relleno procedural anterior. El rectángulo completo de la malla debe quedar dentro de esta cobertura; el horneado falla explícitamente si falta información.

El archivo `caminoSantiago.entorno.json` de las pruebas anteriores ya no participa en el generador. Se conserva para evitar borrar archivos de la copia de trabajo del usuario.

El contexto fue obtenido con `exportImage`, formato TIFF F32, remuestreo bilineal, función raster `None`, tamaño 1800×1800 y extensión resultante [-20,24,18,62] (EPSG:4326). Se valida que no haya celdas sin datos.

Para preparar otra vez el contexto a partir del TIFF descargado:

```sh
python tools/mapa3d/preparar_europa_camino.py --dem /ruta/noaa-europa.tif
```

La herramienta requiere Python con numpy, scipy, Pillow y matplotlib, y Node para consultar el trazado aprobado.

Para regenerar los datos que carga la app:

```sh
node mobile/scripts/hornearMapa3D.js caminoSantiago
```

La app carga únicamente la escena y el horneado; no descarga datos geográficos ni ejecuta Python.

## Presentación

- Vista General, replay y cierre de la catedral conservan sus cámaras aprobadas.
- Nombres discretos de España, Portugal y Francia en el mapa.
- Las cabezas de los pines del Camino se separan en pantalla para reducir superposición, con desplazamiento acotado a 48 px. Sus bases geográficas y los kilómetros no se modifican.
- No se activó un nuevo desafío ni se modificaron UUID, Supabase, Shopify o progreso de usuarios.

## Verificación

34 pruebas específicas: generación sincronizada, coordenadas del recorrido, agua, cobertura de toda la malla, continuidad de los antiguos recortes, relieve de los tres países, separación de pines y replay. Los 920 puntos de la ruta son idénticos a la versión anterior.

Se comprobó la compilación del componente y de la pantalla de prueba. La validación final de apariencia y rendimiento debe realizarse en el dispositivo.
