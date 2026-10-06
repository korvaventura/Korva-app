// Packed offline: no GLB parsing, Blob, WASM or image decoding on the JS thread.
const { base64ABytes } = require('./horneadoCore');
function decodificarModelo(meta, buffers) {
  const quant = new Uint16Array(base64ABytes(buffers.position).buffer);
  const position = new Float32Array(meta.vertices * 3);
  if (quant.length !== position.length) throw new Error('Posiciones Meshy incompletas');
  for (let i = 0; i < position.length; i += 1) position[i] = meta.min[i % 3] + quant[i] / 65535 * meta.span[i % 3];
  const normal = new Int8Array(base64ABytes(buffers.normal).buffer);
  const uv = new Uint16Array(base64ABytes(buffers.uv).buffer);
  if (normal.length !== position.length || uv.length !== meta.vertices * 2) throw new Error('Atributos Meshy incompletos');
  const bytes = base64ABytes(buffers.index);
  const index = new Uint32Array(meta.triangles * 3);
  let cursor = 0; let previous = 0;
  for (let i = 0; i < index.length; i += 1) {
    let value = 0; let shift = 0; let byte;
    do {
      if (cursor >= bytes.length || shift > 28) throw new Error('Índices Meshy incompletos');
      byte = bytes[cursor++]; value += (byte & 127) * 2 ** shift; shift += 7;
    } while (byte & 128);
    previous += value % 2 ? -(value + 1) / 2 : value / 2;
    if (previous < 0 || previous >= meta.vertices) throw new Error('Índice Meshy fuera de rango');
    index[i] = previous;
  }
  if (cursor !== bytes.length) throw new Error('Índices Meshy sobrantes');
  return { position, normal, uv, index };
}
function crearMuestreadorModelo(meta) {
  const heights = new Uint16Array(base64ABytes(meta.height).buffer);
  const n = meta.heightSize; const [min, max] = meta.heightBounds;
  if (heights.length !== n * n) throw new Error('Superficie Meshy incompleta');
  return (x, z) => {
    const fx = (x - min[0]) / (max[0] - min[0]) * (n - 1);
    const fz = (z - min[1]) / (max[1] - min[1]) * (n - 1);
    if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) return 0;
    // Conservative top surface: keep route and camera clear of tiny roof edges.
    const ix = Math.floor(fx); const iz = Math.floor(fz);
    let h = 0;
    for (let dz = 0; dz <= 1; dz += 1) for (let dx = 0; dx <= 1; dx += 1) h = Math.max(h, heights[Math.min(n - 1, iz + dz) * n + Math.min(n - 1, ix + dx)] / 65535);
    return h;
  };
}
module.exports = { decodificarModelo, crearMuestreadorModelo };
