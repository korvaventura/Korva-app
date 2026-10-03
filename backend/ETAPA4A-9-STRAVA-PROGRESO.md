# Etapa 4A-9 · `/strava/progreso` en solo lectura (cierre de 4A)

Base: `main` `f9fb2d1`, en la rama local `etapa4a-9-strava-progreso`. No hice commit, push, deploy, migraciones ni cambios de flags.

## Qué cambia

- **Flag nueva `strava_progreso`, apagada por defecto.** No depende de `efectos`, porque el endpoint ya no completa nada.
- **Flag apagada:** el código viejo se ejecuta exactamente igual (está cubierto por tests).
- **Flag prendida:** `GET /strava/progreso/:userId` arma la respuesta de los desafíos **activos** igual que hoy arma la de pausados y terminales, es decir, desde lo guardado: `km_completed`, `status` y la versión. En la práctica:
  - no llama a `calcularKmDeChallenge` (no lee `activities`);
  - no hace `UPDATE` ni ninguna otra escritura;
  - no completa desafíos ni manda email o push;
  - devuelve las mismas claves, los mismos tipos y el mismo formato que hoy (`km_completados` con 2 decimales en texto, `porcentaje` con 1 decimal en texto y tope en 100, la versión y el campo `modalidad` legacy).
- El cambio es una condición en `routes/strava.js` (`|| soloLectura` en la rama que ya devuelve lo guardado). No toca `/strava/actividades`, mobile, Health/4B, GPS, RLS/admin, el motor ni `km_base`.

**Único cambio visible para un desafío activo:** si lo guardado ya alcanza la meta (sin estar completado), `estado` sale `En progreso` en vez de `COMPLETADO`. El porcentaje sigue siendo 100. Ahora el estado refleja lo que está guardado; quien completa el desafío es el motor, en el momento en que se escribe la actividad. Hoy no hay ningún desafío en esa situación.

**Corrección a mi análisis anterior:** dije que si el usuario de `31581716` abría Home, el cálculo viejo le iba a pisar los km dejándolos en unos 39 (sin `km_base`). No es así. La ruta vieja escribe `Math.max(cálculo, guardado)`, así que **nunca baja** los km.

Lo que el cálculo viejo sí hace es esto:
- **Sube los km con sus propias reglas**, sin `km_base`, cuando lo guardado quedó más bajo. En el test, el caso B (`km_base` + pausas) queda en 39,22 en vez de 53,63 que daría el motor.
- **Completa con esas mismas reglas.**
- **Puede pisar con un valor viejo** si lee justo antes de que el motor escriba, porque no usa compare-and-set.

Con la flag prendida no pasa ninguna de las tres cosas.

## Archivos

| Archivo | Cambio |
|---|---|
| `backend/lib/flagsMotor.js` | Agrega `strava_progreso` a `WRITERS_CONOCIDOS` y crea `stravaProgresoSoloLectura()`. |
| `backend/routes/strava.js` | Importa el helper. Calcula `soloLectura` una vez por pedido y suma `\|\| soloLectura` a la rama que devuelve lo guardado. |
| `backend/tests/progresoStrava.test.js` | **Nuevo**: 7 tests. |
| `backend/package.json` | Agrega el test nuevo al script `test`. |
| `backend/ETAPA4A-9-STRAVA-PROGRESO.md` | **Nuevo**: este documento. |

## Tests

`tests/progresoStrava.test.js` levanta `index.js` real con la base en memoria y compara la flag apagada con la prendida:

1. **Flag:** está apagada por defecto, la reconoce el sistema y no depende de `efectos`.
2. **Flag prendida, cero escrituras:**
   - 3 llamadas seguidas, con las flags productivas + `strava_progreso` y también con `strava_progreso` sola;
   - ninguna escritura: ni `UPDATE`, ni insert, ni RPC;
   - ninguna lectura de `activities`, o sea que no recalcula;
   - `user_challenges` queda idéntico;
   - 0 eventos, 0 emails, 0 push;
   - el desafío que el código viejo completaría queda `active` / `En progreso`.
3. **Contrato:**
   - las claves y los tipos son los de hoy (incluido `link_shopify` en `pending`);
   - con datos ya alineados, la respuesta con la flag prendida es **idéntica**, campo por campo, a la de la flag apagada (Estándar, Extendida, pausado, completado y pending).
4. **Los km guardados se devuelven exactos y no se pisan** (incluye un caso con `km_base` + pausas):
   - **Flag apagada:**
     - el caso B (`km_base` + pausa) queda en 39,22, el valor sin `km_base`;
     - el caso F se recalcula y se completa;
     - el caso A no baja, por el `Math.max`.
   - **Flag prendida**, en 3 llamadas seguidas:
     - devuelve exactamente lo guardado: A = 51,20, B = 9,41, F = 12,35;
     - la base queda sin cambios, con `km_base` intacto.
5. **Terminales, pausados y pending:** con la flag prendida, la respuesta es igual a la de la flag apagada.
6. **Flag apagada** (con las flags productivas y también sin ninguna flag): comportamiento legacy completo. `UPDATE` en los 3 activos, recálculo, completitud con evento de legado, email y push viejos.
7. **Procedimiento de alineación** (abajo), simulado con el motor real:
   - marcar los desalineados y correr la recuperación deja todo alineado y sin marcas;
   - el caso F se completa por la RPC con un único evento;
   - los no marcados, el terminal y todos los `km_base` quedan intactos.

**Suite completa: 329/329 en Node 22.22.2 (40 s) y 329/329 en Node 20.20.2 (47 s)**, sin procesos colgados. Antes eran 322; se suman los 7 de este archivo.

**Mutaciones:**

| Rompo el código así | Tests que fallan |
|---|---|
| Sin la condición de solo lectura | 2 |
| Solo lectura siempre prendida | 2 |

## Alineación previa (aparte de la implementación; NO ejecutada)

Usa el mecanismo que ya existe: se marca `recalculo_pendiente_desde` y la **recuperación periódica del backend** (cada 10 min) recalcula con el motor. Así:
- se escribe con compare-and-set;
- si correspondiera completar, se completa por la RPC con un evento único y sus efectos;
- la marca se borra sola.

**Nunca se escribe `km_completed` ni `km_base` por SQL.**

Archivos en `sql/`:

1. **`4a9-alinear-1-previo.sql`** (solo lectura): lista los activos cuyo valor guardado difiere del motor. Usa las mismas reglas validadas antes, 279/279. Columnas: km guardado, km del motor, diferencia, `completaria` y `ya_marcado`.

   Hoy, en producción (lo corrí en solo lectura), dio **4 filas, ninguna marcada y 0 completarían**:

   | Inscripción | Guardado | Motor | Diferencia |
   |---|---|---|---|
   | `31581716` | 62,8795 | 51,1968 | −11,6827 (caso D7) |
   | `fa562014` (pausado) | 17,2221 | 17,2211 | −0,001 |
   | `31d9a896` (pausado) | 17,2221 | 17,2211 | −0,001 |
   | `f354d7bc` | 9,41 | 14,41 | +5 (restitución D7) |

2. **`4a9-alinear-2-marcar.sql`** (escritura; la ejecutás vos). Pone **solo** `recalculo_pendiente_desde = now() - 5 min`, únicamente en esas filas: `active` y sin marca previa.
   - **Antes de ejecutarlo**, poné en `v_esperadas` la cantidad de filas del paso 1 que tienen `ya_marcado = false`. Hoy son 4.
   - Si la cantidad que se iba a marcar no coincide, aborta sin marcar nada.
3. **`4a9-alinear-3-verificar.sql`** (solo lectura, de 10 a 15 min después). Tiene que dar `desalineados = 0`, `marcas = 0`, `marcas_viejas = 0` y `completados_duplicados = 0`.

**Probado en un Postgres local** con el mismo escenario que el test 7 (`sql/pruebas/correr.sh`):
- el paso 1 lista bien, incluida una fila ya marcada;
- con una cantidad equivocada, el paso 2 aborta sin marcar;
- con la cantidad correcta marca solo las 3 que corresponden, sin tocar km, `km_base`, terminales ni la ya marcada.

La recuperación posterior está probada en el test 7 con el motor real.

Efecto esperado hoy:
- `31581716` baja de 62,88 a 51,20;
- `f354d7bc` sube de 9,41 a 14,41;
- los 2 pausados bajan 0,001;
- no se completa ninguno.

## Activación

1. Merge y deploy con la flag apagada. No cambia nada.
2. Alineación: correr el paso 1. Si da filas, el paso 2 con `v_esperadas` ajustado. Esperar 10–15 min y correr el paso 3 (todo en 0).
3. En Railway, agregar `strava_progreso` a `MOTOR_PROGRESO_WRITERS`.
4. Abrir Home con un usuario de prueba. Tiene que mostrar los mismos km que `user_challenges.km_completed`.
5. Control a las 24 h: correr el paso 3 otra vez. Además, en los logs no tiene que aparecer `[convivencia] strava_progreso`, porque con la flag prendida ese camino no corre.

## Rollback

- **Sacar `strava_progreso`** de `MOTOR_PROGRESO_WRITERS`. Vuelve el cálculo viejo al instante, sin tocar datos.
- **La alineación no requiere rollback:** solo hizo que el motor recalculara esas inscripciones con sus reglas.
