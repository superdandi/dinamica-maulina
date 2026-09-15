#!/usr/bin/env node
/* Sonda de feeds — audita candidatos y reporta cuáles devuelven RSS/Atom válido.
 * Uso: node scripts/probe-feeds.mjs
 * Solo lectura: no modifica archivos.
 */

const CANDIDATES = [
  // --- Legado del catálogo original (cultura y arte) ---
  ['Poesía Maulina', 'https://samuelmaldonado33.blogspot.com/feeds/posts/default'],
  ['Rincón literario de Daniel Cobos', 'https://dcobos.blogspot.com/feeds/posts/default'],
  ['Poemas de un Angel Caído', 'https://poemasdeunangelcaido.blogspot.com/feeds/posts/default'],
  ['HOJAS CAÍDAS', 'https://hojas-caidas.blogspot.com/feeds/posts/default'],
  ['Sinfónica Caótica', 'https://sinfonicacaotica.blogspot.com/feeds/posts/default'],
  ['El Arte del Buen Fingir', 'https://elartedelbuenfingir.blogspot.com/feeds/posts/default'],
  ['La casa del poeta sin nombre', 'https://thanatoschile.blogspot.com/feeds/posts/default'],
  ['Anarcopoiesis', 'https://anarcopoiesis.blogspot.com/feeds/posts/default'],
  ['Descentralización Poética Maule', 'https://descentralizacionmaule.blogspot.com/feeds/posts/default'],
  ['Cuadernos del Maule', 'https://cuadernosdelmaule.blogspot.com/feeds/posts/default'],
  ['CC Kuraf Werken', 'https://kurafwerken.blogspot.com/feeds/posts/default'],
  ['CC El Conventillo', 'https://centroculturalelconventillo.blogspot.com/feeds/posts/default'],
  ['Teatro Regional del Maule (blog)', 'https://teatroregional.blogspot.com/feeds/posts/default'],
  ['Teatrofiado', 'https://teatrofiado.blogspot.com/feeds/posts/default'],
  ['Teatro Altoque', 'https://teatroaltoque.blogspot.com/feeds/posts/default'],
  ['Evelyn Cornejo', 'https://evelyncornejo.blogspot.com/feeds/posts/default'],
  ['Mono González', 'https://monogonzalez.blogspot.com/feeds/posts/default'],
  ['Romina Ortega (RO)', 'https://rominaortegamella.blogspot.com/feeds/posts/default'],
  ['ROMIGRAFA', 'https://romigrafa.blogspot.com/feeds/posts/default'],
  ['Patricio Chamorro', 'https://patriciografico.blogspot.com/feeds/posts/default'],
  ['Galería MediaAgua', 'https://galeriamediagua.blogspot.com/feeds/posts/default'],
  ['Galería Gabriel Pando', 'https://galeriagabrielpando.blogspot.com/feeds/posts/default'],
  ['Mitos y leyendas del Maule', 'https://mitosyleyendasdelmaule.blogspot.com/feeds/posts/default'],
  ['Refranes populares del Maule', 'https://refranespopularesdelmaule.blogspot.com/feeds/posts/default'],
  ['Foto Callejera', 'https://fotocallejera.blogspot.com/feeds/posts/default'],
  ['Antonia Moreno Aruta', 'https://morenoaruta.blogspot.com/feeds/posts/default'],
  ['MACRO', 'https://captura-macro.blogspot.com/feeds/posts/default'],
  ['Sinsopermia', 'https://sinsopermia.blogspot.com/feeds/posts/default'],
  ['Desblokeo Creativo (Ricardo Núñez)', 'https://desblokeocreativo.blogspot.com/feeds/posts/default'],
  ['Telares para Chile', 'https://telaresparachile.blogspot.com/feeds/posts/default'],
  ['Carla Macramé', 'https://macrarlamacrame.blogspot.com/feeds/posts/default'],
  ['Decoupage en Tejas', 'https://carmenartesaniatejas.blogspot.com/feeds/posts/default'],
  ['Joyería Original AVG', 'https://avargasguerrero.blogspot.com/feeds/posts/default'],
  ['Sastrería González', 'https://sastreriagonzalez.blogspot.com/feeds/posts/default'],
  ['Villalegre Gráfico', 'https://villalegregrafico.blogspot.com/feeds/posts/default'],
  ['El Centro (diario)', 'https://diarioelcentro.blogspot.com/feeds/posts/default'],
  ['El Centrito', 'https://elcentrito.blogspot.com/feeds/posts/default'],
  ['Extensión UCM', 'https://extensionucm.blogspot.com/feeds/posts/default'],
  ['Enterarte Región del Maule', 'https://enterartemaule.blogspot.com/feeds/posts/default'],
  ['Murieta Rock', 'https://murietarock.blogspot.com/feeds/posts/default'],
  ['Bolsillo de ideas', 'https://reikointhesky.blogspot.com/feeds/posts/default'],
  ['NAVERO MAULINO', 'https://naveromaulino.blogspot.com/feeds/posts/default'],
  ['Si Quiero Voy (danza)', 'https://siquierovoy.wordpress.com/feed/'],
  ['La Buscaglione', 'https://labuscaglione.blogspot.com/feeds/posts/default'],
  ['Mundo Volador (música)', 'https://mundovolador.blogspot.com/feeds/posts/default'],
  ['Polerón a luka', 'https://poleronaluka.blogspot.com/feeds/posts/default'],
  ['Con esto la mato (diseño)', 'https://conestolamato.blogspot.com/feeds/posts/default'],
  ['Picadas de Talca', 'https://picadasdetalca.blogspot.com/feeds/posts/default'],
  ['Taller Kintu Fiestas', 'https://tallerkintufiestas.blogspot.com/feeds/posts/default'],
  ['Las Tejas del Edu', 'https://tejasedu.blogspot.com/feeds/posts/default'],

  // --- Expansión 2026 (prensa/musa cultural y colectivos) ---
  ['El Amaule (feed)', 'https://www.elamaule.cl/feed'],
  ['El Amaule (rss)', 'https://www.elamaule.cl/rss'],
  ['Maulee', 'https://www.maulee.cl/feed/'],
  ['Diario El Centro web', 'https://www.diarioelcentro.cl/feed/'],
  ['Visión del Maule', 'https://www.visiondelmaule.cl/?feed=rss2'],
  ['Cauquenesnet', 'https://dianoticias.cauquenesnet.com/feeds/posts/default'],
  ['Maule Sur Noticias', 'https://www.maulesurnoticias.com/msur/index.php?format=feed&type=rss'],
  ['Seremi de las Culturas (MinCultura)', 'https://www.cultura.gob.cl/feed/?region=maule'],
  ['Muralismo Chile Maule (búsqueda)', 'https://www.maule7.cl/feed'],
]

function decode(str = '') {
  return str
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ').trim()
}

async function probe(name, url) {
  const row = { name, url, status: null, type: null, items: 0, firstTitle: '', error: '' }
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'dinamica-maulina-probe/1.0 (dcobosm@gmail.com)' },
      signal: AbortSignal.timeout(25000),
      redirect: 'follow',
    })
    row.status = res.status
    row.type = res.headers.get('content-type') || ''
    const text = await res.text()
    const hasRSS = /<rss[\s>]/i.test(text)
    const hasAtom = /<feed[\s>]/i.test(text)
    const hasItems = /<item[\s>]/i.test(text) || /<entry[\s>]/i.test(text)
    if (!hasItems) {
      row.error = hasRSS || hasAtom ? 'contiene feed pero sin items' : 'no parece feed (HTML/JS o blog muerto)'
    } else {
      const re = /<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/g
      const matches = text.match(re) || []
      row.items = matches.length
      const g = (raw, t) => decode((raw.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '')
      const first = matches[0] || ''
      row.firstTitle = g(first, 'title') || g(first, 'media:title') || ''
    }
  } catch (e) {
    row.error = e.name === 'TimeoutError' ? 'timeout 25s' : e.message
  }
  return row
}

const results = await Promise.all(CANDIDATES.map(([name, url]) => probe(name, url)))

const pad = (s, n) => String(s).padEnd(n)
const good = [], dead = [], empty = []
for (const r of results) {
  if (r.error) dead.push(r)
  else if (r.items === 0) empty.push(r)
  else good.push(r)
}

console.log('== FEEDS VÁLIDOS ==')
for (const r of good)
  console.log(`${pad(r.items, 4)}  ${pad(r.status, 3)}  ${pad(r.name, 38)} ${r.firstTitle.slice(0, 60)}`)
if (empty.length) {
  console.log('\n== RESPONDEN PERO SIN ITEMS ==')
  for (const r of empty) console.log(`${pad(r.status, 3)}  ${r.name}  (${r.error})`)
}
if (dead.length) {
  console.log('\n== FALLIDOS ==')
  for (const r of dead) console.log(`${pad(r.status || '-', 3)}  ${pad(r.name, 38)} ${r.error}`)
}

console.log(`\nTotal: ${good.length} válidos / ${empty.length} vacíos / ${dead.length} fallidos`)