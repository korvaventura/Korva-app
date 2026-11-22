import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import KorvaSheet from './KorvaSheet';
import { PREGUNTAS_KORVA } from '../utils/ayudaKorva';
import { colors } from '../theme/korvaTheme';
export default function KorvaHelpSheet({ visible, onClose, onRecorrido }) {
  const [abierta, setAbierta] = useState(null);
  return <KorvaSheet visible={visible} title="Ayuda" onClose={onClose}>
    <Text style={styles.intro}>Lo que necesitás saber para empezar y seguir tu aventura.</Text>
    {!!onRecorrido && <TouchableOpacity style={styles.recorrido} onPress={onRecorrido} accessibilityRole="button">
      <Ionicons name="navigate-circle-outline" size={22} color={colors.brandOrange} />
      <View style={{ flex: 1 }}>
        <Text style={styles.question}>Ver recorrido guiado</Text>
        <Text style={styles.recorridoTxt}>Te mostramos paso a paso lo más importante de Korva.</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />
    </TouchableOpacity>}
    {PREGUNTAS_KORVA.map((item, i) => <View key={item.q} style={styles.item}>
      <TouchableOpacity style={styles.row} onPress={() => setAbierta(abierta === i ? null : i)} accessibilityRole="button" accessibilityState={{ expanded: abierta === i }}>
        <Text style={styles.question}>{item.q}</Text><Ionicons name={abierta === i ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSoft} />
      </TouchableOpacity>
      {abierta === i && <Text style={styles.answer}>{item.a}</Text>}
    </View>)}
  </KorvaSheet>;
}
const styles=StyleSheet.create({
  intro:{color:colors.textMuted,fontSize:14,lineHeight:21,marginBottom:16},
  recorrido:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:14,borderWidth:1,borderColor:colors.brandOrange,marginBottom:8},
  recorridoTxt:{color:colors.textSoft,fontSize:12,marginTop:2},
  item:{borderBottomWidth:1,borderBottomColor:colors.borderSoft},
  row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:60,paddingVertical:16},
  question:{flex:1,color:colors.text,fontSize:15,fontWeight:'600',lineHeight:22},
  answer:{color:colors.textSoft,fontSize:14,lineHeight:23,paddingBottom:20},
});
