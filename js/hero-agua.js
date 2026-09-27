import * as pc from 'playcanvas'
import { Water } from 'playcanvas/scripts/esm/water.mjs'

;(async () => {
  const canvas = document.getElementById('hero-agua')
  const hero = canvas ? canvas.parentElement : null
  if (!canvas || !hero) return
  console.info('[dm-agua] modulo inicia')

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches
  const composition = (hero.dataset.agua || 'horizon') === 'agua' ? 'agua' : 'horizon'

  const estado = (motivo) => {
    hero.dataset.aguaEstado = motivo
    console.info('[dm-agua] estado:', motivo)
    let chip = hero.querySelector('.hero__agua-estado')
    if (!chip) {
      chip = document.createElement('div')
      chip.className = 'hero__agua-estado'
      hero.appendChild(chip)
    }
    chip.textContent = 'agua: ' + motivo
  }

  const CONFIG = composition === 'agua'
    ? { camPos: [0, 10, 6.5], camTarget: [0, 0.6, -12], waveAmplitude: 0.14, waveLength: 10, waveSteepness: 0.45, swellAmplitude: 0.22 }
    : { camPos: [0, 1.7, 11], camTarget: [0, 1.3, -22], waveAmplitude: 0.09, waveLength: 9, waveSteepness: 0.35, swellAmplitude: 0.16 }

  const CIELO = [
    [0.992, 0.969, 0.937],
    [0.984, 0.949, 0.886],
    [0.976, 0.925, 0.784],
    [0.816, 0.882, 0.867],
    [0.45, 0.66, 0.72],
    [0.122, 0.431, 0.549]
  ]
  const SUN_DIR = [0.42, 0.55, 0.72]

  if (reduce || !supportsWebGL2()) {
    estado(reduce ? 'reduced-motion' : 'no-webgl2')
    hero.classList.add('hero--sin-agua')
    return
  }

  let app = null
  const mouse = { x: 0, y: 0 }
  let camEntity = null
  let glowEntity = null

  try {
    app = new pc.Application(canvas, {
      graphicsDeviceOptions: { antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }
    })
    try {
      app.graphicsDevice.on('shadererror', (e) => { window.__dmShaderErrors = (window.__dmShaderErrors || 0) + 1 })
      window.__dmShaderErrors = 0
    } catch (_) {}
    app.graphicsDevice.maxPixelRatio = coarse ? 1 : Math.min(1.5, window.devicePixelRatio || 1)
    app.setCanvasResolution(pc.RESOLUTION_AUTO)
    app.start()
    try { window.__dbgApp = app } catch (_) {}
    console.info('[dm-agua] webgl2+app ok')
    try {
      const glc = canvas.getContext('webgl2')
      window.__draws = 0
      const wrap = (n) => { const o = glc[n]; if (o) { glc[n] = function (...a) { window.__draws++; return o.apply(this, a) } } }
      wrap('drawElements'); wrap('drawArrays')
    } catch (_) {}

    const root = app.root

    camEntity = new pc.Entity('cam')
    camEntity.addComponent('camera', { clearColor: rgb(CIELO[5]), farClip: 1200, nearClip: 0.1 })
    camEntity.setPosition(...CONFIG.camPos)
    camEntity.lookAt(...CONFIG.camTarget)
    root.addChild(camEntity)

    const sunEntity = new pc.Entity('sol')
    sunEntity.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 0.96, 0.88),
      intensity: 1.3
    })
    sunEntity.lookAt(SUN_DIR[0] * 10, SUN_DIR[1] * 10, SUN_DIR[2] * 10)
    root.addChild(sunEntity)

    const skyEntity = new pc.Entity('cielo')
    skyEntity.addComponent('render', { type: 'sphere' })
    skyEntity.render.meshInstances[0].mesh = makeSphereMesh(app.graphicsDevice, 460)
    skyEntity.render.meshInstances[0].material = makeSkyMaterial(app.graphicsDevice)
    root.addChild(skyEntity)

    glowEntity = new pc.Entity('sol-glow')
    glowEntity.addComponent('render', { type: 'plane' })
    glowEntity.render.meshInstances[0].material = makeGlowMaterial(app.graphicsDevice)
    glowEntity.setLocalScale(110, 110, 1)
    root.addChild(glowEntity)
    alignGlow()

    const testEntity = new pc.Entity('diag-plane')
    testEntity.addComponent('render', { type: 'plane' })
    const testMat = new pc.StandardMaterial()
    testMat.emissive = new pc.Color(1, 0, 1)
    testMat.emissiveIntensity = 1
    testMat.useLighting = false
    testMat.update()
    testEntity.render.meshInstances[0].material = testMat
    testEntity.setPosition(0, 1.5, -40)
    testEntity.setLocalScale(40, 40, 1)
    root.addChild(testEntity)

    const waterEntity = new pc.Entity('agua')
    waterEntity.addComponent('render', { type: 'plane' })
    waterEntity.render.meshInstances[0].mesh = makePlaneMesh(app.graphicsDevice, 480, 96)
    root.addChild(waterEntity)
    waterEntity.addComponent('script')
    waterEntity.script.create(Water, {
      properties: {
        cameraEntity: camEntity,
        lightEntity: sunEntity,
        normalMap: makeNormalsTexture(app.graphicsDevice),
        reflectionSource: 'planar',
        refraction: false,
        depthEffects: false,
        foam: false,
        skyBlur: 0.5,
        waves: true,
        waveAmplitude: CONFIG.waveAmplitude,
        waveLength: CONFIG.waveLength,
        waveSpeed: 1.1,
        waveSteepness: CONFIG.waveSteepness,
        waveDirection: 18,
        swellAmplitude: CONFIG.swellAmplitude,
        swellLength: 34,
        swellSpeed: 1,
        swellDirection: 28,
        shallowColor: new pc.Color(0.16, 0.48, 0.58),
        deepColor: new pc.Color(0.04, 0.16, 0.26),
        rippleTiling: 0.11,
        rippleSpeed: 0.05,
        bumpiness: 0.5,
        distortion: 0.03,
        fresnelPower: 5,
        reflectionStrength: 1,
        specularPower: 512,
        specularIntensity: 1.7,
        diffuseIntensity: 0.5
      }
    })
    console.info('[dm-agua] escena completa (agua, cielo, glow)')

    app.on('update', () => {
      window.__dmFrames = (window.__dmFrames || 0) + 1
      const sx = mouse.x * 0.5
      const sy = mouse.y * 0.16 * (composition === 'agua' ? 0 : 1)
      camEntity.lookAt(CONFIG.camTarget[0] + sx, CONFIG.camTarget[1] + sy, CONFIG.camTarget[2])
      alignGlow()
    })

    window.addEventListener('pointermove', (e) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1
    }, { passive: true })

    canvas.addEventListener('webglcontextlost', onContextLost)
    resize()
    watchSize()
    watchVisibility()

    setTimeout(async () => {
      const cs = getComputedStyle(canvas)
      let px = null
      let draws = 0
      let rtres = null
      const gl = canvas.getContext('webgl2')
      try {
        const w = canvas.width; const h = canvas.height
        if (w > 0 && h > 0) {
          const tmp = document.createElement('canvas')
          tmp.width = w; tmp.height = h
          const ctx = tmp.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(canvas, 0, 0)
          const d = ctx.getImageData(0, 0, w, h).data
          let painted = 0
          let magenta = 0
          const cols = {}
          for (let i = 0; i < d.length; i += 40) {
            if (d[i] || d[i + 1] || d[i + 2]) painted++
            if (d[i] > 180 && d[i + 1] < 80 && d[i + 2] > 180) magenta++
            const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2]
            cols[k] = (cols[k] || 0) + 1
          }
          const top = Object.entries(cols).sort((a, z) => z[1] - a[1]).slice(0, 6).map(e => e[0])
          let samples = null
          try { samples = String(gl.getParameter(gl.SAMPLES)) } catch (_) {}
          px = JSON.stringify({ w, h, painted, magenta, top, samples })
        }
      } catch (e) { px = 'err:' + e.message }
      try { draws = window.__draws || 0 } catch (_) {}
      try {
        const rtTex = new pc.Texture(app.graphicsDevice, { width: 256, height: 256, format: pc.PIXELFORMAT_RGBA8, mipmaps: false })
        const rt = new pc.RenderTarget({ colorBuffer: rtTex, depth: true })
        camEntity.camera.renderTarget = rt
        await new Promise(r => setTimeout(r, 350))
        app.graphicsDevice.setRenderTarget(rt)
        const b = new Uint8Array(256 * 256 * 4)
        gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, b)
        app.graphicsDevice.setRenderTarget()
        camEntity.camera.renderTarget = null
        let p = 0
        const cols = {}
        for (let i = 0; i < b.length; i += 40) {
          if (b[i] || b[i + 1] || b[i + 2]) p++
          cols[b[i] + ',' + b[i + 1] + ',' + b[i + 2]] = (cols[b[i] + ',' + b[i + 1] + ',' + b[i + 2]] || 0) + 1
        }
        const top = Object.entries(cols).sort((a, z) => z[1] - a[1]).slice(0, 5).map(e => e[0])
        rtres = JSON.stringify({ p, top })
      } catch (e) { rtres = 'err:' + e.message }
      console.info('[dm-agua] check:', JSON.stringify({
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        display: cs.display,
        css: canvas.clientWidth + 'x' + canvas.clientHeight,
        buf: canvas.width + 'x' + canvas.height,
        hero: hero.className,
        reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
        scrollW: document.documentElement.scrollWidth,
        heroW: hero.getBoundingClientRect().width,
        frames: window.__dmFrames || 0,
        shaderErrors: window.__dmShaderErrors || 0,
        draws,
        px,
        rt: rtres
      }))
      if ((!canvas.clientWidth || !canvas.clientHeight) && cs.display !== 'none') {
        console.info('[dm-agua] canvas con tamaño 0, re-resize')
        resize()
      }
    }, 7000)
  } catch (e) {
    console.error('hero-agua ERROR', e)
    estado('error: ' + (e && e.message || e))
    if (hero) hero.classList.add('hero--sin-agua')
    try { if (app) app.stop() } catch (_) {}
  }

  function alignGlow() {
    if (!glowEntity || !camEntity) return
    glowEntity.setPosition(0 + SUN_DIR[0] * 480, SUN_DIR[1] * 480, SUN_DIR[2] * 480)
    glowEntity.lookAt(camEntity.getPosition())
  }

  function onContextLost(e) {
    e.preventDefault()
    try { if (app) app.stop() } catch (_) {}
    estado('webglcontextlost')
    hero.classList.add('hero--sin-agua')
  }

  function resize() {
    if (!app) return
    const dpr = coarse ? 1 : Math.min(1.5, window.devicePixelRatio || 1)
    app.graphicsDevice.maxPixelRatio = dpr
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w > 0 && h > 0) app.graphicsDevice.resizeCanvas(w, h)
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
        for (const en of entries) setRunning(en.isIntersecting)
      }, { threshold: 0.05 })
      io.observe(hero)
    }
    document.addEventListener('visibilitychange', () => {
      setRunning(document.visibilityState === 'visible')
    })
  }

  function setRunning(on) {
    if (!app) return
    try {
      if (on) app.start()
      else app.stop()
    } catch (_) {}
  }

  function supportsWebGL2() {
    try {
      return !!document.createElement('canvas').getContext('webgl2')
    } catch (_) {
      return false
    }
  }

  function rgb(s) {
    return new pc.Color(s[0], s[1], s[2], 1)
  }

  function makePlaneMesh(gfx, size, seg) {
    const positions = []
    const normals = []
    const uvs = []
    const indices = []
    for (let z = 0; z <= seg; z++) {
      for (let x = 0; x <= seg; x++) {
        positions.push((x / seg - 0.5) * size, 0, (z / seg - 0.5) * size)
        normals.push(0, 1, 0)
        uvs.push(x / seg, z / seg)
      }
    }
    const stride = seg + 1
    for (let z = 0; z < seg; z++) {
      for (let x = 0; x < seg; x++) {
        const a = z * stride + x
        const b = a + 1
        const c = a + stride
        const d = c + 1
        indices.push(a, b, c, c, b, d)
      }
    }
    return pc.createMesh(gfx, { positions, normals, uvs, indices })
  }

  function makeSphereMesh(gfx, radius) {
    const rings = 40
    const segs = 80
    const positions = []
    const normals = []
    const uvs = []
    const indices = []
    for (let r = 0; r <= rings; r++) {
      const lat = (r / rings) * Math.PI
      const y = Math.cos(lat)
      const rr = Math.sin(lat)
      for (let s = 0; s <= segs; s++) {
        const lon = (s / segs) * Math.PI * 2
        const x = Math.sin(lon) * rr
        const z = Math.cos(lon) * rr
        positions.push(x * radius, y * radius, z * radius)
        normals.push(x, y, z)
        uvs.push(s / segs, r / rings)
      }
    }
    const stride = segs + 1
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segs; s++) {
        const a = r * stride + s
        const b = a + 1
        const c = (r + 1) * stride + s
        const d = c + 1
        indices.push(a, b, c, c, b, d)
      }
    }
    return pc.createMesh(gfx, { positions, normals, uvs, indices })
  }

  function makeSkyTexture(gfx) {
    const size = 256
    const tex = new pc.Texture(gfx, { width: 2, height: size, format: pc.PIXELFORMAT_RGBA8 })
    const pixels = tex.lock()
    for (let y = 0; y < size; y++) {
      const t = y / (size - 1)
      const stops = stopsAt(t)
      const i = y * 4
      pixels[i] = stops[0]
      pixels[i + 1] = stops[1]
      pixels[i + 2] = stops[2]
      pixels[i + 3] = 255
    }
    tex.unlock()
    return tex
  }

  function stopsAt(t) {
    const n = CIELO.length - 1
    const a = Math.min(Math.floor(t * n), n - 1)
    const f = (t * n) - a
    const c0 = CIELO[a]
    const c1 = CIELO[a + 1]
    return [
      Math.round((c0[0] + (c1[0] - c0[0]) * f) * 255),
      Math.round((c0[1] + (c1[1] - c0[1]) * f) * 255),
      Math.round((c0[2] + (c1[2] - c0[2]) * f) * 255)
    ]
  }

  function makeSkyMaterial(gfx) {
    const m = new pc.StandardMaterial()
    m.emissiveMap = makeSkyTexture(gfx)
    m.emissive = new pc.Color(1, 1, 1)
    m.emissiveIntensity = 1
    m.useLighting = false
    m.cull = pc.CULLFACE_FRONT
    m.depthWrite = false
    m.update()
    return m
  }

  function makeGlowTexture(gfx) {
    const size = 256
    const tex = new pc.Texture(gfx, { width: size, height: size, format: pc.PIXELFORMAT_RGBA8 })
    const pixels = tex.lock()
    const r2 = (size / 2) * (size / 2)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - size / 2
        const dy = y - size / 2
        const d = (dx * dx + dy * dy) / r2
        const v = Math.max(0, 1 - d)
        const a = v * v
        const i = (y * size + x) * 4
        pixels[i] = 255
        pixels[i + 1] = Math.round(246 - (1 - a) * 90)
        pixels[i + 2] = Math.round(232 - (1 - a) * 220)
        pixels[i + 3] = 255
      }
    }
    tex.unlock()
    return tex
  }

  function makeGlowMaterial(gfx) {
    const m = new pc.StandardMaterial()
    m.emissiveMap = makeGlowTexture(gfx)
    m.emissive = new pc.Color(1, 1, 1)
    m.emissiveIntensity = 1
    m.useLighting = false
    m.blendType = pc.BLEND_ADDITIVE
    m.cull = pc.CULLFACE_NONE
    m.depthWrite = false
    m.update()
    return m
  }

  function makeNormalsTexture(gfx) {
    const size = 256
    const tex = new pc.Texture(gfx, { width: size, height: size, format: pc.PIXELFORMAT_RGBA8 })
    const pixels = tex.lock()
    const f = fbmField(size)
    for (let y = 0; y < size; y++) {
      const y0 = (y + size - 1) % size
      const y1 = (y + 1) % size
      for (let x = 0; x < size; x++) {
        const x0 = (x + size - 1) % size
        const x1 = (x + 1) % size
        const dx = f[x1 + y * size] - f[x0 + y * size]
        const dy = f[x + y1 * size] - f[x + y0 * size]
        const l = Math.hypot(dx, dy, 1)
        const i = (y * size + x) * 4
        pixels[i] = ((dx / l) * 0.5 + 0.5) * 255
        pixels[i + 1] = ((dy / l) * 0.5 + 0.5) * 255
        pixels[i + 2] = ((1 / l) * 0.5 + 0.5) * 255
        pixels[i + 3] = 255
      }
    }
    tex.unlock()
    return tex
  }

  function fbmField(size) {
    const f = new Float32Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        f[x + y * size] = fbm2(x / size, y / size)
      }
    }
    return f
  }

  function hash2(x, y) {
    const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return v - Math.floor(v)
  }

  function fbm2(x, y) {
    let a = 0.5
    let s = 0
    let px = x
    let py = y
    for (let i = 0; i < 5; i++) {
      s += a * hash2(px, py)
      px = px * 2.02 + 7.3
      py = py * 2.03 + 13.7
      a *= 0.5
    }
    return s
  }
})()