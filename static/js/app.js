/* DINÁMICA MAULINA — app.js
 * Cliente mínimo: solo mejora la página de búsqueda.
 * La home está server-rendered (progressive enhancement, mejor SEO y carga).
 * Carga /data/search.json (minificado) con cache por versión de generatedAt.
 */
(function () {
  'use strict'

  const base = (window.DM && window.DM.base) || '/'
  const categories = (window.DM && window.DM.categories) || []
  const corpusPath = (window.DM && window.DM.corpusPath) || 'data/search.json'
  const version = (window.DM && window.DM.version) || String(Date.now())

  // nombres de fuente legibles: [{id, name, ...}, ...]
  const srcNames = {}
  for (const s of ((window.DM && window.DM.sourceNames) || [])) srcNames[s.id] = s.name
  const srcName = (id) => srcNames[id] || id

  const catMeta = (() => {
    const m = {}
    for (const c of categories) m[c.id] = c
    return m
  })()

  const $ = (sel, root) => (root || document).querySelector(sel)
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel))

  const fmtDate = (iso) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch { return '' }
  }

  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  const PH_HIDDEN  = `<div class="card__ph" style="display:none" aria-hidden="true"><span style="font-size:2rem;opacity:.35">🌊</span></div>`

  function cardHTML(item) {
    const cat = catMeta[item.category] || { name: item.category, color: 'rio', icon: '✦' }
    const img = item.image
      ? `<img class="card__img" src="${esc(item.image)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">${PH_HIDDEN}`
      : `<div class="card__ph" aria-hidden="true"><span style="font-size:2rem;opacity:.35">🌊</span></div>`
    return `
      <article class="card">
        ${img}
        <div class="card__body">
          <span class="pill pill--${esc(cat.color || 'rio')}">${esc(cat.icon || '')} ${esc(cat.name || '')}</span>
          <h3 class="card__title"><a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3>
          ${item.summary ? `<p class="card__summary" style="font-size:.9rem;color:var(--tinta-500);margin:0">${esc(item.summary)}</p>` : ''}
          <div class="card__meta">
            <span>${esc(srcName(item.source))}</span>
            <time datetime="${esc(item.date)}">${fmtDate(item.date)}</time>
          </div>
        </div>
      </article>`
  }

  // Cache por versión: la URL cambia SOLO cuando generatedAt cambia → el ETag/CDN
  // del navegador reutiliza la respuesta hasta que el corpus se renueva (a diferencia
  // del viejo ?v=Date.now() que re-bajaba 617KB en cada visita).
  async function fetchCorpus() {
    const url = (base.endsWith('/') ? base : base + '/') + corpusPath + '?v=' + encodeURIComponent(version)
    const res = await fetch(url)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return res.json()
  }

  // ── Búsqueda ─────────────────────────────────────────────────────────
  const SEARCH_KEYS = ['title', 'summary', 'author', 'source']

  function initSearch() {
    const input = $('#search-input')
    if (!input) return
    const results = $('#search-results')
    const empty = $('#search-empty')
    const filters = $$('#search-filters button')

    let corpus = null
    let fuse = null
    let activeFilter = 'TODAS'

    // ordenar por fecha desc (estable) — el archivo mezcla 2006→hoy
    const sortByDate = (arr) => arr.slice().sort((a, b) => new Date(b.date) - new Date(a.date))

    function render(query) {
      let items = []
      if (corpus) {
        if (query && fuse) {
          items = fuse.search(query).map((r) => r.item)
          items = sortByDate(items)
        } else {
          items = corpus.items || []
        }
        if (activeFilter !== 'TODAS') items = items.filter((i) => i.category === activeFilter)
        items = items.slice(0, 60)
      }
      empty.hidden = items.length !== 0
      results.innerHTML = items.length ? items.map(cardHTML).join('') : '<p class="state" style="grid-column:1/-1">Sin resultados — probá con otras palabras.</p>'
    }

    fetchCorpus()
      .then((data) => {
        corpus = data
        fuse = new Fuse(data.items || [], {
          keys: SEARCH_KEYS.map((k) => ({ name: k, weight: k === 'title' ? 3 : 1 })),
          threshold: 0.4,
          ignoreLocation: true,
          isCaseSensitive: false,
        })
        render(input.value)
      })
      .catch((e) => {
        console.error('DM: búsqueda sin corpus', e)
        empty.hidden = false
        empty.textContent = 'El archivo no respondió — reintentá en un rato.'
      })

    input.addEventListener('input', () => render(input.value.trim()))

    filters.forEach((btn) => {
      btn.addEventListener('click', () => {
        filters.forEach((b) => b.classList.remove('active'))
        btn.classList.add('active')
        activeFilter = btn.dataset.filter
        render(input.value.trim())
      })
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearch)
  } else {
    initSearch()
  }
})()