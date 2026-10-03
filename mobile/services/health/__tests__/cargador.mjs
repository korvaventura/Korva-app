// Hooks de carga para correr estos archivos de React Native en Node sin bundler:
// la librería nativa se reemplaza por el doble, los imports relativos sin extensión
// se resuelven a .js y los .js de mobile/services se cargan como módulos ES.
import { fileURLToPath } from 'node:url';
const FALSO = new URL('./falsoHealthkit.mjs', import.meta.url).href;
export async function resolve(especificador, contexto, siguiente) {
  if (especificador === '@kingstinct/react-native-healthkit') return { url: FALSO, shortCircuit: true };
  if (especificador.startsWith('.') && !/\.[cm]?js$/.test(especificador)) {
    return siguiente(`${especificador}.js`, contexto);
  }
  return siguiente(especificador, contexto);
}
export async function load(url, contexto, siguiente) {
  if (url.startsWith('file:') && /\/mobile\/services\/.*\.js$/.test(fileURLToPath(url))) {
    return siguiente(url, { ...contexto, format: 'module' });
  }
  return siguiente(url, contexto);
}
