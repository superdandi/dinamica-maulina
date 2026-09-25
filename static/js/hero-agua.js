import * as THREE from 'three'
import { Water } from 'three/addons/objects/Water.js'

;(() => {
  const canvas = document.getElementById('hero-agua')
  const hero = canvas ? canvas.parentElement : null
  if (!canvas || !hero) return

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches
  const composition = (hero.dataset.agua || 'horizon') === 'agua' ? 'agua' : 'horizon'

  if (reduce || !supportsWebGL()) {
    hero.classList.add('hero--sin-agua')
    return
  }

  const PALETA = {
    sol: 0xfff6e8,
    agua: 0x14556c,
    nadir: 0x1f6e8c
  }
  const CIELO_CSS = ['#fdf7ee', '#f7ebd6', '#f2e6cf', '#bfd9dd', '#5f92a3', '#1f6e8c']
  const SOL_CSS_FULL = 'rgba(255,250,240,1)'
  const SOL_CSS_SOFT = 'rgba(255,246,232,.85)'
  const SOL_CSS_CLEAR = 'rgba(255,246,232,0)'

  const camPos = new THREE.Vector3(0, composition ? 8.5 : 1.7, composition ? 5.0 : 9.0)
  const camTarget = new THREE.Vector3(0, composition ? 0 : 1.2, -18)
  const sunDir = new THREE.Vector3(0.5, 0.52, 0.69).normalize()

  let renderer = null
  let scene = null
  let camera = null
  let water = null
  let sun = null
  let running = false
  let rafId = 0
  let tPrev = performance.now()
  const mouse = { x: 0, y: 0 }

  boot()

  function boot() {
    const dpr = Math.min(coarse ? 1.25 : 1.5, window.devicePixelRatio || 1)
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(dpr)
    renderer.setClearColor(PALETA.nadir, 1)

    scene = new THREE.Scene()
    scene.background = makeSkyTexture()

    camera = new THREE.PerspectiveCamera(composition ? 55 : 62, 1, 0.1, 800)
    camera.position.copy(camPos)
    camera.lookAt(camTarget)
    renderer.domElement.addEventListener('webglcontextlost', onContextLost)

    water = new Water(new THREE.PlaneGeometry(320, 320), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: makeNormalsTexture(),
      sunDirection: sunDir.clone(),
      sunColor: PALETA.sol,
      waterColor: PALETA.agua,
      distortionScale: composition ? 5.0 : 3.6,
      fog: false
    })
    water.rotation.x = -Math.PI / 2
    scene.add(water)

    sun = new THREE.Mesh(
      new THREE.CircleGeometry(composition ? 6 : 7, 32),
      new THREE.MeshBasicMaterial({ map: makeGlowTexture(), transparent: true, depthWrite: false, color: PALETA.sol })
    )
    sun.position.copy(camPos.clone().addScaledVector(sunDir, 320))
    sun.lookAt(camPos)
    scene.add(sun)

    resize()
    watchSize()
    watchVisibility()
    window.addEventListener('pointermove', onPointer, { passive: true })

    running = true
    loop()
  }

  function loop() {
    rafId = requestAnimationFrame(loop)
    if (!running || !renderer || !water) return
    const now = performance.now()
    const dt = Math.min((now - tPrev) / 1000, 0.05)
    tPrev = now
    water.material.uniforms['time'].value += dt

    const px = camPos.x + mouse.x * 0.5
    const py = camPos.y + mouse.y * 0.12 * (composition ? 0 : 1)
    camera.position.x += (px - camera.position.x) * 0.05
    camera.position.y += (py - camera.position.y) * 0.05
    camera.position.z += (camPos.z - camera.position.z) * 0.05
    camera.lookAt(camTarget)

    renderer.render(scene, camera)
  }

  function onPointer(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1
  }

  function resize() {
    if (!renderer || !camera) return
    const w = hero.clientWidth
    const h = hero.clientHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  function watchSize() {
    if (!('ResizeObserver' in window)) {
      window.addEventListener('resize', resize)
      return
    }
    const ro = new ResizeObserver(resize)
    ro.observe(hero)
  }

  function watchVisibility() {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        for (const en of entries) running = en.isIntersecting
      }, { threshold: 0.05 })
      io.observe(hero)
    }
    document.addEventListener('visibilitychange', () => {
      running = document.visibilityState === 'visible'
    })
  }

  function onContextLost(e) {
    e.preventDefault()
    running = false
    cancelAnimationFrame(rafId)
    hero.classList.add('hero--sin-agua')
  }

  function supportsWebGL() {
    try {
      const c = document.createElement('canvas')
      return !!c.getContext('webgl2')
    } catch (_) {
      return false
    }
  }

  function makeSkyTexture() {
    const c = document.createElement('canvas')
    c.width = 2
    c.height = 256
    const ctx = c.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0.0, CIELO_CSS[0])
    g.addColorStop(0.38, CIELO_CSS[1])
    g.addColorStop(0.5, CIELO_CSS[2])
    g.addColorStop(0.58, CIELO_CSS[3])
    g.addColorStop(0.82, CIELO_CSS[4])
    g.addColorStop(1.0, CIELO_CSS[5])
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 2, 256)
    const t = new THREE.CanvasTexture(c)
    t.mapping = THREE.EquirectangularReflectionMapping
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }

  function makeGlowTexture() {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, SOL_CSS_FULL)
    g.addColorStop(0.25, SOL_CSS_SOFT)
    g.addColorStop(1, SOL_CSS_CLEAR)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }

  function makeNormalsTexture() {
    const S = 256
    const c = document.createElement('canvas')
    c.width = c.height = S
    const ctx = c.getContext('2d')
    const img = ctx.createImageData(S, S)
    const d = img.data
    const f = new Float32Array(S * S)
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        f[x + y * S] = fbm(x / S, y / S)
      }
    }
    for (let y = 0; y < S; y++) {
      const y0 = (y + S - 1) % S
      const y1 = (y + 1) % S
      for (let x = 0; x < S; x++) {
        const x0 = (x + S - 1) % S
        const x1 = (x + 1) % S
        const dx = f[x1 + y * S] - f[x0 + y * S]
        const dy = f[x + y1 * S] - f[x + y0 * S]
        const nz = 1.0
        const l = Math.hypot(dx, dy, nz)
        const i4 = (x + y * S) * 4
        d[i4] = ((dx / l) * 0.5 + 0.5) * 255
        d[i4 + 1] = ((dy / l) * 0.5 + 0.5) * 255
        d[i4 + 2] = ((nz / l) * 0.5 + 0.5) * 255
        d[i4 + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(6, 6)
    return t
  }

  function hash(x, y) {
    const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return v - Math.floor(v)
  }

  function fbm(x, y) {
    let a = 0.5
    let s = 0
    let px = x
    let py = y
    for (let i = 0; i < 5; i++) {
      s += a * hash(px, py)
      px = px * 2.02 + 7.3
      py = py * 2.03 + 13.7
      a *= 0.5
    }
    return s
  }
})()