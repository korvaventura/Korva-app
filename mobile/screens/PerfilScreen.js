import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, TextInput, Alert, ActivityIndicator, Modal, Dimensions } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - 48; // padding 24 cada lado

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
  const [usuario, setUsuario] = useState(null);
  const [stats, setStats] = useState(null);
  const [userId, setUserId] = useState(null);
  const [nivel, setNivel] = useState(null);
  const [insignias, setInsignias] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [mostrarTodasActividades, setMostrarTodasActividades] = useState(false);
  const [editandoDireccion, setEditandoDireccion] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [inscripcionesActivas, setInscripcionesActivas] = useState([]);
  const [retoIndex, setRetoIndex] = useState(0);
  const [cambiandoModalidad, setCambiandoModalidad] = useState(false);
  const [metaFecha, setMetaFecha] = useState({});
  const [editandoMeta, setEditandoMeta] = useState({});
  const [inputMeta, setInputMeta] = useState({});
  const [guardandoMeta, setGuardandoMeta] = useState({});
  const [modalStravaVisible, setModalStravaVisible] = useState(false);
  const [modalStravaProximamente, setModalStravaProximamente] = useState(false);
  const [stravaHabilitado, setStravaHabilitado] = useState(false);
  const [formDireccion, setFormDireccion] = useState({
    nombre: '', direccion: '', ciudad: '', codigo_postal: '', pais: '', telefono: '',
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setUserId(session.user.id);
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
      setUsuario(data.usuario);
      setStats(data.stats);
      setNivel(data.nivel);
      setInsignias(data.insignias || []);
      // Traer strava_habilitado directamente de Supabase
      const { data: userData } = await supabase
        .from('users')
        .select('strava_habilitado')
        .eq('id', userId)
        .single();
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
        .select('id, modalidad, challenge_id, meta_fecha, km_completed, challenges(title, modalidades)')
        .eq('user_id', userId)
        .eq('status', 'active');
      if (!error && data) {
        setInscripcionesActivas(data);
        // Inicializar metaFecha para cada reto
        const metas = {};
        data.forEach(d => { if (d.meta_fecha) metas[d.challenge_id] = d.meta_fecha; });
        setMetaFecha(metas);
      }
    } catch (error) {}
  };

  const cambiarModalidad = async (inscripcion, nuevaModalidad) => {
    if (nuevaModalidad === inscripcion.modalidad) return;
    Alert.alert('Cambiar modalidad', `¿Querés cambiar a ${nuevaModalidad === 'run' ? 'Running 🏃' : 'Ciclismo 🚴'}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: async () => {
          setCambiandoModalidad(true);
          try {
            await fetch(`${BACKEND_URL}/usuarios/modalidad`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: userId, challenge_id: inscripcion.challenge_id, modalidad: nuevaModalidad })
            });
            setInscripcionesActivas(prev => prev.map(i =>
              i.challenge_id === inscripcion.challenge_id ? { ...i, modalidad: nuevaModalidad } : i
            ));
            Alert.alert('✅ Modalidad actualizada');
          } catch (error) {
            Alert.alert('Error', 'No se pudo cambiar la modalidad');
          } finally { setCambiandoModalidad(false); }
        }
      }
    ]);
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
    const fecha = new Date(`${partes[2]}-${partes[1]}-${partes[0]}`);
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
    setFormDireccion({
      nombre: d?.nombre || '', direccion: d?.direccion || '', ciudad: d?.ciudad || '',
      codigo_postal: d?.codigo_postal || '', pais: d?.pais || '', telefono: d?.telefono || '',
    });
    setEditandoDireccion(true);
  };

  const guardarDireccion = async () => {
    const { nombre, direccion, ciudad, pais } = formDireccion;
    if (!nombre || !direccion || !ciudad || !pais) {
      Alert.alert('Faltan datos', 'Por favor completá nombre, dirección, ciudad y país.');
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`${BACKEND_URL}/usuarios/direccion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, shipping_address: formDireccion }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.detalle);
      setUsuario(prev => ({ ...prev, shipping_address: formDireccion }));
      setEditandoDireccion(false);
      Alert.alert('✅ Dirección guardada', 'Tu dirección de envío fue actualizada.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar la dirección. Intentá de nuevo.');
    } finally { setGuardando(false); }
  };

  const conectarStrava = async () => {
    if (stravaHabilitado) {
      conectarStravaReal();
    } else {
      setModalStravaProximamente(true);
    }
  };

  const conectarStravaReal = async () => {
    const result = await WebBrowser.openAuthSessionAsync(
      `${BACKEND_URL}/strava/auth`,
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

  const formatearFechaCorta = (fecha) => {
    if (!fecha) return '';
    return new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const deporteEmoji = (tipo) => {
    if (tipo === 'run') return '🏃';
    if (tipo === 'ride') return '🚴';
    return '🏅';
  };

  const actividadesVisibles = mostrarTodasActividades ? actividades : actividades.slice(0, 1);
  const stravaConectado = !!usuario?.strava_token;
  const direccion = usuario?.shipping_address;
  const inicial = usuario?.name?.charAt(0)?.toUpperCase() || 'K';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      {/* Modal Próximamente Strava */}
      <Modal visible={modalStravaProximamente} transparent animationType="fade" onRequestClose={() => setModalStravaProximamente(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🔗</Text>
            <Text style={styles.modalTitulo}>Strava — Próximamente</Text>
            <Text style={styles.modalSubtitulo}>La sincronización automática con Strava estará disponible en los próximos días.</Text>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>📝</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Por ahora usá el registro manual</Text>
                <Text style={styles.modalPasoDesc}>Desde la pestaña "Registrar" podés cargar tus km en segundos. Es igual de fácil y tus km se suman igual.</Text>
              </View>
            </View>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>📲</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Te avisamos cuando esté listo</Text>
                <Text style={styles.modalPasoDesc}>Cuando la integración esté disponible para vos, vas a ver el botón activo acá.</Text>
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
              <Text style={styles.modalPasoEmoji}>📱</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Descargá Strava</Text>
                <Text style={styles.modalPasoDesc}>Si no lo tenés, bajalo de la App Store o Google Play</Text>
              </View>
            </View>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>🏃</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Salí a correr y registrá tu actividad</Text>
                <Text style={styles.modalPasoDesc}>Usá Strava normalmente para trackear tu entrenamiento</Text>
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

      {/* Hero */}
      <View style={styles.heroBg}>
        <View style={styles.avatarWrapper}>
          {usuario?.avatar_url ? (
            <Image source={{ uri: usuario.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarLetra}>{inicial}</Text>
            </View>
          )}
        </View>
        <Text style={styles.nombre}>{usuario?.name || 'Cargando...'}</Text>
        <Text style={styles.email}>{usuario?.email}</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}><Text style={styles.statNumero}>{stats?.total_actividades || 0}</Text><Text style={styles.statLabel}>Actividades</Text></View>
        <View style={styles.statCard}><Text style={styles.statNumero}>{stats?.total_km || 0}</Text><Text style={styles.statLabel}>km totales</Text></View>
        <View style={styles.statCard}><Text style={styles.statNumero}>{stats?.medallas || 0}</Text><Text style={styles.statLabel}>Medallas</Text></View>
      </View>

      {stats && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}><Text style={styles.statNumero}>🔥 {stats.racha_actual || 0}</Text><Text style={styles.statLabel}>Racha sem.</Text></View>
          <View style={styles.statCard}><Text style={styles.statNumero}>{stats.mejor_semana_km || 0}</Text><Text style={styles.statLabel}>Mejor semana</Text></View>
          <View style={styles.statCard}><Text style={styles.statNumero}>{stats.promedio_semanal_km || 0}</Text><Text style={styles.statLabel}>km/semana</Text></View>
        </View>
      )}

      {stats?.perfil_deporte && (
        <View style={styles.seccion}>
          <View style={styles.perfilDeporteCard}>
            <Text style={styles.perfilDeporteTexto}>{stats.perfil_deporte}</Text>
          </View>
        </View>
      )}

      {/* Retos activos — deslizables */}
      {inscripcionesActivas.length > 0 && (
        <View style={{ width: '100%', marginBottom: 20 }}>
          <Text style={[styles.seccionTitulo, { paddingHorizontal: 24 }]}>🏅 Mis retos activos</Text>

          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={e => setRetoIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
          >
            {inscripcionesActivas.map((inscripcion, idx) => {
              const cId = inscripcion.challenge_id;
              const modalidades = inscripcion.challenges?.modalidades || [];
              const modalidadData = modalidades.find(m => m.tipo === inscripcion.modalidad);
              const distanciaTotal = modalidadData?.distancia_km || 0;
              const kmCompletados = inscripcion.km_completed || 0;
              const pct = distanciaTotal > 0 ? Math.min((kmCompletados / distanciaTotal) * 100, 100) : 0;
              const mFecha = metaFecha[cId];
              const factorDescanso = inscripcion.modalidad === 'run' ? 0.6 : 0.75;
              const sesionesporSemana = inscripcion.modalidad === 'run' ? 4 : 5;

              return (
                <View key={cId} style={{ width: SCREEN_WIDTH, paddingHorizontal: 24 }}>
                  <View style={styles.retoCard}>
                    <Text style={styles.retoCardTitulo}>{inscripcion.challenges?.title}</Text>

                    {/* Barra de progreso */}
                    <View style={styles.retoProgressWrapper}>
                      <View style={styles.retoProgressBar}>
                        <View style={[styles.retoProgressFill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={styles.retoProgressPct}>{pct.toFixed(0)}%</Text>
                    </View>
                    <Text style={styles.retoKm}>{kmCompletados.toFixed(1)} km de {distanciaTotal} km</Text>

                    {/* Selector modalidad */}
                    <Text style={styles.modalidadLabel}>Modalidad</Text>
                    <View style={styles.modalidadBtns}>
                      {modalidades.map((m, i) => (
                        <TouchableOpacity
                          key={i}
                          style={[styles.modalidadBtn, inscripcion.modalidad === m.tipo && styles.modalidadBtnActivo]}
                          onPress={() => cambiarModalidad(inscripcion, m.tipo)}
                          disabled={cambiandoModalidad}
                        >
                          <Text style={[styles.modalidadBtnText, inscripcion.modalidad === m.tipo && styles.modalidadBtnTextActivo]}>
                            {m.tipo === 'run' ? '🏃 Running' : '🚴 Ciclismo'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Meta personal */}
                    <View style={styles.metaSeparador} />
                    <View style={styles.metaHeader}>
                      <Text style={styles.metaTitulo}>🎯 Meta personal</Text>
                      <TouchableOpacity onPress={() => {
                        setInputMeta(prev => ({ ...prev, [cId]: mFecha ? new Date(mFecha).toLocaleDateString('es-AR') : '' }));
                        setEditandoMeta(prev => ({ ...prev, [cId]: !prev[cId] }));
                      }}>
                        <Text style={styles.metaEditarBtn}>{editandoMeta[cId] ? 'Cancelar' : mFecha ? 'Editar' : '+ Agregar'}</Text>
                      </TouchableOpacity>
                    </View>

                    {editandoMeta[cId] ? (
                      <View style={styles.metaInputRow}>
                        <TextInput
                          style={styles.metaInput}
                          value={inputMeta[cId] || ''}
                          onChangeText={v => setInputMeta(prev => ({ ...prev, [cId]: v }))}
                          placeholder="DD/MM/AAAA"
                          placeholderTextColor="#4a6a8a"
                          keyboardType="numeric"
                        />
                        <TouchableOpacity style={styles.metaGuardarBtn} onPress={() => guardarMeta(inscripcion)} disabled={guardandoMeta[cId]}>
                          {guardandoMeta[cId] ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.metaGuardarBtnText}>Guardar</Text>}
                        </TouchableOpacity>
                      </View>
                    ) : mFecha ? (
                      <View style={styles.metaInfo}>
                        <Text style={styles.metaFechaText}>📅 {formatearFecha(mFecha)}</Text>
                        <Text style={styles.metaDias}>{diasEntre(new Date(), new Date(mFecha))} días restantes</Text>
                        <Text style={styles.metaRitmo}>
                          {(() => {
                            const diasRestantes = diasEntre(new Date(), new Date(mFecha));
                            const sesionesRestantes = Math.floor(diasRestantes * factorDescanso);
                            const kmRestantes = Math.max(0, distanciaTotal - kmCompletados);
                            const kmPorSesion = sesionesRestantes > 0 ? (kmRestantes / sesionesRestantes).toFixed(1) : '—';
                            return `${kmPorSesion}km por sesión · ${sesionesporSemana} veces/semana`;
                          })()}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.metaVacio}>Sin meta definida. Opcional.</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Dots indicadores */}
          {inscripcionesActivas.length > 1 && (
            <View style={styles.dotsRow}>
              {inscripcionesActivas.map((_, i) => (
                <View key={i} style={[styles.dot, i === retoIndex && styles.dotActivo]} />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Nivel */}
      {nivel && (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>⚡ Tu nivel</Text>
          <View style={styles.nivelCard}>
            <Text style={styles.nivelEmoji}>{nivel.emoji}</Text>
            <View style={styles.nivelInfo}>
              <Text style={styles.nivelNombre}>{nivel.nombre}</Text>
              {nivel.siguiente ? <Text style={styles.nivelSiguiente}>Proximo nivel: {nivel.siguiente} retos completados</Text> : <Text style={styles.nivelSiguiente}>Nivel maximo alcanzado 🔥</Text>}
            </View>
          </View>
        </View>
      )}

      {/* Insignias */}
      {insignias.length > 0 && (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>🎖️ Insignias</Text>
          <View style={styles.insigniasGrid}>
            {insignias.map((ins, i) => (
              <View key={i} style={styles.insigniaCard}>
                <Text style={styles.insigniaEmoji}>{ins.emoji}</Text>
                <Text style={styles.insigniaNombre}>{ins.nombre}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Actividades */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>📋 Actividades recientes</Text>
        {actividades.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🏁</Text>
            <Text style={styles.emptyText}>Sin actividades todavia</Text>
            <Text style={styles.emptySubtext}>Registrá tus km desde la pestaña "Registrar"</Text>
          </View>
        ) : (
          <>
            {actividadesVisibles.map((act, i) => (
              <View key={i} style={styles.actividadRow}>
                <Text style={styles.actividadEmoji}>{deporteEmoji(act.sport_type)}</Text>
                <View style={styles.actividadInfo}>
                  <Text style={styles.actividadFecha}>{formatearFechaCorta(act.recorded_at)}</Text>
                  <Text style={styles.actividadTipo}>
                    {act.sport_type === 'run' ? 'Running' : act.sport_type === 'ride' ? 'Ciclismo' : act.sport_type}
                    {act.source === 'manual' ? ' · manual' : ' · Strava'}
                  </Text>
                </View>
                <Text style={styles.actividadKm}>{parseFloat(act.distance_km).toFixed(1)} km</Text>
                <TouchableOpacity onPress={() => eliminarActividad(act.id)} style={styles.eliminarBtn}>
                  <Text style={styles.eliminarBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            {actividades.length > 1 && (
              <TouchableOpacity style={styles.verTodasBtn} onPress={() => setMostrarTodasActividades(!mostrarTodasActividades)}>
                <Text style={styles.verTodasText}>
                  {mostrarTodasActividades ? '▲ Ocultar historial' : `▼ Ver historial completo (${actividades.length - 1} más)`}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Dirección */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>📦 Direccion de envio</Text>
        {editandoDireccion ? (
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Nombre completo *</Text>
            <TextInput style={styles.input} value={formDireccion.nombre} onChangeText={v => setFormDireccion(p => ({ ...p, nombre: v }))} placeholder="Juan Pérez" placeholderTextColor="#4a6a8a" />
            <Text style={styles.formLabel}>Dirección *</Text>
            <TextInput style={styles.input} value={formDireccion.direccion} onChangeText={v => setFormDireccion(p => ({ ...p, direccion: v }))} placeholder="Calle 123, Piso 4" placeholderTextColor="#4a6a8a" />
            <Text style={styles.formLabel}>Ciudad *</Text>
            <TextInput style={styles.input} value={formDireccion.ciudad} onChangeText={v => setFormDireccion(p => ({ ...p, ciudad: v }))} placeholder="Buenos Aires" placeholderTextColor="#4a6a8a" />
            <Text style={styles.formLabel}>Código postal</Text>
            <TextInput style={styles.input} value={formDireccion.codigo_postal} onChangeText={v => setFormDireccion(p => ({ ...p, codigo_postal: v }))} placeholder="1425" placeholderTextColor="#4a6a8a" keyboardType="numeric" />
            <Text style={styles.formLabel}>País *</Text>
            <TextInput style={styles.input} value={formDireccion.pais} onChangeText={v => setFormDireccion(p => ({ ...p, pais: v }))} placeholder="Argentina" placeholderTextColor="#4a6a8a" />
            <Text style={styles.formLabel}>Teléfono (con código de país)</Text>
            <TextInput style={styles.input} value={formDireccion.telefono} onChangeText={v => setFormDireccion(p => ({ ...p, telefono: v }))} placeholder="+54 11 1234 5678" placeholderTextColor="#4a6a8a" keyboardType="phone-pad" />
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
            <Text style={styles.direccionLinea}>🏠 {direccion.direccion}</Text>
            <Text style={styles.direccionLinea}>🏙️ {direccion.ciudad}, {direccion.codigo_postal}</Text>
            <Text style={styles.direccionLinea}>🌍 {direccion.pais}</Text>
            {direccion.telefono && <Text style={styles.direccionTel}>📞 {direccion.telefono}</Text>}
            <TouchableOpacity style={styles.editarBtn} onPress={abrirEdicion}>
              <Text style={styles.editarBtnText}>Editar direccion</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📍</Text>
            <Text style={styles.emptyText}>Sin direccion guardada</Text>
            <Text style={styles.emptySubtext}>Se pedira al completar tu primer reto</Text>
            <TouchableOpacity style={[styles.editarBtn, { marginTop: 16 }]} onPress={abrirEdicion}>
              <Text style={styles.editarBtnText}>Agregar direccion</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Strava */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>🔗 Strava</Text>
        {stravaConectado ? (
          <>
            <View style={styles.stravaConectadoCard}>
              <View style={styles.stravaConectadoInfo}>
                <Text style={styles.stravaConectadoText}>✅ Strava conectado</Text>
                <Text style={styles.stravaConectadoDesc}>Tus actividades se sincronizan automáticamente</Text>
              </View>
              <TouchableOpacity onPress={conectarStravaReal}>
                <Text style={styles.stravaReconectarText}>Reconectar</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.stravaInstructivoBtn} onPress={() => setModalStravaVisible(true)}>
              <Text style={styles.stravaInstructivoBtnText}>📖 ¿Cómo funciona la sincronización?</Text>
            </TouchableOpacity>
          </>
        ) : stravaHabilitado ? (
          <TouchableOpacity style={styles.stravaButton} onPress={conectarStrava}>
            <Text style={styles.stravaButtonText}>🔗 Conectar con Strava</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.stravaProximoCard} onPress={() => setModalStravaProximamente(true)}>
            <Text style={styles.stravaProximoTitulo}>🔗 Strava — Próximamente</Text>
            <Text style={styles.stravaProximoDesc}>La sincronización automática estará disponible pronto. Por ahora registrá tus km manualmente. Tocá para más info.</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.cerrarButton} onPress={cerrarSesion}>
        <Text style={styles.cerrarButtonText}>Cerrar sesion</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { paddingBottom: 40, alignItems: 'center' },
  heroBg: { width: '100%', backgroundColor: '#1E3A5F', alignItems: 'center', paddingTop: 60, paddingBottom: 28, marginBottom: 24 },
  avatarWrapper: { marginBottom: 12 },
  avatar: { width: 70, height: 70, borderRadius: 35, borderWidth: 2, borderColor: '#1E6FD9' },
  avatarPlaceholder: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#1E6FD9', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FC4C02' },
  avatarLetra: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF' },
  nombre: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  email: { fontSize: 13, color: '#A8CFFF' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24, width: '100%', paddingHorizontal: 24 },
  statCard: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 14, padding: 14, alignItems: 'center' },
  statNumero: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  statLabel: { fontSize: 10, color: '#A8CFFF', textAlign: 'center', letterSpacing: 0.5 },
  seccion: { width: '100%', paddingHorizontal: 24, marginBottom: 20 },
  seccionTitulo: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 12 },
  // Retos deslizables
  retoCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 20 },
  retoCardTitulo: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 14 },
  retoProgressWrapper: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  retoProgressBar: { flex: 1, height: 8, backgroundColor: '#0D1B2A', borderRadius: 4 },
  retoProgressFill: { height: 8, backgroundColor: '#FC4C02', borderRadius: 4 },
  retoProgressPct: { fontSize: 14, fontWeight: 'bold', color: '#FC4C02', minWidth: 36 },
  retoKm: { fontSize: 12, color: '#A8CFFF', marginBottom: 16 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2a4a6a' },
  dotActivo: { width: 18, backgroundColor: '#FC4C02' },
  modalidadLabel: { fontSize: 12, color: '#A8CFFF', marginBottom: 10 },
  modalidadBtns: { flexDirection: 'row', gap: 10 },
  modalidadBtn: { flex: 1, backgroundColor: '#0D1B2A', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  modalidadBtnActivo: { borderColor: '#FC4C02' },
  modalidadBtnText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 13 },
  modalidadBtnTextActivo: { color: '#FFFFFF' },
  metaSeparador: { height: 1, backgroundColor: '#2a4a6a', marginVertical: 16 },
  metaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  metaTitulo: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF' },
  metaEditarBtn: { color: '#1E6FD9', fontWeight: 'bold', fontSize: 13 },
  metaInputRow: { flexDirection: 'row', gap: 10 },
  metaInput: { flex: 1, backgroundColor: '#0D1B2A', borderRadius: 10, padding: 12, color: '#FFFFFF', fontSize: 14, borderWidth: 1, borderColor: '#2a4a6a' },
  metaGuardarBtn: { backgroundColor: '#FC4C02', borderRadius: 10, padding: 12, alignItems: 'center', justifyContent: 'center' },
  metaGuardarBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  metaInfo: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 12 },
  metaFechaText: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  metaDias: { fontSize: 13, color: '#FC4C02', fontWeight: 'bold', marginBottom: 4 },
  metaRitmo: { fontSize: 12, color: '#A8CFFF' },
  metaVacio: { fontSize: 13, color: '#4a6a8a', fontStyle: 'italic' },
  nivelCard: { backgroundColor: '#1E3A5F', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  nivelEmoji: { fontSize: 36 },
  nivelInfo: { flex: 1 },
  nivelNombre: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  nivelSiguiente: { fontSize: 12, color: '#A8CFFF' },
  insigniasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  insigniaCard: { backgroundColor: '#1E3A5F', borderRadius: 12, padding: 14, alignItems: 'center', minWidth: 90 },
  insigniaEmoji: { fontSize: 28, marginBottom: 6 },
  insigniaNombre: { fontSize: 11, color: '#A8CFFF', textAlign: 'center' },
  actividadRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E3A5F', borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  actividadEmoji: { fontSize: 22 },
  actividadInfo: { flex: 1 },
  actividadFecha: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  actividadTipo: { fontSize: 11, color: '#A8CFFF' },
  actividadKm: { fontSize: 16, fontWeight: 'bold', color: '#1E6FD9' },
  eliminarBtn: { padding: 6, backgroundColor: '#2a1a1a', borderRadius: 8 },
  eliminarBtnText: { color: '#FC4C02', fontWeight: 'bold', fontSize: 12 },
  verTodasBtn: { paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2a4a6a', borderRadius: 12 },
  verTodasText: { color: '#A8CFFF', fontSize: 13, fontWeight: 'bold' },
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 24, alignItems: 'center' },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyText: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  emptySubtext: { fontSize: 12, color: '#A8CFFF', textAlign: 'center' },
  direccionCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 20 },
  direccionNombre: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 10 },
  direccionLinea: { fontSize: 13, color: '#A8CFFF', marginBottom: 5 },
  direccionTel: { fontSize: 13, color: '#1E6FD9', marginTop: 4, marginBottom: 4 },
  editarBtn: { marginTop: 14, borderWidth: 1, borderColor: '#1E6FD9', borderRadius: 10, padding: 10, alignItems: 'center' },
  editarBtnText: { color: '#1E6FD9', fontSize: 13, fontWeight: 'bold' },
  formCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 20 },
  formLabel: { fontSize: 12, color: '#A8CFFF', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#0D1B2A', borderRadius: 10, borderWidth: 1, borderColor: '#2a3a4a', color: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  formBotones: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelarBtn: { flex: 1, borderWidth: 1, borderColor: '#2a3a4a', borderRadius: 10, padding: 12, alignItems: 'center' },
  cancelarBtnText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 14 },
  guardarBtn: { flex: 1, backgroundColor: '#1E6FD9', borderRadius: 10, padding: 12, alignItems: 'center' },
  guardarBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  stravaProximoCard: { backgroundColor: '#1E3A5F', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#2a4a6a' },
  stravaProximoTitulo: { fontSize: 14, fontWeight: 'bold', color: '#4a6a8a', marginBottom: 6 },
  stravaProximoDesc: { fontSize: 12, color: '#4a6a8a', lineHeight: 18 },
  stravaButton: { backgroundColor: '#FC4C02', paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 12 },
  stravaButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  stravaConectadoCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E3A5F', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, marginBottom: 8, borderWidth: 1, borderColor: '#2a6a2a' },
  stravaConectadoInfo: { flex: 1 },
  stravaConectadoText: { color: '#4CAF50', fontWeight: 'bold', fontSize: 14, marginBottom: 2 },
  stravaConectadoDesc: { fontSize: 11, color: '#A8CFFF' },
  stravaReconectarText: { color: '#4a6a8a', fontSize: 13 },
  stravaInstructivoBtn: { borderWidth: 1, borderColor: '#2a4a6a', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  stravaInstructivoBtnText: { color: '#A8CFFF', fontSize: 13 },
  cerrarButton: { borderWidth: 1, borderColor: '#2a3a4a', paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center', paddingHorizontal: 24, marginHorizontal: 24 },
  cerrarButtonText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 15 },
  perfilDeporteCard: { backgroundColor: '#1E3A5F', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#1E6FD9' },
  perfilDeporteTexto: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: '#1E3A5F', borderRadius: 24, padding: 28, width: '100%', borderWidth: 1, borderColor: '#FC4C02' },
  modalEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  modalTitulo: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center', marginBottom: 6 },
  modalSubtitulo: { fontSize: 13, color: '#A8CFFF', textAlign: 'center', marginBottom: 24 },
  modalPaso: { flexDirection: 'row', gap: 14, marginBottom: 18, alignItems: 'flex-start' },
  modalPasoEmoji: { fontSize: 24, width: 32 },
  modalPasoInfo: { flex: 1 },
  modalPasoTitulo: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 3 },
  modalPasoDesc: { fontSize: 12, color: '#A8CFFF', lineHeight: 18 },
  modalBtn: { backgroundColor: '#FC4C02', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  modalBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
});