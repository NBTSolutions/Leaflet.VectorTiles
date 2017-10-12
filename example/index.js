/**
 *
 */

fetch('/geojson/country')
  .then(res => res.json())
  .then(main);


function main(geojson) {
  const countries = geojson.features.map(f => f.properties.name.toLowerCase());

  const map = L.map('map', {
    center: {
      lat: 0,
      lng: 0
    },
    zoom: 2,
    preferCanvas: true,
  });

  //L.tileLayer('http://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  const url = '/{z}/{x}/{y}?pbf=true';

  const vtLayer = window.vtLayer = new L.VectorTiles(url, {
    getFeatureId: f => f.properties.name.toLowerCase(),
    layerOrder: ['points', 'countries'], // order is bottom to top
    style: {
      type: {
        point: {
          color: 'green',
        },
        country: {
          color: 'blue',
          fillOpacity: 0.9
        },
      },
    },
    //debug: true,
  }).addTo(map);

  var hoverHighlight = false;

  function highlightOnHover(e) {
    // reset all feature styles
    for (let i = 0; i < countries.length; i++) {
      vtLayer.setFeatureStyle(countries[i], Object.assign(L.Path.prototype.options, { fill: true }));
    }
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
    // reset all feature styles
    for (let i = 0; i < countries.length; i++) {
      vtLayer.setFeatureStyle(countries[i], Object.assign(L.Path.prototype.options, { fill: true }));
    }
    const q = e.target.value.toLowerCase();
    if (!q) {
      return;
    }
    countries
      .filter(c => c.indexOf(q) > -1)
      .forEach(id => vtLayer.setFeatureStyle(id, { color: 'black' }));
  };

  document.getElementById('cache-size-input').onchange = e => {
    const cacheSize = +e.target.value;
    document.getElementById('cache-size').innerHTML = cacheSize;
    vtLayer.setTileCacheSize(cacheSize);
  };
}
