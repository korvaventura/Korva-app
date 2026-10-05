import KorvaSheet from '../components/KorvaSheet';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Image, Linking, Alert } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import DetalleScreen from './DetalleScreen';
import { Ionicons } from '@expo/vector-icons';
import { ESTANDAR, distanciaDeVersion, modalidadLegacy } from '../utils/versionDesafio';
import { precioReferencia } from '../utils/precioCatalogo';
import { colors } from '../theme/korvaTheme';
const BACKEND_URL = 'https://korva-app-production.up.railway.app';

export default function CatalogoScreen() {
  const [challenges, setChallenges] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [challengeSeleccionado, setChallengeSeleccionado] = useState(null);
  const [detalleVisible, setDetalleVisible] = useState(false);
  const [modalTienda, setModalTienda] = useState(false);
  const [abriendoTienda, setAbriendoTienda] = useState(false);
  const tiendaPendiente = useRef(false);
  const [misDesafios, setMisDesafios] = useState([]);

  useFocusEffect(useCallback(() => {
    let vigente = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!vigente) return;
      setMisDesafios([]);
      if (!session?.user?.id) return;
      const { data } = await supabase.from('user_challenges').select('challenge_id, status')
        .eq('user_id', session.user.id).in('status', ['active', 'completed', 'shipped', 'cargado', 'pending']);
      if (vigente) setMisDesafios(data || []);
    }).catch(() => {});
    return () => { vigente = false; };
  }, []));

  const cargarChallenges = async () => {
    setCargando(true);
    setError(false);
    try {
      const res = await fetch(`${BACKEND_URL}/challenges`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error('No se pudo consultar el catálogo');
      setChallenges(data);
    } catch { setError(true); }
    finally { setCargando(false); }
  };
  useEffect(() => { cargarChallenges(); }, []);

  const abrirDetalle = (challenge) => { setChallengeSeleccionado(challenge); setDetalleVisible(true); };
  const prepararTienda = (challenge) => { setChallengeSeleccionado(challenge); setModalTienda(true); };
  const cerrarTienda = () => setModalTienda(false);

  // Conserva la preparación pendiente existente. Abrir la tienda no activa el reto.
  const irALaTienda = async (version = ESTANDAR) => {
    if (tiendaPendiente.current) return;
    tiendaPendiente.current = true;
    setAbriendoTienda(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const link = challengeSeleccionado?.link_shopify;
      if (!link || !/^https:\/\//i.test(link)) throw new Error('La tienda de este desafío todavía no está disponible. Contactanos a korvaventura@gmail.com.');
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        const res = await fetch(`${BACKEND_URL}/challenges/inscribir`, {
          method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: session.user.id, challenge_id: challengeSeleccionado.id, version, modalidad: modalidadLegacy(version) }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error('No pudimos preparar tu compra. Intentá nuevamente.');
      }
      await Linking.openURL(link);
      setModalTienda(false);
    } catch (error) { Alert.alert('No pudimos abrir la tienda', error.name === 'AbortError' ? 'La conexión tardó demasiado. Intentá nuevamente.' : error.message); }
    finally { clearTimeout(timeout); tiendaPendiente.current = false; setAbriendoTienda(false); }
  };

  const modalCompra = (
    <KorvaSheet visible={modalTienda} title="Ir a la tienda" onClose={cerrarTienda}>
      <Text style={styles.modalTitle}>{challengeSeleccionado?.title}</Text>
      <Text style={styles.modalCopy}>Incluye el desafío virtual y su medalla física. En la tienda podés consultar el precio final y el envío.</Text>
      <Text style={styles.modalCopy}>Comprá con el mismo correo que usás en Korva para vincular el desafío a tu cuenta.</Text>
      <TouchableOpacity style={[styles.storeButton, { flex: 0, minHeight: 52 }]} onPress={() => irALaTienda()} disabled={abriendoTienda}>
        {abriendoTienda ? <ActivityIndicator color={colors.text} /> : <><Text style={styles.storeText}>Continuar a la tienda</Text><Ionicons name="open-outline" size={17} color={colors.text} /></>}
      </TouchableOpacity>
    </KorvaSheet>
  );

  if (detalleVisible && challengeSeleccionado) return (
    <>
      <DetalleScreen challenge={challengeSeleccionado} onVolver={() => setDetalleVisible(false)}
        onInscribir={() => prepararTienda(challengeSeleccionado)} />
      {modalCompra}
    </>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>TU PRÓXIMA AVENTURA</Text>
        <Text style={styles.title}>Catálogo</Text>
        <Text style={styles.subtitle}>Elegí una ruta. Completala a tu ritmo.</Text>
        <View style={styles.purchaseNote}>
          <Ionicons name="medal-outline" size={20} color={colors.brandOrangeSoft} />
          <Text style={styles.noteText}>Desafíos con medalla física · compra necesaria</Text>
        </View>
        {cargando ? <ActivityIndicator color={colors.actionBlue} style={{ marginVertical: 32 }} /> : error ? (
          <View style={styles.empty}><Text style={styles.noteText}>No pudimos cargar el catálogo.</Text><TouchableOpacity style={styles.detailButton} onPress={cargarChallenges}><Text style={styles.detailText}>Reintentar</Text></TouchableOpacity></View>
        ) : challenges.length === 0 ? <Text style={styles.noteText}>No hay desafíos disponibles por el momento.</Text> : challenges.map((item) => {
          const inscripcion = misDesafios.find((uc) => uc.challenge_id === item.id);
          const precio = precioReferencia(item);
          return (
            <View key={item.id} style={styles.card}>
              <TouchableOpacity onPress={() => abrirDetalle(item)} accessibilityRole="button" accessibilityLabel={`Explorar ${item.title}`}>
                <View style={styles.imageWrapper}>
                  {item.medal_image_url ? <Image source={{ uri: item.medal_image_url }} style={styles.image} resizeMode="contain" /> : <View style={styles.imagePlaceholder}><Ionicons name="medal-outline" size={52} color={colors.textMuted} /></View>}
                  {inscripcion && <View style={styles.badge}><Ionicons name={inscripcion.status === 'pending' ? 'time-outline' : 'checkmark-circle-outline'} size={14} color={colors.brandOrangeSoft} /><Text style={styles.badgeText}>{inscripcion.status === 'pending' ? 'Compra pendiente' : 'En tus desafíos'}</Text></View>}
                  {!inscripcion && item.oferta_texto && <View style={styles.badge}><Text style={styles.badgeText}>{item.oferta_texto}</Text></View>}
                </View>
              </TouchableOpacity>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
                <View style={styles.versions}>{distanciaDeVersion(item, ESTANDAR) > 0 && <Text style={styles.version}>{distanciaDeVersion(item, ESTANDAR)} km · A tu ritmo</Text>}</View>
                <View style={styles.priceRow}><Text style={styles.price}>{precio ? `Referencia · ${precio}` : 'Consultar precio en la tienda'}</Text><Ionicons name="bag-outline" size={16} color={colors.textMuted} /></View>
                <View style={styles.buttons}>
                  <TouchableOpacity style={styles.detailButton} onPress={() => abrirDetalle(item)}><Text style={styles.detailText}>Explorar ruta</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.storeButton} onPress={() => prepararTienda(item)}><Text style={styles.storeText}>Ver en la tienda</Text><Ionicons name="open-outline" size={15} color={colors.text} /></TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
        <Text style={styles.footer}>Precio final y moneda en la tienda. También podés registrar actividades gratis en Modo libre.</Text>
      </ScrollView>
      {modalCompra}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex:1,backgroundColor:colors.background }, container:{padding:24,paddingTop:16,paddingBottom:40},
  eyebrow:{color:colors.brandOrangeSoft,fontSize:9,letterSpacing:2,fontWeight:'800',marginBottom:8}, title:{color:colors.text,fontSize:28,fontWeight:'900'}, subtitle:{color:colors.textSoft,fontSize:13,lineHeight:20,marginTop:6,marginBottom:18},
  purchaseNote:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:24}, noteText:{color:colors.textMuted,fontSize:12,lineHeight:19,flexShrink:1},
  card:{backgroundColor:colors.surfaceSoft,borderWidth:1,borderColor:colors.borderSoft,borderRadius:24,overflow:'hidden',marginBottom:24}, imageWrapper:{position:'relative'},image:{height:220,width:'100%',backgroundColor:'#f5f5f5'},imagePlaceholder:{height:180,alignItems:'center',justifyContent:'center'},
  badge:{position:'absolute',top:12,left:12,right:12,alignSelf:'flex-start',flexDirection:'row',gap:6,alignItems:'center',padding:8,borderRadius:12,backgroundColor:colors.backgroundDeep},badgeText:{color:colors.textSoft,fontSize:11,fontWeight:'700',flexShrink:1},
  cardBody:{padding:18},cardTitle:{color:colors.text,fontSize:22,fontWeight:'800',marginBottom:6},description:{color:colors.textSoft,fontSize:12,lineHeight:19,marginBottom:14},versions:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:16},version:{backgroundColor:colors.backgroundDeep,paddingHorizontal:10,paddingVertical:8,borderRadius:10,color:colors.textSoft,fontSize:11},
  priceRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:14},price:{color:colors.textMuted,fontSize:12,flexShrink:1},buttons:{flexDirection:'row',gap:8},detailButton:{flex:1,minHeight:48,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.borderStrong,borderRadius:14,padding:10},detailText:{color:colors.textSoft,fontSize:12,fontWeight:'700'},
  storeButton:{flex:1,minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,backgroundColor:colors.brandOrange,borderRadius:14,padding:10},storeText:{color:colors.text,fontSize:12,fontWeight:'800',flexShrink:1,textAlign:'center'},
  footer:{color:colors.textMuted,fontSize:11,lineHeight:18,textAlign:'center'},empty:{padding:20,alignItems:'center',gap:16},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.7)',justifyContent:'center',padding:24},modalCard:{backgroundColor:colors.surfaceSoft,borderRadius:24,padding:24},modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},close:{width:44,height:44,alignItems:'center',justifyContent:'center'},modalTitle:{color:colors.text,fontSize:22,fontWeight:'800',marginBottom:12},modalCopy:{color:colors.textSoft,fontSize:13,lineHeight:21,marginBottom:16},modalFootnote:{color:colors.textMuted,fontSize:11,lineHeight:18,marginTop:16},
});
