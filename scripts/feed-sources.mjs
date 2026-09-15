#!/usr/bin/env node
/* DINÁMICA MAULINA — pipeline de datos
 *
 * Lee scripts/sources.json, fetchea cada feed RSS/Atom, parsea, clasifica
 * en categorías culturales del Maule, deduplica y escribe:
 *   - data/faust.json          (consumido por Hugo en build-time → SEO)
 *   - static/data/faust.json   (consumido por el cliente: búsqueda/clima)
 *
 * Idempotente: correrlo 2 veces produce la 2ª +0 items.
 * Uso: node scripts/feed-sources.mjs [--quiet]
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCES_PATH = path.resolve(__dirname, './sources.json')
const DATA_PATH = path.resolve(__dirname, '../data/faust.json')
const STATIC_PATH = path.resolve(__dirname, '../static/data/faust.json')

const quiet = process.argv.includes('--quiet')
const log = (m) => { if (!quiet) console.log(m) }

// ─── Categorías y keywords de clasificación ────────────────────────────────
const CATEGORIES = {
  POESIA:        ['poema', 'poes' + 'ia', 'poes' + 'ias', 'verso', 'haiku', 'soneto', 'madrigal', 'décima', 'versos', 'poetisa', 'poético', 'poetica', 'lírica', 'lirica', 'rimas', 'microcuento en verso'],
  LITERATURA:    ['literatura', 'novela', 'cuento', 'cuentos', 'relato', 'editorial', 'crónica', 'cronica', 'narrativa', 'entrevista a escritor', 'escritores', 'libro', 'fanzine', 'poéticas'],
  MUSICA:        ['música', 'musica', 'concierto', 'recital', 'disco', 'álbum', 'album', 'banda', 'grupo musical', 'cueca', 'tonada', 'folclor', 'folklore', 'rock', 'jazz', 'canto', 'cantora', 'cantautor', 'canción', 'cancion', 'músico', 'musico', 'tocata', 'melodía', 'melodia', 'videoclip', 'radio en vivo'],
  TEATRO:        ['teatro', 'teatral', 'dramaturgia', 'dramaturgo', 'función de', 'funcion de', 'obra de teatro', 'escenario', 'tablao', 'elencos', 'circo', 'clown'],
  ARTES_VISUALES:['mural', 'muralista', 'pintura', 'pintor', 'exposición', 'exposicion', 'galería', 'galeria', 'acuarela', 'óleo', 'oleo', 'grabado', 'instalación', 'instalacion', 'arte urbano', 'diseño gráfico', 'diseño', 'ilustración', 'ilustracion', 'cerámica artística', 'serigrafía'],
  ARTESANIAS:    ['telar', 'tejido', 'tejer', 'telares', 'cerámica', 'ceramica', 'alfarería', 'alfareria', 'crin', 'macramé', 'macrame', 'artesanía', 'artesania', 'artesano', 'talabartería', 'cueretearía', 'orfebrería', 'joyería', 'joyeria', 'sastrería', 'sastreria', 'moda', 'greda', 'madera', 'talla'],
  PATRIMONIO:    ['patrimonio', 'mito', 'mitos', 'leyenda', 'leyendas', 'tradición', 'tradicion', 'fiesta costumb', 'costumbrista', 'cultura', 'cultural', 'patrimonial', 'memoria', 'pueblo', 'mapuche', 'huasos', 'cocina', 'gastronomía', 'gastronomia', 'receta', 'fundación', 'fundacion cultural', 'centro cultural', 'biblioteca', 'archivo', 'museo'],
  FOTOGRAFIA:    ['fotografía', 'fotografia', 'fotógrafo', 'fotografo', 'foto', 'lente', 'serie fotográfica', 'serie fotografica', 'documental visual', 'instax', 'polaroid'],
  CINE_MEDIOS:   ['cine', 'documental', 'cortometraje', 'corto', 'película', 'pelicula', 'audiovisual', 'radio', 'radiodifusión', 'podcast', 'comunidad audiovisual', 'videoarte', 'largometraje', 'festival de cine'],
  TERRITORIO:    ['río', 'rio maule', 'montaña', 'montañas', 'sendero', 'senderismo', 'trekking', 'humedal', 'reserva', 'aves', 'biodiversidad', 'achibueno', 'precordillera', 'bosque', 'especie', 'conservación', 'conservacion', 'cuenca', 'valle'],
}
const CATEGORY_IDS = Object.keys(CATEGORIES)

// Keywords de ruido que descartamos SIEMPRE (todo el sitio)
const NOISE_BLOCKERS = [
  'sorteo', 'gana entradas', 'concurso', 'patrocinad', 'publicidad', 'promoción', 'promocion',
  'descuento', 'oferta', 'tarjeta', 'banco', 'credito', 'crédito',
  'dólar', 'uf ', 'utm', 'dolar', 'clima', 'pronóstico', 'fútbol', 'futbol', 'campeonato',
  'rangers', 'curicó unido', 'universidad de chile', 'colocolo', 'clasificatoria',
  'bono', 'subsidio', 'ministerio de hacienda', 'política', 'elecciones', 'senador', 'diputado',
  'accidente', 'robo', 'detenid', 'incendio en vivienda', 'balance policial',
  'resultados test', 'estafa', 'allanamiento',
  'horóscopo', 'horoscopo', 'la niña', 'el niño', 'precio del', 'cotización',
  'página 2', 'tránsito', 'transito', 'vial',
]

// ─── Utilidades comunes ────────────────────────────────────────────────────
function decode(str = '') {
  return str
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim()
}

function stripHtml(str = '') {
  return decode(str)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim()
}

function slugify(title) {
  return title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80)
}

function makeId(title, dateStr) {
  const day = dateStr ? String(dateStr).slice(0, 10) : 'unknown'
  return `${day}-${slugify(title)}`
}

function firstImage(description = '', extra = '') {
  const m1 = description.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (m1) return m1[1]
  const m2 = extra.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (m2) return m2[1]
  return ''
}

// ─── Parseo de feeds (RSS 2.0 + Atom) ──────────────────────────────────────
function parseFeed(xml) {
  const items = []
  const itemRegex = /<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/g
  for (const raw of (xml.match(itemRegex) || [])) {
    const get = (t) => decode((raw.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '')
    const attr = (t, a) => {
      const m = raw.match(new RegExp(`<${t}[^>]+${a}=["']([^"']+)["']`))
      return m ? decode(m[1]) : ''
    }
    const title = get('title') || get('media:title')
    if (!title) continue

    // link: texto o atributo href (Atom)
    const linkTxt = get('link')
    const link = /^https?:/i.test(linkTxt) ? linkTxt : attr('link', 'href') || linkTxt

    const dateStr = get('pubDate') || get('published') || get('updated') || get('dc:date') || get('date')
    const date = dateStr ? new Date(dateStr) : null

    const description = get('description') || get('summary') || get('content:encoded') || get('content')
    const image = firstImage(description, get('media:content') + ' ' + attr('media:thumbnail', 'url') + ' ' + attr('enclosure', 'url'))
    const author = decode(get('dc:creator') || get('author') || get('name')).trim()

    items.push({ title, description, link, date, image, author })
  }
  return items
}

async function fetchFeed(url, meta) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': meta.userAgent },
      signal: AbortSignal.timeout((meta.timeoutSec || 30) * 1000),
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = await res.text()
    const items = parseFeed(xml)
    // Blogger limita a 25 posts por feed; pedimos más si soporta (Atom alt)
    if (items.length === 25 && /blogspot\.com/.test(url)) {
      // intentar el feed con más resultado max-results=50
      try {
        const alt = await fetch(url + (url.includes('?') ? '&' : '?') + 'max-results=50', {
          headers: { 'user-agent': meta.userAgent },
          signal: AbortSignal.timeout((meta.timeoutSec || 30) * 1000),
        })
        if (alt.ok) {
          const altItems = parseFeed(await alt.text())
          if (altItems.length > items.length) return altItems
        }
      } catch { /* mantener los 25 */ }
    }
    return items
  } catch (e) {
    log(`  ⚠ feed ${url} — ${e.message}`)
    return []
  }
}

// ─── Clasificación heurística a categoría ──────────────────────────────────
function classifyCategory(text, fallback) {
  const lower = ` ${text.toLowerCase()} `
  let best = null, bestScore = 0
  for (const cat of CATEGORY_IDS) {
    let score = 0
    for (const kw of CATEGORIES[cat]) {
      if (lower.includes(kw)) score += kw.length > 5 ? 3 : 1.5
    }
    if (score > bestScore) { bestScore = score; best = cat }
  }
  // umbral mínimo de evidencia para sobreescribir la categoría de la fuente
  if (best && bestScore >= 3 && best !== fallback) return best
  return fallback || null
}

function isNoise(title, summary) {
  const t = ` ${title.toLowerCase()} `
  return NOISE_BLOCKERS.some((b) => t.includes(b.toLowerCase()) || summary.toLowerCase().includes(b.toLowerCase()))
}

// ─── Deduplicación ──────────────────────────────────────────────────────────
const STOPWORDS = new Set(['los', 'las', 'el', 'la', 'en', 'de', 'del', 'un', 'una', 'y', 'a', 'con', 'por', 'para', 'su', 'sus', 'al', 'lo', 'se', 'que', 'no', 'es', 'como', 'o', 'the', 'a', 'an', 'and', 'of', 'to', 'para'])

function tokenSet(s) {
  return new Set(s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOPWORDS.has(w)))
}

function similarTitle(a, b, thresh = 0.45) {
  const sa = tokenSet(a), sb = tokenSet(b)
  if (sa.size < 2 || sb.size < 2) return false
  let inter = 0
  for (const w of sa) if (sb.has(w)) inter++
  return inter / Math.max(sa.size, sb.size) >= thresh
}

// ─── Escritura / agregados ─────────────────────────────────────────────────
function recompute(data) {
  data.counts = {}
  for (const cat of CATEGORY_IDS) data.counts[cat] = 0
  for (const it of data.items) data.counts[it.category] = (data.counts[it.category] || 0) + 1
  data.feedStats = {
    sources: data.sources.length,
    alive: data.sources.filter((s) => s.alive).length,
    itemsPerSource: data.items.reduce((acc, it) => {
      acc[it.source] = (acc[it.source] || 0) + 1
      return acc
    }, {}),
  }
}

async function main() {
  const metaSrc = JSON.parse(await readFile(SOURCES_PATH, 'utf8'))
  const meta = metaSrc.meta
  const sources = metaSrc.feeds

  // Estado previo (idempotencia)
  let data
  try {
    data = JSON.parse(await readFile(DATA_PATH, 'utf8'))
    if (!data.items) throw new Error('malformado')
  } catch {
    data = { generatedAt: null, items: [], counts: {}, feedStats: {}, sources: [] }
  }

  const existing = new Set(data.items.map((i) => i.id))
  const existingTitles = data.items.map((i) => i.title.toLowerCase())
  const prevItemsKey = JSON.stringify(data.items.map((i) => i.id))
  const prevSources = JSON.stringify(data.sources)
  const now = Date.now()
  const minAgeMs = (meta.window.minAgeHours || 12) * 36e5
  const maxAgeMs = (meta.window.maxAgeDays || 400) * 864e5

  let added = 0, fetched = 0
  const aliveSources = []

  for (const src of sources) {
    let alive = false
    try {
      const items = await fetchFeed(src.feed, meta)
      fetched += items.length
      if (items.length > 0) alive = true

      for (const item of items) {
        const title = item.title.slice(0, 200)
        const summary = stripHtml(item.description).slice(0, 300)
        const text = `${title} ${summary}`

        if (isNoise(title, summary)) continue

        // Fuentes tipo "noticiero" requieren relevancia cultural explícita
        if (src.filter && !CATEGORY_IDS.some((c) => CATEGORIES[c].some((k) => text.toLowerCase().includes(k)))) continue

        const date = item.date || new Date(item.pubDate || 0)
        if (!(date instanceof Date) || isNaN(date.getTime())) continue
        const age = now - date.getTime()
        if (age < minAgeMs || age > maxAgeMs) continue

        const category = classifyCategory(text, src.category)
        const id = makeId(title, date.toISOString())

        // dedupe por ID estable + similitud de títulos
        if (existing.has(id)) continue
        if (existingTitles.some((t) => similarTitle(t, title))) continue

        data.items.push({
          id,
          title,
          summary,
          link: item.link || src.url,
          author: item.author || src.author || '',
          category,
          source: src.id,
          date: date.toISOString(),
          image: item.image.slice(0, 400) || '',
        })
        existing.add(id)
        existingTitles.push(title.toLowerCase())
        added++
      }
      aliveSources.push({ ...src, alive })
    } catch (e) {
      log(`  ⚠ ${src.name} — ${e.message}`)
      aliveSources.push({ ...src, alive: false })
    }
  }

  data.sources = aliveSources.map(({ id, name, url, feed, category, author, active, filter, alive }) => ({
    id, name, url, feed, category, author,
    alive, filter: !!filter,
  }))

  data.items.sort((a, b) => new Date(b.date) - new Date(a.date))
  if (data.items.length > (meta.maxItems || 500)) data.items = data.items.slice(0, meta.maxItems)

  // git-idempotencia: solo renovar generatedAt si items o sources cambiaron de verdad.
  // (evita commits vacíos de `data: refresh` en CI cuando una corrida no agrega nada)
  const itemsChanged = JSON.stringify(data.items.map((i) => i.id)) !== prevItemsKey
  const sourcesChanged = JSON.stringify(data.sources) !== prevSources
  const changed = itemsChanged || sourcesChanged
  if (changed) data.generatedAt = new Date().toISOString()
  recompute(data)

  const json = JSON.stringify(data, null, 2) + '\n'
  await writeFile(DATA_PATH, json, 'utf8')
  await writeFile(STATIC_PATH, json, 'utf8')

  log(`✓ feeds: ${sources.length} · ítemes parseados: ${fetched} · agregados: +${added} · total: ${data.items.length}`)
  log(`✓ fuentes vivas: ${data.feedStats.alive}/${data.feedStats.sources}`)
  return { added, total: data.items.length, changed }
}

const res = await main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
// exit code 0 siempre (aunque no haya cambios) — para CI idempotente
if (process.env.DM_EXIT_CHANGED === '1') {
  process.exit(res.changed ? 0 : 0)
}