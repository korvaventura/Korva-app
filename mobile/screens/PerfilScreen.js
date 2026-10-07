import KorvaProgressShare from '../components/KorvaProgressShare';
import { ordenarAventurasPerfil } from '../services/aventurasPerfilCore';
import { RutaLibreCardVista } from '../components/RutaLibreCard';
import useRutaLibre from '../services/useRutaLibre';
import KorvaGroups from '../components/KorvaGroups';
import { nombreDeporteActividad, nombreFuenteActividad, iconoDeporteActividad } from '../utils/actividadPresentacion';
import KorvaCompletedShare from '../components/KorvaCompletedShare';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, TextInput, Alert, ActivityIndicator, Modal, Dimensions } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../supabase';
import { versionDeInscripcion, versionesDelDesafio, distanciaDeVersion, distanciaDeInscripcion, etiquetaVersion, modalidadLegacy } from '../utils/versionDesafio';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme/korvaTheme';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - 48;

const formatearFecha = (fecha) => {
  if (!fecha) return '';
  return new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const diasEntre = (fecha1, fecha2) => {
  const d1 = new Date(fecha1);
  const d2 = new Date(fecha2);
  return Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)));
};

export default function PerfilScreen() {
  const navigation = useNavigation();
  const [usuario, setUsuario] = useState(null);
  const [modalEnvioReto, setModalEnvioReto] = useState(null);
  const [detallesReto, setDetallesReto] = useState({});
  const [progresoCompartir, setProgresoCompartir] = useState(null);
  const [retoCompartir, setRetoCompartir] = useState(null);
  const [stats, setStats] = useState(null);
  const [alturasRetos, setAlturasRetos] = useState({});
  const [userId, setUserId] = useState(null);
  const { estado: rutaLibre, actualizar: actualizarRutaLibre } = useRutaLibre();
  const participacionLibre = rutaLibre.datos?.userId === userId ? rutaLibre.datos.participacion : null;
  const tieneRutaLibre = !!participacionLibre && !participacionLibre.abandonado;
  const scrollRef = useRef(null);
  const direccionY = useRef(0);
  const actividadesY = useRef(0);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreEditado, setNombreEditado] = useState('');
  const [nivel, setNivel] = useState(null);
  const [insignias, setInsignias] = useState([]);
  const [insigniasProgreso, setInsigniasProgreso] = useState({});
  const [actividades, setActividades] = useState([]);
  const [mostrarTodasActividades, setMostrarTodasActividades] = useState(false);
  const [editandoDireccion, setEditandoDireccion] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [inscripcionesActivas, setInscripcionesActivas] = useState([]);
  const aventurasPerfil = ordenarAventurasPerfil(inscripcionesActivas, participacionLibre);
  const [retoIndex, setRetoIndex] = useState(0);
  const [cambiandoModalidad, setCambiandoModalidad] = useState(false);
  const [metaFecha, setMetaFecha] = useState({});
  const [editandoMeta, setEditandoMeta] = useState({});
  const [inputMeta, setInputMeta] = useState({});
  const [guardandoMeta, setGuardandoMeta] = useState({});
  const [modalStravaVisible, setModalStravaVisible] = useState(false);
  const [modalStravaProximamente, setModalStravaProximamente] = useState(false);
  const [cargandoBib, setCargandoBib] = useState(false);

  const [modalStravaInfoVisible, setModalStravaInfoVisible] = useState(false);
  const [modalCambioModalidad, setModalCambioModalidad] = useState(null);
  const [stravaHabilitado, setStravaHabilitado] = useState(false);
  // FIX: referencia incluida en el estado inicial
  const [formDireccion, setFormDireccion] = useState({
    nombre: '', direccion: '', referencia: '', ciudad: '', provincia: '', codigo_postal: '', pais: '', telefono: '', documento: '', indicaciones: '',
  });
  const [busquedaDireccion, setBusquedaDireccion] = useState('');
  const [sugerenciasDireccion, setSugerenciasDireccion] = useState([]);
  const [buscandoDireccion, setBuscandoDireccion] = useState(false);
  const [direccionConfirmada, setDireccionConfirmada] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setUserId(session.user.id);

      }
    });
  }, []);

  useEffect(() => {
    if (userId) {
      cargarPerfil();
      cargarActividades();
      cargarInscripcionesActivas();
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        cargarPerfil();
        cargarActividades();
        cargarInscripcionesActivas();
      } else {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user?.id) setUserId(session.user.id);
        });
      }
    }, [userId])
  );

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('strava-connected')) {
        cargarPerfil();
        setModalStravaVisible(true);
      }
    });
    return () => subscription.remove();
  }, []);

  const cargarPerfil = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/perfil/${userId}?t=${Date.now()}`);
      const data = await res.json();
      if (data.error) {
        console.error('Error cargando perfil:', data.error, data.detalle);
        if (res.status === 404) {
          Alert.alert('Sesión desactualizada', data.detalle || 'Cerrá sesión y volvé a entrar para solucionarlo.');
        }
        return;
      }
      setUsuario(data.usuario);
      setStats(data.stats);
      setNivel(data.nivel);
      setInsignias(data.insignias || []);
      setInsigniasProgreso(data.insigniasProgreso || {});
      const { data: userData } = await supabase
        .from('users')
        .select('strava_habilitado')
        .eq('id', userId)
        .maybeSingle();
      setStravaHabilitado(!!userData?.strava_habilitado);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const cargarActividades = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/actividades/${userId}`);
      const data = await res.json();
      setActividades(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error cargando actividades:', error);
    }
  };

  const eliminarActividad = async (actividadId) => {
    Alert.alert('Eliminar actividad', '¿Estás seguro que querés eliminar esta actividad?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${BACKEND_URL}/actividades/${actividadId}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: userId })
            });
            setActividades(prev => prev.filter(a => a.id !== actividadId));
            await new Promise(resolve => setTimeout(resolve, 800));
            await cargarPerfil();
            await cargarActividades();
            await cargarInscripcionesActivas();
          } catch (error) {
            Alert.alert('Error', 'No se pudo eliminar la actividad.');
          }
        }
      }
    ]);
  };

  const cargarInscripcionesActivas = async () => {
    try {
      const { data, error } = await supabase
        .from('user_challenges')
        .select('id, numero_bib, version, modalidad, challenge_id, meta_fecha, km_completed, status, pausado, completed_at, challenges(title, modalidades, total_distance_km)')
        .eq('user_id', userId)
        .in('status', ['active', 'completed', 'shipped', 'cargado']);
      if (!error && data) {
        const terminales = new Set(['completed', 'shipped', 'cargado']);
        const fechaMs = (v) => {
          const ms = v ? new Date(v).getTime() : 0;
          return Number.isFinite(ms) ? ms : 0;
        };
        const ordenadas = [...data].sort((a, b) => {
          const aTerminal = terminales.has(a.status);
          const bTerminal = terminales.has(b.status);
          if (aTerminal !== bTerminal) return aTerminal ? 1 : -1;
          if (!aTerminal && !!a.pausado !== !!b.pausado) return a.pausado ? 1 : -1;
          if (aTerminal && bTerminal) return fechaMs(b.completed_at) - fechaMs(a.completed_at);
          return 0;
        });
        setInscripcionesActivas(ordenadas);
        const metas = {};
        data.forEach(d => { if (d.meta_fecha) metas[d.challenge_id] = d.meta_fecha; });
        setMetaFecha(metas);
      }
    } catch (error) {}
  };

  // Cambio de VERSIÓN (Estándar/Extendida). Los km no cambian: solo la distancia a completar.
  const cambiarModalidad = (inscripcion, nuevaVersion) => {
    if (nuevaVersion === versionDeInscripcion(inscripcion)) return;
    const nuevaData = { version: nuevaVersion, label: etiquetaVersion(nuevaVersion), distancia_km: distanciaDeVersion(inscripcion.challenges, nuevaVersion) };
    setModalCambioModalidad({ inscripcion, nuevaVersion, nuevaData });
  };

  const confirmarCambioModalidad = async () => {
    if (!modalCambioModalidad) return;
    const { inscripcion, nuevaVersion } = modalCambioModalidad;
    setModalCambioModalidad(null);
    setCambiandoModalidad(true);
    try {
      // `version` es lo que usa el backend; `modalidad` va por compatibilidad.
      const res = await fetch(`${BACKEND_URL}/usuarios/modalidad`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, challenge_id: inscripcion.challenge_id, version: nuevaVersion, modalidad: modalidadLegacy(nuevaVersion) })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInscripcionesActivas(prev => prev.map(i =>
        i.challenge_id === inscripcion.challenge_id ? { ...i, version: nuevaVersion, modalidad: modalidadLegacy(nuevaVersion) } : i
      ));
      Alert.alert(`✅ Versión ${etiquetaVersion(nuevaVersion)} activada`, 'Tus km no cambiaron: solo cambió la distancia a completar.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo cambiar la versión');
    } finally { setCambiandoModalidad(false); }
  };

  const aplicarMascaraFecha = (texto) => {
    // Solo números
    const numeros = texto.replace(/\D/g, '');
    if (numeros.length <= 2) return numeros;
    if (numeros.length <= 4) return `${numeros.slice(0,2)}/${numeros.slice(2)}`;
    return `${numeros.slice(0,2)}/${numeros.slice(2,4)}/${numeros.slice(4,8)}`;
  };

  const guardarMeta = async (inscripcion) => {
    const cId = inscripcion.challenge_id;
    const input = inputMeta[cId] || '';
    if (!input) {
      await supabase.from('user_challenges').update({ meta_fecha: null }).eq('user_id', userId).eq('challenge_id', cId);
      setMetaFecha(prev => { const n = { ...prev }; delete n[cId]; return n; });
      setEditandoMeta(prev => ({ ...prev, [cId]: false }));
      return;
    }
    const partes = input.split('/');
    if (partes.length !== 3) { Alert.alert('Formato inválido', 'Usá DD/MM/AAAA'); return; }
    const [dia, mes, anio] = partes.map(Number);
    const fecha = new Date(anio, mes - 1, dia, 12, 0, 0);
    if (isNaN(fecha.getTime())) { Alert.alert('Fecha inválida'); return; }
    if (fecha <= new Date()) { Alert.alert('La fecha debe ser futura'); return; }
    setGuardandoMeta(prev => ({ ...prev, [cId]: true }));
    try {
      await supabase.from('user_challenges').update({ meta_fecha: fecha.toISOString() }).eq('user_id', userId).eq('challenge_id', cId);
      setMetaFecha(prev => ({ ...prev, [cId]: fecha.toISOString() }));
      setEditandoMeta(prev => ({ ...prev, [cId]: false }));
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar la meta.');
    } finally { setGuardandoMeta(prev => ({ ...prev, [cId]: false })); }
  };

  const abrirEdicion = () => {
    const d = usuario?.shipping_address;
    // FIX: referencia cargada correctamente al abrir edición
    setFormDireccion({
      nombre: d?.nombre || usuario?.name || '',
      direccion: d?.direccion || '',
      referencia: d?.referencia || '',
      ciudad: d?.ciudad || '',
      codigo_postal: d?.codigo_postal || '',
      provincia: d?.provincia || '',
      pais: d?.pais || '',
      telefono: d?.telefono || '',
      documento: d?.documento || '',
      indicaciones: d?.indicaciones || '',
    });
    setBusquedaDireccion(d?.direccion || '');
    setDireccionConfirmada(!!d?.direccion);
    setSugerenciasDireccion([]);
    setEditandoDireccion(true);
  };

  const buscarDirecciones = async (texto) => {
    setBusquedaDireccion(texto);
    // Sincronizar siempre — así funciona aunque no elijan de la lista
    setFormDireccion(prev => ({ ...prev, direccion: texto }));
    setDireccionConfirmada(false);
    if (texto.trim().length < 3) {
      setSugerenciasDireccion([]);
      return;
    }
    setBuscandoDireccion(true);
    try {
      const res = await fetch(`${BACKEND_URL}/direcciones/autocomplete?input=${encodeURIComponent(texto)}`);
      const data = await res.json();
      setSugerenciasDireccion(data.predicciones || []);
    } catch (error) {
      setSugerenciasDireccion([]);
    } finally {
      setBuscandoDireccion(false);
    }
  };

  const elegirDireccion = async (sugerencia) => {
    setBusquedaDireccion(sugerencia.descripcion);
    setSugerenciasDireccion([]);
    setBuscandoDireccion(true);
    try {
      const res = await fetch(`${BACKEND_URL}/direcciones/detalle/${sugerencia.place_id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFormDireccion(prev => ({
        ...prev,
        direccion: data.direccion || sugerencia.descripcion,
        ciudad: data.ciudad || prev.ciudad,
        codigo_postal: data.codigo_postal || prev.codigo_postal,
        pais: data.pais || prev.pais,
      }));
      setDireccionConfirmada(true);
    } catch (error) {
      Alert.alert('Error', 'No se pudo cargar el detalle de esa dirección. Intentá elegir otra de la lista.');
    } finally {
      setBuscandoDireccion(false);
    }
  };

  const guardarDireccion = async () => {
    const { nombre, direccion, ciudad, pais, telefono, codigo_postal } = formDireccion;
    if (!nombre?.trim() || !direccion?.trim() || !ciudad?.trim() || !pais?.trim()) {
      Alert.alert('Faltan datos', 'Por favor completá nombre, dirección, ciudad y país.');
      return;
    }
    // Solo advertencia si tiene una sola palabra — no bloquea
    const partesNombre = nombre.trim().split(' ').filter(Boolean);
    if (partesNombre.length < 2) {
      console.log('Nombre con una sola palabra:', nombre);
      // No bloqueamos — algunos nombres son de una sola palabra
    }
    // CP opcional — algunos países no usan
    // if (!codigo_postal || codigo_postal.trim().length < 3) { ... }
    // Teléfono recomendado pero no bloquea
    if (telefono && telefono.trim().length > 0 && telefono.trim().length < 6) {
      Alert.alert('Teléfono inválido', 'El teléfono parece muy corto. Ingresá el número con código de país.');
      return;
    }
    // CUIL recomendado pero no bloquea
    if ((pais.toLowerCase().includes('argentina') || pais.toLowerCase().includes('arg')) && formDireccion.documento) {
      const doc = formDireccion.documento?.trim().replace(/[^0-9]/g, '');
      if (doc.length > 0 && (doc.length < 7 || doc.length > 11)) {
        Alert.alert('CUIL inválido', 'El CUIL debe tener entre 7 y 11 dígitos (solo números, sin guiones).');
        return;
      }
    }
    setGuardando(true);
    try {
      // FIX: referencia guardada como campo separado, no concatenada en dirección
      const res = await fetch(`${BACKEND_URL}/usuarios/direccion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, shipping_address: { ...formDireccion }, nombre_completo: formDireccion.nombre }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.detalle);
      setUsuario(prev => ({ ...prev, shipping_address: { ...formDireccion }, name: formDireccion.nombre }));
      setEditandoDireccion(false);
      Alert.alert('✅ Dirección guardada', 'Tu dirección de envío fue actualizada.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar la dirección. Intentá de nuevo.');
    } finally { setGuardando(false); }
  };

  const conectarStrava = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/strava-cupo?userId=${userId}`);
      const data = await res.json();
      if (data.disponible) {
        setModalStravaInfoVisible(true);
      } else if (data.motivo === 'sin_reto') {
        Alert.alert(
          '🔗 Strava disponible',
          'La sincronización con Strava está disponible para atletas con un desafío activo. ¡Inscribite en un desafío para conectarla! 🏅'
        );
      } else {
        setModalStravaProximamente(true);
      }
    } catch (e) {
      setModalStravaProximamente(true);
    }
  };

  const conectarStravaConfirmado = () => {
    setModalStravaInfoVisible(false);
    conectarStravaReal();
  };


  const togglePausar = async (challengeId, pausado) => {
    try {
      const endpoint = pausado ? 'reanudar' : 'pausar';
      await fetch(`${BACKEND_URL}/challenges/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, challenge_id: challengeId }),
      });
      cargarInscripcionesActivas();
    } catch (e) {
      Alert.alert('Error', 'No se pudo cambiar el estado del desafío.');
    }
  };

  const descargarBib = async (tipo, challengeId) => {
    setCargandoBib(tipo);
    try {
      const fetchUrl = challengeId 
        ? `${BACKEND_URL}/usuarios/bib/${userId}?challenge_id=${challengeId}`
        : `${BACKEND_URL}/usuarios/bib/${userId}`;
      const res = await fetch(fetchUrl);
      const data = await res.json();
      if (data.error) { Alert.alert('Error', data.error); return; }
      const url = tipo === 'dorsal' ? data.dorsal_url : data.postal_url;
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Error', 'No se pudo abrir el archivo.');
    } finally {
      setCargandoBib(false);
    }
  };

  const subirFoto = async () => {
    try {
      const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permiso.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para subir la foto.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (result.canceled) return;
      const base64 = result.assets[0].base64;
      const res = await fetch(`${BACKEND_URL}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64,
          carpeta: 'avatars',
          nombre: `avatar_${userId}_${Date.now()}.jpg`,
        }),
      });
      const data = await res.json();
      if (data.url) {
        await supabase.from('users').update({ avatar_url: data.url }).eq('id', userId);
        setUsuario(prev => ({ ...prev, avatar_url: data.url }));
        Alert.alert('✅ Foto actualizada');
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo subir la foto. Intentá de nuevo.');
    }
  };

  const desconectarStrava = async () => {
    Alert.alert(
      'Desconectar Strava',
      '¿Seguro que querés desconectar Strava? Tus actividades anteriores quedan guardadas pero no se sincronizarán nuevas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desconectar', style: 'destructive', onPress: async () => {
          try {
            const { error } = await supabase.from('users').update({
              strava_token: null,
              strava_refresh_token: null,
              strava_athlete_id: null,
              strava_token_expires_at: null,
              strava_habilitado: false,
            }).eq('id', userId);
            if (error) throw error;
            setUsuario(prev => ({ ...prev, strava_token: null, strava_habilitado: false }));
            Alert.alert('✅ Strava desconectada', 'Tu cuenta de Strava fue desvinculada exitosamente.');
          } catch (e) {
            Alert.alert('Error', 'No se pudo desconectar. Intentá de nuevo.');
          }
        }},
      ]
    );
  };

  const conectarStravaReal = async () => {
    const result = await WebBrowser.openAuthSessionAsync(
      `${BACKEND_URL}/strava/auth?userId=${userId}`,
      'korva://strava-connected'
    );
    if (result.type === 'success' || result.url?.includes('strava-connected')) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await cargarPerfil();
      await new Promise(resolve => setTimeout(resolve, 1500));
      await cargarPerfil();
      setModalStravaVisible(true);
    }
  };

  const cerrarSesion = async () => { await supabase.auth.signOut(); };

  const eliminarCuenta = () => {
    Alert.alert(
      '⚠️ Eliminar cuenta',
      'Esta acción es permanente. Se eliminarán tu cuenta y todos tus datos personales asociados. Tu historial de desafíos quedará anonimizado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '¿Estás seguro/a?',
              'No podrás recuperar tu cuenta ni tus datos. ¿Querés eliminar tu cuenta definitivamente?',
              [
                { text: 'No, conservar mi cuenta', style: 'cancel' },
                {
                  text: 'Sí, eliminar definitivamente',
                  style: 'destructive',
                  onPress: confirmarEliminacion,
                },
              ]
            );
          },
        },
      ]
    );
  };

  const confirmarEliminacion = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { Alert.alert('Error', 'No hay sesión activa.'); return; }

      const res = await fetch(`${BACKEND_URL}/usuarios/${session.user.id}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.error) {
        Alert.alert('Error', 'No se pudo eliminar la cuenta. Intentá de nuevo.');
        return;
      }

      // Limpiar datos locales
      await supabase.auth.signOut();
      await AsyncStorage.clear();

      Alert.alert('Cuenta eliminada', 'Tu cuenta fue eliminada correctamente.');
    } catch (e) {
      Alert.alert('Error', 'No se pudo conectar. Verificá tu conexión e intentá de nuevo.');
    }
  };

  const formatearFechaCorta = (fecha) => {
    if (!fecha) return '';
    return new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const toggleHistorial = () => {
    setMostrarTodasActividades(!mostrarTodasActividades);
    if (mostrarTodasActividades) {
      scrollRef.current?.scrollTo({ y: Math.max(0, actividadesY.current - 12), animated: true });
    }
  };

  const actividadesVisibles = mostrarTodasActividades ? actividades : actividades.slice(0, 1);
  const stravaConectado = !!usuario?.strava_token;
  const direccion = usuario?.shipping_address;
  const inicial = usuario?.name?.charAt(0)?.toUpperCase() || 'K';

  return (
    <SafeAreaView style={styles.scroll} edges={['top']}><ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.container}>

      {/* Modal Próximamente Strava */}
      {/* Modal Strava Info */}
      <Modal visible={modalStravaInfoVisible} transparent animationType="fade" onRequestClose={() => setModalStravaInfoVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <View style={styles.modalCard}>
              <Text style={styles.modalEmoji}>🏃</Text>
              <Text style={styles.modalTitulo}>Conectá Strava con Korva</Text>
              <Text style={styles.modalSubtitulo}>Strava es una app gratuita para registrar entrenamientos. Cada actividad que registres en Strava se carga automáticamente a tu desafío Korva.</Text>
              <View style={styles.modalPaso}>
                <Text style={styles.modalPasoEmoji}>📱</Text>
                <View style={styles.modalPasoInfo}>
                  <Text style={styles.modalPasoTitulo}>¿No tenés Strava?</Text>
                  <Text style={styles.modalPasoDesc}>Descargala gratis en Google Play o App Store. Registrá tus salidas con el GPS del teléfono y listo.</Text>
                </View>
              </View>
              <View style={styles.modalPaso}>
                <Text style={styles.modalPasoEmoji}>🔗</Text>
                <View style={styles.modalPasoInfo}>
                  <Text style={styles.modalPasoTitulo}>¿Cómo funciona?</Text>
                  <Text style={styles.modalPasoDesc}>Conectás tu cuenta de Strava una sola vez. Cada actividad que hagas en Strava se importa sola a Korva y suma al progreso de tu desafío.</Text>
                </View>
              </View>
              <View style={styles.modalPaso}>
                <Text style={styles.modalPasoEmoji}>✅</Text>
                <View style={styles.modalPasoInfo}>
                  <Text style={styles.modalPasoTitulo}>Solo para atletas activos</Text>
                  <Text style={styles.modalPasoDesc}>Necesitás tener un desafío activo para conectar Strava — que ya tenés 🎉</Text>
                </View>
              </View>
              {/* Aviso importante antes de conectar */}
              <View style={{ backgroundColor: colors.background, borderRadius: 12, padding: 14, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: colors.brandOrange }}>
                <Text style={{ color: colors.brandOrange, fontWeight: 'bold', fontSize: 12, marginBottom: 8 }}>⚠️ ANTES DE CONECTAR, LEÉ ESTO:</Text>
                <Text style={{ color: colors.textSoft, fontSize: 13, lineHeight: 20, marginBottom: 6 }}>• Si ya cargaste actividades manualmente, Strava puede volver a sumarlas si también las tenés ahí. Revisá tu historial y borrá las duplicadas desde la app.</Text>
                <Text style={{ color: colors.textSoft, fontSize: 13, lineHeight: 20, marginBottom: 6 }}>• Todas tus actividades de Strava se importan automáticamente — incluyendo las de ciclismo, natación y caminata. Todo suma.</Text>
                <Text style={{ color: colors.textSoft, fontSize: 13, lineHeight: 20 }}>• Para borrar una actividad, andá al Perfil y deslizá sobre ella en el historial.</Text>
              </View>

              <TouchableOpacity style={styles.modalBtn} onPress={conectarStravaConfirmado}>
                <Text style={styles.modalBtnText}>Conectar Strava 🔗</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 12 }} onPress={() => setModalStravaInfoVisible(false)}>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={modalStravaProximamente} transparent animationType="fade" onRequestClose={() => setModalStravaProximamente(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🔗</Text>
            <Text style={styles.modalTitulo}>Strava — En proceso</Text>
            <Text style={styles.modalSubtitulo}>Ya solicitamos ampliar el acceso a Strava. Mientras tanto podés seguir sumando km normalmente.</Text>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>⚙️</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Límite temporal de Strava</Text>
                <Text style={styles.modalPasoDesc}>Strava limita la cantidad de usuarios por app en fase de revisión. Ya solicitamos ampliar el cupo — es un trámite de Strava, no un problema de Korva.</Text>
              </View>
            </View>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>📝</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Registrá tus km manualmente mientras tanto</Text>
                <Text style={styles.modalPasoDesc}>Desde la pestaña "Registrar" cargás tus km en segundos. Tus medallas y logros se acumulan igual.</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setModalStravaProximamente(false)}>
              <Text style={styles.modalBtnText}>Entendido 👍</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal instructivo Strava */}
      <Modal visible={modalStravaVisible} transparent animationType="fade" onRequestClose={() => setModalStravaVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🎉</Text>
            <Text style={styles.modalTitulo}>¡Strava conectado!</Text>
            <Text style={styles.modalSubtitulo}>Así funciona de ahora en adelante:</Text>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>🏃</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Salí a correr y registrá tu actividad en Strava</Text>
                <Text style={styles.modalPasoDesc}>Usá Strava normalmente para trackear tu entrenamiento — ya sabemos que lo tenés 😉</Text>
              </View>
            </View>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>✅</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Tus km aparecen solos acá</Text>
                <Text style={styles.modalPasoDesc}>Cada actividad que registres en Strava se suma automáticamente a tu desafío</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setModalStravaVisible(false)}>
              <Text style={styles.modalBtnText}>¡Entendido, a correr! 🚀</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal cambio de modalidad */}
      <Modal visible={!!modalCambioModalidad} transparent animationType="fade" onRequestClose={() => setModalCambioModalidad(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🎯</Text>
            <Text style={styles.modalTitulo}>
              Versión {modalCambioModalidad?.nuevaData?.label} · {modalCambioModalidad?.nuevaData?.distancia_km} km
            </Text>
            <Text style={styles.modalSubtitulo}>{modalCambioModalidad?.inscripcion?.challenges?.title}</Text>
            <View style={styles.confirmInfoBox}>
              <Text style={styles.confirmInfoTexto}>
                {`🎯 Tu nueva meta será ${modalCambioModalidad?.nuevaData?.distancia_km} km. Tus km acumulados no cambian. Tu certificado va a mostrar la distancia de la versión que completes.`}
              </Text>
              <Text style={styles.confirmInfoTexto}>
                👟 En cualquier versión podés caminar, correr o andar en bici: todos los km cuentan igual.
              </Text>
              {(() => {
                const estandarKm = distanciaDeVersion(modalCambioModalidad?.inscripcion?.challenges, 'estandar');
                if (modalCambioModalidad?.nuevaVersion !== 'estandar' && estandarKm && estandarKm !== modalCambioModalidad?.nuevaData?.distancia_km) {
                  return (
                    <Text style={styles.confirmInfoTexto}>
                      🏅 Tu medalla física dirá <Text style={{ fontWeight: 'bold', color: colors.text }}>{estandarKm}K</Text> — el diseño es el mismo para las dos versiones del desafío.
                    </Text>
                  );
                }
                return null;
              })()}
            </View>
            <TouchableOpacity style={styles.modalBtn} onPress={confirmarCambioModalidad}>
              <Text style={styles.modalBtnText}>Confirmar cambio</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 12 }} onPress={() => setModalCambioModalidad(null)}>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Perfil */}
      <View style={styles.heroBg}>
        <View style={styles.heroRow}>
        <TouchableOpacity style={styles.avatarWrapper} onPress={subirFoto} accessibilityRole="button" accessibilityLabel="Cambiar foto de perfil">
          {usuario?.avatar_url ? (
            <Image source={{ uri: usuario.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarLetra}>{inicial}</Text>
            </View>
          )}
          <View style={styles.avatarCamara}>
            <Ionicons name="camera-outline" size={14} color={colors.text} />
          </View>
        </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroEyebrow}>PERFIL KORVA</Text>
            <Text style={styles.nombre}>{usuario?.name || 'Cargando...'}</Text>
            <Text style={styles.heroSub}>Cada paso cuenta</Text>
            <TouchableOpacity style={styles.editarPerfil} accessibilityRole="button"
              onPress={() => { setNombreEditado(usuario?.name || ''); setEditandoNombre(true); }}>
              <Ionicons name="create-outline" size={15} color={colors.actionBlue} />
              <Text style={styles.editarPerfilText}>Editar perfil</Text>
            </TouchableOpacity>
          </View>
        </View>
        {editandoNombre && (
          <View style={{ marginTop: 20, alignItems: 'stretch' }}>
            <Text style={styles.email}>{usuario?.email}</Text>
            <TextInput
              style={{ color: colors.text, fontSize: 18, fontWeight: 'bold', borderBottomWidth: 1, borderColor: colors.brandOrange, textAlign: 'left', paddingVertical: 4 }}
              value={nombreEditado}
              onChangeText={setNombreEditado}
              autoFocus
              placeholder="Tu nombre completo"
              placeholderTextColor="#4a6a8a"
            />
            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <TouchableOpacity
                style={{ backgroundColor: colors.brandOrange, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8 }}
                onPress={async () => {
                  const nombre = nombreEditado.trim();
                  if (!nombre || nombre.length < 2) {
                    Alert.alert('Nombre inválido', 'Ingresá tu nombre completo.');
                    return;
                  }
                  await fetch(`${BACKEND_URL}/usuarios/nombre`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId, nombre }),
                  });
                  setUsuario(prev => ({ ...prev, name: nombre }));
                  setEditandoNombre(false);
                }}
              >
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 13 }}>Guardar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: '#2a3a4a' }}
                onPress={() => setEditandoNombre(false)}
              >
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Banner dirección faltante */}
      {!usuario?.shipping_address && inscripcionesActivas.length > 0 && (
        <TouchableOpacity
          style={{ backgroundColor: '#7C3AED22', borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#7C3AED' }}
          onPress={() => scrollRef.current?.scrollTo({ y: direccionY.current, animated: true })}
        >
          <Text style={{ fontSize: 20, marginRight: 10 }}>📦</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 14 }}>Cargá tu dirección de envío</Text>
            <Text style={{ color: colors.textSoft, fontSize: 12 }}>Necesaria para gestionar tus envíos de medallas</Text>
          </View>
          <Text style={{ color: '#7C3AED', fontSize: 16 }}>→</Text>
        </TouchableOpacity>
      )}

      {/* Stats — solo los 3 más importantes */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}><Ionicons name="navigate-outline" size={16} color={colors.brandOrangeSoft} style={{ marginBottom: 6 }} /><Text style={styles.statNumero}>{stats?.total_km || 0}</Text><Text style={styles.statLabel}>km totales</Text></View>
        <View style={styles.statCard}><Ionicons name="medal-outline" size={16} color={colors.brandOrangeSoft} style={{ marginBottom: 6 }} /><Text style={styles.statNumero}>{stats?.medallas || 0}</Text><Text style={styles.statLabel}>Medallas</Text></View>
        <View style={styles.statCard}><Ionicons name="flame-outline" size={16} color={colors.brandOrangeSoft} style={{ marginBottom: 6 }} /><Text style={styles.statNumero}>{stats?.racha_actual || 0}</Text><Text style={styles.statLabel}>Semanas en racha</Text></View>
      </View>

      <TouchableOpacity
        style={styles.korvaMundiPerfil}
        onPress={() => navigation.navigate('KorvaMundi')}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel="Abrir KorvaMundi"
      >
        <View style={styles.korvaMundiPerfilIcon}>
          <Ionicons name="globe-outline" size={18} color={colors.textSoft} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.korvaMundiPerfilTitle}>KorvaMundi</Text>
          <Text style={styles.korvaMundiPerfilMeta}>
            {(() => {
              const terminales = new Set(['completed', 'shipped', 'cargado']);
              const conquistas = inscripcionesActivas.filter((i) => terminales.has(i.status)).length;
              const enCurso = inscripcionesActivas.filter((i) => i.status === 'active' && !i.pausado).length;
              if (conquistas === 0 && enCurso === 0) return 'Tu mundo está esperando';
              if (conquistas === 0) return `${enCurso} aventura${enCurso === 1 ? '' : 's'} en curso`;
              if (enCurso === 0) return `${conquistas} conquista${conquistas === 1 ? '' : 's'} · Tu mundo`;
              return `${conquistas} conquista${conquistas === 1 ? '' : 's'} · ${enCurso} aventura${enCurso === 1 ? '' : 's'} en curso`;
            })()}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
      </TouchableOpacity>


      {/* Retos activos */}
      {(inscripcionesActivas.length > 0 || tieneRutaLibre) && (
        <View style={{ width: '100%', marginBottom: 20 }}>
          <Text style={[styles.seccionTitulo, { paddingHorizontal: 24 }]}>Mis desafíos</Text>
          <ScrollView
            horizontal
            style={alturasRetos[retoIndex] ? { height: alturasRetos[retoIndex] } : undefined}
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={e => setRetoIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
          >
            {aventurasPerfil.map((inscripcion, idx) => {
              if (inscripcion.libre) return (
                <View key="islandia-libre" style={{ width: SCREEN_WIDTH, paddingHorizontal: 24, alignSelf: 'flex-start' }}
                  onLayout={e => { const h = Math.ceil(e.nativeEvent.layout.height); setAlturasRetos(prev => prev[idx] === h ? prev : { ...prev, [idx]: h }); }}>
                  <RutaLibreCardVista navigation={navigation} estado={rutaLibre} destacado accion="Ver ruta" onActualizar={() => actualizarRutaLibre({ conservarDatos: true })} />
                </View>
              );
              const cId = inscripcion.challenge_id;
              const versionActual = versionDeInscripcion(inscripcion);
              const versiones = versionesDelDesafio(inscripcion.challenges).filter(v => v.distancia_km !== null);
              const distanciaTotal = distanciaDeInscripcion(inscripcion, inscripcion.challenges) || 0;
              const puedeCambiarVersion = inscripcion.status === 'active'; // terminados: congelados
              const kmCompletados = inscripcion.km_completed || 0;
              const pct = distanciaTotal > 0 ? Math.min((kmCompletados / distanciaTotal) * 100, 100) : 0;
              const mFecha = metaFecha[cId];
              const detallesAbiertos = !!detallesReto[cId];
              // El plan escala solo por la distancia de la versión (no asume deporte).

              return (
                <View key={cId} style={{ width: SCREEN_WIDTH, paddingHorizontal: 24, alignSelf: 'flex-start' }}
                  onLayout={e => { const h = Math.ceil(e.nativeEvent.layout.height); setAlturasRetos(prev => prev[idx] === h ? prev : { ...prev, [idx]: h }); }}>
                  <View style={styles.retoCard}>
                    <Text style={styles.retoEyebrow}>{inscripcion.status === 'active' ? (inscripcion.pausado ? 'DESAFÍO PAUSADO' : 'TU AVENTURA') : 'DESAFÍO COMPLETADO'}</Text>
                    <View style={styles.retoTitleRow}>
                      <Text style={styles.retoCardTitulo}>{inscripcion.challenges?.title}</Text>
                      <View style={styles.retoPctPill}><Text style={styles.retoProgressPct}>{pct.toFixed(0)}%</Text></View>
                    </View>
                    <View style={styles.retoMetricRow}>
                      <Text style={styles.retoMetric}>{kmCompletados.toFixed(1)}</Text>
                      <Text style={styles.retoMetricUnit}>km</Text>
                    </View>
                    <Text style={styles.retoKm}>de {distanciaTotal} km</Text>
                    <View style={styles.retoProgressBar}>
                      <View style={[styles.retoProgressFill, { width: `${pct}%` }]} />
                    </View>
                    <View style={styles.retoResumen}>
                      <Text style={styles.retoVersionResumen}>A tu ritmo</Text>
                      {mFecha && (
                        <View style={styles.retoMetaResumen}>
                          <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
                          <Text style={styles.retoMetaResumenText}>Meta: {new Date(mFecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.retoRutaBtn}
                      onPress={() => navigation.navigate('DetalleReto', {
                        item: {
                          ...inscripcion,
                          challenge: inscripcion.challenges?.title,
                          km_completados: kmCompletados,
                          distancia_total: distanciaTotal,
                          porcentaje: pct,
                        },
                        userId,
                        nombrePersona: usuario?.nombre || usuario?.name || '',
                        abrirRuta: true,
                      })}
                      accessibilityRole="button"
                    >
                      <Ionicons name="map-outline" size={16} color={colors.actionBlue} />
                      <Text style={styles.retoRutaBtnText}>Ver ruta</Text>
                      <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.retoRutaBtn} accessibilityRole="button"
                      onPress={() => setProgresoCompartir({ titulo: inscripcion.challenges?.title, km: kmCompletados, total: distanciaTotal })}>
                      <Ionicons name="share-outline" size={16} color={colors.actionBlue} /><Text style={styles.retoRutaBtnText}>Compartir progreso</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.retoDetailsToggle}
                      onPress={() => setDetallesReto(prev => ({ ...prev, [cId]: !prev[cId] }))}
                      accessibilityRole="button" accessibilityState={{ expanded: detallesAbiertos }}>
                      <Text style={styles.retoDetailsLabel}>Opciones y documentos</Text>
                      <Ionicons name={detallesAbiertos ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                    {detallesAbiertos && (
                      <View style={styles.retoSettings}>
                    <Text style={styles.modalidadLabel}>DISTANCIA DEL DESAFÍO</Text>
                    <View style={styles.modalidadBtns}>
                      {versiones.map((v) => (
                        <TouchableOpacity
                          key={v.version}
                          style={[styles.modalidadBtn, versionActual === v.version && styles.modalidadBtnActivo]}
                          onPress={() => cambiarModalidad(inscripcion, v.version)}
                          disabled={cambiandoModalidad || !puedeCambiarVersion}
                        >
                          <Text style={[styles.modalidadBtnText, versionActual === v.version && styles.modalidadBtnTextActivo]}>
                            {v.label} · {v.distancia_km} km
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.metaSeparador} />
                    <View style={styles.metaHeader}>
                      <Text style={styles.metaTitulo}>Meta personal</Text>
                      <TouchableOpacity onPress={() => {
                        setInputMeta(prev => ({ ...prev, [cId]: mFecha ? new Date(mFecha).toLocaleDateString('es-AR') : '' }));
                        setEditandoMeta(prev => ({ ...prev, [cId]: !prev[cId] }));
                      }}>
                        <Text style={styles.metaEditarBtn}>{editandoMeta[cId] ? 'Cancelar' : mFecha ? 'Editar' : '+ Elegir fecha'}</Text>
                      </TouchableOpacity>
                    </View>
                    {editandoMeta[cId] ? (
                      <>
                        <View style={styles.metaInputRow}>
                          <TextInput
                            style={styles.metaInput}
                            value={inputMeta[cId] || ''}
                            onChangeText={v => setInputMeta(prev => ({ ...prev, [cId]: aplicarMascaraFecha(v) }))}
                            placeholder="DD/MM/AAAA"
                            placeholderTextColor="#4a6a8a"
                            keyboardType="numeric"
                            maxLength={10}
                          />
                          <TouchableOpacity style={styles.metaGuardarBtn} onPress={() => guardarMeta(inscripcion)} disabled={guardandoMeta[cId]}>
                            {guardandoMeta[cId] ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.metaGuardarBtnText}>Guardar</Text>}
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.metaVacio}>Referencia personal: no modifica el desafío ni determina el envío de tu medalla.</Text>
                      </>
                    ) : mFecha ? (
                      <View style={styles.metaInfo}>
                        <Text style={styles.metaFechaText}>Objetivo: {formatearFecha(mFecha)}</Text>
                        <Text style={styles.metaDias}>{diasEntre(new Date(), new Date(mFecha))} días restantes</Text>
                        <Text style={styles.metaRitmo}>
                          Referencia matemática: ~{(Math.max(0, distanciaTotal - kmCompletados) / diasEntre(new Date(), new Date(mFecha))).toFixed(1)} km/día
                        </Text>
                        <Text style={styles.metaVacio}>No es un plan de entrenamiento ni determina el envío de tu medalla.</Text>
                      </View>
                    ) : (
                      <Text style={styles.metaVacio}>Fecha objetivo opcional para organizar tu progreso. No afecta el envío de tu medalla.</Text>
                    )}
                      </View>
                    )}
                    <View style={styles.retoActions}>
                      <TouchableOpacity
                        style={styles.challengeAction}
                        onPress={() => navigation.navigate('DetalleReto', {
                          item: {
                            ...inscripcion,
                            challenge: inscripcion.challenges?.title || inscripcion.challenges?.name || 'Desafío',
                            km_completados: kmCompletados,
                            distancia_total: distanciaTotal,
                            porcentaje: pct,
                            meta_fecha: mFecha || inscripcion.meta_fecha || '',
                          },
                          userId,
                          nombrePersona: usuario?.name,
                        })}
                      >
                        <Text style={{ color: colors.textSoft, fontWeight: 'bold', fontSize: 12 }}><Ionicons name="book-outline" size={14} color={colors.textSoft} /> Historia</Text>
                      </TouchableOpacity>
                      {inscripcion.status === 'active' && (
                        <TouchableOpacity
                          style={styles.challengeAction}
                          onPress={() => togglePausar(inscripcion.challenge_id, inscripcion.pausado)}
                        >
                          <View style={styles.retoActionRow}>
                            <Ionicons name={inscripcion.pausado ? 'play-outline' : 'pause-outline'} size={14} color={inscripcion.pausado ? colors.brandOrangeSoft : colors.textMuted} />
                            <Text style={styles.secondaryActionText}>{inscripcion.pausado ? 'Reanudar' : 'Pausar'}</Text>
                          </View>
                        </TouchableOpacity>
                      )}
                      {['completed', 'cargado', 'shipped'].includes(inscripcion.status) && (
                        <TouchableOpacity
                          style={styles.challengeAction}
                          onPress={() => setModalEnvioReto(inscripcion)}
                        >
                          <Text style={{ color: colors.textSoft, fontWeight: 'bold', fontSize: 12 }}><Ionicons name="medal-outline" size={14} color={colors.brandOrangeSoft} /> Medalla y envío</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {detallesAbiertos && <View style={styles.bibRow}>
                      <TouchableOpacity style={styles.bibBtn} onPress={() => descargarBib('dorsal', inscripcion.challenge_id)} disabled={!!cargandoBib}>
                        {cargandoBib === 'dorsal' ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.bibBtnText}><Ionicons name="document-text-outline" size={14} color={colors.textSoft} /> Mi dorsal</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.bibBtn, styles.bibBtnSecundario]} onPress={() => descargarBib('postal', inscripcion.challenge_id)} disabled={!!cargandoBib}>
                        {cargandoBib === 'postal' ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={[styles.bibBtnText, { color: colors.textSoft }]}><Ionicons name="image-outline" size={14} color={colors.textSoft} /> Mi postal</Text>}
                      </TouchableOpacity>
                    </View>}
                    {['completed', 'cargado', 'shipped'].includes(inscripcion.status) && (
                      <TouchableOpacity style={styles.completedShareBtn} accessibilityRole="button"
                        onPress={() => setRetoCompartir({ ...inscripcion, distancia_total: distanciaTotal })}>
                        <Ionicons name="share-outline" size={16} color={colors.brandOrangeSoft} />
                        <Text style={styles.completedShareText}>Compartir desafío completado</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
          {aventurasPerfil.length > 1 && (
            <View style={styles.dotsRow}>
              {Array.from({ length: aventurasPerfil.length }, (_, i) => (
                <View key={i} style={[styles.dot, i === retoIndex && styles.dotActivo]} />
              ))}
            </View>
          )}
        </View>
      )}

      <Modal visible={!!modalEnvioReto} transparent animationType="fade" onRequestClose={() => setModalEnvioReto(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalEnvioReto(null)}>
          <View style={[styles.modalCard, { padding: 24 }]}>
            <Text style={{ fontSize: 30, marginBottom: 10, textAlign: 'center' }}>🎁</Text>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 }}>Sobre tu medalla</Text>
            <Text style={{ color: '#6F91B5', fontSize: 12, textAlign: 'center', marginBottom: 16 }}>{modalEnvioReto?.challenge || modalEnvioReto?.challenge_title || ''}</Text>
            <Text style={{ color: colors.textSoft, fontSize: 13, lineHeight: 20, marginBottom: 12 }}>
              Nuestro equipo está preparando y gestionando tu pedido. Cuando el envío tenga información de seguimiento disponible, la recibirás por correo electrónico.
            </Text>
            <Text style={{ color: colors.textSoft, fontSize: 13, lineHeight: 20, marginBottom: 12 }}>
              Si compraste varias medallas en una misma compra, pueden prepararse y enviarse juntas. En ese caso recibirás un único enlace de seguimiento para el pedido, no un correo por cada medalla.
            </Text>
            <Text style={{ color: '#7F96AD', fontSize: 12, lineHeight: 18, marginBottom: 18 }}>
              El estado del desafío dentro de la app no confirma por sí solo que una medalla haya sido despachada individualmente. No necesitás realizar ninguna acción por el momento.
            </Text>
            <TouchableOpacity
              style={{ borderWidth: 1, borderColor: '#2A5A8A', borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 12 }}
              onPress={() => Linking.openURL('https://korva.run/pages/envios')}
            >
              <Text style={{ color: colors.actionBlue, fontWeight: 'bold', fontSize: 13 }}>Ver información completa sobre envíos →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalEnvioReto(null)}>
              <Text style={{ color: '#6F8298', textAlign: 'center', fontSize: 13 }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Actividades */}
      <View style={styles.seccion} onLayout={(e) => { actividadesY.current = e.nativeEvent.layout.y; }}>
        <View style={styles.activitiesHeading}>
          <Text style={[styles.seccionTitulo, { marginBottom: 0, flex: 1 }]}>Tus actividades</Text>
          <TouchableOpacity style={styles.activitiesLink} onPress={() => navigation.navigate('MisActividades')}
            accessibilityRole="button" accessibilityLabel="Ver todas mis actividades">
            <Text style={styles.activitiesLinkText}>Ver todas</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.actionBlue} />
          </TouchableOpacity>
        </View>
        {mostrarTodasActividades && (
          <TouchableOpacity style={styles.collapseTop} onPress={toggleHistorial}>
            <Ionicons name="chevron-up" size={16} color={colors.textSoft} />
            <Text style={styles.verTodasText}>Ocultar historial</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.activitiesHint}>Tocá una actividad para ver el detalle y compartirla.</Text>
        {actividades.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🏁</Text>
            <Text style={styles.emptyText}>Sin actividades todavia</Text>
            <Text style={styles.emptySubtext}>Registrá tus km desde la pestaña "Registrar"</Text>
          </View>
        ) : (
          <>
            {actividadesVisibles.map((act, i) => (
              <TouchableOpacity
                key={i}
                style={styles.actividadRow}
                activeOpacity={0.82}
                onPress={() => navigation.navigate('DetalleActividad', { actividad: act, userId })}
              >
                <View style={styles.actividadIcon}><Ionicons name={iconoDeporteActividad(act.sport_type)} size={22} color={colors.brandOrangeSoft} /></View>
                <View style={styles.actividadInfo}>
                  <Text style={styles.actividadFecha}>{formatearFechaCorta(act.recorded_at)}</Text>
                  <Text style={styles.actividadTipo}>
                    {nombreDeporteActividad(act.sport_type)}
                    {' · ' + nombreFuenteActividad(act.source)}
                  </Text>
                </View>
                <Text style={styles.actividadKm}>{parseFloat(act.distance_km).toFixed(2)} km</Text>
                <TouchableOpacity onPress={() => eliminarActividad(act.id)} style={styles.eliminarBtn}
                  accessibilityRole="button" accessibilityLabel="Eliminar actividad">
                  <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            {actividades.length > 1 && (
              <TouchableOpacity style={styles.verTodasBtn} onPress={toggleHistorial}>
                <Text style={styles.verTodasText}>
                  {mostrarTodasActividades ? '▲ Ocultar historial' : `▼ Ver historial completo (${actividades.length - 1} más)`}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Nivel */}
      {nivel && (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}><Ionicons name="flash-outline" size={18} color={colors.brandOrange} /> Tu nivel</Text>
          <View style={styles.nivelCard}>
            <Text style={styles.nivelEmoji}>{nivel.emoji}</Text>
            <View style={styles.nivelInfo}>
              <Text style={styles.nivelNombre}>{nivel.nombre}</Text>
              {nivel.siguiente 
                ? <Text style={styles.nivelSiguiente}>Completá {nivel.faltanParaSiguiente === 1 ? '1 desafío más' : `${nivel.faltanParaSiguiente} desafíos más`} para subir de nivel</Text>
                : <Text style={styles.nivelSiguiente}>Nivel máximo alcanzado — sos una leyenda 🐐</Text>
              }
            </View>
          </View>
        </View>
      )}

      {/* Logros */}
      {(insignias.length > 0 || Object.keys(insigniasProgreso).length > 0) && (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}><Ionicons name="trophy-outline" size={18} color={colors.brandOrange} /> Logros {insignias.length > 0 ? `(${insignias.length})` : ''}</Text>
          
          {/* Carrusel horizontal de logros ganados */}
          {insignias.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {insignias.map((ins, i) => (
                <View key={i} style={[styles.logroCard, { marginRight: 8 }]}>
                  <Text style={styles.logroEmoji}>{ins.emoji}</Text>
                  <Text style={styles.logroNombre}>{ins.nombre}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Solo el próximo logro más cercano */}
          {(() => {
            const categorias = ['distancia','racha','actividades','challenges','consistencia','especial'];
            const proximos = categorias.map(k => insigniasProgreso?.[k]).filter(Boolean);
            if (proximos.length === 0) return null;
            const proximo = proximos[0];
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 10, padding: 10 }}>
                <Text style={{ fontSize: 18, marginRight: 8 }}>🎯</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textSoft, fontSize: 12, fontWeight: 'bold' }}>{proximo.nombre}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>Faltan {proximo.falta} {proximo.unidad}</Text>
                </View>
                <Text style={{ color: colors.brandOrange }}>🔒</Text>
              </View>
            );
          })()}
        </View>
      )}

      <View style={styles.seccion}>
        <KorvaGroups navigation={navigation} />
      </View>

      {/* Dirección */}
      <View style={styles.seccion} onLayout={e => { direccionY.current = e.nativeEvent.layout.y; }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center', marginBottom: 12 }}>
          🔒 Tu información es privada y solo se usa para procesar el envío de tu medalla. No se comparte con terceros.
        </Text>
        <Text style={styles.seccionTitulo}><Ionicons name="cube-outline" size={18} color={colors.textSoft} /> Dirección de envío</Text>
        {editandoDireccion ? (
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Nombre completo para el envío *</Text>
            <TextInput style={styles.input} value={formDireccion.nombre} onChangeText={v => setFormDireccion(p => ({ ...p, nombre: v }))} placeholder="Juan Pérez" placeholderTextColor="#4a6a8a" />

            <Text style={styles.formLabel}>Dirección * <Text style={styles.opcionalTexto}>(buscá y elegí de la lista)</Text></Text>
            <TextInput
              style={styles.input}
              value={busquedaDireccion}
              onChangeText={buscarDirecciones}
              placeholder="Empezá a escribir tu calle..."
              placeholderTextColor="#4a6a8a"
            />
            {buscandoDireccion && <ActivityIndicator color="#1E6FD9" size="small" style={{ marginBottom: 12 }} />}
            {sugerenciasDireccion.length > 0 && (
              <View style={styles.sugerenciasBox}>
                {sugerenciasDireccion.map((s, i) => (
                  <TouchableOpacity key={i} style={styles.sugerenciaItem} onPress={() => elegirDireccion(s)}>
                    <Text style={styles.sugerenciaTexto}>{s.descripcion}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {direccionConfirmada && (
              <View style={styles.direccionConfirmadaBox}>
                <Text style={styles.direccionConfirmadaTexto}>✓ Dirección verificada con Google Maps</Text>
              </View>
            )}

            {/* FIX: campo referencia guardado correctamente como campo separado */}
            <Text style={styles.formLabel}>Torre / Depto / Piso / Apto <Text style={styles.opcionalTexto}>(opcional)</Text></Text>
            <TextInput
              style={styles.input}
              value={formDireccion.referencia || ''}
              onChangeText={v => setFormDireccion(p => ({ ...p, referencia: v }))}
              placeholder="Ej: Torre B, Apto 302 / Piso 4 Depto A"
              placeholderTextColor="#4a6a8a"
            />

            <Text style={styles.formLabel}>Ciudad *</Text>
            <TextInput style={styles.input} value={formDireccion.ciudad} onChangeText={v => setFormDireccion(p => ({ ...p, ciudad: v }))} placeholder="Buenos Aires" placeholderTextColor="#4a6a8a" />
            <Text style={styles.formLabel}>Provincia / Estado</Text>
            <TextInput style={styles.input} value={formDireccion.provincia || ''} onChangeText={v => setFormDireccion(p => ({ ...p, provincia: v }))} placeholder="Ej: Buenos Aires, Cataluña, California" placeholderTextColor="#4a6a8a" />
            <Text style={styles.formLabel}>Código postal *</Text>
            <TextInput style={styles.input} value={formDireccion.codigo_postal} onChangeText={v => setFormDireccion(p => ({ ...p, codigo_postal: v }))} placeholder="1425" placeholderTextColor="#4a6a8a" keyboardType="numeric" />
            <Text style={styles.formLabel}>País *</Text>
            <TextInput style={styles.input} value={formDireccion.pais} onChangeText={v => setFormDireccion(p => ({ ...p, pais: v }))} placeholder="Argentina" placeholderTextColor="#4a6a8a" />
            <Text style={styles.formLabel}>Teléfono * (con código de país)</Text>
            <TextInput style={styles.input} value={formDireccion.telefono} onChangeText={v => setFormDireccion(p => ({ ...p, telefono: v }))} placeholder="+54 11 1234 5678" placeholderTextColor="#4a6a8a" keyboardType="phone-pad" />
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: -8, marginBottom: 8 }}>Lo necesitamos para coordinar el envío con el correo</Text>

            {(formDireccion.pais?.toLowerCase().includes('argentina') || formDireccion.pais?.toLowerCase().includes('arg')) && (
              <>
                <Text style={styles.formLabel}>CUIL * <Text style={{ color: colors.textMuted, fontWeight: 'normal' }}>(requerido para Argentina)</Text></Text>
                <TextInput
                  style={styles.input}
                  value={formDireccion.documento}
                  onChangeText={v => setFormDireccion(p => ({ ...p, documento: v.replace(/[^0-9]/g, '') }))}
                  placeholder="CUIL (solo números, sin guiones)"
                  placeholderTextColor="#4a6a8a"
                  keyboardType="numeric"
                  maxLength={11}
                />
              </>
            )}

            <Text style={styles.formLabel}>Indicaciones adicionales <Text style={{ color: colors.textMuted, fontWeight: 'normal' }}>(opcional)</Text></Text>
            <TextInput
              style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
              value={formDireccion.indicaciones}
              onChangeText={v => setFormDireccion(p => ({ ...p, indicaciones: v }))}
              placeholder="Ej: edificio, piso, entre calles, horario de entrega, etc."
              placeholderTextColor="#4a6a8a"
              multiline
            />

            <View style={styles.formBotones}>
              <TouchableOpacity style={styles.cancelarBtn} onPress={() => setEditandoDireccion(false)} disabled={guardando}>
                <Text style={styles.cancelarBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.guardarBtn} onPress={guardarDireccion} disabled={guardando}>
                {guardando ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.guardarBtnText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : direccion ? (
          <View style={styles.direccionCard}>
            <Text style={styles.direccionNombre}>{direccion.nombre}</Text>
            <Text style={styles.direccionLinea}>{direccion.direccion}</Text>
            {/* FIX: referencia mostrada en la vista de dirección */}
            {direccion.referencia ? <Text style={styles.direccionLinea}>{direccion.referencia}</Text> : null}
            <Text style={styles.direccionLinea}>{direccion.ciudad}, {direccion.codigo_postal}</Text>
            <Text style={styles.direccionLinea}>{direccion.pais}</Text>
            {direccion.telefono && <Text style={styles.direccionTel}>{direccion.telefono}</Text>}
            <TouchableOpacity style={styles.editarBtn} onPress={abrirEdicion}>
              <Text style={styles.editarBtnText}>Editar dirección</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📍</Text>
            <Text style={styles.emptyText}>Sin dirección guardada</Text>
            <Text style={styles.emptySubtext}>Se pedira al completar tu primer reto</Text>
            <TouchableOpacity style={[styles.editarBtn, { marginTop: 16 }]} onPress={abrirEdicion}>
              <Text style={styles.editarBtnText}>Agregar dirección</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Strava */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>Conexiones · Strava</Text>
        {stravaConectado ? (
          <>
            <View style={styles.stravaConectadoCard}>
              <View style={styles.stravaConectadoInfo}>
                <Text style={styles.stravaConectadoText}>Strava conectado</Text>
                <Text style={styles.stravaConectadoDesc}>Tus actividades se sincronizan automáticamente</Text>
              </View>
              <View style={{ gap: 8, alignItems: 'flex-end' }}>
                <TouchableOpacity onPress={conectarStravaReal}>
                  <Text style={styles.stravaReconectarText}>Reconectar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={desconectarStrava}>
                  <Text style={{ color: colors.danger, fontSize: 12 }}>Desconectar</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={styles.stravaInstructivoBtn} onPress={() => setModalStravaVisible(true)}>
              <Text style={styles.stravaInstructivoBtnText}>¿Cómo funciona la sincronización?</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.stravaButton} onPress={conectarStrava}>
            <Text style={styles.stravaButtonText}>Conectar con Strava</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.cerrarButton} onPress={cerrarSesion}>
        <Text style={styles.cerrarButtonText}>Cerrar sesión</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.eliminarCuentaBtn} onPress={eliminarCuenta}>
        <Text style={styles.eliminarCuentaBtnText}>Eliminar cuenta</Text>
      </TouchableOpacity>

      {progresoCompartir && <KorvaProgressShare reto={progresoCompartir} onClose={() => setProgresoCompartir(null)} />}
      <KorvaCompletedShare nombrePersona={usuario?.name} reto={retoCompartir} onClose={() => setRetoCompartir(null)} />
    </ScrollView></SafeAreaView>
  );
}

const styles = StyleSheet.create({
  completedShareBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSoft },
  completedShareText: { fontSize: 12, fontWeight: '800', color: colors.brandOrangeSoft },
  actividadIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundDeep },
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { paddingBottom: 60, alignItems: 'center' },
  heroBg: { width: '100%', paddingHorizontal: 24, paddingTop: 18, paddingBottom: 12, marginBottom: spacing.sm },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  heroEyebrow: { color: colors.brandOrangeSoft, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 5 },
  heroSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  editarPerfil: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 10 },
  editarPerfilText: { color: colors.actionBlue, fontSize: 12, fontWeight: '700' },
  avatarWrapper: { marginBottom: 0, position: 'relative' },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: colors.brandOrangeSoft },
  avatarPlaceholder: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong },
  avatarLetra: { fontSize: 28, fontWeight: 'bold', color: colors.text },
  avatarCamara: { position: 'absolute', bottom: -2, right: -2, backgroundColor: colors.surfaceRaised, borderRadius: 16, padding: 6, borderWidth: 2, borderColor: colors.background },
  bibRow: { flexDirection: 'row', gap: 8 },
  bibBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  bibBtnSecundario: {},
  bibBtnText: { color: colors.text, fontWeight: 'bold', fontSize: 12 },

  nombre: { fontSize: 22, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  email: { fontSize: 13, color: colors.textSoft },
  korvaMundiPerfil: { width: '100%', marginTop: -12, marginBottom: spacing.xxl, paddingHorizontal: spacing.xxl, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 11 },
  korvaMundiPerfilIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center' },
  korvaMundiPerfilTitle: { color: colors.textSoft, fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  korvaMundiPerfilMeta: { color: colors.textDim, fontSize: 10, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xxl, width: '100%', paddingHorizontal: spacing.xxl },
  statCard: { flex: 1, backgroundColor: colors.surfaceSoft, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.borderSoft },
  statNumero: { fontSize: 22, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  statLabel: { fontSize: 10, color: colors.textSoft, textAlign: 'center', letterSpacing: 0.5 },
  collapseTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, marginTop: 4, marginBottom: 6, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 12 },
  activitiesHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activitiesLink: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 4 },
  activitiesLinkText: { color: colors.actionBlue, fontSize: 12, fontWeight: '700' },
  activitiesHint: { color: colors.textMuted, fontSize: 11, marginTop: 2, marginBottom: 12 },
  seccion: { width: '100%', paddingHorizontal: 24, marginBottom: 20 },
  seccionTitulo: { fontSize: 17, fontWeight: '900', color: colors.text, marginBottom: spacing.md },
  retoCard: { backgroundColor: colors.surfaceSoft, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.borderSoft },
  retoCardTitulo: { flex: 1, fontSize: 20, fontWeight: '900', color: colors.text },
  retoEyebrow: { color: colors.brandOrangeSoft, fontSize: 9, fontWeight: '900', letterSpacing: 1.8, marginBottom: spacing.sm },
  retoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  retoPctPill: { backgroundColor: colors.backgroundDeep, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  retoMetricRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.lg },
  retoMetric: { color: colors.text, fontSize: 46, lineHeight: 50, fontWeight: '900', letterSpacing: -2 },
  retoMetricUnit: { color: colors.textSoft, fontSize: 14, fontWeight: '800', marginLeft: 5, marginBottom: 6 },
  retoResumen: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  retoVersionResumen: { color: colors.textSoft, fontSize: 11, fontWeight: '600' },
  retoMetaResumen: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  retoMetaResumenText: { color: colors.textMuted, fontSize: 11 },
  retoRutaBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.backgroundDeep, borderWidth: 1, borderColor: colors.borderSoft },
  retoRutaBtnText: { flex: 1, color: colors.textSoft, fontSize: 12, fontWeight: '800' },
  retoDetailsToggle: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  retoDetailsLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  retoSettings: { backgroundColor: colors.backgroundDeep, borderRadius: 14, padding: 12, marginBottom: 8 },
  retoActions: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderColor: colors.borderSoft, paddingTop: 4 },
  secondaryActionText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  retoActionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  challengeAction: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  retoProgressWrapper: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  retoProgressBar: { width: '100%', height: 3, backgroundColor: colors.borderSoft, borderRadius: 3, marginBottom: spacing.lg, overflow: 'hidden' },
  retoProgressFill: { height: 3, backgroundColor: colors.brandOrange, borderRadius: 3 },
  retoProgressPct: { fontSize: 11, fontWeight: '900', color: colors.brandOrange },
  retoKm: { fontSize: 12, color: colors.textMuted, marginTop: -4, marginBottom: spacing.md },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActivo: { width: 18, backgroundColor: colors.brandOrange },
  modalidadLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5, color: colors.textSoft, marginBottom: spacing.sm },
  modalidadBtns: { flexDirection: 'row', gap: 10 },
  modalidadBtn: { flex: 1, backgroundColor: colors.surfaceSoft, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.borderSoft },
  modalidadBtnActivo: { borderColor: colors.brandOrange, backgroundColor: colors.surfaceRaised },
  modalidadBtnText: { color: colors.textMuted, fontWeight: 'bold', fontSize: 13 },
  modalidadBtnTextActivo: { color: colors.text },
  metaSeparador: { height: 1, backgroundColor: colors.borderSoft, marginVertical: spacing.lg },
  metaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  metaTitulo: { fontSize: 13, fontWeight: 'bold', color: colors.text },
  metaEditarBtn: { color: colors.actionBlue, fontWeight: '700', fontSize: 12, paddingVertical: 10 },
  metaInputRow: { flexDirection: 'row', gap: 10 },
  metaInput: { flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12, color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border },
  metaGuardarBtn: { backgroundColor: colors.brandOrange, borderRadius: 10, padding: 12, alignItems: 'center', justifyContent: 'center' },
  metaGuardarBtnText: { color: colors.text, fontWeight: 'bold', fontSize: 14 },
  metaInfo: { backgroundColor: colors.surfaceSoft, borderRadius: radius.md, padding: spacing.md },
  metaFechaText: { fontSize: 14, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  metaDias: { fontSize: 13, color: colors.brandOrange, fontWeight: 'bold', marginBottom: 4 },
  metaRitmo: { fontSize: 12, color: colors.textSoft },
  metaVacio: { fontSize: 11, lineHeight: 17, color: colors.textMuted, marginTop: 6 },
  nivelCard: { backgroundColor: colors.surfaceSoft, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  nivelEmoji: { fontSize: 36 },
  nivelInfo: { flex: 1 },
  nivelNombre: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  nivelSiguiente: { fontSize: 12, color: colors.textSoft },
  logroCategoria: { marginBottom: 18 },
  logroCatTitulo: { fontSize: 10, fontWeight: 'bold', color: colors.textMuted, letterSpacing: 1.5, marginBottom: 10 },
  logroCard: { backgroundColor: colors.surfaceSoft, borderRadius: 12, padding: 12, alignItems: 'center', minWidth: 72, marginRight: 8 },
  logroEmoji: { fontSize: 22, marginBottom: 4 },
  logroNombre: { fontSize: 9, color: colors.textSoft, textAlign: 'center' },
  logroBloqueado: { backgroundColor: colors.background, borderRadius: 12, padding: 12, alignItems: 'center', minWidth: 72, marginRight: 8, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  logroBloqueadoEmoji: { fontSize: 22, marginBottom: 4, opacity: 0.4 },
  logroBloqueadoNombre: { fontSize: 9, color: colors.border, textAlign: 'center' },
  logroProximo: { fontSize: 10, color: colors.textMuted, marginTop: 8, fontStyle: 'italic' },
  actividadRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSoft, borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  actividadEmoji: { fontSize: 22 },
  actividadInfo: { flex: 1 },
  actividadFecha: { fontSize: 13, fontWeight: 'bold', color: colors.text, marginBottom: 2 },
  actividadTipo: { fontSize: 11, color: colors.textSoft },
  actividadKm: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  eliminarBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundDeep, borderRadius: 12 },
  eliminarBtnText: { color: colors.brandOrange, fontWeight: 'bold', fontSize: 12 },
  verTodasBtn: { paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  verTodasText: { color: colors.textSoft, fontSize: 13, fontWeight: 'bold' },
  emptyCard: { backgroundColor: colors.surfaceStrong, borderRadius: 16, padding: 24, alignItems: 'center' },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyText: { fontSize: 15, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  emptySubtext: { fontSize: 12, color: colors.textSoft, textAlign: 'center' },
  direccionCard: { backgroundColor: colors.surfaceSoft, borderRadius: 16, padding: 20 },
  direccionNombre: { fontSize: 16, fontWeight: 'bold', color: colors.text, marginBottom: 10 },
  direccionLinea: { fontSize: 13, color: colors.textSoft, marginBottom: 5 },
  direccionTel: { fontSize: 13, color: colors.actionBlueStrong, marginTop: 4, marginBottom: 4 },
  editarBtn: { marginTop: 14, borderWidth: 1, borderColor: colors.actionBlueStrong, borderRadius: 10, padding: 10, alignItems: 'center' },
  editarBtnText: { color: colors.actionBlueStrong, fontSize: 13, fontWeight: 'bold' },
  formCard: { backgroundColor: colors.surfaceStrong, borderRadius: 16, padding: 20 },
  formLabel: { fontSize: 12, color: colors.textSoft, marginBottom: 6, marginTop: 12 },
  opcionalTexto: { fontSize: 11, color: colors.textMuted, fontWeight: 'normal' },
  sugerenciasBox: { backgroundColor: colors.background, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: 'hidden' },
  sugerenciaItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.surfaceStrong },
  sugerenciaTexto: { color: colors.text, fontSize: 13 },
  direccionConfirmadaBox: { backgroundColor: '#0a2a1a', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12 },
  direccionConfirmadaTexto: { color: colors.success, fontSize: 12, fontWeight: 'bold' },
  input: { backgroundColor: colors.background, borderRadius: 10, borderWidth: 1, borderColor: '#2a3a4a', color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  formBotones: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelarBtn: { flex: 1, borderWidth: 1, borderColor: '#2a3a4a', borderRadius: 10, padding: 12, alignItems: 'center' },
  cancelarBtnText: { color: colors.textMuted, fontWeight: 'bold', fontSize: 14 },
  guardarBtn: { flex: 1, backgroundColor: colors.actionBlueStrong, borderRadius: 10, padding: 12, alignItems: 'center' },
  guardarBtnText: { color: colors.text, fontWeight: 'bold', fontSize: 14 },
  stravaProximoCard: { backgroundColor: colors.surfaceStrong, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
  stravaProximoTitulo: { fontSize: 14, fontWeight: 'bold', color: colors.textMuted, marginBottom: 6 },
  stravaProximoDesc: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  stravaButton: { backgroundColor: '#FC4C02', paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 12 },
  stravaButtonText: { color: colors.text, fontWeight: 'bold', fontSize: 15 },
  stravaConectadoCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surfaceSoft, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, marginBottom: 8, borderWidth: 1, borderColor: '#2a6a2a' },
  stravaConectadoInfo: { flex: 1 },
  stravaConectadoText: { color: colors.success, fontWeight: 'bold', fontSize: 14, marginBottom: 2 },
  stravaConectadoDesc: { fontSize: 11, color: colors.textSoft },
  stravaReconectarText: { color: colors.textMuted, fontSize: 13 },
  stravaInstructivoBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  stravaInstructivoBtnText: { color: colors.textSoft, fontSize: 13 },
  eliminarCuentaBtn: { alignSelf: 'stretch', marginTop: 8, marginHorizontal: 24, paddingVertical: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#FF3B30', marginBottom: 8 },
  eliminarCuentaBtnText: { color: '#FF3B30', fontSize: 14, fontWeight: '600' },
  cerrarButton: { borderWidth: 1, borderColor: '#2a3a4a', paddingVertical: 14, borderRadius: 12, alignSelf: 'stretch', alignItems: 'center', paddingHorizontal: 24, marginHorizontal: 24 },
  cerrarButtonText: { color: colors.textMuted, fontWeight: 'bold', fontSize: 15 },
  perfilDeporteCard: { backgroundColor: colors.surfaceStrong, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.actionBlueStrong },
  perfilDeporteTexto: { fontSize: 15, fontWeight: 'bold', color: colors.text },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.surfaceStrong, borderRadius: 24, padding: 28, width: '100%', borderWidth: 1, borderColor: colors.brandOrange },
  modalEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  modalTitulo: { fontSize: 22, fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: 6 },
  modalSubtitulo: { fontSize: 13, color: colors.textSoft, textAlign: 'center', marginBottom: 24 },
  modalPaso: { flexDirection: 'row', gap: 14, marginBottom: 18, alignItems: 'flex-start' },
  modalPasoEmoji: { fontSize: 24, width: 32 },
  modalPasoInfo: { flex: 1 },
  modalPasoTitulo: { fontSize: 14, fontWeight: 'bold', color: colors.text, marginBottom: 3 },
  modalPasoDesc: { fontSize: 12, color: colors.textSoft, lineHeight: 18 },
  modalBtn: { backgroundColor: colors.brandOrange, paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  modalBtnText: { color: colors.text, fontWeight: 'bold', fontSize: 15 },
  confirmInfoBox: { backgroundColor: colors.background, borderRadius: 14, padding: 16, marginBottom: 16, gap: 12 },
  confirmInfoTexto: { fontSize: 13, color: colors.textSoft, lineHeight: 20 },
  insigniaCategoria: { marginBottom: 16 },
  insigniaCatTitulo: { fontSize: 12, fontWeight: 'bold', color: colors.textSoft, letterSpacing: 1, marginBottom: 10 },
  insigniaProximo: { fontSize: 11, color: colors.textMuted, marginTop: 8, fontStyle: 'italic' },
  insigniasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  insigniaCard: { backgroundColor: colors.surfaceStrong, borderRadius: 12, padding: 14, alignItems: 'center', minWidth: 80, marginRight: 8 },
  insigniaEmoji: { fontSize: 28, marginBottom: 6 },
  insigniaNombre: { fontSize: 11, color: colors.textSoft, textAlign: 'center' },
});
