import { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Share, Alert, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { solicitarGrupo } from '../services/gruposCore';
import { colors } from '../theme/korvaTheme';
import KorvaSheet from './KorvaSheet';

export default function KorvaGroups({ navigation }) {
  const [grupos, setGrupos] = useState([]);
  const [visible, setVisible] = useState(false);
  const [modo, setModo] = useState('inicio');
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const lock = useRef(false);
  const generacion = useRef(0);
  const cargar = useCallback(async () => {
    const turno = ++generacion.current;
    setCargando(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const data = await solicitarGrupo({ session, accion: 'listar' });
      if (turno === generacion.current) setGrupos(data);
    } catch(e) { if (turno === generacion.current) { setGrupos([]); setError(e.message); } }
    finally { if (turno === generacion.current) setCargando(false); }
  }, []);
  useFocusEffect(useCallback(() => { cargar(); return () => { ++generacion.current; }; }, [cargar]));
  const abrir = () => { setModo('inicio'); setVisible(true); cargar(); };
  const ejecutar = async (accion, datos) => {
    if (lock.current) return;
    if (accion === 'crear' && nombre.trim().length < 2) { setError('El nombre debe tener al menos 2 caracteres.'); return; }
    if (accion === 'unirse' && !/^[A-Z0-9]{6}$/.test(codigo.trim())) { setError('Ingresá el código de 6 caracteres que te compartieron.'); return; }
    lock.current = true; setOcupado(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await solicitarGrupo({ session, accion, datos });
      setNombre(''); setCodigo(''); setModo('inicio');
      await cargar();
    } catch(e) { setError(e.message); }
    finally { lock.current = false; setOcupado(false); }
  };
  const tarjetas = grupos.map(g => <View key={g.id} style={styles.card}>
    <View style={styles.row}><Ionicons name="people-outline" size={22} color={colors.brandOrangeSoft}/><Text style={styles.name}>{g.nombre}</Text></View>
    <Text style={styles.label}>Código para invitar</Text><Text style={styles.code}>{g.codigo}</Text>
    <View style={styles.row}>
      <TouchableOpacity style={styles.secondary} onPress={() => Share.share({ message: `Unite a ${g.nombre} en Korva con el código ${g.codigo}. En Perfil, abrí Mis grupos y elegí Unirme con código. https://korva.run` }).catch(() => setError('No pudimos abrir las opciones para compartir.'))}><Text style={styles.link}>Compartir código</Text></TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={() => { setVisible(false); navigation.navigate('Ranking', { grupoId: g.id, tab: 'grupo' }); }}><Text style={styles.link}>Ver comunidad</Text></TouchableOpacity>
    </View>
    <TouchableOpacity style={styles.secondary} disabled={ocupado} onPress={() => Alert.alert('Salir del grupo', `¿Querés salir de ${g.nombre}?`, [{ text: 'Cancelar', style:'cancel' }, { text:'Salir',style:'destructive',onPress:()=>ejecutar('salir',{group_id:g.id}) }])}><Text style={styles.muted}>Salir del grupo</Text></TouchableOpacity>
  </View>);
  return <>
    <View style={styles.row}><Text style={styles.heading}>Mis grupos</Text><TouchableOpacity style={styles.secondary} onPress={abrir}><Text style={styles.link}>Gestionar</Text></TouchableOpacity></View>
    {cargando ? <ActivityIndicator color={colors.actionBlue}/> : error ? <TouchableOpacity style={styles.card} onPress={abrir}><Text style={styles.body}>{error}</Text><Text style={styles.link}>Ver opciones</Text></TouchableOpacity> : grupos.length ? tarjetas : <TouchableOpacity style={styles.card} onPress={abrir}><Text style={styles.name}>Compartí el camino</Text><Text style={styles.body}>Creá un grupo o unite con el código de tus amigos.</Text><Text style={styles.link}>Explorar grupos →</Text></TouchableOpacity>}
    <KorvaSheet visible={visible} title={modo==='crear'?'Crear grupo':modo==='unirse'?'Unirme a un grupo':'Mis grupos'} onClose={()=>setVisible(false)}>
      {modo==='inicio' ? <>
        <Text style={styles.body}>Cada persona sigue su aventura. En Comunidad pueden acompañarse y ver su progreso juntos.</Text>
        {cargando ? <ActivityIndicator color={colors.actionBlue}/> : tarjetas}
        <TouchableOpacity style={styles.primary} disabled={ocupado} onPress={()=>{setModo('crear');setError('');}}><Text style={styles.primaryText}>Crear grupo</Text></TouchableOpacity>
        <TouchableOpacity style={styles.secondary} disabled={ocupado} onPress={()=>{setModo('unirse');setError('');}}><Text style={styles.link}>Unirme con código</Text></TouchableOpacity>
        <Text style={styles.muted}>Hasta 3 grupos por persona · 50 miembros por grupo. Compartís el código y tus amigos lo ingresan desde Perfil.</Text>
      </> : <>
        <Text style={styles.body}>{modo==='crear'?'Elegí un nombre. Al crearlo vas a recibir un código para invitar a tus amigos.':'Ingresá el código que te compartieron.'}</Text>
        <Text style={styles.label}>{modo==='crear'?'Nombre del grupo':'Código de invitación'}</Text>
        <TextInput style={styles.input} value={modo==='crear'?nombre:codigo} onChangeText={modo==='crear'?setNombre:v=>setCodigo(v.toUpperCase().replace(/\s/g,''))} placeholder={modo==='crear'?'Ej. Runners del Parque':'ABC123'} placeholderTextColor={colors.textMuted} maxLength={modo==='crear'?60:6} autoCapitalize={modo==='crear'?'words':'characters'} autoCorrect={false} editable={!ocupado}/>
        <TouchableOpacity style={[styles.primary,ocupado&&{opacity:0.5}]} disabled={ocupado} onPress={()=>ejecutar(modo==='crear'?'crear':'unirse',modo==='crear'?{nombre:nombre.trim()}:{codigo:codigo.trim()})}>{ocupado?<ActivityIndicator color={colors.text}/>:<Text style={styles.primaryText}>{modo==='crear'?'Crear grupo':'Unirme'}</Text>}</TouchableOpacity>
        <TouchableOpacity style={styles.secondary} disabled={ocupado} onPress={()=>{setModo('inicio');setError('');}}><Text style={styles.link}>Volver a mis grupos</Text></TouchableOpacity>
      </>}
      {!!error && <View style={styles.error} accessibilityLiveRegion="polite"><Text style={styles.body}>{error}</Text>{modo==='inicio'&&<TouchableOpacity style={styles.secondary} onPress={cargar}><Text style={styles.link}>Reintentar</Text></TouchableOpacity>}</View>}
    </KorvaSheet>
  </>;
}
const styles=StyleSheet.create({
 row:{flexDirection:'row',alignItems:'center',gap:12},heading:{flex:1,fontSize:19,fontWeight:'800',color:colors.text},
 card:{backgroundColor:colors.surfaceSoft,borderRadius:20,padding:18,borderWidth:1,borderColor:colors.borderSoft,marginBottom:12},
 name:{flex:1,fontSize:17,fontWeight:'700',color:colors.text},body:{color:colors.textSoft,fontSize:14,lineHeight:22,marginBottom:14},
 label:{color:colors.textMuted,fontSize:12,marginTop:12,marginBottom:8},code:{color:colors.text,fontSize:22,fontWeight:'700',letterSpacing:3,marginBottom:12},
 secondary:{minHeight:44,justifyContent:'center',paddingVertical:10},link:{color:colors.actionBlue,fontWeight:'600',fontSize:13},muted:{color:colors.textMuted,fontSize:12,lineHeight:19},
 primary:{backgroundColor:colors.brandOrange,minHeight:50,borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:12,marginBottom:12},primaryText:{color:colors.text,fontSize:15,fontWeight:'700'},
 input:{backgroundColor:colors.surfaceSoft,color:colors.text,borderRadius:14,borderWidth:1,borderColor:colors.border,padding:16,fontSize:16},
 error:{backgroundColor:colors.surfaceSoft,borderRadius:14,padding:16,marginTop:12},
});
