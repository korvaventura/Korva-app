# Korva Mundi — pines de prueba Camino de Santiago y Vía Appia

Rama: `mundi/pines-santiago-appia-20261116` (base `c739a8e`). Sin PR, sin merge, sin OTA.
Backend, Supabase y Shopify sin cambios.

## Qué cambia

| Archivo | Cambio |
|---|---|
| `mobile/services/korvaMundiCore.js` (nuevo) | Validación de coordenadas (`coordenadasValidas`, `conUbicacion`) y lista de destinos de prueba (`destinosPrueba`). |
| `mobile/screens/KorvaMundiScreen.js` | Usa la validación nueva; agrega los dos pines solo si `esAdmin && __DEV__`; el pin abre la pantalla de prueba con “Ver ficha y mapa · prueba interna”. |
| `mobile/App.js` | Pasa `esAdmin` a `KorvaMundi`. Las pantallas `CaminoSantiagoPrueba` y `ViaAppiaPrueba` siguen registradas solo con `esAdmin && __DEV__`. |
| `mobile/tests/korvaMundi.test.js` (nuevo) | 7 pruebas. |
| `mobile/package.json` | Agrega la prueba nueva a `npm test`. |

### Pines

| Desafío | ID | Pin | Km | Abre |
|---|---|---|---|---|
| Camino de Santiago 775K | `e6424df6-3949-4503-8af0-69408b4b34a2` | Santiago de Compostela (42.88049, -8.54575) | 775 | `CaminoSantiagoPrueba` |
| Vía Appia 611K | `54865c93-6b1b-4d2b-8324-71d705133998` | Roma (41.88437, 12.48903) | 611 | `ViaAppiaPrueba` |

Los datos de los pines son locales (no se leen del backend). El pin se ubica en la llegada, que es la misma coordenada final de cada escena 3D (lo verifica la prueba).
Si el desafío ya viene en el catálogo (cuando se active), el pin de prueba no se duplica.

### Validación de coordenadas

Antes: `Number.isFinite(Number(c.latitude))` dejaba pasar `null`, `""` y `false` porque `Number(null) === 0` → el destino aparecía en (0, 0), frente a África.
Ahora se descartan: `null`, `undefined`, texto vacío o solo espacios, booleanos, objetos, `NaN`/`Infinity`, latitud fuera de [-90, 90] y longitud fuera de [-180, 180]. Los textos numéricos válidos (`"42.88"`) se aceptan y se convierten a número.

Con el catálogo real de hoy (`/challenges`, 4 activos: Fin del Mundo, San Andrés 57K, Dubrovnik 19K, Monte Fuji 68K) los cuatro tienen coordenadas válidas, así que una cuenta normal ve exactamente lo mismo que antes (+ Islandia, que ya estaba).

## Pruebas automáticas

```
cd mobile
node --test tests/korvaMundi.test.js   # 7/7
npm test                                # 208/215
```

Las 7 fallas de `npm test` son las mismas que ya fallan en `c739a8e` (201/208 en la base): horneados de San Andrés/Islandia, ruta/mundo de Islandia, dos pruebas de gestos y agua horneada. Ninguna toca estos archivos.

## Pasos para probar en el teléfono

**A. Cuenta admin en build de desarrollo (Expo Go / dev client)**
1. Abrir la app con una cuenta que esté en `ADMINS`.
2. Ir a Korva Mundi.
3. Ver el pin en Santiago de Compostela (España) y el pin en Roma (Italia), además de los destinos actuales.
4. Tocar Santiago → aparece la ficha corta con “Ver ficha y mapa · prueba interna”.
5. Tocar el botón → abre la pantalla de prueba del Camino (ficha del desafío + mapa 3D). No hay compra ni escritura en el backend.
6. Volver y repetir con Roma → abre la prueba de la Vía Appia (Brindisi → Roma).
7. Girar el globo y confirmar que ningún destino aparece en (0, 0) frente al golfo de Guinea.

**B. Cuenta normal (cualquier build)**
1. Entrar con una cuenta que no esté en `ADMINS`.
2. Ir a Korva Mundi.
3. Deben verse Fin del Mundo, San Andrés, Dubrovnik, Monte Fuji e Islandia, igual que antes.
4. No deben verse los pines de Santiago ni de Roma.

**C. Admin en build de producción/TestFlight** (opcional)
Los dos pines tampoco deben aparecer, porque `__DEV__` es falso.

## Hallazgo: `/challenges/todos`

Petición hecha hoy (16 nov 2026) sin sesión, sin cookies ni token, contra `https://korva-app-production.up.railway.app/challenges/todos`.

- Respuesta `200`, sin autenticación, cabecera `access-control-allow-origin: *` (cualquier web puede leerlo desde el navegador), sin `cache-control`.
- Devuelve los 6 desafíos, incluidos los inactivos. En el código (`backend/index.js`, línea ~752) hace `select('*')` sin filtrar `is_active`; `/challenges` sí filtra `is_active = true`.

### Campos expuestos de Santiago y Appia (ambos con `is_active: false`)

| Campo | Camino de Santiago | Vía Appia |
|---|---|---|
| `id` | e6424df6-3949-4503-8af0-69408b4b34a2 | 54865c93-6b1b-4d2b-8324-71d705133998 |
| `title`, `description` (174 / 197 car.), `historia` (293 / 333 car.) | sí | sí |
| `total_distance_km` | 775 | 611 |
| `latitude`, `longitude` | 43.00866, -1.31975 (Roncesvalles, salida) | 40.6414, 17.9458 (Brindisi, salida) |
| `checkpoints` | 13 hitos completos: id, lat, lon, nombre, desc, emoji, pista, fuentes, capitulo, datoRaro, kmFisico | igual, 13 hitos |
| `modalidades` | Estándar 775 km, run | Estándar 611 km, run |
| `sport_type` | multi | multi |
| `price_usd` | 34.4 | 34.4 |
| `price_ars` | null | null |
| `link_shopify` | https://korva.run/products/desafio-virtual-775km-camino-de-santiago-espana | https://korva.run/products/desafio-virtual-611km-via-appia-roma |
| `link_mercadopago` | null | null |
| `medal_code` | 1001-ry-005 | 1001-ry-006 |
| `medal_image_url`, `imagen_portada`, `oferta_texto`, `route_geojson` | null | null |
| `galeria` | [] | [] |
| `created_at` | 2026-11-08T14:40:13 | 2026-11-08T15:59:08 |
| `is_active` | false | false |

Qué se filtra antes del lanzamiento: que existen los dos desafíos, precio, código de medalla, link de producto en Shopify, la historia y los 13 hitos con sus pistas y datos raros (el contenido de las sorpresas del recorrido).

### Consumidores encontrados

- En el repo `korvaventura/Korva-app` (base `c739a8e`):
  - `backend/index.js` — solo la definición del endpoint.
  - `backend/tests/caminoSantiago.test.js` y `backend/tests/viaAppia.test.js` — pruebas del backend.
  - **Ninguna pantalla de la app móvil lo usa.** Las pantallas que leen el catálogo (Inicio, Catálogo, Korva Mundi, Ranking, Perfil, Registro manual, Admin) llaman a `/challenges`, que solo devuelve activos.
- No pude revisar fuera del repo: logs de Railway, Shopify, el bot de WhatsApp/ManyChat, planillas o scripts de logística, ni webs externas. Si alguna integración lo llama, solo se ve en los logs de Railway.

### Recomendación (no aplicada en esta entrega)

1. Revisar en Railway quién llama a `/challenges/todos` durante unos días.
2. Si nadie fuera de las pruebas lo usa: pedir sesión admin o eliminarlo, y ajustar las dos pruebas del backend.
3. Al activar los desafíos, decidir si `latitude`/`longitude` en la base pasan a la llegada (Santiago / Roma) para que el pin del catálogo coincida con el de prueba; hoy apuntan a la salida.
