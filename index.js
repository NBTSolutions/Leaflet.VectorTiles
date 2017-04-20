/**
 * GeoJSON tiles
 */

/**
 * Tiles made of canvases layers
 *
 * this is a hack
 */
L.Canvas.Tile = L.Canvas.extend({
  initialize: function(tileSize, map) {
    // TODO: L.setOptions
    L.Canvas.prototype.initialize.call(this);

    this._features = [];
  },

  onAdd: function(map) {
    L.Canvas.prototype.onAdd.call(this, map);

    // render features
    for (var i = 0; i < this._features.length; i++) {
      this._renderFeature(this._features[i]);
    }
  },

  onRemove: function() {
    console.log(this);
  },

  addFeature: function(feature) {
    this._features.push(feature);
    this._renderFeature(feature);
  },

  _renderFeature: function(feature) {
    // if already initialized
    if (this._container) {
      if (feature) {
        switch (feature.geometry.type) {
          case 'Point':
            var coords = feature.geometry.coordinates;
            var circle = L.circle([coords[1], coords[0]], {
              renderer: this,
              radius: 200
            });
            circle.addTo(this._map);
            break;

          case 'LineString':
            var coords = feature.geometry.coordinates.map(c => [c[1], c[0]]);
            var polyline = L.polyline(coords, {
              renderer: this
            });
            polyline.addTo(this._map);
            break;
        }
      }
    }

  }
});

/**
 * The GridLayer made of canvas tiles
 */
L.VectorTiles = L.GridLayer.extend({
  initialize: function(url, map) {
    this._url = url;

    // TODO: figure out how to do without this
    this._map = map;
  },

  createTile: function(coords, done) {
    var tileSize = this.getTileSize();
    var tile = new L.Canvas.Tile(tileSize, this._map);

    // this is necessarily to initialize the canvas DOM element
    tile.addTo(this._map);

    // Debugger: make tile boundaries visible
    tile._container.style.border = '1px solid red';

    // fetch vector tile data for this tile
    var url = L.Util.template(this._url, coords);
    fetch(url)
      .then(res => res.json())
      .then(layers => {
        for (var i = 0; i < layers.length; i++) {
          for (var j = 0; j < layers[i].features.features.length; j++) {
            var geojFeat = layers[i].features.features[j];
            tile.addFeature(geojFeat);
          }
        }
        done(null, tile._container);
      });

    return tile._container;
  }
});

(function main() {
  var map = L.map('map').setView({lat: 43.6260475, lng: -70.295306}, 14);
  L.tileLayer('http://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  var url = 'http://ec2-54-209-137-178.compute-1.amazonaws.com/vector-tiles/tiles/{z}/{x}/{y}.pbf';
  var vtLayer = new L.VectorTiles(url, map);
  vtLayer.addTo(map);
})();

