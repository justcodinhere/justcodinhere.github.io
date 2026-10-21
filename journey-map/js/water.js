// Water: rivers along the routes (and, later, river surfaces in the towns).
// create(ctx) returns { riverRibbon(path, worldW, name), update(dt, alt), onPack(name, pack), onCity(on) }.
export default function create(ctx) {
  const { THREE, uni, NOISE, ribbonVS, ribbonGeom, scene, ribbonMeshes } = ctx;
  function riverRibbon(path, worldW) {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...uni, uWorldW: { value: worldW }, uMinPx: { value: 1.2 }, uMaxPx: { value: 10 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: ribbonVS,
      fragmentShader: NOISE + `uniform float uTime,uAlt; varying float vU, vSide;
        void main(){
          float edge=1.-smoothstep(.45,1.,abs(vSide));
          float flow=vnoise(vec3(vU*1.6-uTime*.9, vSide*2., 0.))*.6+vnoise(vec3(vU*5.-uTime*2.6, vSide*5., 3.))*.4;
          vec3 c=mix(vec3(.10,.20,.22),vec3(.42,.52,.58),smoothstep(.55,.85,flow)*.6);
          float a=edge*.75*(1.-smoothstep(500.,1400.,uAlt));
          gl_FragColor=vec4(c,a); 
  #include <tonemapping_fragment>
        gl_FragColor=linearToOutputTexel(gl_FragColor);
        }`,
    });
    const mesh = new THREE.Mesh(ribbonGeom(path), m); mesh.renderOrder = 1; mesh.frustumCulled = false; scene.add(mesh); ribbonMeshes.push(mesh);
  }

  return { riverRibbon };
}
