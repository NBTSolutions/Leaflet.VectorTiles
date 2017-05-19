/**
 *
 */
(function main() {
  const map = L.map('map', {
    center: {
      lat: 0,
      lng: 0
    },
    zoom: 1
  });

  L.tileLayer('http://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  const url = 'http://localhost:12345/{z}/{x}/{y}';

  var vtLayer = new L.VectorTiles(url, {
    map,
    getFeatureId: f => f.id,
    style: {}
  }).addTo(map);
})();
