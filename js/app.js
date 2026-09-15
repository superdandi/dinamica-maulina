/* DINÁMICA MAULINA — app.js
 * Carga /data/faust.json con cache-busting y renderiza:
 *  - Inicio: "La Corriente" (últimos 24) + conteos de categorías
 *  - Búsqueda: índice Fuse.js + filtros por categoría
 */
(function () {
  'use strict'

  const base = (window.DM && window.DM.base) || '/'
  const categories = (window.DM && window.DM.categories) || []
  const corpusPath = (window.DM && window.DM.corpusPath) || 'data/faust.json'

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

    const PH_VISIBLE = `<div class="card__ph" aria-hidden="true"><span style="font-size:2rem;opacity:.35">🌊</span></div>`
  const PH_HIDDEN  = `<div class="card__ph" style="display:none" aria-hidden="true"><span style="font-size:2rem;opacity:.35">🌊</span></div>`

  function cardHTML(item) {
    const cat = catMeta[item.category] || { name: item.category, color: 'rio', icon: '✦' }
    const img = item.image
      ? `<img class="card__img" src="${esc(item.image)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">${PH_HIDDEN}`
      : PH_VISIBLE
    return `
      <article class="card">
        ${img}
        <div class="card__body">
          <span class="pill pill--${esc(cat.color || 'rio')}">${esc(cat.icon || '')} ${esc(cat.name || '')}</span>
          <h3 class="card__title"><a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3>
          ${item.summary ? `<p class="card__summary" style="font-size:.9rem;color:var(--tinta-500);margin:0">${esc(item.summary)}</p>` : ''}
          <div class="card__meta">
            <span>${esc(item.source)}</span>
            <time datetime="${esc(item.date)}">${fmtDate(item.date)}</time>
          </div>
        </div>
      </article>`
  }

  async function fetchCorpus() {
    const url = (base.endsWith('/') ? base : base + '/') + corpusPath + '?v=' + Date.now()
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return res.json()
  }

  // ── Inicio: La Corriente + conteos ───────────────────────────────────
  function initHome() {
    const feed = $('#feed-reciente')
    if (!feed) return
    const loadEl = $('#estado-carga'), errEl = $('#estado-error'), vacio = $('#feed-vacio')

    fetchCorpus()
      .then((data) => {
        const items = (data.items || []).slice(0, 24)
        if (items.length === 0) {
          if (vacio) vacio.hidden = false
        } else {
          feed.innerHTML = items.map(cardHTML).join('')
        }
        const upd = $('[data-ultima-actualizacion]')
        if (upd && data.generatedAt) upd.textContent = 'Actualizado ' + fmtDate(data.generatedAt)

        // conteos por categoría
        $$('[data-cat-count]').forEach((el) => {
          const id = el.dataset.catCount
          const n = data.counts && data.counts[id]
          el.textContent = n ? n + (n === 1 ? ' entrada' : ' entradas') : '—'
        })
      })
      .catch((e) => {
        console.error('DM: no se pudo leer el corpus', e)
        if (errEl) errEl.hidden = false
      })
      .finally(() => { if (loadEl) loadEl.hidden = true })
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

    function render(query) {
      let items = []
      if (corpus) {
        if (query && fuse) {
          items = fuse.search(query).map((r) => r.item)
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
      .catch((e) => console.error('DM: búsqueda sin corpus', e))

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

  document.addEventListener('DOMContentLoaded', () => {
    initHome()
    initSearch()
  })
})()