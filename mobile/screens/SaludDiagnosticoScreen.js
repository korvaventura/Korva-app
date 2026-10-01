// Pantalla TEMPORAL de diagnóstico de Apple Health. Solo para admins.
// Muestra lo que Korva puede leer de Salud. No guarda ni envía nada:
// solo comparte un texto si el admin toca "Compartir diagnóstico".
import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Share, Alert } from 'react-native';
import { estadoSalud, conectar, leerDiagnostico, plataformaSoportada } from '../services/health/healthkitDiagnostico';

const CLAVES = ['caminando', 'bici', 'pasos'];
const ETIQUETAS = { caminando: 'Caminando/corriendo', bici: 'Bici', pasos: 'Pasos' };
const UNIDADES = { caminando: 'km', bici: 'km', pasos: 'pasos' };

const TEXTO_PERMISO = {
  no_disponible: 'Salud no está disponible en este dispositivo',
  no_pedido: 'Todavía no se pidió permiso',
  ya_pedido: 'El pedido de permiso ya se mostró (Apple no informa si se aceptó)',
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

const armarTextoCompartir = (diag) => {
  const comparaciones = diag.dias.map((dia) => ({
    fecha: dia.fecha,
    ...Object.fromEntries(CLAVES.map((clave) => [clave, comparar(dia, clave)])),
  }));
  return [
    'Diagnóstico Apple Health — Korva (temporal, solo admin)',
    `Generado: ${diag.generado}`,
    `Zona horaria: ${diag.zonaHoraria}`,
    `Período: ${diag.desde} a ${diag.hasta}`,
    '',
    JSON.stringify({ comparaciones, ...diag }, null, 2),
  ].join('\n');
};

export default function SaludDiagnosticoScreen({ navigation }) {
  const [estado, setEstado] = useState(null);
  const [diag, setDiag] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [diaAbierto, setDiaAbierto] = useState(null);

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
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setCargando(false);
    }
  };

  const onCompartir = async () => {
    if (!diag) return;
    try {
      await Share.share({ message: armarTextoCompartir(diag) });
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo compartir.');
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.volver}>
        <Text style={styles.volverTexto}>← Volver</Text>
      </TouchableOpacity>

      <Text style={styles.titulo}>❤️ Diagnóstico Apple Health</Text>
      <Text style={styles.aviso}>
        Pantalla temporal, solo para admins. Solo lee datos de Salud y los muestra acá. No guarda ni envía nada a Korva.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitulo}>Estado</Text>
        {!plataformaSoportada ? (
          <Text style={styles.texto}>Solo disponible en iPhone.</Text>
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
            <Text style={styles.botonTexto}>Conectar Apple Health</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.boton} onPress={onLeer} disabled={cargando}>
            <Text style={styles.botonTexto}>{cargando ? 'Leyendo…' : 'Leer últimos 7 días'}</Text>
          </TouchableOpacity>
          {diag && (
            <TouchableOpacity style={[styles.boton, styles.botonSecundario]} onPress={onCompartir}>
              <Text style={styles.botonTexto}>Compartir diagnóstico</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!!error && <Text style={styles.error}>Error: {error}</Text>}

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
  botonTexto: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  error: { color: '#FF6B6B', fontSize: 13, marginBottom: 8 },
  seccion: { color: '#A8CFFF', fontWeight: 'bold', fontSize: 13, letterSpacing: 1, marginTop: 8, marginBottom: 6 },
  ayuda: { color: '#7F93A8', fontSize: 12, marginBottom: 10 },
  desglose: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#2C4A6E' },
  desgloseTitulo: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13, marginBottom: 4 },
  fuente: { marginBottom: 8 },
});