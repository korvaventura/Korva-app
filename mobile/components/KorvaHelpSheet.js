import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import KorvaSheet from './KorvaSheet';
import { PREGUNTAS_KORVA } from '../utils/ayudaKorva';
import { colors } from '../theme/korvaTheme';
export default function KorvaHelpSheet({ visible, onClose }) {
  const [abierta, setAbierta] = useState(null);
  return <KorvaSheet visible={visible} title="Ayuda" onClose={onClose}>
    <Text style={styles.intro}>Lo que necesitás saber para empezar y seguir tu aventura.</Text>
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
  item:{borderBottomWidth:1,borderBottomColor:colors.borderSoft},
  row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:60,paddingVertical:16},
  question:{flex:1,color:colors.text,fontSize:15,fontWeight:'600',lineHeight:22},
  answer:{color:colors.textSoft,fontSize:14,lineHeight:23,paddingBottom:20},
});
