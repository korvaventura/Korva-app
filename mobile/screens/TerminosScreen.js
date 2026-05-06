import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import PrivacidadScreen from './PrivacidadScreen';

export default function TerminosScreen({ onAceptar }) {
  const [aceptado, setAceptado] = useState(false);
  const [verPrivacidad, setVerPrivacidad] = useState(false);

  if (verPrivacidad) {
    return <PrivacidadScreen onVolver={() => setVerPrivacidad(false)} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.titulo}>📜 Términos y Condiciones</Text>
        <Text style={styles.subtitulo}>Leé y aceptá antes de continuar</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        <Text style={styles.seccionTitulo}>INFORMACIÓN GENERAL</Text>
        <Text style={styles.texto}>Bienvenido a Korva Aventuras. Los presentes Términos y Condiciones regulan el acceso, uso y contratación de los productos y servicios ofrecidos. Al acceder, registrarse o realizar una compra, usted acepta estos términos en su totalidad.</Text>

        <Text style={styles.seccionTitulo}>🧠 NATURALEZA DEL SERVICIO</Text>
        <Text style={styles.texto}>Korva Aventuras ofrece desafíos virtuales de actividad física, contenido digital y productos físicos asociados (medallas). El usuario reconoce que está adquiriendo un producto mixto (digital + físico), donde el componente principal es el acceso a la experiencia digital.</Text>

        <Text style={styles.seccionTitulo}>📦 ACCESO AL SERVICIO</Text>
        <Text style={styles.texto}>Una vez realizada la compra, el acceso al desafío y al contenido digital se entrega de forma inmediata. El usuario puede comenzar el desafío sin necesidad de aprobación previa. Este acceso se considera servicio consumido desde el momento de su entrega.</Text>

        <Text style={styles.seccionTitulo}>🔁 POLÍTICA DE CANCELACIÓN Y REEMBOLSOS</Text>
        <Text style={styles.texto}>Debido a la naturaleza digital del servicio, no se aceptan cancelaciones ni reembolsos una vez entregado el acceso al contenido. Esto aplica incluso si el usuario decide no continuar con el desafío. Solo se evaluarán casos excepcionales ante error técnico comprobable o imposibilidad real de acceso.</Text>

        <Text style={styles.seccionTitulo}>🏅 PRODUCTO FÍSICO (MEDALLA)</Text>
        <Text style={styles.texto}>La medalla no se envía al momento de la compra. Se envía únicamente tras completar el desafío. Para recibirla, el usuario deberá completar la distancia del reto y registrar evidencia válida del progreso. Korva Aventuras se reserva el derecho de validar dicha información antes de aprobar el envío.</Text>

        <Text style={styles.seccionTitulo}>📬 CONDICIONES DE ENTREGA</Text>
        <Text style={styles.texto}>Los tiempos de envío son estimados y pueden variar según el destino. No nos responsabilizamos por demoras externas (logística, aduanas, correo). En caso de recibir la medalla en mal estado, el usuario deberá notificar dentro de las 48 horas posteriores a la entrega con evidencia fotográfica.</Text>

        <Text style={styles.seccionTitulo}>⚠️ RESPONSABILIDAD DEL USUARIO</Text>
        <Text style={styles.texto}>El usuario reconoce que el progreso dentro del desafío depende exclusivamente de su compromiso. Korva Aventuras no garantiza resultados físicos, estéticos o deportivos. El desafío es de carácter personal, voluntario y no competitivo.</Text>

        <Text style={styles.seccionTitulo}>🧠 CONDICIÓN FÍSICA Y SALUD</Text>
        <Text style={styles.texto}>Al participar, el usuario declara estar en condiciones físicas adecuadas. Korva Aventuras no se responsabiliza por lesiones, problemas de salud o incidentes derivados de la actividad física. Se recomienda realizar controles médicos previos antes de iniciar el desafío.</Text>

        <Text style={styles.seccionTitulo}>📩 CONTACTO</Text>
        <Text style={styles.texto}>Para cualquier consulta o solicitud: korvaventura@gmail.com</Text>

        <TouchableOpacity onPress={() => setVerPrivacidad(true)} style={styles.privacidadLink}>
          <Text style={styles.privacidadLinkText}>🔒 Ver Política de Privacidad →</Text>
        </TouchableOpacity>

      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setAceptado(!aceptado)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, aceptado && styles.checkboxActivo]}>
            {aceptado && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>Leí y acepto los términos y condiciones y la política de privacidad</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.continueBtn, !aceptado && styles.continueBtnDisabled]}
          onPress={aceptado ? onAceptar : null}
          activeOpacity={aceptado ? 0.8 : 1}
        >
          <Text style={styles.continueBtnText}>Continuar →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B2A' },
  header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1E3A5F' },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  subtitulo: { fontSize: 13, color: '#A8CFFF' },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 16 },
  seccionTitulo: { fontSize: 13, fontWeight: 'bold', color: '#1E6FD9', marginTop: 20, marginBottom: 8, letterSpacing: 0.5 },
  texto: { fontSize: 13, color: '#A8CFFF', lineHeight: 22 },
  privacidadLink: { marginTop: 24, paddingVertical: 14, borderWidth: 1, borderColor: '#1E6FD9', borderRadius: 12, alignItems: 'center' },
  privacidadLinkText: { color: '#1E6FD9', fontWeight: 'bold', fontSize: 14 },
  footer: { padding: 24, borderTopWidth: 1, borderTopColor: '#1E3A5F', gap: 16 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#2a4a6a', alignItems: 'center', justifyContent: 'center' },
  checkboxActivo: { backgroundColor: '#1E6FD9', borderColor: '#1E6FD9' },
  checkmark: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  checkLabel: { flex: 1, fontSize: 13, color: '#A8CFFF', lineHeight: 20 },
  continueBtn: { backgroundColor: '#FC4C02', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  continueBtnDisabled: { backgroundColor: '#2a3a4a' },
  continueBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
});