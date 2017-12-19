/**
 *
 */

fetch('/geojson/country')
  .then(res => res.json())
  .then(main);


function main(geojson) {
  var app = new Vue({
    el: '#app',
    data: {
      zoom: 0,
      tiles: [],
      cacheSize: 50,
    },
    methods: {
      setTileCacheSize(e) {
        vtLayer.setTileCacheSize(+e.target.value);
      }
    }
  });

  const countries = geojson.features.map(f => f.properties.name.toLowerCase());

  const map = L.map('map', {
    center: {
      lat: 0,
      lon: 0,
    },
    zoom: 3,
    preferCanvas: true,
  });

  L.tileLayer('http://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  const url = 'http://localhost:12345/{z}/{x}/{y}?pbf=true';

  const vtLayer = window.vtLayer = new L.VectorTiles(url, {
    getFeatureId: f => f.properties.name.toLowerCase(),
    style: {},
    debug: true,
    tileCacheSize: 5,
  }).addTo(map);

  var hoverHighlight = true;
  map[hoverHighlight ? 'on' : 'off']('mousemove', highlightOnHover);
  document.getElementById('hover-radio').checked = hoverHighlight;

  function highlightOnHover(e) {
    // reset all feature styles
    countries.forEach(c => vtLayer.setFeatureStyle(c, Object.assign(L.Path.prototype.options, { fill: true })));
    const buf = .00001;
    const { lat, lng } = e.latlng;
    vtLayer.search(
      L.latLng({ lat: lat - buf, lng: lng - buf }),
      L.latLng({ lat: lat + buf, lng: lng + buf })
    ).forEach(id => vtLayer.setFeatureStyle(id, { color: 'green' }));
  }

  document.getElementById('hover-radio').onclick = e => {
    hoverHighlight = !hoverHighlight;
    e.target.checked = hoverHighlight;
    map[hoverHighlight ? 'on' : 'off']('mousemove', highlightOnHover);
  };

  document.getElementById('search').onkeyup = e => {
    for (let i = 0; i < countries.length; i++) {
      vtLayer.setFeatureStyle(countries[i], Object.assign(L.Path.prototype.options, { fill: true }));
    }
    const q = e.target.value.toLowerCase();
    if (!q) return;
    countries
      .filter(c => c.indexOf(q) > -1)
      .forEach(id => vtLayer.setFeatureStyle(id, { color: 'black' }));
  };

  app.zoom = map.getZoom();
  map.on('zoomend', () => {
    app.zoom = map.getZoom();
  })

  vtLayer.on('vt_tileload', () => {
    app.tiles = Object.entries(vtLayer._vectorTiles).map(t => {
      const [tileKey, tile] = t;
      return {
        coords: tile.coords,
        featureCount: Object.values(tile._features).reduce((p, c) => p + Object.keys(c).length, 0),
        loaded: tile.loaded,
        timestamp: (new Date(tile.timestamp || 0)).toISOString(),
      };
    });
  });
}

