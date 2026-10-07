// Keep both tubes static. Clip their UV arc-length on the GPU for a continuous tip.
export function configurarRutaContinua(material, avance, recorrido) {
  material.onBeforeCompile = shader => {
    shader.uniforms.korvaAvance = avance;
    shader.vertexShader = 'varying float korvaTramo;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nkorvaTramo = uv.x;');
    shader.fragmentShader = 'uniform float korvaAvance; varying float korvaTramo;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n' + (recorrido ? 'if (korvaTramo > korvaAvance) discard;' : 'if (korvaTramo <= korvaAvance) discard;'));
  };
  material.customProgramCacheKey = () => recorrido ? 'korva-ruta-hecha-continua-v1' : 'korva-ruta-pendiente-continua-v1';
  return material;
}
