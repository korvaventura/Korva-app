# GPS Android y preparación de Vía Appia

Actualización local sobre 0e43e23. No hace push, merge a main, OTA, build ni
deploy. Conserva la UX y el mapa de Santiago que Fabricio aprobó en el teléfono.

## GPS con pantalla bloqueada

Se incorporó la corrección de `fix/gps-background-android-20261020`, separando
sus cuatro archivos para conservar los cambios posteriores de esta rama:

- Configuración de ubicación Android en segundo plano y servicio foreground.
- Notificación persistente durante el registro y solicitud de puntos cada 2 s.
- Diferimiento de actualizaciones desactivado.
- Un intervalo de más de dos minutos no descarta automáticamente la distancia.
  Se conserva el filtro de precisión y de velocidad imposible. Sin puntos
  intermedios se estima la distancia directa entre extremos; no se reconstruye
  una trayectoria que el sistema no registró.
- Pausar/finalizar detiene el servicio; reanudar inicia un tramo nuevo y no
  suma el desplazamiento realizado durante una pausa explícita.

La configuración nativa de Expo se inspeccionó localmente. Incluye
ACCESS_BACKGROUND_LOCATION, FOREGROUND_SERVICE y FOREGROUND_SERVICE_LOCATION.
La lógica y el ciclo de vida simulado tienen pruebas aprobadas, pero falta
validación física en Android. No se anuncia como fallo resuelto en producción.

Requiere una nueva compilación interna de Android. Una OTA o Expo Go no
instalan los nuevos permisos y configuración nativa. Desde mobile se puede
preparar un APK interno, sin publicarlo en Play Store, con:

```powershell
npx eas-cli@latest build --platform android --profile preview
```

Este comando requiere la cuenta Expo del proyecto. No se ejecutó desde esta
preparación. No modifica la publicación en las tiendas.

### Prueba física pendiente

1. Instalar el APK interno y conceder ubicación precisa y en segundo plano.
2. Iniciar una actividad al aire libre y comprobar la notificación persistente.
3. Caminar 5–10 minutos con pantalla bloqueada y volver a abrir la app.
4. Comprobar distancia, duración y recorrido. Repetir cambiando a otra app.
5. Pausar, desplazarse un poco, reanudar y verificar que ese desplazamiento
   no se cuenta como un salto entre los dos tramos.
6. Finalizar y DESCARTAR la actividad de prueba. No confirmar si se quiere
   evitar que esa actividad se guarde en la cuenta.
7. Comprobar que la notificación desaparece al pausar o finalizar.

Bloquear la pantalla no equivale a forzar la detención de la app. Android y
los fabricantes pueden detener servicios; no se promete registro tras un
forzado de cierre o reinicio del teléfono.

Referencias oficiales:
https://docs.expo.dev/versions/latest/sdk/location/
https://github.com/korvaventura/Korva-app/tree/fix/gps-background-android-20261020

## Vía Appia

Ficha creada inactiva en Supabase, con UUID generado por la base:
`54865c93-6b1b-4d2b-8324-71d705133998`.

Producto Shopify encontrado: `15473077780658`, en borrador.
URL: https://korva.run/products/desafio-virtual-611km-via-appia-roma
Medalla: `1001-ry-006`. Precio de referencia copiado del producto: USD 34,40.
Distancia única: 611 km. Sin versión extendida por decisión de Fabricio.

Se prepararon 13 hitos con historias, curiosidades y fuentes primarias:
Roma/Porta Capena, Cecilia Metella, Albano, Terracina, Formia, Capua antigua,
Benevento, Aeclanum, Venosa, Gravina, Taranto, Oria y Brindisi.

La secuencia toma como referencia la Appia Antica. No se mezcló con la variante
Traiana por Bari. Los km de cada hito son posiciones virtuales de diseño y
pueden ajustarse al preparar la traza definitiva. El total del desafío es 611.

La vista local de administrador permite comprobar ficha, historias y progreso
con el componente existente. Su botón de compra está deshabilitado. El mapa
es un ESQUEMA, no una traza de navegación ni un mapa 3D terminado. No se
registró una escena 3D inventada ni se muestra el mapa de otro desafío.

Pendientes: traza y relieve propios del mapa 3D, monumentos, revisión visual,
imágenes, dorsal y postal de Appia. Nombres previstos de las plantillas:
`Plantillas/Dorsales_ViaAppia.pptx` y `Plantillas/Postales_ViaAppia.pptx`.
Si faltan, el generador falla de forma controlada sin tomar las de Fin del Mundo.

Fuentes del corredor:
https://whc.unesco.org/en/list/1708
https://cultura.gov.it/appiaunesco
https://cultura.gov.it/comunicato/turismo-mibact-presenta-il-progetto-appia-regina-viarum-per-il-recupero-dell-antico-tracciato-romano
Las fuentes de cada historia están en `mobile/services/desafios/viaAppia.js`.

## Verificación automática

- Backend completo: 461 pruebas aprobadas, incluidos compra y finalización de
  Appia con certificado y aviso únicos, sin tocar Santiago.
- GPS: 29 pruebas aprobadas de núcleo, pausas, archivo, ruta y servicio simulado.
- Vía Appia móvil: 3 pruebas aprobadas de contenido y esquema.
- Santiago: 31 pruebas aprobadas después de estos cambios.
- Exportación web de Expo: correcta.
- Se conservan las siete fallas generales del móvil documentadas en la entrega
  anterior; no se presentan como corregidas por esta actualización.

No hubo compras, inscripciones ni correos reales de prueba. Santiago y Appia
siguen inactivos. No se hizo ninguna publicación.
