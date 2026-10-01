import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

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
  estado('inicio three.js río Maule (Water class)');
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
  camera.lookAt(0, 10, 0);

  // --- SKY para reflejos en el agua ---
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
    if (pmremGenerator) pmremGenerator.dispose();
    pmremGenerator = new THREE.PMREMGenerator(renderer);
    const sceneEnv = new THREE.Scene();
    sceneEnv.add(sky);
    envMap = pmremGenerator.fromScene(sceneEnv).texture;
    pmremGenerator.dispose();
    if (water && water.material && water.material.uniforms) {
      water.material.uniforms['sunDirection'].value.copy(sun).normalize();
      water.material.uniforms['sunColor'].value.setHex(0x9a8a5a);
    }
  }
  updateSun();

  // --- AGUA: Water class de three.js (plano grande, reflejos automáticos) ---
  const waterGeometry = new THREE.PlaneGeometry(20000, 20000);

  const waterNormalsTexture = new THREE.TextureLoader().load(
    '/dinamica-maulina/images/waternormals.jpg',
    (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    }
  );

  water = new Water(waterGeometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: waterNormalsTexture,
    sunDirection: sun.clone().normalize(),
    sunColor: 0x9a8a5a,
    waterColor: 0x1a3a2e,
    distortionScale: 4.5,
    alpha: 0.75,
    fog: false,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  scene.add(water);

  // --- ORILLAS (bancos elevados) ---
  createBanks();

  // --- SEDIMENTO: partículas finas en el agua ---
  createSediment();

  // --- VEGETACIÓN en riberas ---
  createRiversideVegetation();

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

  // Path para cámara (río curvado)
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
  const riverPath = new THREE.CatmullRomCurve3(riverPoints);
  riverPath.closed = false;

  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!isVisible || !renderer || !scene || !camera || !water || !sky) return;
    const now = performance.now();
    const delta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    frameCount++;

    // Avanzar por el río (cámara sigue el camino)
    if (followRiver) {
      pathProgress = (pathProgress + delta * 0.012) % 1;
      const lookAhead = Math.min(pathProgress + 0.03, 1);
      const pos = riverPath.getPointAt(pathProgress);
      const lookPos = riverPath.getPointAt(lookAhead);
      camera.position.lerp(new THREE.Vector3(pos.x, pos.y + 18, pos.z + 12), 0.05);
      camera.lookAt(lookPos.x, lookPos.y + 0.5, lookPos.z);
    }

    // Animar agua (time uniform)
    if (water.material && water.material.uniforms) {
      water.material.uniforms.time.value += delta;
    }
    if (sky.material && sky.material.uniforms) {
      sky.material.uniforms['time'].value = now / 1000;
    }

    // Sedimento
    if (sedimentParticles) {
      const sedimentPositions = sedimentParticles.geometry.attributes.position.array;
      const sedimentVelocities = sedimentParticles.userData.velocities;
      const pos = riverPath.getPointAt(pathProgress);
      for (let i = 0; i < sedimentPositions.length; i += 3) {
        sedimentPositions[i] += sedimentVelocities[i] * delta * 12;
        sedimentPositions[i + 1] += sedimentVelocities[i + 1] * delta * 12;
        sedimentPositions[i + 2] += sedimentVelocities[i + 2] * delta * 12;
        if (Math.abs(sedimentPositions[i] - pos.x) > 120 ||
            Math.abs(sedimentPositions[i + 2] - pos.z) > 120) {
          const t = Math.random();
          const rp = riverPath.getPointAt(t);
          const tangent = riverPath.getTangentAt(t).normalize();
          const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
          const offset = normal.clone().multiplyScalar((Math.random() - 0.5) * 40);
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

function createBanks() {
  // Bancos simples a los lados del río
  const bankGeom = new THREE.BoxGeometry(20000, 3, 60);
  const bankMat = new THREE.MeshLambertMaterial({ color: 0x2a2218 });
  
  const leftBank = new THREE.Mesh(bankGeom, bankMat);
  leftBank.position.set(-55, 1.5, 0);
  leftBank.receiveShadow = true;
  scene.add(leftBank);
  
  const rightBank = new THREE.Mesh(bankGeom, bankMat);
  rightBank.position.set(55, 1.5, 0);
  rightBank.receiveShadow = true;
  scene.add(rightBank);
}

function createSediment() {
  const count = 2000;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const t = Math.random();
    const pos = new THREE.Vector3(
      (Math.random() - 0.5) * 100,
      0.05 + Math.random() * 0.15,
      (Math.random() - 0.5) * 2000 - 500
    );
    positions[i * 3] = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;
    sizes[i] = 0.03 + Math.random() * 0.06;
    const c = new THREE.Color(0x3a3018).lerp(new THREE.Color(0x5a4a2a), Math.random());
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    velocities[i * 3] = 0.3 + Math.random() * 0.4;
    velocities[i * 3 + 1] = 0;
    velocities[i * 3 + 2] = 0;
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

  const sedimentParticles = new THREE.Points(geom, mat);
  sedimentParticles.userData.velocities = velocities;
  sedimentParticles.renderOrder = 0;
  scene.add(sedimentParticles);
  
  // Guardar referencia global
  window.sedimentParticles = sedimentParticles;
}

function createRiversideVegetation() {
  const treeCount = 120;
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
    const x = (Math.random() - 0.5) * 100;
    const z = (Math.random() - 0.5) * 2000 - 500;
    const side = Math.random() > 0.5 ? 1 : -1;
    const offset = 70 + Math.random() * 20;
    
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.set(side * (offset + x), 1.4, z);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    trunk.rotation.z = (Math.random() - 0.5) * 0.12;
    scene.add(trunk);

    const foliage = new THREE.Mesh(foliageGeom, foliageMat);
    foliage.position.set(side * (offset + x), 3.2, z);
    foliage.castShadow = true;
    foliage.receiveShadow = true;
    foliage.rotation.y = Math.random() * Math.PI * 2;
    foliage.scale.setScalar(0.7 + Math.random() * 0.5);
    scene.add(foliage);

    if (Math.random() < 0.4) {
      const bushGeom = new THREE.SphereGeometry(0.35 + Math.random() * 0.25, 6, 5);
      const bushMat = new THREE.MeshStandardMaterial({ color: 0x1a2a12, roughness: 0.95 });
      const bush = new THREE.Mesh(bushGeom, bushMat);
      bush.position.set(side * (offset + x) + (Math.random() - 0.5) * 3, 0.4, z + (Math.random() - 0.5) * 3);
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

  if (water) {
    water.geometry.dispose();
    water.material?.dispose();
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