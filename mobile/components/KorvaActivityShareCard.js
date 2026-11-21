import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { mapa3DDeDesafio } from '../screens/MapaRecorrido';

const { proyectarRuta } = require('../services/gps/rutaVisualCore');
const { rutaLinea } = require('../services/mapa3d/lineaCore');
const {
  urlsFondo, paletaDesafio, PALETA_KORVA, formatoKm, formatoDuracion, formatoRitmo, avanceDesafio, trazadoDesafio, trazadoPlano,
} = require('../services/compartirCore');

// Todo se diseña sobre una historia de 1080×1920 y se escala al ancho real.
// Instagram tapa ~250 px arriba (perfil) y ~340 abajo (responder): ahí no va nada.
const RW = 760;
const RH = 380;

const DEPORTE = { run: 'CORRER', walk: 'CAMINAR', ride: 'BICI', hike: 'TREKKING', swim: 'NADAR' };

// Armar la ruta de un mapa cuesta: se calcula una vez por desafío y queda guardada.
const RUTAS = new Map();
function rutaDelDesafio(challenge) {
  const clave = challenge?.challenge_id || challenge?.challenge || challenge?.challenge_title;
  if (!clave) return null;
  if (RUTAS.has(clave)) return RUTAS.get(clave);
  const ruta = calcularRuta(challenge);
  RUTAS.set(clave, ruta);
  return ruta;
}
function calcularRuta(challenge) {
  try {
    const mapa = mapa3DDeDesafio(challenge.challenge_id || null, challenge.challenge || challenge.challenge_title);
    if (!mapa) return null;
    return rutaLinea(mapa.escena, mapa.horneado, mapa.checkpoints).puntos;
  } catch {
    return null;
  }
}

function Linea({ trazado, acento, base = '#FFFFFF', grosor = 1 }) {
  if (!trazado) return null;
  const g = (v) => v * grosor;
  return (
    <>
      {!!trazado.base && <Path d={trazado.base} fill="none" stroke="#000" strokeOpacity={0.22} strokeWidth={g(24)} strokeLinecap="round" strokeLinejoin="round" />}
      {!!trazado.hoy && <Path d={trazado.hoy} fill="none" stroke="#000" strokeOpacity={0.25} strokeWidth={g(30)} strokeLinecap="round" strokeLinejoin="round" />}
      {!!trazado.base && <Path d={trazado.base} fill="none" stroke={base} strokeOpacity={0.6} strokeWidth={g(7)} strokeLinecap="round" strokeLinejoin="round" />}
      {!!trazado.hecho && <Path d={trazado.hecho} fill="none" stroke={base} strokeOpacity={0.97} strokeWidth={g(9)} strokeLinecap="round" strokeLinejoin="round" />}
      {!!trazado.hoy && <Path d={trazado.hoy} fill="none" stroke={acento} strokeWidth={g(16)} strokeLinecap="round" strokeLinejoin="round" />}
      <Circle cx={trazado.punto.x} cy={trazado.punto.y} r={g(17)} fill={acento} />
      <Circle cx={trazado.punto.x} cy={trazado.punto.y} r={g(9)} fill="#FFFFFF" />
    </>
  );
}

export default function KorvaActivityShareCard({
  actividad = {},
  puntos = [],
  challenge = null,
  variante = 'story',
  modo = 'salida', // 'salida' (una actividad) o 'progreso' (cuánto llevás del desafío)
  ancho = 360,
  onFondoListo,
}) {
  const k = ancho / 1080;
  const km = Number(actividad.distance_km || 0);
  const segundos = Number(actividad.duration_seconds || 0);
  const ritmo = formatoRitmo(km, segundos, actividad.sport_type);
  const nombre = challenge?.challenge || challenge?.challenge_title || null;
  const paleta = nombre ? paletaDesafio(nombre) : PALETA_KORVA;
  const progreso = modo === 'progreso';
  const avanceBase = challenge ? avanceDesafio(challenge, progreso ? 0 : km) : null;
  // En progreso no hay tramo de hoy: la línea marca lo hecho y dónde estás.
  const avance = avanceBase;
  const urls = variante === 'story' && nombre ? urlsFondo(nombre) : [];
  const [intento, setIntento] = useState(0);
  const fondo = urls[intento] || null;
  const [estadoFondo, setEstadoFondo] = useState(urls.length ? 'cargando' : 'sin-foto');

  useEffect(() => { setIntento(0); setEstadoFondo(urls.length ? 'cargando' : 'sin-foto'); }, [urls[0]]);
  useEffect(() => { onFondoListo?.(fondo ? estadoFondo : 'sin-foto'); }, [estadoFondo, fondo]);

  const trazado = useMemo(() => {
    const ruta = avance ? rutaDelDesafio(challenge) : null;
    if (ruta) {
      const t = trazadoDesafio(ruta, avance.antes, avance.despues, RW, RH, { pad: 20 });
      // En progreso, lo recorrido va en el color del desafío.
      return progreso && t ? { ...t, hoy: t.hecho, hecho: '' } : t;
    }
    if (puntos.length >= 2) return trazadoPlano(proyectarRuta(puntos, RW, RH, { visualScale: 0.9, padding: 24 }));
    return null;
  }, [challenge?.challenge_id, challenge?.challenge, avance?.antes, avance?.despues, puntos, progreso]);

  const pctTexto = avance ? (avance.despues > 0 && avance.despues < 0.01 ? 'menos del 1%' : `${Math.floor(avance.despues * 100)}%`) : '';
  const linea1 = `${formatoKm(progreso ? avance?.kmAhora : km)} km`;
  const linea2 = progreso
    ? (avance ? `de ${formatoKm(avance.total)} km  ·  ${pctTexto}` : '')
    : [segundos > 0 ? formatoDuracion(segundos) : null, ritmo ? `${ritmo.valor} ${ritmo.unidad}` : null].filter(Boolean).join('  ·  ');
  const pie = progreso ? null : avance ? `+${formatoKm(km)} km  ·  ${formatoKm(avance.kmAhora)} de ${formatoKm(avance.total)} km` : null;
  const subtitulo = (nombre ? String(nombre).replace(/\s+\d+(?:[.,]\d+)?\s*K\b/i, '') : DEPORTE[actividad.sport_type] || 'KORVA').toUpperCase();

  if (variante !== 'story') {
    // Sin fondo: un sticker para poner sobre tu foto. Blanco con sombra.
    const altoMapa = trazado ? 380 * k * 0.9 : 0;
    return (
      <View collapsable={false} style={{ width: ancho, paddingVertical: 40 * k, alignItems: 'center', backgroundColor: 'transparent' }}>
        <Text style={[s.sombra, s.blanco, { fontSize: 170 * k, lineHeight: 190 * k, fontWeight: '700', letterSpacing: -4 * k }]}>{linea1}</Text>
        {!!linea2 && <Text style={[s.sombra, s.blanco, { fontSize: 46 * k, fontWeight: '600', marginTop: 4 * k }]}>{linea2}</Text>}
        {trazado && (
          <Svg width={RW * k * 0.9} height={altoMapa} viewBox={`0 0 ${RW} ${RH}`} style={{ marginTop: 40 * k }}>
            <Linea trazado={trazado} acento="#F36B0A" grosor={1.25} />
          </Svg>
        )}
        {!!nombre && <Text style={[s.sombra, s.blanco, { fontSize: 34 * k, fontWeight: '600', marginTop: 30 * k }]}>{String(nombre).replace(/\s+\d+(?:[.,]\d+)?\s*K\b/i, '')}{avance && !progreso ? `  ·  ${formatoKm(avance.kmAhora)} de ${formatoKm(avance.total)} km` : ''}</Text>}
        <Text style={[s.sombra, { color: '#F36B0A', fontSize: 34 * k, fontWeight: '800', letterSpacing: 14 * k, marginTop: 14 * k }]}>KORVA</Text>
      </View>
    );
  }

  const conFoto = estadoFondo !== 'sin-foto' && !!fondo;
  return (
    <View collapsable={false} style={{ width: ancho, height: ancho * 16 / 9, overflow: 'hidden', backgroundColor: paleta.fondo }}>
      {conFoto && (
        <Image source={{ uri: fondo }} style={StyleSheet.absoluteFill} resizeMode="cover"
          onLoad={() => setEstadoFondo('listo')} onError={() => (urls[intento + 1] ? setIntento(intento + 1) : setEstadoFondo('sin-foto'))} />
      )}
      {/* velos: arriba detrás de los números, abajo detrás de la línea */}
      <Svg style={StyleSheet.absoluteFill} width={ancho} height={ancho * 16 / 9} viewBox="0 0 1080 1920" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="arriba" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#080C14" stopOpacity={conFoto ? 0.6 : 0} />
            <Stop offset="1" stopColor="#080C14" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="abajo" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#080C14" stopOpacity={0} />
            <Stop offset="1" stopColor="#080C14" stopOpacity={conFoto ? 0.66 : 0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="1080" height="1000" fill="url(#arriba)" />
        <Rect x="0" y="1020" width="1080" height="900" fill="url(#abajo)" />
      </Svg>

      <View style={[s.abs, { top: 296 * k }]}>
        <Text style={[s.sombra, { color: '#FFFFFF', fontSize: 40 * k, fontWeight: '700', letterSpacing: 18 * k }]}>KORVA</Text>
        <Text style={[s.sombra, { color: conFoto ? 'rgba(255,255,255,0.9)' : paleta.suave, fontSize: 30 * k, fontWeight: '600', letterSpacing: 9 * k, marginTop: 30 * k }]}>{subtitulo}</Text>
        <Text style={[s.sombra, { color: conFoto ? '#FFFFFF' : paleta.texto, fontSize: 200 * k, lineHeight: 230 * k, fontWeight: '700', letterSpacing: -5 * k, marginTop: 20 * k }]}>{linea1}</Text>
        {!!linea2 && <Text style={[s.sombra, { color: conFoto ? '#FFFFFF' : paleta.texto, fontSize: 50 * k, fontWeight: '600', marginTop: 10 * k }]}>{linea2}</Text>}
      </View>

      {trazado && (
        <Svg width={RW * k} height={RH * k} viewBox={`0 0 ${RW} ${RH}`} style={{ position: 'absolute', left: 160 * k, top: 1130 * k }}>
          <Linea trazado={trazado} acento={paleta.acento} base={conFoto ? '#FFFFFF' : paleta.texto} />
        </Svg>
      )}

      {!!pie && (
        <View style={[s.abs, { top: 1530 * k }]}>
          <Text style={[s.sombra, { color: conFoto ? '#FFFFFF' : paleta.suave, fontSize: 40 * k, fontWeight: '600' }]}>{pie}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  abs: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  blanco: { color: '#FFFFFF' },
  sombra: { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
});
