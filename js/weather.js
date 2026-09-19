/* DINÁMICA MAULINA — weather.js
 * Widget de clima del Maule vía Open-Meteo (gratis, sin API key, CORS ok).
 * Ciudades inyectadas por Hugo (window.DM.cities). Hoy + 3 días.
 */
(function () {
  'use strict'

  // Normaliza ciudades: acepta tanto array plano ([{lat,...}...]) como un
  // posible anidamiento accidental ([[{lat,...}...]]) que dejaba a cities[0]
  // como un arreglo y rompía forecast(undefined, undefined).
  const RAW = (window.DM && Array.isArray(window.DM.cities)) ? window.DM.cities : []
  const citiesNode = (RAW.length && Array.isArray(RAW[0]) && RAW[0].length) ? RAW[0] : RAW
  const cities = citiesNode.length ? citiesNode : [
    { name: 'Talca', lat: '-35.4264', lon: '-71.6554' },
  ]

  const API = 'https://api.open-meteo.com/v1/forecast'

  function validar(lat, lon) {
    const ok = Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))
      && Number(lat) >= -90 && Number(lat) <= 90
      && Number(lon) >= -180 && Number(lon) <= 180
    if (!ok) throw new Error('Coordenadas inválidas para la ciudad')
  }

  const WMO = {
    0: ['Cielo despejado', '☀️'], 1: ['Mayormente despejado', '🌤️'],
    2: ['Parcialmente nublado', '⛅'], 3: ['Nublado', '☁️'],
    45: ['Niebla', '🌫️'], 48: ['Niebla con escarcha', '🌫️'],
    51: ['Llovizna ligera', '🌦️'], 53: ['Llovizna', '🌦️'], 55: ['Llovizna intensa', '🌧️'],
    61: ['Lluvia ligera', '🌦️'], 63: ['Lluvia', '🌧️'], 65: ['Lluvia intensa', '🌧️'],
    66: ['Lluvia helada', '🌧️'], 67: ['Lluvia helada intensa', '🌧️'],
    71: ['Nevada ligera', '🌨️'], 73: ['Nevada', '🌨️'], 75: ['Nevada intensa', '❄️'],
    77: ['Granos de nieve', '🌨️'], 80: ['Chubascos ligeros', '🌦️'], 81: ['Chubascos', '🌧️'],
    82: ['Chubascos violentos', '⛈️'], 85: ['Chubascos de nieve', '🌨️'], 86: ['Chubascos de nieve', '🌨️'],
    95: ['Tormenta eléctrica', '⛈️'], 96: ['Tormenta con granizo', '⛈️'], 99: ['Tormenta con granizo', '⛈️'],
  }
  const code = (c) => WMO[c] || ['—', '🌡️']

  const $ = (s, r) => (r || document).querySelector(s)
  const state = (w) => { w.dataset.state = 'ready' }

  async function forecast(lat, lon) {
    validar(lat, lon)
    const url = `${API}?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4'
    const res = await fetch(url)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return res.json()
  }

  const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

  function render(widget, city, data) {
    const cur = data.current
    const [curLabel, curIcon] = code(cur ? cur.weather_code : 0)
    const days = data.daily

    const citiesBar = cities.map((c) =>
      `<button class="weather__city ${c.name === city.name ? 'active' : ''}" data-city="${esc(c.lat)}|${esc(c.lon)}">${esc(c.name)}</button>`
    ).join('')

    const main = `
      <div class="weather__cur">
        <span class="weather__icon">${curIcon}</span>
        <div>
          <p class="weather__temp">${cur ? Math.round(cur.temperature_2m) : '—'}°C</p>
          <p class="weather__label">${curLabel}</p>
          <p class="weather__extra">${cur ? Math.round(cur.relative_humidity_2m) : '—'}% humedad · ${cur ? Math.round(cur.wind_speed_10m) : '—'} km/h</p>
        </div>
      </div>`

    const daysHTML = days.time.slice(1).map((t, i) => {
      const [l, ico] = code(days.weather_code[i + 1])
      const wd = new Date(t + 'T12:00:00').getDay()
      return `
        <div class="weather__day">
          <span class="weather__dayname">${DAYS[wd]}</span>
          <span class="weather__dayicon">${ico}</span>
          <span class="weather__daytemp">${Math.round(days.temperature_2m_max[i + 1])}° / ${Math.round(days.temperature_2m_min[i + 1])}°</span>
          <small>${l}</small>
        </div>`
    }).join('')

    widget.innerHTML = `
      <div class="weather__cities">${citiesBar}</div>
      <div class="weather__panel">${main}<div class="weather__days">${daysHTML}</div></div>`
    state(widget)

    // bind cambiar ciudad
    $$('.weather__city', widget).forEach((b) => {
      b.addEventListener('click', () => {
        const [lat, lon] = b.dataset.city.split('|')
        $$('.weather__city', widget).forEach((x) => x.classList.toggle('active', x === b))
        widget.querySelector('.weather__panel').innerHTML = '<div class="spinner" style="margin:1rem auto" aria-hidden="true"></div>'
        forecast(lat, lon).then((d) => render(widget, { name: b.textContent.trim(), lat, lon }, d)).catch(err)
      })
    })
  }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s))

  function err() {
    const w = $('#weather-widget')
    if (w) w.innerHTML = `<div class="state"><p>El cielo maulino no respondió ahora — reintentá en un rato.</p></div>`
  }

  document.addEventListener('DOMContentLoaded', () => {
    const widget = $('#weather-widget')
    if (!widget) return
    const city = cities[0]
    forecast(city.lat, city.lon)
      .then((data) => render(widget, city, data))
      .catch(err)
  })
})()