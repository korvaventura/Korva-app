# Etapa 4A-8 · Webhook de Strava con el motor (versión corregida tras la revisión)

**Base:** `main` `60acc44`, rama local `etapa4a-8-strava-webhook`. No hice commit, push ni deploy, no ejecuté ninguna migración y no cambié ninguna flag.

**Sin cambios respecto de la entrega anterior:**
- La flag `strava_webhook` viene apagada y solo entra al motor si también está `efectos`.
- Con la flag apagada se ejecuta exactamente el código viejo.
- `/strava/progreso` y mobile siguen sin tocar.
- La semántica del motor (`km_base`, versiones, pausas y terminales congelados) es la misma.

## Hallazgos y cómo se corrigieron

| # | Hallazgo | Corrección |
|---|---|---|
| 1 | Se respondía 200 antes de guardar el evento. Si el proceso moría, el evento se perdía. | **Bandeja persistente** `strava_webhook_eventos`. Con la flag prendida, el evento se **guarda antes del 200**. Si no se puede guardar, se responde **500** y Strava lo reintenta. Después se procesa con toma por compare-and-set y un arriendo de 5 min. Si el proceso muere, una **recuperación cada minuto** retoma los pendientes y los arriendos vencidos. Hay reintentos con espera creciente (1, 2, 4… min, tope 1 h); a los 8 intentos el evento queda en `error`, visible por SQL. El mismo evento reenviado por Strava cae en la misma `clave` única y no se duplica. |
| 2 | `delete` antes que `create`: quedaba `no_existe` y un `create` posterior la hacía sumar. | **Lápida persistente** en `strava_actividades_borradas`. Un `delete` siempre deja lápida, aunque la actividad todavía no exista. Las RPC `guardar_actividad_strava` y `borrar_actividad_strava` toman el **mismo `pg_advisory_xact_lock` por `external_id`**, así que entre procesos o instancias se ejecutan de a una para cada actividad. Un `create`, `update` o importación posterior la guarda **excluida**. |
| 3 | La coordinación entre webhook e importación dependía del candado en memoria. | La **importación** (motor y vieja) usa la misma RPC con lápidas cuando `strava_webhook` está prendida. La consistencia queda en la base: lápida y RPC atómica, marcas persistentes, compare-and-set del motor, completitud única por RPC y recuperación. El candado local queda solo como optimización. Los tests de concurrencia corren **sin candado**. |
| 4 | En la consulta del LEEME la columna era `created_at`. | Corregido a **`creado_at`** (ver "Activación"). |
| 5 | El timeout de 20 s no cubría el token. | **Alcance real:** `getValidStravaToken` (lectura y renovación del token) no tiene timeout propio; es el mismo código de los otros caminos y no lo cambié. Los 20 s (`AbortSignal.timeout`) cubren **solo** el `GET` de la actividad. **Lo que cambia:** toda la preparación (token, renovación, actividad y anti-duplicados) tiene un **plazo total de 30 s**. Si se vence, el evento queda pendiente y se reintenta. Además, la preparación ahora corre **fuera del candado del usuario**, así que un Strava lento no frena las otras escrituras de ese usuario. Al vencer el plazo, la llamada en curso no se cancela; su resultado se descarta. Si era una renovación de token, el token nuevo igual se guarda. |

## ¿Requiere migración SQL? Sí

Hacen falta dos cosas que hoy no existen en la base:

- Un lugar **durable** donde guardar el evento antes del ACK (hallazgo 1).
- Una marca de borrado **persistente** y **atómica entre instancias** con el guardado (hallazgo 2). Un candado en memoria no coordina instancias, y una lectura seguida de una escritura desde Node tiene una carrera (la prueba sin lock de abajo lo muestra).

La migración `sql/4a8-webhook-strava.sql` es **aditiva**:
- No modifica ninguna tabla ni fila existente.
- Se puede volver a ejecutar sin problema.
- Crea 2 tablas y 2 funciones.

Detalles de seguridad y compatibilidad:
- Las tablas tienen RLS activado **sin políticas**, con `REVOKE` explícito a `anon`/`authenticated` (Supabase les da ALL por defecto).
- Las funciones siguen el patrón de `completar_desafio_motor`: `SECURITY INVOKER`, `search_path` vacío y ejecución solo para `service_role`.
- El upsert de la RPC usa las mismas columnas y la misma conversión que el upsert actual de PostgREST (verificado: `recorded_at` sin zona).

**Pruebas SQL** en Postgres local, con la réplica de `activities` verificada contra producción hoy (`sql/pruebas/correr.sh`):

| Prueba | Resultado |
|---|---|
| Migración aplicada 2 veces | OK |
| Validación | 12/12 en `t` |
| Pruebas funcionales | 13/13 OK |
| Permisos de anon/authenticated | OK, sin acceso |
| Concurrencia real con 2 conexiones, en los dos órdenes (`create` con `delete` en el medio y al revés) | La segunda espera el lock y la actividad **termina excluida** |
| **Mutación:** las mismas funciones **sin** el advisory lock | Las 2 pruebas de concurrencia **fallan**: la actividad queda contando. O sea, el lock es necesario y la prueba lo detecta. |
| Rollback | Elimina tablas y funciones sin tocar `activities`. Se puede volver a aplicar. |

Producción es Postgres 17.6 y la prueba corrió en 16.13. Lo que se usa (advisory locks, `ON CONFLICT`, `xmax`) se comporta igual en las dos versiones.

## Cómo se comporta cada evento (flag prendida)

| Evento | Comportamiento |
|---|---|
| `create` / `update` | Se guarda en la bandeja, 200, y después: lectura de Strava (mismos filtros que el viejo), marcas, `guardar_actividad_strava`, motor, efectos. Si hay lápida, se guarda excluida. Un `update` de una actividad excluida no la revive. Si la distancia baja, los km bajan. Si Strava responde 404, el evento queda como `ignorado`. |
| `delete` | Se guarda en la bandeja, 200, y después: marcas, `borrar_actividad_strava` (lápida + exclusión si ya existe), motor. Es idempotente. Un terminal queda congelado. |
| Atleta / cuerpo inválido | 200 sin guardar, como hoy. |
| Push | El de progreso, igual que antes, solo si los km suben sin completar. El de racha, solo si la actividad es **nueva**. Así un reproceso no los repite. La completitud sale **una sola vez** por el evento `completado`. |

## Lista exacta de cambios contra la entrega anterior

**`lib/bandejaWebhookStrava.js` (NUEVO)**
- `claveDeEvento` y `filaDeEvento`.
- `crearRepositorioBandeja`: `registrar` con `ON CONFLICT DO NOTHING`, `tomar` con CAS por estado + intentos, `cerrar` con CAS por token, `listarVencidos`.
- `procesarEventoBandeja`: arriendo, reintentos y `error`.
- `recuperarBandeja` e `iniciarRecuperacionBandeja`.

**`lib/webhookStrava.js`**
- La preparación (Strava) va **fuera** del candado.
- La escritura usa las RPC con lápida.
- `delete` siempre marca, deja la lápida y recalcula: ya no hay `no_existe`.
- Devuelve `insertada` y `detalle`.

**`lib/progresoRepositorioSupabase.js`**
- Salen `leerActividadStravaPorExternalId` y `excluirActividadStravaPorExternalId`.
- Entran `guardarActividadStravaConLapida` y `borrarActividadStrava` (RPC).
- Opción `crearRepositorioSupabase(supabase, { lapidasStrava })`: la importación del motor guarda con lápidas.

**`routes/strava.js`**
- `POST /webhook`:
  - con la flag prendida, guarda en la bandeja → 200, o 500 si no puede guardar → procesa;
  - con la flag apagada, código viejo sin cambios.
- `manejarEventoBandeja` clasifica el resultado: `hecho`, `ignorado` o `reintentar`.
- Plazo total de 30 s para la preparación; 404 de Strava se trata como `ignorado`, y otros errores HTTP se reintentan.
- La racha solo se notifica si la actividad es nueva.
- La importación (motor y vieja) usa la RPC con lápidas **solo** si `strava_webhook` está prendida.
- Nuevo `router.iniciarRecuperacionWebhook`.

**`index.js`**
- Con la flag prendida arranca la recuperación de la bandeja: 5 s después de arrancar y cada 60 s.
- Se puede ajustar con `STRAVA_WEBHOOK_RECUPERACION_MS` y `STRAVA_WEBHOOK_RECUPERACION_INICIAL_MS`, que son opcionales y solo los usan los tests.

**`lib/flagsMotor.js`**
- `strava_webhook` y `stravaWebhookMotorActiva`, como en la entrega anterior.

**`tests/helpers/supabaseMemoria.js`**
- Imita las 2 RPC nuevas y `ignoreDuplicates`.

**`tests/helpers/precargaIndex.js` y `backendHijo.js`**
- `PRUEBA_FALLAR_TABLA` (escrituras que fallan).
- `PRUEBA_STRAVA_COLGADO` (Strava que no responde).
- `cerrar({ caida: true })`: vuelca la base en el instante de la "caída" para reiniciar otro proceso con esa base.
- `GET /activities/:id` simulado con 404.

**`tests/webhookStrava.test.js`**
- Reescrito: 38 tests.

**`package.json`**
- Incluye el test nuevo.

**SQL nuevo**
- Migración, validación, rollback y pruebas locales.

## Tests

**Archivo nuevo: 38 tests**, que incluyen todo lo pedido:

- **Persistencia antes del ACK:**
  - el evento queda `pendiente` antes de aplicarse;
  - en integración, el registro en la bandeja ocurre antes de cualquier otra escritura;
  - si la bandeja no puede guardar, la respuesta es **500** y no se aplica nada.
- **Caída o reinicio después del ACK:**
  - proceso 1 con Strava colgado: responde 200 y muere con el evento guardado (`procesando`);
  - proceso 2 nuevo, con esa base, lo aplica una vez, en las dos variantes (arriendo vencido y nunca tomado);
  - en los unitarios: caída antes de procesar; caída a mitad, que no se retoma antes del arriendo y donde el proceso viejo no pisa el cierre; caída antes y después de **cada** operación de la bandeja y del motor, en `create` y en `delete`.
- **`delete` antes de `create`:** lápida; el `create`, el `update` y la importación posteriores quedan excluidos. También en integración por HTTP y con la importación vieja.
- **`create`/`delete` concurrentes desde procesos distintos:** 300 intercalados **sin candado**, con caídas. La actividad nunca termina contando y se cubren los dos órdenes. Además, la concurrencia real en Postgres de arriba.
- **Importación vs webhook sin candado local:** 200 intercalados con caídas (webhook `create` y `update`, importación, carga manual, `delete` y eliminación). El invariante se verifica en cada paso: más de 2000 verificaciones.
- **Reintentos e idempotencia:**
  - el mismo evento antes, durante y después de procesarlo da una fila en la bandeja, se aplica una vez y los efectos salen una vez;
  - dos procesos tomando el mismo evento: se aplica una sola vez;
  - reintentos con espera creciente y paso a `error`;
  - un evento ya cerrado no se reabre;
  - 3 `create` en paralelo por HTTP.

**Suite completa:**

| Node | Resultado | Tiempo |
|---|---|---|
| 22.22.2 | **322/322** | 36 s |
| 20.20.2 | **322/322** | 42 s |

No quedaron procesos colgados.

**Estabilidad del archivo nuevo:** 5 corridas seguidas en Node 22 y 3 en paralelo en Node 20, todas en verde.

**Mutaciones** (rompo el código a propósito y algún test lo detecta): 13/13 detectadas.

| Rompo | Tests que fallan |
|---|---|
| ACK antes de guardar | 9 |
| Sin 500 si no puede guardar | 1 |
| Sin marcas | 5 |
| Importación del motor sin lápidas | 2 |
| Importación vieja sin lápidas | 1 |
| Toma sin CAS | 1 |
| Cierre sin token | 1 |
| La recuperación ignora arriendos vencidos | 4 |
| Se ignora el arriendo vigente | 2 |
| Reabre eventos cerrados | 1 |
| `delete` sin lápida | 10 |
| No procesa tras el ACK | 8 |
| La ruta siempre usa el camino viejo | 9 |

## Riesgos que quedan

1. **La migración debe ir antes de la flag.**
   - Si se prende `strava_webhook` sin la tabla, cada webhook responde 500. Strava reintenta y después descarta, así que esos eventos se pierden y además el camino viejo no corre.
   - Mitigación: correr la validación (12/12) antes de prender la flag.
   - Con la flag apagada, el código nuevo no toca nada de esto: el deploy puede ir antes o después de la migración.
2. **Si la base no responde al momento del webhook, respondemos 500.** Strava reintenta pocas veces; si la base sigue caída, ese evento se pierde. La red de seguridad para `create`/`update` sigue siendo la importación de la Home; un `delete` perdido así deja la actividad sumando, como hoy.
3. **`delete` es un cambio visible.** Borrar en Strava resta km en Korva, salvo en desafíos ya completados. Es reversible: la fila queda con `excluida = true` y la lápida se puede borrar a mano.
4. **El webhook puede bajar km** (un `update` con menos distancia o un `delete`). Mismo riesgo ya revisado en el SQL de riesgo: 3 desafíos bajan y 0 completan.
5. **El plazo de 30 s no cancela la llamada en curso** (ver hallazgo 5). Tampoco cambié la renovación concurrente del token: si dos procesos renuevan a la vez, se comporta como hoy.
6. **La bandeja crece** (una fila por evento, pocos bytes). No incluí limpieza; se puede sumar más adelante un borrado de `hecho`/`ignorado` con más de 90 días.
7. **Push perdido ante una caída:** si el proceso muere después de escribir y antes del push de progreso o de racha, ese push no sale (no se duplica, se pierde). Certificado, email y push de completitud sí se recuperan por los eventos.

## Plan de activación

1. **Merge y deploy con la flag apagada.** No cambia nada; el camino viejo queda igual.
2. **Migración:** ejecutar `4a8-webhook-strava.sql` en el SQL Editor (lo hacés vos).
3. **Validación:** `4a8-webhook-strava-validacion.sql`. Las 12 filas tienen que decir `t`.
4. **Prender:** en Railway, agregar `strava_webhook` a `MOTOR_PROGRESO_WRITERS`. Railway reinicia y arranca la recuperación de la bandeja (en el log: `recuperacion_bandeja_iniciada`).
5. **Control en las primeras 24 h** (solo lectura):

   ```sql
   -- bandeja: casi todo 'hecho' o 'ignorado'; 'error' = 0
   select estado, count(*), max(intentos) as max_intentos from public.strava_webhook_eventos group by 1 order by 1;
   -- atrasados (pendientes o arriendos vencidos hace más de 5 min): 0
   select count(*) from public.strava_webhook_eventos
   where estado in ('pendiente', 'procesando') and siguiente_intento_at < now() - interval '5 minutes';
   -- marcas viejas del motor: 0
   select count(*) from public.user_challenges
   where recalculo_pendiente_desde is not null and recalculo_pendiente_desde < now() - interval '5 minutes';
   -- completitudes del último día por motivo y estado (eventos en 'hecho')
   select datos->>'motivo' as motivo, estado, count(*) from public.progreso_eventos
   where tipo = 'completado' and creado_at > now() - interval '1 day' group by 1, 2 order by 1, 2;
   -- nunca dos 'completado' para el mismo desafío: 0 filas
   select user_challenge_id from public.progreso_eventos where tipo = 'completado' group by 1 having count(*) > 1;
   ```

   En los logs: `motor_progreso strava_webhook procesada` y `evento_hecho`, sin `no_se_pudo_registrar` ni `evento_error`.

## Rollback

1. **Inmediato:** sacar `strava_webhook` de `MOTOR_PROGRESO_WRITERS`.
   - Vuelve el código viejo (200 inmediato, sin bandeja ni lápidas) y la importación vuelve al upsert normal.
   - No se pierde nada de lo ya aplicado: eventos únicos, marcas que limpia la recuperación.
2. **Eventos que queden en la bandeja** (`pendiente`/`procesando`) no se procesan con la flag apagada.
   - Los `create`/`update` los recupera la importación de la Home.
   - Si se vuelve a prender la flag, se procesan entonces. Es correcto porque cada evento lee el estado actual de Strava y las lápidas no dependen del orden.
3. **Las lápidas y las exclusiones quedan.** Con la flag apagada, la importación vieja no mira lápidas. Solo podría revivir una actividad borrada que todavía aparezca en la lista de Strava, cosa que normalmente no pasa porque Strava ya no la devuelve.
4. **Rollback SQL** (`4a8-webhook-strava-rollback.sql`): solo si se descarta la etapa y **después** de apagar la flag. Borra las tablas y las funciones; no toca `activities`.
