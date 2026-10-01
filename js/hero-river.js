import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

// ==================== SHADERS (declarados ANTES de usarse) ====================

const riverVertexShader = `
  uniform float time;
  uniform float flowSpeed;
  uniform vec3 flowDirection;
  attribute vec3 flowDir;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vFlowDir;

  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>

  void main() {
    vUv = uv;
    vFlowDir = normalize(flowDir);

    // Ondulación vertical suave (olas de río)
    float wave = sin(uv.y * 40.0 + time * 3.5) * 0.025 +
                 sin(uv.y * 18.0 - time * 2.1) * 0.018 +
                 sin(uv.x * 30.0 + time * 1.7) * 0.012;

    vec3 pos = position;
    pos.y += wave;

    // Micro-desplazamiento en dirección del flujo
    pos.x += sin(uv.y * 25.0 + time * 4.0) * 0.008 * flowDir.x;
    pos.z += sin(uv.y * 25.0 + time * 4.0) * 0.008 * flowDir.z;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);

    gl_Position = projectionMatrix * mvPosition;

    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }
`;

const riverFragmentShader = `
  uniform float time;
  uniform float flowSpeed;
  uniform vec3 flowDirection;
  uniform vec3 waterColor;
  uniform vec3 deepColor;
  uniform vec3 shallowColor;
  uniform vec3 foamColor;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  uniform float distortionScale;
  uniform sampler2D normalSampler;
  uniform samplerCube envMap;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vFlowDir;

  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>

  vec3 perturbNormal(vec3 N, vec3 V, vec2 uv, float strength) {
    vec3 map = texture2D(normalSampler, uv * distortionScale + vec2(time * 0.08, 0.0)).rgb;
    map = map * 2.0 - 1.0;
    map.xy *= strength;
    vec3 binormal = normalize(cross(N, vFlowDir));
    vec3 tangent = normalize(cross(binormal, N));
    mat3 tbn = mat3(tangent, binormal, N);
    return normalize(tbn * map);
  }

  void main() {
    #include <logdepthbuf_fragment>

    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPosition);

    // Normal perturbada por flow normal map
    vec3 Np = perturbNormal(N, V, vUv, 0.65);

    // Profundidad basada en coordenada V (y del UV)
    float depth = smoothstep(0.0, 1.0, vUv.y);
    depth = pow(depth, 0.7);

    // Color base: shallow -> deep
    vec3 baseColor = mix(shallowColor, deepColor, depth);

    // Reflexión especular del sol (Fresnel)
    float fresnel = pow(1.0 - max(dot(V, Np), 0.0), 4.0);
    vec3 sunReflection = sunColor * fresnel * 0.30 * (1.0 - depth * 0.3);

    // Reflexión del environment map (cielo + árboles) - manual
    vec3 reflectVec = reflect(-V, Np);
    vec3 envReflection = textureCube(envMap, reflectVec).rgb;

    // Espuma en zonas rápidas / bordes (basado en pendiente de normales)
    float slope = 1.0 - abs(Np.y);
    float foam = smoothstep(0.25, 0.55, slope) * (0.3 + sin(vUv.y * 60.0 + time * 5.0) * 0.15);
    foam *= 1.0 - depth * 0.6;

    // Caustics sutiles
    float caustic = sin(vWorldPosition.x * 8.0 + time * 2.0) *
                    sin(vWorldPosition.z * 8.0 - time * 1.5) * 0.02;

    // Combinar: base + sun reflection + envMap reflection + foam + caustic
    vec3 color = baseColor + sunReflection + envReflection * fresnel * 0.35 * (1.0 - depth * 0.3) + foamColor * foam + vec3(caustic);

    gl_FragColor = vec4(color, 0.80);

    #include <tonemapping_fragment>
    #include <fog_fragment>
  }
`;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

function estado(msg) {
  console.info('[dm-river]', msg);
}

const canvas = document.querySelector('#hero-three');
if (!canvas) {
  console.error('[dm-river] canvas #hero-three no encontrado');
}

let renderer = null, scene = null, camera = null, water = null, sky = null;
let riverPath = null, riverMesh = null, banksMesh = null;
let sedimentParticles = null;
let rafId = 0, lastTime = performance.now();
let isVisible = true, followRiver = true;
let pathProgress = 0;
let resizeObserver = null, intersectionObserver = null;
let frameCount = 0, shaderErrors = 0;

const motionAllowed = !prefersReducedMotion();
const webglOk = hasWebGL();

if (!motionAllowed || !webglOk) {
  estado('fallback: reduced-motion=' + !motionAllowed + ' webgl=' + !webglOk);
  document.documentElement.classList.add('hero--sin-agua');
} else {
  estado('inicio three.js río Maule');
  initRiver();
}

function initRiver() {
  const container = canvas.parentElement;
  if (!container) {
    console.error('[dm-river] canvas sin parentElement');
    return;
  }

  const width = canvas.clientWidth || container.clientWidth;
  const height = canvas.clientHeight || container.clientHeight;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1f1a);

  camera = new THREE.PerspectiveCamera(55, width / height, 0.5, 5000);
  camera.position.set(0, 25, 60);

  // --- RÍO: CURVA NATURAL (CatmullRom) ---
  const riverPoints = [
    new THREE.Vector3(-200, 0, -300),
    new THREE.Vector3(-80, 0, -180),
    new THREE.Vector3(20, 0, -60),
    new THREE.Vector3(60, 0, 40),
    new THREE.Vector3(30, 0, 150),
    new THREE.Vector3(-40, 0, 280),
    new THREE.Vector3(-120, 0, 420),
    new THREE.Vector3(-200, 0, 550),
    new THREE.Vector3(-150, 0, 700),
    new THREE.Vector3(20, 0, 850),
    new THREE.Vector3(120, 0, 1000),
    new THREE.Vector3(80, 0, 1200),
  ];
  riverPath = new THREE.CatmullRomCurve3(riverPoints);
  riverPath.closed = false;

  // Geometría del agua: Ribbon ancho y largo siguiendo la curva
  const riverWidth = 55;
  const segments = 400;
  const riverGeom = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];
  const flowDirs = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pos = riverPath.getPointAt(t);
    const tangent = riverPath.getTangentAt(t).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x); // perpendicular horizontal

    const left = pos.clone().addScaledVector(normal, -riverWidth);
    const right = pos.clone().addScaledVector(normal, riverWidth);

    positions.push(left.x, left.y - 0.15, left.z);
    positions.push(right.x, right.y - 0.15, right.z);

    uvs.push(0, t);
    uvs.push(1, t);

    flowDirs.push(tangent.x, tangent.y, tangent.z);
    flowDirs.push(tangent.x, tangent.y, tangent.z);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    indices.push(a, c, b);
    indices.push(b, c, d);
  }

  riverGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  riverGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  riverGeom.setAttribute('flowDir', new THREE.Float32BufferAttribute(flowDirs, 3));
  riverGeom.setIndex(indices);
  riverGeom.computeVertexNormals();

  // Normal map de flujo direccional (procedural)
  const flowNormalMap = createFlowNormalMap(512, 512);
  flowNormalMap.wrapS = flowNormalMap.wrapT = THREE.RepeatWrapping;

  // Sky + PMREM para environment map (reflejos en el agua)
  sky = new Sky();
  sky.scale.setScalar(4000);
  scene.add(sky);
  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 8;
  skyUniforms['rayleigh'].value = 2.5;
  skyUniforms['mieCoefficient'].value = 0.004;
  skyUniforms['mieDirectionalG'].value = 0.75;
  skyUniforms['cloudCoverage'].value = 0.15;
  skyUniforms['cloudDensity'].value = 0.2;
  skyUniforms['cloudElevation'].value = 0.45;

  const sun = new THREE.Vector3();
  let pmremGenerator = null;
  let envMap = null;

  function updateSun() {
    const elevation = 22;
    const azimuth = 200;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    if (sky && sky.material && sky.material.uniforms) {
      sky.material.uniforms['sunPosition'].value.copy(sun);
    }
    // Regenerar PMREM cuando cambia el sol
    if (pmremGenerator) pmremGenerator.dispose();
    pmremGenerator = new THREE.PMREMGenerator(renderer);
    const sceneEnv = new THREE.Scene();
    sceneEnv.add(sky);
    envMap = pmremGenerator.fromScene(sceneEnv).texture;
    pmremGenerator.dispose();
  }
  updateSun();

  // ShaderMaterial custom con envMap nativo de Three.js
  const waterUniforms = {
    time: { value: 0 },
    flowSpeed: { value: 0.8 },
    flowDirection: { value: new THREE.Vector3(1, 0, 0) },
    waterColor: { value: new THREE.Color(0x1a4a2e) },
    deepColor: { value: new THREE.Color(0x1a3a2e) },
    shallowColor: { value: new THREE.Color(0x2a5a3e) },
    foamColor: { value: new THREE.Color(0x3a5a4a) },
    sunColor: { value: new THREE.Color(0x9a8a5a) },
    sunDirection: { value: new THREE.Vector3(0.3, 0.7, 0.2).normalize() },
    distortionScale: { value: 6.5 },
    normalSampler: { value: flowNormalMap },
    // alpha se maneja via material.transparent = true
  };

  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: riverVertexShader,
    fragmentShader: riverFragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    fog: false,
  });

  // envMap nativo de Three.js (maneja binding a TEXTURE_CUBE_MAP automáticamente)
  waterMaterial.envMap = envMap;
  waterMaterial.envMapIntensity = 0.35;

  riverMesh = new THREE.Mesh(riverGeom, waterMaterial);
  riverMesh.renderOrder = 1;
  scene.add(riverMesh);

  // --- ORILLAS (bancos elevados con ruido) ---
  createBanks(riverPath, riverWidth, segments);

  // --- SEDIMENTO: partículas finas en el agua ---
  createSediment(riverPath, riverWidth, segments);

  // Luces
  const hemiLight = new THREE.HemisphereLight(0x6a8a6a, 0x1a3a1a, 0.7);
  scene.add(hemiLight);
  const dirLight = new THREE.DirectionalLight(0x9a8a5a, 1.3);
  dirLight.position.set(150, 300, 80);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.near = 10;
  dirLight.shadow.camera.far = 500;
  dirLight.shadow.camera.left = -200;
  dirLight.shadow.camera.right = 200;
  dirLight.shadow.camera.top = 200;
  dirLight.shadow.camera.bottom = -200;
  scene.add(dirLight);

  // Vegetación simple en orillas (árboles bajos)
  createRiversideVegetation(riverPath, riverWidth + 8);

  renderer.setClearColor(0x0d1f1a, 1);

  function handleResize() {
    const w = canvas.clientWidth || container.clientWidth;
    const h = canvas.clientHeight || container.clientHeight;
    if (camera && renderer) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  }

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
  } else {
    window.addEventListener('resize', handleResize);
  }

  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver(
      ([entry]) => { isVisible = entry.isIntersecting; },
      { threshold: 0 }
    );
    intersectionObserver.observe(container);
  }

  // Interacción: click/touch pausa seguimiento de cámara
  canvas.addEventListener('pointerdown', () => { followRiver = !followRiver; });
  canvas.style.cursor = followRiver ? 'grab' : 'crosshair';

  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!isVisible || !renderer || !scene || !camera || !riverMesh || !sky) return;
    const now = performance.now();
    const delta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    frameCount++;

    // Posición actual en el río (siempre disponible para sedimentos)
    const pos = riverPath.getPointAt(pathProgress);

    // Avanzar por el río
    if (followRiver) {
      pathProgress = (pathProgress + delta * 0.015) % 1;
      const lookAhead = Math.min(pathProgress + 0.03, 1);
      const lookPos = riverPath.getPointAt(lookAhead);
      camera.position.lerp(new THREE.Vector3(pos.x, pos.y + 18, pos.z + 12), 0.05);
      camera.lookAt(lookPos.x, lookPos.y + 0.5, lookPos.z);
    }

    // Uniformes de agua (ShaderMaterial custom)
    if (riverMesh && riverMesh.material && riverMesh.material.uniforms) {
      riverMesh.material.uniforms.time.value += delta;
      riverMesh.material.uniforms.sunDirection.value.copy(sun).normalize();
    }
    if (sky.material && sky.material.uniforms) {
      sky.material.uniforms['time'].value = now / 1000;
    }

    // Sedimento
    if (sedimentParticles) {
      const sedimentPositions = sedimentParticles.geometry.attributes.position.array;
      const sedimentVelocities = sedimentParticles.userData.velocities;
      for (let i = 0; i < sedimentPositions.length; i += 3) {
        sedimentPositions[i] += sedimentVelocities[i] * delta * 12;
        sedimentPositions[i + 1] += sedimentVelocities[i + 1] * delta * 12;
        sedimentPositions[i + 2] += sedimentVelocities[i + 2] * delta * 12;
        // Reciclar partículas que se alejan
        if (Math.abs(sedimentPositions[i] - pos.x) > 120 ||
            Math.abs(sedimentPositions[i + 2] - pos.z) > 120) {
          const t = Math.random();
          const rp = riverPath.getPointAt(t);
          const tangent = riverPath.getTangentAt(t).normalize();
          const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
          const offset = normal.clone().multiplyScalar((Math.random() - 0.5) * riverWidth * 0.8);
          sedimentPositions[i] = rp.x + offset.x;
          sedimentPositions[i + 1] = rp.y + 0.05 + Math.random() * 0.15;
          sedimentPositions[i + 2] = rp.z + offset.z;
          sedimentVelocities[i] = tangent.x * (0.3 + Math.random() * 0.4);
          sedimentVelocities[i + 1] = 0;
          sedimentVelocities[i + 2] = tangent.z * (0.3 + Math.random() * 0.4);
        }
      }
      sedimentParticles.geometry.attributes.position.needsUpdate = true;
      sedimentParticles.rotation.y += delta * 0.002;
    }

    try {
      renderer.render(scene, camera);
    } catch (e) {
      shaderErrors++;
      console.error('[dm-river] render error', e);
    }
  }

  animate();
  canvas.addEventListener('webglcontextlost', onContextLost);
  startDiagnostics();
}

function createFlowNormalMap(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Flujo principal en Y (v) + turbulencia en X (u)
      const flowV = Math.sin(y * 0.04) * 0.3 + Math.sin(y * 0.012 + x * 0.008) * 0.15;
      const flowU = Math.sin(x * 0.03 + y * 0.005) * 0.12 + Math.sin(x * 0.015) * 0.08;
      // Ruido de alta frecuencia para micro-turbulencia
      const noise = (Math.random() - 0.5) * 0.06;
      const nx = 128 + (flowU + noise) * 128;
      const ny = 128 + (flowV + noise) * 128;
      const nz = Math.sqrt(Math.max(0, 1 - (nx - 128) * (nx - 128) / 16384 - (ny - 128) * (ny - 128) / 16384)) * 128 + 128;
      data[i] = nx;
      data[i + 1] = ny;
      data[i + 2] = nz;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createBanks(path, halfWidth, segments) {
  const bankGeom = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];
  const colors = [];

  const bankHeight = 2.2;
  const bankWidth = halfWidth * 0.45;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pos = path.getPointAt(t);
    const tangent = path.getTangentAt(t).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

    // Noise para variación natural
    const noise1 = Math.sin(t * 40) * 0.3 + Math.sin(t * 17) * 0.15;
    const noise2 = Math.sin(t * 40 + 1.3) * 0.3 + Math.sin(t * 17 + 2.1) * 0.15;
    const w1 = bankWidth + noise1;
    const w2 = bankWidth + noise2;

    const leftBase = pos.clone().addScaledVector(normal, -halfWidth - w1);
    const leftTop = leftBase.clone();
    leftTop.y = bankHeight + Math.abs(noise1) * 0.8;

    const rightBase = pos.clone().addScaledVector(normal, halfWidth + w2);
    const rightTop = rightBase.clone();
    rightTop.y = bankHeight + Math.abs(noise2) * 0.8;

    // Colores tierra/arena
    const cBase = new THREE.Color(0x2a2218).lerp(new THREE.Color(0x3a2e1e), Math.random() * 0.5);
    const cTop = new THREE.Color(0x2a281a).lerp(new THREE.Color(0x3a321a), Math.random() * 0.5);

    positions.push(leftBase.x, leftBase.y, leftBase.z);
    positions.push(leftTop.x, leftTop.y, leftTop.z);
    positions.push(rightTop.x, rightTop.y, rightTop.z);
    positions.push(rightBase.x, rightBase.y, rightBase.z);

    uvs.push(0, t, 0.5, t, 0.5, t, 1, t);
    colors.push(cBase.r, cBase.g, cBase.b);
    colors.push(cTop.r, cTop.g, cTop.b);
    colors.push(cTop.r, cTop.g, cTop.b);
    colors.push(cBase.r, cBase.g, cBase.b);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 4;
    const b = i * 4 + 1;
    const c = i * 4 + 2;
    const d = i * 4 + 3;
    const na = (i + 1) * 4;
    const nb = (i + 1) * 4 + 1;
    const nc = (i + 1) * 4 + 2;
    const nd = (i + 1) * 4 + 3;

    // Lado izquierdo (cara externa)
    indices.push(a, na, b);
    indices.push(b, na, nb);
    // Lado derecho (cara externa)
    indices.push(d, c, nd);
    indices.push(c, nc, nd);

    // Top faces: skip for last segment to avoid out-of-bounds (na+4 would be 1604, max is 1603)
    if (i < segments - 1) {
      // Top left
      indices.push(b, nb, a + 4);
      indices.push(nb, na + 4, b + 4);
      // Top right
      indices.push(c, c + 4, nc);
      indices.push(c + 4, nd, nc);
    }
  }

  bankGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bankGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  bankGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  bankGeom.setIndex(indices);
  bankGeom.computeVertexNormals();

  const bankMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  banksMesh = new THREE.Mesh(bankGeom, bankMat);
  banksMesh.receiveShadow = true;
  banksMesh.castShadow = true;
  scene.add(banksMesh);
}

function createSediment(path, halfWidth, segments) {
  const count = 3500;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);

  const pos = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const t = Math.random();
    path.getPointAt(t, pos);
    path.getTangentAt(t, tangent).normalize();
    normal.set(-tangent.z, 0, tangent.x);

    const offset = normal.clone().multiplyScalar((Math.random() - 0.5) * halfWidth * 0.85);
    positions[i * 3] = pos.x + offset.x;
    positions[i * 3 + 1] = pos.y + 0.05 + Math.random() * 0.12;
    positions[i * 3 + 2] = pos.z + offset.z;

    sizes[i] = 0.03 + Math.random() * 0.06;

    const c = new THREE.Color(0x3a3018).lerp(new THREE.Color(0x5a4a2a), Math.random());
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    velocities[i * 3] = tangent.x * (0.25 + Math.random() * 0.35);
    velocities[i * 3 + 1] = 0;
    velocities[i * 3 + 2] = tangent.z * (0.25 + Math.random() * 0.35);
  }

  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.18,
    vertexColors: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    sizeAttenuation: true,
  });

  sedimentParticles = new THREE.Points(geom, mat);
  sedimentParticles.userData.velocities = velocities;
  sedimentParticles.renderOrder = 0;
  scene.add(sedimentParticles);
}

function createRiversideVegetation(path, startOffset) {
  const treeCount = 180;
  const trunkGeom = new THREE.CylinderGeometry(0.25, 0.45, 2.8, 6);
  const foliageGeom = new THREE.ConeGeometry(0.9, 2.2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.95 });
  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0x1a3a1a,
    roughness: 0.9,
    metalness: 0.0,
  });

  for (let i = 0; i < treeCount; i++) {
    const t = Math.random();
    const pos = path.getPointAt(t);
    const tangent = path.getTangentAt(t).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const side = Math.random() > 0.5 ? 1 : -1;
    const offset = startOffset + Math.random() * 12;
    const treePos = pos.clone().addScaledVector(normal, side * offset);
    treePos.y = 0;

    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.copy(treePos);
    trunk.position.y = 1.4;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    trunk.rotation.z = (Math.random() - 0.5) * 0.12;
    scene.add(trunk);

    const foliage = new THREE.Mesh(foliageGeom, foliageMat);
    foliage.position.copy(treePos);
    foliage.position.y = 3.2;
    foliage.castShadow = true;
    foliage.receiveShadow = true;
    foliage.rotation.y = Math.random() * Math.PI * 2;
    foliage.scale.setScalar(0.7 + Math.random() * 0.5);
    scene.add(foliage);

    // Arbustos pequeños
    if (Math.random() < 0.4) {
      const bushGeom = new THREE.SphereGeometry(0.35 + Math.random() * 0.25, 6, 5);
      const bushMat = new THREE.MeshStandardMaterial({
        color: 0x1a2a12,
        roughness: 0.95,
      });
      const bush = new THREE.Mesh(bushGeom, bushMat);
      bush.position.set(treePos.x + (Math.random() - 0.5) * 3, 0.4, treePos.z + (Math.random() - 0.5) * 3);
      bush.scale.set(1, 0.6, 1);
      bush.castShadow = true;
      scene.add(bush);
    }
  }
}

function onContextLost(e) {
  e.preventDefault();
  estado('webglcontextlost');
  cleanup();
}

function cleanup() {
  cancelAnimationFrame(rafId);
  resizeObserver?.disconnect();
  intersectionObserver?.disconnect();

  if (riverMesh) {
    riverMesh.geometry.dispose();
    riverMesh.material.dispose();
  }
  if (banksMesh) {
    banksMesh.geometry.dispose();
    banksMesh.material.dispose();
  }
  if (sedimentParticles) {
    sedimentParticles.geometry.dispose();
    sedimentParticles.material.dispose();
  }
  if (sky) {
    sky.material?.dispose();
    sky.geometry?.dispose();
  }
  if (renderer) {
    renderer.dispose();
  }
}

function startDiagnostics() {
  setTimeout(async () => {
    const cs = getComputedStyle(canvas);
    let px = null;
    try {
      const w = canvas.width;
      const h = canvas.height;
      if (w > 0 && h > 0) {
        const tmp = document.createElement('canvas');
        tmp.width = w; tmp.height = h;
        const ctx = tmp.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(canvas, 0, 0);
        const d = ctx.getImageData(0, 0, w, h).data;
        let painted = 0;
        const cols = {};
        for (let i = 0; i < d.length; i += 40) {
          if (d[i] || d[i + 1] || d[i + 2]) painted++;
          const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
          cols[k] = (cols[k] || 0) + 1;
        }
        const top = Object.entries(cols).sort((a, z) => z[1] - a[1]).slice(0, 6).map(e => e[0]);
        const grid = [];
        const r = 6, c = 8;
        for (let y = 0; y < r; y++) {
          const row = [];
          for (let x = 0; x < c; x++) {
            const yi = Math.min(h - 1, Math.floor(((y + 0.5) / r) * h));
            const xi = Math.min(w - 1, Math.floor(((x + 0.5) / c) * w));
            const i = (yi * w + xi) * 4;
            row.push(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
          }
          grid.push(row.join(' '));
        }
        px = JSON.stringify({ w, h, painted, top, grid });
      }
    } catch (e) { px = 'err:' + e.message }

    console.info('[dm-river] check:', JSON.stringify({
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      display: cs.display,
      css: canvas.clientWidth + 'x' + canvas.clientHeight,
      buf: canvas.width + 'x' + canvas.height,
      hero: canvas.className,
      reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
      scrollW: document.documentElement.scrollWidth,
      frames: frameCount,
      shaderErrors,
      followRiver,
      pathProgress: pathProgress.toFixed(3),
      px,
    }));
  }, 7000);
}

window.addEventListener('beforeunload', cleanup);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cleanup();
});