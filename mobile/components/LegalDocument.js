import { ScrollView, Text, TouchableOpacity, View, StyleSheet, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/korvaTheme';
import { LEGAL_VERSION } from '../content/legal';
export default function LegalDocument({ title, sections, onBack, children }) {
  const abrir = async url => { try { await Linking.openURL(url); } catch { Alert.alert('No se pudo abrir', 'Podés visitar korva.run desde tu navegador.'); } };
  return <SafeAreaView style={styles.page}>
    <View style={styles.header}>{onBack && <TouchableOpacity accessibilityRole="button" onPress={onBack}><Text style={styles.link}>← Volver</Text></TouchableOpacity>}<Text style={styles.title}>{title}</Text><Text style={styles.meta}>Actualizado el 8 de octubre de 2026 · {LEGAL_VERSION}</Text></View>
    <ScrollView contentContainerStyle={styles.content}>
      {sections.map(([heading, text]) => <View key={heading} style={styles.section}><Text style={styles.heading}>{heading}</Text><Text style={styles.body}>{text}</Text></View>)}
      <TouchableOpacity accessibilityRole="link" onPress={() => abrir('https://korva.run/policies/terms-of-service')}><Text style={styles.link}>Condiciones de la tienda ↗</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="link" onPress={() => abrir('https://korva.run/policies/privacy-policy')}><Text style={styles.link}>Privacidad de la tienda ↗</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="link" onPress={() => abrir('https://korva.run/pages/envios')}><Text style={styles.link}>Envíos y tiempos de entrega ↗</Text></TouchableOpacity>
    </ScrollView>{children}
  </SafeAreaView>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:colors.background},header:{padding:22,borderBottomWidth:1,borderColor:colors.borderSoft},title:{color:'#FFF',fontSize:25,fontWeight:'800',marginTop:8},meta:{color:colors.textMuted,fontSize:11,marginTop:8},content:{padding:22,paddingBottom:35},section:{marginBottom:22},heading:{color:'#FFF',fontSize:17,fontWeight:'700',marginBottom:8},body:{color:colors.textSoft,fontSize:14,lineHeight:23},link:{color:colors.actionBlue,fontSize:14,paddingVertical:10,fontWeight:'600'}});
