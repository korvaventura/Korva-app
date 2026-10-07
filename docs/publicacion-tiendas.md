# Publicar Korva en iOS y Android

Versión preparada: 1.0.29. Revisar que ninguna tienda haya recibido ya esa versión.
App: com.korva.mobile. Proyecto EAS: f433761f-30a0-4bfc-8260-a18e898d2688.

## Estado actual

La rama modo-libre-korva-20261004 contiene los mapas, las correcciones móviles
y la integración de Salud que se probaron en este chat. main recibió el backend,
pero todavía no contiene todos esos cambios móviles. No cambiar a main y compilar
esperando que incluya lo nuevo. Antes de una publicación desde main, integrar y
revisar los cambios móviles elegidos para esa publicación.

Esta rama incluye HealthKit/Health Connect y Android mínimo 8 (API 26).
La recomendación antigua de excluir etapa2-mobile-health NO convierte la rama
actual en una versión sin Salud. Omitir Salud requiere preparar otra configuración
y verificarla; no alcanza con apagar un botón ni una variable del backend.

Pendientes para una publicación con Salud: verificar el aporte real del primer día,
política de privacidad y declaraciones de datos/permisos en ambas consolas,
pantalla de diagnóstico temporal en producción y permisos nativos del paquete.
No hay build de producción nuevo ni envío a revisión confirmado en este chat.

## Versiones

app.json → expo.version: número visible (1.0.29).
eas.json → cli.appVersionSource=remote y production.autoIncrement=true:
EAS administra e incrementa ios.buildNumber y android.versionCode.
El buildNumber local 19 no prueba cuál es el contador remoto. Verificar que el
nuevo build supere el último subido a cada tienda. No reiniciar los contadores.

## iOS: build, submit y revisión manual

Desde mobile, en PowerShell, con el código de publicación aprobado:

```powershell
eas build --platform ios --profile production
```

Seleccionar el equipo Korva Adventures LLC (C8337PK55D), si EAS lo pide.
Si el perfil de firma necesita regenerarse, seguir el flujo de credenciales de EAS.
No borrar certificados manualmente. Esperar a que el build termine correctamente.

```powershell
eas submit --platform ios --profile production
```

Seleccionar explícitamente el build de producción 1.0.29 recién terminado,
no un build development. Submit carga el paquete; no envía la revisión final.
En App Store Connect, esperar el procesamiento, comprobarlo en TestFlight y
crear/editar la versión 1.0.29. Seleccionar el build correcto, completar novedades,
privacidad e información para revisión y enviar manualmente a App Review.

## Android: build y carga manual del AAB

```powershell
eas build --platform android --profile production
```

Al terminar, abrir el enlace que imprime EAS y descargar el .aab.
No usar un APK ni el perfil preview/development para este flujo.
En Play Console, subir primero el AAB a pruebas internas y comprobar en Android
inicio, GPS, mapas, compartir, Salud y avances. Luego crear la versión en el canal
de publicación, cargar el AAB validado, completar novedades y declaraciones,
revisar los avisos de consola y enviar los cambios a revisión.
No hace falta eas submit para este flujo manual de Android.

## Antes de enviar

Confirmar acceso a Expo/EAS y ambas consolas; identificadores de paquete sin cambios;
builds con versión y contadores correctos; cuenta de prueba para revisión;
URLs de privacidad/soporte y declaraciones coherentes con el paquete real.
Los cambios del repositorio no llegan a usuarios instalados hasta publicar el build.
La aceptación del build y los tiempos de revisión dependen de cada tienda.

Referencias oficiales:
- https://docs.expo.dev/build-reference/app-versions/
- https://docs.expo.dev/submit/ios/
- https://docs.expo.dev/tutorial/eas/android-production-build/
- https://support.google.com/googleplay/android-developer/answer/12991134
- https://developer.apple.com/documentation/healthkit/protecting-user-privacy
