import { useState } from 'react';
import { Text, View, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import LegalDocument from '../components/LegalDocument';
import { TERMINOS } from '../content/legal';
import PrivacidadScreen from './PrivacidadScreen';
import { colors } from '../theme/korvaTheme';
export default function TerminosScreen({ onAceptar, onVolver }) {
  const [aceptado,setAceptado]=useState(false),[privacidad,setPrivacidad]=useState(false),[guardando,setGuardando]=useState(false);
  const aceptar=async()=>{if(!aceptado||guardando)return;setGuardando(true);try{await onAceptar();}catch{Alert.alert('No se pudo guardar','Intentá nuevamente.');}finally{setGuardando(false);}};
  if(privacidad)return <PrivacidadScreen onVolver={()=>setPrivacidad(false)}/>;
  return <LegalDocument title="Antes de empezar" sections={TERMINOS} onBack={onVolver}>
    <View style={styles.footer}>
      <TouchableOpacity accessibilityRole="button" onPress={()=>setPrivacidad(true)}><Text style={styles.link}>Leer la política de privacidad →</Text></TouchableOpacity>
      {onAceptar && <><TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:aceptado}} onPress={()=>setAceptado(!aceptado)} style={styles.row}><Text style={styles.check}>{aceptado?'☑':'☐'}</Text><Text style={styles.copy}>Acepto los términos de uso y confirmo que leí la política de privacidad.</Text></TouchableOpacity><Text style={styles.note}>Esto no activa Salud, ubicación ni notificaciones.</Text><TouchableOpacity accessibilityRole="button" disabled={!aceptado||guardando} onPress={aceptar} style={[styles.button,(!aceptado||guardando)&&{opacity:.4}]}><Text style={styles.label}>{guardando?'Guardando…':'Aceptar y continuar'}</Text></TouchableOpacity></>}
    </View>
  </LegalDocument>;
}
const styles=StyleSheet.create({footer:{padding:20,borderTopWidth:1,borderColor:colors.borderSoft,gap:12},link:{color:colors.actionBlue,fontSize:14,fontWeight:'600'},row:{flexDirection:'row',gap:12,alignItems:'center'},check:{color:colors.brandOrange,fontSize:26},copy:{flex:1,color:colors.textSoft,fontSize:13,lineHeight:19},note:{color:colors.textMuted,fontSize:11},button:{backgroundColor:colors.brandOrange,padding:16,borderRadius:14,alignItems:'center'},label:{color:'#FFF',fontWeight:'800'}});
