// Offline only. Install meshoptimizer in the build workspace, never in the app runtime.
// Usage: node empacarModeloUnificado.mjs model.glb color.jpg output-directory diagnostic-directory calibration.json
import fs from 'node:fs';
import path from 'node:path';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const [input, texture, output, diagnosticOutput, calibrationPath] = process.argv.slice(2);
if (!input || !texture || !output) throw Error('Pass GLB, resized color JPEG and output directory');
if(!calibrationPath)throw Error('Pass a calibration JSON specific to this model');
const calibration=JSON.parse(fs.readFileSync(calibrationPath,'utf8'));
const bytes = fs.readFileSync(input);
if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw Error('Expected GLB v2');
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const binaryOffset = 28 + jsonLength;
if (gltf.meshes.length !== 1 || gltf.meshes[0].primitives.length !== 1) throw Error('Expected one unified mesh');
const primitive = gltf.meshes[0].primitives[0];
function accessor(index, Type, width) {
  const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
  if (view.byteStride || a.sparse) throw Error('Interleaved/sparse buffers need explicit conversion');
  const start = binaryOffset + (view.byteOffset || 0) + (a.byteOffset || 0);
  const data = bytes.subarray(start, start + a.count * width * Type.BYTES_PER_ELEMENT);
  return new Type(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
}
const positions = accessor(primitive.attributes.POSITION, Float32Array, 3);
const normals = accessor(primitive.attributes.NORMAL, Float32Array, 3);
const uv = accessor(primitive.attributes.TEXCOORD_0, Float32Array, 2);
const indices = accessor(primitive.indices, Uint32Array, 1);
// Preserve all source axes and proportions. A common translation sets the sea datum.
const scale = calibration.scale, waterDatum = calibration.waterDatum;
for (let i = 0; i < positions.length; i += 3) {
  positions[i] *= scale;
  positions[i + 1] = (positions[i + 1] - waterDatum) * scale;
  positions[i + 2] *= scale;
}
await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready]);
const attributes = new Float32Array(positions.length / 3 * 5);
for (let i = 0; i < positions.length / 3; i++) {
  attributes.set(normals.subarray(i * 3, i * 3 + 3), i * 5);
  attributes.set(uv.subarray(i * 2, i * 2 + 2), i * 5 + 3);
}
const [reduced, error] = MeshoptSimplifier.simplifyWithAttributes(
  indices, positions, 3, attributes, 5, [.01, .01, .01, .2, .2], null,
  220000 * 3, .006, ['Prune'],
);
console.log(JSON.stringify({ sourceTriangles: indices.length / 3, triangles: reduced.length / 3, error }));
if (reduced.length / 3 > 300000) throw Error('Mobile budget exceeded; inspect before changing simplification');
const [remap, count] = MeshoptEncoder.reorderMesh(reduced, true, true);
const pos = new Float32Array(count * 3), norm = new Float32Array(count * 3), tex = new Float32Array(count * 2);
for (let i = 0; i < remap.length; i++) if (remap[i] !== 0xffffffff) {
  pos.set(positions.subarray(i * 3, i * 3 + 3), remap[i] * 3);
  norm.set(normals.subarray(i * 3, i * 3 + 3), remap[i] * 3);
  tex.set(uv.subarray(i * 2, i * 2 + 2), remap[i] * 2);
}
fs.mkdirSync(output, { recursive: true });
const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const write = (name, value) => fs.writeFileSync(path.join(output, name + '.js'), 'module.exports = ' + JSON.stringify(value) + ';\n');
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < pos.length; i++) { min[i % 3] = Math.min(min[i % 3], pos[i]); max[i % 3] = Math.max(max[i % 3], pos[i]); }
const span = max.map((v, i) => v - min[i]);
const qp = new Uint16Array(pos.length), qn = new Int8Array(norm.length), qt = new Uint16Array(tex.length);
for (let i = 0; i < pos.length; i++) qp[i] = Math.round((pos[i] - min[i % 3]) / span[i % 3] * 65535);
for (let i = 0; i < norm.length; i += 3) {
  const len = Math.hypot(norm[i], norm[i + 1], norm[i + 2]) || 1;
  for (let k = 0; k < 3; k++) qn[i + k] = Math.round(norm[i + k] / len * 127);
}
for (let i = 0; i < tex.length; i++) qt[i] = Math.round(Math.max(0, Math.min(1, tex[i])) * 65535);
const encoded = []; let previous = 0;
for (const index of reduced) {
  const delta = index - previous; previous = index;
  let value = delta < 0 ? -delta * 2 - 1 : delta * 2;
  while (value >= 128) { encoded.push((value % 128) | 128); value = Math.floor(value / 128); }
  encoded.push(value);
}
write('position', b64(qp)); write('normal', b64(qn)); write('uv', b64(qt)); write('index', b64(Uint8Array.from(encoded)));
fs.copyFileSync(texture, path.join(output, 'color.jpg'));
// Route queries must use the same quantized geometry decoded by the phone.
for(let i=0;i<pos.length;i++) pos[i]=min[i%3]+qp[i]/65535*span[i%3];
// Exact barycentric top-surface raster, shared by camera clearance and route placement.
const size = 320, bounds = [[min[0], min[2]], [max[0], max[2]]], heights = new Float32Array(size * size);
const gx = x => (x - min[0]) / span[0] * (size - 1), gz = z => (z - min[2]) / span[2] * (size - 1);
for (let i = 0; i < reduced.length; i += 3) {
  const a = reduced[i] * 3, b = reduced[i + 1] * 3, c = reduced[i + 2] * 3;
  const ax = gx(pos[a]), az = gz(pos[a + 2]), bx = gx(pos[b]), bz = gz(pos[b + 2]), cx = gx(pos[c]), cz = gz(pos[c + 2]);
  const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(den) < 1e-10) continue;
  for (let z = Math.max(0, Math.floor(Math.min(az, bz, cz))); z <= Math.min(size - 1, Math.ceil(Math.max(az, bz, cz))); z++) {
    for (let x = Math.max(0, Math.floor(Math.min(ax, bx, cx))); x <= Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx))); x++) {
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den;
      const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001) heights[z * size + x] = Math.max(heights[z * size + x], u * pos[a + 1] + v * pos[b + 1] + (1 - u - v) * pos[c + 1]);
    }
  }
}
const qh = new Uint16Array(heights.length);
for (let i = 0; i < heights.length; i++) { if (heights[i] >= 1) throw Error('Height overflow'); qh[i] = Math.round(heights[i] * 65535); }
// Anchors calibrated on a 1200 x 1200 overhead projection of THIS source.
// Visual presentation only: not a surveyed tourist route or a distance measurement.
const pixels = calibration.pixels;
const knots = pixels.map(([x,z,km]) => ({x:(x/(calibration.projectionSize-1)*2-1)*scale,z:(z/(calibration.projectionSize-1)*2-1)*scale,km}));
const distances = [0];
for(let i=1;i<knots.length;i++) distances[i]=distances[i-1]+Math.hypot(knots[i].x-knots[i-1].x,knots[i].z-knots[i-1].z);
let from=0;
for(let to=1;to<knots.length;to++) if(Number.isFinite(knots[to].km)) {
  for(let i=from+1;i<to;i++) knots[i].km=knots[from].km+(knots[to].km-knots[from].km)*(distances[i]-distances[from])/(distances[to]-distances[from]);
  from=to;
}
const cell=.06, cells=new Map();
for(let i=0;i<reduced.length;i+=3) {
  const a=reduced[i]*3,b=reduced[i+1]*3,c=reduced[i+2]*3;
  for(let x=Math.floor(Math.min(pos[a],pos[b],pos[c])/cell);x<=Math.floor(Math.max(pos[a],pos[b],pos[c])/cell);x++)
    for(let z=Math.floor(Math.min(pos[a+2],pos[b+2],pos[c+2])/cell);z<=Math.floor(Math.max(pos[a+2],pos[b+2],pos[c+2])/cell);z++) {
      const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);
    }
}
function at(x,z) {
  let height=-Infinity;
  for(const i of cells.get(Math.floor(x/cell)+','+Math.floor(z/cell)) || []) {
    const a=reduced[i]*3,b=reduced[i+1]*3,c=reduced[i+2]*3;
    const den=(pos[b+2]-pos[c+2])*(pos[a]-pos[c])+(pos[c]-pos[b])*(pos[a+2]-pos[c+2]);
    if(Math.abs(den)<1e-10)continue;
    const u=((pos[b+2]-pos[c+2])*(x-pos[c])+(pos[c]-pos[b])*(z-pos[c+2]))/den;
    const v=((pos[c+2]-pos[a+2])*(x-pos[c])+(pos[a]-pos[c])*(z-pos[c+2]))/den;
    if(u>=-1e-6 && v>=-1e-6 && u+v<=1.000001) height=Math.max(height,u*pos[a+1]+v*pos[b+1]+(1-u-v)*pos[c+1]);
  }
  if(!Number.isFinite(height))throw Error('Visual route leaves the source surface at '+x+','+z);
  return height;
}
const route=[];
for(let i=1;i<knots.length;i++) {
  const a=knots[i-1],b=knots[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.009));
  for(let j=i===1?0:1;j<=steps;j++) {
    const t=j/steps;
    // Optional source-local Hermite interpolation passes through every checkpoint.
    // Heights are sampled again after smoothing, never interpolated through terrain.
    const before=knots[Math.max(0,i-2)],after=knots[Math.min(knots.length-1,i+1)];
    const interpolate = key => {
      if(!calibration.suavizar)return a[key]+(b[key]-a[key])*t;
      const h00=2*t*t*t-3*t*t+1,h10=t*t*t-2*t*t+t,h01=-2*t*t*t+3*t*t,h11=t*t*t-t*t;
      return h00*a[key]+h10*(b[key]-before[key])*.35+h01*b[key]+h11*(after[key]-a[key])*.35;
    };
    const x=interpolate('x'),z=interpolate('z');
    const h=at(x,z); // The renderer adds its own small line clearance.
    route.push({x:x*calibration.kmPorUnidad,z:z*calibration.kmPorUnidad,h:h/calibration.metrosAUnidades,km:a.km+(b.km-a.km)*t});
  }
}
write('meta', { version: 1, vertices: count, triangles: reduced.length / 3, min, span, heightSize: size, heightBounds: bounds, height: b64(qh), visualRoute:knots.filter(p=>Number.isFinite(p.km)).map(p=>[p.x,p.z,p.km]), visualSurfaceRoute:route, composition: 'single-unified-source', source: path.basename(input), simplificationError: error, sourceScale: scale, sourceWaterDatum: waterDatum, calibration: path.basename(calibrationPath), geographicAccuracy: 'visual-approximation' });
// Diagnostic floats are temporary, not shipped in the mobile app.
if(diagnosticOutput) {
  fs.mkdirSync(diagnosticOutput,{recursive:true});
  for (const [name, array] of [['position', pos], ['normal', norm], ['uv', tex], ['index', reduced]]) fs.writeFileSync(path.join(diagnosticOutput, name + '.bin'), Buffer.from(array.buffer));
}
console.log(JSON.stringify({ vertices: count, bounds, maxHeight: max[1], route:route.length, packedDirectory: output }));
