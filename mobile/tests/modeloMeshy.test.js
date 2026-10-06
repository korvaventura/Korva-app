const test = require('node:test');
const assert = require('node:assert/strict');
const { decodificarModelo, crearMuestreadorModelo } = require('../services/mapa3d/modeloMeshyCore');
const meta = require('../assets/mapa3d/dubrovnik/meta');
const buffers = Object.fromEntries(['position', 'normal', 'uv', 'index'].map(k => [k, require('../assets/mapa3d/dubrovnik/' + k)]));

test('Dubrovnik móvil: malla íntegra, dentro del presupuesto y con normales válidas', () => {
  const mesh = decodificarModelo(meta, buffers);
  assert(meta.triangles < 200000);
  assert.equal(mesh.index.length, meta.triangles * 3);
  for (let v = 0; v < meta.vertices; v += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const p = mesh.position[v * 3 + axis];
      assert(Number.isFinite(p));
      assert(p >= meta.min[axis] - 1e-6 && p <= meta.min[axis] + meta.span[axis] + 1e-6);
    }
    const normalLength = Math.hypot(...mesh.normal.subarray(v * 3, v * 3 + 3)) / 127;
    assert(normalLength > 0.98 && normalLength < 1.02);
  }
  assert(mesh.index.every(i => i < meta.vertices));
  assert.throws(() => decodificarModelo(meta, { ...buffers, index: '' }), /incompletos/);
});

test('Dubrovnik móvil: superficie finita para ruta y cámara, mar fuera del modelo', () => {
  const sample = crearMuestreadorModelo(meta);
  const [min, max] = meta.heightBounds;
  assert.equal(sample(min[0] - 1, min[1] - 1), 0);
  assert.equal(sample(max[0] + 1, max[1] + 1), 0);
  let highest = 0;
  for (let z = 0; z <= 40; z += 1) for (let x = 0; x <= 40; x += 1) {
    const h = sample(min[0] + (max[0] - min[0]) * x / 40, min[1] + (max[1] - min[1]) * z / 40);
    assert(Number.isFinite(h) && h >= 0 && h < 1);
    highest = Math.max(highest, h);
  }
  assert(highest > 0.1);
});

test('ruta visual: conserva anclas de kilómetros y elimina picos verticales sin enterrar la línea', () => {
  const { crearRutaVisualModelo } = require('../services/mapa3d/modeloMeshyCore');
  const conv = { aKm: x => x * 0.3, y: h => h * 0.004 };
  const sample = (x) => x > 0.12 && x < 0.15 ? 60 : 5;
  const route = crearRutaVisualModelo([[0,0,0],[0.5,0],[1,0,4],[1,1,19.4]], sample, conv);
  assert.equal(route[0].km, 0); assert.equal(route.at(-1).km, 19.4);
  const anchor = route.find(p => p.km === 4);
  assert.equal(anchor.x, 0.3); assert.equal(anchor.z, 0);
  for (let i = 0; i < route.length; i += 1) {
    const p = route[i]; assert(p.h >= sample(p.x) - 1e-8);
    if (!i) continue;
    const a = route[i - 1]; assert(p.km > a.km);
    const d = Math.hypot(p.x - a.x, p.z - a.z) / 0.3;
    assert(Math.abs(conv.y(p.h - a.h)) <= 0.35 * d + 1e-8);
  }
});

 test('entorno Dubrovnik: presupuesto móvil, geometría íntegra y plataforma libre para ciudad y puerto', () => {
  const meta = require('../assets/mapa3d/dubrovnik-entorno/meta');
  const buffers = Object.fromEntries(['position','normal','uv','index'].map(k => [k, require('../assets/mapa3d/dubrovnik-entorno/' + k)]));
  const mesh = decodificarModelo(meta, buffers);
  assert(meta.triangles < 150000);
  assert(mesh.index.every(i => i < meta.vertices));
  assert(mesh.position.every(Number.isFinite));
  let reserved = 0, mountain = 0;
  for (let i = 0; i < mesh.position.length; i += 3) {
    const [x,y,z] = mesh.position.subarray(i,i+3);
    if (x > -.95 && x < 2.05 && z > -1.14 && z < .37) { assert(y < -.027); reserved++; }
    mountain = Math.max(mountain,y);
  }
  assert(reserved > 100); assert(mountain > .5);
  const sample = crearMuestreadorModelo(meta);
  assert.equal(sample(.5,-.4),0);
 });

 test('Dubrovnik completo: un paisaje móvil íntegro con relieve y normales normalizadas', () => {
  const meta = require('../assets/mapa3d/dubrovnik-completo/meta');
  const buffers = Object.fromEntries(['position','normal','uv','index'].map(k => [k, require('../assets/mapa3d/dubrovnik-completo/' + k)]));
  const mesh = decodificarModelo(meta, buffers);
  assert(meta.triangles < 250000);
  assert(mesh.index.every(i => i < meta.vertices));
  assert(mesh.position.every(Number.isFinite));
  let valid=0;
  for(let i=0;i<meta.vertices;i++) {
    const length=Math.hypot(...mesh.normal.subarray(i*3,i*3+3))/127;
    if(length>.98 && length<1.02)valid++;
  }
  assert(valid/meta.vertices>.99);
  const sample=crearMuestreadorModelo(meta);
  let peak=0;
  const [min,max]=meta.heightBounds;
  for(let z=0;z<80;z++) for(let x=0;x<80;x++) {
    const h=sample(min[0]+(max[0]-min[0])*x/79,min[1]+(max[1]-min[1])*z/79);
    assert(Number.isFinite(h)); peak=Math.max(peak,h);
  }
  assert(peak>.85 && peak<1); // Original mountain, preserved without synthetic lift.
  assert(meta.min[1] > -.02); // Clipped base below the water datum.
  const { crearRutaVisualModelo } = require('../services/mapa3d/modeloMeshyCore');
  const conv = { aKm: x => x * .3, y: h => h * .004 };
  const route = crearRutaVisualModelo(meta.visualRoute, (x,z) => sample(x/.3,z/.3)/.004, conv);
  assert.deepEqual(meta.visualRoute.filter(p => Number.isFinite(p[2])).map(p => p[2]), [0,4,8,12,16,19.4]);
  assert.equal(route.at(-1).km,19.4);
  for (let i=0;i<route.length;i++) {
    const p=route[i]; assert(Number.isFinite(p.h));
    assert(p.h*.004 + 1e-7 >= sample(p.x/.3,p.z/.3));
    if(i)assert(p.km>route[i-1].km);
  }
 });



test('ruta Dubrovnik: superficie directa, checkpoints completos y sin la envolvente de cámara', () => {
  const meta=require('../assets/mapa3d/dubrovnik-completo/meta');
  const route=meta.visualSurfaceRoute;
  assert(route.length > 500);
  assert.equal(route[0].km,0); assert.equal(route.at(-1).km,19.4);
  for(let i=0;i<route.length;i++) {
    const p=route[i];assert([p.x,p.z,p.h,p.km].every(Number.isFinite));
    assert(p.h*.004 > .005 && p.h*.004 < .3);
    if(i)assert(p.km>route[i-1].km);
  }
  for(const km of [0,4,8,12,16,19.4])assert(route.some(p=>p.km===km));
});

test('gestos: arrastres repetidos y cambios de dedos conservan el control incremental', () => {
  const {muestraGesto,avanzarGesto}=require('../services/mapa3d/gestosCore');
  const options={ancho:350,alto:500,elevacionBase:Math.PI/4};
  let control={azimut:0,elevacion:0,zoom:1};
  for(let gesture=0;gesture<40;gesture++) {
    let previous=muestraGesto([{identifier:gesture,pageX:100,pageY:100}]);
    for(let step=1;step<=10;step++) {
      const current=muestraGesto([{identifier:gesture,pageX:100+step*2,pageY:100}]);
      const result=avanzarGesto(control,previous,current,options);
      assert(result.control.azimut<control.azimut);control=result.control;previous=current;
    }
    assert.equal(muestraGesto([]),null);
    const two=muestraGesto([{identifier:gesture,pageX:120,pageY:100},{identifier:90,pageX:180,pageY:100}]);
    assert.equal(avanzarGesto(control,previous,two,options).control,control);
  }
});

test('pin: el toque selecciona el centro más cercano y respeta los controles del mapa', () => {
  const {seleccionarPin}=require('../services/mapa3d/gestosCore');
  const a={id:'pile'},b={id:'stradun'};
  const overlay={pines:[{cp:a,cabeza:{x:100,y:120}},{cp:b,cabeza:{x:130,y:120}}],zonasHud:[{x:0,y:0,w:200,h:40}]};
  assert.equal(seleccionarPin(overlay,102,122),a);
  assert.equal(seleccionarPin(overlay,129,120),b);
  assert.equal(seleccionarPin(overlay,100,20),null);
  assert.equal(seleccionarPin(overlay,250,250),null);
});


test('composición Dubrovnik: fondo separado y casco original dentro del presupuesto móvil', () => {
  const city=require('../assets/mapa3d/dubrovnik-completo/meta');
  const meta=require('../assets/mapa3d/dubrovnik-revision-fondo/meta');
  const buffers=Object.fromEntries(['position','normal','uv','index'].map(k=>[k,require('../assets/mapa3d/dubrovnik-revision-fondo/'+k)]));
  const m=decodificarModelo(meta,buffers);
  assert(m.position.every(Number.isFinite));assert(m.index.every(i=>i<meta.vertices));
  assert(city.triangles+meta.triangles<280000);
  assert.equal(city.composition,'original-old-town + separately masked background');
  for(let i=0;i<m.position.length;i+=3) {
    const [x,y,z]=m.position.subarray(i,i+3);
    if(Math.abs(x)<1.56 && z>.9)assert(y<0); // No terrain overlapping the old town footprint.
  }
});
