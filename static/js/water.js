/* DINÁMICA MAULINA — water.js
 * Agua animada del hero a través de un fragment shader WebGL estilizado.
 * Sin dependencias: un quad a pantalla completa + shaders procedurales
 * tintados con la paleta "Río Maule". Se pausa al salir del viewport,
 * respeta prefers-reduced-motion y cae a un gradiente CSS sin WebGL.
 */
(function () {
  'use strict'

  var hero = document.getElementById('hero-agua') && document.getElementById('hero-agua').parentElement
  var canvas = document.getElementById('hero-agua')
  if (!canvas || !hero) return

  var FALLBACK = function () {
    hero.classList.add('hero--sin-agua')
  }

  var gl = null
  try {
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
  } catch (e) { gl = null }
  if (!gl) { FALLBACK(); return }

  var VS = [
    'attribute vec2 a;',
    'void main(){ gl_Position = vec4(a, 0.0, 1.0); }'
  ].join('\n')

  var FS = [
    'precision mediump float;',
    '',
    'uniform vec2  u_res;',
    'uniform float u_time;',
    'uniform vec2  u_mouse;',
    '',
    '// ---- paleta "Río Maule" ----',
    'vec3 EPUMA   = vec3(0.980, 0.965, 0.937); // #FAF6EF arena',
    'vec3 OLA     = vec3(0.790, 0.920, 0.965); // reflejo de cielo',
    'vec3 AGUA_MED= vec3(0.122, 0.431, 0.549); // #1F6E8C',
    'vec3 AGUA_PROF = vec3(0.055, 0.251, 0.345); // fondo profundo',
    'vec3 JUNCAL  = vec3(0.294, 0.353, 0.196); // leve verde vinedo',
    '',
    'float hash(vec2 v){',
    '  return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453);',
    '}',
    '',
    'float ruido(vec2 v){',
    '  vec2 i = floor(v);',
    '  vec2 f = fract(v);',
    '  vec2 u = f*f*(3.0 - 2.0*f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),',
    '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
    '}',
    '',
    'float fbm(vec2 v){',
    '  float a = 0.5;',
    '  float s = 0.0;',
    '  for (int i = 0; i < 4; i++) {',
    '    s += a * ruido(v);',
    '    v = v * 2.03 + vec2(13.7, 7.3);',
    '    a *= 0.5;',
    '  }',
    '  return s;',
    '}',
    '',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / u_res.xy;',
    '  float ar = u_res.x / u_res.y;',
    '  vec2 p = vec2(uv.x * ar, uv.y);',
    '  float t = u_time;',
    '',
    '  // leve paralaje del mouse (reflejo)',
    '  vec2 m = (u_mouse - 0.5) * 0.06;',
    '',
    '  // "la corriente": deriva constante del agua',
    '  vec2 flow = vec2(t * 0.30, -t * 0.05);',
    '  vec2 q = p * vec2(1.30, 0.95) - flow * 0.9 + vec2(m.x, m.y * 0.3);',
    '',
    '  // relieve ondulado con warp de dominio (dos pasadas)',
    '  float e = fbm(q * 1.5);',
    '  float h = fbm(q * 2.2 + vec2(e, e * 0.7) * 1.6 - flow * 0.5);',
    '',
    '  // base por profundidad: claro arriba = reflejo del cielo',
    '  float prof = smoothstep(0.06, 0.80, uv.y);',
    '  vec3 col = mix(AGUA_MED * 0.92, AGUA_PROF, prof);',
    '  col += JUNCAL * (1.0 - prof) * 0.06;',
    '',
    '  // modelado del relieve',
    '  col += (h - 0.5) * vec3(0.10, 0.15, 0.20);',
    '',
    '  // crestas: brilla hacia espuma cuando la ola se acerca',
    '  float cresta = smoothstep(0.52, 0.92, h) * (0.6 + 0.4 * smoothstep(0.5, 1.0, prof));',
    '  col = mix(col, mix(OLA, EPUMA, cresta * 0.55), cresta * 0.6);',
    '',
    '  // destellos especulares finos, en columna cercana a la posición del sol',
    '  vec2 g = p * vec2(7.0, 4.5) + vec2(e * 9.0, e * 4.0) + vec2(0.0, -t * 0.85);',
    '  float brillo = pow(ruido(g), 26.0);',
    '  float sunX = exp(-pow((uv.x - 0.5 - (u_mouse.x - 0.5) * 0.35) * 5.0, 2.0));',
    '  col += EPUMA * brillo * (0.35 + 0.65 * sunX) * 0.85;',
    '',
    '  // caustics sutiles',
    '  float cau = pow(clamp(0.5 + 0.5*sin((p.x + p.y*0.2)*28.0 + h*6.0 - t*1.5), 0.0, 1.0), 10.0);',
    '  col += vec3(0.55, 0.75, 0.85) * cau * 0.055 * (1.0 - prof * 0.6);',
    '',
    '  // viñeta suave',
    '  float vig = smoothstep(0.9, 0.15, length((uv - 0.5) * vec2(1.25, 1.7)));',
    '  col *= mix(0.82, 1.0, vig);',
    '',
    '  col = clamp(col, 0.0, 1.0);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n')

  function compile(type, src) {
    var s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var info = gl.getShaderInfoLog(s)
      if (window.console) console.error('[water] shader:', info)
      gl.deleteShader(s)
      return null
    }
    return s
  }

  var prog = gl.createProgram()
  var vs = compile(gl.VERTEX_SHADER, VS)
  var fs = compile(gl.FRAGMENT_SHADER, FS)
  if (!vs || !fs) { FALLBACK(); return }
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    if (window.console) console.error('[water] link:', gl.getProgramInfoLog(prog))
    FALLBACK(); return
  }
  gl.useProgram(prog)

  var aPos = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(aPos)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  var uRes = gl.getUniformLocation(prog, 'u_res')
  var uTime = gl.getUniformLocation(prog, 'u_time')
  var uMouse = gl.getUniformLocation(prog, 'u_mouse')

  var dpr = Math.min(window.devicePixelRatio || 1, 2)

  function resize() {
    var w = hero.clientWidth
    var h = hero.clientHeight
    canvas.width = Math.max(2, Math.floor(w * dpr))
    canvas.height = Math.max(2, Math.floor(h * dpr))
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  window.addEventListener('resize', resize)
  resize()

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var raf = 0
  var start = 0
  var visible = true
  var mouse = { x: 0.5, y: 0.5 }

  function move(e) {
    var r = hero.getBoundingClientRect()
    if (!r.width) return
    mouse.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    mouse.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
  }
  hero.addEventListener('pointermove', move, { passive: true })

  function draw(t) {
    gl.uniform2f(uRes, canvas.width, canvas.height)
    gl.uniform1f(uTime, t)
    gl.uniform2f(uMouse, mouse.x, mouse.y)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  function frame(now) {
    raf = 0
    if (!visible) return
    if (!start) start = now
    draw((now - start) / 1000)
    if (!reduce) raf = requestAnimationFrame(frame)
  }

  draw(0)
  if (!reduce) raf = requestAnimationFrame(frame)

  function retomar() {
    if (visible && !reduce && !raf) {
      start = 0
      raf = requestAnimationFrame(frame)
    }
  }

  try {
    new IntersectionObserver(function (entries) {
      visible = entries.length ? entries[0].isIntersecting : visible
      retomar()
    }, { rootMargin: '120px 0px' }).observe(hero)
  } catch (e) { /* sin observer: sigue visible */ }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      visible = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    } else {
      visible = true
      retomar()
    }
  })
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault()
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    visible = false
  })
})()