/**
 * GeoJSON tiles
 */

/**
 * Convert a GeoJSON feature into a Leaflet feature
 */
function geojFeatureToLayer(feature) {
  switch (feature.geometry.type) {
    case 'Point':
      var coords = feature.geometry.coordinates;
      var circle = L.circle([coords[1], coords[0]], {
        radius: 40
      });
      circle.on('click', function(e) {
        console.log(e);
      });
      return circle;

    case 'LineString':
      var coords = feature.geometry.coordinates.map(c => [c[1], c[0]]);
      var polyline = L.polyline(coords, {});
      return polyline;
  }
}

/**
 * The GridLayer made of canvas tiles
 */
L.VectorTiles = L.GridLayer.extend({
  initialize(url, options) {
    this._url = url;


    // TODO: figure out how to do without this
    this._map = options.map;

    this._featureGroup = L.featureGroup()
      .addTo(this._map);

    this.getFeatureId = options.getFeatureId;

    // pointers to individual layers
    this._features = {};

    // listen for tileunload event and clean up old features
    this.on('tileunload', function(e) {
      this.destroyTile(e.coords);
    });

    // used for tracking properties that have been modified
    // looks like this:
    // this._propertyStates = {
    //   propertyName: {
    //     value1: {
    //       style: { ... }
    //     },
    //     value2: {
    //       onMap: false
    //     }
    //   }
    // }
    //
    // onMap status (like calling `hideByProperty`) supercede
    // style modifications
    this._propertyStates = {};

    this._index = {};
  },

  _insertIntoIndex(coords, feature) {
    var tileKey = this._tileCoordsToKey(coords);

    // create the index for this tile if it hasn't been created yet
    if (!(tileKey in this._index)) {
      this._index[tileKey] = rbush();
    }

    var geom = feature.geometry;
    var c = feature.geometry.coordinates;

    var minX, minY, maxX, maxY;

    if (geom.type === 'Point') {
      minX = maxX = c[0];
      minY = maxY = c[1];
    } else {
      var bbox = turf.bbox(geom);
      minX = bbox[0];
      minY = bbox[1];
      maxX = bbox[2];
      maxY = bbox[3];
    }

    this._index[tileKey].insert({
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
      id: this.getFeatureId(feature),
    });
  },

  search(min, max) {
    var results = [];

    for (var tileKey in this._index) {
      var tree = this._index[tileKey];
      var minX = min.lng;
      var minY = min.lat;
      var maxX = max.lng;
      var maxY = max.lat;
      results = results.concat(tree.search({ minX, minY, maxX, maxY }).map(r => r.id));
    }

    return results;
  },

  destroyTile(coords) {
    var tileKey = this._tileCoordsToKey(coords);

    // remove all features from the map
    var features = this._features[tileKey];
    for (var i = 0; i < features.length; i++) {
      var feature = features[i];
      this._featureGroup.removeLayer(feature.layer);
    }

    // delete this tile's spatial index
    delete this._index[tileKey];

    // finally delete the feature and is associated Leaflet layer
    delete this._features[tileKey];
  },

  /**
   * This method:
   *   - fetches the data for the tile
   *   - adds all of its features to the map
   *   - adds its features to the internal data structure
   *   - inserts its features into the a spatial tree
   */
  createTile: function(coords, done) {
    var tile = L.DomUtil.create('div', 'leaflet-tile');
    var tileKey = this._tileCoordsToKey(coords);
    this._features[tileKey] = [];

    // fetch vector tile data for this tile
    var url = L.Util.template(this._url, coords);
    fetch(url)
      .then(res => res.json())
      .then(layers => {
        for (var i = 0; i < layers.length; i++) {
          for (var j = 0; j < layers[i].features.features.length; j++) {
            var feature = layers[i].features.features[j];
            var layer = geojFeatureToLayer(feature);
            this._features[tileKey].push({
              feature: feature,
              layer: layer
            });

            // applying stylistic and visibility modification to new features
            var properties = feature.properties;
            var onMap = true;
            for (var property in this._propertyStates) {
              if (property in properties) {
                for (var value in this._propertyStates[property]) {
                  if (properties[property] === value) {
                    // check if this feature should be added to the map
                    if ('onMap' in this._propertyStates[property][value]
                      && !this._propertyStates[property][value].onMap) {
                      onMap = false;
                    }

                    // check if this feature should be restyled
                    // perhaps similar feature are currently highlighted
                    if ('style' in this._propertyStates[property][value]) {
                      var style = this._propertyStates[property][value].style;
                      layer.setStyle(style);
                    }
                  }
                }
              }
            }

            if (onMap)
              this._featureGroup.addLayer(layer);

            this._insertIntoIndex(coords, feature);
          }
        }
        done(null, tile);
      });

    return tile;
  },

  /**
   * Removes features from the map by property
   * Wrapper function of _toggleByProperty
   *   equivalent to this._toggleByProperty(property, value, false);
   */
  hideByProperty(property, value) {
    this._toggleByProperty(property, value, false);
  },

  /**
   * Add features to the map by property
   * Wrapper function of _toggleByProperty
   *   equivalent to this._toggleByProperty(property, value, true);
   */
  showByProperty(property, value) {
    this._toggleByProperty(property, value, true);
  },

  /**
   * Iterates over all features and add them to or removes them from
   * the map based on a property value
   */
  _toggleByProperty(property, value, on) {
    if (!(property in this._propertyStates)) {
      this._propertyStates[property] = {};
    }

    if (!(value in this._propertyStates[property])) {
      this._propertyStates[property][value] = {};
    }

    this._propertyStates[property][value].onMap = on;

    for (var tileKey in this._features) {
      var features = this._features[tileKey];
      for (var i = 0; i < features.length; i++) {
        var feature = features[i];
        if (property in feature.feature.properties
            && feature.feature.properties[property] === value) {
          if (on)
            this._featureGroup.addLayer(feature.layer);
          else
            this._featureGroup.removeLayer(feature.layer);
        }
      }
    }
  },

  restyleByProperty(property, value, style) {
    for (var tileKey in this._features) {
      var features = this._features[tileKey];
      for (var i = 0; i < features.length; i++) {
        var feature = features[i];
        if (property in features.features.properties
            && feature.feature.properties[property] === value) {
          feature.layer.setStyle(style);
        }
      }
    }
  },

  /**
   *
   */
  getFeatureGroup() {
    return this._featureGroup;
  }
});

/**
 * Feature demos
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

  /*
  var drawControl = new L.Control.Draw({
    edit: {
      featureGroup: vtLayer.getFeatureGroup()
    }
  });
  */

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

