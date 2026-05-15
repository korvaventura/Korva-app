import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Clipboard, Alert, Image } from 'react-native';
import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { createClient } from '@supabase/supabase-js';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
const SUPABASE_URL = 'https://yvlpnshfqwkpcftotltb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bHBuc2hmcXdrcGNmdG90bHRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU4NTM5NjAsImV4cCI6MjA2MTQyOTk2MH0.HMsNKoJJHLuBtJVoaGGy4bfnPHsW2fSiGPMHHuU0PXk';
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CHECKPOINTS_DEFAULT = [
  { id: 'tolhuin', nombre: 'Tolhuin', kmFisico: 0, emoji: '🏘️', desc: 'El corazón de Tierra del Fuego. Su nombre en lengua Selk\'nam significa exactamente eso: "corazón". Fundada en 1972 con solo 20 casas, hoy tiene el autódromo más austral del mundo.', datoRaro: '🧭 Km 0 de tu aventura. Desde acá hasta Ushuaia, la Ruta Nacional 3 llega a su fin.' },
  { id: 'lago_fagnano', nombre: 'Lago Fagnano', kmFisico: 20, emoji: '💧', desc: 'Este lago está literalmente partido en dos por la Falla de Magallanes: la orilla norte pertenece a la placa Sudamericana y la sur a la placa de Scotia. En 1949 un terremoto de 7.8 grados generó olas sísmicas que crearon nuevas lagunas.', datoRaro: '⚡ Las placas que lo rodean se mueven 5.4mm por año. Estás corriendo sobre una falla activa.' },
  { id: 'paso_garibaldi', nombre: 'Paso Garibaldi', kmFisico: 45, emoji: '⛰️', desc: 'Descubierto en 1935 por Luis Garibaldi Honte, un descendiente Selk\'nam que de niño escuchó a su abuela hablar de un paso secreto que usaban los haush para cruzar la cordillera.', datoRaro: '🚙 El primer vehículo en cruzarlo tardó 10 horas. Vos llegás antes.' },
  { id: 'monte_olivia', nombre: 'Monte Olivia', kmFisico: 80, emoji: '🗻', desc: 'En lengua yamana se llama "Uliwai" — punta de arpón. La cima fue conquistada por primera vez en 1913 por el cura salesiano Alberto María de Agostini, sin clavos de escalada.', datoRaro: '🏔️ 1.326 metros. 35 años después de la primera cumbre, encontraron intacta la bandera argentina.' },
  { id: 'ushuaia', nombre: 'Ushuaia', kmFisico: 103, emoji: '🏁', desc: 'La ciudad más austral del mundo. Fue una colonia penal hasta 1947. El Canal Beagle lleva el nombre del barco en que viajó Charles Darwin cuando desarrolló su teoría de la evolución.', datoRaro: '🌍 Desde acá, el próximo punto habitado hacia el sur es la Antártida.' },
];

export default function AdminScreen() {
  const [challenges, setChallenges] = useState([]);
  const [challengesActivos, setChallengesActivos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [tracking, setTracking] = useState({});
  const [mensaje, setMensaje] = useState('');
  const [filtro, setFiltro] = useState('pendientes');
  const [vista, setVista] = useState('envios');
  const [subiendoFoto, setSubiendoFoto] = useState(null);
  const [subiendoGaleria, setSubiendoGaleria] = useState(false);

  const [nuevoReto, setNuevoReto] = useState({
    title: '', description: '', historia: '', price_usd: '', price_ars: '',
    medal_image_url: '', link_mercadopago: '', link_shopify: '',
    modalidades: [{ tipo: 'run', label: 'Running', distancia_km: '' }],
  });
  const [creando, setCreando] = useState(false);

  const [retoEditando, setRetoEditando] = useState(null);
  const [formEditar, setFormEditar] = useState({
    title: '', description: '', historia: '', price_usd: '', price_ars: '',
    medal_image_url: '', imagen_portada: '', galeria: [],
    link_mercadopago: '', link_shopify: '', oferta_texto: '',
  });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const [challengeMapa, setChallengeMapa] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [guardandoMapa, setGuardandoMapa] = useState(false);

  useEffect(() => {
    cargarChallenges();
    cargarChallengesActivos();
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarChallenges();
      cargarChallengesActivos();
    }, [])
  );

  const cargarChallenges = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/admin/challenges-activos`);
      const data = await res.json();
      setChallenges(data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setCargando(false);
    }
  };

  const cargarChallengesActivos = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/challenges`);
      const data = await res.json();
      setChallengesActivos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const subirFoto = async (carpeta, onSuccess) => {
    try {
      const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permiso.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para subir fotos.');
        return;
      }
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (resultado.canceled) return;
      const uri = resultado.assets[0].uri;
      const fileName = `${carpeta}_${Date.now()}.jpg`;
      const response = await fetch(uri);
      const blob = await response.blob();
      const { error } = await supabaseClient.storage
        .from('korva-images')
        .upload(`${carpeta}/${fileName}`, blob, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      const { data: urlData } = supabaseClient.storage
        .from('korva-images')
        .getPublicUrl(`${carpeta}/${fileName}`);
      onSuccess(urlData.publicUrl);
      Alert.alert('✅ Foto subida', 'La imagen fue cargada correctamente.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo subir la foto. Intentá de nuevo.');
      console.error(error);
    }
  };

  const subirFotoCheckpoint = async (index) => {
    setSubiendoFoto(index);
    await subirFoto('checkpoints', (url) => actualizarCheckpoint(index, 'fotoUrl', url));
    setSubiendoFoto(null);
  };

  const subirImagenMedalla = async () => {
    await subirFoto('medallas', (url) => setFormEditar(p => ({ ...p, medal_image_url: url })));
  };

  const subirImagenPortada = async () => {
    await subirFoto('portadas', (url) => setFormEditar(p => ({ ...p, imagen_portada: url })));
  };

  const subirFotoGaleria = async () => {
    setSubiendoGaleria(true);
    await subirFoto('galeria', (url) => {
      setFormEditar(p => ({ ...p, galeria: [...(p.galeria || []), url] }));
    });
    setSubiendoGaleria(false);
  };

  const eliminarFotoGaleria = (index) => {
    setFormEditar(p => ({ ...p, galeria: p.galeria.filter((_, i) => i !== index) }));
  };

  const abrirEdicion = (challenge) => {
    setRetoEditando(challenge.id);
    setFormEditar({
      title: challenge.title || '',
      description: challenge.description || '',
      historia: challenge.historia || '',
      price_usd: challenge.price_usd?.toString() || '',
      price_ars: challenge.price_ars?.toString() || '',
      medal_image_url: challenge.medal_image_url || '',
      imagen_portada: challenge.imagen_portada || '',
      galeria: challenge.galeria || [],
      link_mercadopago: challenge.link_mercadopago || '',
      link_shopify: challenge.link_shopify || '',
      oferta_texto: challenge.oferta_texto || '',
    });
  };

  const guardarEdicion = async () => {
    if (!formEditar.title || !formEditar.price_usd) {
      Alert.alert('Faltan datos', 'Completá al menos título y precio.');
      return;
    }
    setGuardandoEdicion(true);
    try {
      const res = await fetch(`${BACKEND_URL}/admin/challenges/${retoEditando}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formEditar,
          price_usd: parseFloat(formEditar.price_usd),
          price_ars: formEditar.price_ars ? parseInt(formEditar.price_ars) : null,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.detalle);
      Alert.alert('✅ Reto actualizado', 'Los cambios fueron guardados.');
      setRetoEditando(null);
      cargarChallengesActivos();
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar. Intentá de nuevo.');
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const abrirMapa = (challenge) => {
    setChallengeMapa(challenge);
    const cps = challenge.checkpoints || CHECKPOINTS_DEFAULT;
    setCheckpoints(JSON.parse(JSON.stringify(cps)));
  };

  const actualizarCheckpoint = (index, campo, valor) => {
    setCheckpoints(prev => {
      const nuevo = [...prev];
      nuevo[index] = { ...nuevo[index], [campo]: campo === 'kmFisico' ? parseInt(valor) || 0 : valor };
      return nuevo;
    });
  };

  const guardarMapa = async () => {
    setGuardandoMapa(true);
    try {
      const res = await fetch(`${BACKEND_URL}/admin/challenges/${challengeMapa.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: challengeMapa.title,
          description: challengeMapa.description,
          historia: challengeMapa.historia,
          price_usd: challengeMapa.price_usd,
          medal_image_url: challengeMapa.medal_image_url,
          link_mercadopago: challengeMapa.link_mercadopago,
          link_shopify: challengeMapa.link_shopify,
          oferta_texto: challengeMapa.oferta_texto,
          checkpoints,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.detalle);
      Alert.alert('✅ Mapa guardado', 'Los checkpoints fueron actualizados.');
      setChallengeMapa(null);
      cargarChallengesActivos();
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar el mapa.');
    } finally {
      setGuardandoMapa(false);
    }
  };

  const resetearCheckpoints = () => {
    Alert.alert('Resetear checkpoints', '¿Volvés a los checkpoints por defecto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Resetear', onPress: () => setCheckpoints(JSON.parse(JSON.stringify(CHECKPOINTS_DEFAULT))) }
    ]);
  };

  const enviarMedalla = async (ucId, nombre) => {
    const trackingNum = tracking[ucId] || '';
    try {
      const res = await fetch(`${BACKEND_URL}/admin/medalla-enviada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_challenge_id: ucId, tracking_number: trackingNum })
      });
      await res.json();
      setMensaje(`✅ Medalla enviada a ${nombre}!`);
      cargarChallenges();
      setTimeout(() => setMensaje(''), 3000);
    } catch (error) {
      setMensaje('Error al enviar');
    }
  };

  const copiarDireccion = (item) => {
    const d = item.direccion;
    if (!d) { Alert.alert('Sin dirección', 'Este usuario no tiene dirección guardada.'); return; }
    const texto = [
      `Destinatario: ${d.nombre}`,
      `Dirección: ${d.direccion}`,
      `Ciudad: ${d.ciudad}${d.codigo_postal ? `, ${d.codigo_postal}` : ''}`,
      `País: ${d.pais}`,
      d.telefono ? `Tel: ${d.telefono}` : null,
      `---`,
      `Usuario: ${item.usuario}`,
      `Email: ${item.email}`,
      `Reto: ${item.challenge} (${item.modalidad === 'run' ? 'Running' : 'Ciclismo'})`,
      `Km completados: ${item.km_completados}`,
    ].filter(Boolean).join('\n');
    Clipboard.setString(texto);
    Alert.alert('✅ Copiado', 'Datos de envío copiados al portapapeles.');
  };

  const diasDesdeCompletado = (completedAt) => {
    if (!completedAt) return null;
    return Math.floor((Date.now() - new Date(completedAt).getTime()) / (1000 * 60 * 60 * 24));
  };

  const agregarModalidad = () => {
    const tipos = nuevoReto.modalidades.map(m => m.tipo);
    const siguiente = !tipos.includes('run') ? 'run' : !tipos.includes('ride') ? 'ride' : null;
    if (!siguiente) { Alert.alert('Máximo 2 modalidades', 'Ya tenés Running y Ciclismo.'); return; }
    setNuevoReto(prev => ({ ...prev, modalidades: [...prev.modalidades, { tipo: siguiente, label: siguiente === 'run' ? 'Running' : 'Ciclismo', distancia_km: '' }] }));
  };

  const quitarModalidad = (index) => {
    if (nuevoReto.modalidades.length === 1) { Alert.alert('Mínimo 1 modalidad'); return; }
    setNuevoReto(prev => ({ ...prev, modalidades: prev.modalidades.filter((_, i) => i !== index) }));
  };

  const actualizarModalidad = (index, campo, valor) => {
    setNuevoReto(prev => {
      const mods = [...prev.modalidades];
      mods[index] = { ...mods[index], [campo]: valor };
      return { ...prev, modalidades: mods };
    });
  };

  const crearReto = async () => {
    const { title, description, historia, price_usd, price_ars, medal_image_url, link_mercadopago, link_shopify, modalidades } = nuevoReto;
    if (!title || !description || !price_usd || modalidades.some(m => !m.distancia_km)) {
      Alert.alert('Faltan datos', 'Completá título, descripción, precio y distancias.');
      return;
    }
    setCreando(true);
    try {
      const modalidadesFormateadas = modalidades.map(m => ({ tipo: m.tipo, label: m.label, distancia_km: parseFloat(m.distancia_km) }));
      const res = await fetch(`${BACKEND_URL}/admin/challenges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, historia, price_usd: parseFloat(price_usd), price_ars: price_ars ? parseInt(price_ars) : null, medal_image_url, link_mercadopago, link_shopify, modalidades: modalidadesFormateadas, sport_type: modalidades.length > 1 ? 'multi' : modalidades[0].tipo })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.detalle);
      Alert.alert('🎉 Reto creado', `"${title}" fue creado exitosamente.`);
      setNuevoReto({ title: '', description: '', historia: '', price_usd: '', price_ars: '', medal_image_url: '', link_mercadopago: '', link_shopify: '', modalidades: [{ tipo: 'run', label: 'Running', distancia_km: '' }] });
      setVista('envios');
      cargarChallengesActivos();
    } catch (error) {
      Alert.alert('Error', 'No se pudo crear el reto. Intentá de nuevo.');
    } finally {
      setCreando(false);
    }
  };

  const renderDireccion = (direccion) => {
    if (!direccion) return <View style={styles.sinDireccionBox}><Text style={styles.sinDireccion}>📍 Sin direccion guardada</Text></View>;
    return (
      <View style={styles.direccionBox}>
        <Text style={styles.direccionTitulo}>📦 ENVIAR A</Text>
        <Text style={styles.direccionNombre}>{direccion.nombre}</Text>
        <Text style={styles.direccionLinea}>🏠 {direccion.direccion}</Text>
        <Text style={styles.direccionLinea}>🏙️ {direccion.ciudad}, {direccion.codigo_postal}</Text>
        <Text style={styles.direccionLinea}>🌍 {direccion.pais}</Text>
        {direccion.telefono && <Text style={styles.direccionLinea}>📞 {direccion.telefono}</Text>}
      </View>
    );
  };

  const pendientes = challenges.filter(c => c.status === 'completed');
  const enviados = challenges.filter(c => c.status === 'shipped');
  const lista = filtro === 'pendientes' ? pendientes : enviados;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>⚙️ Admin</Text>

      <View style={styles.vistaRow}>
        <TouchableOpacity style={[styles.vistaBtn, vista === 'envios' && styles.vistaBtnActivo]} onPress={() => setVista('envios')}>
          <Text style={[styles.vistaText, vista === 'envios' && styles.vistaTextActivo]}>📬 Envíos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.vistaBtn, vista === 'editar' && styles.vistaBtnActivo]} onPress={() => setVista('editar')}>
          <Text style={[styles.vistaText, vista === 'editar' && styles.vistaTextActivo]}>✏️ Editar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.vistaBtn, vista === 'mapa' && styles.vistaBtnActivo]} onPress={() => setVista('mapa')}>
          <Text style={[styles.vistaText, vista === 'mapa' && styles.vistaTextActivo]}>🗺️ Mapa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.vistaBtn, vista === 'crear' && styles.vistaBtnActivo]} onPress={() => setVista('crear')}>
          <Text style={[styles.vistaText, vista === 'crear' && styles.vistaTextActivo]}>➕ Nuevo</Text>
        </TouchableOpacity>
      </View>

      {vista === 'envios' && (
        <>
          <View style={styles.resumenRow}>
            <View style={[styles.resumenCard, { borderColor: '#FC4C02' }]}><Text style={[styles.resumenNumero, { color: '#FC4C02' }]}>{pendientes.length}</Text><Text style={styles.resumenLabel}>Pendientes</Text></View>
            <View style={[styles.resumenCard, { borderColor: '#4CAF50' }]}><Text style={[styles.resumenNumero, { color: '#4CAF50' }]}>{enviados.length}</Text><Text style={styles.resumenLabel}>Enviadas</Text></View>
            <View style={[styles.resumenCard, { borderColor: '#1E6FD9' }]}><Text style={[styles.resumenNumero, { color: '#1E6FD9' }]}>{challenges.length}</Text><Text style={styles.resumenLabel}>Total</Text></View>
          </View>

          <View style={styles.filtroRow}>
            <TouchableOpacity style={[styles.filtroBtn, filtro === 'pendientes' && styles.filtroBtnActivo]} onPress={() => setFiltro('pendientes')}>
              <Text style={[styles.filtroText, filtro === 'pendientes' && styles.filtroTextActivo]}>🟡 Pendientes ({pendientes.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filtroBtn, filtro === 'enviadas' && styles.filtroBtnActivo]} onPress={() => setFiltro('enviadas')}>
              <Text style={[styles.filtroText, filtro === 'enviadas' && styles.filtroTextActivo]}>✅ Enviadas ({enviados.length})</Text>
            </TouchableOpacity>
          </View>

          {mensaje ? <View style={styles.mensajeBox}><Text style={styles.mensajeText}>{mensaje}</Text></View> : null}

          {cargando ? <ActivityIndicator size="large" color="#1E6FD9" style={{ marginTop: 40 }} /> :
            lista.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>{filtro === 'pendientes' ? '🎉' : '📭'}</Text>
                <Text style={styles.emptyText}>{filtro === 'pendientes' ? 'Todo al dia!' : 'Sin envios todavia'}</Text>
                <Text style={styles.emptySubtext}>{filtro === 'pendientes' ? 'No hay medallas pendientes' : 'Las medallas enviadas aparecen acá'}</Text>
              </View>
            ) : lista.map((item, index) => {
              const dias = diasDesdeCompletado(item.completed_at);
              const urgente = dias !== null && dias >= 3 && filtro === 'pendientes';
              return filtro === 'pendientes' ? (
                <View key={index} style={[styles.card, urgente && styles.cardUrgente]}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deporte}>{item.modalidad === 'run' ? '🏃 RUNNING' : '🚴 CICLISMO'}</Text>
                      <Text style={styles.nombre}>{item.usuario}</Text>
                      <Text style={styles.challenge}>{item.challenge}</Text>
                    </View>
                    <View style={styles.rightColumn}>
                      <View style={styles.kmBadge}><Text style={styles.kmNumero}>{item.km_completados}</Text><Text style={styles.kmLabel}>km</Text></View>
                      {dias !== null && <Text style={[styles.diasText, urgente && styles.diasUrgente]}>{dias === 0 ? 'hoy' : `hace ${dias}d`}</Text>}
                    </View>
                  </View>
                  <Text style={styles.email}>{item.email}</Text>
                  {renderDireccion(item.direccion)}
                  <TouchableOpacity style={styles.copiarBtn} onPress={() => copiarDireccion(item)}><Text style={styles.copiarBtnText}>📋 Copiar datos de envío</Text></TouchableOpacity>
                  <Text style={styles.label}>NUMERO DE TRACKING</Text>
                  <TextInput style={styles.input} value={tracking[item.id] || ''} onChangeText={(val) => setTracking({ ...tracking, [item.id]: val })} placeholder="Ej: AR123456789" placeholderTextColor="#4a6a8a" />
                  <TouchableOpacity style={styles.button} onPress={() => enviarMedalla(item.id, item.usuario)}><Text style={styles.buttonText}>📬 Marcar como enviada y notificar</Text></TouchableOpacity>
                </View>
              ) : (
                <View key={index} style={styles.cardShipped}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deporte}>{item.modalidad === 'run' ? '🏃 RUNNING' : '🚴 CICLISMO'}</Text>
                      <Text style={styles.nombre}>{item.usuario}</Text>
                      <Text style={styles.challenge}>{item.challenge}</Text>
                    </View>
                    <View style={styles.shippedBadge}><Text style={styles.shippedBadgeText}>✅</Text></View>
                  </View>
                  <Text style={styles.email}>{item.email}</Text>
                  {renderDireccion(item.direccion)}
                  <TouchableOpacity style={styles.copiarBtn} onPress={() => copiarDireccion(item)}><Text style={styles.copiarBtnText}>📋 Copiar datos de envío</Text></TouchableOpacity>
                  {item.tracking_number && <View style={styles.trackingBox}><Text style={styles.trackingLabel}>TRACKING</Text><Text style={styles.trackingNum}>{item.tracking_number}</Text></View>}
                </View>
              );
            })
          }
        </>
      )}

      {vista === 'editar' && (
        <View>
          {challengesActivos.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyEmoji}>📭</Text><Text style={styles.emptyText}>Sin retos activos</Text></View>
          ) : retoEditando ? (
            <View style={styles.formCard}>
              <View style={styles.editarHeader}>
                <Text style={styles.formTitulo}>✏️ Editando reto</Text>
                <TouchableOpacity onPress={() => setRetoEditando(null)}><Text style={styles.cancelarEdicionText}>✕ Cancelar</Text></TouchableOpacity>
              </View>

              <Text style={styles.formLabel}>Título *</Text>
              <TextInput style={styles.input} value={formEditar.title} onChangeText={v => setFormEditar(p => ({ ...p, title: v }))} placeholderTextColor="#4a6a8a" />

              <Text style={styles.formLabel}>Descripción corta *</Text>
              <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} value={formEditar.description} onChangeText={v => setFormEditar(p => ({ ...p, description: v }))} placeholderTextColor="#4a6a8a" multiline />

              <Text style={styles.formLabel}>Historia</Text>
              <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top' }]} value={formEditar.historia} onChangeText={v => setFormEditar(p => ({ ...p, historia: v }))} placeholderTextColor="#4a6a8a" multiline />

              <Text style={styles.formLabel}>Precio USD *</Text>
              <TextInput style={styles.input} value={formEditar.price_usd} onChangeText={v => setFormEditar(p => ({ ...p, price_usd: v }))} placeholderTextColor="#4a6a8a" keyboardType="numeric" />

              <Text style={styles.formLabel}>Precio ARS (pesos argentinos)</Text>
              <TextInput style={styles.input} value={formEditar.price_ars} onChangeText={v => setFormEditar(p => ({ ...p, price_ars: v }))} placeholder="Ej: 49990" placeholderTextColor="#4a6a8a" keyboardType="numeric" />

              <Text style={styles.formLabel}>🏅 Imagen medalla</Text>
              {formEditar.medal_image_url ? (
                <View style={styles.fotoPreviewWrapper}>
                  <Image source={{ uri: formEditar.medal_image_url }} style={styles.fotoPreview} resizeMode="cover" />
                  <TouchableOpacity style={styles.fotoChangeBtn} onPress={subirImagenMedalla}>
                    <Text style={styles.fotoChangeBtnText}>🖼️ Cambiar imagen</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.fotoUploadBtn} onPress={subirImagenMedalla}>
                  <Text style={styles.fotoUploadBtnText}>📷 Subir imagen medalla</Text>
                </TouchableOpacity>
              )}
              <TextInput style={[styles.input, { marginTop: 8 }]} value={formEditar.medal_image_url} onChangeText={v => setFormEditar(p => ({ ...p, medal_image_url: v }))} placeholder="O pegá una URL..." placeholderTextColor="#4a6a8a" />

              <Text style={styles.formLabel}>🖼️ Imagen portada</Text>
              {formEditar.imagen_portada ? (
                <View style={styles.fotoPreviewWrapper}>
                  <Image source={{ uri: formEditar.imagen_portada }} style={styles.fotoPreview} resizeMode="cover" />
                  <TouchableOpacity style={styles.fotoChangeBtn} onPress={subirImagenPortada}>
                    <Text style={styles.fotoChangeBtnText}>🖼️ Cambiar portada</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.fotoUploadBtn} onPress={subirImagenPortada}>
                  <Text style={styles.fotoUploadBtnText}>📷 Subir imagen portada</Text>
                </TouchableOpacity>
              )}
              <TextInput style={[styles.input, { marginTop: 8 }]} value={formEditar.imagen_portada} onChangeText={v => setFormEditar(p => ({ ...p, imagen_portada: v }))} placeholder="O pegá una URL..." placeholderTextColor="#4a6a8a" />

              <Text style={styles.formLabel}>📸 Galería de fotos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {(formEditar.galeria || []).map((url, i) => (
                  <View key={i} style={styles.galeriaAdminItem}>
                    <Image source={{ uri: url }} style={styles.galeriaAdminImg} resizeMode="cover" />
                    <TouchableOpacity style={styles.galeriaEliminarBtn} onPress={() => eliminarFotoGaleria(i)}>
                      <Text style={styles.galeriaEliminarText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.galeriaAgregarBtn} onPress={subirFotoGaleria} disabled={subiendoGaleria}>
                  {subiendoGaleria ? <ActivityIndicator color="#1E6FD9" size="small" /> : <Text style={styles.galeriaAgregarText}>+ Agregar</Text>}
                </TouchableOpacity>
              </ScrollView>

              <Text style={styles.formLabel}>🇦🇷 Link MercadoPago</Text>
              <TextInput style={styles.input} value={formEditar.link_mercadopago} onChangeText={v => setFormEditar(p => ({ ...p, link_mercadopago: v }))} placeholderTextColor="#4a6a8a" />

              <Text style={styles.formLabel}>🌍 Link Shopify</Text>
              <TextInput style={styles.input} value={formEditar.link_shopify} onChangeText={v => setFormEditar(p => ({ ...p, link_shopify: v }))} placeholderTextColor="#4a6a8a" />

              <Text style={styles.formLabel}>🔥 Oferta (dejar vacío para quitar)</Text>
              <TextInput style={styles.input} value={formEditar.oferta_texto} onChangeText={v => setFormEditar(p => ({ ...p, oferta_texto: v }))} placeholder="Ej: 2do reto 50% off" placeholderTextColor="#4a6a8a" />

              <TouchableOpacity style={styles.crearBtn} onPress={guardarEdicion} disabled={guardandoEdicion}>
                {guardandoEdicion ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.crearBtnText}>💾 Guardar cambios</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            challengesActivos.map((c, i) => (
              <View key={i} style={styles.retoCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.retoTitulo}>{c.title}</Text>
                  <Text style={styles.retoPrecio}>USD ${c.price_usd}</Text>
                  {c.oferta_texto && <Text style={styles.retoOferta}>🔥 {c.oferta_texto}</Text>}
                </View>
                <TouchableOpacity style={styles.editarBtn} onPress={() => abrirEdicion(c)}>
                  <Text style={styles.editarBtnText}>✏️ Editar</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}

      {vista === 'mapa' && (
        <View>
          {challengesActivos.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyEmoji}>📭</Text><Text style={styles.emptyText}>Sin retos activos</Text></View>
          ) : challengeMapa ? (
            <View style={styles.formCard}>
              <View style={styles.editarHeader}>
                <Text style={styles.formTitulo}>🗺️ {challengeMapa.title}</Text>
                <TouchableOpacity onPress={() => setChallengeMapa(null)}><Text style={styles.cancelarEdicionText}>✕ Cancelar</Text></TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.resetBtn} onPress={resetearCheckpoints}>
                <Text style={styles.resetBtnText}>↻ Resetear a valores por defecto</Text>
              </TouchableOpacity>
              {checkpoints.map((cp, index) => (
                <View key={cp.id} style={styles.checkpointCard}>
                  <View style={styles.checkpointHeader}>
                    <Text style={styles.checkpointEmoji}>{cp.emoji}</Text>
                    <Text style={styles.checkpointNombre}>{cp.nombre}</Text>
                    <View style={styles.kmBadgeSmall}>
                      <TextInput style={styles.kmInput} value={cp.kmFisico?.toString()} onChangeText={v => actualizarCheckpoint(index, 'kmFisico', v)} keyboardType="numeric" placeholderTextColor="#4a6a8a" />
                      <Text style={styles.kmInputLabel}>km</Text>
                    </View>
                  </View>
                  <Text style={styles.formLabel}>Emoji</Text>
                  <TextInput style={styles.input} value={cp.emoji} onChangeText={v => actualizarCheckpoint(index, 'emoji', v)} placeholderTextColor="#4a6a8a" />
                  <Text style={styles.formLabel}>Nombre</Text>
                  <TextInput style={styles.input} value={cp.nombre} onChangeText={v => actualizarCheckpoint(index, 'nombre', v)} placeholderTextColor="#4a6a8a" />
                  <Text style={styles.formLabel}>Descripción</Text>
                  <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={cp.desc} onChangeText={v => actualizarCheckpoint(index, 'desc', v)} placeholderTextColor="#4a6a8a" multiline />
                  <Text style={styles.formLabel}>Dato curioso</Text>
                  <TextInput style={[styles.input, { height: 60, textAlignVertical: 'top' }]} value={cp.datoRaro} onChangeText={v => actualizarCheckpoint(index, 'datoRaro', v)} placeholderTextColor="#4a6a8a" multiline />
                  <Text style={styles.formLabel}>Foto del lugar</Text>
                  {cp.fotoUrl ? (
                    <View style={styles.fotoPreviewWrapper}>
                      <Image source={{ uri: cp.fotoUrl }} style={styles.fotoPreview} resizeMode="cover" />
                      <TouchableOpacity style={styles.fotoChangeBtn} onPress={() => subirFotoCheckpoint(index)}>
                        <Text style={styles.fotoChangeBtnText}>🖼️ Cambiar foto</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.fotoUploadBtn} onPress={() => subirFotoCheckpoint(index)} disabled={subiendoFoto === index}>
                      {subiendoFoto === index ? <ActivityIndicator color="#1E6FD9" size="small" /> : <Text style={styles.fotoUploadBtnText}>📷 Subir foto desde galería</Text>}
                    </TouchableOpacity>
                  )}
                  <TextInput style={[styles.input, { marginTop: 8 }]} value={cp.fotoUrl || ''} onChangeText={v => actualizarCheckpoint(index, 'fotoUrl', v)} placeholder="O pegá una URL directamente..." placeholderTextColor="#4a6a8a" />
                </View>
              ))}
              <TouchableOpacity style={styles.crearBtn} onPress={guardarMapa} disabled={guardandoMapa}>
                {guardandoMapa ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.crearBtnText}>💾 Guardar mapa</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            challengesActivos.map((c, i) => (
              <View key={i} style={styles.retoCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.retoTitulo}>{c.title}</Text>
                  <Text style={styles.retoPrecio}>{c.checkpoints ? '✅ Mapa configurado' : '⚠️ Usando defaults'}</Text>
                </View>
                <TouchableOpacity style={styles.editarBtn} onPress={() => abrirMapa(c)}>
                  <Text style={styles.editarBtnText}>🗺️ Editar</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}

      {vista === 'crear' && (
        <View style={styles.formCard}>
          <Text style={styles.formTitulo}>➕ Nuevo reto</Text>
          <Text style={styles.formLabel}>Título *</Text>
          <TextInput style={styles.input} value={nuevoReto.title} onChangeText={v => setNuevoReto(p => ({ ...p, title: v }))} placeholder="Ej: Fin del Mundo" placeholderTextColor="#4a6a8a" />
          <Text style={styles.formLabel}>Descripción corta *</Text>
          <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} value={nuevoReto.description} onChangeText={v => setNuevoReto(p => ({ ...p, description: v }))} placeholder="Texto corto..." placeholderTextColor="#4a6a8a" multiline />
          <Text style={styles.formLabel}>Historia</Text>
          <TextInput style={[styles.input, { height: 120, textAlignVertical: 'top' }]} value={nuevoReto.historia} onChangeText={v => setNuevoReto(p => ({ ...p, historia: v }))} placeholder="La historia del reto..." placeholderTextColor="#4a6a8a" multiline />
          <Text style={styles.formLabel}>Precio USD *</Text>
          <TextInput style={styles.input} value={nuevoReto.price_usd} onChangeText={v => setNuevoReto(p => ({ ...p, price_usd: v }))} placeholder="Ej: 49" placeholderTextColor="#4a6a8a" keyboardType="numeric" />
          <Text style={styles.formLabel}>Precio ARS (pesos argentinos)</Text>
          <TextInput style={styles.input} value={nuevoReto.price_ars} onChangeText={v => setNuevoReto(p => ({ ...p, price_ars: v }))} placeholder="Ej: 49990" placeholderTextColor="#4a6a8a" keyboardType="numeric" />
          <Text style={styles.formLabel}>URL imagen medalla</Text>
          <TextInput style={styles.input} value={nuevoReto.medal_image_url} onChangeText={v => setNuevoReto(p => ({ ...p, medal_image_url: v }))} placeholder="https://..." placeholderTextColor="#4a6a8a" />
          <Text style={styles.formLabel}>🇦🇷 Link MercadoPago</Text>
          <TextInput style={styles.input} value={nuevoReto.link_mercadopago} onChangeText={v => setNuevoReto(p => ({ ...p, link_mercadopago: v }))} placeholder="https://mercadopago.com..." placeholderTextColor="#4a6a8a" />
          <Text style={styles.formLabel}>🌍 Link Shopify (internacional)</Text>
          <TextInput style={styles.input} value={nuevoReto.link_shopify} onChangeText={v => setNuevoReto(p => ({ ...p, link_shopify: v }))} placeholder="https://korva.run/checkouts/..." placeholderTextColor="#4a6a8a" />
          <Text style={styles.formLabel}>Modalidades *</Text>
          {nuevoReto.modalidades.map((m, i) => (
            <View key={i} style={styles.modalidadRow}>
              <View style={styles.modalidadTipo}><Text style={styles.modalidadTipoText}>{m.tipo === 'run' ? '🏃 Running' : '🚴 Ciclismo'}</Text></View>
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={m.distancia_km} onChangeText={v => actualizarModalidad(i, 'distancia_km', v)} placeholder="km" placeholderTextColor="#4a6a8a" keyboardType="numeric" />
              <TouchableOpacity style={styles.quitarBtn} onPress={() => quitarModalidad(i)}><Text style={styles.quitarBtnText}>✕</Text></TouchableOpacity>
            </View>
          ))}
          {nuevoReto.modalidades.length < 2 && (
            <TouchableOpacity style={styles.agregarModalidadBtn} onPress={agregarModalidad}>
              <Text style={styles.agregarModalidadText}>+ Agregar modalidad</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.crearBtn} onPress={crearReto} disabled={creando}>
            {creando ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.crearBtnText}>🎉 Crear reto</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  titulo: { fontSize: 26, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 16 },
  vistaRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  vistaBtn: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  vistaBtnActivo: { borderColor: '#FC4C02' },
  vistaText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 11 },
  vistaTextActivo: { color: '#FFFFFF' },
  resumenRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  resumenCard: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1 },
  resumenNumero: { fontSize: 28, fontWeight: 'bold', marginBottom: 2 },
  resumenLabel: { fontSize: 11, color: '#A8CFFF', letterSpacing: 0.5 },
  filtroRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  filtroBtn: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  filtroBtnActivo: { borderColor: '#1E6FD9' },
  filtroText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 13 },
  filtroTextActivo: { color: '#FFFFFF' },
  mensajeBox: { backgroundColor: '#0a2a1a', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#4CAF50' },
  mensajeText: { color: '#4CAF50', fontSize: 14, textAlign: 'center', fontWeight: 'bold' },
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 16 },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyText: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  emptySubtext: { fontSize: 13, color: '#A8CFFF' },
  card: { backgroundColor: '#1E3A5F', borderRadius: 18, padding: 20, marginBottom: 16 },
  cardUrgente: { borderWidth: 1, borderColor: '#FC4C02' },
  cardShipped: { backgroundColor: '#1a2a1a', borderRadius: 18, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#2a4a2a' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  deporte: { fontSize: 11, fontWeight: 'bold', color: '#1E6FD9', letterSpacing: 1, marginBottom: 4 },
  nombre: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  challenge: { fontSize: 13, color: '#A8CFFF' },
  email: { fontSize: 12, color: '#4a6a8a', marginBottom: 14 },
  rightColumn: { alignItems: 'center', gap: 6 },
  kmBadge: { backgroundColor: '#0D1B2A', borderRadius: 12, padding: 10, alignItems: 'center', minWidth: 60 },
  kmNumero: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  kmLabel: { fontSize: 11, color: '#A8CFFF' },
  diasText: { fontSize: 11, color: '#A8CFFF', fontWeight: 'bold' },
  diasUrgente: { color: '#FC4C02' },
  shippedBadge: { backgroundColor: '#0a2a1a', borderRadius: 12, padding: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  shippedBadgeText: { fontSize: 20 },
  sinDireccionBox: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 12, marginBottom: 14 },
  sinDireccion: { fontSize: 13, color: '#4a6a8a', fontStyle: 'italic' },
  direccionBox: { backgroundColor: '#0D1B2A', borderRadius: 12, padding: 14, marginBottom: 12 },
  direccionTitulo: { fontSize: 10, fontWeight: 'bold', color: '#1E6FD9', letterSpacing: 2, marginBottom: 8 },
  direccionNombre: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 6 },
  direccionLinea: { fontSize: 13, color: '#A8CFFF', marginBottom: 4 },
  copiarBtn: { backgroundColor: '#0D1B2A', borderWidth: 1, borderColor: '#2a4a6a', borderRadius: 10, padding: 10, alignItems: 'center', marginBottom: 14 },
  copiarBtnText: { color: '#A8CFFF', fontSize: 13, fontWeight: 'bold' },
  label: { fontSize: 10, fontWeight: 'bold', color: '#4a6a8a', letterSpacing: 2, marginBottom: 8 },
  input: { backgroundColor: '#0D1B2A', borderRadius: 12, padding: 14, color: '#FFFFFF', fontSize: 14, borderWidth: 1, borderColor: '#2a4a6a', marginBottom: 12 },
  button: { backgroundColor: '#FC4C02', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  trackingBox: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 12, marginTop: 8 },
  trackingLabel: { fontSize: 10, fontWeight: 'bold', color: '#4CAF50', letterSpacing: 2, marginBottom: 4 },
  trackingNum: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  retoCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 18, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  retoTitulo: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  retoPrecio: { fontSize: 13, color: '#FC4C02', fontWeight: 'bold' },
  retoOferta: { fontSize: 12, color: '#FFD700', marginTop: 4 },
  editarBtn: { borderWidth: 1, borderColor: '#1E6FD9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  editarBtnText: { color: '#1E6FD9', fontWeight: 'bold', fontSize: 13 },
  formCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 20 },
  formTitulo: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 20 },
  formLabel: { fontSize: 12, color: '#A8CFFF', marginBottom: 6, marginTop: 4, fontWeight: 'bold', letterSpacing: 0.5 },
  editarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  cancelarEdicionText: { color: '#4a6a8a', fontSize: 13, fontWeight: 'bold' },
  modalidadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  modalidadTipo: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 12, minWidth: 110 },
  modalidadTipoText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  quitarBtn: { backgroundColor: '#2a1a1a', borderRadius: 10, padding: 12 },
  quitarBtnText: { color: '#FC4C02', fontWeight: 'bold', fontSize: 14 },
  agregarModalidadBtn: { borderWidth: 1, borderColor: '#2a4a6a', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 16 },
  agregarModalidadText: { color: '#1E6FD9', fontWeight: 'bold', fontSize: 14 },
  crearBtn: { backgroundColor: '#FC4C02', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  crearBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  resetBtn: { borderWidth: 1, borderColor: '#2a4a6a', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 16 },
  resetBtnText: { color: '#4a6a8a', fontSize: 13, fontWeight: 'bold' },
  checkpointCard: { backgroundColor: '#0D1B2A', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#2a4a6a' },
  checkpointHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  checkpointEmoji: { fontSize: 24 },
  checkpointNombre: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', flex: 1 },
  kmBadgeSmall: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E3A5F', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  kmInput: { color: '#FC4C02', fontWeight: 'bold', fontSize: 14, width: 40, textAlign: 'center' },
  kmInputLabel: { color: '#4a6a8a', fontSize: 12, marginLeft: 2 },
  fotoPreviewWrapper: { marginBottom: 8 },
  fotoPreview: { width: '100%', height: 160, borderRadius: 12, marginBottom: 8 },
  fotoChangeBtn: { borderWidth: 1, borderColor: '#2a4a6a', borderRadius: 10, padding: 10, alignItems: 'center' },
  fotoChangeBtnText: { color: '#A8CFFF', fontSize: 13, fontWeight: 'bold' },
  fotoUploadBtn: { backgroundColor: '#0D1B2A', borderWidth: 1, borderColor: '#1E6FD9', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 0 },
  fotoUploadBtnText: { color: '#1E6FD9', fontSize: 13, fontWeight: 'bold' },
  galeriaAdminItem: { width: 100, height: 100, borderRadius: 12, marginRight: 8, position: 'relative' },
  galeriaAdminImg: { width: 100, height: 100, borderRadius: 12 },
  galeriaEliminarBtn: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  galeriaEliminarText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  galeriaAgregarBtn: { width: 100, height: 100, borderRadius: 12, borderWidth: 2, borderColor: '#1E6FD9', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  galeriaAgregarText: { color: '#1E6FD9', fontWeight: 'bold', fontSize: 13 },
});