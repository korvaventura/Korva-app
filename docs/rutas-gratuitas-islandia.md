# Islandia: ruta gratuita preparada

Una Ring Road de 1.400 km, cinco capítulos. ID permanente: `3b211caf-ee16-54c8-a93c-343a5eb2d57e`.
La ruta no incluye ni promete una medalla. Una oferta comercial futura deberá vincularse al ID sin convertir automáticamente a participantes gratuitos en compradores.

## Participación y actividades

- Abrir la card/mapa es exploración: no crea participación.
- Aceptar muestra las condiciones y guarda aceptación versionada con hora del servidor. La aceptación repetida es idempotente.
- El inicio se deriva de la primera actividad válida realizada desde la aceptación. No depende de cuándo Strava la importa. No entra movimiento anterior.
- Se leen las mismas filas `activities` de GPS, Manual y Strava, una vez. No se modifica ningún writer ni progreso de desafíos pagos. No se usa Health pasivo ni se convierten pasos.
- Las pausas de la ruta tienen períodos propios, con los bordes inclusivos del motor actual. Pausar o abandonar conserva el avance. Retomar una ruta abandonada cierra ese período sin sumar movimiento realizado durante la ausencia.
- El progreso se reconstruye al consultar: no existe un segundo historial de actividades. Excluir/corregir una actividad se refleja en la próxima lectura. Inicio y completitud son fechas derivadas de las actividades actuales, no eventos congelados del motor comercial.
- Las participaciones se guardan en `free_route_participations`, fuera de `user_challenges`. No crean seriales, PDFs, emails, pedidos, envíos ni eventos comerciales.
- El cliente no elige la identidad: las rutas obtienen el usuario del JWT. La RPC solo es ejecutable por service_role; acciones serializadas por usuario/ruta.

## Mapa

Modelo Meshy completo, ejes y proporciones conservados; 220.000 triángulos, textura 2K. Calibración visual en `mobile/scripts/islandia.calibracion.json`.
La ruta se proyecta sobre la malla reducida y cuantizada. Es una representación artística del desafío; no un mapa topográfico certificado ni una ruta de navegación.
Auroras y tres parches de niebla estáticos: seis meshes, menos de 500 triángulos adicionales y ningún loop de animación ambiental. Se preservan render bajo demanda, cortes de ruta precalculados y replay de 25 segundos.
Se muestran etiquetas del inicio, último checkpoint conquistado, próximo y seleccionado. Los demás pins continúan disponibles. Cinco capítulos en el HUD.
Las historias se adaptaron del material aportado por Fabricio: la propuesta vieja de dos medallas se reemplazó por una sola ruta gratuita. Sus curiosidades no se han vuelto a verificar editorialmente para este lote.

## Activación pendiente

1. Instalar `backend/migrations/20261007_free_routes.sql` en Supabase (transacción, tabla nueva y RPC; no reescribe actividades, compras ni kilómetros existentes).
2. Publicar únicamente el backend de rutas gratuitas sobre la versión actual de main.
3. Verificar en el teléfono: aceptación repetida, primera actividad posterior, importación tardía, pausa/reanudación/abandono, convivencia con un desafío pago, scroll y fluidez del mapa.

Mientras el endpoint no esté publicado o falte la migración, la app permite explorar el mapa y explica que las inscripciones no están habilitadas. No muestra una aceptación exitosa falsa.
Las pruebas locales no equivalen a ejecutar la migración en Supabase ni a comprobar el modelo en un dispositivo real.
