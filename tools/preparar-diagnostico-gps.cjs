// Ejecutar desde mobile. Sólo añade diagnóstico al fallo de inicio del GPS.
// No publica OTA, no cambia permisos y no modifica mapas.
const fs = require('node:fs');
const path = require('node:path');

const original = [
"    } catch (e) {",
"      await detenerWatcher();",
"      setEstadoGps('error');",
"      Alert.alert('GPS no disponible', 'No pudimos iniciar el GPS. Intentá nuevamente.');",
"    }",
].join('\n');
const nuevo = [
"    } catch (e) {",
"      // KORVA_GPS_START_DIAGNOSTICO: conservar el error original aunque falle la limpieza.",
"      try { await detenerWatcher(); } catch (limpieza) { console.warn('GPS: fallo al detener', limpieza); }",
"      setEstadoGps('error');",
"      const codigo = String(e?.code || 'sin_codigo').slice(0, 100);",
"      const detalle = String(e?.message || e || 'Sin detalle disponible').slice(0, 450);",
"      console.warn('KORVA_GPS_START_DIAGNOSTICO', codigo, detalle);",
"      Alert.alert('GPS no disponible', 'No pudimos iniciar el GPS.\\n\\nCódigo: ' + codigo + '\\nDetalle: ' + detalle + '\\n\\nEnviá una captura a soporte.');",
"    }",
].join('\n');

function transformar(texto) {
  if (texto.includes('KORVA_GPS_START_DIAGNOSTICO')) return texto;
  const normalizado = texto.replace(/\r\n/g, '\n');
  if (normalizado.split(original).length !== 2) throw new Error('El código no coincide. No se cambió ningún archivo.');
  return normalizado.replace(original, nuevo);
}
module.exports = { transformar };

if (require.main === module) {
  const candidatas = ['screens/GpsTrackerScreen.js', 'mobile/screens/GpsTrackerScreen.js'];
  const destino = candidatas.map(p => path.resolve(p)).find(p => fs.existsSync(p));
  if (!destino) throw new Error('Ejecutá este script desde la carpeta mobile de Korva-camino-integracion.');
  const antes = fs.readFileSync(destino, 'utf8');
  const despues = transformar(antes);
  if (antes !== despues) fs.writeFileSync(destino, despues, 'utf8');
  console.log('Diagnóstico preparado. Revisá git diff. No se publicó ninguna actualización.');
}
