/**
 * Demo application for Leaftlet.VectorTiles
 */

function main() {
  var map = L.map('map', {
    center: {
      lat: 43.6260475,
      lng: -70.295306
    },
    zoom: 14,
    renderer: new L.FontCanvas()
  });

  L.tileLayer('http://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  // URL for fetching vector tiles
  var url = 'http://ec2-54-209-137-178.compute-1.amazonaws.com/vector-tiles/tiles/{z}/{x}/{y}.pbf';

  var vtLayer = new L.VectorTiles(url, {
    getFeatureId: function(feature) {
      return `${feature.properties.view}:${feature.properties.id}`;
    },
    map: map,
    debug: true,
    tileSize: 256,
    style: {
      view: {
        view_businesses: {
          color: 'green',
          font: '10px icomoon',
          content: '\ue91a' // octagon
        },
        view_point_premise: {
          color: 'orange',
          font: '10px icomoon',
          content: '\ue915' // house
        },
        view_poles: {
          color: 'pink',
          font: '10px icomoon',
          content: '\ue909' // diamond
        }
      }
    }
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
    for (var i = 0; i < results.length; i++) {
      var id = results[i];
      vtLayer.setFeatureStyle(id, { color: 'red' });
    }
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
}

// Make sure font is loaded before rendering tiles
// https://github.com/typekit/webfontloader#custom
WebFont.load({
  custom: {
    families: ['icomoon'],
    urls: ['vetro-font/icomoon.css']
  },
  active: main
});
