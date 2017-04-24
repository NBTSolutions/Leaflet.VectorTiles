/**
 * Demo application for Leaftlet.VectorTiles
 */

(function main() {
  var map = L.map('map', {
    preferCanvas: true,
    center: {
      lat: 43.6260475,
      lng: -70.295306
    },
    zoom: 14
  });

  L.tileLayer('http://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  // URL for fetching vector tiles
  var url = 'http://ec2-54-209-137-178.compute-1.amazonaws.com/vector-tiles/tiles/{z}/{x}/{y}.pbf';

  var vtLayer = new L.VectorTiles(url, {
    getFeatureId: function(feature) {
      return `${feature.properties.view}:${feature.properties.id}`;
    },
    map: map
  }).addTo(map);

  var drawControl = new L.Control.Draw({
    edit: {
      featureGroup: vtLayer.getFeatureGroup()
    }
  });
  map.addControl(drawControl);

  var searchResultsDiv = document.getElementById('search-results');

  map.on('mousemove', e => {
    var buf = .0005;
    var lat = e.latlng.lat;
    var lng = e.latlng.lng;
    var results = vtLayer.search(
      L.latLng({ lat: lat - buf, lng: lng - buf }),
      L.latLng({ lat: lat + buf, lng: lng + buf })
    );
    searchResultsDiv.innerHTML = results.map(r => `<div>${r}</div>`).join('');
  });

  // add layer button
  fetch(`http://ec2-54-209-137-178.compute-1.amazonaws.com/vector-tiles/layers`)
    .then(res => res.json())
    .then(layers => {
      var buttonsContainer = document.getElementById('panel');
      for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        button = document.createElement('button');
        button.innerHTML = layer;
        button.id = layer
        button.state = true;
        button.style.backgroundColor = 'green';
        button.style.color = 'white';
        button.addEventListener('click', function(e) {
          var button = e.target;
          button.state = !button.state;
          button.style.backgroundColor = button.state ? 'green' : 'red';
          if (button.state)
            vtLayer.showByProperty('view', e.target.id);
          else
            vtLayer.hideByProperty('view', e.target.id);
        });
        buttonsContainer.appendChild(button);
      }
    });
})();

