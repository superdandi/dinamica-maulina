# PLAN DE IMPLEMENTACIÓN — DINÁMICA MAULINA 2.0

> **Estado actual**: 🚧 EN IMPLEMENTACIÓN
> **Última actualización**: 2026-09-15
> **Autor**: Daniel Cobos (superdandi)
> **Repo**: https://github.com/superdandi/dinamica-maulina
> **URL publicación**: https://superdandi.github.io/dinamica-maulina/
> **Referencia técnica**: `docs/web-estatica-rss.md` (patrón web estática autoalimentada) + proyecto `skynet-monitor-spa`

---

## 1. VISIÓN DEL PROYECTO

Revivir **Dinámica Maulina** (revista/blog digital de la Región del Maule, originalmente publicada entre ~2011-2012 en Blogger) como un **portal/revista moderno, 100% estático y autoalimentado**, enfocado en **cultura y arte de la Región del Maule, Chile**.

Cumple el mismo espíritu del original: servir de **agregador y catálogo** de la escena cultural maulina (poetas, músicos, muralistas, artesanos, artistas visuales, teatristas, colectivos) — pero con esteroides: contenido **dinámico** que se actualiza solo desde fuentes RSS/Atom, diseño moderno, búsqueda, clima regional y despliegue automático.

### 1.1 Principios rectores

| Principio | Descripción |
|---|---|
| **Web estática que "respira"** | El sitio es solo archivos estáticos. El contenido se regenera EN EL BUILD, no en runtime (patrón documentado). |
| **Autoalimentación** | Un cron (GitHub Actions) despierta el pipeline, lee feeds, normaliza, hace commit; el commit regenera el sitio. |
| **Zero-dependencias en producción** | El sitio sirve HTML/CSS/JS/JSON. Sin backend, sin BD, sin servidor que operar. |
| **Costo $0** | GitHub Actions (2000 min/mes) + GitHub Pages = gratis. |
| **Solo Región del Maule** | Todo contenido es de/sobre el Maule: Talca, Curicó, Linares, Constitución, Cauquenes, San Clemente, etc. |
| **Memoria + frescura** | Preservar el legado del catálogo original (curado) y sumar fuentes culturales activas 2026. |
| **Idempotencia** | Correr el pipeline N veces produce el mismo resultado (2ª corrida = +0 items). |

---

## 2. ALCANCE

### 2.1 Incluye (in-scope)

- Repositorio de GitHub Pages con Hugo como generador de sitios estáticos.
- Sistema de ingestión de feeds RSS/Atom/JSON de fuentes culturales del Maule.
- Clasificación heurística automática en categorías temáticas.
- Deduplicación robusta + idempotencia del pipeline.
- Páginas estáticas SEO-friendly por categoría (build-time).
- Página Inicio con feed "La Corriente" (lo más reciente) + grilla de categorías.
- Página Catálogo (directorio de blogs/fuentes asociadas, estilo original).
- Página Nosotros (historia, espíritu, contacto `dcobosm@gmail.com`, invitación a participar).
- Búsqueda + filtros por categoría (Fuse.js, client-side).
- Widget de clima de 6 ciudades del Maule (Open-Meteo, sin API key).
- Diseño responsive moderno con identidad propia "Río Maule".
- Automatización CI: workflow de actualización (cron) + workflow de deploy.
- README del proyecto.

### 2.2 Excluye (out-of-scope)

- Backend/API propia, base de datos, cuentas de usuario o autenticación.
- Actualizaciones push en tiempo real (WebSocket).
- Scraping con anti-bot de sitios sin RSS público.
- Comentarios funcionales en el sitio (el original usaba Blogger comments; no se migran).
- Panel de administración: el "admin" se hace via commits (editar `sources.json`, re-correr workflow).
- Multilenguaje / internacionalización.
- Migración del contenido histórico del blog 2012 (solo feeds vivos del catálogo + nuevos).
- Dominio propio `.cl` (inicialmente `github.io`).

### 2.3 Alcance territorial (ciudades/comunas referenciadas)

Talca (capital), Curicó, Linares, Constitución, Cauquenes, San Clemente, Molina, San Javier, Parral, Cauquenes, Chanco, Pelluhue, Licantén, Vichuquén, Hualañé, Romeral, Teno, Villa Alegre, Vilches, Maule, San Rafael, Empedrado, Sagrada Familia, Longaví, Retiro, Yerbas Buenas, Colbún, Río Claro, Pelarco, Pencahue, Curepto, San Pedro, Peluhue.

---

## 3. ARQUITECTURA

### 3.1 Las 4 capas (patrón `web-estatica-rss.md`)

```
                    CAPA 1 — FUENTES
   ┌──────────┬────────────┬────────────┬───────────┐
   │ RSS 2.0  │    Atom    │   JSON/API │  Blogger  │
   └──────────┴────────────┴────────────┴───────────┘
                        │ fetch GET (timeout 30s, UA propio)
                        ▼
                    CAPA 2 — PIPELINE (scripts/feed-sources.mjs)
   ┌──────────────────────────────────────────────────────────┐
   │ fetch → parse (RSS+Atom) → decode → clasificar categoría │
   │ → thumbnail → fuente → dedupe (ID + similitud) → ventana │
   │ → JSON (data/faust.json + static/data/faust.json)        │
   └──────────────────────────┬───────────────────────────────┘
                              │ commit + push (solo si cambió)
                              ▼
                    CAPA 3 — WEB ESTÁTICA (Hugo)
   ┌──────────────────────────────────────────────────────────┐
   │ build-time: Inicio, Categorías, Catálogo, Nosotros       │
   │ client-side: Búsqueda (Fuse.js) + Clima (Open-Meteo)     │
   └──────────────────────────┬───────────────────────────────┘
                              │ build → public/
                              ▼
                    CAPA 4 — ORQUESTACIÓN (GitHub Actions)
   ┌──────────────────────────────────────────────────────────┐
   │ workflow "Update Data" (cron 8h + dispatch)              │
   │ workflow "Deploy"  (on push a main → hugo build → Pages) │
   └──────────────────────────────────────────────────────────┘
```

### 3.2 Flujo de datos completo

```
cron cada 8h (UTC)  ── worklow_dispatch manual
      │
      ▼
  node scripts/feed-sources.mjs
      ├── 1. Leer sources.json (config curada de feeds)
      ├── 2. fetch cada feed (timeout 30s, graceful degradation)
      ├── 3. parsear RSS 2.0 + Atom (regex, tags en cascada)
      ├── 4. decode CDATA + entidades + whitespace
      ├── 5. extraer thumbnail (media:content/enclosure/img)
      ├── 6. clasificar a categoría (reglas de keywords con score)
      ├── 7. filtrar ruido (NOISE_BLOCKERS: avisos, sorteos, patrocinados)
      ├── 8. ventana temporal (12h ≤ edad ≤ 120 días)
      ├── 9. dedupe: ID estable + similitud de tokens ≥ 45%
      ├── 10. ordenar por fecha desc, tope de items
      ├── 11. recalcular agregados (counts por categoría, fuentes, generadoAt)
      └── 12. escribir data/faust.json + static/data/faust.json
              (solo si hubo cambios → commit + push a main)
                    │
                    ▼ (push a main dispara deploy)
  workflow Deploy
      ├── checkout + setup Hugo (extended)
      ├── hugo --gc --minify
      └── peaceiris/actions-gh-pages → public/ → gh-pages branch
                    │
                    ▼
  https://superdandi.github.io/dinamica-maulina/
      ├── fetch /data/faust.json (cada 30s + al cargar)
      └── Inicio / Categorías / Catálogo / Nosotros
```

---

## 4. STACK TECNOLÓGICO

| Componente | Elección | Justificación |
|---|---|---|
| Hosting | GitHub Pages | Gratis, CDN, integrado con repo |
| SSG | Hugo (extended) | Rápido, cero deps runtime, data-driven |
| Pipeline | Node.js `.mjs` (≥18/22), **cero dependencias** | Portátil, sin install frágil en CI |
| CI/CD | GitHub Actions | Cron + dispatch + deploy |
| Búsqueda | Fuse.js (vendored en `static/lib/`) | Client-side, ~30kb, sin backend |
| Clima | Open-Meteo API (fetch cliente) | Gratis, sin API key, CORS habilitado |
| Estilos | CSS custom properties (vanilla) | Sin Tailwind → menos piezas, coherente con filosofía zero-dep |
| Tipografía | Google Fonts: Fraunces (display serif) + Inter/Figtree (cuerpo) | Aire editorial moderno |
| Iconos | SVG inline + emoji discrecional | Sin dependencias |
| Favicon/logo | SVG generado por nosotros | Identidad propia |

### 4.1 Requisitos locales (dev)

- Hugo extended (instalar: `sudo pacman -S hugo` — CachyOS/Arch)
- Node ≥ 18 (el sistema tiene **v26.4.0** ✅)
- git + GitHub CLI autenticado (`gh auth status` ✅ — cuenta `superdandi`)

---

## 5. MODELO DE DATOS

### 5.1 Salida del pipeline: `data/faust.json`

```jsonc
{
  "generatedAt": "2026-09-15T14:00:00.000Z",
  "items": [
    {
      "id": "2026-09-01-titulo-slugged",
      "title": "Título de la publicación",
      "summary": "Resumen de hasta 300 caracteres...",
      "link": "https://fuente.cl/publicacion",
      "author": "Nombre del autor/de la fuente",
      "category": "POESIA",
      "source": "poesia-maulina",
      "date": "2026-09-01",
      "image": "https://...thumbnail.jpg"
    }
  ],
  "counts": {
    "POESIA": 12, "LITERATURA": 8, "MUSICA": 10, "TEATRO": 4,
    "ARTES_VISUALES": 9, "ARTESANIAS": 6, "PATRIMONIO": 5,
    "FOTOGRAFIA": 7, "CINE_MEDIOS": 3, "TERRITORIO": 4
  },
  "sources": [
    { "name": "Poesía Maulina", "url": "https://samuelmaldonado33.blogspot.com",
      "feed": "https://samuelmaldonado33.blogspot.com/feeds/posts/default",
      "category": "POESIA", "alive": true }
  ]
}
```

### 5.2 Campos normalizados (esquema plano de cada ítem)

| Campo | Tipo | Origen / regla |
|---|---|---|
| `id` | string | `YYYY-MM-DD + slug(título)[:80]` — ID estable para dedupe |
| `title` | string | `<title>` o `<media:title>`; máx 200 chars |
| `summary` | string | `description \|\| summary \|\| content:encoded` (cascada), decodificado, máx 300 chars |
| `link` | string | primer `<link>` de item (href si es Atom) |
| `author` | string | `<dc:creator>`, `<author>`, o nombre de la fuente |
| `category` | enum | Una de las 10 categorías (ver §6) |
| `source` | string | `id` de la fuente en `sources.json` |
| `date` | string ISO | `pubDate \|\| published \|\| updated \|\| date` |
| `image` | string? | thumbnail `media:thumbnail`/`enclosure` o primera `<img>` del description |

### 5.3 Configuración de fuentes: `scripts/sources.json`

```jsonc
{
  "categoryDefault": "ARTES_VISUALES",
  "window": { "minAgeHours": 12, "maxAgeHours": 2880 },  // 2880h = 120 días
  "maxItems": 400,
  "feeds": [
    {
      "id": "poesia-maulina",
      "name": "Poesía Maulina",
      "url": "https://samuelmaldonado33.blogspot.com",
      "feed": "https://samuelmaldonado33.blogspot.com/feeds/posts/default",
      "category": "POESIA",
      "author": "Samuel Maldonado"
    }
  ]
}
```

---

## 6. CATEGORÍAS TEMÁTICAS (10)

Agrupaciones temáticas de contenidos culturales de artistas y técnicas del Maule — el corazón del sitio.

| Categoría | ID | Keywords de clasificación | Ejemplos del original |
|---|---|---|---|
| Poesía | `POESIA` | poema, poesía, verso, haiku, soneto, rima, madrigal, décima | Poesía Maulina, Poemas de un Angel Caído, HOJAS CAÍDAS, La casa del poeta |
| Literatura | `LITERATURA` | libro, novela, cuento, relato, editorial, ensayo, crónica, narrativa | El rincón literario de Daniel Cobos, Ediciones Acéfalo |
| Música | `MUSICA` | concierto, recital, canción, disco, banda, cueca, tonada, folclor, rock, jazz | Evelyn Cornejo, Mario Parra, Bagresivo, Murieta Rock |
| Teatro | `TEATRO` | teatro, función, obra, dramaturgia, escenario, acto, dramaturgo | Teatro Altoque, Teatrofiado, Teatro Regional del Maule |
| Artes Visuales | `ARTES_VISUALES` | mural, pintura, exposición, galería, acuarela, óleo, grabado, instalación, artista visual | Mono González, Romina Ortega, Galería MediaAgua, Galería Gabriel Pando |
| Artesanías & Oficios | `ARTESANIAS` | telar, tejer, cerámica, alfarería, crin, macramé, tejido, talabartería, artesanía, oficio | Telares para Chile, Carla Macramé, Joyería AVG, Decoupage en Tejas |
| Patrimonio & Cultura | `PATRIMONIO` | patrimonio, mito, leyenda, tradición, fiesta, costumbrista, cocina, mapuche, huasa | Mitos y leyendas del Maule, Refranes populares, Kuraf Werken, El Conventillo |
| Fotografía | `FOTOGRAFIA` | foto, fotografía, lente, serie fotográfica, documental gráfico | Foto Callejera, Antonia Moreno, MACRO, JPAVEZPHOTO |
| Cine & Medios | `CINE_MEDIOS` | cine, documental, cortometraje, película, radio, canal, podcast | Villalegre Gráfico (documental), Vizcoso Entertainment |
| Territorio & Naturaleza | `TERRITORIO` | río, montaña, sendero, trekking, humedal, reserva, aves, biodiversidad, Achibueno, precordillera | ENDEMICO, Salvemos Achibueno, Maule Coastkeeper |

### 6.1 Categoría default

Si un ítem no matchea ninguna categoría, cae en la categoría declarada como `categoryDefault` en `sources.json`. **Nunca debe quedar `undefined`** (lección aprendida de skynet-monitor: `severity: undefined`).

---

## 7. DISEÑO — CONCEPTO "RÍO MAULE"

Identidad visual nueva que evoca el espíritu del original pero con lenguaje contemporáneo de revista cultural.

### 7.1 Concepto

- **Metáfora**: el río Maule como corriente de cultura que fluye desde la precordillera al mar — recurrente en el diseño.
- **Aire**: revista cultural impresa moderna (editorial, tipográfica, con jerarquías fuertes).
- **Tono**: cálido, territorial, con orgullo maulino. No folk-lite ni kitsch; sobrio y elegante.

### 7.2 Paleta (CSS custom properties)

```css
--arcilla-400: #C66A3C;   /* terracota — acento principal */
--arcilla-600: #9C4A24;
--rio-500: #1F6E8C;       /* azul profundo del río */
--viñedo-500: #5A6B3C;    /* verde viñedo */
--arena-50: #FAF6EF;      /* fondo crema */
--arena-100: #F1E9DB;
--tinta-900: #1C1917;     /* texto principal */
--tinta-500: #6B6460;     /* texto secundario */
```

3 acentos (arcilla/azul/verde) para diferenciar tipo de contenido secundario.

### 7.3 Tipografía

- **Display**: Fraunces (serif variable con carácter) — titulares, marca, categorías.
- **Cuerpo/UI**: Inter o Figtree — legible, moderna.
- Cargar via Google Fonts con `display=swap` y fallback serif/sans.

### 7.4 Elementos de identidad

- **Logotipo**: "Dinámica Maulina" — "Dinámica" en Fraunces italic + "MAULINA" en uppercase spaced; motivos del río como onda en SVG.
- **Ticker "La Corriente"**: marquee en el header con nombres de localidades del Maule (Talca · Curicó · Linares · Constitución · Cauquenes · San Clemente …) — celebra el territorio.
- **Líneas de río**: divisores SVG ondulados entre secciones.
- **Granos / textura**: ruido sutil CSS (svg-noise data-uri) para calidez de impreso.
- **Tarjetas de ítem**: imagen arriba, categoría como label pill, título serif, fuente + fecha.

### 7.5 Estructura de páginas

| Ruta | Página | Contenido |
|---|---|---|
| `/` | Inicio | Hero con marca, ticker, feed "La Corriente" (top 24 recientes), grilla de categorías (10 tiles), clima |
| `/categorias/` | Categorías | Índice de las 10 categorías |
| `/categorias/<slug>/` | Categoría | Items clasificados de esa categoría (build-time) |
| `/catalogo/` | Catálogo | Directorio de blogs/fuentes asociadas (estilo original) |
| `/nosotros/` | Nosotros | Historia, espíritu, contacto, invitación a participar |
| `/buscar/` | Búsqueda | Input + resultados Fuse.js con filtro por categoría |
| `/404.html` | 404 | Página de error elegante con marca |

### 7.6 Responsividad

- Mobile-first. Breakpoints: 640 / 768 / 1024 px.
- Grilla de tarjetas: 1 col (≤640) / 2 col (≤1024) / 3 col (>1024).
- Ticker y header adaptativos (accesible, `prefers-reduced-motion`).

---

## 8. CLIENTE (JS vanilla)

### 8.1 Búsqueda (Fuse.js)

- `static/lib/fuse.min.js` vendored (se descarga e incluye en repo; sin CDN en runtime).
- Índice from `/data/faust.json` (issues: cache-busting `?t=${Date.now()}`).
- Búsqueda en `title + summary + author + source`.
- Filtro por categoría (select de pills) + orden por fecha.
- Umbral Fuse: `threshold: 0.4`, `ignoreLocation: true`.

### 8.2 Clima (Open-Meteo — sin API key)

- Fetch: `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&daily=weather_code,temperature_2m_max,temperature_2m_min&current_weather=true&timezone=auto`
- Ciudades (lat, lon):
  | Ciudad | Lat | Lon |
  |---|---|---|
  | Talca | -35.4264 | -71.6554 |
  | Curicó | -34.9828 | -71.2394 |
  | Linares | -35.8467 | -71.5931 |
  | Constitución | -35.3333 | -72.4117 |
  | Cauquenes | -35.9669 | -72.3225 |
  | San Clemente | -35.5381 | -71.4 |
- Mapa `weather_code` → ícono SVG inline (sol / nubes / lluvia / nieve / tormenta).
- Widget: selector de ciudad (tabs), hoy (temp actual + máx/mín) + próximos 3 días.
- Estados: cargando / datos / error (mensaje elegante, no pantalla rota).

### 8.3 Robustez UI

- `ErrorBoundary`-like para cada widget (try/catch + estado de error).
- Polling del JSON cada 30 s con `?t=` para cache-busting.
- Respetar `prefers-reduced-motion` (desactiva marquee/animaciones).
- `lang="es"`, meta OG/Twitter cards, favicon SVG.

---

## 9. ORQUESTACIÓN — GITHUB ACTIONS

### 9.1 `.github/workflows/update-data.yml`

```yaml
name: Update Data
on:
  schedule:
    - cron: '0 */8 * * *'   # cada 8h (UTC)
  workflow_dispatch:          # botón manual
permissions:
  contents: write
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: sudo apt-get update && sudo apt-get install -y poppler-utils   # pdftotext (programa UTalca)
      - run: node scripts/feed-sources.mjs
      - run: |
          git config user.name "dm-data-bot"
          git config user.email "dm-data-bot@users.noreply.github.com"
          git add data/ static/data/
          if git diff --cached --quiet; then echo "no changes"; else
            git commit -m "data: refresh ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
            git push origin main
          fi
```

### 9.2 `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: write
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: peaceiris/actions-hugo@v3
        with: { hugo-version: '0.145.0', extended: true }
      - run: hugo --gc --minify
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
          force_orphan: true
```

---

## 10. ESTRUCTURA DEL REPO

```
dinamica-maulina/
├── PLAN-IMPLEMENTACION.md        # ESTE DOCUMENTO (bitácora de avance)
├── README.md
├── .gitignore
├── .github/
│   └── workflows/
│       ├── update-data.yml
│       └── deploy.yml
├── hugo.toml                     # config Hugo
├── assets/
│   ├── css/main.scss             # diseño sistema (compilado por Hugo)
│   └── img/                      # logo, og-image, favicon.svg
├── config/_default/
│   ├── params.toml               # identidad, ciudades clima, categorías
│   └── menus.toml
├── content/
│   ├── _index.md
│   ├── categorias/_index.md
│   ├── catalogo/_index.md
│   ├── nosotros/_index.md
│   └── buscar/_index.md
├── data/
│   └── faust.json                # GENERADO por pipeline (build-time)
├── scripts/
│   ├── sources.json              # config curada de feeds (MANUAL)
│   └── feed-sources.mjs          # pipeline (GENERADO)
├── static/
│   ├── data/
│   │   └── faust.json            # copia para cliente (búsqueda/clima)
│   ├── lib/
│   │   └── fuse.min.js           # vendored
│   └── js/
│       ├── app.js                # manual búsqueda + clima
│       └── weather.js            # widget clima
└── layouts/
    ├── _default/
    │   ├── baseof.html
    │   ├── list.html
    │   ├── single.html
    │   └── 404.html
    ├── index.html
    ├── categorias/list.html
    └── partials/
        ├── head.html  header.html  footer.html
        ├── marquee.html  category-tile.html  item-card.html
        └── weather.html  search-box.html  river.html (divisor SVG)
```

---

## 11. FASES E IMPLEMENTACIÓN — CHECKBOXES DE AVANCE

> Regla: cada tarea marcada `[x]` solo tras verificación real. Los checkboxes se van tildando en este mismo documento.

### FASE 0 — Setup base
- [x] Instalar Hugo extended localmente (`sudo pacman -S hugo` + `hugo version`) — **v0.166.0+extended**
- [x] Crear repo `dinamica-maulina` (público) y clonarlo local
- [x] Crear `.gitignore` (public/, node_modules si aplica, .DS_Store)
- [x] Estructura base de directorios (layouts, assets, static, content, scripts, data, config)
- [x] `hugo.toml` con parámetros base (title, baseURL, locale, params) + `config/_default/params.toml` (10 categorías, 6 ciudades clima, ticker)
- [x] Páginas base + layouts base: `hugo --gc --minify` compila 37 páginas sin errores (verificado 2026-09-15)
- [x] Primer commit + push a main (`chore: esqueleto…` — rama main trackeando origin)

### FASE 1 — Pipeline de datos
- [x] Auditoría de feeds: `scripts/probe-feeds.mjs` — **44 feeds válidos / 15 fallidos** (401/404/token bloqueado)
- [x] Curaduría final: `scripts/sources.json` con **43 feeds** del legado vivo + expansión (Seremi de las Culturas, Diario El Centro)
- [x] Expansión: fuentes activas 2026 incorporadas (Seremi MinCultura Maule, Diario El Centro)
- [x] `parseRSS()` con soporte RSS 2.0 + Atom + CDATA + thumbnails (item-card HTML / media / enclosure)
- [x] Clasificador heurístico → 10 categorías + fallback `categoryDefault`; fuentes noticiero con `filter:true` exigen relevancia cultural
- [x] `NOISE_BLOCKERS` (sorteos, fútbol, política, inmobiliario, policial…)
- [x] Dedupe por ID estable + similitud de tokens ≥ 45%
- [x] Ventana temporal configurable (12h a 9999d = histórico completo) + `maxItems: 1500`
- [x] Recálculo de agregados (`counts`, fuentes, `feedStats.itemsPerSource`, `generatedAt`)
- [x] Escritura `data/faust.json` + copia `static/data/faust.json` (solo si cambio)
- [x] Ejecutar local: seed **600 ítemes reales** (2006→2026) · 38/43 fuentes vivas
- [x] **Prueba de idempotencia: 2ª corrida → +0 items** ✅

### FASE 2 — Tema Hugo y diseño "Río Maule"
- [x] `baseof.html` con head/header/footer + meta tags + OG
- [x] Sistema de diseño CSS (`assets/css/main.css`): paleta §7.2 + tipografía §7.3 (main.css, no SCSS: evita dep dart-sass → menos piezas en CI)
- [x] Marca/tipografía (wordmark "Dinámica MAULINA" + favicon SVG 🌊); todo en CSS/HTML
- [x] Ticker/marquee "La Corriente" (nombres de localidades, reduced-motion)
- [x] Divisores SVG "líneas de río" + textura
- [x] `item-card.html` (imagen/lugar, pill categoría, título serif, fuente+fecha) — Hugo + JS
- [x] `category-tile.html` (10 tiles con acento por color) + grilla de categorías
- [x] Inicio: hero + La Corriente (top 24 vía JS) + categorías + clima
- [x] Página Categorías + landing por categoría (build-time desde data) — layout `categoria/list.html`
- [x] Página Catálogo (directorio de fuentes con estado viva/inactiva) — layout `catalogo/list.html`
- [x] Página Nosotros (historia, contacto, invitación)
- [x] 404 elegante
- [x] Responsive completo (640/1024) + `prefers-reduced-motion`
- [x] Render local: `hugo --gc --minify` sin errores (verificado: 37 páginas, 4 estáticos; categorías pobladas 4–124 items)

### FASE 3 — Cliente dinámico
- [x] `static/lib/fuse.min.js` vendored (**Fuse v6.6.2**, ~23 KB)
- [x] `static/js/app.js`: carga `/data/faust.json` con cache-busting + estados UI
- [x] Búsqueda Fuse.js (title+summary+author+source, weights, threshold 0.4)
- [x] Filtro por categoría (pills) + render
- [x] `static/js/weather.js`: Open-Meteo 6 ciudades (hoy + 3 días, WMO→íconos)
- [x] Mapeo weather_code → íconos + estados cargando/error
- [x] Prueba local (servido en `/dinamica-maulina/`, assets 200, categorías renderizadas)

### FASE 4 — Orquestación CI
- [x] `update-data.yml` (cron 8h + dispatch + commit condicional + push)
- [x] `deploy.yml` (on push → hugo build → gh-pages)
- [x] Configurar Pages en el repo (branch `gh-pages`)
- [x] Correr workflow Update manualmente (seed en CI)
- [x] Verificar deploy y URL `superdandi.github.io/dinamica-maulina/` en línea
- [x] Verificar contenido actualizado tras 1 ciclo cron (o force rerun)

### FASE 5 — Lanzamiento y pulido
- [x] README completo (qué es, cómo funciona, cómo correr, cómo contribuir feeds)
- [x] Meta OG/Twitter + screenshot social (og-image 1200×630 PNG, énfasis tipográfico)
- [x] Revisión accesibilidad y SEO (títulos, alt, lang, aria)
- [x] Prueba de carga/rendimiento del sitio desplegado
- [x] Rodar el pipeline 2× en remoto y confirmar idempotencia en Actions logs
- [x] Fix de git-idempotencia del pipeline (`generatedAt` solo cambia si items/sources cambian) + doble verificación en CI con dispatch
- [ ] Retocar `sources.json` con cualquier feed que falle (dead/format change)
- [ ] Notificar lanzamiento / validación final con el usuario

### FASE 6 — Evaluación y ciclo de mejora (confirmado 2026-09-15)
*Decisiones del usuario: (1) parches rápidos + rendimiento en la misma sesión; (2) "La Corriente" = últimos 12 meses, archivo histórico solo en búsqueda; (3) alcance v2: primero reforzar categorías pobres, luego Agenda Maulina.*

**A — Expreso Maule (parches rápidos)**
- [x] A1 RSS propio real: `layouts/index.rss.xml` con top-100 de `hugo.Data.faust` (pubDate, guid, enclosure) + `<link rel="alternate" type="application/rss+xml">` en head (hoy `index.xml` tiene **0 `<item>`**)
- [x] A2 Eliminar `/categories/` fantasma: `disableKinds = ['taxonomy','term']`
- [x] A3 Canonical `<link rel="canonical">` en todas las páginas
- [x] A4 Fuentes legibles: mapa `source.id → name` en servidor (`item-card.html`) y cliente (`window.DM.sourceNames`)
- [x] A5 `onerror` de imagen también server-side (patrón: ocultar img → mostrar placeholder)
- [x] A6 Búsqueda: ordenar resultados Fuse por fecha desc

**B — Río liviano (rendimiento)**
- [x] B7 Server-render "La Corriente" (últ. 12 meses, top ~24) en `index.html` + conteos; home sin fetch (progressive enhancement, SEO)
- [x] B8 Corpus slim: `static/data/search.json` minificado (archivo total) **solo** para `/buscar/` ↔ `data/faust.json` build-time; cache por `generatedAt` en vez de `Date.now()`
- [ ] B9 Verificar TTFB/peso de tránsito y re-confirmar idempotencia CI

**C — Reforzar categorías pobres**
- [x] C10 (5 blogs maulinos agregados: 48 feeds · 43 vivas · TERRITORIO 4→65) Sondear (`probe-feeds.mjs`) candidatas para **TERRITORIO (4)** y **FOTOGRAFIA (23)**; agregar solo las vivas; ajustar ventana/requisitos por categoría si hace falta

**D — Agenda Maulina (eventos)**
- [x] D11 (extractEvent: "12 de marzo", "sábado 12", "este jueves" → campo `event` en ítems de <90 días) Detección de fechas en `feed-sources.mjs` (regex meses es + relativos) → campo `event`
- [x] D12 (página /agenda/ server-rendered + JSON-LD ItemList/Event + menú + CSS calendario) Página `/agenda/` server-rendered (próximos eventos) + JSON-LD `Event` + menú

**E — Centros culturales locales (fuentes dinámicas)**
- [x] E13 (IG cancelada: cuentas mezclan lo personal/profesional; la API oficial solo sirve cuentas B2B/pro; scraping de IG es frágil para un cron determinista → útiles solo vía monitoreo manual. Alternativa documentada: Agenda Maulina para convocatorias) Evaluación Instagram para El Espacio/La Candelaria/UTalca/UCM → **DESCARTADO**
- [ ] E14 (4 centros: El Espacio no tiene web (cobertura indirecta vía agregadores), La Candelaria WordPress con WAF 403 intermitente, UTalca con programa mensual PDF + feed de noticias, UCM sin RSS/API y blogspot ex-extensionucm muerto desde 2009) Auditoría de fuentes de Centros Culturales de El Espacio, La Candelaria, Extensión UTalca y Extensión UCM
- [x] E15 (Bloque 1: +5 feeds — ext-utalca-noticias, elmauleinforma, diariotalca, soymaule-agenda (filter:true) y lacandelariacultura) Agregadores regionales + noticias UTalca + Candelaria en `sources.json`
- [x] E16 (Bloque 2: `fetchUtalcaProgram` — home mav.utalca.cl → PDF mensual → `pdftotext -layout` → parser tolerante al layout (días+horas fusionadas con texto, títulos intercalados, series "1 y 8") → ítems con `event.kind:'program'` (inmunes al re-enriquecimiento) que entran a La Corriente y la Agenda) **Programa mensual de Extensión UTalca (PDF)** — reemplazo mensual idempotente (no genera commits vacíos)
- [x] E17 (bug reportado por el usuario: los enlaces de categorías daban 404 — causa: slugs `artes_visuales`/`cine_medios` con guion bajo vs páginas reales `artes-visuales`/`cine-medios`, y `absURL` de rutas absolutas ignora la subruta `/dinamica-maulina/` → tiles y "Ver índice" ahora con ruta RELATIVA + `absURL`; header con `{{ .Permalink }}` absoluto; verificado: 0 enlaces internos rotos en `public/`) **Fix 404 categorías**

---

## 12. CRITERIOS DE ACEPTACIÓN (Definition of Done global)

1. **URL pública operativa**: `https://superdandi.github.io/dinamica-maulina/` responde 200 y carga correctamente en mobile y desktop.
2. **Autoalimentación demostrada**: el cron cada 8h (o un dispatch manual) actualiza contenido sin intervención humana, y se evidencia un commit `data: refresh`.
3. **Idempotencia**: ejecutar el pipeline dos veces seguidas entrega la 2ª vez `+0 items`.
4. **10 categorías pobladas**: cada categoría muestra ≥ 1 item real del Maule.
5. **Búsqueda y filtros funcionales**: resultado en <500ms; filtrar por categoría funciona; estados de error controlados.
6. **Clima regional funcional**: 6 ciudades con pronóstico hoy + 3 días, sin API key.
7. **Diseño "Río Maule" implementado**: paleta, tipografías, ticker, divisores, responsive, reduced-motion.
8. **Sin warnings críticos** en `hugo` build ni errores JS en consola.
9. **Feed muerto no rompe el build**: un feed caído se loguea y el proceso continúa (graceful degradation).
10. **Legacy curado**: los feeds del catálogo original que respondan XML están incluidos; los muertos, documentados como excluidos.

---

## 13. RIESGOS Y MITIGACIONES

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Cron de GH retrasado (cola) | Frescura ≤ 8h+retraso | Aceptable; `workflow_dispatch` manual; cadencia 8h tolerante |
| Feeds cambian formato | Parseo roto, items perdidos | Logs claros, re-correr a mano, monitorear commits |
| Feeds muertos / rate-limit | Items faltantes 1 corrida | Graceful degradation + alive flag en sources |
| Cache navegador/CDN | Usuarios ven datos viejos | Polling con `?t=`, headers de Pages |
| CORS en feeds | Fetch bloqueado en navegador | El pipeline corre en Node (CI sin CORS) — el navegador solo lee JSON propio |
| Clasificación heurística | Items mal categorizados | Fallback categoryDefault; ajuste de keywords; revisión manual del JSON |
| Dependencia de Fonts CDN | Tipografía falla sin red | `display=swap` + fallbacks serif/sans |
| Open-Meteo fuera | Widget clima vacío | Estado de error elegante, el sitio no depende de ello |
| Blogs Blogger viejos (HTTP no HTTPS / muertos) | Enlaces rotos | Validar al curar; `http`→`https`; alive flag |

---

## 14. DECISIONES REGISTRADAS (ADR-lite)

| # | Decisión | Alternativas | Razón |
|---|---|---|---|
| D1 | Hugo (tema propio) vs Jekyll/Astro/Next | SPA plain (patrón skynet) | Elegido por el usuario; build-time SEO superior a SPA |
| D2 | CSS vanilla + custom properties vs Tailwind | Tailwind/SCSS | Menos piezas en CI; coherente con filosofía zero-dep |
| D3 | Fuse.js vendored vs CDN | CDN | Robustez offline / reproducibilidad |
| D4 | Open-Meteo vs iframe tiempo.com | iframe embeds (original) | Gratis, sin key, CORS, marca propia |
| D5 | `data/faust.json` + `static/data/` copia | solo static | build-time (SEO) + client-side (búsqueda) |
| D6 | Fuentes curadas (legacy vivo) + nuevas | conservar todo / solo nuevas | Elegido por usuario: memoria + frescura |
| D7 | Ventana 120 días | 30 días (como skynet) | Blogs culturales publican poco; ventana generosa |
| D8 | Repo `dinamica-maulina`, URL `github.io/dinamica-maulina` | dominio propio `.cl` | elegido por usuario; dominio propio queda como follow-up opcional |

### 14.1 Follow-ups posibles (no parte de este alcance)

- Dominio propio `dinamica-maulina.cl` + Pages custom domain.
- Sección de eventos (agregar feed/API de eventos culturales).
- Formulario de contacto estático (Formspree/Netlify Forms).
- RSS propio generado por Hugo (`/feeds/`) para que otros nos sindiquen.
- Integración con OSV-style API cultural si aparece (ej. plataforma FONDART pública).

---

## 15. BITÁCORA DE AVANCE

| Fecha | Hito | Check | Notas |
|---|---|---|---|
| 2026-09-15 | Repo creado y clonado | ✅ | superdandi/dinamica-maulina público |
| 2026-09-15 | Este documento creado | ✅ | PLAN-IMPLEMENTACION.md v1 |
| 2026-09-15 | Hugo instalado | ✅ | v0.166.0+extended (pacman, mirrors sincronizados previamente) |
| 2026-09-15 | FASE 0 casi completa | ✅ | esqueleto + config + categorías + build 37 páginas OK |
| 2026-09-15 | Correcciones config | ✅ | `theme=''` eliminado; `languageCode`→`locale` (deprecado en v0.158+) |
| 2026-09-15 | FASE 1 completa | ✅ | Probe 44 vivos /15 fallidos · sources.json 43 feeds · 600 items (2006→2026) · idempotencia +0 |
| 2026-09-15 | FASE 2+3 base | ✅ | Tema completo: inicio/categorías/catálogo/nosotros/404/buscar · Cliente: Fuse.js + Open-Meteo |
| 2026-09-15 | FASE 4 completa | ✅ | Workflows update-data (cron 8h) + deploy · Pages en `gh-pages` · sitio **en línea** · CI idempotente |
| 2026-09-15 | FASE 5 (parcial) | ⏳ | README + og-image listos · accesibilidad/SEO y carga verificados · CI idempotente confirmado · pendiente: retoque de feeds fallidos |
| 2026-09-15 | Evaluación exhaustiva | ✅ | Hallazgos: RSS propio vacío (0 items), /categories/ fantasma, 617KB sin gzip + cache-busting destructivo, home solo-JS, slug en tarjetas, TERRITORIO/FOTOGRAFIA pobres |
| 2026-09-15 | FASE 6 confirmada | ✅ | Usuario: parches+rendimiento juntos · Corriente=12 meses · v2: reforzar categorías pobres → Agenda Maulina |
| 2026-09-15 | C+D completas | ✅ | Fuentes: 48 feeds (43 vivas), TERRITORIO 4→65 · Agenda: 3 eventos futuros detectados, /agenda/ + JSON-LD · corpus 717 items |
| 2026-09-15 | Fix 404 categorías | ✅ | Usuario reporta enlaces rotos: slugs con `_` inexistentes + `absURL` ignorando subruta → rutas relativas + slugs con guiones; 0 enlaces internos rotos verificado |
| 2026-09-15 | E: Centros culturales | ✅ | IG descartado · Bloque 1 (+5 agregadores, 54 fuentes) · Bloque 2 (programa mensual UTalca vía PDF, 8 eventos futuros → Agenda) · corpus 746 items · idempotencia confirmada |
| | | | |