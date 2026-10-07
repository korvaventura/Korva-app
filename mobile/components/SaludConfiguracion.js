import { useEffect, useRef, useState } from 'react';
import { Alert, DeviceEventEmitter, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { conectar } from '../services/health/healthkitDiagnostico';
import { estadoSalud, plataformaSoportada } from '../services/health/healthkitLectura';
import { autoSyncActivado, setAutoSyncActivado, ejecutarSyncAutomatico } from '../services/health/syncAutomatico';
import { colors } from '../theme/korvaTheme';

export default function SaludConfiguracion({ userId }) {
  const [abierto,setAbierto]=useState(false),[activo,setActivo]=useState(false),[ocupado,setOcupado]=useState(false),[mensaje,setMensaje]=useState('');
  const vivo=useRef(false),bloqueado=useRef(false);
  const nombre=Platform.OS==='android'?'Health Connect':'Apple Health';
  useEffect(()=>{vivo.current=true;let vigente=true;setActivo(false);setAbierto(false);setMensaje('');autoSyncActivado(userId).then(v=>{if(vigente)setActivo(v);});return()=>{vigente=false;vivo.current=false;};},[userId]);
  if(!userId || !plataformaSoportada)return null;
  const actualizar=async()=>{
    const r=await ejecutarSyncAutomatico(userId,{forzar:true});
    if(!vivo.current)return;
    if(r?.motivo==='ok') {setMensaje('Tu movimiento está actualizado.');DeviceEventEmitter.emit('korva:movimiento-actualizado',{userId});}
    else if(r?.motivo==='sin_datos')setMensaje('No hay distancia medida disponible. Revisá los permisos de lectura y los datos en Salud.');
    else if(r?.motivo==='sin_permiso')setMensaje('Revisá los permisos de lectura en Salud para conectar tu movimiento.');
    else if(r?.motivo==='en_curso')setMensaje('Ya hay una sincronización en curso.');
    else setMensaje('No se pudo actualizar ahora. Podés volver a intentarlo.');
  };
  const operar=async(fn)=>{if(bloqueado.current)return;bloqueado.current=true;setOcupado(true);try{await fn();}catch(e){if(vivo.current)Alert.alert('No se pudo conectar',e?.message||'Intentá nuevamente.');}finally{bloqueado.current=false;if(vivo.current)setOcupado(false);}};
  const conectarResumen=()=>operar(async()=>{
    const estado=await estadoSalud();if(!estado.disponible)throw Error(`${nombre} no está disponible en este dispositivo.`);
    await conectar();const despues=await estadoSalud();
    // Apple does not disclose per-type read authorization; never label it "all permissions granted".
    if(despues.estadoPermiso!=='ya_pedido')throw Error('Completá la conexión y los permisos de lectura para continuar.');
    if(!vivo.current)return;
    await setAutoSyncActivado(userId,true);if(!vivo.current)return;setActivo(true);await actualizar();
  });
  const desconectar=()=>Alert.alert('Desconectar Salud','Se detiene la sincronización en este teléfono. Tu historial ya guardado se conserva.',[{text:'Cancelar',style:'cancel'},{text:'Desconectar',style:'destructive',onPress:()=>operar(async()=>{await setAutoSyncActivado(userId,false);if(vivo.current){setActivo(false);setMensaje('Sincronización desactivada.');}})}]);
  return <View style={styles.card}>
    <TouchableOpacity accessibilityRole="button" onPress={()=>setAbierto(v=>!v)} style={styles.header}><Text style={styles.title}>Configurar movimiento diario</Text><Text style={styles.link}>{abierto?'Cerrar':'Configurar'}</Text></TouchableOpacity>
    <Text style={styles.note}>Solo seguimiento · no suma a tus desafíos</Text>
    {abierto && <View style={styles.body}>
      <Text style={styles.title}>{nombre}</Text>
      <Text style={styles.copy}>Conectá Salud para ver tus pasos y distancia diaria. Korva solo lee estos datos; no escribe en Salud.</Text>
      <Text style={styles.copy}>La sincronización se realiza al abrir o volver a la app, como máximo cada 3 horas. Podés actualizarla acá cuando lo necesites.</Text>
      <Text style={styles.status}>{activo?'Sincronización del resumen activada':'Sincronización del resumen desactivada'}</Text>
      <TouchableOpacity style={styles.button} disabled={ocupado} onPress={activo?()=>operar(actualizar):conectarResumen} accessibilityRole="button"><Text style={styles.buttonText}>{ocupado?'Procesando…':activo?'Actualizar ahora':`Conectar con ${nombre}`}</Text></TouchableOpacity>
      {activo && <TouchableOpacity disabled={ocupado} onPress={desconectar} accessibilityRole="button"><Text style={styles.link}>Desconectar Salud</Text></TouchableOpacity>}
      {!!mensaje && <Text accessibilityLiveRegion="polite" style={styles.copy}>{mensaje}</Text>}
      <View style={styles.challenge}><Text style={styles.title}>Movimiento en desafíos</Text><Text style={styles.copy}>Conectar Salud no cambia tus desafíos. Por ahora, avanzan con tus actividades registradas; el movimiento diario se muestra solo en este resumen.</Text></View>
    </View>}
  </View>;
}
const styles=StyleSheet.create({card:{marginTop:18,borderTopWidth:1,borderTopColor:colors.borderSoft,paddingTop:18},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},title:{color:colors.text,fontSize:13,fontWeight:'700',flexShrink:1},note:{color:colors.textMuted,fontSize:11,lineHeight:17,marginTop:7},body:{gap:12,marginTop:20},copy:{color:colors.textSoft,fontSize:12,lineHeight:19},link:{color:colors.actionBlue,fontSize:12,fontWeight:'700',paddingVertical:8},status:{color:'#9DE1C8',fontSize:12,fontWeight:'700'},button:{backgroundColor:colors.brandOrange,padding:14,borderRadius:12,alignItems:'center'},buttonText:{color:'#FFF',fontSize:12,fontWeight:'800'},challenge:{borderTopWidth:1,borderTopColor:colors.borderSoft,paddingTop:15,gap:8}});
