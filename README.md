# Dinámica Maulina — revista digital del Maule

Sitio estático **autoalimentado**: agrupa en una sola corriente lo que publican por RSS los artistas, poetas, músicos, artesanos, teatros, medios y organismos de la Región del Maule (Chile).

**Producción:** <https://superdandi.github.io/dinamica-maulina/>

## Cómo funciona

```
fuentes (RSS/Atom) → pipeline Node → data/faust.json → Hugo → GitHub Pages
     ↑                                   ↓ (copia en static/)   ↑
 cron 8h (Actions)                    cliente JS (Fuse.js)   deploy on push
```

1. **Fuentes** — `scripts/sources.json` (43 feeds curados: blogs, radios, seremis, ferias, fundaciones).
2. **Pipeline** — `scripts/feed-sources.mjs` descarga cada feed, parsea RSS 2.0/Atom, bloquea ruido (prensa policial, deportes), clasifica en 10 categorías culturales, deduplica (ID estable + similitud de títulos) y escribe `data/faust.json` + `static/data/faust.json`. Es **idempotente**: re-correrlo agrega solo ítemes nuevos.
3. **Sitio** — Hugo compila páginas servidas 100 % estáticas; el cliente (`static/js/app.js`) carga el corpus con cache-busting y ofrece búsqueda Fuse.js + filtros; `weather.js` consulta Open-Meteo (6 ciudades, sin API key).
4. **CI** — `.github/workflows/update-data.yml` (cron cada 8 h) refresca el corpus; `.github/workflows/deploy.yml` publica en `gh-pages`.

## Categorías

POESIA · LITERATURA · MUSICA · TEATRO · ARTES_VISUALES · ARTESANIAS · PATRIMONIO · FOTOGRAFIA · CINE_MEDIOS · TERRITORIO

## Correr local

Requisitos: Hugo ≥ 0.166 (extended) y Node.js ≥ 20.

```bash
hugo server            # sitio con el corpus actual
node scripts/feed-sources.mjs   # refresca el corpus desde los feeds
node scripts/probe-feeds.mjs    # auditoría un solo uso de las fuentes
```

## Agregar una fuente

1. Editá `scripts/sources.json` (campos: `id name url feed category author`).
2. Si es un noticiero/medio general, agregá `"filter": true` (exige keywords culturales del item).
3. Ejecutá `node scripts/probe-feeds.mjs` para validar el feed y `node scripts/feed-sources.mjs` para regenerar.
4. Abrí un PR.

## Tech stack

- **Hugo** (SEO-friendly, build rápido) + CSS vanilla con sistema de diseño "Río Maule" (CSS custom properties).
- **Fuse.js** vendored (`static/lib/fuse.min.js`) — sin npm ni bundlers.
- **Open-Meteo** — pronóstico sin clave de API.
- **GitHub Actions** — pipeline de datos + deploy en `gh-pages`.

## Contacto

Daniel Cobos — <dcobosm@gmail.com> · La revista es un proyecto abierto: la invitación es a sumar voces, textos y registros del terruño.