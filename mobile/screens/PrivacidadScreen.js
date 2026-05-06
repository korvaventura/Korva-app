import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';

export default function PrivacidadScreen({ onVolver }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVolver} style={styles.backBtn}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>🔒 Política de Privacidad</Text>
        <Text style={styles.subtitulo}>Última actualización: 6 de mayo de 2026</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        <Text style={styles.texto}>Korva Aventuras gestiona esta aplicación y sitio web, incluidos los datos, el contenido, las funciones, los productos y los servicios para ofrecerle una experiencia seleccionada. Esta Política de Privacidad describe cómo recopilamos, utilizamos y divulgamos su información personal.</Text>

        <Text style={styles.seccionTitulo}>INFORMACIÓN QUE RECOPILAMOS</Text>
        <Text style={styles.texto}>Podemos recopilar las siguientes categorías de información personal:</Text>
        <Text style={styles.bullet}>• Detalles de contacto: nombre, dirección, teléfono y correo electrónico.</Text>
        <Text style={styles.bullet}>• Información de cuenta: usuario, contraseña y preferencias.</Text>
        <Text style={styles.bullet}>• Información de transacciones: compras, retos y progreso.</Text>
        <Text style={styles.bullet}>• Información de dispositivo: IP y otros identificadores únicos.</Text>
        <Text style={styles.bullet}>• Datos de actividad física: distancias y actividades registradas.</Text>

        <Text style={styles.seccionTitulo}>CÓMO USAMOS SU INFORMACIÓN</Text>
        <Text style={styles.bullet}>• Prestar y mejorar los servicios de la app.</Text>
        <Text style={styles.bullet}>• Procesar pagos y gestionar pedidos.</Text>
        <Text style={styles.bullet}>• Enviar la medalla física al completar el reto.</Text>
        <Text style={styles.bullet}>• Enviar comunicaciones relacionadas con su cuenta.</Text>
        <Text style={styles.bullet}>• Seguridad y prevención de fraudes.</Text>
        <Text style={styles.bullet}>• Cumplir obligaciones legales.</Text>

        <Text style={styles.seccionTitulo}>COMPARTIMOS SU INFORMACIÓN CON</Text>
        <Text style={styles.bullet}>• Shopify: plataforma de pagos y tienda.</Text>
        <Text style={styles.bullet}>• Proveedores de servicios: pagos, envíos y soporte.</Text>
        <Text style={styles.bullet}>• Strava: sincronización de actividades deportivas.</Text>
        <Text style={styles.bullet}>• Autoridades legales cuando sea requerido.</Text>

        <Text style={styles.seccionTitulo}>SUS DERECHOS</Text>
        <Text style={styles.texto}>Según su lugar de residencia, puede tener derecho a:</Text>
        <Text style={styles.bullet}>• Acceder a su información personal.</Text>
        <Text style={styles.bullet}>• Solicitar la eliminación de sus datos.</Text>
        <Text style={styles.bullet}>• Rectificar información inexacta.</Text>
        <Text style={styles.bullet}>• Portabilidad de datos.</Text>
        <Text style={styles.bullet}>• Oponerse al tratamiento de sus datos.</Text>

        <Text style={styles.seccionTitulo}>DATOS DE MENORES</Text>
        <Text style={styles.texto}>Los servicios no están destinados a menores de edad. No recopilamos conscientemente información personal de menores.</Text>

        <Text style={styles.seccionTitulo}>SEGURIDAD</Text>
        <Text style={styles.texto}>Implementamos medidas de seguridad para proteger su información. Sin embargo, ninguna medida es completamente infalible. Le recomendamos no compartir sus credenciales de acceso.</Text>

        <Text style={styles.seccionTitulo}>TRANSFERENCIAS INTERNACIONALES</Text>
        <Text style={styles.texto}>Su información puede ser transferida, almacenada y tratada fuera del país en el que reside, utilizando mecanismos reconocidos de transferencia internacional.</Text>

        <Text style={styles.seccionTitulo}>CAMBIOS EN ESTA POLÍTICA</Text>
        <Text style={styles.texto}>Podemos actualizar esta Política ocasionalmente. Publicaremos la versión actualizada en la app y actualizaremos la fecha de última modificación.</Text>

        <Text style={styles.seccionTitulo}>CONTACTO</Text>
        <Text style={styles.texto}>Para consultas sobre privacidad o para ejercer sus derechos:</Text>
        <Text style={styles.bullet}>📧 korvaventura@gmail.com</Text>
        <Text style={styles.bullet}>📍 4/40 McLeans Road, Bundoora, VIC, 3083, AU</Text>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B2A' },
  header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1E3A5F' },
  backBtn: { marginBottom: 12 },
  backText: { color: '#1E6FD9', fontSize: 14, fontWeight: 'bold' },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  subtitulo: { fontSize: 12, color: '#4a6a8a' },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  seccionTitulo: { fontSize: 13, fontWeight: 'bold', color: '#1E6FD9', marginTop: 24, marginBottom: 8, letterSpacing: 0.5 },
  texto: { fontSize: 13, color: '#A8CFFF', lineHeight: 22, marginBottom: 8 },
  bullet: { fontSize: 13, color: '#A8CFFF', lineHeight: 22, paddingLeft: 8 },
});