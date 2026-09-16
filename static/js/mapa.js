(function () {
  'use strict';

  var root = document.getElementById('mapa-mapa');
  if (!root) return;

  var DM = window.DM || {};
  var base = DM.base || '';

  var NOMBRES = {
    ciudades: 'Ciudades y comunas',
    escenarios: 'Escenarios culturales',
    naturaleza: 'Territorio y naturaleza',
    fuentes: 'Fuentes del catálogo',
    agenda: 'Próximos eventos'
  };

  var COLORES = {
    ciudades: '#C66A3C',
    escenarios: '#1F6E8C',
    naturaleza: '#5A6B3C',
    fuentes: '#4A4440',
    agenda: '#C66A3C'
  };

  var mapa = null;
  var grupos = {};

  function fracaso(msg) {
    root.dataset.state = 'error';
    root.innerHTML = '<div class="state"><p>' + msg + '</p></div>';
  }

  function plegar(t) {
    return (t || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function urlCompleta(p) {
    try { return new URL(p, base).href; } catch (e) { return p; }
  }

  function pintarTabla() {
    var el = document.getElementById('mapa-lista');
    el.innerHTML = '';
    ['ciudades', 'escenarios', 'naturaleza', 'fuentes', 'agenda'].forEach(function (k) {
      var items = grupos[k];
      if (!items || !items.length) return;
      var li = document.createElement('li');
      li.className = 'mapa__grupo';
      li.innerHTML = '<h3>' + NOMBRES[k] + '<span class="mapa__cuenta">' + items.length + '</span></h3>';
      var ul = document.createElement('ul');
      items.forEach(function (x) {
        var it = document.createElement('li');
        var label = x.name || x.title;
        var href = x.url || x.link || null;
        it.innerHTML = href
          ? '<a href="' + urlCompleta(href) + '" target="_blank" rel="noopener">' + label + '</a>'
          : '<span>' + label + '</span>';
        ul.appendChild(it);
      });
      li.appendChild(ul);
      el.appendChild(li);
    });
  }

  function agregarCapa(nombre, items, color) {
    var lg = L.layerGroup();
    (items || []).forEach(function (cosa) {
      if (cosa.lat == null || isNaN(cosa.lat) || cosa.lon == null || isNaN(cosa.lon)) return;
      var icono = L.divIcon({
        className: 'mapa__punto mapa__punto--' + nombre,
        html: '<span class="mapa__punto-nucleo" style="background:' + color + '"></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 22],
        popupAnchor: [0, -22]
      });
      var m = L.marker([cosa.lat, cosa.lon], { icon: icono, title: cosa.name || cosa.title });
      var enlace = cosa.link
        ? '<a href="' + urlCompleta(cosa.link) + '" target="_blank" rel="noopener">Ir al evento →</a>'
        : (cosa.url ? '<a href="' + urlCompleta(cosa.url) + '" target="_blank" rel="noopener">Sitio →</a>' : '');
      var extra = '';
      if (nombre === 'agenda') {
        extra = valFecha(cosa);
        if (cosa.sede) extra = cosa.sede + ' · ' + extra;
      }
      var html = '<strong>' + (cosa.title || cosa.name) + '</strong>' + (extra ? '<br><span class="mapa__fecha">' + extra + '</span>' : '') + (cosa.desc ? '<p>' + cosa.desc + '</p>' : '') + enlace;
      m.bindPopup(html);
      m.addTo(lg);
    });
    lg.addTo(mapa);
    grupos[nombre] = (items || []).slice();
    grupos[nombre]._layer = lg;
  }

  function valFecha(x) {
    try {
      return new Date(x._inicio).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
    } catch (e) { return ''; }
  }

  function cargarAgenda(items, sedes, done) {
    var ahora = Date.now();
    var horizonte = ahora + 90 * 24 * 60 * 60 * 1000;
    var ev = (items || [])
      .filter(function (x) { return x.event && x.event.start; })
      .map(function (x) {
        var t = new Date(x.event.start).getTime();
        x._inicio = t;
        return x;
      })
      .filter(function (x) { return x._inicio >= ahora && x._inicio <= horizonte; })
      .sort(function (a, b) { return a._inicio - b._inicio; })
      .slice(0, 30);

    ev.forEach(function (x) {
      var texto = plegar((x.title || '') + ' ' + (x.summary || ''));
      var caer = function (lista, especifica) {
        return (lista || []).some(function (s) {
          if (s.fallback && especifica) return false;
          if (!s.fallback && !especifica) return false;
          var hit = s.patron.some(function (p) {
            return texto.indexOf(plegar(p)) !== -1;
          });
          if (hit) { x.lat = s.lat; x.lon = s.lon; x.sede = s.name; }
          return hit;
        });
      };
      if (!caer(sedes, true)) caer(sedes, false);
    });
    done(ev.filter(function (x) { return x.lat != null && !isNaN(x.lat); }));
  }

  function bboxDe(limite) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function recorrer(cs) {
      for (var i = 0; i < cs.length; i++) {
        var v = cs[i];
        if (typeof v[0] === 'number') {
          if (v[0] < minX) minX = v[0];
          if (v[0] > maxX) maxX = v[0];
          if (v[1] < minY) minY = v[1];
          if (v[1] > maxY) maxY = v[1];
        } else { recorrer(v); }
      }
    }
    (limite.features || []).forEach(function (f) {
      if (f.geometry) recorrer(f.geometry.coordinates);
    });
    if (!isFinite(minX)) return null;
    return [[minY, minX], [maxY, maxX]];
  }

  function papel() {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--arena-50').trim();
      if (v) return v;
    } catch (e) { /* noop */ }
    return '#FAF6EF';
  }

  function areaFirmada(anillo) {
    var a = 0;
    for (var i = 0; i < anillo.length - 1; i++) {
      a += anillo[i][0] * anillo[i + 1][1] - anillo[i][1] * anillo[i + 1][0];
    }
    return a;
  }

  function mascara(geometria) {
    var exterior = [[-180, 85], [180, 85], [180, -85], [-180, -85], [-180, 85]];
    var signoExterior = areaFirmada(exterior) < 0 ? -1 : 1;
    var anillos = [];
    var rings = geometria.type === 'Polygon'
      ? geometria.coordinates
      : geometria.coordinates.map(function (poly) { return poly[0]; });
    rings.forEach(function (a) {
      var s = areaFirmada(a) < 0 ? -1 : 1;
      anillos.push(s === signoExterior ? a.slice().reverse() : a.slice());
    });
    if (!anillos.length) return;
    var fe = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [exterior].concat(anillos) }
    };
    L.geoJSON(fe, {
      interactive: false,
      style: function () {
        return { color: 'transparent', weight: 0, fillColor: papel(), fillOpacity: 0.9 };
      }
    }).addTo(mapa);
    mapa.attributionControl.addAttribution('Límites: BCN/geoBoundaries (CC BY 3.0 IGO)');
  }

  function encuadrar(limite) {
    if (!limite || !limite.features || !limite.features.length) return false;
    var bbox = bboxDe(limite);
    if (!bbox) return false;

    mapa.setMinZoom(Math.max(8, mapa.getBoundsZoom(bbox)));
    mapa.fitBounds(bbox, { padding: [24, 24] });
    mapa.setMaxBounds([
      [bbox[0][0] - 0.05, bbox[0][1] - 0.05],
      [bbox[1][0] + 0.05, bbox[1][1] + 0.05]
    ]);

    var poligono = null;
    (limite.features || []).forEach(function (f) {
      if (f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') && !poligono) {
        poligono = f.geometry;
      }
    });
    if (poligono) mascara(poligono);
    return true;
  }

  function iniciar() {
    var fracasoTiles = 0;
    var cambio = false;

    function donar() {
      var cont = document.createElement('div');
      cont.className = 'mapa__canvas';
      root.innerHTML = '';
      root.appendChild(cont);
      root.appendChild(document.createElement('div')).className = 'state';
      root.lastChild.id = 'mapa-loading';
      root.lastChild.innerHTML = '<div class="spinner" aria-hidden="true"></div><p>Dando forma al mapa del Maule…</p>';

      mapa = L.map(cont, { zoomControl: true, attributionControl: true });

      var esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: 'Tiles © Esri — Esri, HERE, Garmin, OpenStreetMap'
      });
      var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 16,
        attribution: '© OpenStreetMap'
      });

      esri.on('tileerror', function () {
        fracasoTiles++;
        if (fracasoTiles < 5 || cambio) return;
        cambio = true;
        mapa.removeLayer(esri);
        osm.addTo(mapa);
      });

      esri.addTo(mapa);

      var lugaresP = fetch(base + 'data/lugares.json').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
      var limitesP = fetch(base + 'data/maule.geojson').then(function (r) {
        if (!r.ok) throw new Error('sin límites');
        return r.json();
      }).catch(function () { return null; });
      var fuente = DM.corpusPath ? urlCompleta(DM.corpusPath) : null;
      var agenda = Promise.resolve([]);
      if (fuente) {
        agenda = fetch(fuente).then(function (r2) {
          if (!r2.ok) throw new Error('sin agenda');
          return r2.json();
        }).then(function (corpus) {
          return (corpus && corpus.items) || [];
        }).catch(function () { return []; });
      }
      return Promise.all([lugaresP, agenda, limitesP]).then(function (resultados) {
        var lugares = resultados[0];
        var items = resultados[1];
        var limite = resultados[2];
        var elEstado = document.getElementById('mapa-loading');
        if (elEstado) elEstado.remove();

        if (!encuadrar(limite) && lugares.meta && lugares.meta.fitBounds) {
          mapa.fitBounds(lugares.meta.fitBounds, { padding: [24, 24] });
        }

        ['ciudades', 'escenarios', 'naturaleza', 'fuentes'].forEach(function (k) {
          agregarCapa(k, lugares[k], COLORES[k]);
        });

        cargarAgenda(items, lugares.sedes, function (agenda) {
          agregarCapa('agenda', agenda, COLORES.agenda);
          pintarTabla();
        });
        pintarTabla();
        root.dataset.state = 'ready';
      }).catch(function (err) {
        var elEstado = document.getElementById('mapa-loading');
        if (elEstado) elEstado.remove();
        fracaso('El mapa no pudo dibujarse en este momento — intentá de nuevo más tarde.');
        console.error('[mapa]', err);
      });
    }

    donar();
  }

  iniciar();
})();