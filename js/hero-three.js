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
  console.info('[dm-three]', msg);
}

const canvas = document.querySelector('#hero-three');
if (!canvas) {
  console.error('[dm-three] canvas #hero-three no encontrado');
}

let renderer = null, scene = null, camera = null, water = null, sky = null, renderTarget = null;
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

  camera = new THREE.PerspectiveCamera(55, width / height, 1, 20000);
  // Cámara a ras de agua mirando al horizonte para que el agua llene el hero
  camera.position.set(0, 5, 80);
  camera.lookAt(0, 3, 0);

  const sun = new THREE.Vector3();

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
    sunDirection: new THREE.Vector3(),
    sunColor: 0xd0560f,
    waterColor: 0x0a2c4d,
    distortionScale: 3.7,
    fog: false,
  });
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 10;
  skyUniforms['rayleigh'].value = 2;
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.8;
  skyUniforms['cloudCoverage'].value = 0.4;
  skyUniforms['cloudDensity'].value = 0.5;
  skyUniforms['cloudElevation'].value = 0.5;

  function updateSun() {
    const elevation = 2;
    const azimuth = 180;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    if (sky && sky.material && sky.material.uniforms) {
      sky.material.uniforms['sunPosition'].value.copy(sun);
    }
    if (water && water.material && water.material.uniforms) {
      water.material.uniforms['sunDirection'].value.copy(sun).normalize();
    }

    if (renderTarget) renderTarget.dispose();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const sceneEnv = new THREE.Scene();
    sceneEnv.add(sky);
    renderTarget = pmremGenerator.fromScene(sceneEnv);
    scene.environment = renderTarget.texture;
    pmremGenerator.dispose();
  }

  updateSun();

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
    if (!isVisible || !renderer || !scene || !camera || !water || !sky) return;
    const now = performance.now();
    const delta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    frameCount++;
    if (water.material && water.material.uniforms) {
      water.material.uniforms['time'].value += delta;
    }
    if (sky.material && sky.material.uniforms) {
      sky.material.uniforms['time'].value = now / 1000;
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
  if (sky) {
    sky.material?.dispose();
    sky.geometry?.dispose();
  }
  if (renderTarget) renderTarget.dispose();
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