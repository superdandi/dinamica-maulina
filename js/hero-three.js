import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';

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
  console.info('[dm-three]', msg);
}

const canvas = document.querySelector('#hero-three');
if (!canvas) {
  console.error('[dm-three] canvas #hero-three no encontrado');
}

let renderer = null, scene = null, camera = null, water = null;
let rafId = 0;
let lastTime = performance.now();
let isVisible = true;
let resizeObserver = null;
let intersectionObserver = null;
let frameCount = 0;
let shaderErrors = 0;

const motionAllowed = !prefersReducedMotion();
const webglOk = hasWebGL();

if (!motionAllowed || !webglOk) {
  estado('fallback: reduced-motion=' + !motionAllowed + ' webgl=' + !webglOk);
  document.documentElement.classList.add('hero--sin-agua');
} else {
  estado('inicio three.js water+sky');
  initThree();
}

function initThree() {
  const container = canvas.parentElement;
  if (!container) {
    console.error('[dm-three] canvas sin parentElement');
    return;
  }

  const width = canvas.clientWidth || container.clientWidth;
  const height = canvas.clientHeight || container.clientHeight;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.28;

scene = new THREE.Scene();
  // Color de fondo para que el agua tenga qué reflejar (sin Sky)
  scene.background = new THREE.Color(0x0a2c4d);

  camera = new THREE.PerspectiveCamera(55, width / height, 1, 20000);
  // Cámara arriba mirando hacia abajo para que el agua llene todo el hero
  camera.position.set(0, 120, 0);
  camera.lookAt(0, 0, 0);

  // Luces para que el agua se vea (color base + normales + especular)
  const hemiLight = new THREE.HemisphereLight(0x88ccff, 0x0a2c4d, 0.6);
  scene.add(hemiLight);
  const dirLight = new THREE.DirectionalLight(0xd0560f, 1.2);
  dirLight.position.set(100, 200, 50);
  scene.add(dirLight);

  const sun = new THREE.Vector3(0.3, 0.7, 0.3).normalize();

  const waterGeometry = new THREE.PlaneGeometry(10000, 10000);

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
    sunDirection: sun.clone(),
    sunColor: 0xd0560f,
    waterColor: 0x0a2c4d,
    distortionScale: 3.7,
    fog: false,
  });
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  // Domo de cielo simple para que el agua tenga qué reflejar (gradiente petróleo → más claro)
  const skyGeometry = new THREE.SphereGeometry(5000, 32, 16);
  const skyMaterial = new THREE.MeshBasicMaterial({
    color: 0x1a3a5c,
    side: THREE.BackSide,
    fog: false,
  });
  const skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
  scene.add(skyDome);

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
      ([entry]) => {
        isVisible = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(container);
  }

  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!isVisible || !renderer || !scene || !camera || !water) return;
    const now = performance.now();
    const delta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    frameCount++;
    if (water.material && water.material.uniforms) {
      water.material.uniforms['time'].value += delta;
    }
    try {
      renderer.render(scene, camera);
    } catch (e) {
      shaderErrors++;
      console.error('[dm-three] render error', e);
    }
  }

  animate();

  canvas.addEventListener('webglcontextlost', onContextLost);

  startDiagnostics();
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
    const mirrorSampler = water.material?.uniforms?.['mirrorSampler']?.value;
    mirrorSampler?.dispose();
    water.material?.dispose();
  }
  if (scene) scene.environment = null;
  if (renderer) {
    renderer.dispose();
  }
}

function startDiagnostics() {
  setTimeout(async () => {
    const cs = getComputedStyle(canvas);
    let px = null;
    let rtres = null;
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

    console.info('[dm-three] check:', JSON.stringify({
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
      px,
    }));
  }, 7000);
}

window.addEventListener('beforeunload', cleanup);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cleanup();
});