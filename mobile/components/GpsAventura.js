import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapaRecorrido3D from './MapaRecorrido3D';
import MapaLinea from './MapaLinea';
import { supabase } from '../supabase';
import { colors } from '../theme/korvaTheme';
import { distanciaDeInscripcion } from '../utils/versionDesafio';
import { mapa3DDeDesafio } from '../screens/MapaRecorrido';
import { desafiosParaAventura, entradaRutaLibre, kmAventura } from '../services/gps/aventuraGpsCore';
import { consultarRutaLibre } from '../services/rutasLibresApi';
import { ISLANDIA_MUNDI } from '../services/rutaLibreMundiCore';

// Segunda pantalla del GPS: el mapa 3D del desafío con el marcador avanzando
// en vivo y la cámara detrás. Arriba, los datos de la actividad en chico.
// No escribe nada: los km se suman recién al confirmar la actividad.
export default function GpsAventura({ kmSesion = 0, distanciaTxt, tiempoTxt, ritmoTxt, ritmoLabel, onInteraccionMapa }) {
  const [estado, setEstado] = useState('cargando');
  const [desafios, setDesafios] = useState([]);
  const [elegidoId, setElegidoId] = useState(null);
  const [alto, setAlto] = useState(0);
  // Estilo del mapa: 'linea' (oscuro premium, por defecto) o 'relieve' (el 3D geográfico).
  const [estilo, setEstilo] = useState('linea');

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) { if (activo) setEstado('sesion'); return; }
        const { data, error } = await supabase
          .from('user_challenges')
          .select('challenge_id, status, pausado, km_completed, version, modalidad, challenges(id, title, total_distance_km, modalidades)')
          .eq('user_id', session.user.id)
          .eq('status', 'active');
        if (error) throw error;
        // Islandia es una ruta gratuita aparte: se agrega si la estás haciendo.
        let islandia = null;
        try {
          const libre = await consultarRutaLibre();
          if (libre?.userId === session.user.id) islandia = entradaRutaLibre(libre.participacion, ISLANDIA_MUNDI);
        } catch {
          islandia = null;
        }
        if (!activo) return;
        const lista = desafiosParaAventura([...(data || []), ...(islandia ? [islandia] : [])]);
        setDesafios(lista);
        setElegidoId(lista[0]?.challenge_id || null);
        setEstado(lista.length ? 'listo' : 'vacio');
      } catch {
        if (activo) setEstado('error');
      }
    })();
    return () => { activo = false; };
  }, []);

  const elegido = desafios.find((d) => d.challenge_id === elegidoId) || null;
  const mapa = useMemo(() => (elegido ? mapa3DDeDesafio(elegido.challenge_id, elegido.challenges?.title) : null), [elegido?.challenge_id]);
  const total = elegido ? (elegido.libre ? Number(elegido.challenges?.total_distance_km) || 0
    : (distanciaDeInscripcion(elegido, elegido.challenges) || Number(elegido.challenges?.total_distance_km) || 0)) : 0;
  const avance = kmAventura({ kmPrevio: elegido?.km_completed, kmSesion, total });

  return (
    <View style={styles.wrap}>
      <View style={styles.datos}>
        <Dato valor={distanciaTxt} etiqueta="KM" grande />
        <Dato valor={tiempoTxt} etiqueta="TIEMPO" />
        <Dato valor={ritmoTxt} etiqueta={ritmoLabel} />
      </View>

      {desafios.length > 1 && (
        <Text style={styles.chipsTitulo}>Elegí en qué mapa verte · la salida suma a todos</Text>
      )}
      {desafios.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsFila} contentContainerStyle={styles.chips}>
          {desafios.map((d) => (
            <TouchableOpacity key={d.challenge_id} onPress={() => setElegidoId(d.challenge_id)}
              style={[styles.chip, d.challenge_id === elegidoId && styles.chipActivo]}>
              <Text numberOfLines={1} style={styles.chipTxt}>{d.challenges?.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {estado === 'listo' && (
        <View style={styles.estilos}>
          {[['linea', 'Línea'], ['relieve', 'Relieve']].map(([valor, nombre]) => (
            <TouchableOpacity key={valor} onPress={() => setEstilo(valor)} style={[styles.estilo, estilo === valor && styles.estiloActivo]} accessibilityRole="button">
              <Text style={[styles.estiloTxt, estilo === valor && styles.estiloTxtActivo]}>{nombre}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.mapa} onLayout={(e) => setAlto(e.nativeEvent.layout.height)}>
        {estado === 'cargando' && <ActivityIndicator color={colors.brandOrange} style={styles.centro} />}
        {estado === 'sesion' && <Text style={styles.aviso}>Iniciá sesión para ver tu desafío mientras te movés.</Text>}
        {estado === 'error' && <Text style={styles.aviso}>No pudimos cargar tus desafíos. Tus datos siguen grabándose.</Text>}
        {estado === 'vacio' && <Text style={styles.aviso}>Cuando tengas un desafío activo, acá vas a verte avanzar por su mapa mientras te movés.</Text>}
        {estado === 'listo' && mapa && alto > 0 && estilo === 'linea' && (
          <MapaLinea
            key={`linea-${mapa.escena.id}`}
            escena={mapa.escena}
            horneado={mapa.horneado}
            checkpoints={mapa.checkpoints}
            km={avance.completado ? mapa.escena.distanciaKm : avance.progreso * mapa.escena.distanciaKm}
            factorKm={total > 0 ? total / mapa.escena.distanciaKm : 1}
            onInteraccionMapa={onInteraccionMapa}
          />
        )}
        {estado === 'listo' && mapa && alto > 0 && estilo === 'relieve' && (
          <MapaRecorrido3D
            key={mapa.escena.id}
            altura={alto}
            escena={mapa.escena}
            horneado={mapa.horneado}
            checkpoints={mapa.checkpoints}
            progreso={avance.progreso}
            completado={avance.completado}
            kmUsuario={avance.km}
            kmTotalUsuario={total}
            seguirMarcador
            onInteraccionMapa={onInteraccionMapa}
          />
        )}
      </View>
      {estado === 'listo' && <Text style={styles.nota}>{notaSuma(desafios.length)}</Text>}
    </View>
  );
}

// Aclara que la actividad suma a todos los desafíos activos, no sólo al del mapa.
export function notaSuma(cantidad) {
  if (cantidad > 1) return `Al confirmar, esta salida suma a tus ${cantidad} desafíos activos. El mapa es sólo para verte.`;
  return 'Vista previa · al confirmar, esta salida suma a tu desafío activo';
}

function Dato({ valor, etiqueta, grande }) {
  return (
    <View style={styles.dato}>
      <Text style={[styles.datoValor, grande && styles.datoGrande]} numberOfLines={1}>{valor}</Text>
      <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  datos: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: 16, paddingVertical: 10, marginTop: 14 },
  dato: { flex: 1, alignItems: 'center' },
  datoValor: { color: colors.text, fontSize: 18, fontWeight: '700' },
  datoGrande: { fontSize: 22 },
  datoEtiqueta: { color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginTop: 3 },
  // flexGrow 0: sin esto el ScrollView horizontal se estira y se come el mapa.
  chipsFila: { flexGrow: 0, flexShrink: 0 },
  chipsTitulo: { color: colors.textMuted, fontSize: 11, marginTop: 10 },
  chips: { gap: 8, paddingTop: 6, paddingBottom: 4, alignItems: 'center' },
  chip: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderSoft, maxWidth: 200 },
  chipActivo: { borderColor: colors.brandOrange, backgroundColor: colors.surfaceRaised },
  chipTxt: { color: colors.text, fontSize: 12, fontWeight: '700' },
  estilos: { flexDirection: 'row', gap: 6, marginTop: 10 },
  estilo: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: colors.borderSoft },
  estiloActivo: { backgroundColor: colors.brandOrange, borderColor: colors.brandOrange },
  estiloTxt: { color: colors.textSoft, fontSize: 12, fontWeight: '700' },
  estiloTxtActivo: { color: colors.text },
  mapa: { flex: 1, marginTop: 8, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.background, justifyContent: 'center' },
  centro: { alignSelf: 'center' },
  aviso: { color: colors.textSoft, fontSize: 13, lineHeight: 19, textAlign: 'center', paddingHorizontal: 24 },
  nota: { color: colors.textSoft, fontSize: 11, textAlign: 'center', marginTop: 6, paddingHorizontal: 8 },
});
