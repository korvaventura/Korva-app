import * as THREE from 'three';
// Ambiente estático: no agrega loops de animación al Canvas en demanda.
export function crearAmbienteIslandia() {
  const grupo = new THREE.Group();
  for (let banda = 0; banda < 3; banda++) {
    const pos = [], uv = [], index = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64, x = (t - .5) * 14;
      const base = 1.2 + banda * .45 + Math.sin(t * 7 + banda) * .65;
      for (let j = 0; j < 2; j++) { pos.push(x, base + j * (1.4 + Math.sin(t * 12) * .3), 5.3 + banda * .5); uv.push(t, j); }
      if (i < 64) { const a = i * 2; index.push(a,a+1,a+2,a+1,a+3,a+2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2)); g.setIndex(index);
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { tono: { value: new THREE.Color(banda === 2 ? '#AA81DC' : '#5EDCB9') } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform vec3 tono;varying vec2 vUv;void main(){float a=sin(vUv.y*3.14159)*sin(vUv.x*3.14159);float rayos=.65+.35*sin(vUv.x*180.);gl_FragColor=vec4(tono,a*rayos*.25);}',
    });
    grupo.add(new THREE.Mesh(g,m));
  }
  for (const [x,z,sx,sz] of [[-2,-1.2,2.6,.8],[1.8,-1.8,2.2,.6],[-1.8,1.2,1.8,.5]]) {
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 vUv;void main(){float d=length((vUv-.5)*2.);float a=pow(max(0.,1.-d),2.)*.17;gl_FragColor=vec4(.65,.76,.82,a);}',
    });
    const niebla = new THREE.Mesh(new THREE.PlaneGeometry(sx,sz),m);
    niebla.rotation.x = -Math.PI/2; niebla.position.set(x,.55,z); grupo.add(niebla);
  }
  return grupo;
}
