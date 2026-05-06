import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Clipboard, Alert } from 'react-native';
import { useState, useEffect } from 'react';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

export default function AdminScreen() {
  const [challenges, setChallenges] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [tracking, setTracking] = useState({});
  const [mensaje, setMensaje] = useState('');
  const [filtro, setFiltro] = useState('pendientes');
  const [vista, setVista] = useState('envios'); // 'envios' o 'crear'

  // Form nuevo reto
  const [nuevoReto, setNuevoReto] = useState({
    title: '',
    description: '',
    price_usd: '',
    medal_image_url: '',
    modalidades: [
      { tipo: 'run', label: 'Running', distancia_km: '' },
    ],
  });
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    cargarChallenges();
  }, []);

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
    if (!d) {
      Alert.alert('Sin dirección', 'Este usuario no tiene dirección guardada.');
      return;
    }
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
    const dias = Math.floor((Date.now() - new Date(completedAt).getTime()) / (1000 * 60 * 60 * 24));
    return dias;
  };

  const agregarModalidad = () => {
    const tipos = nuevoReto.modalidades.map(m => m.tipo);
    const siguiente = !tipos.includes('run') ? 'run' : !tipos.includes('ride') ? 'ride' : null;
    if (!siguiente) {
      Alert.alert('Máximo 2 modalidades', 'Ya tenés Running y Ciclismo.');
      return;
    }
    setNuevoReto(prev => ({
      ...prev,
      modalidades: [...prev.modalidades, { tipo: siguiente, label: siguiente === 'run' ? 'Running' : 'Ciclismo', distancia_km: '' }]
    }));
  };

  const quitarModalidad = (index) => {
    if (nuevoReto.modalidades.length === 1) {
      Alert.alert('Mínimo 1 modalidad');
      return;
    }
    setNuevoReto(prev => ({
      ...prev,
      modalidades: prev.modalidades.filter((_, i) => i !== index)
    }));
  };

  const actualizarModalidad = (index, campo, valor) => {
    setNuevoReto(prev => {
      const mods = [...prev.modalidades];
      mods[index] = { ...mods[index], [campo]: valor };
      return { ...prev, modalidades: mods };
    });
  };

  const crearReto = async () => {
    const { title, description, price_usd, medal_image_url, modalidades } = nuevoReto;
    if (!title || !description || !price_usd || modalidades.some(m => !m.distancia_km)) {
      Alert.alert('Faltan datos', 'Completá título, descripción, precio y distancias.');
      return;
    }
    setCreando(true);
    try {
      const modalidadesFormateadas = modalidades.map(m => ({
        tipo: m.tipo,
        label: m.label,
        distancia_km: parseFloat(m.distancia_km)
      }));
      const res = await fetch(`${BACKEND_URL}/admin/challenges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          price_usd: parseFloat(price_usd),
          medal_image_url,
          modalidades: modalidadesFormateadas,
          sport_type: modalidades.length > 1 ? 'multi' : modalidades[0].tipo,
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.detalle);
      Alert.alert('🎉 Reto creado', `"${title}" fue creado exitosamente.`);
      setNuevoReto({
        title: '',
        description: '',
        price_usd: '',
        medal_image_url: '',
        modalidades: [{ tipo: 'run', label: 'Running', distancia_km: '' }],
      });
      setVista('envios');
    } catch (error) {
      Alert.alert('Error', 'No se pudo crear el reto. Intentá de nuevo.');
    } finally {
      setCreando(false);
    }
  };

  const renderDireccion = (direccion) => {
    if (!direccion) return (
      <View style={styles.sinDireccionBox}>
        <Text style={styles.sinDireccion}>📍 Sin direccion guardada</Text>
      </View>
    );
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

      {/* Toggle vista */}
      <View style={styles.vistaRow}>
        <TouchableOpacity
          style={[styles.vistaBtn, vista === 'envios' && styles.vistaBtnActivo]}
          onPress={() => setVista('envios')}
        >
          <Text style={[styles.vistaText, vista === 'envios' && styles.vistaTextActivo]}>📬 Envíos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.vistaBtn, vista === 'crear' && styles.vistaBtnActivo]}
          onPress={() => setVista('crear')}
        >
          <Text style={[styles.vistaText, vista === 'crear' && styles.vistaTextActivo]}>➕ Nuevo reto</Text>
        </TouchableOpacity>
      </View>

      {vista === 'envios' ? (
        <>
          {/* Resumen */}
          <View style={styles.resumenRow}>
            <View style={[styles.resumenCard, { borderColor: '#FC4C02' }]}>
              <Text style={[styles.resumenNumero, { color: '#FC4C02' }]}>{pendientes.length}</Text>
              <Text style={styles.resumenLabel}>Pendientes</Text>
            </View>
            <View style={[styles.resumenCard, { borderColor: '#4CAF50' }]}>
              <Text style={[styles.resumenNumero, { color: '#4CAF50' }]}>{enviados.length}</Text>
              <Text style={styles.resumenLabel}>Enviadas</Text>
            </View>
            <View style={[styles.resumenCard, { borderColor: '#1E6FD9' }]}>
              <Text style={[styles.resumenNumero, { color: '#1E6FD9' }]}>{challenges.length}</Text>
              <Text style={styles.resumenLabel}>Total</Text>
            </View>
          </View>

          {/* Filtro */}
          <View style={styles.filtroRow}>
            <TouchableOpacity
              style={[styles.filtroBtn, filtro === 'pendientes' && styles.filtroBtnActivo]}
              onPress={() => setFiltro('pendientes')}
            >
              <Text style={[styles.filtroText, filtro === 'pendientes' && styles.filtroTextActivo]}>
                🟡 Pendientes ({pendientes.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filtroBtn, filtro === 'enviadas' && styles.filtroBtnActivo]}
              onPress={() => setFiltro('enviadas')}
            >
              <Text style={[styles.filtroText, filtro === 'enviadas' && styles.filtroTextActivo]}>
                ✅ Enviadas ({enviados.length})
              </Text>
            </TouchableOpacity>
          </View>

          {mensaje ? (
            <View style={styles.mensajeBox}>
              <Text style={styles.mensajeText}>{mensaje}</Text>
            </View>
          ) : null}

          {cargando ? (
            <ActivityIndicator size="large" color="#1E6FD9" style={{ marginTop: 40 }} />
          ) : lista.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>{filtro === 'pendientes' ? '🎉' : '📭'}</Text>
              <Text style={styles.emptyText}>{filtro === 'pendientes' ? 'Todo al dia!' : 'Sin envios todavia'}</Text>
              <Text style={styles.emptySubtext}>{filtro === 'pendientes' ? 'No hay medallas pendientes de envio' : 'Las medallas enviadas aparecen acá'}</Text>
            </View>
          ) : (
            lista.map((item, index) => {
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
                      <View style={styles.kmBadge}>
                        <Text style={styles.kmNumero}>{item.km_completados}</Text>
                        <Text style={styles.kmLabel}>km</Text>
                      </View>
                      {dias !== null && (
                        <Text style={[styles.diasText, urgente && styles.diasUrgente]}>
                          {dias === 0 ? 'hoy' : `hace ${dias}d`}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Text style={styles.email}>{item.email}</Text>
                  {renderDireccion(item.direccion)}
                  <TouchableOpacity style={styles.copiarBtn} onPress={() => copiarDireccion(item)}>
                    <Text style={styles.copiarBtnText}>📋 Copiar datos de envío</Text>
                  </TouchableOpacity>
                  <Text style={styles.label}>NUMERO DE TRACKING</Text>
                  <TextInput
                    style={styles.input}
                    value={tracking[item.id] || ''}
                    onChangeText={(val) => setTracking({ ...tracking, [item.id]: val })}
                    placeholder="Ej: AR123456789"
                    placeholderTextColor="#4a6a8a"
                  />
                  <TouchableOpacity style={styles.button} onPress={() => enviarMedalla(item.id, item.usuario)}>
                    <Text style={styles.buttonText}>📬 Marcar como enviada y notificar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View key={index} style={styles.cardShipped}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deporte}>{item.modalidad === 'run' ? '🏃 RUNNING' : '🚴 CICLISMO'}</Text>
                      <Text style={styles.nombre}>{item.usuario}</Text>
                      <Text style={styles.challenge}>{item.challenge}</Text>
                    </View>
                    <View style={styles.shippedBadge}>
                      <Text style={styles.shippedBadgeText}>✅</Text>
                    </View>
                  </View>
                  <Text style={styles.email}>{item.email}</Text>
                  {renderDireccion(item.direccion)}
                  <TouchableOpacity style={styles.copiarBtn} onPress={() => copiarDireccion(item)}>
                    <Text style={styles.copiarBtnText}>📋 Copiar datos de envío</Text>
                  </TouchableOpacity>
                  {item.tracking_number && (
                    <View style={styles.trackingBox}>
                      <Text style={styles.trackingLabel}>TRACKING</Text>
                      <Text style={styles.trackingNum}>{item.tracking_number}</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </>
      ) : (
        /* Creador de retos */
        <View style={styles.formCard}>
          <Text style={styles.formTitulo}>➕ Nuevo reto</Text>

          <Text style={styles.formLabel}>Título *</Text>
          <TextInput
            style={styles.input}
            value={nuevoReto.title}
            onChangeText={v => setNuevoReto(p => ({ ...p, title: v }))}
            placeholder="Ej: Fin del Mundo"
            placeholderTextColor="#4a6a8a"
          />

          <Text style={styles.formLabel}>Descripción *</Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
            value={nuevoReto.description}
            onChangeText={v => setNuevoReto(p => ({ ...p, description: v }))}
            placeholder="Descripción del reto..."
            placeholderTextColor="#4a6a8a"
            multiline
          />

          <Text style={styles.formLabel}>Precio USD *</Text>
          <TextInput
            style={styles.input}
            value={nuevoReto.price_usd}
            onChangeText={v => setNuevoReto(p => ({ ...p, price_usd: v }))}
            placeholder="Ej: 49"
            placeholderTextColor="#4a6a8a"
            keyboardType="numeric"
          />

          <Text style={styles.formLabel}>URL imagen medalla</Text>
          <TextInput
            style={styles.input}
            value={nuevoReto.medal_image_url}
            onChangeText={v => setNuevoReto(p => ({ ...p, medal_image_url: v }))}
            placeholder="https://..."
            placeholderTextColor="#4a6a8a"
          />

          <Text style={styles.formLabel}>Modalidades *</Text>
          {nuevoReto.modalidades.map((m, i) => (
            <View key={i} style={styles.modalidadRow}>
              <View style={styles.modalidadTipo}>
                <Text style={styles.modalidadTipoText}>{m.tipo === 'run' ? '🏃 Running' : '🚴 Ciclismo'}</Text>
              </View>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={m.distancia_km}
                onChangeText={v => actualizarModalidad(i, 'distancia_km', v)}
                placeholder="km"
                placeholderTextColor="#4a6a8a"
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.quitarBtn} onPress={() => quitarModalidad(i)}>
                <Text style={styles.quitarBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {nuevoReto.modalidades.length < 2 && (
            <TouchableOpacity style={styles.agregarModalidadBtn} onPress={agregarModalidad}>
              <Text style={styles.agregarModalidadText}>+ Agregar modalidad</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.crearBtn} onPress={crearReto} disabled={creando}>
            {creando
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <Text style={styles.crearBtnText}>🎉 Crear reto</Text>
            }
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
  vistaRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  vistaBtn: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  vistaBtnActivo: { borderColor: '#FC4C02' },
  vistaText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 14 },
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
  formCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 20 },
  formTitulo: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 20 },
  formLabel: { fontSize: 12, color: '#A8CFFF', marginBottom: 6, marginTop: 4, fontWeight: 'bold', letterSpacing: 0.5 },
  modalidadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  modalidadTipo: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 12, minWidth: 110 },
  modalidadTipoText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  quitarBtn: { backgroundColor: '#2a1a1a', borderRadius: 10, padding: 12 },
  quitarBtnText: { color: '#FC4C02', fontWeight: 'bold', fontSize: 14 },
  agregarModalidadBtn: { borderWidth: 1, borderColor: '#2a4a6a', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 16 },
  agregarModalidadText: { color: '#1E6FD9', fontWeight: 'bold', fontSize: 14 },
  crearBtn: { backgroundColor: '#FC4C02', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  crearBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
});