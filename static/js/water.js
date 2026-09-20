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
    // ---- paleta "Río Maule" ----
    'vec3 ARENA = vec3(0.980, 0.965, 0.937);    // #FAF6EF',
    'vec3 RIO_D = vec3(0.122, 0.431, 0.549);    // #1F6E8C',
    'vec3 RIO_C = vec3(0.180, 0.526, 0.659);    // #2E86A8',
    'vec3 VIN   = vec3(0.353, 0.420, 0.235);    // #5A6B3C',
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
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / u_res.xy;',
    '  float ar = u_res.x / u_res.y;',
    '  vec2 p = vec2(uv.x * ar, uv.y);',
    '  float t = u_time;',
    '',
    '  // paralaje suave del mouse (refleja el cielo en el agua)',
    '  vec2 m = (u_mouse - 0.5) * 0.045;',
    '  p += vec2(m.x, m.y * 0.35) * uv.y;',
    '',
    '  // capas de olas viajeras',
    '  float w = 0.0;',
    '  w += 0.48 + 0.5*sin(p.x*2.6 + t*0.85);',
    '  w += 0.48 + 0.5*sin(p.x*4.4 - t*1.15 + sin(p.y*3.2 + t*0.55)*0.55);',
    '  w += 0.48 + 0.5*sin((p.x*0.7 + p.y*1.3)*6.5 + t*1.4 + sin(p.x*2.0 - t*0.7)*1.1);',
    '  w *= 0.33;',
    '',
    '  // rizado fino de superficie',
    '  float glass = ruido(p*11.0 + t*0.35) * 0.06;',
    '',
    '  // degradado del cuerpo de agua: horizonte claro -> fondo profundo',
    '  vec3 horizon = mix(ARENA, VIN, clamp(uv.y*1.7, 0.0, 1.0));',
    '  vec3 deep = mix(RIO_D, RIO_C, clamp(uv.y, 0.0, 1.0));',
    '  vec3 col = mix(horizon, deep, smoothstep(0.10, 0.88, uv.y));',
    '',
    '  // sombreado de las olas',
    '  col *= 0.90 + 0.28*w + glass;',
    '',
    '  // rayo de sol diagonal ("glitter path") con destellos',
    '  float band = 1.0 - abs((p.x*0.38 + p.y*0.92) - 0.34 - 0.05*sin(t*0.22) + m.x*0.6);',
    '  float glint = pow(clamp(0.5 + 0.5*sin(ruido(vec2(p.x*6.0, p.y*6.0 - t*0.6))*24.0), 0.0, 1.0), 18.0);',
    '  float spec = smoothstep(0.30, 0.0, abs(band)) * (0.25 + 0.75*glint);',
    '  col += ARENA * spec * 0.55;',
    '',
    '  // caustics sutiles cerca de la superficie',
    '  float caust = pow(clamp(0.5 + 0.5*sin(p.x*34.0 + t*2.1 + sin(p.y*26.0 - t*1.3)*1.2), 0.0, 1.0), 14.0);',
    '  col += vec3(0.75, 0.92, 0.98) * caust * 0.05;',
    '',
    '  // viñeta suave para legibilidad del texto',
    '  vec2 cv = (uv - 0.5) * vec2(1.25, 1.7);',
    '  col *= mix(0.80, 1.0, smoothstep(1.0, 0.15, dot(cv, cv)));',
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