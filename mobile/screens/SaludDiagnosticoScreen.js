// Pantalla TEMPORAL de diagnóstico de Salud (Apple Health / Health Connect). Solo admins.
// Muestra lo que Korva puede leer de Salud. No guarda ni envía nada:
// solo comparte un texto si el admin toca "Compartir diagnóstico".
import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Share, Alert, Switch, Platform } from 'react-native';
import { estadoSalud, conectar, leerDiagnostico, plataformaSoportada } from '../services/health/healthkitDiagnostico';
import { construirPayload, enviarMovimiento } from '../services/health/movimientoSync';
import { autoSyncActivado, setAutoSyncActivado, leerEstadoAutoSync } from '../services/health/syncAutomatico';
import { supabase } from '../supabase';

const CLAVES = ['caminando', 'bici', 'pasos'];
const ETIQUETAS = { caminando: 'Caminando/corriendo', bici: 'Bici', pasos: 'Pasos' };
const UNIDADES = { caminando: 'km', bici: 'km', pasos: 'pasos' };
const NOMBRE_SALUD = Platform.OS === 'android' ? 'Health Connect' : 'Apple Health';

const TEXTO_PERMISO = {
  no_disponible: 'Salud no está disponible en este dispositivo',
  no_pedido: 'Todavía no se pidió permiso',
  ya_pedido: Platform.OS === 'android' ? 'Permisos de lectura concedidos' : 'El pedido de permiso ya se mostró (Apple no informa si se aceptó)',
  desconocido: 'Estado del permiso desconocido',
};

const formatear = (clave, valor) => {
  if (valor === null || valor === undefined) return 'sin datos';
  if (clave === 'pasos') return String(Math.round(valor));
  return valor.toFixed(2);
};

// Compara el total consolidado de HealthKit con la suma de los valores por fuente.
const comparar = (dia, clave) => {
  const consolidado = dia.consolidado[clave] ?? 0;
  const sumaFuentes = dia.porFuente[clave].reduce((acc, f) => acc + (f.valor || 0), 0);
  return { consolidado, sumaFuentes, diferencia: sumaFuentes - consolidado };
};

const fuentesDelDia = (dia) => {
  const nombres = new Set();
  CLAVES.forEach((clave) => dia.fuentesConsolidado[clave].forEach((f) => nombres.add(f.name)));
  return [...nombres];
};

const TEXTO_RESULTADO_AUTO = {
  ok: 'OK',
  sin_datos: 'Sin días con distancia (no se envió nada)',
  sin_permiso: 'Sin permiso de Salud (no se pide automáticamente)',
  error: 'Error',
};

const fechaHora = (ms) => (ms ? new Date(ms).toLocaleString() : '—');

const armarTextoCompartir = (diag, sync, estadoAuto) => {
  const comparaciones = diag.dias.map((dia) => ({
    fecha: dia.fecha,
    ...Object.fromEntries(CLAVES.map((clave) => [clave, comparar(dia, clave)])),
  }));
  return [
    `Diagnóstico ${NOMBRE_SALUD} — Korva (temporal, solo admin)`,
    `Generado: ${diag.generado}`,
    `Zona horaria: ${diag.zonaHoraria}`,
    `Período: ${diag.desde} a ${diag.hasta}`,
    '',
    JSON.stringify({ comparaciones, ...diag }, null, 2),
    '',
    'Resultado del sync:',
    sync ? JSON.stringify(sync, null, 2) : '(no se sincronizó en esta lectura)',
    '',
    'Último sync automático:',
    estadoAuto ? JSON.stringify(estadoAuto, null, 2) : '(sin registros)',
  ].join('\n');
};

export default function SaludDiagnosticoScreen({ navigation }) {
  const [estado, setEstado] = useState(null);
  const [diag, setDiag] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [diaAbierto, setDiaAbierto] = useState(null);
  const [sync, setSync] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [userId, setUserId] = useState(null);
  const [autoActivado, setAutoActivado] = useState(false);
  const [estadoAuto, setEstadoAuto] = useState(null);

  const refrescarEstado = useCallback(async () => {
    try {
      setEstado(await estadoSalud());
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, []);

  useEffect(() => {
    refrescarEstado();
  }, [refrescarEstado]);

  const refrescarAuto = useCallback(async (id) => {
    if (!id) return;
    setAutoActivado(await autoSyncActivado(id));
    setEstadoAuto(await leerEstadoAutoSync(id));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const id = data?.session?.user?.id || null;
      setUserId(id);
      refrescarAuto(id);
    });
  }, [refrescarAuto]);

  const onCambiarAuto = async (valor) => {
    if (!userId) return;
    try {
      await setAutoSyncActivado(userId, valor);
      setAutoActivado(valor);
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo guardar la preferencia.');
    }
  };

  const onConectar = async () => {
    setError('');
    try {
      await conectar();
      await refrescarEstado();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const onLeer = async () => {
    setError('');
    setCargando(true);
    try {
      setDiag(await leerDiagnostico());
      setSync(null);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setCargando(false);
    }
  };

  const onCompartir = async () => {
    if (!diag) return;
    try {
      await Share.share({ message: armarTextoCompartir(diag, sync, estadoAuto) });
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo compartir.');
    }
  };

  const onSincronizar = () => {
    if (!diag || enviando) return;
    const prep = construirPayload(diag);
    const base = { generado: new Date().toISOString(), enviados: prep.enviados, omitidosLocales: prep.omitidosLocales };

    if (prep.errorLocal) {
      setSync({ ...base, errorLocal: prep.errorLocal, respuesta: null });
      return;
    }
    if (!prep.payload) {
      setSync({ ...base, errorLocal: 'Todos los días quedaron omitidos; no se llamó al backend.', respuesta: null });
      return;
    }

    Alert.alert(
      'Sincronizar con daily_movement',
      `Se van a enviar ${prep.enviados.length} días y omitir ${prep.omitidosLocales.length}. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          onPress: async () => {
            setEnviando(true);
            try {
              const respuesta = await enviarMovimiento(prep.payload);
              setSync({ ...base, errorLocal: null, respuesta });
            } catch (e) {
              setSync({ ...base, errorLocal: e?.message || String(e), respuesta: null });
            } finally {
              setEnviando(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.volver}>
        <Text style={styles.volverTexto}>← Volver</Text>
      </TouchableOpacity>

      <Text style={styles.titulo}>❤️ Diagnóstico {NOMBRE_SALUD}</Text>
      <Text style={styles.aviso}>
        Pantalla temporal, solo para admins. La lectura de Salud es local. Solo se envían datos a Korva si tocás manualmente “Sincronizar con daily_movement”.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitulo}>Estado</Text>
        {!plataformaSoportada ? (
          <Text style={styles.texto}>Salud no disponible en esta plataforma.</Text>
        ) : !estado ? (
          <ActivityIndicator color="#FC4C02" />
        ) : (
          <>
            <Text style={styles.texto}>Salud disponible: {estado.disponible ? 'sí' : 'no'}</Text>
            <Text style={styles.texto}>Permiso: {TEXTO_PERMISO[estado.estadoPermiso] || estado.estadoPermiso}</Text>
          </>
        )}
      </View>

      {plataformaSoportada && estado?.disponible && (
        <View style={styles.botones}>
          <TouchableOpacity style={styles.boton} onPress={onConectar}>
            <Text style={styles.botonTexto}>Conectar {NOMBRE_SALUD}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.boton} onPress={onLeer} disabled={cargando}>
            <Text style={styles.botonTexto}>{cargando ? 'Leyendo…' : 'Leer últimos 7 días'}</Text>
          </TouchableOpacity>
          {diag && (
            <TouchableOpacity style={[styles.boton, styles.botonSecundario]} onPress={onCompartir}>
              <Text style={styles.botonTexto}>Compartir diagnóstico</Text>
            </TouchableOpacity>
          )}
          {diag && (
            <TouchableOpacity
              style={[styles.boton, styles.botonSync, enviando && styles.botonDeshabilitado]}
              onPress={onSincronizar}
              disabled={enviando}
            >
              <Text style={styles.botonTexto}>{enviando ? 'Enviando…' : 'Sincronizar con daily_movement'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {plataformaSoportada && estado?.disponible && (
        <View style={styles.card}>
          <View style={styles.fila}>
            <Text style={[styles.cardTitulo, styles.filaTexto]}>Sync automático (máx. cada 3 h)</Text>
            <Switch value={autoActivado} onValueChange={onCambiarAuto} disabled={!userId} />
          </View>
          <Text style={styles.textoChico}>
            Envía los últimos 7 días al abrir la app o al volver a ella. No pide permisos: usa el permiso ya dado.
          </Text>
          {estado.estadoPermiso !== 'ya_pedido' && (
            <Text style={styles.error}>Primero conectá {NOMBRE_SALUD}; sin permiso el sync automático no corre.</Text>
          )}
          <Text style={styles.desgloseTitulo}>Último sync automático</Text>
          {!estadoAuto ? (
            <Text style={styles.textoChico}>Sin registros todavía.</Text>
          ) : (
            <>
              <Text style={styles.textoChico}>Intento: {fechaHora(estadoAuto.ultimoIntentoMs)}</Text>
              <Text style={styles.textoChico}>
                Resultado: {TEXTO_RESULTADO_AUTO[estadoAuto.resultado] || estadoAuto.resultado}
                {estadoAuto.status ? ` (HTTP ${estadoAuto.status})` : ''}
              </Text>
              <Text style={styles.textoChico}>Último éxito: {fechaHora(estadoAuto.ultimoExitoMs)}</Text>
              {Array.isArray(estadoAuto.guardados) && estadoAuto.guardados.length > 0 && (
                <Text style={styles.textoChico}>Guardados: {estadoAuto.guardados.join(', ')}</Text>
              )}
              {Array.isArray(estadoAuto.omitidosLocales) && estadoAuto.omitidosLocales.length > 0 && (
                <Text style={styles.textoChico}>
                  Omitidos localmente: {estadoAuto.omitidosLocales.map((o) => `${o.fecha} (${o.motivo})`).join(', ')}
                </Text>
              )}
              {!!estadoAuto.error && <Text style={styles.error}>Error: {estadoAuto.error}</Text>}
              {Array.isArray(estadoAuto.detalle) &&
                estadoAuto.detalle.map((d, i) => <Text key={i} style={styles.error}>• {d}</Text>)}
            </>
          )}
          <TouchableOpacity onPress={() => refrescarAuto(userId)} style={styles.volver}>
            <Text style={styles.volverTexto}>↻ Actualizar estado</Text>
          </TouchableOpacity>
        </View>
      )}

      {!!error && <Text style={styles.error}>Error: {error}</Text>}

      {sync && (
        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Resultado del sync</Text>
          <Text style={styles.textoChico}>
            Días enviados: {sync.enviados.length ? sync.enviados.join(', ') : 'ninguno'}
          </Text>
          <Text style={styles.textoChico}>Omitidos localmente:</Text>
          {sync.omitidosLocales.length === 0 ? (
            <Text style={styles.textoChico}>  ninguno</Text>
          ) : (
            sync.omitidosLocales.map((o) => (
              <Text key={o.fecha} style={styles.textoChico}>  • {o.fecha}: {o.motivo}</Text>
            ))
          )}
          {!!sync.errorLocal && <Text style={styles.error}>{sync.errorLocal}</Text>}
          {sync.respuesta && (
            <>
              <Text style={styles.texto}>Status HTTP: {sync.respuesta.status ?? 'sin respuesta'}</Text>
              <Text style={styles.textoChico}>
                Guardados backend: {Array.isArray(sync.respuesta.cuerpo?.guardados) && sync.respuesta.cuerpo.guardados.length
                  ? sync.respuesta.cuerpo.guardados.join(', ')
                  : 'ninguno'}
              </Text>
              <Text style={styles.textoChico}>Omitidos backend:</Text>
              {Array.isArray(sync.respuesta.cuerpo?.omitidos) && sync.respuesta.cuerpo.omitidos.length ? (
                sync.respuesta.cuerpo.omitidos.map((o, i) => (
                  <Text key={`${o.fecha}-${i}`} style={styles.textoChico}>  • {o.fecha}: {o.motivo}</Text>
                ))
              ) : (
                <Text style={styles.textoChico}>  ninguno</Text>
              )}
              {!!sync.respuesta.error && <Text style={styles.error}>Error: {sync.respuesta.error}</Text>}
              {Array.isArray(sync.respuesta.cuerpo?.detalle) &&
                sync.respuesta.cuerpo.detalle.map((d, i) => (
                  <Text key={i} style={styles.error}>• {d}</Text>
                ))}
              <Text style={styles.textoChico}>Respuesta cruda:</Text>
              <Text style={styles.codigo}>
                {typeof sync.respuesta.cuerpo === 'string'
                  ? sync.respuesta.cuerpo
                  : JSON.stringify(sync.respuesta.cuerpo, null, 2)}
              </Text>
            </>
          )}
        </View>
      )}

      {diag && (
        <>
          <Text style={styles.seccion}>
            Por día ({diag.desde} a {diag.hasta}, zona {diag.zonaHoraria})
          </Text>
          <Text style={styles.ayuda}>Tocá un día para ver el desglose por fuente.</Text>

          {[...diag.dias].reverse().map((dia) => {
            const abierto = diaAbierto === dia.fecha;
            const fuentes = fuentesDelDia(dia);
            return (
              <TouchableOpacity
                key={dia.fecha}
                style={styles.card}
                onPress={() => setDiaAbierto(abierto ? null : dia.fecha)}
                activeOpacity={0.8}
              >
                <Text style={styles.cardTitulo}>{dia.fecha} {abierto ? '▲' : '▼'}</Text>
                {CLAVES.map((clave) => (
                  <Text key={clave} style={styles.texto}>
                    {ETIQUETAS[clave]}: {formatear(clave, dia.consolidado[clave])} {dia.consolidado[clave] != null ? UNIDADES[clave] : ''}
                  </Text>
                ))}
                <Text style={styles.textoChico}>
                  Fuentes: {fuentes.length ? fuentes.join(', ') : 'ninguna'}
                </Text>

                {abierto && CLAVES.map((clave) => {
                  const c = comparar(dia, clave);
                  return (
                    <View key={clave} style={styles.desglose}>
                      <Text style={styles.desgloseTitulo}>{ETIQUETAS[clave]}</Text>
                      {dia.porFuente[clave].length === 0 ? (
                        <Text style={styles.textoChico}>Sin valores por fuente.</Text>
                      ) : (
                        dia.porFuente[clave].map((f, i) => (
                          <Text key={`${f.bundleIdentifier}-${i}`} style={styles.textoChico}>
                            • {f.name} ({f.bundleIdentifier}): {formatear(clave, f.valor)}
                          </Text>
                        ))
                      )}
                      <Text style={styles.textoChico}>Total consolidado: {formatear(clave, c.consolidado)}</Text>
                      <Text style={styles.textoChico}>Suma por fuente: {formatear(clave, c.sumaFuentes)}</Text>
                      <Text style={styles.textoChico}>Diferencia fuentes vs consolidado: {formatear(clave, c.diferencia)}</Text>
                    </View>
                  );
                })}
              </TouchableOpacity>
            );
          })}

          <Text style={styles.seccion}>Fuentes detectadas</Text>
          {CLAVES.map((clave) => (
            <View key={clave} style={styles.card}>
              <Text style={styles.cardTitulo}>{ETIQUETAS[clave]}</Text>
              {diag.fuentes[clave].length === 0 ? (
                <Text style={styles.textoChico}>Ninguna.</Text>
              ) : (
                diag.fuentes[clave].map((f) => (
                  <View key={f.bundleIdentifier} style={styles.fuente}>
                    <Text style={styles.texto}>{f.name}</Text>
                    <Text style={styles.textoChico}>{f.bundleIdentifier}</Text>
                    {f.dispositivos.length > 0 && (
                      <Text style={styles.textoChico}>Dispositivo: {f.dispositivos.join(' | ')}</Text>
                    )}
                  </View>
                ))
              )}
            </View>
          ))}
          <Text style={styles.ayuda}>
            El dispositivo sale de las últimas {diag.muestrasPorTipo} muestras de cada tipo; puede faltar en fuentes con pocas muestras recientes.
          </Text>

          {diag.errores.length > 0 && (
            <>
              <Text style={styles.seccion}>Errores de lectura</Text>
              {diag.errores.map((e, i) => (
                <Text key={i} style={styles.error}>{e}</Text>
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  volver: { marginBottom: 12 },
  volverTexto: { color: '#A8CFFF', fontSize: 15 },
  titulo: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  aviso: { color: '#A8CFFF', fontSize: 13, marginBottom: 16 },
  card: { backgroundColor: '#1E3A5F', borderRadius: 14, padding: 16, marginBottom: 12 },
  cardTitulo: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15, marginBottom: 6 },
  texto: { color: '#FFFFFF', fontSize: 14, marginBottom: 2 },
  textoChico: { color: '#C9D6E3', fontSize: 12, marginBottom: 2 },
  botones: { gap: 10, marginBottom: 16 },
  boton: { backgroundColor: '#FC4C02', borderRadius: 12, padding: 14, alignItems: 'center' },
  botonSecundario: { backgroundColor: '#1E6FD9' },
  botonSync: { backgroundColor: '#2E7D32' },
  botonDeshabilitado: { opacity: 0.5 },
  codigo: { color: '#C9D6E3', fontSize: 11, fontFamily: 'Courier', marginTop: 4 },
  botonTexto: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  error: { color: '#FF6B6B', fontSize: 13, marginBottom: 8 },
  seccion: { color: '#A8CFFF', fontWeight: 'bold', fontSize: 13, letterSpacing: 1, marginTop: 8, marginBottom: 6 },
  ayuda: { color: '#7F93A8', fontSize: 12, marginBottom: 10 },
  desglose: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#2C4A6E' },
  desgloseTitulo: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13, marginBottom: 4 },
  fuente: { marginBottom: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filaTexto: { flex: 1, marginRight: 12 },
});