(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var _tile = require('./tile');

var _tile2 = _interopRequireDefault(_tile);

var _feature = require('./feature');

var _feature2 = _interopRequireDefault(_feature);

var _vectorTile = require('@mapbox/vector-tile');

var _pbf = require('pbf');

var _pbf2 = _interopRequireDefault(_pbf);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Manages interactive tiles of data
 *
 * @class VectorTiles
 * @extends GridLayer
 *
 * @example
 * var vtLayer = new L.VectorTiles('http://mytiles.com/{z}/{x}/{y}.pbf', {
 *   debug: true,
 *   style: {
 *     property: {
 *       value: {
 *         color: 'red'
 *       }
 *     }
 *   }
 * }).addTo(map);
 */

L.VectorTiles = L.GridLayer.extend({

  style: {},

  /**
   * Constructor
   *
   * @constructs
   * @param {string} url The template url for fectching vector tiles
   * @param {Object} options
   * @param {Function} [options.getFeatureId]
   * @param {boolean} [options.debug]
   * @param {Object} [options.style]
   */
  initialize: function initialize(url, options) {
    var _this = this;

    L.Util.setOptions(options);
    L.GridLayer.prototype.initialize.call(this, options);

    this._url = url;

    // the FeatureGroup that holds per tile FeatureGroups
    this._featureGroup = L.featureGroup();

    // show tile boundaries
    this._debug = options.debug;

    this._vectorTiles = {};

    // property based style modifications
    // for highlighting and junk
    // this._propertyStyles = {
    //   propertyName: {
    //     value1: { L.Path style options }
    //   }
    // }
    this._propertyStyles = {};

    // property based toggling
    this._propertyOnMap = {};

    // track individual feature style modifications
    this._featureStyles = {};

    // mark individual features as on or off the map
    this._featureOnMap = {};

    // mark a tile for destruction in case it is unloaded before it loads
    this._toDestroy = {};

    // mark a tile as loaded
    // this is needed because if a tile is unloaded before its finished loading
    // we need to wait for it to finish loading before we can clean up
    this.on('vt_tileload', function (e) {
      var tileKey = _this._tileCoordsToKey(e.coords);
      if (_this._toDestroy[tileKey]) {
        _this.destroyTile(e.coords);
      }
    });

    // listen for tileunload event and clean up old features
    this.on('tileunload', function (e) {
      // Leaflet will not call createTile for tiles with negative
      // coordinates but it will fire unload on them so
      // ignore those events
      if (e.coords.x < 0 || e.coords.y < 0 || e.coords.z < 0) {
        return;
      }

      var tileKey = _this._tileCoordsToKey(e.coords);

      // if the tile hasn't loaded yet, mark it for deletion for when it
      // is finished loading
      if (!(tileKey in _this._vectorTiles) || !_this._vectorTiles[tileKey].loaded) {
        // invalidate the tile so that it is deleted when its done loading
        _this._toDestroy[tileKey] = true;
      } else {
        // destroy it immediately
        _this.destroyTile(e.coords);
      }
    });
  },
  onAdd: function onAdd(map) {
    L.GridLayer.prototype.onAdd.call(this, map);
    this._map = map;
    this._featureGroup.addTo(this._map);
  },


  /**
   * Returns an array of feature ids near a given point
   *
   * @param {L.LatLng} min
   * @param {L.LatLng} max
   * @returns {Array<string>}
   */
  search: function search(min, max) {
    if (!this._map) {
      throw new Error('Vector tile layer not added to the map.');
    }

    var results = new Set();
    var minX = min.lng;
    var minY = min.lat;
    var maxX = max.lng;
    var maxY = max.lat;

    for (var tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = this._vectorTiles[tileKey].search(minX, minY, maxX, maxY)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var result = _step.value;

          results.add(result);
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    }

    return Array.from(results);
  },


  /**
   * This method:
   *   - fetches the data for the tile
   *   - adds all of its features to the map
   *   - adds its features to the internal data structure
   *   - inserts its features into the a spatial tree
   *
   * @param {Object} coords
   * @param {Function} done
   * @fires vt_tileload
   * @returns DOM element
   * @private
   */
  createTile: function createTile(coords, done) {
    var tile = L.DomUtil.create('div', 'leaflet-tile');
    if (this.options.debug) {
      // show tile boundaries
      tile.style.outline = '1px solid red';
    }
    this._createTile(coords);
    done(null, tile);
    return tile;
  },
  _createTile: function _createTile(coords) {
    var _this2 = this;

    var tileKey = this._tileCoordsToKey(coords);

    // tile has already been unloaded
    if (this._toDestroy[tileKey]) {
      return;
    }

    var tile = new _tile2.default(coords.x, coords.y, coords.z);
    this._vectorTiles[tileKey] = tile;

    // fetch vector tile data for this tile
    var url = L.Util.template(this._url, coords);
    fetch(url).then(function (res) {
      return res.blob();
    }).then(function (blob) {
      var reader = new FileReader();
      return new Promise(function (resolve, reject) {
        reader.onloadend = function () {
          resolve(new _vectorTile.VectorTile(new _pbf2.default(reader.result)));
        };
        reader.readAsArrayBuffer(blob);
      });
    }).then(function (vtTile) {
      for (var vtLayerName in vtTile.layers) {
        // break out if this tile has already be unloaded
        if (_this2._toDestroy[tileKey]) {
          break;
        }
        var vtLayer = vtTile.layers[vtLayerName];
        for (var j = 0; j < vtLayer.length; j++) {
          // break out if this tile has already be unloaded
          if (_this2._toDestroy[tileKey]) {
            break;
          }
          var vtFeature = vtLayer.feature(j);

          var geojson = vtFeature.toGeoJSON(coords.x, coords.y, coords.z);
          var id = _this2.options.getFeatureId(geojson);
          var layer = _this2._geojsonToLayer(geojson);
          if (!layer) {
            // unsupported geometry type
            continue;
          }

          var feature = new _feature2.default(id, geojson, layer);

          tile.addFeature(feature);

          var style = {};
          var onMap = true;
          var prop = void 0;

          // property based styles
          for (prop in geojson.properties) {
            // apply style from options
            if (prop in _this2.options.style && geojson.properties[prop] in _this2.options.style[prop]) {
              Object.assign(style, _this2.options.style[prop][geojson.properties[prop]]);
            }

            // apply style modifications
            if (prop in _this2._propertyStyles && geojson.properties[prop] in _this2._propertyStyles[prop]) {
              Object.assign(style, _this2._propertyStyles[prop][geojson.properties[prop]]);
            }

            // put on map based on property
            if (prop in _this2._propertyOnMap && geojson.properties[prop] in _this2._propertyOnMap[prop]) {
              onMap = _this2._propertyOnMap[prop][geojson.properties[prop]];
            }
          }

          // feature based styles
          if (id in _this2._featureStyles) {
            Object.assign(style, _this2._featureStyles[id]);
          }

          feature.setStyle(style);

          // feature based on map
          if (id in _this2._featureOnMap) {
            onMap = _this2._featureOnMap[id];
          }

          feature.putOnMap(onMap);
        }
      }

      if (!_this2._toDestroy[tileKey]) {
        // called when all features have been added to the tile
        tile.init();

        // add the featureGroup of this tile to the map
        tile.featureGroup.addTo(_this2._featureGroup);
      }

      // mark tile as loaded
      tile.markAsLoaded();

      // the tile has ~actually~ loaded
      // the `tileload` event doesn't fire when `tileunload` fires first
      // but in our case we still need to be finished loading to clean up
      _this2.fire('vt_tileload', { coords: coords });
    });
  },


  /**
   * Remove the features of a tile from the map and delete that tile's
   * data structure
   *
   * @param {Object} coords
   * @private
   */
  destroyTile: function destroyTile(coords) {
    var tileKey = this._tileCoordsToKey(coords);

    // remove this tile's FeatureGroup from the map
    this._featureGroup.removeLayer(this._vectorTiles[tileKey].featureGroup);

    // delete the tile's data
    delete this._vectorTiles[tileKey];

    // remove delete marker
    if (this._toDestroy[tileKey]) {
      delete this._toDestroy[tileKey];
    }
  },


  /**
   * Removes features from the map by property.
   * Wrapper function of `_toggleByProperty`.
   * Equivalent to `this._toggleByProperty(property, value, false)`.
   *
   * @param {string} property
   * @param {string} value
   */
  hideByProperty: function hideByProperty(property, value) {
    this._toggleByProperty(property, value, false);
    return this;
  },


  /**
   * Add features to the map by property.
   * Wrapper function of `_toggleByProperty`.
   * Equivalent to `this._toggleByProperty(property, value, true)`.
   *
   * @param {string} property
   * @param {string} value
   */
  showByProperty: function showByProperty(property, value) {
    this._toggleByProperty(property, value, true);
    return this;
  },


  /**
   * Iterates over all features and add them to or removes them from
   * the map based on a property value
   *
   * @param {string} property
   * @param {string} value
   * @param {boolean} on
   * @private
   */
  _toggleByProperty: function _toggleByProperty(property, value, on) {
    if (!(property in this._propertyOnMap)) {
      this._propertyOnMap[property] = {};
    }

    // did the state change?
    var toggled = this._propertyOnMap[property][value] !== on;

    this._propertyOnMap[property][value] = on;

    var tile = void 0;
    for (var tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      tile = this._vectorTiles[tileKey];
      tile.toggleByProperty(property, value, on, toggled);
    }
  },


  /**
   * Change the style of features based on property values
   *
   * @param {string} property
   * @param {string} value
   * @param {Object} style
   * @returns {L.VectorTiles} this
   */
  restyleByProperty: function restyleByProperty(property, value, style) {
    if (!(property in this._propertyStyles)) {
      this._propertyStyles[property] = {};
    }

    if (!(value in this._propertyStyles[property])) {
      this._propertyStyles[property][value] = {};
    }

    Object.assign(this._propertyStyles[property][value], style);

    var tile = void 0;
    for (var tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      tile = this._vectorTiles[tileKey];
      tile.restyleByProperty(property, value, style);
    }

    return this;
  },


  /**
   * Change the style of a feature by its id
   *
   * @param {string} id
   * @param {Object} style
   * @returns {L.VectorTiles} this
   */
  setFeatureStyle: function setFeatureStyle(id, style) {
    this._featureStyles[id] = style;
    for (var tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      var tile = this._vectorTiles[tileKey];
      if (tile.contains(id)) {
        var feature = tile.getFeature(id);
        feature.setStyle(style);
      }
    }
    return this;
  },


  /**
   * Returns a reference to the layer identified by the id
   *
   * @param {string} id
   * @returns {L.Path}
   */
  getLayer: function getLayer(id) {
    var tile = void 0;
    for (var tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      tile = this._vectorTiles[tileKey];
      if (tile.contains(id)) {
        return tile.getFeature(id).layer;
      }
    }
    return null;
  },


  /**
   * Returns a reference to the GeoJSON feature identified by the id
   *
   * @param {string} id
   * @return {Object}
   */
  getGeoJSON: function getGeoJSON(id) {
    var tile = void 0;
    for (var tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      tile = this._vectorTiles[tileKey];
      if (tile.contains(id)) {
        return tile.getFeature(id).geojson;
      }
    }
    return null;
  },


  /**
   * Deletes a feature by its ID
   * Note that this feature will still be loaded in subsequent tiles
   *
   * @param {string} id
   * @returns {L.VectorTiles} this
   */
  removeFeature: function removeFeature(id) {
    var tile = void 0;
    for (var tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      tile = this._vectorTiles[tileKey];
      tile.removeFeature(id);
    }
    return this;
  },


  /**
   * Convert a GeoJSON feature into a Leaflet feature
   * Point -> L.Circle
   * LineString -> L.Polyline
   * Polygon/Multipolygon -> L.Polygon
   * Here we must make lon,lat (GeoJSON) into lat,lon (Leaflet)
   *
   * @param {Object} feature
   * @param {string} id
   * @returns {L.Path}
   * @private
   */
  _geojsonToLayer: function _geojsonToLayer(feature) {
    var layer = void 0;
    var coords = void 0;
    var ring = void 0;
    var c = feature.geometry.coordinates;
    switch (feature.geometry.type) {
      case 'Point':
        layer = L.circle([c[1], c[0]], {
          radius: 40
        });
        break;

      case 'LineString':
        coords = [];
        for (var i = 0; i < c.length; i++) {
          coords.push([c[i][1], c[i][0]]);
        }
        layer = L.polyline(coords, {});
        break;

      case 'Polygon':
        coords = [];
        for (var _i = 0; _i < c.length; _i++) {
          coords.push([]);
          ring = c[_i];
          for (var j = 0; j < ring.length; j++) {
            coords[_i].push([ring[j][1], ring[j][0]]);
          }
        }
        layer = L.polygon(coords, {});
        break;

      case 'MultiPolygon':
        coords = [];
        for (var _i2 = 0; _i2 < c.length; _i2++) {
          coords.push([]);
          var polygon = c[_i2];
          for (var _j = 0; _j < polygon.length; _j++) {
            coords[_i2].push([]);
            ring = polygon[_j];
            for (var k = 0; k < ring.length; k++) {
              coords[_i2][_j].push([ring[k][1], ring[k][0]]);
            }
          }
        }
        layer = L.polygon(coords, {});
        break;

      default:
        console.log('Unsupported feature type: ' + feature.geometry.type);
        return null;
    }

    return layer;
  }
});

},{"./feature":2,"./tile":14,"@mapbox/vector-tile":4,"pbf":11}],2:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * A feature object
 *
 * @class Feature
 * @private
 */
var Feature = function () {
  function Feature(id, geojson, layer) {
    _classCallCheck(this, Feature);

    this.id = id;
    this.geojson = geojson;
    this.layer = layer;
    this.onMap = true;
    this.style = {};

    // the following becomes a reference to this feature's
    // index bbox when this feature is indexed by its tile
    this.indexEntry = null;
  }

  /**
   * @param {Object} style
   * returns {Feature} this
   */


  _createClass(Feature, [{
    key: "setStyle",
    value: function setStyle(style) {
      Object.assign(this.style, style);
      this.layer.setStyle(this.style);
      return this;
    }

    /**
     * @param {boolean} on
     * @returns {Feature} this
     */

  }, {
    key: "putOnMap",
    value: function putOnMap(on) {
      this.onMap = on;
      return this;
    }
  }]);

  return Feature;
}();

exports.default = Feature;

},{}],3:[function(require,module,exports){
'use strict';

module.exports = Point;

/**
 * A standalone point geometry with useful accessor, comparison, and
 * modification methods.
 *
 * @class Point
 * @param {Number} x the x-coordinate. this could be longitude or screen
 * pixels, or any other sort of unit.
 * @param {Number} y the y-coordinate. this could be latitude or screen
 * pixels, or any other sort of unit.
 * @example
 * var point = new Point(-77, 38);
 */
function Point(x, y) {
    this.x = x;
    this.y = y;
}

Point.prototype = {

    /**
     * Clone this point, returning a new point that can be modified
     * without affecting the old one.
     * @return {Point} the clone
     */
    clone: function() { return new Point(this.x, this.y); },

    /**
     * Add this point's x & y coordinates to another point,
     * yielding a new point.
     * @param {Point} p the other point
     * @return {Point} output point
     */
    add:     function(p) { return this.clone()._add(p); },

    /**
     * Subtract this point's x & y coordinates to from point,
     * yielding a new point.
     * @param {Point} p the other point
     * @return {Point} output point
     */
    sub:     function(p) { return this.clone()._sub(p); },

    /**
     * Multiply this point's x & y coordinates by point,
     * yielding a new point.
     * @param {Point} p the other point
     * @return {Point} output point
     */
    multByPoint:    function(p) { return this.clone()._multByPoint(p); },

    /**
     * Divide this point's x & y coordinates by point,
     * yielding a new point.
     * @param {Point} p the other point
     * @return {Point} output point
     */
    divByPoint:     function(p) { return this.clone()._divByPoint(p); },

    /**
     * Multiply this point's x & y coordinates by a factor,
     * yielding a new point.
     * @param {Point} k factor
     * @return {Point} output point
     */
    mult:    function(k) { return this.clone()._mult(k); },

    /**
     * Divide this point's x & y coordinates by a factor,
     * yielding a new point.
     * @param {Point} k factor
     * @return {Point} output point
     */
    div:     function(k) { return this.clone()._div(k); },

    /**
     * Rotate this point around the 0, 0 origin by an angle a,
     * given in radians
     * @param {Number} a angle to rotate around, in radians
     * @return {Point} output point
     */
    rotate:  function(a) { return this.clone()._rotate(a); },

    /**
     * Rotate this point around p point by an angle a,
     * given in radians
     * @param {Number} a angle to rotate around, in radians
     * @param {Point} p Point to rotate around
     * @return {Point} output point
     */
    rotateAround:  function(a,p) { return this.clone()._rotateAround(a,p); },

    /**
     * Multiply this point by a 4x1 transformation matrix
     * @param {Array<Number>} m transformation matrix
     * @return {Point} output point
     */
    matMult: function(m) { return this.clone()._matMult(m); },

    /**
     * Calculate this point but as a unit vector from 0, 0, meaning
     * that the distance from the resulting point to the 0, 0
     * coordinate will be equal to 1 and the angle from the resulting
     * point to the 0, 0 coordinate will be the same as before.
     * @return {Point} unit vector point
     */
    unit:    function() { return this.clone()._unit(); },

    /**
     * Compute a perpendicular point, where the new y coordinate
     * is the old x coordinate and the new x coordinate is the old y
     * coordinate multiplied by -1
     * @return {Point} perpendicular point
     */
    perp:    function() { return this.clone()._perp(); },

    /**
     * Return a version of this point with the x & y coordinates
     * rounded to integers.
     * @return {Point} rounded point
     */
    round:   function() { return this.clone()._round(); },

    /**
     * Return the magitude of this point: this is the Euclidean
     * distance from the 0, 0 coordinate to this point's x and y
     * coordinates.
     * @return {Number} magnitude
     */
    mag: function() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    },

    /**
     * Judge whether this point is equal to another point, returning
     * true or false.
     * @param {Point} other the other point
     * @return {boolean} whether the points are equal
     */
    equals: function(other) {
        return this.x === other.x &&
               this.y === other.y;
    },

    /**
     * Calculate the distance from this point to another point
     * @param {Point} p the other point
     * @return {Number} distance
     */
    dist: function(p) {
        return Math.sqrt(this.distSqr(p));
    },

    /**
     * Calculate the distance from this point to another point,
     * without the square root step. Useful if you're comparing
     * relative distances.
     * @param {Point} p the other point
     * @return {Number} distance
     */
    distSqr: function(p) {
        var dx = p.x - this.x,
            dy = p.y - this.y;
        return dx * dx + dy * dy;
    },

    /**
     * Get the angle from the 0, 0 coordinate to this point, in radians
     * coordinates.
     * @return {Number} angle
     */
    angle: function() {
        return Math.atan2(this.y, this.x);
    },

    /**
     * Get the angle from this point to another point, in radians
     * @param {Point} b the other point
     * @return {Number} angle
     */
    angleTo: function(b) {
        return Math.atan2(this.y - b.y, this.x - b.x);
    },

    /**
     * Get the angle between this point and another point, in radians
     * @param {Point} b the other point
     * @return {Number} angle
     */
    angleWith: function(b) {
        return this.angleWithSep(b.x, b.y);
    },

    /*
     * Find the angle of the two vectors, solving the formula for
     * the cross product a x b = |a||b|sin(θ) for θ.
     * @param {Number} x the x-coordinate
     * @param {Number} y the y-coordinate
     * @return {Number} the angle in radians
     */
    angleWithSep: function(x, y) {
        return Math.atan2(
            this.x * y - this.y * x,
            this.x * x + this.y * y);
    },

    _matMult: function(m) {
        var x = m[0] * this.x + m[1] * this.y,
            y = m[2] * this.x + m[3] * this.y;
        this.x = x;
        this.y = y;
        return this;
    },

    _add: function(p) {
        this.x += p.x;
        this.y += p.y;
        return this;
    },

    _sub: function(p) {
        this.x -= p.x;
        this.y -= p.y;
        return this;
    },

    _mult: function(k) {
        this.x *= k;
        this.y *= k;
        return this;
    },

    _div: function(k) {
        this.x /= k;
        this.y /= k;
        return this;
    },

    _multByPoint: function(p) {
        this.x *= p.x;
        this.y *= p.y;
        return this;
    },

    _divByPoint: function(p) {
        this.x /= p.x;
        this.y /= p.y;
        return this;
    },

    _unit: function() {
        this._div(this.mag());
        return this;
    },

    _perp: function() {
        var y = this.y;
        this.y = this.x;
        this.x = -y;
        return this;
    },

    _rotate: function(angle) {
        var cos = Math.cos(angle),
            sin = Math.sin(angle),
            x = cos * this.x - sin * this.y,
            y = sin * this.x + cos * this.y;
        this.x = x;
        this.y = y;
        return this;
    },

    _rotateAround: function(angle, p) {
        var cos = Math.cos(angle),
            sin = Math.sin(angle),
            x = p.x + cos * (this.x - p.x) - sin * (this.y - p.y),
            y = p.y + sin * (this.x - p.x) + cos * (this.y - p.y);
        this.x = x;
        this.y = y;
        return this;
    },

    _round: function() {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        return this;
    }
};

/**
 * Construct a point from an array if necessary, otherwise if the input
 * is already a Point, or an unknown type, return it unchanged
 * @param {Array<Number>|Point|*} a any kind of input value
 * @return {Point} constructed point, or passed-through value.
 * @example
 * // this
 * var point = Point.convert([0, 1]);
 * // is equivalent to
 * var point = new Point(0, 1);
 */
Point.convert = function (a) {
    if (a instanceof Point) {
        return a;
    }
    if (Array.isArray(a)) {
        return new Point(a[0], a[1]);
    }
    return a;
};

},{}],4:[function(require,module,exports){
module.exports.VectorTile = require('./lib/vectortile.js');
module.exports.VectorTileFeature = require('./lib/vectortilefeature.js');
module.exports.VectorTileLayer = require('./lib/vectortilelayer.js');

},{"./lib/vectortile.js":5,"./lib/vectortilefeature.js":6,"./lib/vectortilelayer.js":7}],5:[function(require,module,exports){
'use strict';

var VectorTileLayer = require('./vectortilelayer');

module.exports = VectorTile;

function VectorTile(pbf, end) {
    this.layers = pbf.readFields(readTile, {}, end);
}

function readTile(tag, layers, pbf) {
    if (tag === 3) {
        var layer = new VectorTileLayer(pbf, pbf.readVarint() + pbf.pos);
        if (layer.length) layers[layer.name] = layer;
    }
}


},{"./vectortilelayer":7}],6:[function(require,module,exports){
'use strict';

var Point = require('@mapbox/point-geometry');

module.exports = VectorTileFeature;

function VectorTileFeature(pbf, end, extent, keys, values) {
    // Public
    this.properties = {};
    this.extent = extent;
    this.type = 0;

    // Private
    this._pbf = pbf;
    this._geometry = -1;
    this._keys = keys;
    this._values = values;

    pbf.readFields(readFeature, this, end);
}

function readFeature(tag, feature, pbf) {
    if (tag == 1) feature.id = pbf.readVarint();
    else if (tag == 2) readTag(pbf, feature);
    else if (tag == 3) feature.type = pbf.readVarint();
    else if (tag == 4) feature._geometry = pbf.pos;
}

function readTag(pbf, feature) {
    var end = pbf.readVarint() + pbf.pos;

    while (pbf.pos < end) {
        var key = feature._keys[pbf.readVarint()],
            value = feature._values[pbf.readVarint()];
        feature.properties[key] = value;
    }
}

VectorTileFeature.types = ['Unknown', 'Point', 'LineString', 'Polygon'];

VectorTileFeature.prototype.loadGeometry = function() {
    var pbf = this._pbf;
    pbf.pos = this._geometry;

    var end = pbf.readVarint() + pbf.pos,
        cmd = 1,
        length = 0,
        x = 0,
        y = 0,
        lines = [],
        line;

    while (pbf.pos < end) {
        if (!length) {
            var cmdLen = pbf.readVarint();
            cmd = cmdLen & 0x7;
            length = cmdLen >> 3;
        }

        length--;

        if (cmd === 1 || cmd === 2) {
            x += pbf.readSVarint();
            y += pbf.readSVarint();

            if (cmd === 1) { // moveTo
                if (line) lines.push(line);
                line = [];
            }

            line.push(new Point(x, y));

        } else if (cmd === 7) {

            // Workaround for https://github.com/mapbox/mapnik-vector-tile/issues/90
            if (line) {
                line.push(line[0].clone()); // closePolygon
            }

        } else {
            throw new Error('unknown command ' + cmd);
        }
    }

    if (line) lines.push(line);

    return lines;
};

VectorTileFeature.prototype.bbox = function() {
    var pbf = this._pbf;
    pbf.pos = this._geometry;

    var end = pbf.readVarint() + pbf.pos,
        cmd = 1,
        length = 0,
        x = 0,
        y = 0,
        x1 = Infinity,
        x2 = -Infinity,
        y1 = Infinity,
        y2 = -Infinity;

    while (pbf.pos < end) {
        if (!length) {
            var cmdLen = pbf.readVarint();
            cmd = cmdLen & 0x7;
            length = cmdLen >> 3;
        }

        length--;

        if (cmd === 1 || cmd === 2) {
            x += pbf.readSVarint();
            y += pbf.readSVarint();
            if (x < x1) x1 = x;
            if (x > x2) x2 = x;
            if (y < y1) y1 = y;
            if (y > y2) y2 = y;

        } else if (cmd !== 7) {
            throw new Error('unknown command ' + cmd);
        }
    }

    return [x1, y1, x2, y2];
};

VectorTileFeature.prototype.toGeoJSON = function(x, y, z) {
    var size = this.extent * Math.pow(2, z),
        x0 = this.extent * x,
        y0 = this.extent * y,
        coords = this.loadGeometry(),
        type = VectorTileFeature.types[this.type],
        i, j;

    function project(line) {
        for (var j = 0; j < line.length; j++) {
            var p = line[j], y2 = 180 - (p.y + y0) * 360 / size;
            line[j] = [
                (p.x + x0) * 360 / size - 180,
                360 / Math.PI * Math.atan(Math.exp(y2 * Math.PI / 180)) - 90
            ];
        }
    }

    switch (this.type) {
    case 1:
        var points = [];
        for (i = 0; i < coords.length; i++) {
            points[i] = coords[i][0];
        }
        coords = points;
        project(coords);
        break;

    case 2:
        for (i = 0; i < coords.length; i++) {
            project(coords[i]);
        }
        break;

    case 3:
        coords = classifyRings(coords);
        for (i = 0; i < coords.length; i++) {
            for (j = 0; j < coords[i].length; j++) {
                project(coords[i][j]);
            }
        }
        break;
    }

    if (coords.length === 1) {
        coords = coords[0];
    } else {
        type = 'Multi' + type;
    }

    var result = {
        type: "Feature",
        geometry: {
            type: type,
            coordinates: coords
        },
        properties: this.properties
    };

    if ('id' in this) {
        result.id = this.id;
    }

    return result;
};

// classifies an array of rings into polygons with outer rings and holes

function classifyRings(rings) {
    var len = rings.length;

    if (len <= 1) return [rings];

    var polygons = [],
        polygon,
        ccw;

    for (var i = 0; i < len; i++) {
        var area = signedArea(rings[i]);
        if (area === 0) continue;

        if (ccw === undefined) ccw = area < 0;

        if (ccw === area < 0) {
            if (polygon) polygons.push(polygon);
            polygon = [rings[i]];

        } else {
            polygon.push(rings[i]);
        }
    }
    if (polygon) polygons.push(polygon);

    return polygons;
}

function signedArea(ring) {
    var sum = 0;
    for (var i = 0, len = ring.length, j = len - 1, p1, p2; i < len; j = i++) {
        p1 = ring[i];
        p2 = ring[j];
        sum += (p2.x - p1.x) * (p1.y + p2.y);
    }
    return sum;
}

},{"@mapbox/point-geometry":3}],7:[function(require,module,exports){
'use strict';

var VectorTileFeature = require('./vectortilefeature.js');

module.exports = VectorTileLayer;

function VectorTileLayer(pbf, end) {
    // Public
    this.version = 1;
    this.name = null;
    this.extent = 4096;
    this.length = 0;

    // Private
    this._pbf = pbf;
    this._keys = [];
    this._values = [];
    this._features = [];

    pbf.readFields(readLayer, this, end);

    this.length = this._features.length;
}

function readLayer(tag, layer, pbf) {
    if (tag === 15) layer.version = pbf.readVarint();
    else if (tag === 1) layer.name = pbf.readString();
    else if (tag === 5) layer.extent = pbf.readVarint();
    else if (tag === 2) layer._features.push(pbf.pos);
    else if (tag === 3) layer._keys.push(pbf.readString());
    else if (tag === 4) layer._values.push(readValueMessage(pbf));
}

function readValueMessage(pbf) {
    var value = null,
        end = pbf.readVarint() + pbf.pos;

    while (pbf.pos < end) {
        var tag = pbf.readVarint() >> 3;

        value = tag === 1 ? pbf.readString() :
            tag === 2 ? pbf.readFloat() :
            tag === 3 ? pbf.readDouble() :
            tag === 4 ? pbf.readVarint64() :
            tag === 5 ? pbf.readVarint() :
            tag === 6 ? pbf.readSVarint() :
            tag === 7 ? pbf.readBoolean() : null;
    }

    return value;
}

// return feature `i` from this layer as a `VectorTileFeature`
VectorTileLayer.prototype.feature = function(i) {
    if (i < 0 || i >= this._features.length) throw new Error('feature index out of bounds');

    this._pbf.pos = this._features[i];

    var end = this._pbf.readVarint() + this._pbf.pos;
    return new VectorTileFeature(this._pbf, end, this.extent, this._keys, this._values);
};

},{"./vectortilefeature.js":6}],8:[function(require,module,exports){
var coordEach = require('@turf/meta').coordEach;

/**
 * Takes a set of features, calculates the bbox of all input features, and returns a bounding box.
 *
 * @name bbox
 * @param {FeatureCollection|Feature<any>} geojson input features
 * @returns {Array<number>} bbox extent in [minX, minY, maxX, maxY] order
 * @example
 * var line = turf.lineString([[-74, 40], [-78, 42], [-82, 35]]);
 * var bbox = turf.bbox(line);
 * var bboxPolygon = turf.bboxPolygon(bbox);
 *
 * //addToMap
 * var addToMap = [line, bboxPolygon]
 */
module.exports = function (geojson) {
    var bbox = [Infinity, Infinity, -Infinity, -Infinity];
    coordEach(geojson, function (coord) {
        if (bbox[0] > coord[0]) bbox[0] = coord[0];
        if (bbox[1] > coord[1]) bbox[1] = coord[1];
        if (bbox[2] < coord[0]) bbox[2] = coord[0];
        if (bbox[3] < coord[1]) bbox[3] = coord[1];
    });
    return bbox;
};

},{"@turf/meta":9}],9:[function(require,module,exports){
/**
 * Callback for coordEach
 *
 * @callback coordEachCallback
 * @param {Array<number>} currentCoord The current coordinate being processed.
 * @param {number} coordIndex The current index of the coordinate being processed.
 * Starts at index 0.
 * @param {number} featureIndex The current index of the feature being processed.
 * @param {number} featureSubIndex The current subIndex of the feature being processed.
 */

/**
 * Iterate over coordinates in any GeoJSON object, similar to Array.forEach()
 *
 * @name coordEach
 * @param {FeatureCollection|Geometry|Feature} geojson any GeoJSON object
 * @param {Function} callback a method that takes (currentCoord, coordIndex, featureIndex, featureSubIndex)
 * @param {boolean} [excludeWrapCoord=false] whether or not to include the final coordinate of LinearRings that wraps the ring in its iteration.
 * @example
 * var features = turf.featureCollection([
 *   turf.point([26, 37], {"foo": "bar"}),
 *   turf.point([36, 53], {"hello": "world"})
 * ]);
 *
 * turf.coordEach(features, function (currentCoord, coordIndex, featureIndex, featureSubIndex) {
 *   //=currentCoord
 *   //=coordIndex
 *   //=featureIndex
 *   //=featureSubIndex
 * });
 */
function coordEach(geojson, callback, excludeWrapCoord) {
    // Handles null Geometry -- Skips this GeoJSON
    if (geojson === null) return;
    var featureIndex, geometryIndex, j, k, l, geometry, stopG, coords,
        geometryMaybeCollection,
        wrapShrink = 0,
        coordIndex = 0,
        isGeometryCollection,
        type = geojson.type,
        isFeatureCollection = type === 'FeatureCollection',
        isFeature = type === 'Feature',
        stop = isFeatureCollection ? geojson.features.length : 1;

    // This logic may look a little weird. The reason why it is that way
    // is because it's trying to be fast. GeoJSON supports multiple kinds
    // of objects at its root: FeatureCollection, Features, Geometries.
    // This function has the responsibility of handling all of them, and that
    // means that some of the `for` loops you see below actually just don't apply
    // to certain inputs. For instance, if you give this just a
    // Point geometry, then both loops are short-circuited and all we do
    // is gradually rename the input until it's called 'geometry'.
    //
    // This also aims to allocate as few resources as possible: just a
    // few numbers and booleans, rather than any temporary arrays as would
    // be required with the normalization approach.
    for (featureIndex = 0; featureIndex < stop; featureIndex++) {
        var featureSubIndex = 0;

        geometryMaybeCollection = (isFeatureCollection ? geojson.features[featureIndex].geometry :
        (isFeature ? geojson.geometry : geojson));
        isGeometryCollection = (geometryMaybeCollection) ? geometryMaybeCollection.type === 'GeometryCollection' : false;
        stopG = isGeometryCollection ? geometryMaybeCollection.geometries.length : 1;

        for (geometryIndex = 0; geometryIndex < stopG; geometryIndex++) {
            geometry = isGeometryCollection ?
            geometryMaybeCollection.geometries[geometryIndex] : geometryMaybeCollection;

            // Handles null Geometry -- Skips this geometry
            if (geometry === null) continue;
            coords = geometry.coordinates;
            var geomType = geometry.type;

            wrapShrink = (excludeWrapCoord && (geomType === 'Polygon' || geomType === 'MultiPolygon')) ? 1 : 0;

            switch (geomType) {
            case null:
                break;
            case 'Point':
                callback(coords, coordIndex, featureIndex, featureSubIndex);
                coordIndex++;
                featureSubIndex++;
                break;
            case 'LineString':
            case 'MultiPoint':
                for (j = 0; j < coords.length; j++) {
                    callback(coords[j], coordIndex, featureIndex, featureSubIndex);
                    coordIndex++;
                    featureSubIndex++;
                }
                break;
            case 'Polygon':
            case 'MultiLineString':
                for (j = 0; j < coords.length; j++)
                    for (k = 0; k < coords[j].length - wrapShrink; k++) {
                        callback(coords[j][k], coordIndex, featureIndex, featureSubIndex);
                        coordIndex++;
                        featureSubIndex++;
                    }
                break;
            case 'MultiPolygon':
                for (j = 0; j < coords.length; j++)
                    for (k = 0; k < coords[j].length; k++)
                        for (l = 0; l < coords[j][k].length - wrapShrink; l++) {
                            callback(coords[j][k][l], coordIndex, featureIndex, featureSubIndex);
                            coordIndex++;
                            featureSubIndex++;
                        }
                break;
            case 'GeometryCollection':
                for (j = 0; j < geometry.geometries.length; j++)
                    coordEach(geometry.geometries[j], callback, excludeWrapCoord);
                break;
            default: throw new Error('Unknown Geometry Type');
            }
        }
    }
}

/**
 * Callback for coordReduce
 *
 * The first time the callback function is called, the values provided as arguments depend
 * on whether the reduce method has an initialValue argument.
 *
 * If an initialValue is provided to the reduce method:
 *  - The previousValue argument is initialValue.
 *  - The currentValue argument is the value of the first element present in the array.
 *
 * If an initialValue is not provided:
 *  - The previousValue argument is the value of the first element present in the array.
 *  - The currentValue argument is the value of the second element present in the array.
 *
 * @callback coordReduceCallback
 * @param {*} previousValue The accumulated value previously returned in the last invocation
 * of the callback, or initialValue, if supplied.
 * @param {Array<number>} currentCoord The current coordinate being processed.
 * @param {number} coordIndex The current index of the coordinate being processed.
 * Starts at index 0, if an initialValue is provided, and at index 1 otherwise.
 * @param {number} featureIndex The current index of the feature being processed.
 * @param {number} featureSubIndex The current subIndex of the feature being processed.
 */

/**
 * Reduce coordinates in any GeoJSON object, similar to Array.reduce()
 *
 * @name coordReduce
 * @param {FeatureCollection|Geometry|Feature} geojson any GeoJSON object
 * @param {Function} callback a method that takes (previousValue, currentCoord, coordIndex)
 * @param {*} [initialValue] Value to use as the first argument to the first call of the callback.
 * @param {boolean} [excludeWrapCoord=false] whether or not to include the final coordinate of LinearRings that wraps the ring in its iteration.
 * @returns {*} The value that results from the reduction.
 * @example
 * var features = turf.featureCollection([
 *   turf.point([26, 37], {"foo": "bar"}),
 *   turf.point([36, 53], {"hello": "world"})
 * ]);
 *
 * turf.coordReduce(features, function (previousValue, currentCoord, coordIndex, featureIndex, featureSubIndex) {
 *   //=previousValue
 *   //=currentCoord
 *   //=coordIndex
 *   //=featureIndex
 *   //=featureSubIndex
 *   return currentCoord;
 * });
 */
function coordReduce(geojson, callback, initialValue, excludeWrapCoord) {
    var previousValue = initialValue;
    coordEach(geojson, function (currentCoord, coordIndex, featureIndex, featureSubIndex) {
        if (coordIndex === 0 && initialValue === undefined) previousValue = currentCoord;
        else previousValue = callback(previousValue, currentCoord, coordIndex, featureIndex, featureSubIndex);
    }, excludeWrapCoord);
    return previousValue;
}

/**
 * Callback for propEach
 *
 * @callback propEachCallback
 * @param {Object} currentProperties The current properties being processed.
 * @param {number} featureIndex The index of the current element being processed in the
 * array.Starts at index 0, if an initialValue is provided, and at index 1 otherwise.
 */

/**
 * Iterate over properties in any GeoJSON object, similar to Array.forEach()
 *
 * @name propEach
 * @param {FeatureCollection|Feature} geojson any GeoJSON object
 * @param {Function} callback a method that takes (currentProperties, featureIndex)
 * @example
 * var features = turf.featureCollection([
 *     turf.point([26, 37], {foo: 'bar'}),
 *     turf.point([36, 53], {hello: 'world'})
 * ]);
 *
 * turf.propEach(features, function (currentProperties, featureIndex) {
 *   //=currentProperties
 *   //=featureIndex
 * });
 */
function propEach(geojson, callback) {
    var i;
    switch (geojson.type) {
    case 'FeatureCollection':
        for (i = 0; i < geojson.features.length; i++) {
            callback(geojson.features[i].properties, i);
        }
        break;
    case 'Feature':
        callback(geojson.properties, 0);
        break;
    }
}


/**
 * Callback for propReduce
 *
 * The first time the callback function is called, the values provided as arguments depend
 * on whether the reduce method has an initialValue argument.
 *
 * If an initialValue is provided to the reduce method:
 *  - The previousValue argument is initialValue.
 *  - The currentValue argument is the value of the first element present in the array.
 *
 * If an initialValue is not provided:
 *  - The previousValue argument is the value of the first element present in the array.
 *  - The currentValue argument is the value of the second element present in the array.
 *
 * @callback propReduceCallback
 * @param {*} previousValue The accumulated value previously returned in the last invocation
 * of the callback, or initialValue, if supplied.
 * @param {*} currentProperties The current properties being processed.
 * @param {number} featureIndex The index of the current element being processed in the
 * array.Starts at index 0, if an initialValue is provided, and at index 1 otherwise.
 */

/**
 * Reduce properties in any GeoJSON object into a single value,
 * similar to how Array.reduce works. However, in this case we lazily run
 * the reduction, so an array of all properties is unnecessary.
 *
 * @name propReduce
 * @param {FeatureCollection|Feature} geojson any GeoJSON object
 * @param {Function} callback a method that takes (previousValue, currentProperties, featureIndex)
 * @param {*} [initialValue] Value to use as the first argument to the first call of the callback.
 * @returns {*} The value that results from the reduction.
 * @example
 * var features = turf.featureCollection([
 *     turf.point([26, 37], {foo: 'bar'}),
 *     turf.point([36, 53], {hello: 'world'})
 * ]);
 *
 * turf.propReduce(features, function (previousValue, currentProperties, featureIndex) {
 *   //=previousValue
 *   //=currentProperties
 *   //=featureIndex
 *   return currentProperties
 * });
 */
function propReduce(geojson, callback, initialValue) {
    var previousValue = initialValue;
    propEach(geojson, function (currentProperties, featureIndex) {
        if (featureIndex === 0 && initialValue === undefined) previousValue = currentProperties;
        else previousValue = callback(previousValue, currentProperties, featureIndex);
    });
    return previousValue;
}

/**
 * Callback for featureEach
 *
 * @callback featureEachCallback
 * @param {Feature<any>} currentFeature The current feature being processed.
 * @param {number} featureIndex The index of the current element being processed in the
 * array.Starts at index 0, if an initialValue is provided, and at index 1 otherwise.
 */

/**
 * Iterate over features in any GeoJSON object, similar to
 * Array.forEach.
 *
 * @name featureEach
 * @param {Geometry|FeatureCollection|Feature} geojson any GeoJSON object
 * @param {Function} callback a method that takes (currentFeature, featureIndex)
 * @example
 * var features = turf.featureCollection([
 *   turf.point([26, 37], {foo: 'bar'}),
 *   turf.point([36, 53], {hello: 'world'})
 * ]);
 *
 * turf.featureEach(features, function (currentFeature, featureIndex) {
 *   //=currentFeature
 *   //=featureIndex
 * });
 */
function featureEach(geojson, callback) {
    if (geojson.type === 'Feature') {
        callback(geojson, 0);
    } else if (geojson.type === 'FeatureCollection') {
        for (var i = 0; i < geojson.features.length; i++) {
            callback(geojson.features[i], i);
        }
    }
}

/**
 * Callback for featureReduce
 *
 * The first time the callback function is called, the values provided as arguments depend
 * on whether the reduce method has an initialValue argument.
 *
 * If an initialValue is provided to the reduce method:
 *  - The previousValue argument is initialValue.
 *  - The currentValue argument is the value of the first element present in the array.
 *
 * If an initialValue is not provided:
 *  - The previousValue argument is the value of the first element present in the array.
 *  - The currentValue argument is the value of the second element present in the array.
 *
 * @callback featureReduceCallback
 * @param {*} previousValue The accumulated value previously returned in the last invocation
 * of the callback, or initialValue, if supplied.
 * @param {Feature} currentFeature The current Feature being processed.
 * @param {number} featureIndex The index of the current element being processed in the
 * array.Starts at index 0, if an initialValue is provided, and at index 1 otherwise.
 */

/**
 * Reduce features in any GeoJSON object, similar to Array.reduce().
 *
 * @name featureReduce
 * @param {Geometry|FeatureCollection|Feature} geojson any GeoJSON object
 * @param {Function} callback a method that takes (previousValue, currentFeature, featureIndex)
 * @param {*} [initialValue] Value to use as the first argument to the first call of the callback.
 * @returns {*} The value that results from the reduction.
 * @example
 * var features = turf.featureCollection([
 *   turf.point([26, 37], {"foo": "bar"}),
 *   turf.point([36, 53], {"hello": "world"})
 * ]);
 *
 * turf.featureReduce(features, function (previousValue, currentFeature, featureIndex) {
 *   //=previousValue
 *   //=currentFeature
 *   //=featureIndex
 *   return currentFeature
 * });
 */
function featureReduce(geojson, callback, initialValue) {
    var previousValue = initialValue;
    featureEach(geojson, function (currentFeature, featureIndex) {
        if (featureIndex === 0 && initialValue === undefined) previousValue = currentFeature;
        else previousValue = callback(previousValue, currentFeature, featureIndex);
    });
    return previousValue;
}

/**
 * Get all coordinates from any GeoJSON object.
 *
 * @name coordAll
 * @param {Geometry|FeatureCollection|Feature} geojson any GeoJSON object
 * @returns {Array<Array<number>>} coordinate position array
 * @example
 * var features = turf.featureCollection([
 *   turf.point([26, 37], {foo: 'bar'}),
 *   turf.point([36, 53], {hello: 'world'})
 * ]);
 *
 * var coords = turf.coordAll(features);
 * //= [[26, 37], [36, 53]]
 */
function coordAll(geojson) {
    var coords = [];
    coordEach(geojson, function (coord) {
        coords.push(coord);
    });
    return coords;
}

/**
 * Callback for geomEach
 *
 * @callback geomEachCallback
 * @param {Geometry} currentGeometry The current geometry being processed.
 * @param {number} currentIndex The index of the current element being processed in the
 * array. Starts at index 0, if an initialValue is provided, and at index 1 otherwise.
 * @param {number} currentProperties The current feature properties being processed.
 */

/**
 * Iterate over each geometry in any GeoJSON object, similar to Array.forEach()
 *
 * @name geomEach
 * @param {Geometry|FeatureCollection|Feature} geojson any GeoJSON object
 * @param {Function} callback a method that takes (currentGeometry, featureIndex, currentProperties)
 * @example
 * var features = turf.featureCollection([
 *     turf.point([26, 37], {foo: 'bar'}),
 *     turf.point([36, 53], {hello: 'world'})
 * ]);
 *
 * turf.geomEach(features, function (currentGeometry, featureIndex, currentProperties) {
 *   //=currentGeometry
 *   //=featureIndex
 *   //=currentProperties
 * });
 */
function geomEach(geojson, callback) {
    var i, j, g, geometry, stopG,
        geometryMaybeCollection,
        isGeometryCollection,
        geometryProperties,
        featureIndex = 0,
        isFeatureCollection = geojson.type === 'FeatureCollection',
        isFeature = geojson.type === 'Feature',
        stop = isFeatureCollection ? geojson.features.length : 1;

  // This logic may look a little weird. The reason why it is that way
  // is because it's trying to be fast. GeoJSON supports multiple kinds
  // of objects at its root: FeatureCollection, Features, Geometries.
  // This function has the responsibility of handling all of them, and that
  // means that some of the `for` loops you see below actually just don't apply
  // to certain inputs. For instance, if you give this just a
  // Point geometry, then both loops are short-circuited and all we do
  // is gradually rename the input until it's called 'geometry'.
  //
  // This also aims to allocate as few resources as possible: just a
  // few numbers and booleans, rather than any temporary arrays as would
  // be required with the normalization approach.
    for (i = 0; i < stop; i++) {

        geometryMaybeCollection = (isFeatureCollection ? geojson.features[i].geometry :
        (isFeature ? geojson.geometry : geojson));
        geometryProperties = (isFeatureCollection ? geojson.features[i].properties :
                              (isFeature ? geojson.properties : {}));
        isGeometryCollection = (geometryMaybeCollection) ? geometryMaybeCollection.type === 'GeometryCollection' : false;
        stopG = isGeometryCollection ? geometryMaybeCollection.geometries.length : 1;

        for (g = 0; g < stopG; g++) {
            geometry = isGeometryCollection ?
            geometryMaybeCollection.geometries[g] : geometryMaybeCollection;

            // Handle null Geometry
            if (geometry === null) {
                callback(null, featureIndex, geometryProperties);
                featureIndex++;
                continue;
            }
            switch (geometry.type) {
            case 'Point':
            case 'LineString':
            case 'MultiPoint':
            case 'Polygon':
            case 'MultiLineString':
            case 'MultiPolygon': {
                callback(geometry, featureIndex, geometryProperties);
                featureIndex++;
                break;
            }
            case 'GeometryCollection': {
                for (j = 0; j < geometry.geometries.length; j++) {
                    callback(geometry.geometries[j], featureIndex, geometryProperties);
                    featureIndex++;
                }
                break;
            }
            default: throw new Error('Unknown Geometry Type');
            }
        }
    }
}

/**
 * Callback for geomReduce
 *
 * The first time the callback function is called, the values provided as arguments depend
 * on whether the reduce method has an initialValue argument.
 *
 * If an initialValue is provided to the reduce method:
 *  - The previousValue argument is initialValue.
 *  - The currentValue argument is the value of the first element present in the array.
 *
 * If an initialValue is not provided:
 *  - The previousValue argument is the value of the first element present in the array.
 *  - The currentValue argument is the value of the second element present in the array.
 *
 * @callback geomReduceCallback
 * @param {*} previousValue The accumulated value previously returned in the last invocation
 * of the callback, or initialValue, if supplied.
 * @param {Geometry} currentGeometry The current Feature being processed.
 * @param {number} currentIndex The index of the current element being processed in the
 * array.Starts at index 0, if an initialValue is provided, and at index 1 otherwise.
 * @param {Object} currentProperties The current feature properties being processed.
 */

/**
 * Reduce geometry in any GeoJSON object, similar to Array.reduce().
 *
 * @name geomReduce
 * @param {Geometry|FeatureCollection|Feature} geojson any GeoJSON object
 * @param {Function} callback a method that takes (previousValue, currentGeometry, featureIndex, currentProperties)
 * @param {*} [initialValue] Value to use as the first argument to the first call of the callback.
 * @returns {*} The value that results from the reduction.
 * @example
 * var features = turf.featureCollection([
 *     turf.point([26, 37], {foo: 'bar'}),
 *     turf.point([36, 53], {hello: 'world'})
 * ]);
 *
 * turf.geomReduce(features, function (previousValue, currentGeometry, featureIndex, currentProperties) {
 *   //=previousValue
 *   //=currentGeometry
 *   //=featureIndex
 *   //=currentProperties
 *   return currentGeometry
 * });
 */
function geomReduce(geojson, callback, initialValue) {
    var previousValue = initialValue;
    geomEach(geojson, function (currentGeometry, currentIndex, currentProperties) {
        if (currentIndex === 0 && initialValue === undefined) previousValue = currentGeometry;
        else previousValue = callback(previousValue, currentGeometry, currentIndex, currentProperties);
    });
    return previousValue;
}

/**
 * Callback for flattenEach
 *
 * @callback flattenEachCallback
 * @param {Feature} currentFeature The current flattened feature being processed.
 * @param {number} featureIndex The index of the current element being processed in the
 * array. Starts at index 0, if an initialValue is provided, and at index 1 otherwise.
 * @param {number} featureSubIndex The subindex of the current element being processed in the
 * array. Starts at index 0 and increases if the flattened feature was a multi-geometry.
 */

/**
 * Iterate over flattened features in any GeoJSON object, similar to
 * Array.forEach.
 *
 * @name flattenEach
 * @param {Geometry|FeatureCollection|Feature} geojson any GeoJSON object
 * @param {Function} callback a method that takes (currentFeature, featureIndex, featureSubIndex)
 * @example
 * var features = turf.featureCollection([
 *     turf.point([26, 37], {foo: 'bar'}),
 *     turf.multiPoint([[40, 30], [36, 53]], {hello: 'world'})
 * ]);
 *
 * turf.flattenEach(features, function (currentFeature, featureIndex, featureSubIndex) {
 *   //=currentFeature
 *   //=featureIndex
 *   //=featureSubIndex
 * });
 */
function flattenEach(geojson, callback) {
    geomEach(geojson, function (geometry, featureIndex, properties) {
        // Callback for single geometry
        var type = (geometry === null) ? null : geometry.type;
        switch (type) {
        case null:
        case 'Point':
        case 'LineString':
        case 'Polygon':
            callback(feature(geometry, properties), featureIndex, 0);
            return;
        }

        var geomType;

        // Callback for multi-geometry
        switch (type) {
        case 'MultiPoint':
            geomType = 'Point';
            break;
        case 'MultiLineString':
            geomType = 'LineString';
            break;
        case 'MultiPolygon':
            geomType = 'Polygon';
            break;
        }

        geometry.coordinates.forEach(function (coordinate, featureSubIndex) {
            var geom = {
                type: geomType,
                coordinates: coordinate
            };
            callback(feature(geom, properties), featureIndex, featureSubIndex);
        });

    });
}

/**
 * Callback for flattenReduce
 *
 * The first time the callback function is called, the values provided as arguments depend
 * on whether the reduce method has an initialValue argument.
 *
 * If an initialValue is provided to the reduce method:
 *  - The previousValue argument is initialValue.
 *  - The currentValue argument is the value of the first element present in the array.
 *
 * If an initialValue is not provided:
 *  - The previousValue argument is the value of the first element present in the array.
 *  - The currentValue argument is the value of the second element present in the array.
 *
 * @callback flattenReduceCallback
 * @param {*} previousValue The accumulated value previously returned in the last invocation
 * of the callback, or initialValue, if supplied.
 * @param {Feature} currentFeature The current Feature being processed.
 * @param {number} featureIndex The index of the current element being processed in the
 * array.Starts at index 0, if an initialValue is provided, and at index 1 otherwise.
 * @param {number} featureSubIndex The subindex of the current element being processed in the
 * array. Starts at index 0 and increases if the flattened feature was a multi-geometry.
 */

/**
 * Reduce flattened features in any GeoJSON object, similar to Array.reduce().
 *
 * @name flattenReduce
 * @param {Geometry|FeatureCollection|Feature} geojson any GeoJSON object
 * @param {Function} callback a method that takes (previousValue, currentFeature, featureIndex, featureSubIndex)
 * @param {*} [initialValue] Value to use as the first argument to the first call of the callback.
 * @returns {*} The value that results from the reduction.
 * @example
 * var features = turf.featureCollection([
 *     turf.point([26, 37], {foo: 'bar'}),
 *     turf.multiPoint([[40, 30], [36, 53]], {hello: 'world'})
 * ]);
 *
 * turf.flattenReduce(features, function (previousValue, currentFeature, featureIndex, featureSubIndex) {
 *   //=previousValue
 *   //=currentFeature
 *   //=featureIndex
 *   //=featureSubIndex
 *   return currentFeature
 * });
 */
function flattenReduce(geojson, callback, initialValue) {
    var previousValue = initialValue;
    flattenEach(geojson, function (currentFeature, featureIndex, featureSubIndex) {
        if (featureIndex === 0 && featureSubIndex === 0 && initialValue === undefined) previousValue = currentFeature;
        else previousValue = callback(previousValue, currentFeature, featureIndex, featureSubIndex);
    });
    return previousValue;
}

/**
 * Callback for segmentEach
 *
 * @callback segmentEachCallback
 * @param {Feature<LineString>} currentSegment The current segment being processed.
 * @param {number} featureIndex The index of the current element being processed in the array, starts at index 0.
 * @param {number} featureSubIndex The subindex of the current element being processed in the
 * array. Starts at index 0 and increases for each iterating line segment.
 * @returns {void}
 */

/**
 * Iterate over 2-vertex line segment in any GeoJSON object, similar to Array.forEach()
 * (Multi)Point geometries do not contain segments therefore they are ignored during this operation.
 *
 * @param {FeatureCollection|Feature|Geometry} geojson any GeoJSON
 * @param {Function} callback a method that takes (currentSegment, featureIndex, featureSubIndex)
 * @returns {void}
 * @example
 * var polygon = turf.polygon([[[-50, 5], [-40, -10], [-50, -10], [-40, 5], [-50, 5]]]);
 *
 * // Iterate over GeoJSON by 2-vertex segments
 * turf.segmentEach(polygon, function (currentSegment, featureIndex, featureSubIndex) {
 *   //= currentSegment
 *   //= featureIndex
 *   //= featureSubIndex
 * });
 *
 * // Calculate the total number of segments
 * var total = 0;
 * var initialValue = 0;
 * turf.segmentEach(polygon, function () {
 *     total++;
 * }, initialValue);
 */
function segmentEach(geojson, callback) {
    flattenEach(geojson, function (feature, featureIndex) {
        var featureSubIndex = 0;
        // Exclude null Geometries
        if (!feature.geometry) return;
        // (Multi)Point geometries do not contain segments therefore they are ignored during this operation.
        var type = feature.geometry.type;
        if (type === 'Point' || type === 'MultiPoint') return;

        // Generate 2-vertex line segments
        coordReduce(feature, function (previousCoords, currentCoord) {
            var currentSegment = lineString([previousCoords, currentCoord], feature.properties);
            callback(currentSegment, featureIndex, featureSubIndex);
            featureSubIndex++;
            return currentCoord;
        });
    });
}

/**
 * Callback for segmentReduce
 *
 * The first time the callback function is called, the values provided as arguments depend
 * on whether the reduce method has an initialValue argument.
 *
 * If an initialValue is provided to the reduce method:
 *  - The previousValue argument is initialValue.
 *  - The currentValue argument is the value of the first element present in the array.
 *
 * If an initialValue is not provided:
 *  - The previousValue argument is the value of the first element present in the array.
 *  - The currentValue argument is the value of the second element present in the array.
 *
 * @callback segmentReduceCallback
 * @param {*} [previousValue] The accumulated value previously returned in the last invocation
 * of the callback, or initialValue, if supplied.
 * @param {Feature<LineString>} [currentSegment] The current segment being processed.
 * @param {number} [currentIndex] The index of the current element being processed in the
 * array. Starts at index 0, if an initialValue is provided, and at index 1 otherwise.
 * @param {number} [currentSubIndex] The subindex of the current element being processed in the
 * array. Starts at index 0 and increases for each iterating line segment.
 */

/**
 * Reduce 2-vertex line segment in any GeoJSON object, similar to Array.reduce()
 * (Multi)Point geometries do not contain segments therefore they are ignored during this operation.
 *
 * @param {FeatureCollection|Feature|Geometry} geojson any GeoJSON
 * @param {Function} callback a method that takes (previousValue, currentSegment, currentIndex)
 * @param {*} [initialValue] Value to use as the first argument to the first call of the callback.
 * @returns {void}
 * @example
 * var polygon = turf.polygon([[[-50, 5], [-40, -10], [-50, -10], [-40, 5], [-50, 5]]]);
 *
 * // Iterate over GeoJSON by 2-vertex segments
 * turf.segmentReduce(polygon, function (previousSegment, currentSegment, currentIndex, currentSubIndex) {
 *   //= previousSegment
 *   //= currentSegment
 *   //= currentIndex
 *   //= currentSubIndex
 *   return currentSegment
 * });
 *
 * // Calculate the total number of segments
 * var initialValue = 0
 * var total = turf.segmentReduce(polygon, function (previousValue) {
 *     previousValue++;
 *     return previousValue;
 * }, initialValue);
 */
function segmentReduce(geojson, callback, initialValue) {
    var previousValue = initialValue;
    segmentEach(geojson, function (currentSegment, currentIndex, currentSubIndex) {
        if (currentIndex === 0 && initialValue === undefined) previousValue = currentSegment;
        else previousValue = callback(previousValue, currentSegment, currentIndex, currentSubIndex);
    });
    return previousValue;
}

/**
 * Create Feature
 *
 * @private
 * @param {Geometry} geometry GeoJSON Geometry
 * @param {Object} properties Properties
 * @returns {Feature} GeoJSON Feature
 */
function feature(geometry, properties) {
    if (geometry === undefined) throw new Error('No geometry passed');

    return {
        type: 'Feature',
        properties: properties || {},
        geometry: geometry
    };
}

/**
 * Create LineString
 *
 * @private
 * @param {Array<Array<number>>} coordinates Line Coordinates
 * @param {Object} properties Properties
 * @returns {Feature<LineString>} GeoJSON LineString Feature
 */
function lineString(coordinates, properties) {
    if (!coordinates) throw new Error('No coordinates passed');
    if (coordinates.length < 2) throw new Error('Coordinates must be an array of two or more positions');

    return {
        type: 'Feature',
        properties: properties || {},
        geometry: {
            type: 'LineString',
            coordinates: coordinates
        }
    };
}

module.exports = {
    coordEach: coordEach,
    coordReduce: coordReduce,
    propEach: propEach,
    propReduce: propReduce,
    featureEach: featureEach,
    featureReduce: featureReduce,
    coordAll: coordAll,
    geomEach: geomEach,
    geomReduce: geomReduce,
    flattenEach: flattenEach,
    flattenReduce: flattenReduce,
    segmentEach: segmentEach,
    segmentReduce: segmentReduce
};

},{}],10:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],11:[function(require,module,exports){
'use strict';

module.exports = Pbf;

var ieee754 = require('ieee754');

function Pbf(buf) {
    this.buf = ArrayBuffer.isView && ArrayBuffer.isView(buf) ? buf : new Uint8Array(buf || 0);
    this.pos = 0;
    this.type = 0;
    this.length = this.buf.length;
}

Pbf.Varint  = 0; // varint: int32, int64, uint32, uint64, sint32, sint64, bool, enum
Pbf.Fixed64 = 1; // 64-bit: double, fixed64, sfixed64
Pbf.Bytes   = 2; // length-delimited: string, bytes, embedded messages, packed repeated fields
Pbf.Fixed32 = 5; // 32-bit: float, fixed32, sfixed32

var SHIFT_LEFT_32 = (1 << 16) * (1 << 16),
    SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32;

Pbf.prototype = {

    destroy: function() {
        this.buf = null;
    },

    // === READING =================================================================

    readFields: function(readField, result, end) {
        end = end || this.length;

        while (this.pos < end) {
            var val = this.readVarint(),
                tag = val >> 3,
                startPos = this.pos;

            this.type = val & 0x7;
            readField(tag, result, this);

            if (this.pos === startPos) this.skip(val);
        }
        return result;
    },

    readMessage: function(readField, result) {
        return this.readFields(readField, result, this.readVarint() + this.pos);
    },

    readFixed32: function() {
        var val = readUInt32(this.buf, this.pos);
        this.pos += 4;
        return val;
    },

    readSFixed32: function() {
        var val = readInt32(this.buf, this.pos);
        this.pos += 4;
        return val;
    },

    // 64-bit int handling is based on github.com/dpw/node-buffer-more-ints (MIT-licensed)

    readFixed64: function() {
        var val = readUInt32(this.buf, this.pos) + readUInt32(this.buf, this.pos + 4) * SHIFT_LEFT_32;
        this.pos += 8;
        return val;
    },

    readSFixed64: function() {
        var val = readUInt32(this.buf, this.pos) + readInt32(this.buf, this.pos + 4) * SHIFT_LEFT_32;
        this.pos += 8;
        return val;
    },

    readFloat: function() {
        var val = ieee754.read(this.buf, this.pos, true, 23, 4);
        this.pos += 4;
        return val;
    },

    readDouble: function() {
        var val = ieee754.read(this.buf, this.pos, true, 52, 8);
        this.pos += 8;
        return val;
    },

    readVarint: function(isSigned) {
        var buf = this.buf,
            val, b;

        b = buf[this.pos++]; val  =  b & 0x7f;        if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 7;  if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 14; if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 21; if (b < 0x80) return val;
        b = buf[this.pos];   val |= (b & 0x0f) << 28;

        return readVarintRemainder(val, isSigned, this);
    },

    readVarint64: function() { // for compatibility with v2.0.1
        return this.readVarint(true);
    },

    readSVarint: function() {
        var num = this.readVarint();
        return num % 2 === 1 ? (num + 1) / -2 : num / 2; // zigzag encoding
    },

    readBoolean: function() {
        return Boolean(this.readVarint());
    },

    readString: function() {
        var end = this.readVarint() + this.pos,
            str = readUtf8(this.buf, this.pos, end);
        this.pos = end;
        return str;
    },

    readBytes: function() {
        var end = this.readVarint() + this.pos,
            buffer = this.buf.subarray(this.pos, end);
        this.pos = end;
        return buffer;
    },

    // verbose for performance reasons; doesn't affect gzipped size

    readPackedVarint: function(arr, isSigned) {
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readVarint(isSigned));
        return arr;
    },
    readPackedSVarint: function(arr) {
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readSVarint());
        return arr;
    },
    readPackedBoolean: function(arr) {
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readBoolean());
        return arr;
    },
    readPackedFloat: function(arr) {
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readFloat());
        return arr;
    },
    readPackedDouble: function(arr) {
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readDouble());
        return arr;
    },
    readPackedFixed32: function(arr) {
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readFixed32());
        return arr;
    },
    readPackedSFixed32: function(arr) {
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readSFixed32());
        return arr;
    },
    readPackedFixed64: function(arr) {
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readFixed64());
        return arr;
    },
    readPackedSFixed64: function(arr) {
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readSFixed64());
        return arr;
    },

    skip: function(val) {
        var type = val & 0x7;
        if (type === Pbf.Varint) while (this.buf[this.pos++] > 0x7f) {}
        else if (type === Pbf.Bytes) this.pos = this.readVarint() + this.pos;
        else if (type === Pbf.Fixed32) this.pos += 4;
        else if (type === Pbf.Fixed64) this.pos += 8;
        else throw new Error('Unimplemented type: ' + type);
    },

    // === WRITING =================================================================

    writeTag: function(tag, type) {
        this.writeVarint((tag << 3) | type);
    },

    realloc: function(min) {
        var length = this.length || 16;

        while (length < this.pos + min) length *= 2;

        if (length !== this.length) {
            var buf = new Uint8Array(length);
            buf.set(this.buf);
            this.buf = buf;
            this.length = length;
        }
    },

    finish: function() {
        this.length = this.pos;
        this.pos = 0;
        return this.buf.subarray(0, this.length);
    },

    writeFixed32: function(val) {
        this.realloc(4);
        writeInt32(this.buf, val, this.pos);
        this.pos += 4;
    },

    writeSFixed32: function(val) {
        this.realloc(4);
        writeInt32(this.buf, val, this.pos);
        this.pos += 4;
    },

    writeFixed64: function(val) {
        this.realloc(8);
        writeInt32(this.buf, val & -1, this.pos);
        writeInt32(this.buf, Math.floor(val * SHIFT_RIGHT_32), this.pos + 4);
        this.pos += 8;
    },

    writeSFixed64: function(val) {
        this.realloc(8);
        writeInt32(this.buf, val & -1, this.pos);
        writeInt32(this.buf, Math.floor(val * SHIFT_RIGHT_32), this.pos + 4);
        this.pos += 8;
    },

    writeVarint: function(val) {
        val = +val || 0;

        if (val > 0xfffffff || val < 0) {
            writeBigVarint(val, this);
            return;
        }

        this.realloc(4);

        this.buf[this.pos++] =           val & 0x7f  | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] =   (val >>> 7) & 0x7f;
    },

    writeSVarint: function(val) {
        this.writeVarint(val < 0 ? -val * 2 - 1 : val * 2);
    },

    writeBoolean: function(val) {
        this.writeVarint(Boolean(val));
    },

    writeString: function(str) {
        str = String(str);
        this.realloc(str.length * 4);

        this.pos++; // reserve 1 byte for short string length

        var startPos = this.pos;
        // write the string directly to the buffer and see how much was written
        this.pos = writeUtf8(this.buf, str, this.pos);
        var len = this.pos - startPos;

        if (len >= 0x80) makeRoomForExtraLength(startPos, len, this);

        // finally, write the message length in the reserved place and restore the position
        this.pos = startPos - 1;
        this.writeVarint(len);
        this.pos += len;
    },

    writeFloat: function(val) {
        this.realloc(4);
        ieee754.write(this.buf, val, this.pos, true, 23, 4);
        this.pos += 4;
    },

    writeDouble: function(val) {
        this.realloc(8);
        ieee754.write(this.buf, val, this.pos, true, 52, 8);
        this.pos += 8;
    },

    writeBytes: function(buffer) {
        var len = buffer.length;
        this.writeVarint(len);
        this.realloc(len);
        for (var i = 0; i < len; i++) this.buf[this.pos++] = buffer[i];
    },

    writeRawMessage: function(fn, obj) {
        this.pos++; // reserve 1 byte for short message length

        // write the message directly to the buffer and see how much was written
        var startPos = this.pos;
        fn(obj, this);
        var len = this.pos - startPos;

        if (len >= 0x80) makeRoomForExtraLength(startPos, len, this);

        // finally, write the message length in the reserved place and restore the position
        this.pos = startPos - 1;
        this.writeVarint(len);
        this.pos += len;
    },

    writeMessage: function(tag, fn, obj) {
        this.writeTag(tag, Pbf.Bytes);
        this.writeRawMessage(fn, obj);
    },

    writePackedVarint:   function(tag, arr) { this.writeMessage(tag, writePackedVarint, arr);   },
    writePackedSVarint:  function(tag, arr) { this.writeMessage(tag, writePackedSVarint, arr);  },
    writePackedBoolean:  function(tag, arr) { this.writeMessage(tag, writePackedBoolean, arr);  },
    writePackedFloat:    function(tag, arr) { this.writeMessage(tag, writePackedFloat, arr);    },
    writePackedDouble:   function(tag, arr) { this.writeMessage(tag, writePackedDouble, arr);   },
    writePackedFixed32:  function(tag, arr) { this.writeMessage(tag, writePackedFixed32, arr);  },
    writePackedSFixed32: function(tag, arr) { this.writeMessage(tag, writePackedSFixed32, arr); },
    writePackedFixed64:  function(tag, arr) { this.writeMessage(tag, writePackedFixed64, arr);  },
    writePackedSFixed64: function(tag, arr) { this.writeMessage(tag, writePackedSFixed64, arr); },

    writeBytesField: function(tag, buffer) {
        this.writeTag(tag, Pbf.Bytes);
        this.writeBytes(buffer);
    },
    writeFixed32Field: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed32);
        this.writeFixed32(val);
    },
    writeSFixed32Field: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed32);
        this.writeSFixed32(val);
    },
    writeFixed64Field: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed64);
        this.writeFixed64(val);
    },
    writeSFixed64Field: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed64);
        this.writeSFixed64(val);
    },
    writeVarintField: function(tag, val) {
        this.writeTag(tag, Pbf.Varint);
        this.writeVarint(val);
    },
    writeSVarintField: function(tag, val) {
        this.writeTag(tag, Pbf.Varint);
        this.writeSVarint(val);
    },
    writeStringField: function(tag, str) {
        this.writeTag(tag, Pbf.Bytes);
        this.writeString(str);
    },
    writeFloatField: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed32);
        this.writeFloat(val);
    },
    writeDoubleField: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed64);
        this.writeDouble(val);
    },
    writeBooleanField: function(tag, val) {
        this.writeVarintField(tag, Boolean(val));
    }
};

function readVarintRemainder(l, s, p) {
    var buf = p.buf,
        h, b;

    b = buf[p.pos++]; h  = (b & 0x70) >> 4;  if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 3;  if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 10; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 17; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 24; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x01) << 31; if (b < 0x80) return toNum(l, h, s);

    throw new Error('Expected varint not more than 10 bytes');
}

function readPackedEnd(pbf) {
    return pbf.type === Pbf.Bytes ?
        pbf.readVarint() + pbf.pos : pbf.pos + 1;
}

function toNum(low, high, isSigned) {
    if (isSigned) {
        return high * 0x100000000 + (low >>> 0);
    }

    return ((high >>> 0) * 0x100000000) + (low >>> 0);
}

function writeBigVarint(val, pbf) {
    var low, high;

    if (val >= 0) {
        low  = (val % 0x100000000) | 0;
        high = (val / 0x100000000) | 0;
    } else {
        low  = ~(-val % 0x100000000);
        high = ~(-val / 0x100000000);

        if (low ^ 0xffffffff) {
            low = (low + 1) | 0;
        } else {
            low = 0;
            high = (high + 1) | 0;
        }
    }

    if (val >= 0x10000000000000000 || val < -0x10000000000000000) {
        throw new Error('Given varint doesn\'t fit into 10 bytes');
    }

    pbf.realloc(10);

    writeBigVarintLow(low, high, pbf);
    writeBigVarintHigh(high, pbf);
}

function writeBigVarintLow(low, high, pbf) {
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos]   = low & 0x7f;
}

function writeBigVarintHigh(high, pbf) {
    var lsb = (high & 0x07) << 4;

    pbf.buf[pbf.pos++] |= lsb         | ((high >>>= 3) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f;
}

function makeRoomForExtraLength(startPos, len, pbf) {
    var extraLen =
        len <= 0x3fff ? 1 :
        len <= 0x1fffff ? 2 :
        len <= 0xfffffff ? 3 : Math.ceil(Math.log(len) / (Math.LN2 * 7));

    // if 1 byte isn't enough for encoding message length, shift the data to the right
    pbf.realloc(extraLen);
    for (var i = pbf.pos - 1; i >= startPos; i--) pbf.buf[i + extraLen] = pbf.buf[i];
}

function writePackedVarint(arr, pbf)   { for (var i = 0; i < arr.length; i++) pbf.writeVarint(arr[i]);   }
function writePackedSVarint(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeSVarint(arr[i]);  }
function writePackedFloat(arr, pbf)    { for (var i = 0; i < arr.length; i++) pbf.writeFloat(arr[i]);    }
function writePackedDouble(arr, pbf)   { for (var i = 0; i < arr.length; i++) pbf.writeDouble(arr[i]);   }
function writePackedBoolean(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeBoolean(arr[i]);  }
function writePackedFixed32(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeFixed32(arr[i]);  }
function writePackedSFixed32(arr, pbf) { for (var i = 0; i < arr.length; i++) pbf.writeSFixed32(arr[i]); }
function writePackedFixed64(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeFixed64(arr[i]);  }
function writePackedSFixed64(arr, pbf) { for (var i = 0; i < arr.length; i++) pbf.writeSFixed64(arr[i]); }

// Buffer code below from https://github.com/feross/buffer, MIT-licensed

function readUInt32(buf, pos) {
    return ((buf[pos]) |
        (buf[pos + 1] << 8) |
        (buf[pos + 2] << 16)) +
        (buf[pos + 3] * 0x1000000);
}

function writeInt32(buf, val, pos) {
    buf[pos] = val;
    buf[pos + 1] = (val >>> 8);
    buf[pos + 2] = (val >>> 16);
    buf[pos + 3] = (val >>> 24);
}

function readInt32(buf, pos) {
    return ((buf[pos]) |
        (buf[pos + 1] << 8) |
        (buf[pos + 2] << 16)) +
        (buf[pos + 3] << 24);
}

function readUtf8(buf, pos, end) {
    var str = '';
    var i = pos;

    while (i < end) {
        var b0 = buf[i];
        var c = null; // codepoint
        var bytesPerSequence =
            b0 > 0xEF ? 4 :
            b0 > 0xDF ? 3 :
            b0 > 0xBF ? 2 : 1;

        if (i + bytesPerSequence > end) break;

        var b1, b2, b3;

        if (bytesPerSequence === 1) {
            if (b0 < 0x80) {
                c = b0;
            }
        } else if (bytesPerSequence === 2) {
            b1 = buf[i + 1];
            if ((b1 & 0xC0) === 0x80) {
                c = (b0 & 0x1F) << 0x6 | (b1 & 0x3F);
                if (c <= 0x7F) {
                    c = null;
                }
            }
        } else if (bytesPerSequence === 3) {
            b1 = buf[i + 1];
            b2 = buf[i + 2];
            if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80) {
                c = (b0 & 0xF) << 0xC | (b1 & 0x3F) << 0x6 | (b2 & 0x3F);
                if (c <= 0x7FF || (c >= 0xD800 && c <= 0xDFFF)) {
                    c = null;
                }
            }
        } else if (bytesPerSequence === 4) {
            b1 = buf[i + 1];
            b2 = buf[i + 2];
            b3 = buf[i + 3];
            if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80) {
                c = (b0 & 0xF) << 0x12 | (b1 & 0x3F) << 0xC | (b2 & 0x3F) << 0x6 | (b3 & 0x3F);
                if (c <= 0xFFFF || c >= 0x110000) {
                    c = null;
                }
            }
        }

        if (c === null) {
            c = 0xFFFD;
            bytesPerSequence = 1;

        } else if (c > 0xFFFF) {
            c -= 0x10000;
            str += String.fromCharCode(c >>> 10 & 0x3FF | 0xD800);
            c = 0xDC00 | c & 0x3FF;
        }

        str += String.fromCharCode(c);
        i += bytesPerSequence;
    }

    return str;
}

function writeUtf8(buf, str, pos) {
    for (var i = 0, c, lead; i < str.length; i++) {
        c = str.charCodeAt(i); // code point

        if (c > 0xD7FF && c < 0xE000) {
            if (lead) {
                if (c < 0xDC00) {
                    buf[pos++] = 0xEF;
                    buf[pos++] = 0xBF;
                    buf[pos++] = 0xBD;
                    lead = c;
                    continue;
                } else {
                    c = lead - 0xD800 << 10 | c - 0xDC00 | 0x10000;
                    lead = null;
                }
            } else {
                if (c > 0xDBFF || (i + 1 === str.length)) {
                    buf[pos++] = 0xEF;
                    buf[pos++] = 0xBF;
                    buf[pos++] = 0xBD;
                } else {
                    lead = c;
                }
                continue;
            }
        } else if (lead) {
            buf[pos++] = 0xEF;
            buf[pos++] = 0xBF;
            buf[pos++] = 0xBD;
            lead = null;
        }

        if (c < 0x80) {
            buf[pos++] = c;
        } else {
            if (c < 0x800) {
                buf[pos++] = c >> 0x6 | 0xC0;
            } else {
                if (c < 0x10000) {
                    buf[pos++] = c >> 0xC | 0xE0;
                } else {
                    buf[pos++] = c >> 0x12 | 0xF0;
                    buf[pos++] = c >> 0xC & 0x3F | 0x80;
                }
                buf[pos++] = c >> 0x6 & 0x3F | 0x80;
            }
            buf[pos++] = c & 0x3F | 0x80;
        }
    }
    return pos;
}

},{"ieee754":10}],12:[function(require,module,exports){
'use strict';

module.exports = partialSort;

// Floyd-Rivest selection algorithm:
// Rearrange items so that all items in the [left, k] range are smaller than all items in (k, right];
// The k-th element will have the (k - left + 1)th smallest value in [left, right]

function partialSort(arr, k, left, right, compare) {
    left = left || 0;
    right = right || (arr.length - 1);
    compare = compare || defaultCompare;

    while (right > left) {
        if (right - left > 600) {
            var n = right - left + 1;
            var m = k - left + 1;
            var z = Math.log(n);
            var s = 0.5 * Math.exp(2 * z / 3);
            var sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (m - n / 2 < 0 ? -1 : 1);
            var newLeft = Math.max(left, Math.floor(k - m * s / n + sd));
            var newRight = Math.min(right, Math.floor(k + (n - m) * s / n + sd));
            partialSort(arr, k, newLeft, newRight, compare);
        }

        var t = arr[k];
        var i = left;
        var j = right;

        swap(arr, left, k);
        if (compare(arr[right], t) > 0) swap(arr, left, right);

        while (i < j) {
            swap(arr, i, j);
            i++;
            j--;
            while (compare(arr[i], t) < 0) i++;
            while (compare(arr[j], t) > 0) j--;
        }

        if (compare(arr[left], t) === 0) swap(arr, left, j);
        else {
            j++;
            swap(arr, j, right);
        }

        if (j <= k) left = j + 1;
        if (k <= j) right = j - 1;
    }
}

function swap(arr, i, j) {
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
}

function defaultCompare(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

},{}],13:[function(require,module,exports){
'use strict';

module.exports = rbush;

var quickselect = require('quickselect');

function rbush(maxEntries, format) {
    if (!(this instanceof rbush)) return new rbush(maxEntries, format);

    // max entries in a node is 9 by default; min node fill is 40% for best performance
    this._maxEntries = Math.max(4, maxEntries || 9);
    this._minEntries = Math.max(2, Math.ceil(this._maxEntries * 0.4));

    if (format) {
        this._initFormat(format);
    }

    this.clear();
}

rbush.prototype = {

    all: function () {
        return this._all(this.data, []);
    },

    search: function (bbox) {

        var node = this.data,
            result = [],
            toBBox = this.toBBox;

        if (!intersects(bbox, node)) return result;

        var nodesToSearch = [],
            i, len, child, childBBox;

        while (node) {
            for (i = 0, len = node.children.length; i < len; i++) {

                child = node.children[i];
                childBBox = node.leaf ? toBBox(child) : child;

                if (intersects(bbox, childBBox)) {
                    if (node.leaf) result.push(child);
                    else if (contains(bbox, childBBox)) this._all(child, result);
                    else nodesToSearch.push(child);
                }
            }
            node = nodesToSearch.pop();
        }

        return result;
    },

    collides: function (bbox) {

        var node = this.data,
            toBBox = this.toBBox;

        if (!intersects(bbox, node)) return false;

        var nodesToSearch = [],
            i, len, child, childBBox;

        while (node) {
            for (i = 0, len = node.children.length; i < len; i++) {

                child = node.children[i];
                childBBox = node.leaf ? toBBox(child) : child;

                if (intersects(bbox, childBBox)) {
                    if (node.leaf || contains(bbox, childBBox)) return true;
                    nodesToSearch.push(child);
                }
            }
            node = nodesToSearch.pop();
        }

        return false;
    },

    load: function (data) {
        if (!(data && data.length)) return this;

        if (data.length < this._minEntries) {
            for (var i = 0, len = data.length; i < len; i++) {
                this.insert(data[i]);
            }
            return this;
        }

        // recursively build the tree with the given data from stratch using OMT algorithm
        var node = this._build(data.slice(), 0, data.length - 1, 0);

        if (!this.data.children.length) {
            // save as is if tree is empty
            this.data = node;

        } else if (this.data.height === node.height) {
            // split root if trees have the same height
            this._splitRoot(this.data, node);

        } else {
            if (this.data.height < node.height) {
                // swap trees if inserted one is bigger
                var tmpNode = this.data;
                this.data = node;
                node = tmpNode;
            }

            // insert the small tree into the large tree at appropriate level
            this._insert(node, this.data.height - node.height - 1, true);
        }

        return this;
    },

    insert: function (item) {
        if (item) this._insert(item, this.data.height - 1);
        return this;
    },

    clear: function () {
        this.data = createNode([]);
        return this;
    },

    remove: function (item, equalsFn) {
        if (!item) return this;

        var node = this.data,
            bbox = this.toBBox(item),
            path = [],
            indexes = [],
            i, parent, index, goingUp;

        // depth-first iterative tree traversal
        while (node || path.length) {

            if (!node) { // go up
                node = path.pop();
                parent = path[path.length - 1];
                i = indexes.pop();
                goingUp = true;
            }

            if (node.leaf) { // check current node
                index = findItem(item, node.children, equalsFn);

                if (index !== -1) {
                    // item found, remove the item and condense tree upwards
                    node.children.splice(index, 1);
                    path.push(node);
                    this._condense(path);
                    return this;
                }
            }

            if (!goingUp && !node.leaf && contains(node, bbox)) { // go down
                path.push(node);
                indexes.push(i);
                i = 0;
                parent = node;
                node = node.children[0];

            } else if (parent) { // go right
                i++;
                node = parent.children[i];
                goingUp = false;

            } else node = null; // nothing found
        }

        return this;
    },

    toBBox: function (item) { return item; },

    compareMinX: compareNodeMinX,
    compareMinY: compareNodeMinY,

    toJSON: function () { return this.data; },

    fromJSON: function (data) {
        this.data = data;
        return this;
    },

    _all: function (node, result) {
        var nodesToSearch = [];
        while (node) {
            if (node.leaf) result.push.apply(result, node.children);
            else nodesToSearch.push.apply(nodesToSearch, node.children);

            node = nodesToSearch.pop();
        }
        return result;
    },

    _build: function (items, left, right, height) {

        var N = right - left + 1,
            M = this._maxEntries,
            node;

        if (N <= M) {
            // reached leaf level; return leaf
            node = createNode(items.slice(left, right + 1));
            calcBBox(node, this.toBBox);
            return node;
        }

        if (!height) {
            // target height of the bulk-loaded tree
            height = Math.ceil(Math.log(N) / Math.log(M));

            // target number of root entries to maximize storage utilization
            M = Math.ceil(N / Math.pow(M, height - 1));
        }

        node = createNode([]);
        node.leaf = false;
        node.height = height;

        // split the items into M mostly square tiles

        var N2 = Math.ceil(N / M),
            N1 = N2 * Math.ceil(Math.sqrt(M)),
            i, j, right2, right3;

        multiSelect(items, left, right, N1, this.compareMinX);

        for (i = left; i <= right; i += N1) {

            right2 = Math.min(i + N1 - 1, right);

            multiSelect(items, i, right2, N2, this.compareMinY);

            for (j = i; j <= right2; j += N2) {

                right3 = Math.min(j + N2 - 1, right2);

                // pack each entry recursively
                node.children.push(this._build(items, j, right3, height - 1));
            }
        }

        calcBBox(node, this.toBBox);

        return node;
    },

    _chooseSubtree: function (bbox, node, level, path) {

        var i, len, child, targetNode, area, enlargement, minArea, minEnlargement;

        while (true) {
            path.push(node);

            if (node.leaf || path.length - 1 === level) break;

            minArea = minEnlargement = Infinity;

            for (i = 0, len = node.children.length; i < len; i++) {
                child = node.children[i];
                area = bboxArea(child);
                enlargement = enlargedArea(bbox, child) - area;

                // choose entry with the least area enlargement
                if (enlargement < minEnlargement) {
                    minEnlargement = enlargement;
                    minArea = area < minArea ? area : minArea;
                    targetNode = child;

                } else if (enlargement === minEnlargement) {
                    // otherwise choose one with the smallest area
                    if (area < minArea) {
                        minArea = area;
                        targetNode = child;
                    }
                }
            }

            node = targetNode || node.children[0];
        }

        return node;
    },

    _insert: function (item, level, isNode) {

        var toBBox = this.toBBox,
            bbox = isNode ? item : toBBox(item),
            insertPath = [];

        // find the best node for accommodating the item, saving all nodes along the path too
        var node = this._chooseSubtree(bbox, this.data, level, insertPath);

        // put the item into the node
        node.children.push(item);
        extend(node, bbox);

        // split on node overflow; propagate upwards if necessary
        while (level >= 0) {
            if (insertPath[level].children.length > this._maxEntries) {
                this._split(insertPath, level);
                level--;
            } else break;
        }

        // adjust bboxes along the insertion path
        this._adjustParentBBoxes(bbox, insertPath, level);
    },

    // split overflowed node into two
    _split: function (insertPath, level) {

        var node = insertPath[level],
            M = node.children.length,
            m = this._minEntries;

        this._chooseSplitAxis(node, m, M);

        var splitIndex = this._chooseSplitIndex(node, m, M);

        var newNode = createNode(node.children.splice(splitIndex, node.children.length - splitIndex));
        newNode.height = node.height;
        newNode.leaf = node.leaf;

        calcBBox(node, this.toBBox);
        calcBBox(newNode, this.toBBox);

        if (level) insertPath[level - 1].children.push(newNode);
        else this._splitRoot(node, newNode);
    },

    _splitRoot: function (node, newNode) {
        // split root node
        this.data = createNode([node, newNode]);
        this.data.height = node.height + 1;
        this.data.leaf = false;
        calcBBox(this.data, this.toBBox);
    },

    _chooseSplitIndex: function (node, m, M) {

        var i, bbox1, bbox2, overlap, area, minOverlap, minArea, index;

        minOverlap = minArea = Infinity;

        for (i = m; i <= M - m; i++) {
            bbox1 = distBBox(node, 0, i, this.toBBox);
            bbox2 = distBBox(node, i, M, this.toBBox);

            overlap = intersectionArea(bbox1, bbox2);
            area = bboxArea(bbox1) + bboxArea(bbox2);

            // choose distribution with minimum overlap
            if (overlap < minOverlap) {
                minOverlap = overlap;
                index = i;

                minArea = area < minArea ? area : minArea;

            } else if (overlap === minOverlap) {
                // otherwise choose distribution with minimum area
                if (area < minArea) {
                    minArea = area;
                    index = i;
                }
            }
        }

        return index;
    },

    // sorts node children by the best axis for split
    _chooseSplitAxis: function (node, m, M) {

        var compareMinX = node.leaf ? this.compareMinX : compareNodeMinX,
            compareMinY = node.leaf ? this.compareMinY : compareNodeMinY,
            xMargin = this._allDistMargin(node, m, M, compareMinX),
            yMargin = this._allDistMargin(node, m, M, compareMinY);

        // if total distributions margin value is minimal for x, sort by minX,
        // otherwise it's already sorted by minY
        if (xMargin < yMargin) node.children.sort(compareMinX);
    },

    // total margin of all possible split distributions where each node is at least m full
    _allDistMargin: function (node, m, M, compare) {

        node.children.sort(compare);

        var toBBox = this.toBBox,
            leftBBox = distBBox(node, 0, m, toBBox),
            rightBBox = distBBox(node, M - m, M, toBBox),
            margin = bboxMargin(leftBBox) + bboxMargin(rightBBox),
            i, child;

        for (i = m; i < M - m; i++) {
            child = node.children[i];
            extend(leftBBox, node.leaf ? toBBox(child) : child);
            margin += bboxMargin(leftBBox);
        }

        for (i = M - m - 1; i >= m; i--) {
            child = node.children[i];
            extend(rightBBox, node.leaf ? toBBox(child) : child);
            margin += bboxMargin(rightBBox);
        }

        return margin;
    },

    _adjustParentBBoxes: function (bbox, path, level) {
        // adjust bboxes along the given tree path
        for (var i = level; i >= 0; i--) {
            extend(path[i], bbox);
        }
    },

    _condense: function (path) {
        // go through the path, removing empty nodes and updating bboxes
        for (var i = path.length - 1, siblings; i >= 0; i--) {
            if (path[i].children.length === 0) {
                if (i > 0) {
                    siblings = path[i - 1].children;
                    siblings.splice(siblings.indexOf(path[i]), 1);

                } else this.clear();

            } else calcBBox(path[i], this.toBBox);
        }
    },

    _initFormat: function (format) {
        // data format (minX, minY, maxX, maxY accessors)

        // uses eval-type function compilation instead of just accepting a toBBox function
        // because the algorithms are very sensitive to sorting functions performance,
        // so they should be dead simple and without inner calls

        var compareArr = ['return a', ' - b', ';'];

        this.compareMinX = new Function('a', 'b', compareArr.join(format[0]));
        this.compareMinY = new Function('a', 'b', compareArr.join(format[1]));

        this.toBBox = new Function('a',
            'return {minX: a' + format[0] +
            ', minY: a' + format[1] +
            ', maxX: a' + format[2] +
            ', maxY: a' + format[3] + '};');
    }
};

function findItem(item, items, equalsFn) {
    if (!equalsFn) return items.indexOf(item);

    for (var i = 0; i < items.length; i++) {
        if (equalsFn(item, items[i])) return i;
    }
    return -1;
}

// calculate node's bbox from bboxes of its children
function calcBBox(node, toBBox) {
    distBBox(node, 0, node.children.length, toBBox, node);
}

// min bounding rectangle of node children from k to p-1
function distBBox(node, k, p, toBBox, destNode) {
    if (!destNode) destNode = createNode(null);
    destNode.minX = Infinity;
    destNode.minY = Infinity;
    destNode.maxX = -Infinity;
    destNode.maxY = -Infinity;

    for (var i = k, child; i < p; i++) {
        child = node.children[i];
        extend(destNode, node.leaf ? toBBox(child) : child);
    }

    return destNode;
}

function extend(a, b) {
    a.minX = Math.min(a.minX, b.minX);
    a.minY = Math.min(a.minY, b.minY);
    a.maxX = Math.max(a.maxX, b.maxX);
    a.maxY = Math.max(a.maxY, b.maxY);
    return a;
}

function compareNodeMinX(a, b) { return a.minX - b.minX; }
function compareNodeMinY(a, b) { return a.minY - b.minY; }

function bboxArea(a)   { return (a.maxX - a.minX) * (a.maxY - a.minY); }
function bboxMargin(a) { return (a.maxX - a.minX) + (a.maxY - a.minY); }

function enlargedArea(a, b) {
    return (Math.max(b.maxX, a.maxX) - Math.min(b.minX, a.minX)) *
           (Math.max(b.maxY, a.maxY) - Math.min(b.minY, a.minY));
}

function intersectionArea(a, b) {
    var minX = Math.max(a.minX, b.minX),
        minY = Math.max(a.minY, b.minY),
        maxX = Math.min(a.maxX, b.maxX),
        maxY = Math.min(a.maxY, b.maxY);

    return Math.max(0, maxX - minX) *
           Math.max(0, maxY - minY);
}

function contains(a, b) {
    return a.minX <= b.minX &&
           a.minY <= b.minY &&
           b.maxX <= a.maxX &&
           b.maxY <= a.maxY;
}

function intersects(a, b) {
    return b.minX <= a.maxX &&
           b.minY <= a.maxY &&
           b.maxX >= a.minX &&
           b.maxY >= a.minY;
}

function createNode(children) {
    return {
        children: children,
        height: 1,
        leaf: true,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };
}

// sort an array so that items come in groups of n unsorted items, with groups sorted between each other;
// combines selection algorithm with binary divide & conquer approach

function multiSelect(arr, left, right, n, compare) {
    var stack = [left, right],
        mid;

    while (stack.length) {
        right = stack.pop();
        left = stack.pop();

        if (right - left <= n) continue;

        mid = left + Math.ceil((right - left) / n / 2) * n;
        quickselect(arr, mid, left, right, compare);

        stack.push(left, mid, mid, right);
    }
}

},{"quickselect":12}],14:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _rbush = require('rbush');

var _rbush2 = _interopRequireDefault(_rbush);

var _bbox3 = require('@turf/bbox');

var _bbox4 = _interopRequireDefault(_bbox3);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * A tile object
 *
 * @class Tile
 * @private
 */
var Tile = function () {
  function Tile(x, y, z) {
    _classCallCheck(this, Tile);

    this.x = x;
    this.y = y;
    this.z = z;
    this.features = {};

    this.loaded = false;

    this.index = (0, _rbush2.default)();
    this.featureGroup = L.featureGroup();
  }

  /**
   * Call this method when all features have been added to the tile
   *
   * @returns {Tile} this
   */


  _createClass(Tile, [{
    key: 'init',
    value: function init() {
      this.indexFeatures();
      this.render();
      return this;
    }

    /**
     *
     */

  }, {
    key: 'render',
    value: function render() {
      for (var id in this.features) {
        if (!this.features.hasOwnProperty(id)) {
          continue;
        }
        var feature = this.features[id];
        if (feature.onMap) {
          this.featureGroup.addLayer(feature.layer);
        }
      }
    }

    /**
     *
     */

  }, {
    key: 'indexFeatures',
    value: function indexFeatures() {
      var bboxes = [];
      for (var id in this.features) {
        if (!this.features.hasOwnProperty(id)) {
          continue;
        }
        var feature = this.features[id];
        var geom = feature.geojson.geometry;
        var c = geom.coordinates;

        var minX = void 0;
        var minY = void 0;
        var maxX = void 0;
        var maxY = void 0;

        if (geom.type === 'Point') {
          minX = c[0];
          maxX = c[0];
          minY = c[1];
          maxY = c[1];
        } else {
          var _bbox = (0, _bbox4.default)(geom);

          var _bbox2 = _slicedToArray(_bbox, 4);

          minX = _bbox2[0];
          minY = _bbox2[1];
          maxX = _bbox2[2];
          maxY = _bbox2[3];
        }

        var item = {
          minX: minX,
          minY: minY,
          maxX: maxX,
          maxY: maxY,
          id: feature.id
        };

        feature.indexEntry = item;

        bboxes.push(item);
      }

      this.index.load(bboxes);
    }

    /**
     * @param {string} id
     * @returns {boolean} true is this tile contains a feature with the given id
     */

  }, {
    key: 'contains',
    value: function contains(id) {
      return id in this.features;
    }

    /**
     * @param {Feature} feature
     * @returns {Tile} this
     */

  }, {
    key: 'addFeature',
    value: function addFeature(feature) {
      this.features[feature.id] = feature;
      return this;
    }

    /**
     * @param {string} id
     * @returns {Tile} this
     */

  }, {
    key: 'removeFeature',
    value: function removeFeature(id) {
      if (!this.contains(id)) {
        return this;
      }
      var feature = this.getFeature(id);
      this.featureGroup.removeLayer(feature.layer);
      this.index.remove(feature.indexEntry);
      delete this.features[id];
      return this;
    }

    /**
     * @param {string} id
     * @returns {Feature}
     */

  }, {
    key: 'getFeature',
    value: function getFeature(id) {
      return this.features[id];
    }

    /**
     * @param {number} minX
     * @param {number} minY
     * @param {number} maxX
     * @param {number} maxY
     * @returns {Array<String>} an array of feature ids of features that intersect
     * the bounding box
     */

  }, {
    key: 'search',
    value: function search(minX, minY, maxX, maxY) {
      return this.index.search({ minX: minX, minY: minY, maxX: maxX, maxY: maxY }).map(function (r) {
        return r.id;
      });
    }

    /**
     *
     * @returns {Tile} this
     */

  }, {
    key: 'markAsLoaded',
    value: function markAsLoaded() {
      this.loaded = true;
      return this;
    }

    /**
     * @param {string} property
     * @param {string} value
     * @param {boolean} on
     * @param {boolead} toggled
     * @returns {Tile} this
     */

  }, {
    key: 'toggleByProperty',
    value: function toggleByProperty(property, value, on, toggled) {
      var feature = void 0;
      var geoj = void 0;
      for (var id in this.features) {
        if (!this.features.hasOwnProperty(id)) {
          continue;
        }
        feature = this.getFeature(id);
        geoj = feature.geojson;
        if (property in geoj.properties && geoj.properties[property] === value) {
          if (toggled) {
            if (on) {
              this.index.insert(feature.indexEntry);
              this.featureGroup.addLayer(feature.layer);
            } else {
              this.index.remove(feature.indexEntry);
              this.featureGroup.removeLayer(feature.layer);
            }
          }
        }
      }
      return this;
    }

    /**
     * @param {string} property
     * @param {string} value
     * @param {Object} style
     * @returns {Tile} this
     */

  }, {
    key: 'restyleByProperty',
    value: function restyleByProperty(property, value, style) {
      var feature = void 0;
      for (var id in this.features) {
        if (!this.features.hasOwnProperty(id)) {
          continue;
        }
        feature = this.getFeature(id);
        if (property in feature.geojson.properties && feature.geojson.properties[property] === value) {
          feature.layer.setStyle(style);
        }
      }
      return this;
    }
  }]);

  return Tile;
}();

exports.default = Tile;

},{"@turf/bbox":8,"rbush":13}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJMZWFmbGV0LlZlY3RvclRpbGVzLmpzIiwiZmVhdHVyZS5qcyIsIm5vZGVfbW9kdWxlcy9AbWFwYm94L3BvaW50LWdlb21ldHJ5L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL0BtYXBib3gvdmVjdG9yLXRpbGUvaW5kZXguanMiLCJub2RlX21vZHVsZXMvQG1hcGJveC92ZWN0b3ItdGlsZS9saWIvdmVjdG9ydGlsZS5qcyIsIm5vZGVfbW9kdWxlcy9AbWFwYm94L3ZlY3Rvci10aWxlL2xpYi92ZWN0b3J0aWxlZmVhdHVyZS5qcyIsIm5vZGVfbW9kdWxlcy9AbWFwYm94L3ZlY3Rvci10aWxlL2xpYi92ZWN0b3J0aWxlbGF5ZXIuanMiLCJub2RlX21vZHVsZXMvQHR1cmYvYmJveC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9AdHVyZi9tZXRhL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2llZWU3NTQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvcGJmL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3F1aWNrc2VsZWN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3JidXNoL2luZGV4LmpzIiwidGlsZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O0FDQUE7Ozs7QUFDQTs7OztBQUNBOztBQUNBOzs7Ozs7QUFFQTs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQW1CQSxFQUFFLFdBQUYsR0FBZ0IsRUFBRSxTQUFGLENBQVksTUFBWixDQUFtQjs7QUFFakMsU0FBTyxFQUYwQjs7QUFJakM7Ozs7Ozs7Ozs7QUFVQSxZQWRpQyxzQkFjdEIsR0Fkc0IsRUFjakIsT0FkaUIsRUFjUjtBQUFBOztBQUN2QixNQUFFLElBQUYsQ0FBTyxVQUFQLENBQWtCLE9BQWxCO0FBQ0EsTUFBRSxTQUFGLENBQVksU0FBWixDQUFzQixVQUF0QixDQUFpQyxJQUFqQyxDQUFzQyxJQUF0QyxFQUE0QyxPQUE1Qzs7QUFF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QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFRBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdnpCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMW1CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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TCxFQUF1QztBQUNyQztBQUNEO0FBQ0Qsa0JBQVUsS0FBSyxVQUFMLENBQWdCLEVBQWhCLENBQVY7QUFDQSxlQUFPLFFBQVEsT0FBZjtBQUNBLFlBQUksWUFBWSxLQUFLLFVBQWpCLElBQStCLEtBQUssVUFBTCxDQUFnQixRQUFoQixNQUE4QixLQUFqRSxFQUF3RTtBQUN0RSxjQUFJLE9BQUosRUFBYTtBQUNYLGdCQUFJLEVBQUosRUFBUTtBQUNOLG1CQUFLLEtBQUwsQ0FBVyxNQUFYLENBQWtCLFFBQVEsVUFBMUI7QUFDQSxtQkFBSyxZQUFMLENBQWtCLFFBQWxCLENBQTJCLFFBQVEsS0FBbkM7QUFDRCxhQUhELE1BR087QUFDTCxtQkFBSyxLQUFMLENBQVcsTUFBWCxDQUFrQixRQUFRLFVBQTFCO0FBQ0EsbUJBQUssWUFBTCxDQUFrQixXQUFsQixDQUE4QixRQUFRLEtBQXRDO0FBQ0Q7QUFDRjtBQUNGO0FBQ0Y7QUFDRCxhQUFPLElBQVA7QUFDRDs7QUFFRDs7Ozs7Ozs7O3NDQU1rQixRLEVBQVUsSyxFQUFPLEssRUFBTztBQUN4QyxVQUFJLGdCQUFKO0FBQ0EsV0FBSyxJQUFNLEVBQVgsSUFBaUIsS0FBSyxRQUF0QixFQUFnQztBQUM5QixZQUFJLENBQUMsS0FBSyxRQUFMLENBQWMsY0FBZCxDQUE2QixFQUE3QixDQUFMLEVBQXVDO0FBQ3JDO0FBQ0Q7QUFDRCxrQkFBVSxLQUFLLFVBQUwsQ0FBZ0IsRUFBaEIsQ0FBVjtBQUNBLFlBQUksWUFBWSxRQUFRLE9BQVIsQ0FBZ0IsVUFBNUIsSUFDRyxRQUFRLE9BQVIsQ0FBZ0IsVUFBaEIsQ0FBMkIsUUFBM0IsTUFBeUMsS0FEaEQsRUFDdUQ7QUFDckQsa0JBQVEsS0FBUixDQUFjLFFBQWQsQ0FBdUIsS0FBdkI7QUFDRDtBQUNGO0FBQ0QsYUFBTyxJQUFQO0FBQ0Q7Ozs7OztrQkFqTWtCLEkiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiaW1wb3J0IFRpbGUgZnJvbSAnLi90aWxlJztcbmltcG9ydCBGZWF0dXJlIGZyb20gJy4vZmVhdHVyZSc7XG5pbXBvcnQgeyBWZWN0b3JUaWxlIH0gZnJvbSAnQG1hcGJveC92ZWN0b3ItdGlsZSc7XG5pbXBvcnQgUGJmIGZyb20gJ3BiZic7XG5cbi8qKlxuICogTWFuYWdlcyBpbnRlcmFjdGl2ZSB0aWxlcyBvZiBkYXRhXG4gKlxuICogQGNsYXNzIFZlY3RvclRpbGVzXG4gKiBAZXh0ZW5kcyBHcmlkTGF5ZXJcbiAqXG4gKiBAZXhhbXBsZVxuICogdmFyIHZ0TGF5ZXIgPSBuZXcgTC5WZWN0b3JUaWxlcygnaHR0cDovL215dGlsZXMuY29tL3t6fS97eH0ve3l9LnBiZicsIHtcbiAqICAgZGVidWc6IHRydWUsXG4gKiAgIHN0eWxlOiB7XG4gKiAgICAgcHJvcGVydHk6IHtcbiAqICAgICAgIHZhbHVlOiB7XG4gKiAgICAgICAgIGNvbG9yOiAncmVkJ1xuICogICAgICAgfVxuICogICAgIH1cbiAqICAgfVxuICogfSkuYWRkVG8obWFwKTtcbiAqL1xuXG5MLlZlY3RvclRpbGVzID0gTC5HcmlkTGF5ZXIuZXh0ZW5kKHtcblxuICBzdHlsZToge30sXG5cbiAgLyoqXG4gICAqIENvbnN0cnVjdG9yXG4gICAqXG4gICAqIEBjb25zdHJ1Y3RzXG4gICAqIEBwYXJhbSB7c3RyaW5nfSB1cmwgVGhlIHRlbXBsYXRlIHVybCBmb3IgZmVjdGNoaW5nIHZlY3RvciB0aWxlc1xuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb3B0aW9ucy5nZXRGZWF0dXJlSWRdXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMuZGVidWddXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9ucy5zdHlsZV1cbiAgICovXG4gIGluaXRpYWxpemUodXJsLCBvcHRpb25zKSB7XG4gICAgTC5VdGlsLnNldE9wdGlvbnMob3B0aW9ucyk7XG4gICAgTC5HcmlkTGF5ZXIucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBvcHRpb25zKTtcblxuICAgIHRoaXMuX3VybCA9IHVybDtcblxuICAgIC8vIHRoZSBGZWF0dXJlR3JvdXAgdGhhdCBob2xkcyBwZXIgdGlsZSBGZWF0dXJlR3JvdXBzXG4gICAgdGhpcy5fZmVhdHVyZUdyb3VwID0gTC5mZWF0dXJlR3JvdXAoKTtcblxuICAgIC8vIHNob3cgdGlsZSBib3VuZGFyaWVzXG4gICAgdGhpcy5fZGVidWcgPSBvcHRpb25zLmRlYnVnO1xuXG4gICAgdGhpcy5fdmVjdG9yVGlsZXMgPSB7fTtcblxuICAgIC8vIHByb3BlcnR5IGJhc2VkIHN0eWxlIG1vZGlmaWNhdGlvbnNcbiAgICAvLyBmb3IgaGlnaGxpZ2h0aW5nIGFuZCBqdW5rXG4gICAgLy8gdGhpcy5fcHJvcGVydHlTdHlsZXMgPSB7XG4gICAgLy8gICBwcm9wZXJ0eU5hbWU6IHtcbiAgICAvLyAgICAgdmFsdWUxOiB7IEwuUGF0aCBzdHlsZSBvcHRpb25zIH1cbiAgICAvLyAgIH1cbiAgICAvLyB9XG4gICAgdGhpcy5fcHJvcGVydHlTdHlsZXMgPSB7fTtcblxuICAgIC8vIHByb3BlcnR5IGJhc2VkIHRvZ2dsaW5nXG4gICAgdGhpcy5fcHJvcGVydHlPbk1hcCA9IHt9O1xuXG4gICAgLy8gdHJhY2sgaW5kaXZpZHVhbCBmZWF0dXJlIHN0eWxlIG1vZGlmaWNhdGlvbnNcbiAgICB0aGlzLl9mZWF0dXJlU3R5bGVzID0ge307XG5cbiAgICAvLyBtYXJrIGluZGl2aWR1YWwgZmVhdHVyZXMgYXMgb24gb3Igb2ZmIHRoZSBtYXBcbiAgICB0aGlzLl9mZWF0dXJlT25NYXAgPSB7fTtcblxuICAgIC8vIG1hcmsgYSB0aWxlIGZvciBkZXN0cnVjdGlvbiBpbiBjYXNlIGl0IGlzIHVubG9hZGVkIGJlZm9yZSBpdCBsb2Fkc1xuICAgIHRoaXMuX3RvRGVzdHJveSA9IHt9O1xuXG4gICAgLy8gbWFyayBhIHRpbGUgYXMgbG9hZGVkXG4gICAgLy8gdGhpcyBpcyBuZWVkZWQgYmVjYXVzZSBpZiBhIHRpbGUgaXMgdW5sb2FkZWQgYmVmb3JlIGl0cyBmaW5pc2hlZCBsb2FkaW5nXG4gICAgLy8gd2UgbmVlZCB0byB3YWl0IGZvciBpdCB0byBmaW5pc2ggbG9hZGluZyBiZWZvcmUgd2UgY2FuIGNsZWFuIHVwXG4gICAgdGhpcy5vbigndnRfdGlsZWxvYWQnLCAoZSkgPT4ge1xuICAgICAgY29uc3QgdGlsZUtleSA9IHRoaXMuX3RpbGVDb29yZHNUb0tleShlLmNvb3Jkcyk7XG4gICAgICBpZiAodGhpcy5fdG9EZXN0cm95W3RpbGVLZXldKSB7XG4gICAgICAgIHRoaXMuZGVzdHJveVRpbGUoZS5jb29yZHMpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gbGlzdGVuIGZvciB0aWxldW5sb2FkIGV2ZW50IGFuZCBjbGVhbiB1cCBvbGQgZmVhdHVyZXNcbiAgICB0aGlzLm9uKCd0aWxldW5sb2FkJywgKGUpID0+IHtcbiAgICAgIC8vIExlYWZsZXQgd2lsbCBub3QgY2FsbCBjcmVhdGVUaWxlIGZvciB0aWxlcyB3aXRoIG5lZ2F0aXZlXG4gICAgICAvLyBjb29yZGluYXRlcyBidXQgaXQgd2lsbCBmaXJlIHVubG9hZCBvbiB0aGVtIHNvXG4gICAgICAvLyBpZ25vcmUgdGhvc2UgZXZlbnRzXG4gICAgICBpZiAoZS5jb29yZHMueCA8IDAgfHwgZS5jb29yZHMueSA8IDAgfHwgZS5jb29yZHMueiA8IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB0aWxlS2V5ID0gdGhpcy5fdGlsZUNvb3Jkc1RvS2V5KGUuY29vcmRzKTtcblxuICAgICAgLy8gaWYgdGhlIHRpbGUgaGFzbid0IGxvYWRlZCB5ZXQsIG1hcmsgaXQgZm9yIGRlbGV0aW9uIGZvciB3aGVuIGl0XG4gICAgICAvLyBpcyBmaW5pc2hlZCBsb2FkaW5nXG4gICAgICBpZiAoISh0aWxlS2V5IGluIHRoaXMuX3ZlY3RvclRpbGVzKSB8fCAhdGhpcy5fdmVjdG9yVGlsZXNbdGlsZUtleV0ubG9hZGVkKSB7XG4gICAgICAgIC8vIGludmFsaWRhdGUgdGhlIHRpbGUgc28gdGhhdCBpdCBpcyBkZWxldGVkIHdoZW4gaXRzIGRvbmUgbG9hZGluZ1xuICAgICAgICB0aGlzLl90b0Rlc3Ryb3lbdGlsZUtleV0gPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gZGVzdHJveSBpdCBpbW1lZGlhdGVseVxuICAgICAgICB0aGlzLmRlc3Ryb3lUaWxlKGUuY29vcmRzKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcblxuICBvbkFkZChtYXApIHtcbiAgICBMLkdyaWRMYXllci5wcm90b3R5cGUub25BZGQuY2FsbCh0aGlzLCBtYXApO1xuICAgIHRoaXMuX21hcCA9IG1hcDtcbiAgICB0aGlzLl9mZWF0dXJlR3JvdXAuYWRkVG8odGhpcy5fbWFwKTtcbiAgfSxcblxuICAvKipcbiAgICogUmV0dXJucyBhbiBhcnJheSBvZiBmZWF0dXJlIGlkcyBuZWFyIGEgZ2l2ZW4gcG9pbnRcbiAgICpcbiAgICogQHBhcmFtIHtMLkxhdExuZ30gbWluXG4gICAqIEBwYXJhbSB7TC5MYXRMbmd9IG1heFxuICAgKiBAcmV0dXJucyB7QXJyYXk8c3RyaW5nPn1cbiAgICovXG4gIHNlYXJjaChtaW4sIG1heCkge1xuICAgIGlmICghdGhpcy5fbWFwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ZlY3RvciB0aWxlIGxheWVyIG5vdCBhZGRlZCB0byB0aGUgbWFwLicpO1xuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdHMgPSBuZXcgU2V0KCk7XG4gICAgY29uc3QgbWluWCA9IG1pbi5sbmc7XG4gICAgY29uc3QgbWluWSA9IG1pbi5sYXQ7XG4gICAgY29uc3QgbWF4WCA9IG1heC5sbmc7XG4gICAgY29uc3QgbWF4WSA9IG1heC5sYXQ7XG5cbiAgICBmb3IgKGNvbnN0IHRpbGVLZXkgaW4gdGhpcy5fdmVjdG9yVGlsZXMpIHtcbiAgICAgIGlmICghdGhpcy5fdmVjdG9yVGlsZXMuaGFzT3duUHJvcGVydHkodGlsZUtleSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IHJlc3VsdCBvZiB0aGlzLl92ZWN0b3JUaWxlc1t0aWxlS2V5XS5zZWFyY2gobWluWCwgbWluWSwgbWF4WCwgbWF4WSkpIHtcbiAgICAgICAgcmVzdWx0cy5hZGQocmVzdWx0KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gQXJyYXkuZnJvbShyZXN1bHRzKTtcbiAgfSxcblxuICAvKipcbiAgICogVGhpcyBtZXRob2Q6XG4gICAqICAgLSBmZXRjaGVzIHRoZSBkYXRhIGZvciB0aGUgdGlsZVxuICAgKiAgIC0gYWRkcyBhbGwgb2YgaXRzIGZlYXR1cmVzIHRvIHRoZSBtYXBcbiAgICogICAtIGFkZHMgaXRzIGZlYXR1cmVzIHRvIHRoZSBpbnRlcm5hbCBkYXRhIHN0cnVjdHVyZVxuICAgKiAgIC0gaW5zZXJ0cyBpdHMgZmVhdHVyZXMgaW50byB0aGUgYSBzcGF0aWFsIHRyZWVcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IGNvb3Jkc1xuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBkb25lXG4gICAqIEBmaXJlcyB2dF90aWxlbG9hZFxuICAgKiBAcmV0dXJucyBET00gZWxlbWVudFxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgY3JlYXRlVGlsZShjb29yZHMsIGRvbmUpIHtcbiAgICBjb25zdCB0aWxlID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgJ2xlYWZsZXQtdGlsZScpO1xuICAgIGlmICh0aGlzLm9wdGlvbnMuZGVidWcpIHtcbiAgICAgIC8vIHNob3cgdGlsZSBib3VuZGFyaWVzXG4gICAgICB0aWxlLnN0eWxlLm91dGxpbmUgPSAnMXB4IHNvbGlkIHJlZCc7XG4gICAgfVxuICAgIHRoaXMuX2NyZWF0ZVRpbGUoY29vcmRzKTtcbiAgICBkb25lKG51bGwsIHRpbGUpO1xuICAgIHJldHVybiB0aWxlO1xuICB9LFxuXG4gIF9jcmVhdGVUaWxlKGNvb3Jkcykge1xuICAgIGNvbnN0IHRpbGVLZXkgPSB0aGlzLl90aWxlQ29vcmRzVG9LZXkoY29vcmRzKTtcblxuICAgIC8vIHRpbGUgaGFzIGFscmVhZHkgYmVlbiB1bmxvYWRlZFxuICAgIGlmICh0aGlzLl90b0Rlc3Ryb3lbdGlsZUtleV0pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB0aWxlID0gbmV3IFRpbGUoY29vcmRzLngsIGNvb3Jkcy55LCBjb29yZHMueik7XG4gICAgdGhpcy5fdmVjdG9yVGlsZXNbdGlsZUtleV0gPSB0aWxlO1xuXG4gICAgLy8gZmV0Y2ggdmVjdG9yIHRpbGUgZGF0YSBmb3IgdGhpcyB0aWxlXG4gICAgY29uc3QgdXJsID0gTC5VdGlsLnRlbXBsYXRlKHRoaXMuX3VybCwgY29vcmRzKTtcbiAgICBmZXRjaCh1cmwpXG4gICAgICAudGhlbihyZXMgPT4gcmVzLmJsb2IoKSlcbiAgICAgIC50aGVuKGJsb2IgPT4ge1xuICAgICAgICBjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIHJlYWRlci5vbmxvYWRlbmQgPSAoKSA9PiB7XG4gICAgICAgICAgICByZXNvbHZlKG5ldyBWZWN0b3JUaWxlKG5ldyBQYmYocmVhZGVyLnJlc3VsdCkpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmVhZGVyLnJlYWRBc0FycmF5QnVmZmVyKGJsb2IpO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbih2dFRpbGUgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IHZ0TGF5ZXJOYW1lIGluIHZ0VGlsZS5sYXllcnMpIHtcbiAgICAgICAgICAvLyBicmVhayBvdXQgaWYgdGhpcyB0aWxlIGhhcyBhbHJlYWR5IGJlIHVubG9hZGVkXG4gICAgICAgICAgaWYgKHRoaXMuX3RvRGVzdHJveVt0aWxlS2V5XSkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHZ0TGF5ZXIgPSB2dFRpbGUubGF5ZXJzW3Z0TGF5ZXJOYW1lXTtcbiAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IHZ0TGF5ZXIubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgIC8vIGJyZWFrIG91dCBpZiB0aGlzIHRpbGUgaGFzIGFscmVhZHkgYmUgdW5sb2FkZWRcbiAgICAgICAgICAgIGlmICh0aGlzLl90b0Rlc3Ryb3lbdGlsZUtleV0pIHtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB2dEZlYXR1cmUgPSB2dExheWVyLmZlYXR1cmUoaik7XG5cbiAgICAgICAgICAgIGNvbnN0IGdlb2pzb24gPSB2dEZlYXR1cmUudG9HZW9KU09OKGNvb3Jkcy54LCBjb29yZHMueSwgY29vcmRzLnopO1xuICAgICAgICAgICAgY29uc3QgaWQgPSB0aGlzLm9wdGlvbnMuZ2V0RmVhdHVyZUlkKGdlb2pzb24pO1xuICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLl9nZW9qc29uVG9MYXllcihnZW9qc29uKTtcbiAgICAgICAgICAgIGlmICghbGF5ZXIpIHtcbiAgICAgICAgICAgICAgLy8gdW5zdXBwb3J0ZWQgZ2VvbWV0cnkgdHlwZVxuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgZmVhdHVyZSA9IG5ldyBGZWF0dXJlKGlkLCBnZW9qc29uLCBsYXllcik7XG5cbiAgICAgICAgICAgIHRpbGUuYWRkRmVhdHVyZShmZWF0dXJlKTtcblxuICAgICAgICAgICAgY29uc3Qgc3R5bGUgPSB7fTtcbiAgICAgICAgICAgIGxldCBvbk1hcCA9IHRydWU7XG4gICAgICAgICAgICBsZXQgcHJvcDtcblxuICAgICAgICAgICAgLy8gcHJvcGVydHkgYmFzZWQgc3R5bGVzXG4gICAgICAgICAgICBmb3IgKHByb3AgaW4gZ2VvanNvbi5wcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICAgIC8vIGFwcGx5IHN0eWxlIGZyb20gb3B0aW9uc1xuICAgICAgICAgICAgICBpZiAocHJvcCBpbiB0aGlzLm9wdGlvbnMuc3R5bGVcbiAgICAgICAgICAgICAgICAgICYmIGdlb2pzb24ucHJvcGVydGllc1twcm9wXSBpbiB0aGlzLm9wdGlvbnMuc3R5bGVbcHJvcF0pIHtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKHN0eWxlLCB0aGlzLm9wdGlvbnMuc3R5bGVbcHJvcF1bZ2VvanNvbi5wcm9wZXJ0aWVzW3Byb3BdXSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyBhcHBseSBzdHlsZSBtb2RpZmljYXRpb25zXG4gICAgICAgICAgICAgIGlmIChwcm9wIGluIHRoaXMuX3Byb3BlcnR5U3R5bGVzXG4gICAgICAgICAgICAgICAgICAmJiBnZW9qc29uLnByb3BlcnRpZXNbcHJvcF0gaW4gdGhpcy5fcHJvcGVydHlTdHlsZXNbcHJvcF0pIHtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKHN0eWxlLCB0aGlzLl9wcm9wZXJ0eVN0eWxlc1twcm9wXVtnZW9qc29uLnByb3BlcnRpZXNbcHJvcF1dKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIC8vIHB1dCBvbiBtYXAgYmFzZWQgb24gcHJvcGVydHlcbiAgICAgICAgICAgICAgaWYgKHByb3AgaW4gdGhpcy5fcHJvcGVydHlPbk1hcFxuICAgICAgICAgICAgICAgICAgJiYgZ2VvanNvbi5wcm9wZXJ0aWVzW3Byb3BdIGluIHRoaXMuX3Byb3BlcnR5T25NYXBbcHJvcF0pIHtcbiAgICAgICAgICAgICAgICBvbk1hcCA9IHRoaXMuX3Byb3BlcnR5T25NYXBbcHJvcF1bZ2VvanNvbi5wcm9wZXJ0aWVzW3Byb3BdXTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBmZWF0dXJlIGJhc2VkIHN0eWxlc1xuICAgICAgICAgICAgaWYgKGlkIGluIHRoaXMuX2ZlYXR1cmVTdHlsZXMpIHtcbiAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihzdHlsZSwgdGhpcy5fZmVhdHVyZVN0eWxlc1tpZF0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmZWF0dXJlLnNldFN0eWxlKHN0eWxlKTtcblxuICAgICAgICAgICAgLy8gZmVhdHVyZSBiYXNlZCBvbiBtYXBcbiAgICAgICAgICAgIGlmIChpZCBpbiB0aGlzLl9mZWF0dXJlT25NYXApIHtcbiAgICAgICAgICAgICAgb25NYXAgPSB0aGlzLl9mZWF0dXJlT25NYXBbaWRdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmZWF0dXJlLnB1dE9uTWFwKG9uTWFwKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuX3RvRGVzdHJveVt0aWxlS2V5XSkge1xuICAgICAgICAgIC8vIGNhbGxlZCB3aGVuIGFsbCBmZWF0dXJlcyBoYXZlIGJlZW4gYWRkZWQgdG8gdGhlIHRpbGVcbiAgICAgICAgICB0aWxlLmluaXQoKTtcblxuICAgICAgICAgIC8vIGFkZCB0aGUgZmVhdHVyZUdyb3VwIG9mIHRoaXMgdGlsZSB0byB0aGUgbWFwXG4gICAgICAgICAgdGlsZS5mZWF0dXJlR3JvdXAuYWRkVG8odGhpcy5fZmVhdHVyZUdyb3VwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG1hcmsgdGlsZSBhcyBsb2FkZWRcbiAgICAgICAgdGlsZS5tYXJrQXNMb2FkZWQoKTtcblxuICAgICAgICAvLyB0aGUgdGlsZSBoYXMgfmFjdHVhbGx5fiBsb2FkZWRcbiAgICAgICAgLy8gdGhlIGB0aWxlbG9hZGAgZXZlbnQgZG9lc24ndCBmaXJlIHdoZW4gYHRpbGV1bmxvYWRgIGZpcmVzIGZpcnN0XG4gICAgICAgIC8vIGJ1dCBpbiBvdXIgY2FzZSB3ZSBzdGlsbCBuZWVkIHRvIGJlIGZpbmlzaGVkIGxvYWRpbmcgdG8gY2xlYW4gdXBcbiAgICAgICAgdGhpcy5maXJlKCd2dF90aWxlbG9hZCcsIHsgY29vcmRzIH0pO1xuICAgICAgfSk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJlbW92ZSB0aGUgZmVhdHVyZXMgb2YgYSB0aWxlIGZyb20gdGhlIG1hcCBhbmQgZGVsZXRlIHRoYXQgdGlsZSdzXG4gICAqIGRhdGEgc3RydWN0dXJlXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBjb29yZHNcbiAgICogQHByaXZhdGVcbiAgICovXG4gIGRlc3Ryb3lUaWxlKGNvb3Jkcykge1xuICAgIGNvbnN0IHRpbGVLZXkgPSB0aGlzLl90aWxlQ29vcmRzVG9LZXkoY29vcmRzKTtcblxuICAgIC8vIHJlbW92ZSB0aGlzIHRpbGUncyBGZWF0dXJlR3JvdXAgZnJvbSB0aGUgbWFwXG4gICAgdGhpcy5fZmVhdHVyZUdyb3VwLnJlbW92ZUxheWVyKHRoaXMuX3ZlY3RvclRpbGVzW3RpbGVLZXldLmZlYXR1cmVHcm91cCk7XG5cbiAgICAvLyBkZWxldGUgdGhlIHRpbGUncyBkYXRhXG4gICAgZGVsZXRlIHRoaXMuX3ZlY3RvclRpbGVzW3RpbGVLZXldO1xuXG4gICAgLy8gcmVtb3ZlIGRlbGV0ZSBtYXJrZXJcbiAgICBpZiAodGhpcy5fdG9EZXN0cm95W3RpbGVLZXldKSB7XG4gICAgICBkZWxldGUgdGhpcy5fdG9EZXN0cm95W3RpbGVLZXldO1xuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogUmVtb3ZlcyBmZWF0dXJlcyBmcm9tIHRoZSBtYXAgYnkgcHJvcGVydHkuXG4gICAqIFdyYXBwZXIgZnVuY3Rpb24gb2YgYF90b2dnbGVCeVByb3BlcnR5YC5cbiAgICogRXF1aXZhbGVudCB0byBgdGhpcy5fdG9nZ2xlQnlQcm9wZXJ0eShwcm9wZXJ0eSwgdmFsdWUsIGZhbHNlKWAuXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBwcm9wZXJ0eVxuICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWVcbiAgICovXG4gIGhpZGVCeVByb3BlcnR5KHByb3BlcnR5LCB2YWx1ZSkge1xuICAgIHRoaXMuX3RvZ2dsZUJ5UHJvcGVydHkocHJvcGVydHksIHZhbHVlLCBmYWxzZSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEFkZCBmZWF0dXJlcyB0byB0aGUgbWFwIGJ5IHByb3BlcnR5LlxuICAgKiBXcmFwcGVyIGZ1bmN0aW9uIG9mIGBfdG9nZ2xlQnlQcm9wZXJ0eWAuXG4gICAqIEVxdWl2YWxlbnQgdG8gYHRoaXMuX3RvZ2dsZUJ5UHJvcGVydHkocHJvcGVydHksIHZhbHVlLCB0cnVlKWAuXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBwcm9wZXJ0eVxuICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWVcbiAgICovXG4gIHNob3dCeVByb3BlcnR5KHByb3BlcnR5LCB2YWx1ZSkge1xuICAgIHRoaXMuX3RvZ2dsZUJ5UHJvcGVydHkocHJvcGVydHksIHZhbHVlLCB0cnVlKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfSxcblxuICAvKipcbiAgICogSXRlcmF0ZXMgb3ZlciBhbGwgZmVhdHVyZXMgYW5kIGFkZCB0aGVtIHRvIG9yIHJlbW92ZXMgdGhlbSBmcm9tXG4gICAqIHRoZSBtYXAgYmFzZWQgb24gYSBwcm9wZXJ0eSB2YWx1ZVxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gcHJvcGVydHlcbiAgICogQHBhcmFtIHtzdHJpbmd9IHZhbHVlXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gb25cbiAgICogQHByaXZhdGVcbiAgICovXG4gIF90b2dnbGVCeVByb3BlcnR5KHByb3BlcnR5LCB2YWx1ZSwgb24pIHtcbiAgICBpZiAoIShwcm9wZXJ0eSBpbiB0aGlzLl9wcm9wZXJ0eU9uTWFwKSkge1xuICAgICAgdGhpcy5fcHJvcGVydHlPbk1hcFtwcm9wZXJ0eV0gPSB7fTtcbiAgICB9XG5cbiAgICAvLyBkaWQgdGhlIHN0YXRlIGNoYW5nZT9cbiAgICBjb25zdCB0b2dnbGVkID0gdGhpcy5fcHJvcGVydHlPbk1hcFtwcm9wZXJ0eV1bdmFsdWVdICE9PSBvbjtcblxuICAgIHRoaXMuX3Byb3BlcnR5T25NYXBbcHJvcGVydHldW3ZhbHVlXSA9IG9uO1xuXG4gICAgbGV0IHRpbGU7XG4gICAgZm9yIChjb25zdCB0aWxlS2V5IGluIHRoaXMuX3ZlY3RvclRpbGVzKSB7XG4gICAgICBpZiAoIXRoaXMuX3ZlY3RvclRpbGVzLmhhc093blByb3BlcnR5KHRpbGVLZXkpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgdGlsZSA9IHRoaXMuX3ZlY3RvclRpbGVzW3RpbGVLZXldO1xuICAgICAgdGlsZS50b2dnbGVCeVByb3BlcnR5KHByb3BlcnR5LCB2YWx1ZSwgb24sIHRvZ2dsZWQpO1xuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogQ2hhbmdlIHRoZSBzdHlsZSBvZiBmZWF0dXJlcyBiYXNlZCBvbiBwcm9wZXJ0eSB2YWx1ZXNcbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IHByb3BlcnR5XG4gICAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZVxuICAgKiBAcGFyYW0ge09iamVjdH0gc3R5bGVcbiAgICogQHJldHVybnMge0wuVmVjdG9yVGlsZXN9IHRoaXNcbiAgICovXG4gIHJlc3R5bGVCeVByb3BlcnR5KHByb3BlcnR5LCB2YWx1ZSwgc3R5bGUpIHtcbiAgICBpZiAoIShwcm9wZXJ0eSBpbiB0aGlzLl9wcm9wZXJ0eVN0eWxlcykpIHtcbiAgICAgIHRoaXMuX3Byb3BlcnR5U3R5bGVzW3Byb3BlcnR5XSA9IHt9O1xuICAgIH1cblxuICAgIGlmICghKHZhbHVlIGluIHRoaXMuX3Byb3BlcnR5U3R5bGVzW3Byb3BlcnR5XSkpIHtcbiAgICAgIHRoaXMuX3Byb3BlcnR5U3R5bGVzW3Byb3BlcnR5XVt2YWx1ZV0gPSB7fTtcbiAgICB9XG5cbiAgICBPYmplY3QuYXNzaWduKHRoaXMuX3Byb3BlcnR5U3R5bGVzW3Byb3BlcnR5XVt2YWx1ZV0sIHN0eWxlKTtcblxuICAgIGxldCB0aWxlO1xuICAgIGZvciAoY29uc3QgdGlsZUtleSBpbiB0aGlzLl92ZWN0b3JUaWxlcykge1xuICAgICAgaWYgKCF0aGlzLl92ZWN0b3JUaWxlcy5oYXNPd25Qcm9wZXJ0eSh0aWxlS2V5KSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIHRpbGUgPSB0aGlzLl92ZWN0b3JUaWxlc1t0aWxlS2V5XTtcbiAgICAgIHRpbGUucmVzdHlsZUJ5UHJvcGVydHkocHJvcGVydHksIHZhbHVlLCBzdHlsZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH0sXG5cbiAgLyoqXG4gICAqIENoYW5nZSB0aGUgc3R5bGUgb2YgYSBmZWF0dXJlIGJ5IGl0cyBpZFxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gaWRcbiAgICogQHBhcmFtIHtPYmplY3R9IHN0eWxlXG4gICAqIEByZXR1cm5zIHtMLlZlY3RvclRpbGVzfSB0aGlzXG4gICAqL1xuICBzZXRGZWF0dXJlU3R5bGUoaWQsIHN0eWxlKSB7XG4gICAgdGhpcy5fZmVhdHVyZVN0eWxlc1tpZF0gPSBzdHlsZTtcbiAgICBmb3IgKGNvbnN0IHRpbGVLZXkgaW4gdGhpcy5fdmVjdG9yVGlsZXMpIHtcbiAgICAgIGlmICghdGhpcy5fdmVjdG9yVGlsZXMuaGFzT3duUHJvcGVydHkodGlsZUtleSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCB0aWxlID0gdGhpcy5fdmVjdG9yVGlsZXNbdGlsZUtleV07XG4gICAgICBpZiAodGlsZS5jb250YWlucyhpZCkpIHtcbiAgICAgICAgY29uc3QgZmVhdHVyZSA9IHRpbGUuZ2V0RmVhdHVyZShpZCk7XG4gICAgICAgIGZlYXR1cmUuc2V0U3R5bGUoc3R5bGUpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfSxcblxuICAvKipcbiAgICogUmV0dXJucyBhIHJlZmVyZW5jZSB0byB0aGUgbGF5ZXIgaWRlbnRpZmllZCBieSB0aGUgaWRcbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGlkXG4gICAqIEByZXR1cm5zIHtMLlBhdGh9XG4gICAqL1xuICBnZXRMYXllcihpZCkge1xuICAgIGxldCB0aWxlO1xuICAgIGZvciAoY29uc3QgdGlsZUtleSBpbiB0aGlzLl92ZWN0b3JUaWxlcykge1xuICAgICAgaWYgKCF0aGlzLl92ZWN0b3JUaWxlcy5oYXNPd25Qcm9wZXJ0eSh0aWxlS2V5KSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIHRpbGUgPSB0aGlzLl92ZWN0b3JUaWxlc1t0aWxlS2V5XTtcbiAgICAgIGlmICh0aWxlLmNvbnRhaW5zKGlkKSkge1xuICAgICAgICByZXR1cm4gdGlsZS5nZXRGZWF0dXJlKGlkKS5sYXllcjtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJldHVybnMgYSByZWZlcmVuY2UgdG8gdGhlIEdlb0pTT04gZmVhdHVyZSBpZGVudGlmaWVkIGJ5IHRoZSBpZFxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gaWRcbiAgICogQHJldHVybiB7T2JqZWN0fVxuICAgKi9cbiAgZ2V0R2VvSlNPTihpZCkge1xuICAgIGxldCB0aWxlO1xuICAgIGZvciAoY29uc3QgdGlsZUtleSBpbiB0aGlzLl92ZWN0b3JUaWxlcykge1xuICAgICAgaWYgKCF0aGlzLl92ZWN0b3JUaWxlcy5oYXNPd25Qcm9wZXJ0eSh0aWxlS2V5KSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIHRpbGUgPSB0aGlzLl92ZWN0b3JUaWxlc1t0aWxlS2V5XTtcbiAgICAgIGlmICh0aWxlLmNvbnRhaW5zKGlkKSkge1xuICAgICAgICByZXR1cm4gdGlsZS5nZXRGZWF0dXJlKGlkKS5nZW9qc29uO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfSxcblxuICAvKipcbiAgICogRGVsZXRlcyBhIGZlYXR1cmUgYnkgaXRzIElEXG4gICAqIE5vdGUgdGhhdCB0aGlzIGZlYXR1cmUgd2lsbCBzdGlsbCBiZSBsb2FkZWQgaW4gc3Vic2VxdWVudCB0aWxlc1xuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gaWRcbiAgICogQHJldHVybnMge0wuVmVjdG9yVGlsZXN9IHRoaXNcbiAgICovXG4gIHJlbW92ZUZlYXR1cmUoaWQpIHtcbiAgICBsZXQgdGlsZTtcbiAgICBmb3IgKGNvbnN0IHRpbGVLZXkgaW4gdGhpcy5fdmVjdG9yVGlsZXMpIHtcbiAgICAgIGlmICghdGhpcy5fdmVjdG9yVGlsZXMuaGFzT3duUHJvcGVydHkodGlsZUtleSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICB0aWxlID0gdGhpcy5fdmVjdG9yVGlsZXNbdGlsZUtleV07XG4gICAgICB0aWxlLnJlbW92ZUZlYXR1cmUoaWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfSxcblxuICAvKipcbiAgICogQ29udmVydCBhIEdlb0pTT04gZmVhdHVyZSBpbnRvIGEgTGVhZmxldCBmZWF0dXJlXG4gICAqIFBvaW50IC0+IEwuQ2lyY2xlXG4gICAqIExpbmVTdHJpbmcgLT4gTC5Qb2x5bGluZVxuICAgKiBQb2x5Z29uL011bHRpcG9seWdvbiAtPiBMLlBvbHlnb25cbiAgICogSGVyZSB3ZSBtdXN0IG1ha2UgbG9uLGxhdCAoR2VvSlNPTikgaW50byBsYXQsbG9uIChMZWFmbGV0KVxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gZmVhdHVyZVxuICAgKiBAcGFyYW0ge3N0cmluZ30gaWRcbiAgICogQHJldHVybnMge0wuUGF0aH1cbiAgICogQHByaXZhdGVcbiAgICovXG4gIF9nZW9qc29uVG9MYXllcihmZWF0dXJlKSB7XG4gICAgbGV0IGxheWVyO1xuICAgIGxldCBjb29yZHM7XG4gICAgbGV0IHJpbmc7XG4gICAgY29uc3QgYyA9IGZlYXR1cmUuZ2VvbWV0cnkuY29vcmRpbmF0ZXM7XG4gICAgc3dpdGNoIChmZWF0dXJlLmdlb21ldHJ5LnR5cGUpIHtcbiAgICAgIGNhc2UgJ1BvaW50JzpcbiAgICAgICAgbGF5ZXIgPSBMLmNpcmNsZShbY1sxXSwgY1swXV0sIHtcbiAgICAgICAgICByYWRpdXM6IDQwXG4gICAgICAgIH0pO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnTGluZVN0cmluZyc6XG4gICAgICAgIGNvb3JkcyA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBjb29yZHMucHVzaChbY1tpXVsxXSwgY1tpXVswXV0pO1xuICAgICAgICB9XG4gICAgICAgIGxheWVyID0gTC5wb2x5bGluZShjb29yZHMsIHt9KTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgICBjb29yZHMgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgY29vcmRzLnB1c2goW10pO1xuICAgICAgICAgIHJpbmcgPSBjW2ldO1xuICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgcmluZy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgY29vcmRzW2ldLnB1c2goW3Jpbmdbal1bMV0sIHJpbmdbal1bMF1dKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgbGF5ZXIgPSBMLnBvbHlnb24oY29vcmRzLCB7fSk7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdNdWx0aVBvbHlnb24nOlxuICAgICAgICBjb29yZHMgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgY29vcmRzLnB1c2goW10pO1xuICAgICAgICAgIGNvbnN0IHBvbHlnb24gPSBjW2ldO1xuICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgcG9seWdvbi5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgY29vcmRzW2ldLnB1c2goW10pO1xuICAgICAgICAgICAgcmluZyA9IHBvbHlnb25bal07XG4gICAgICAgICAgICBmb3IgKGxldCBrID0gMDsgayA8IHJpbmcubGVuZ3RoOyBrKyspIHtcbiAgICAgICAgICAgICAgY29vcmRzW2ldW2pdLnB1c2goW3Jpbmdba11bMV0sIHJpbmdba11bMF1dKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgbGF5ZXIgPSBMLnBvbHlnb24oY29vcmRzLCB7fSk7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBjb25zb2xlLmxvZyhgVW5zdXBwb3J0ZWQgZmVhdHVyZSB0eXBlOiAke2ZlYXR1cmUuZ2VvbWV0cnkudHlwZX1gKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIGxheWVyO1xuICB9XG5cbn0pO1xuXG4iLCIvKipcbiAqIEEgZmVhdHVyZSBvYmplY3RcbiAqXG4gKiBAY2xhc3MgRmVhdHVyZVxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRmVhdHVyZSB7XG4gIGNvbnN0cnVjdG9yKGlkLCBnZW9qc29uLCBsYXllcikge1xuICAgIHRoaXMuaWQgPSBpZDtcbiAgICB0aGlzLmdlb2pzb24gPSBnZW9qc29uO1xuICAgIHRoaXMubGF5ZXIgPSBsYXllcjtcbiAgICB0aGlzLm9uTWFwID0gdHJ1ZTtcbiAgICB0aGlzLnN0eWxlID0ge307XG5cbiAgICAvLyB0aGUgZm9sbG93aW5nIGJlY29tZXMgYSByZWZlcmVuY2UgdG8gdGhpcyBmZWF0dXJlJ3NcbiAgICAvLyBpbmRleCBiYm94IHdoZW4gdGhpcyBmZWF0dXJlIGlzIGluZGV4ZWQgYnkgaXRzIHRpbGVcbiAgICB0aGlzLmluZGV4RW50cnkgPSBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBzdHlsZVxuICAgKiByZXR1cm5zIHtGZWF0dXJlfSB0aGlzXG4gICAqL1xuICBzZXRTdHlsZShzdHlsZSkge1xuICAgIE9iamVjdC5hc3NpZ24odGhpcy5zdHlsZSwgc3R5bGUpO1xuICAgIHRoaXMubGF5ZXIuc2V0U3R5bGUodGhpcy5zdHlsZSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogQHBhcmFtIHtib29sZWFufSBvblxuICAgKiBAcmV0dXJucyB7RmVhdHVyZX0gdGhpc1xuICAgKi9cbiAgcHV0T25NYXAob24pIHtcbiAgICB0aGlzLm9uTWFwID0gb247XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbn1cbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBQb2ludDtcblxuLyoqXG4gKiBBIHN0YW5kYWxvbmUgcG9pbnQgZ2VvbWV0cnkgd2l0aCB1c2VmdWwgYWNjZXNzb3IsIGNvbXBhcmlzb24sIGFuZFxuICogbW9kaWZpY2F0aW9uIG1ldGhvZHMuXG4gKlxuICogQGNsYXNzIFBvaW50XG4gKiBAcGFyYW0ge051bWJlcn0geCB0aGUgeC1jb29yZGluYXRlLiB0aGlzIGNvdWxkIGJlIGxvbmdpdHVkZSBvciBzY3JlZW5cbiAqIHBpeGVscywgb3IgYW55IG90aGVyIHNvcnQgb2YgdW5pdC5cbiAqIEBwYXJhbSB7TnVtYmVyfSB5IHRoZSB5LWNvb3JkaW5hdGUuIHRoaXMgY291bGQgYmUgbGF0aXR1ZGUgb3Igc2NyZWVuXG4gKiBwaXhlbHMsIG9yIGFueSBvdGhlciBzb3J0IG9mIHVuaXQuXG4gKiBAZXhhbXBsZVxuICogdmFyIHBvaW50ID0gbmV3IFBvaW50KC03NywgMzgpO1xuICovXG5mdW5jdGlvbiBQb2ludCh4LCB5KSB7XG4gICAgdGhpcy54ID0geDtcbiAgICB0aGlzLnkgPSB5O1xufVxuXG5Qb2ludC5wcm90b3R5cGUgPSB7XG5cbiAgICAvKipcbiAgICAgKiBDbG9uZSB0aGlzIHBvaW50LCByZXR1cm5pbmcgYSBuZXcgcG9pbnQgdGhhdCBjYW4gYmUgbW9kaWZpZWRcbiAgICAgKiB3aXRob3V0IGFmZmVjdGluZyB0aGUgb2xkIG9uZS5cbiAgICAgKiBAcmV0dXJuIHtQb2ludH0gdGhlIGNsb25lXG4gICAgICovXG4gICAgY2xvbmU6IGZ1bmN0aW9uKCkgeyByZXR1cm4gbmV3IFBvaW50KHRoaXMueCwgdGhpcy55KTsgfSxcblxuICAgIC8qKlxuICAgICAqIEFkZCB0aGlzIHBvaW50J3MgeCAmIHkgY29vcmRpbmF0ZXMgdG8gYW5vdGhlciBwb2ludCxcbiAgICAgKiB5aWVsZGluZyBhIG5ldyBwb2ludC5cbiAgICAgKiBAcGFyYW0ge1BvaW50fSBwIHRoZSBvdGhlciBwb2ludFxuICAgICAqIEByZXR1cm4ge1BvaW50fSBvdXRwdXQgcG9pbnRcbiAgICAgKi9cbiAgICBhZGQ6ICAgICBmdW5jdGlvbihwKSB7IHJldHVybiB0aGlzLmNsb25lKCkuX2FkZChwKTsgfSxcblxuICAgIC8qKlxuICAgICAqIFN1YnRyYWN0IHRoaXMgcG9pbnQncyB4ICYgeSBjb29yZGluYXRlcyB0byBmcm9tIHBvaW50LFxuICAgICAqIHlpZWxkaW5nIGEgbmV3IHBvaW50LlxuICAgICAqIEBwYXJhbSB7UG9pbnR9IHAgdGhlIG90aGVyIHBvaW50XG4gICAgICogQHJldHVybiB7UG9pbnR9IG91dHB1dCBwb2ludFxuICAgICAqL1xuICAgIHN1YjogICAgIGZ1bmN0aW9uKHApIHsgcmV0dXJuIHRoaXMuY2xvbmUoKS5fc3ViKHApOyB9LFxuXG4gICAgLyoqXG4gICAgICogTXVsdGlwbHkgdGhpcyBwb2ludCdzIHggJiB5IGNvb3JkaW5hdGVzIGJ5IHBvaW50LFxuICAgICAqIHlpZWxkaW5nIGEgbmV3IHBvaW50LlxuICAgICAqIEBwYXJhbSB7UG9pbnR9IHAgdGhlIG90aGVyIHBvaW50XG4gICAgICogQHJldHVybiB7UG9pbnR9IG91dHB1dCBwb2ludFxuICAgICAqL1xuICAgIG11bHRCeVBvaW50OiAgICBmdW5jdGlvbihwKSB7IHJldHVybiB0aGlzLmNsb25lKCkuX211bHRCeVBvaW50KHApOyB9LFxuXG4gICAgLyoqXG4gICAgICogRGl2aWRlIHRoaXMgcG9pbnQncyB4ICYgeSBjb29yZGluYXRlcyBieSBwb2ludCxcbiAgICAgKiB5aWVsZGluZyBhIG5ldyBwb2ludC5cbiAgICAgKiBAcGFyYW0ge1BvaW50fSBwIHRoZSBvdGhlciBwb2ludFxuICAgICAqIEByZXR1cm4ge1BvaW50fSBvdXRwdXQgcG9pbnRcbiAgICAgKi9cbiAgICBkaXZCeVBvaW50OiAgICAgZnVuY3Rpb24ocCkgeyByZXR1cm4gdGhpcy5jbG9uZSgpLl9kaXZCeVBvaW50KHApOyB9LFxuXG4gICAgLyoqXG4gICAgICogTXVsdGlwbHkgdGhpcyBwb2ludCdzIHggJiB5IGNvb3JkaW5hdGVzIGJ5IGEgZmFjdG9yLFxuICAgICAqIHlpZWxkaW5nIGEgbmV3IHBvaW50LlxuICAgICAqIEBwYXJhbSB7UG9pbnR9IGsgZmFjdG9yXG4gICAgICogQHJldHVybiB7UG9pbnR9IG91dHB1dCBwb2ludFxuICAgICAqL1xuICAgIG11bHQ6ICAgIGZ1bmN0aW9uKGspIHsgcmV0dXJuIHRoaXMuY2xvbmUoKS5fbXVsdChrKTsgfSxcblxuICAgIC8qKlxuICAgICAqIERpdmlkZSB0aGlzIHBvaW50J3MgeCAmIHkgY29vcmRpbmF0ZXMgYnkgYSBmYWN0b3IsXG4gICAgICogeWllbGRpbmcgYSBuZXcgcG9pbnQuXG4gICAgICogQHBhcmFtIHtQb2ludH0gayBmYWN0b3JcbiAgICAgKiBAcmV0dXJuIHtQb2ludH0gb3V0cHV0IHBvaW50XG4gICAgICovXG4gICAgZGl2OiAgICAgZnVuY3Rpb24oaykgeyByZXR1cm4gdGhpcy5jbG9uZSgpLl9kaXYoayk7IH0sXG5cbiAgICAvKipcbiAgICAgKiBSb3RhdGUgdGhpcyBwb2ludCBhcm91bmQgdGhlIDAsIDAgb3JpZ2luIGJ5IGFuIGFuZ2xlIGEsXG4gICAgICogZ2l2ZW4gaW4gcmFkaWFuc1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBhIGFuZ2xlIHRvIHJvdGF0ZSBhcm91bmQsIGluIHJhZGlhbnNcbiAgICAgKiBAcmV0dXJuIHtQb2ludH0gb3V0cHV0IHBvaW50XG4gICAgICovXG4gICAgcm90YXRlOiAgZnVuY3Rpb24oYSkgeyByZXR1cm4gdGhpcy5jbG9uZSgpLl9yb3RhdGUoYSk7IH0sXG5cbiAgICAvKipcbiAgICAgKiBSb3RhdGUgdGhpcyBwb2ludCBhcm91bmQgcCBwb2ludCBieSBhbiBhbmdsZSBhLFxuICAgICAqIGdpdmVuIGluIHJhZGlhbnNcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gYSBhbmdsZSB0byByb3RhdGUgYXJvdW5kLCBpbiByYWRpYW5zXG4gICAgICogQHBhcmFtIHtQb2ludH0gcCBQb2ludCB0byByb3RhdGUgYXJvdW5kXG4gICAgICogQHJldHVybiB7UG9pbnR9IG91dHB1dCBwb2ludFxuICAgICAqL1xuICAgIHJvdGF0ZUFyb3VuZDogIGZ1bmN0aW9uKGEscCkgeyByZXR1cm4gdGhpcy5jbG9uZSgpLl9yb3RhdGVBcm91bmQoYSxwKTsgfSxcblxuICAgIC8qKlxuICAgICAqIE11bHRpcGx5IHRoaXMgcG9pbnQgYnkgYSA0eDEgdHJhbnNmb3JtYXRpb24gbWF0cml4XG4gICAgICogQHBhcmFtIHtBcnJheTxOdW1iZXI+fSBtIHRyYW5zZm9ybWF0aW9uIG1hdHJpeFxuICAgICAqIEByZXR1cm4ge1BvaW50fSBvdXRwdXQgcG9pbnRcbiAgICAgKi9cbiAgICBtYXRNdWx0OiBmdW5jdGlvbihtKSB7IHJldHVybiB0aGlzLmNsb25lKCkuX21hdE11bHQobSk7IH0sXG5cbiAgICAvKipcbiAgICAgKiBDYWxjdWxhdGUgdGhpcyBwb2ludCBidXQgYXMgYSB1bml0IHZlY3RvciBmcm9tIDAsIDAsIG1lYW5pbmdcbiAgICAgKiB0aGF0IHRoZSBkaXN0YW5jZSBmcm9tIHRoZSByZXN1bHRpbmcgcG9pbnQgdG8gdGhlIDAsIDBcbiAgICAgKiBjb29yZGluYXRlIHdpbGwgYmUgZXF1YWwgdG8gMSBhbmQgdGhlIGFuZ2xlIGZyb20gdGhlIHJlc3VsdGluZ1xuICAgICAqIHBvaW50IHRvIHRoZSAwLCAwIGNvb3JkaW5hdGUgd2lsbCBiZSB0aGUgc2FtZSBhcyBiZWZvcmUuXG4gICAgICogQHJldHVybiB7UG9pbnR9IHVuaXQgdmVjdG9yIHBvaW50XG4gICAgICovXG4gICAgdW5pdDogICAgZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmNsb25lKCkuX3VuaXQoKTsgfSxcblxuICAgIC8qKlxuICAgICAqIENvbXB1dGUgYSBwZXJwZW5kaWN1bGFyIHBvaW50LCB3aGVyZSB0aGUgbmV3IHkgY29vcmRpbmF0ZVxuICAgICAqIGlzIHRoZSBvbGQgeCBjb29yZGluYXRlIGFuZCB0aGUgbmV3IHggY29vcmRpbmF0ZSBpcyB0aGUgb2xkIHlcbiAgICAgKiBjb29yZGluYXRlIG11bHRpcGxpZWQgYnkgLTFcbiAgICAgKiBAcmV0dXJuIHtQb2ludH0gcGVycGVuZGljdWxhciBwb2ludFxuICAgICAqL1xuICAgIHBlcnA6ICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5jbG9uZSgpLl9wZXJwKCk7IH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm4gYSB2ZXJzaW9uIG9mIHRoaXMgcG9pbnQgd2l0aCB0aGUgeCAmIHkgY29vcmRpbmF0ZXNcbiAgICAgKiByb3VuZGVkIHRvIGludGVnZXJzLlxuICAgICAqIEByZXR1cm4ge1BvaW50fSByb3VuZGVkIHBvaW50XG4gICAgICovXG4gICAgcm91bmQ6ICAgZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmNsb25lKCkuX3JvdW5kKCk7IH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm4gdGhlIG1hZ2l0dWRlIG9mIHRoaXMgcG9pbnQ6IHRoaXMgaXMgdGhlIEV1Y2xpZGVhblxuICAgICAqIGRpc3RhbmNlIGZyb20gdGhlIDAsIDAgY29vcmRpbmF0ZSB0byB0aGlzIHBvaW50J3MgeCBhbmQgeVxuICAgICAqIGNvb3JkaW5hdGVzLlxuICAgICAqIEByZXR1cm4ge051bWJlcn0gbWFnbml0dWRlXG4gICAgICovXG4gICAgbWFnOiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIE1hdGguc3FydCh0aGlzLnggKiB0aGlzLnggKyB0aGlzLnkgKiB0aGlzLnkpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBKdWRnZSB3aGV0aGVyIHRoaXMgcG9pbnQgaXMgZXF1YWwgdG8gYW5vdGhlciBwb2ludCwgcmV0dXJuaW5nXG4gICAgICogdHJ1ZSBvciBmYWxzZS5cbiAgICAgKiBAcGFyYW0ge1BvaW50fSBvdGhlciB0aGUgb3RoZXIgcG9pbnRcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSB3aGV0aGVyIHRoZSBwb2ludHMgYXJlIGVxdWFsXG4gICAgICovXG4gICAgZXF1YWxzOiBmdW5jdGlvbihvdGhlcikge1xuICAgICAgICByZXR1cm4gdGhpcy54ID09PSBvdGhlci54ICYmXG4gICAgICAgICAgICAgICB0aGlzLnkgPT09IG90aGVyLnk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENhbGN1bGF0ZSB0aGUgZGlzdGFuY2UgZnJvbSB0aGlzIHBvaW50IHRvIGFub3RoZXIgcG9pbnRcbiAgICAgKiBAcGFyYW0ge1BvaW50fSBwIHRoZSBvdGhlciBwb2ludFxuICAgICAqIEByZXR1cm4ge051bWJlcn0gZGlzdGFuY2VcbiAgICAgKi9cbiAgICBkaXN0OiBmdW5jdGlvbihwKSB7XG4gICAgICAgIHJldHVybiBNYXRoLnNxcnQodGhpcy5kaXN0U3FyKHApKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ2FsY3VsYXRlIHRoZSBkaXN0YW5jZSBmcm9tIHRoaXMgcG9pbnQgdG8gYW5vdGhlciBwb2ludCxcbiAgICAgKiB3aXRob3V0IHRoZSBzcXVhcmUgcm9vdCBzdGVwLiBVc2VmdWwgaWYgeW91J3JlIGNvbXBhcmluZ1xuICAgICAqIHJlbGF0aXZlIGRpc3RhbmNlcy5cbiAgICAgKiBAcGFyYW0ge1BvaW50fSBwIHRoZSBvdGhlciBwb2ludFxuICAgICAqIEByZXR1cm4ge051bWJlcn0gZGlzdGFuY2VcbiAgICAgKi9cbiAgICBkaXN0U3FyOiBmdW5jdGlvbihwKSB7XG4gICAgICAgIHZhciBkeCA9IHAueCAtIHRoaXMueCxcbiAgICAgICAgICAgIGR5ID0gcC55IC0gdGhpcy55O1xuICAgICAgICByZXR1cm4gZHggKiBkeCArIGR5ICogZHk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgYW5nbGUgZnJvbSB0aGUgMCwgMCBjb29yZGluYXRlIHRvIHRoaXMgcG9pbnQsIGluIHJhZGlhbnNcbiAgICAgKiBjb29yZGluYXRlcy5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9IGFuZ2xlXG4gICAgICovXG4gICAgYW5nbGU6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gTWF0aC5hdGFuMih0aGlzLnksIHRoaXMueCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgYW5nbGUgZnJvbSB0aGlzIHBvaW50IHRvIGFub3RoZXIgcG9pbnQsIGluIHJhZGlhbnNcbiAgICAgKiBAcGFyYW0ge1BvaW50fSBiIHRoZSBvdGhlciBwb2ludFxuICAgICAqIEByZXR1cm4ge051bWJlcn0gYW5nbGVcbiAgICAgKi9cbiAgICBhbmdsZVRvOiBmdW5jdGlvbihiKSB7XG4gICAgICAgIHJldHVybiBNYXRoLmF0YW4yKHRoaXMueSAtIGIueSwgdGhpcy54IC0gYi54KTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IHRoZSBhbmdsZSBiZXR3ZWVuIHRoaXMgcG9pbnQgYW5kIGFub3RoZXIgcG9pbnQsIGluIHJhZGlhbnNcbiAgICAgKiBAcGFyYW0ge1BvaW50fSBiIHRoZSBvdGhlciBwb2ludFxuICAgICAqIEByZXR1cm4ge051bWJlcn0gYW5nbGVcbiAgICAgKi9cbiAgICBhbmdsZVdpdGg6IGZ1bmN0aW9uKGIpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYW5nbGVXaXRoU2VwKGIueCwgYi55KTtcbiAgICB9LFxuXG4gICAgLypcbiAgICAgKiBGaW5kIHRoZSBhbmdsZSBvZiB0aGUgdHdvIHZlY3RvcnMsIHNvbHZpbmcgdGhlIGZvcm11bGEgZm9yXG4gICAgICogdGhlIGNyb3NzIHByb2R1Y3QgYSB4IGIgPSB8YXx8YnxzaW4ozrgpIGZvciDOuC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0geCB0aGUgeC1jb29yZGluYXRlXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHkgdGhlIHktY29vcmRpbmF0ZVxuICAgICAqIEByZXR1cm4ge051bWJlcn0gdGhlIGFuZ2xlIGluIHJhZGlhbnNcbiAgICAgKi9cbiAgICBhbmdsZVdpdGhTZXA6IGZ1bmN0aW9uKHgsIHkpIHtcbiAgICAgICAgcmV0dXJuIE1hdGguYXRhbjIoXG4gICAgICAgICAgICB0aGlzLnggKiB5IC0gdGhpcy55ICogeCxcbiAgICAgICAgICAgIHRoaXMueCAqIHggKyB0aGlzLnkgKiB5KTtcbiAgICB9LFxuXG4gICAgX21hdE11bHQ6IGZ1bmN0aW9uKG0pIHtcbiAgICAgICAgdmFyIHggPSBtWzBdICogdGhpcy54ICsgbVsxXSAqIHRoaXMueSxcbiAgICAgICAgICAgIHkgPSBtWzJdICogdGhpcy54ICsgbVszXSAqIHRoaXMueTtcbiAgICAgICAgdGhpcy54ID0geDtcbiAgICAgICAgdGhpcy55ID0geTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIF9hZGQ6IGZ1bmN0aW9uKHApIHtcbiAgICAgICAgdGhpcy54ICs9IHAueDtcbiAgICAgICAgdGhpcy55ICs9IHAueTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIF9zdWI6IGZ1bmN0aW9uKHApIHtcbiAgICAgICAgdGhpcy54IC09IHAueDtcbiAgICAgICAgdGhpcy55IC09IHAueTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIF9tdWx0OiBmdW5jdGlvbihrKSB7XG4gICAgICAgIHRoaXMueCAqPSBrO1xuICAgICAgICB0aGlzLnkgKj0gaztcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIF9kaXY6IGZ1bmN0aW9uKGspIHtcbiAgICAgICAgdGhpcy54IC89IGs7XG4gICAgICAgIHRoaXMueSAvPSBrO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgX211bHRCeVBvaW50OiBmdW5jdGlvbihwKSB7XG4gICAgICAgIHRoaXMueCAqPSBwLng7XG4gICAgICAgIHRoaXMueSAqPSBwLnk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICBfZGl2QnlQb2ludDogZnVuY3Rpb24ocCkge1xuICAgICAgICB0aGlzLnggLz0gcC54O1xuICAgICAgICB0aGlzLnkgLz0gcC55O1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgX3VuaXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB0aGlzLl9kaXYodGhpcy5tYWcoKSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICBfcGVycDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciB5ID0gdGhpcy55O1xuICAgICAgICB0aGlzLnkgPSB0aGlzLng7XG4gICAgICAgIHRoaXMueCA9IC15O1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgX3JvdGF0ZTogZnVuY3Rpb24oYW5nbGUpIHtcbiAgICAgICAgdmFyIGNvcyA9IE1hdGguY29zKGFuZ2xlKSxcbiAgICAgICAgICAgIHNpbiA9IE1hdGguc2luKGFuZ2xlKSxcbiAgICAgICAgICAgIHggPSBjb3MgKiB0aGlzLnggLSBzaW4gKiB0aGlzLnksXG4gICAgICAgICAgICB5ID0gc2luICogdGhpcy54ICsgY29zICogdGhpcy55O1xuICAgICAgICB0aGlzLnggPSB4O1xuICAgICAgICB0aGlzLnkgPSB5O1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgX3JvdGF0ZUFyb3VuZDogZnVuY3Rpb24oYW5nbGUsIHApIHtcbiAgICAgICAgdmFyIGNvcyA9IE1hdGguY29zKGFuZ2xlKSxcbiAgICAgICAgICAgIHNpbiA9IE1hdGguc2luKGFuZ2xlKSxcbiAgICAgICAgICAgIHggPSBwLnggKyBjb3MgKiAodGhpcy54IC0gcC54KSAtIHNpbiAqICh0aGlzLnkgLSBwLnkpLFxuICAgICAgICAgICAgeSA9IHAueSArIHNpbiAqICh0aGlzLnggLSBwLngpICsgY29zICogKHRoaXMueSAtIHAueSk7XG4gICAgICAgIHRoaXMueCA9IHg7XG4gICAgICAgIHRoaXMueSA9IHk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICBfcm91bmQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB0aGlzLnggPSBNYXRoLnJvdW5kKHRoaXMueCk7XG4gICAgICAgIHRoaXMueSA9IE1hdGgucm91bmQodGhpcy55KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxufTtcblxuLyoqXG4gKiBDb25zdHJ1Y3QgYSBwb2ludCBmcm9tIGFuIGFycmF5IGlmIG5lY2Vzc2FyeSwgb3RoZXJ3aXNlIGlmIHRoZSBpbnB1dFxuICogaXMgYWxyZWFkeSBhIFBvaW50LCBvciBhbiB1bmtub3duIHR5cGUsIHJldHVybiBpdCB1bmNoYW5nZWRcbiAqIEBwYXJhbSB7QXJyYXk8TnVtYmVyPnxQb2ludHwqfSBhIGFueSBraW5kIG9mIGlucHV0IHZhbHVlXG4gKiBAcmV0dXJuIHtQb2ludH0gY29uc3RydWN0ZWQgcG9pbnQsIG9yIHBhc3NlZC10aHJvdWdoIHZhbHVlLlxuICogQGV4YW1wbGVcbiAqIC8vIHRoaXNcbiAqIHZhciBwb2ludCA9IFBvaW50LmNvbnZlcnQoWzAsIDFdKTtcbiAqIC8vIGlzIGVxdWl2YWxlbnQgdG9cbiAqIHZhciBwb2ludCA9IG5ldyBQb2ludCgwLCAxKTtcbiAqL1xuUG9pbnQuY29udmVydCA9IGZ1bmN0aW9uIChhKSB7XG4gICAgaWYgKGEgaW5zdGFuY2VvZiBQb2ludCkge1xuICAgICAgICByZXR1cm4gYTtcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoYSkpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQb2ludChhWzBdLCBhWzFdKTtcbiAgICB9XG4gICAgcmV0dXJuIGE7XG59O1xuIiwibW9kdWxlLmV4cG9ydHMuVmVjdG9yVGlsZSA9IHJlcXVpcmUoJy4vbGliL3ZlY3RvcnRpbGUuanMnKTtcbm1vZHVsZS5leHBvcnRzLlZlY3RvclRpbGVGZWF0dXJlID0gcmVxdWlyZSgnLi9saWIvdmVjdG9ydGlsZWZlYXR1cmUuanMnKTtcbm1vZHVsZS5leHBvcnRzLlZlY3RvclRpbGVMYXllciA9IHJlcXVpcmUoJy4vbGliL3ZlY3RvcnRpbGVsYXllci5qcycpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgVmVjdG9yVGlsZUxheWVyID0gcmVxdWlyZSgnLi92ZWN0b3J0aWxlbGF5ZXInKTtcblxubW9kdWxlLmV4cG9ydHMgPSBWZWN0b3JUaWxlO1xuXG5mdW5jdGlvbiBWZWN0b3JUaWxlKHBiZiwgZW5kKSB7XG4gICAgdGhpcy5sYXllcnMgPSBwYmYucmVhZEZpZWxkcyhyZWFkVGlsZSwge30sIGVuZCk7XG59XG5cbmZ1bmN0aW9uIHJlYWRUaWxlKHRhZywgbGF5ZXJzLCBwYmYpIHtcbiAgICBpZiAodGFnID09PSAzKSB7XG4gICAgICAgIHZhciBsYXllciA9IG5ldyBWZWN0b3JUaWxlTGF5ZXIocGJmLCBwYmYucmVhZFZhcmludCgpICsgcGJmLnBvcyk7XG4gICAgICAgIGlmIChsYXllci5sZW5ndGgpIGxheWVyc1tsYXllci5uYW1lXSA9IGxheWVyO1xuICAgIH1cbn1cblxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgUG9pbnQgPSByZXF1aXJlKCdAbWFwYm94L3BvaW50LWdlb21ldHJ5Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gVmVjdG9yVGlsZUZlYXR1cmU7XG5cbmZ1bmN0aW9uIFZlY3RvclRpbGVGZWF0dXJlKHBiZiwgZW5kLCBleHRlbnQsIGtleXMsIHZhbHVlcykge1xuICAgIC8vIFB1YmxpY1xuICAgIHRoaXMucHJvcGVydGllcyA9IHt9O1xuICAgIHRoaXMuZXh0ZW50ID0gZXh0ZW50O1xuICAgIHRoaXMudHlwZSA9IDA7XG5cbiAgICAvLyBQcml2YXRlXG4gICAgdGhpcy5fcGJmID0gcGJmO1xuICAgIHRoaXMuX2dlb21ldHJ5ID0gLTE7XG4gICAgdGhpcy5fa2V5cyA9IGtleXM7XG4gICAgdGhpcy5fdmFsdWVzID0gdmFsdWVzO1xuXG4gICAgcGJmLnJlYWRGaWVsZHMocmVhZEZlYXR1cmUsIHRoaXMsIGVuZCk7XG59XG5cbmZ1bmN0aW9uIHJlYWRGZWF0dXJlKHRhZywgZmVhdHVyZSwgcGJmKSB7XG4gICAgaWYgKHRhZyA9PSAxKSBmZWF0dXJlLmlkID0gcGJmLnJlYWRWYXJpbnQoKTtcbiAgICBlbHNlIGlmICh0YWcgPT0gMikgcmVhZFRhZyhwYmYsIGZlYXR1cmUpO1xuICAgIGVsc2UgaWYgKHRhZyA9PSAzKSBmZWF0dXJlLnR5cGUgPSBwYmYucmVhZFZhcmludCgpO1xuICAgIGVsc2UgaWYgKHRhZyA9PSA0KSBmZWF0dXJlLl9nZW9tZXRyeSA9IHBiZi5wb3M7XG59XG5cbmZ1bmN0aW9uIHJlYWRUYWcocGJmLCBmZWF0dXJlKSB7XG4gICAgdmFyIGVuZCA9IHBiZi5yZWFkVmFyaW50KCkgKyBwYmYucG9zO1xuXG4gICAgd2hpbGUgKHBiZi5wb3MgPCBlbmQpIHtcbiAgICAgICAgdmFyIGtleSA9IGZlYXR1cmUuX2tleXNbcGJmLnJlYWRWYXJpbnQoKV0sXG4gICAgICAgICAgICB2YWx1ZSA9IGZlYXR1cmUuX3ZhbHVlc1twYmYucmVhZFZhcmludCgpXTtcbiAgICAgICAgZmVhdHVyZS5wcm9wZXJ0aWVzW2tleV0gPSB2YWx1ZTtcbiAgICB9XG59XG5cblZlY3RvclRpbGVGZWF0dXJlLnR5cGVzID0gWydVbmtub3duJywgJ1BvaW50JywgJ0xpbmVTdHJpbmcnLCAnUG9seWdvbiddO1xuXG5WZWN0b3JUaWxlRmVhdHVyZS5wcm90b3R5cGUubG9hZEdlb21ldHJ5ID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHBiZiA9IHRoaXMuX3BiZjtcbiAgICBwYmYucG9zID0gdGhpcy5fZ2VvbWV0cnk7XG5cbiAgICB2YXIgZW5kID0gcGJmLnJlYWRWYXJpbnQoKSArIHBiZi5wb3MsXG4gICAgICAgIGNtZCA9IDEsXG4gICAgICAgIGxlbmd0aCA9IDAsXG4gICAgICAgIHggPSAwLFxuICAgICAgICB5ID0gMCxcbiAgICAgICAgbGluZXMgPSBbXSxcbiAgICAgICAgbGluZTtcblxuICAgIHdoaWxlIChwYmYucG9zIDwgZW5kKSB7XG4gICAgICAgIGlmICghbGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgY21kTGVuID0gcGJmLnJlYWRWYXJpbnQoKTtcbiAgICAgICAgICAgIGNtZCA9IGNtZExlbiAmIDB4NztcbiAgICAgICAgICAgIGxlbmd0aCA9IGNtZExlbiA+PiAzO1xuICAgICAgICB9XG5cbiAgICAgICAgbGVuZ3RoLS07XG5cbiAgICAgICAgaWYgKGNtZCA9PT0gMSB8fCBjbWQgPT09IDIpIHtcbiAgICAgICAgICAgIHggKz0gcGJmLnJlYWRTVmFyaW50KCk7XG4gICAgICAgICAgICB5ICs9IHBiZi5yZWFkU1ZhcmludCgpO1xuXG4gICAgICAgICAgICBpZiAoY21kID09PSAxKSB7IC8vIG1vdmVUb1xuICAgICAgICAgICAgICAgIGlmIChsaW5lKSBsaW5lcy5wdXNoKGxpbmUpO1xuICAgICAgICAgICAgICAgIGxpbmUgPSBbXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGluZS5wdXNoKG5ldyBQb2ludCh4LCB5KSk7XG5cbiAgICAgICAgfSBlbHNlIGlmIChjbWQgPT09IDcpIHtcblxuICAgICAgICAgICAgLy8gV29ya2Fyb3VuZCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21hcGJveC9tYXBuaWstdmVjdG9yLXRpbGUvaXNzdWVzLzkwXG4gICAgICAgICAgICBpZiAobGluZSkge1xuICAgICAgICAgICAgICAgIGxpbmUucHVzaChsaW5lWzBdLmNsb25lKCkpOyAvLyBjbG9zZVBvbHlnb25cbiAgICAgICAgICAgIH1cblxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd1bmtub3duIGNvbW1hbmQgJyArIGNtZCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobGluZSkgbGluZXMucHVzaChsaW5lKTtcblxuICAgIHJldHVybiBsaW5lcztcbn07XG5cblZlY3RvclRpbGVGZWF0dXJlLnByb3RvdHlwZS5iYm94ID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHBiZiA9IHRoaXMuX3BiZjtcbiAgICBwYmYucG9zID0gdGhpcy5fZ2VvbWV0cnk7XG5cbiAgICB2YXIgZW5kID0gcGJmLnJlYWRWYXJpbnQoKSArIHBiZi5wb3MsXG4gICAgICAgIGNtZCA9IDEsXG4gICAgICAgIGxlbmd0aCA9IDAsXG4gICAgICAgIHggPSAwLFxuICAgICAgICB5ID0gMCxcbiAgICAgICAgeDEgPSBJbmZpbml0eSxcbiAgICAgICAgeDIgPSAtSW5maW5pdHksXG4gICAgICAgIHkxID0gSW5maW5pdHksXG4gICAgICAgIHkyID0gLUluZmluaXR5O1xuXG4gICAgd2hpbGUgKHBiZi5wb3MgPCBlbmQpIHtcbiAgICAgICAgaWYgKCFsZW5ndGgpIHtcbiAgICAgICAgICAgIHZhciBjbWRMZW4gPSBwYmYucmVhZFZhcmludCgpO1xuICAgICAgICAgICAgY21kID0gY21kTGVuICYgMHg3O1xuICAgICAgICAgICAgbGVuZ3RoID0gY21kTGVuID4+IDM7XG4gICAgICAgIH1cblxuICAgICAgICBsZW5ndGgtLTtcblxuICAgICAgICBpZiAoY21kID09PSAxIHx8IGNtZCA9PT0gMikge1xuICAgICAgICAgICAgeCArPSBwYmYucmVhZFNWYXJpbnQoKTtcbiAgICAgICAgICAgIHkgKz0gcGJmLnJlYWRTVmFyaW50KCk7XG4gICAgICAgICAgICBpZiAoeCA8IHgxKSB4MSA9IHg7XG4gICAgICAgICAgICBpZiAoeCA+IHgyKSB4MiA9IHg7XG4gICAgICAgICAgICBpZiAoeSA8IHkxKSB5MSA9IHk7XG4gICAgICAgICAgICBpZiAoeSA+IHkyKSB5MiA9IHk7XG5cbiAgICAgICAgfSBlbHNlIGlmIChjbWQgIT09IDcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigndW5rbm93biBjb21tYW5kICcgKyBjbWQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIFt4MSwgeTEsIHgyLCB5Ml07XG59O1xuXG5WZWN0b3JUaWxlRmVhdHVyZS5wcm90b3R5cGUudG9HZW9KU09OID0gZnVuY3Rpb24oeCwgeSwgeikge1xuICAgIHZhciBzaXplID0gdGhpcy5leHRlbnQgKiBNYXRoLnBvdygyLCB6KSxcbiAgICAgICAgeDAgPSB0aGlzLmV4dGVudCAqIHgsXG4gICAgICAgIHkwID0gdGhpcy5leHRlbnQgKiB5LFxuICAgICAgICBjb29yZHMgPSB0aGlzLmxvYWRHZW9tZXRyeSgpLFxuICAgICAgICB0eXBlID0gVmVjdG9yVGlsZUZlYXR1cmUudHlwZXNbdGhpcy50eXBlXSxcbiAgICAgICAgaSwgajtcblxuICAgIGZ1bmN0aW9uIHByb2plY3QobGluZSkge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGxpbmUubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgIHZhciBwID0gbGluZVtqXSwgeTIgPSAxODAgLSAocC55ICsgeTApICogMzYwIC8gc2l6ZTtcbiAgICAgICAgICAgIGxpbmVbal0gPSBbXG4gICAgICAgICAgICAgICAgKHAueCArIHgwKSAqIDM2MCAvIHNpemUgLSAxODAsXG4gICAgICAgICAgICAgICAgMzYwIC8gTWF0aC5QSSAqIE1hdGguYXRhbihNYXRoLmV4cCh5MiAqIE1hdGguUEkgLyAxODApKSAtIDkwXG4gICAgICAgICAgICBdO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3dpdGNoICh0aGlzLnR5cGUpIHtcbiAgICBjYXNlIDE6XG4gICAgICAgIHZhciBwb2ludHMgPSBbXTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvb3Jkcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgcG9pbnRzW2ldID0gY29vcmRzW2ldWzBdO1xuICAgICAgICB9XG4gICAgICAgIGNvb3JkcyA9IHBvaW50cztcbiAgICAgICAgcHJvamVjdChjb29yZHMpO1xuICAgICAgICBicmVhaztcblxuICAgIGNhc2UgMjpcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvb3Jkcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgcHJvamVjdChjb29yZHNbaV0pO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSAzOlxuICAgICAgICBjb29yZHMgPSBjbGFzc2lmeVJpbmdzKGNvb3Jkcyk7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb29yZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb29yZHNbaV0ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICBwcm9qZWN0KGNvb3Jkc1tpXVtqXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKGNvb3Jkcy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgY29vcmRzID0gY29vcmRzWzBdO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHR5cGUgPSAnTXVsdGknICsgdHlwZTtcbiAgICB9XG5cbiAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgICB0eXBlOiBcIkZlYXR1cmVcIixcbiAgICAgICAgZ2VvbWV0cnk6IHtcbiAgICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgICBjb29yZGluYXRlczogY29vcmRzXG4gICAgICAgIH0sXG4gICAgICAgIHByb3BlcnRpZXM6IHRoaXMucHJvcGVydGllc1xuICAgIH07XG5cbiAgICBpZiAoJ2lkJyBpbiB0aGlzKSB7XG4gICAgICAgIHJlc3VsdC5pZCA9IHRoaXMuaWQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8vIGNsYXNzaWZpZXMgYW4gYXJyYXkgb2YgcmluZ3MgaW50byBwb2x5Z29ucyB3aXRoIG91dGVyIHJpbmdzIGFuZCBob2xlc1xuXG5mdW5jdGlvbiBjbGFzc2lmeVJpbmdzKHJpbmdzKSB7XG4gICAgdmFyIGxlbiA9IHJpbmdzLmxlbmd0aDtcblxuICAgIGlmIChsZW4gPD0gMSkgcmV0dXJuIFtyaW5nc107XG5cbiAgICB2YXIgcG9seWdvbnMgPSBbXSxcbiAgICAgICAgcG9seWdvbixcbiAgICAgICAgY2N3O1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICB2YXIgYXJlYSA9IHNpZ25lZEFyZWEocmluZ3NbaV0pO1xuICAgICAgICBpZiAoYXJlYSA9PT0gMCkgY29udGludWU7XG5cbiAgICAgICAgaWYgKGNjdyA9PT0gdW5kZWZpbmVkKSBjY3cgPSBhcmVhIDwgMDtcblxuICAgICAgICBpZiAoY2N3ID09PSBhcmVhIDwgMCkge1xuICAgICAgICAgICAgaWYgKHBvbHlnb24pIHBvbHlnb25zLnB1c2gocG9seWdvbik7XG4gICAgICAgICAgICBwb2x5Z29uID0gW3JpbmdzW2ldXTtcblxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9seWdvbi5wdXNoKHJpbmdzW2ldKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAocG9seWdvbikgcG9seWdvbnMucHVzaChwb2x5Z29uKTtcblxuICAgIHJldHVybiBwb2x5Z29ucztcbn1cblxuZnVuY3Rpb24gc2lnbmVkQXJlYShyaW5nKSB7XG4gICAgdmFyIHN1bSA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHJpbmcubGVuZ3RoLCBqID0gbGVuIC0gMSwgcDEsIHAyOyBpIDwgbGVuOyBqID0gaSsrKSB7XG4gICAgICAgIHAxID0gcmluZ1tpXTtcbiAgICAgICAgcDIgPSByaW5nW2pdO1xuICAgICAgICBzdW0gKz0gKHAyLnggLSBwMS54KSAqIChwMS55ICsgcDIueSk7XG4gICAgfVxuICAgIHJldHVybiBzdW07XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBWZWN0b3JUaWxlRmVhdHVyZSA9IHJlcXVpcmUoJy4vdmVjdG9ydGlsZWZlYXR1cmUuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBWZWN0b3JUaWxlTGF5ZXI7XG5cbmZ1bmN0aW9uIFZlY3RvclRpbGVMYXllcihwYmYsIGVuZCkge1xuICAgIC8vIFB1YmxpY1xuICAgIHRoaXMudmVyc2lvbiA9IDE7XG4gICAgdGhpcy5uYW1lID0gbnVsbDtcbiAgICB0aGlzLmV4dGVudCA9IDQwOTY7XG4gICAgdGhpcy5sZW5ndGggPSAwO1xuXG4gICAgLy8gUHJpdmF0ZVxuICAgIHRoaXMuX3BiZiA9IHBiZjtcbiAgICB0aGlzLl9rZXlzID0gW107XG4gICAgdGhpcy5fdmFsdWVzID0gW107XG4gICAgdGhpcy5fZmVhdHVyZXMgPSBbXTtcblxuICAgIHBiZi5yZWFkRmllbGRzKHJlYWRMYXllciwgdGhpcywgZW5kKTtcblxuICAgIHRoaXMubGVuZ3RoID0gdGhpcy5fZmVhdHVyZXMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiByZWFkTGF5ZXIodGFnLCBsYXllciwgcGJmKSB7XG4gICAgaWYgKHRhZyA9PT0gMTUpIGxheWVyLnZlcnNpb24gPSBwYmYucmVhZFZhcmludCgpO1xuICAgIGVsc2UgaWYgKHRhZyA9PT0gMSkgbGF5ZXIubmFtZSA9IHBiZi5yZWFkU3RyaW5nKCk7XG4gICAgZWxzZSBpZiAodGFnID09PSA1KSBsYXllci5leHRlbnQgPSBwYmYucmVhZFZhcmludCgpO1xuICAgIGVsc2UgaWYgKHRhZyA9PT0gMikgbGF5ZXIuX2ZlYXR1cmVzLnB1c2gocGJmLnBvcyk7XG4gICAgZWxzZSBpZiAodGFnID09PSAzKSBsYXllci5fa2V5cy5wdXNoKHBiZi5yZWFkU3RyaW5nKCkpO1xuICAgIGVsc2UgaWYgKHRhZyA9PT0gNCkgbGF5ZXIuX3ZhbHVlcy5wdXNoKHJlYWRWYWx1ZU1lc3NhZ2UocGJmKSk7XG59XG5cbmZ1bmN0aW9uIHJlYWRWYWx1ZU1lc3NhZ2UocGJmKSB7XG4gICAgdmFyIHZhbHVlID0gbnVsbCxcbiAgICAgICAgZW5kID0gcGJmLnJlYWRWYXJpbnQoKSArIHBiZi5wb3M7XG5cbiAgICB3aGlsZSAocGJmLnBvcyA8IGVuZCkge1xuICAgICAgICB2YXIgdGFnID0gcGJmLnJlYWRWYXJpbnQoKSA+PiAzO1xuXG4gICAgICAgIHZhbHVlID0gdGFnID09PSAxID8gcGJmLnJlYWRTdHJpbmcoKSA6XG4gICAgICAgICAgICB0YWcgPT09IDIgPyBwYmYucmVhZEZsb2F0KCkgOlxuICAgICAgICAgICAgdGFnID09PSAzID8gcGJmLnJlYWREb3VibGUoKSA6XG4gICAgICAgICAgICB0YWcgPT09IDQgPyBwYmYucmVhZFZhcmludDY0KCkgOlxuICAgICAgICAgICAgdGFnID09PSA1ID8gcGJmLnJlYWRWYXJpbnQoKSA6XG4gICAgICAgICAgICB0YWcgPT09IDYgPyBwYmYucmVhZFNWYXJpbnQoKSA6XG4gICAgICAgICAgICB0YWcgPT09IDcgPyBwYmYucmVhZEJvb2xlYW4oKSA6IG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhbHVlO1xufVxuXG4vLyByZXR1cm4gZmVhdHVyZSBgaWAgZnJvbSB0aGlzIGxheWVyIGFzIGEgYFZlY3RvclRpbGVGZWF0dXJlYFxuVmVjdG9yVGlsZUxheWVyLnByb3RvdHlwZS5mZWF0dXJlID0gZnVuY3Rpb24oaSkge1xuICAgIGlmIChpIDwgMCB8fCBpID49IHRoaXMuX2ZlYXR1cmVzLmxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKCdmZWF0dXJlIGluZGV4IG91dCBvZiBib3VuZHMnKTtcblxuICAgIHRoaXMuX3BiZi5wb3MgPSB0aGlzLl9mZWF0dXJlc1tpXTtcblxuICAgIHZhciBlbmQgPSB0aGlzLl9wYmYucmVhZFZhcmludCgpICsgdGhpcy5fcGJmLnBvcztcbiAgICByZXR1cm4gbmV3IFZlY3RvclRpbGVGZWF0dXJlKHRoaXMuX3BiZiwgZW5kLCB0aGlzLmV4dGVudCwgdGhpcy5fa2V5cywgdGhpcy5fdmFsdWVzKTtcbn07XG4iLCJ2YXIgY29vcmRFYWNoID0gcmVxdWlyZSgnQHR1cmYvbWV0YScpLmNvb3JkRWFjaDtcblxuLyoqXG4gKiBUYWtlcyBhIHNldCBvZiBmZWF0dXJlcywgY2FsY3VsYXRlcyB0aGUgYmJveCBvZiBhbGwgaW5wdXQgZmVhdHVyZXMsIGFuZCByZXR1cm5zIGEgYm91bmRpbmcgYm94LlxuICpcbiAqIEBuYW1lIGJib3hcbiAqIEBwYXJhbSB7RmVhdHVyZUNvbGxlY3Rpb258RmVhdHVyZTxhbnk+fSBnZW9qc29uIGlucHV0IGZlYXR1cmVzXG4gKiBAcmV0dXJucyB7QXJyYXk8bnVtYmVyPn0gYmJveCBleHRlbnQgaW4gW21pblgsIG1pblksIG1heFgsIG1heFldIG9yZGVyXG4gKiBAZXhhbXBsZVxuICogdmFyIGxpbmUgPSB0dXJmLmxpbmVTdHJpbmcoW1stNzQsIDQwXSwgWy03OCwgNDJdLCBbLTgyLCAzNV1dKTtcbiAqIHZhciBiYm94ID0gdHVyZi5iYm94KGxpbmUpO1xuICogdmFyIGJib3hQb2x5Z29uID0gdHVyZi5iYm94UG9seWdvbihiYm94KTtcbiAqXG4gKiAvL2FkZFRvTWFwXG4gKiB2YXIgYWRkVG9NYXAgPSBbbGluZSwgYmJveFBvbHlnb25dXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdlb2pzb24pIHtcbiAgICB2YXIgYmJveCA9IFtJbmZpbml0eSwgSW5maW5pdHksIC1JbmZpbml0eSwgLUluZmluaXR5XTtcbiAgICBjb29yZEVhY2goZ2VvanNvbiwgZnVuY3Rpb24gKGNvb3JkKSB7XG4gICAgICAgIGlmIChiYm94WzBdID4gY29vcmRbMF0pIGJib3hbMF0gPSBjb29yZFswXTtcbiAgICAgICAgaWYgKGJib3hbMV0gPiBjb29yZFsxXSkgYmJveFsxXSA9IGNvb3JkWzFdO1xuICAgICAgICBpZiAoYmJveFsyXSA8IGNvb3JkWzBdKSBiYm94WzJdID0gY29vcmRbMF07XG4gICAgICAgIGlmIChiYm94WzNdIDwgY29vcmRbMV0pIGJib3hbM10gPSBjb29yZFsxXTtcbiAgICB9KTtcbiAgICByZXR1cm4gYmJveDtcbn07XG4iLCIvKipcbiAqIENhbGxiYWNrIGZvciBjb29yZEVhY2hcbiAqXG4gKiBAY2FsbGJhY2sgY29vcmRFYWNoQ2FsbGJhY2tcbiAqIEBwYXJhbSB7QXJyYXk8bnVtYmVyPn0gY3VycmVudENvb3JkIFRoZSBjdXJyZW50IGNvb3JkaW5hdGUgYmVpbmcgcHJvY2Vzc2VkLlxuICogQHBhcmFtIHtudW1iZXJ9IGNvb3JkSW5kZXggVGhlIGN1cnJlbnQgaW5kZXggb2YgdGhlIGNvb3JkaW5hdGUgYmVpbmcgcHJvY2Vzc2VkLlxuICogU3RhcnRzIGF0IGluZGV4IDAuXG4gKiBAcGFyYW0ge251bWJlcn0gZmVhdHVyZUluZGV4IFRoZSBjdXJyZW50IGluZGV4IG9mIHRoZSBmZWF0dXJlIGJlaW5nIHByb2Nlc3NlZC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBmZWF0dXJlU3ViSW5kZXggVGhlIGN1cnJlbnQgc3ViSW5kZXggb2YgdGhlIGZlYXR1cmUgYmVpbmcgcHJvY2Vzc2VkLlxuICovXG5cbi8qKlxuICogSXRlcmF0ZSBvdmVyIGNvb3JkaW5hdGVzIGluIGFueSBHZW9KU09OIG9iamVjdCwgc2ltaWxhciB0byBBcnJheS5mb3JFYWNoKClcbiAqXG4gKiBAbmFtZSBjb29yZEVhY2hcbiAqIEBwYXJhbSB7RmVhdHVyZUNvbGxlY3Rpb258R2VvbWV0cnl8RmVhdHVyZX0gZ2VvanNvbiBhbnkgR2VvSlNPTiBvYmplY3RcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIGEgbWV0aG9kIHRoYXQgdGFrZXMgKGN1cnJlbnRDb29yZCwgY29vcmRJbmRleCwgZmVhdHVyZUluZGV4LCBmZWF0dXJlU3ViSW5kZXgpXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtleGNsdWRlV3JhcENvb3JkPWZhbHNlXSB3aGV0aGVyIG9yIG5vdCB0byBpbmNsdWRlIHRoZSBmaW5hbCBjb29yZGluYXRlIG9mIExpbmVhclJpbmdzIHRoYXQgd3JhcHMgdGhlIHJpbmcgaW4gaXRzIGl0ZXJhdGlvbi5cbiAqIEBleGFtcGxlXG4gKiB2YXIgZmVhdHVyZXMgPSB0dXJmLmZlYXR1cmVDb2xsZWN0aW9uKFtcbiAqICAgdHVyZi5wb2ludChbMjYsIDM3XSwge1wiZm9vXCI6IFwiYmFyXCJ9KSxcbiAqICAgdHVyZi5wb2ludChbMzYsIDUzXSwge1wiaGVsbG9cIjogXCJ3b3JsZFwifSlcbiAqIF0pO1xuICpcbiAqIHR1cmYuY29vcmRFYWNoKGZlYXR1cmVzLCBmdW5jdGlvbiAoY3VycmVudENvb3JkLCBjb29yZEluZGV4LCBmZWF0dXJlSW5kZXgsIGZlYXR1cmVTdWJJbmRleCkge1xuICogICAvLz1jdXJyZW50Q29vcmRcbiAqICAgLy89Y29vcmRJbmRleFxuICogICAvLz1mZWF0dXJlSW5kZXhcbiAqICAgLy89ZmVhdHVyZVN1YkluZGV4XG4gKiB9KTtcbiAqL1xuZnVuY3Rpb24gY29vcmRFYWNoKGdlb2pzb24sIGNhbGxiYWNrLCBleGNsdWRlV3JhcENvb3JkKSB7XG4gICAgLy8gSGFuZGxlcyBudWxsIEdlb21ldHJ5IC0tIFNraXBzIHRoaXMgR2VvSlNPTlxuICAgIGlmIChnZW9qc29uID09PSBudWxsKSByZXR1cm47XG4gICAgdmFyIGZlYXR1cmVJbmRleCwgZ2VvbWV0cnlJbmRleCwgaiwgaywgbCwgZ2VvbWV0cnksIHN0b3BHLCBjb29yZHMsXG4gICAgICAgIGdlb21ldHJ5TWF5YmVDb2xsZWN0aW9uLFxuICAgICAgICB3cmFwU2hyaW5rID0gMCxcbiAgICAgICAgY29vcmRJbmRleCA9IDAsXG4gICAgICAgIGlzR2VvbWV0cnlDb2xsZWN0aW9uLFxuICAgICAgICB0eXBlID0gZ2VvanNvbi50eXBlLFxuICAgICAgICBpc0ZlYXR1cmVDb2xsZWN0aW9uID0gdHlwZSA9PT0gJ0ZlYXR1cmVDb2xsZWN0aW9uJyxcbiAgICAgICAgaXNGZWF0dXJlID0gdHlwZSA9PT0gJ0ZlYXR1cmUnLFxuICAgICAgICBzdG9wID0gaXNGZWF0dXJlQ29sbGVjdGlvbiA/IGdlb2pzb24uZmVhdHVyZXMubGVuZ3RoIDogMTtcblxuICAgIC8vIFRoaXMgbG9naWMgbWF5IGxvb2sgYSBsaXR0bGUgd2VpcmQuIFRoZSByZWFzb24gd2h5IGl0IGlzIHRoYXQgd2F5XG4gICAgLy8gaXMgYmVjYXVzZSBpdCdzIHRyeWluZyB0byBiZSBmYXN0LiBHZW9KU09OIHN1cHBvcnRzIG11bHRpcGxlIGtpbmRzXG4gICAgLy8gb2Ygb2JqZWN0cyBhdCBpdHMgcm9vdDogRmVhdHVyZUNvbGxlY3Rpb24sIEZlYXR1cmVzLCBHZW9tZXRyaWVzLlxuICAgIC8vIFRoaXMgZnVuY3Rpb24gaGFzIHRoZSByZXNwb25zaWJpbGl0eSBvZiBoYW5kbGluZyBhbGwgb2YgdGhlbSwgYW5kIHRoYXRcbiAgICAvLyBtZWFucyB0aGF0IHNvbWUgb2YgdGhlIGBmb3JgIGxvb3BzIHlvdSBzZWUgYmVsb3cgYWN0dWFsbHkganVzdCBkb24ndCBhcHBseVxuICAgIC8vIHRvIGNlcnRhaW4gaW5wdXRzLiBGb3IgaW5zdGFuY2UsIGlmIHlvdSBnaXZlIHRoaXMganVzdCBhXG4gICAgLy8gUG9pbnQgZ2VvbWV0cnksIHRoZW4gYm90aCBsb29wcyBhcmUgc2hvcnQtY2lyY3VpdGVkIGFuZCBhbGwgd2UgZG9cbiAgICAvLyBpcyBncmFkdWFsbHkgcmVuYW1lIHRoZSBpbnB1dCB1bnRpbCBpdCdzIGNhbGxlZCAnZ2VvbWV0cnknLlxuICAgIC8vXG4gICAgLy8gVGhpcyBhbHNvIGFpbXMgdG8gYWxsb2NhdGUgYXMgZmV3IHJlc291cmNlcyBhcyBwb3NzaWJsZToganVzdCBhXG4gICAgLy8gZmV3IG51bWJlcnMgYW5kIGJvb2xlYW5zLCByYXRoZXIgdGhhbiBhbnkgdGVtcG9yYXJ5IGFycmF5cyBhcyB3b3VsZFxuICAgIC8vIGJlIHJlcXVpcmVkIHdpdGggdGhlIG5vcm1hbGl6YXRpb24gYXBwcm9hY2guXG4gICAgZm9yIChmZWF0dXJlSW5kZXggPSAwOyBmZWF0dXJlSW5kZXggPCBzdG9wOyBmZWF0dXJlSW5kZXgrKykge1xuICAgICAgICB2YXIgZmVhdHVyZVN1YkluZGV4ID0gMDtcblxuICAgICAgICBnZW9tZXRyeU1heWJlQ29sbGVjdGlvbiA9IChpc0ZlYXR1cmVDb2xsZWN0aW9uID8gZ2VvanNvbi5mZWF0dXJlc1tmZWF0dXJlSW5kZXhdLmdlb21ldHJ5IDpcbiAgICAgICAgKGlzRmVhdHVyZSA/IGdlb2pzb24uZ2VvbWV0cnkgOiBnZW9qc29uKSk7XG4gICAgICAgIGlzR2VvbWV0cnlDb2xsZWN0aW9uID0gKGdlb21ldHJ5TWF5YmVDb2xsZWN0aW9uKSA/IGdlb21ldHJ5TWF5YmVDb2xsZWN0aW9uLnR5cGUgPT09ICdHZW9tZXRyeUNvbGxlY3Rpb24nIDogZmFsc2U7XG4gICAgICAgIHN0b3BHID0gaXNHZW9tZXRyeUNvbGxlY3Rpb24gPyBnZW9tZXRyeU1heWJlQ29sbGVjdGlvbi5nZW9tZXRyaWVzLmxlbmd0aCA6IDE7XG5cbiAgICAgICAgZm9yIChnZW9tZXRyeUluZGV4ID0gMDsgZ2VvbWV0cnlJbmRleCA8IHN0b3BHOyBnZW9tZXRyeUluZGV4KyspIHtcbiAgICAgICAgICAgIGdlb21ldHJ5ID0gaXNHZW9tZXRyeUNvbGxlY3Rpb24gP1xuICAgICAgICAgICAgZ2VvbWV0cnlNYXliZUNvbGxlY3Rpb24uZ2VvbWV0cmllc1tnZW9tZXRyeUluZGV4XSA6IGdlb21ldHJ5TWF5YmVDb2xsZWN0aW9uO1xuXG4gICAgICAgICAgICAvLyBIYW5kbGVzIG51bGwgR2VvbWV0cnkgLS0gU2tpcHMgdGhpcyBnZW9tZXRyeVxuICAgICAgICAgICAgaWYgKGdlb21ldHJ5ID09PSBudWxsKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvb3JkcyA9IGdlb21ldHJ5LmNvb3JkaW5hdGVzO1xuICAgICAgICAgICAgdmFyIGdlb21UeXBlID0gZ2VvbWV0cnkudHlwZTtcblxuICAgICAgICAgICAgd3JhcFNocmluayA9IChleGNsdWRlV3JhcENvb3JkICYmIChnZW9tVHlwZSA9PT0gJ1BvbHlnb24nIHx8IGdlb21UeXBlID09PSAnTXVsdGlQb2x5Z29uJykpID8gMSA6IDA7XG5cbiAgICAgICAgICAgIHN3aXRjaCAoZ2VvbVR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgbnVsbDpcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ1BvaW50JzpcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhjb29yZHMsIGNvb3JkSW5kZXgsIGZlYXR1cmVJbmRleCwgZmVhdHVyZVN1YkluZGV4KTtcbiAgICAgICAgICAgICAgICBjb29yZEluZGV4Kys7XG4gICAgICAgICAgICAgICAgZmVhdHVyZVN1YkluZGV4Kys7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdMaW5lU3RyaW5nJzpcbiAgICAgICAgICAgIGNhc2UgJ011bHRpUG9pbnQnOlxuICAgICAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb29yZHMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soY29vcmRzW2pdLCBjb29yZEluZGV4LCBmZWF0dXJlSW5kZXgsIGZlYXR1cmVTdWJJbmRleCk7XG4gICAgICAgICAgICAgICAgICAgIGNvb3JkSW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgZmVhdHVyZVN1YkluZGV4Kys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnUG9seWdvbic6XG4gICAgICAgICAgICBjYXNlICdNdWx0aUxpbmVTdHJpbmcnOlxuICAgICAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb29yZHMubGVuZ3RoOyBqKyspXG4gICAgICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBjb29yZHNbal0ubGVuZ3RoIC0gd3JhcFNocmluazsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhjb29yZHNbal1ba10sIGNvb3JkSW5kZXgsIGZlYXR1cmVJbmRleCwgZmVhdHVyZVN1YkluZGV4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvb3JkSW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgICAgIGZlYXR1cmVTdWJJbmRleCsrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdNdWx0aVBvbHlnb24nOlxuICAgICAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb29yZHMubGVuZ3RoOyBqKyspXG4gICAgICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBjb29yZHNbal0ubGVuZ3RoOyBrKyspXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGwgPSAwOyBsIDwgY29vcmRzW2pdW2tdLmxlbmd0aCAtIHdyYXBTaHJpbms7IGwrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGNvb3Jkc1tqXVtrXVtsXSwgY29vcmRJbmRleCwgZmVhdHVyZUluZGV4LCBmZWF0dXJlU3ViSW5kZXgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvb3JkSW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmZWF0dXJlU3ViSW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0dlb21ldHJ5Q29sbGVjdGlvbic6XG4gICAgICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGdlb21ldHJ5Lmdlb21ldHJpZXMubGVuZ3RoOyBqKyspXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkRWFjaChnZW9tZXRyeS5nZW9tZXRyaWVzW2pdLCBjYWxsYmFjaywgZXhjbHVkZVdyYXBDb29yZCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OiB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gR2VvbWV0cnkgVHlwZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG4vKipcbiAqIENhbGxiYWNrIGZvciBjb29yZFJlZHVjZVxuICpcbiAqIFRoZSBmaXJzdCB0aW1lIHRoZSBjYWxsYmFjayBmdW5jdGlvbiBpcyBjYWxsZWQsIHRoZSB2YWx1ZXMgcHJvdmlkZWQgYXMgYXJndW1lbnRzIGRlcGVuZFxuICogb24gd2hldGhlciB0aGUgcmVkdWNlIG1ldGhvZCBoYXMgYW4gaW5pdGlhbFZhbHVlIGFyZ3VtZW50LlxuICpcbiAqIElmIGFuIGluaXRpYWxWYWx1ZSBpcyBwcm92aWRlZCB0byB0aGUgcmVkdWNlIG1ldGhvZDpcbiAqICAtIFRoZSBwcmV2aW91c1ZhbHVlIGFyZ3VtZW50IGlzIGluaXRpYWxWYWx1ZS5cbiAqICAtIFRoZSBjdXJyZW50VmFsdWUgYXJndW1lbnQgaXMgdGhlIHZhbHVlIG9mIHRoZSBmaXJzdCBlbGVtZW50IHByZXNlbnQgaW4gdGhlIGFycmF5LlxuICpcbiAqIElmIGFuIGluaXRpYWxWYWx1ZSBpcyBub3QgcHJvdmlkZWQ6XG4gKiAgLSBUaGUgcHJldmlvdXNWYWx1ZSBhcmd1bWVudCBpcyB0aGUgdmFsdWUgb2YgdGhlIGZpcnN0IGVsZW1lbnQgcHJlc2VudCBpbiB0aGUgYXJyYXkuXG4gKiAgLSBUaGUgY3VycmVudFZhbHVlIGFyZ3VtZW50IGlzIHRoZSB2YWx1ZSBvZiB0aGUgc2Vjb25kIGVsZW1lbnQgcHJlc2VudCBpbiB0aGUgYXJyYXkuXG4gKlxuICogQGNhbGxiYWNrIGNvb3JkUmVkdWNlQ2FsbGJhY2tcbiAqIEBwYXJhbSB7Kn0gcHJldmlvdXNWYWx1ZSBUaGUgYWNjdW11bGF0ZWQgdmFsdWUgcHJldmlvdXNseSByZXR1cm5lZCBpbiB0aGUgbGFzdCBpbnZvY2F0aW9uXG4gKiBvZiB0aGUgY2FsbGJhY2ssIG9yIGluaXRpYWxWYWx1ZSwgaWYgc3VwcGxpZWQuXG4gKiBAcGFyYW0ge0FycmF5PG51bWJlcj59IGN1cnJlbnRDb29yZCBUaGUgY3VycmVudCBjb29yZGluYXRlIGJlaW5nIHByb2Nlc3NlZC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBjb29yZEluZGV4IFRoZSBjdXJyZW50IGluZGV4IG9mIHRoZSBjb29yZGluYXRlIGJlaW5nIHByb2Nlc3NlZC5cbiAqIFN0YXJ0cyBhdCBpbmRleCAwLCBpZiBhbiBpbml0aWFsVmFsdWUgaXMgcHJvdmlkZWQsIGFuZCBhdCBpbmRleCAxIG90aGVyd2lzZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSBmZWF0dXJlSW5kZXggVGhlIGN1cnJlbnQgaW5kZXggb2YgdGhlIGZlYXR1cmUgYmVpbmcgcHJvY2Vzc2VkLlxuICogQHBhcmFtIHtudW1iZXJ9IGZlYXR1cmVTdWJJbmRleCBUaGUgY3VycmVudCBzdWJJbmRleCBvZiB0aGUgZmVhdHVyZSBiZWluZyBwcm9jZXNzZWQuXG4gKi9cblxuLyoqXG4gKiBSZWR1Y2UgY29vcmRpbmF0ZXMgaW4gYW55IEdlb0pTT04gb2JqZWN0LCBzaW1pbGFyIHRvIEFycmF5LnJlZHVjZSgpXG4gKlxuICogQG5hbWUgY29vcmRSZWR1Y2VcbiAqIEBwYXJhbSB7RmVhdHVyZUNvbGxlY3Rpb258R2VvbWV0cnl8RmVhdHVyZX0gZ2VvanNvbiBhbnkgR2VvSlNPTiBvYmplY3RcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIGEgbWV0aG9kIHRoYXQgdGFrZXMgKHByZXZpb3VzVmFsdWUsIGN1cnJlbnRDb29yZCwgY29vcmRJbmRleClcbiAqIEBwYXJhbSB7Kn0gW2luaXRpYWxWYWx1ZV0gVmFsdWUgdG8gdXNlIGFzIHRoZSBmaXJzdCBhcmd1bWVudCB0byB0aGUgZmlyc3QgY2FsbCBvZiB0aGUgY2FsbGJhY2suXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtleGNsdWRlV3JhcENvb3JkPWZhbHNlXSB3aGV0aGVyIG9yIG5vdCB0byBpbmNsdWRlIHRoZSBmaW5hbCBjb29yZGluYXRlIG9mIExpbmVhclJpbmdzIHRoYXQgd3JhcHMgdGhlIHJpbmcgaW4gaXRzIGl0ZXJhdGlvbi5cbiAqIEByZXR1cm5zIHsqfSBUaGUgdmFsdWUgdGhhdCByZXN1bHRzIGZyb20gdGhlIHJlZHVjdGlvbi5cbiAqIEBleGFtcGxlXG4gKiB2YXIgZmVhdHVyZXMgPSB0dXJmLmZlYXR1cmVDb2xsZWN0aW9uKFtcbiAqICAgdHVyZi5wb2ludChbMjYsIDM3XSwge1wiZm9vXCI6IFwiYmFyXCJ9KSxcbiAqICAgdHVyZi5wb2ludChbMzYsIDUzXSwge1wiaGVsbG9cIjogXCJ3b3JsZFwifSlcbiAqIF0pO1xuICpcbiAqIHR1cmYuY29vcmRSZWR1Y2UoZmVhdHVyZXMsIGZ1bmN0aW9uIChwcmV2aW91c1ZhbHVlLCBjdXJyZW50Q29vcmQsIGNvb3JkSW5kZXgsIGZlYXR1cmVJbmRleCwgZmVhdHVyZVN1YkluZGV4KSB7XG4gKiAgIC8vPXByZXZpb3VzVmFsdWVcbiAqICAgLy89Y3VycmVudENvb3JkXG4gKiAgIC8vPWNvb3JkSW5kZXhcbiAqICAgLy89ZmVhdHVyZUluZGV4XG4gKiAgIC8vPWZlYXR1cmVTdWJJbmRleFxuICogICByZXR1cm4gY3VycmVudENvb3JkO1xuICogfSk7XG4gKi9cbmZ1bmN0aW9uIGNvb3JkUmVkdWNlKGdlb2pzb24sIGNhbGxiYWNrLCBpbml0aWFsVmFsdWUsIGV4Y2x1ZGVXcmFwQ29vcmQpIHtcbiAgICB2YXIgcHJldmlvdXNWYWx1ZSA9IGluaXRpYWxWYWx1ZTtcbiAgICBjb29yZEVhY2goZ2VvanNvbiwgZnVuY3Rpb24gKGN1cnJlbnRDb29yZCwgY29vcmRJbmRleCwgZmVhdHVyZUluZGV4LCBmZWF0dXJlU3ViSW5kZXgpIHtcbiAgICAgICAgaWYgKGNvb3JkSW5kZXggPT09IDAgJiYgaW5pdGlhbFZhbHVlID09PSB1bmRlZmluZWQpIHByZXZpb3VzVmFsdWUgPSBjdXJyZW50Q29vcmQ7XG4gICAgICAgIGVsc2UgcHJldmlvdXNWYWx1ZSA9IGNhbGxiYWNrKHByZXZpb3VzVmFsdWUsIGN1cnJlbnRDb29yZCwgY29vcmRJbmRleCwgZmVhdHVyZUluZGV4LCBmZWF0dXJlU3ViSW5kZXgpO1xuICAgIH0sIGV4Y2x1ZGVXcmFwQ29vcmQpO1xuICAgIHJldHVybiBwcmV2aW91c1ZhbHVlO1xufVxuXG4vKipcbiAqIENhbGxiYWNrIGZvciBwcm9wRWFjaFxuICpcbiAqIEBjYWxsYmFjayBwcm9wRWFjaENhbGxiYWNrXG4gKiBAcGFyYW0ge09iamVjdH0gY3VycmVudFByb3BlcnRpZXMgVGhlIGN1cnJlbnQgcHJvcGVydGllcyBiZWluZyBwcm9jZXNzZWQuXG4gKiBAcGFyYW0ge251bWJlcn0gZmVhdHVyZUluZGV4IFRoZSBpbmRleCBvZiB0aGUgY3VycmVudCBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZCBpbiB0aGVcbiAqIGFycmF5LlN0YXJ0cyBhdCBpbmRleCAwLCBpZiBhbiBpbml0aWFsVmFsdWUgaXMgcHJvdmlkZWQsIGFuZCBhdCBpbmRleCAxIG90aGVyd2lzZS5cbiAqL1xuXG4vKipcbiAqIEl0ZXJhdGUgb3ZlciBwcm9wZXJ0aWVzIGluIGFueSBHZW9KU09OIG9iamVjdCwgc2ltaWxhciB0byBBcnJheS5mb3JFYWNoKClcbiAqXG4gKiBAbmFtZSBwcm9wRWFjaFxuICogQHBhcmFtIHtGZWF0dXJlQ29sbGVjdGlvbnxGZWF0dXJlfSBnZW9qc29uIGFueSBHZW9KU09OIG9iamVjdFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgYSBtZXRob2QgdGhhdCB0YWtlcyAoY3VycmVudFByb3BlcnRpZXMsIGZlYXR1cmVJbmRleClcbiAqIEBleGFtcGxlXG4gKiB2YXIgZmVhdHVyZXMgPSB0dXJmLmZlYXR1cmVDb2xsZWN0aW9uKFtcbiAqICAgICB0dXJmLnBvaW50KFsyNiwgMzddLCB7Zm9vOiAnYmFyJ30pLFxuICogICAgIHR1cmYucG9pbnQoWzM2LCA1M10sIHtoZWxsbzogJ3dvcmxkJ30pXG4gKiBdKTtcbiAqXG4gKiB0dXJmLnByb3BFYWNoKGZlYXR1cmVzLCBmdW5jdGlvbiAoY3VycmVudFByb3BlcnRpZXMsIGZlYXR1cmVJbmRleCkge1xuICogICAvLz1jdXJyZW50UHJvcGVydGllc1xuICogICAvLz1mZWF0dXJlSW5kZXhcbiAqIH0pO1xuICovXG5mdW5jdGlvbiBwcm9wRWFjaChnZW9qc29uLCBjYWxsYmFjaykge1xuICAgIHZhciBpO1xuICAgIHN3aXRjaCAoZ2VvanNvbi50eXBlKSB7XG4gICAgY2FzZSAnRmVhdHVyZUNvbGxlY3Rpb24nOlxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZ2VvanNvbi5mZWF0dXJlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY2FsbGJhY2soZ2VvanNvbi5mZWF0dXJlc1tpXS5wcm9wZXJ0aWVzLCBpKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICBjYXNlICdGZWF0dXJlJzpcbiAgICAgICAgY2FsbGJhY2soZ2VvanNvbi5wcm9wZXJ0aWVzLCAwKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxufVxuXG5cbi8qKlxuICogQ2FsbGJhY2sgZm9yIHByb3BSZWR1Y2VcbiAqXG4gKiBUaGUgZmlyc3QgdGltZSB0aGUgY2FsbGJhY2sgZnVuY3Rpb24gaXMgY2FsbGVkLCB0aGUgdmFsdWVzIHByb3ZpZGVkIGFzIGFyZ3VtZW50cyBkZXBlbmRcbiAqIG9uIHdoZXRoZXIgdGhlIHJlZHVjZSBtZXRob2QgaGFzIGFuIGluaXRpYWxWYWx1ZSBhcmd1bWVudC5cbiAqXG4gKiBJZiBhbiBpbml0aWFsVmFsdWUgaXMgcHJvdmlkZWQgdG8gdGhlIHJlZHVjZSBtZXRob2Q6XG4gKiAgLSBUaGUgcHJldmlvdXNWYWx1ZSBhcmd1bWVudCBpcyBpbml0aWFsVmFsdWUuXG4gKiAgLSBUaGUgY3VycmVudFZhbHVlIGFyZ3VtZW50IGlzIHRoZSB2YWx1ZSBvZiB0aGUgZmlyc3QgZWxlbWVudCBwcmVzZW50IGluIHRoZSBhcnJheS5cbiAqXG4gKiBJZiBhbiBpbml0aWFsVmFsdWUgaXMgbm90IHByb3ZpZGVkOlxuICogIC0gVGhlIHByZXZpb3VzVmFsdWUgYXJndW1lbnQgaXMgdGhlIHZhbHVlIG9mIHRoZSBmaXJzdCBlbGVtZW50IHByZXNlbnQgaW4gdGhlIGFycmF5LlxuICogIC0gVGhlIGN1cnJlbnRWYWx1ZSBhcmd1bWVudCBpcyB0aGUgdmFsdWUgb2YgdGhlIHNlY29uZCBlbGVtZW50IHByZXNlbnQgaW4gdGhlIGFycmF5LlxuICpcbiAqIEBjYWxsYmFjayBwcm9wUmVkdWNlQ2FsbGJhY2tcbiAqIEBwYXJhbSB7Kn0gcHJldmlvdXNWYWx1ZSBUaGUgYWNjdW11bGF0ZWQgdmFsdWUgcHJldmlvdXNseSByZXR1cm5lZCBpbiB0aGUgbGFzdCBpbnZvY2F0aW9uXG4gKiBvZiB0aGUgY2FsbGJhY2ssIG9yIGluaXRpYWxWYWx1ZSwgaWYgc3VwcGxpZWQuXG4gKiBAcGFyYW0geyp9IGN1cnJlbnRQcm9wZXJ0aWVzIFRoZSBjdXJyZW50IHByb3BlcnRpZXMgYmVpbmcgcHJvY2Vzc2VkLlxuICogQHBhcmFtIHtudW1iZXJ9IGZlYXR1cmVJbmRleCBUaGUgaW5kZXggb2YgdGhlIGN1cnJlbnQgZWxlbWVudCBiZWluZyBwcm9jZXNzZWQgaW4gdGhlXG4gKiBhcnJheS5TdGFydHMgYXQgaW5kZXggMCwgaWYgYW4gaW5pdGlhbFZhbHVlIGlzIHByb3ZpZGVkLCBhbmQgYXQgaW5kZXggMSBvdGhlcndpc2UuXG4gKi9cblxuLyoqXG4gKiBSZWR1Y2UgcHJvcGVydGllcyBpbiBhbnkgR2VvSlNPTiBvYmplY3QgaW50byBhIHNpbmdsZSB2YWx1ZSxcbiAqIHNpbWlsYXIgdG8gaG93IEFycmF5LnJlZHVjZSB3b3Jrcy4gSG93ZXZlciwgaW4gdGhpcyBjYXNlIHdlIGxhemlseSBydW5cbiAqIHRoZSByZWR1Y3Rpb24sIHNvIGFuIGFycmF5IG9mIGFsbCBwcm9wZXJ0aWVzIGlzIHVubmVjZXNzYXJ5LlxuICpcbiAqIEBuYW1lIHByb3BSZWR1Y2VcbiAqIEBwYXJhbSB7RmVhdHVyZUNvbGxlY3Rpb258RmVhdHVyZX0gZ2VvanNvbiBhbnkgR2VvSlNPTiBvYmplY3RcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIGEgbWV0aG9kIHRoYXQgdGFrZXMgKHByZXZpb3VzVmFsdWUsIGN1cnJlbnRQcm9wZXJ0aWVzLCBmZWF0dXJlSW5kZXgpXG4gKiBAcGFyYW0geyp9IFtpbml0aWFsVmFsdWVdIFZhbHVlIHRvIHVzZSBhcyB0aGUgZmlyc3QgYXJndW1lbnQgdG8gdGhlIGZpcnN0IGNhbGwgb2YgdGhlIGNhbGxiYWNrLlxuICogQHJldHVybnMgeyp9IFRoZSB2YWx1ZSB0aGF0IHJlc3VsdHMgZnJvbSB0aGUgcmVkdWN0aW9uLlxuICogQGV4YW1wbGVcbiAqIHZhciBmZWF0dXJlcyA9IHR1cmYuZmVhdHVyZUNvbGxlY3Rpb24oW1xuICogICAgIHR1cmYucG9pbnQoWzI2LCAzN10sIHtmb286ICdiYXInfSksXG4gKiAgICAgdHVyZi5wb2ludChbMzYsIDUzXSwge2hlbGxvOiAnd29ybGQnfSlcbiAqIF0pO1xuICpcbiAqIHR1cmYucHJvcFJlZHVjZShmZWF0dXJlcywgZnVuY3Rpb24gKHByZXZpb3VzVmFsdWUsIGN1cnJlbnRQcm9wZXJ0aWVzLCBmZWF0dXJlSW5kZXgpIHtcbiAqICAgLy89cHJldmlvdXNWYWx1ZVxuICogICAvLz1jdXJyZW50UHJvcGVydGllc1xuICogICAvLz1mZWF0dXJlSW5kZXhcbiAqICAgcmV0dXJuIGN1cnJlbnRQcm9wZXJ0aWVzXG4gKiB9KTtcbiAqL1xuZnVuY3Rpb24gcHJvcFJlZHVjZShnZW9qc29uLCBjYWxsYmFjaywgaW5pdGlhbFZhbHVlKSB7XG4gICAgdmFyIHByZXZpb3VzVmFsdWUgPSBpbml0aWFsVmFsdWU7XG4gICAgcHJvcEVhY2goZ2VvanNvbiwgZnVuY3Rpb24gKGN1cnJlbnRQcm9wZXJ0aWVzLCBmZWF0dXJlSW5kZXgpIHtcbiAgICAgICAgaWYgKGZlYXR1cmVJbmRleCA9PT0gMCAmJiBpbml0aWFsVmFsdWUgPT09IHVuZGVmaW5lZCkgcHJldmlvdXNWYWx1ZSA9IGN1cnJlbnRQcm9wZXJ0aWVzO1xuICAgICAgICBlbHNlIHByZXZpb3VzVmFsdWUgPSBjYWxsYmFjayhwcmV2aW91c1ZhbHVlLCBjdXJyZW50UHJvcGVydGllcywgZmVhdHVyZUluZGV4KTtcbiAgICB9KTtcbiAgICByZXR1cm4gcHJldmlvdXNWYWx1ZTtcbn1cblxuLyoqXG4gKiBDYWxsYmFjayBmb3IgZmVhdHVyZUVhY2hcbiAqXG4gKiBAY2FsbGJhY2sgZmVhdHVyZUVhY2hDYWxsYmFja1xuICogQHBhcmFtIHtGZWF0dXJlPGFueT59IGN1cnJlbnRGZWF0dXJlIFRoZSBjdXJyZW50IGZlYXR1cmUgYmVpbmcgcHJvY2Vzc2VkLlxuICogQHBhcmFtIHtudW1iZXJ9IGZlYXR1cmVJbmRleCBUaGUgaW5kZXggb2YgdGhlIGN1cnJlbnQgZWxlbWVudCBiZWluZyBwcm9jZXNzZWQgaW4gdGhlXG4gKiBhcnJheS5TdGFydHMgYXQgaW5kZXggMCwgaWYgYW4gaW5pdGlhbFZhbHVlIGlzIHByb3ZpZGVkLCBhbmQgYXQgaW5kZXggMSBvdGhlcndpc2UuXG4gKi9cblxuLyoqXG4gKiBJdGVyYXRlIG92ZXIgZmVhdHVyZXMgaW4gYW55IEdlb0pTT04gb2JqZWN0LCBzaW1pbGFyIHRvXG4gKiBBcnJheS5mb3JFYWNoLlxuICpcbiAqIEBuYW1lIGZlYXR1cmVFYWNoXG4gKiBAcGFyYW0ge0dlb21ldHJ5fEZlYXR1cmVDb2xsZWN0aW9ufEZlYXR1cmV9IGdlb2pzb24gYW55IEdlb0pTT04gb2JqZWN0XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBhIG1ldGhvZCB0aGF0IHRha2VzIChjdXJyZW50RmVhdHVyZSwgZmVhdHVyZUluZGV4KVxuICogQGV4YW1wbGVcbiAqIHZhciBmZWF0dXJlcyA9IHR1cmYuZmVhdHVyZUNvbGxlY3Rpb24oW1xuICogICB0dXJmLnBvaW50KFsyNiwgMzddLCB7Zm9vOiAnYmFyJ30pLFxuICogICB0dXJmLnBvaW50KFszNiwgNTNdLCB7aGVsbG86ICd3b3JsZCd9KVxuICogXSk7XG4gKlxuICogdHVyZi5mZWF0dXJlRWFjaChmZWF0dXJlcywgZnVuY3Rpb24gKGN1cnJlbnRGZWF0dXJlLCBmZWF0dXJlSW5kZXgpIHtcbiAqICAgLy89Y3VycmVudEZlYXR1cmVcbiAqICAgLy89ZmVhdHVyZUluZGV4XG4gKiB9KTtcbiAqL1xuZnVuY3Rpb24gZmVhdHVyZUVhY2goZ2VvanNvbiwgY2FsbGJhY2spIHtcbiAgICBpZiAoZ2VvanNvbi50eXBlID09PSAnRmVhdHVyZScpIHtcbiAgICAgICAgY2FsbGJhY2soZ2VvanNvbiwgMCk7XG4gICAgfSBlbHNlIGlmIChnZW9qc29uLnR5cGUgPT09ICdGZWF0dXJlQ29sbGVjdGlvbicpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBnZW9qc29uLmZlYXR1cmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhnZW9qc29uLmZlYXR1cmVzW2ldLCBpKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLyoqXG4gKiBDYWxsYmFjayBmb3IgZmVhdHVyZVJlZHVjZVxuICpcbiAqIFRoZSBmaXJzdCB0aW1lIHRoZSBjYWxsYmFjayBmdW5jdGlvbiBpcyBjYWxsZWQsIHRoZSB2YWx1ZXMgcHJvdmlkZWQgYXMgYXJndW1lbnRzIGRlcGVuZFxuICogb24gd2hldGhlciB0aGUgcmVkdWNlIG1ldGhvZCBoYXMgYW4gaW5pdGlhbFZhbHVlIGFyZ3VtZW50LlxuICpcbiAqIElmIGFuIGluaXRpYWxWYWx1ZSBpcyBwcm92aWRlZCB0byB0aGUgcmVkdWNlIG1ldGhvZDpcbiAqICAtIFRoZSBwcmV2aW91c1ZhbHVlIGFyZ3VtZW50IGlzIGluaXRpYWxWYWx1ZS5cbiAqICAtIFRoZSBjdXJyZW50VmFsdWUgYXJndW1lbnQgaXMgdGhlIHZhbHVlIG9mIHRoZSBmaXJzdCBlbGVtZW50IHByZXNlbnQgaW4gdGhlIGFycmF5LlxuICpcbiAqIElmIGFuIGluaXRpYWxWYWx1ZSBpcyBub3QgcHJvdmlkZWQ6XG4gKiAgLSBUaGUgcHJldmlvdXNWYWx1ZSBhcmd1bWVudCBpcyB0aGUgdmFsdWUgb2YgdGhlIGZpcnN0IGVsZW1lbnQgcHJlc2VudCBpbiB0aGUgYXJyYXkuXG4gKiAgLSBUaGUgY3VycmVudFZhbHVlIGFyZ3VtZW50IGlzIHRoZSB2YWx1ZSBvZiB0aGUgc2Vjb25kIGVsZW1lbnQgcHJlc2VudCBpbiB0aGUgYXJyYXkuXG4gKlxuICogQGNhbGxiYWNrIGZlYXR1cmVSZWR1Y2VDYWxsYmFja1xuICogQHBhcmFtIHsqfSBwcmV2aW91c1ZhbHVlIFRoZSBhY2N1bXVsYXRlZCB2YWx1ZSBwcmV2aW91c2x5IHJldHVybmVkIGluIHRoZSBsYXN0IGludm9jYXRpb25cbiAqIG9mIHRoZSBjYWxsYmFjaywgb3IgaW5pdGlhbFZhbHVlLCBpZiBzdXBwbGllZC5cbiAqIEBwYXJhbSB7RmVhdHVyZX0gY3VycmVudEZlYXR1cmUgVGhlIGN1cnJlbnQgRmVhdHVyZSBiZWluZyBwcm9jZXNzZWQuXG4gKiBAcGFyYW0ge251bWJlcn0gZmVhdHVyZUluZGV4IFRoZSBpbmRleCBvZiB0aGUgY3VycmVudCBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZCBpbiB0aGVcbiAqIGFycmF5LlN0YXJ0cyBhdCBpbmRleCAwLCBpZiBhbiBpbml0aWFsVmFsdWUgaXMgcHJvdmlkZWQsIGFuZCBhdCBpbmRleCAxIG90aGVyd2lzZS5cbiAqL1xuXG4vKipcbiAqIFJlZHVjZSBmZWF0dXJlcyBpbiBhbnkgR2VvSlNPTiBvYmplY3QsIHNpbWlsYXIgdG8gQXJyYXkucmVkdWNlKCkuXG4gKlxuICogQG5hbWUgZmVhdHVyZVJlZHVjZVxuICogQHBhcmFtIHtHZW9tZXRyeXxGZWF0dXJlQ29sbGVjdGlvbnxGZWF0dXJlfSBnZW9qc29uIGFueSBHZW9KU09OIG9iamVjdFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgYSBtZXRob2QgdGhhdCB0YWtlcyAocHJldmlvdXNWYWx1ZSwgY3VycmVudEZlYXR1cmUsIGZlYXR1cmVJbmRleClcbiAqIEBwYXJhbSB7Kn0gW2luaXRpYWxWYWx1ZV0gVmFsdWUgdG8gdXNlIGFzIHRoZSBmaXJzdCBhcmd1bWVudCB0byB0aGUgZmlyc3QgY2FsbCBvZiB0aGUgY2FsbGJhY2suXG4gKiBAcmV0dXJucyB7Kn0gVGhlIHZhbHVlIHRoYXQgcmVzdWx0cyBmcm9tIHRoZSByZWR1Y3Rpb24uXG4gKiBAZXhhbXBsZVxuICogdmFyIGZlYXR1cmVzID0gdHVyZi5mZWF0dXJlQ29sbGVjdGlvbihbXG4gKiAgIHR1cmYucG9pbnQoWzI2LCAzN10sIHtcImZvb1wiOiBcImJhclwifSksXG4gKiAgIHR1cmYucG9pbnQoWzM2LCA1M10sIHtcImhlbGxvXCI6IFwid29ybGRcIn0pXG4gKiBdKTtcbiAqXG4gKiB0dXJmLmZlYXR1cmVSZWR1Y2UoZmVhdHVyZXMsIGZ1bmN0aW9uIChwcmV2aW91c1ZhbHVlLCBjdXJyZW50RmVhdHVyZSwgZmVhdHVyZUluZGV4KSB7XG4gKiAgIC8vPXByZXZpb3VzVmFsdWVcbiAqICAgLy89Y3VycmVudEZlYXR1cmVcbiAqICAgLy89ZmVhdHVyZUluZGV4XG4gKiAgIHJldHVybiBjdXJyZW50RmVhdHVyZVxuICogfSk7XG4gKi9cbmZ1bmN0aW9uIGZlYXR1cmVSZWR1Y2UoZ2VvanNvbiwgY2FsbGJhY2ssIGluaXRpYWxWYWx1ZSkge1xuICAgIHZhciBwcmV2aW91c1ZhbHVlID0gaW5pdGlhbFZhbHVlO1xuICAgIGZlYXR1cmVFYWNoKGdlb2pzb24sIGZ1bmN0aW9uIChjdXJyZW50RmVhdHVyZSwgZmVhdHVyZUluZGV4KSB7XG4gICAgICAgIGlmIChmZWF0dXJlSW5kZXggPT09IDAgJiYgaW5pdGlhbFZhbHVlID09PSB1bmRlZmluZWQpIHByZXZpb3VzVmFsdWUgPSBjdXJyZW50RmVhdHVyZTtcbiAgICAgICAgZWxzZSBwcmV2aW91c1ZhbHVlID0gY2FsbGJhY2socHJldmlvdXNWYWx1ZSwgY3VycmVudEZlYXR1cmUsIGZlYXR1cmVJbmRleCk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHByZXZpb3VzVmFsdWU7XG59XG5cbi8qKlxuICogR2V0IGFsbCBjb29yZGluYXRlcyBmcm9tIGFueSBHZW9KU09OIG9iamVjdC5cbiAqXG4gKiBAbmFtZSBjb29yZEFsbFxuICogQHBhcmFtIHtHZW9tZXRyeXxGZWF0dXJlQ29sbGVjdGlvbnxGZWF0dXJlfSBnZW9qc29uIGFueSBHZW9KU09OIG9iamVjdFxuICogQHJldHVybnMge0FycmF5PEFycmF5PG51bWJlcj4+fSBjb29yZGluYXRlIHBvc2l0aW9uIGFycmF5XG4gKiBAZXhhbXBsZVxuICogdmFyIGZlYXR1cmVzID0gdHVyZi5mZWF0dXJlQ29sbGVjdGlvbihbXG4gKiAgIHR1cmYucG9pbnQoWzI2LCAzN10sIHtmb286ICdiYXInfSksXG4gKiAgIHR1cmYucG9pbnQoWzM2LCA1M10sIHtoZWxsbzogJ3dvcmxkJ30pXG4gKiBdKTtcbiAqXG4gKiB2YXIgY29vcmRzID0gdHVyZi5jb29yZEFsbChmZWF0dXJlcyk7XG4gKiAvLz0gW1syNiwgMzddLCBbMzYsIDUzXV1cbiAqL1xuZnVuY3Rpb24gY29vcmRBbGwoZ2VvanNvbikge1xuICAgIHZhciBjb29yZHMgPSBbXTtcbiAgICBjb29yZEVhY2goZ2VvanNvbiwgZnVuY3Rpb24gKGNvb3JkKSB7XG4gICAgICAgIGNvb3Jkcy5wdXNoKGNvb3JkKTtcbiAgICB9KTtcbiAgICByZXR1cm4gY29vcmRzO1xufVxuXG4vKipcbiAqIENhbGxiYWNrIGZvciBnZW9tRWFjaFxuICpcbiAqIEBjYWxsYmFjayBnZW9tRWFjaENhbGxiYWNrXG4gKiBAcGFyYW0ge0dlb21ldHJ5fSBjdXJyZW50R2VvbWV0cnkgVGhlIGN1cnJlbnQgZ2VvbWV0cnkgYmVpbmcgcHJvY2Vzc2VkLlxuICogQHBhcmFtIHtudW1iZXJ9IGN1cnJlbnRJbmRleCBUaGUgaW5kZXggb2YgdGhlIGN1cnJlbnQgZWxlbWVudCBiZWluZyBwcm9jZXNzZWQgaW4gdGhlXG4gKiBhcnJheS4gU3RhcnRzIGF0IGluZGV4IDAsIGlmIGFuIGluaXRpYWxWYWx1ZSBpcyBwcm92aWRlZCwgYW5kIGF0IGluZGV4IDEgb3RoZXJ3aXNlLlxuICogQHBhcmFtIHtudW1iZXJ9IGN1cnJlbnRQcm9wZXJ0aWVzIFRoZSBjdXJyZW50IGZlYXR1cmUgcHJvcGVydGllcyBiZWluZyBwcm9jZXNzZWQuXG4gKi9cblxuLyoqXG4gKiBJdGVyYXRlIG92ZXIgZWFjaCBnZW9tZXRyeSBpbiBhbnkgR2VvSlNPTiBvYmplY3QsIHNpbWlsYXIgdG8gQXJyYXkuZm9yRWFjaCgpXG4gKlxuICogQG5hbWUgZ2VvbUVhY2hcbiAqIEBwYXJhbSB7R2VvbWV0cnl8RmVhdHVyZUNvbGxlY3Rpb258RmVhdHVyZX0gZ2VvanNvbiBhbnkgR2VvSlNPTiBvYmplY3RcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIGEgbWV0aG9kIHRoYXQgdGFrZXMgKGN1cnJlbnRHZW9tZXRyeSwgZmVhdHVyZUluZGV4LCBjdXJyZW50UHJvcGVydGllcylcbiAqIEBleGFtcGxlXG4gKiB2YXIgZmVhdHVyZXMgPSB0dXJmLmZlYXR1cmVDb2xsZWN0aW9uKFtcbiAqICAgICB0dXJmLnBvaW50KFsyNiwgMzddLCB7Zm9vOiAnYmFyJ30pLFxuICogICAgIHR1cmYucG9pbnQoWzM2LCA1M10sIHtoZWxsbzogJ3dvcmxkJ30pXG4gKiBdKTtcbiAqXG4gKiB0dXJmLmdlb21FYWNoKGZlYXR1cmVzLCBmdW5jdGlvbiAoY3VycmVudEdlb21ldHJ5LCBmZWF0dXJlSW5kZXgsIGN1cnJlbnRQcm9wZXJ0aWVzKSB7XG4gKiAgIC8vPWN1cnJlbnRHZW9tZXRyeVxuICogICAvLz1mZWF0dXJlSW5kZXhcbiAqICAgLy89Y3VycmVudFByb3BlcnRpZXNcbiAqIH0pO1xuICovXG5mdW5jdGlvbiBnZW9tRWFjaChnZW9qc29uLCBjYWxsYmFjaykge1xuICAgIHZhciBpLCBqLCBnLCBnZW9tZXRyeSwgc3RvcEcsXG4gICAgICAgIGdlb21ldHJ5TWF5YmVDb2xsZWN0aW9uLFxuICAgICAgICBpc0dlb21ldHJ5Q29sbGVjdGlvbixcbiAgICAgICAgZ2VvbWV0cnlQcm9wZXJ0aWVzLFxuICAgICAgICBmZWF0dXJlSW5kZXggPSAwLFxuICAgICAgICBpc0ZlYXR1cmVDb2xsZWN0aW9uID0gZ2VvanNvbi50eXBlID09PSAnRmVhdHVyZUNvbGxlY3Rpb24nLFxuICAgICAgICBpc0ZlYXR1cmUgPSBnZW9qc29uLnR5cGUgPT09ICdGZWF0dXJlJyxcbiAgICAgICAgc3RvcCA9IGlzRmVhdHVyZUNvbGxlY3Rpb24gPyBnZW9qc29uLmZlYXR1cmVzLmxlbmd0aCA6IDE7XG5cbiAgLy8gVGhpcyBsb2dpYyBtYXkgbG9vayBhIGxpdHRsZSB3ZWlyZC4gVGhlIHJlYXNvbiB3aHkgaXQgaXMgdGhhdCB3YXlcbiAgLy8gaXMgYmVjYXVzZSBpdCdzIHRyeWluZyB0byBiZSBmYXN0LiBHZW9KU09OIHN1cHBvcnRzIG11bHRpcGxlIGtpbmRzXG4gIC8vIG9mIG9iamVjdHMgYXQgaXRzIHJvb3Q6IEZlYXR1cmVDb2xsZWN0aW9uLCBGZWF0dXJlcywgR2VvbWV0cmllcy5cbiAgLy8gVGhpcyBmdW5jdGlvbiBoYXMgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIGhhbmRsaW5nIGFsbCBvZiB0aGVtLCBhbmQgdGhhdFxuICAvLyBtZWFucyB0aGF0IHNvbWUgb2YgdGhlIGBmb3JgIGxvb3BzIHlvdSBzZWUgYmVsb3cgYWN0dWFsbHkganVzdCBkb24ndCBhcHBseVxuICAvLyB0byBjZXJ0YWluIGlucHV0cy4gRm9yIGluc3RhbmNlLCBpZiB5b3UgZ2l2ZSB0aGlzIGp1c3QgYVxuICAvLyBQb2ludCBnZW9tZXRyeSwgdGhlbiBib3RoIGxvb3BzIGFyZSBzaG9ydC1jaXJjdWl0ZWQgYW5kIGFsbCB3ZSBkb1xuICAvLyBpcyBncmFkdWFsbHkgcmVuYW1lIHRoZSBpbnB1dCB1bnRpbCBpdCdzIGNhbGxlZCAnZ2VvbWV0cnknLlxuICAvL1xuICAvLyBUaGlzIGFsc28gYWltcyB0byBhbGxvY2F0ZSBhcyBmZXcgcmVzb3VyY2VzIGFzIHBvc3NpYmxlOiBqdXN0IGFcbiAgLy8gZmV3IG51bWJlcnMgYW5kIGJvb2xlYW5zLCByYXRoZXIgdGhhbiBhbnkgdGVtcG9yYXJ5IGFycmF5cyBhcyB3b3VsZFxuICAvLyBiZSByZXF1aXJlZCB3aXRoIHRoZSBub3JtYWxpemF0aW9uIGFwcHJvYWNoLlxuICAgIGZvciAoaSA9IDA7IGkgPCBzdG9wOyBpKyspIHtcblxuICAgICAgICBnZW9tZXRyeU1heWJlQ29sbGVjdGlvbiA9IChpc0ZlYXR1cmVDb2xsZWN0aW9uID8gZ2VvanNvbi5mZWF0dXJlc1tpXS5nZW9tZXRyeSA6XG4gICAgICAgIChpc0ZlYXR1cmUgPyBnZW9qc29uLmdlb21ldHJ5IDogZ2VvanNvbikpO1xuICAgICAgICBnZW9tZXRyeVByb3BlcnRpZXMgPSAoaXNGZWF0dXJlQ29sbGVjdGlvbiA/IGdlb2pzb24uZmVhdHVyZXNbaV0ucHJvcGVydGllcyA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAoaXNGZWF0dXJlID8gZ2VvanNvbi5wcm9wZXJ0aWVzIDoge30pKTtcbiAgICAgICAgaXNHZW9tZXRyeUNvbGxlY3Rpb24gPSAoZ2VvbWV0cnlNYXliZUNvbGxlY3Rpb24pID8gZ2VvbWV0cnlNYXliZUNvbGxlY3Rpb24udHlwZSA9PT0gJ0dlb21ldHJ5Q29sbGVjdGlvbicgOiBmYWxzZTtcbiAgICAgICAgc3RvcEcgPSBpc0dlb21ldHJ5Q29sbGVjdGlvbiA/IGdlb21ldHJ5TWF5YmVDb2xsZWN0aW9uLmdlb21ldHJpZXMubGVuZ3RoIDogMTtcblxuICAgICAgICBmb3IgKGcgPSAwOyBnIDwgc3RvcEc7IGcrKykge1xuICAgICAgICAgICAgZ2VvbWV0cnkgPSBpc0dlb21ldHJ5Q29sbGVjdGlvbiA/XG4gICAgICAgICAgICBnZW9tZXRyeU1heWJlQ29sbGVjdGlvbi5nZW9tZXRyaWVzW2ddIDogZ2VvbWV0cnlNYXliZUNvbGxlY3Rpb247XG5cbiAgICAgICAgICAgIC8vIEhhbmRsZSBudWxsIEdlb21ldHJ5XG4gICAgICAgICAgICBpZiAoZ2VvbWV0cnkgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsLCBmZWF0dXJlSW5kZXgsIGdlb21ldHJ5UHJvcGVydGllcyk7XG4gICAgICAgICAgICAgICAgZmVhdHVyZUluZGV4Kys7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzd2l0Y2ggKGdlb21ldHJ5LnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ1BvaW50JzpcbiAgICAgICAgICAgIGNhc2UgJ0xpbmVTdHJpbmcnOlxuICAgICAgICAgICAgY2FzZSAnTXVsdGlQb2ludCc6XG4gICAgICAgICAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgICAgICAgIGNhc2UgJ011bHRpTGluZVN0cmluZyc6XG4gICAgICAgICAgICBjYXNlICdNdWx0aVBvbHlnb24nOiB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZ2VvbWV0cnksIGZlYXR1cmVJbmRleCwgZ2VvbWV0cnlQcm9wZXJ0aWVzKTtcbiAgICAgICAgICAgICAgICBmZWF0dXJlSW5kZXgrKztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ0dlb21ldHJ5Q29sbGVjdGlvbic6IHtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgZ2VvbWV0cnkuZ2VvbWV0cmllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhnZW9tZXRyeS5nZW9tZXRyaWVzW2pdLCBmZWF0dXJlSW5kZXgsIGdlb21ldHJ5UHJvcGVydGllcyk7XG4gICAgICAgICAgICAgICAgICAgIGZlYXR1cmVJbmRleCsrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRlZmF1bHQ6IHRocm93IG5ldyBFcnJvcignVW5rbm93biBHZW9tZXRyeSBUeXBlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8qKlxuICogQ2FsbGJhY2sgZm9yIGdlb21SZWR1Y2VcbiAqXG4gKiBUaGUgZmlyc3QgdGltZSB0aGUgY2FsbGJhY2sgZnVuY3Rpb24gaXMgY2FsbGVkLCB0aGUgdmFsdWVzIHByb3ZpZGVkIGFzIGFyZ3VtZW50cyBkZXBlbmRcbiAqIG9uIHdoZXRoZXIgdGhlIHJlZHVjZSBtZXRob2QgaGFzIGFuIGluaXRpYWxWYWx1ZSBhcmd1bWVudC5cbiAqXG4gKiBJZiBhbiBpbml0aWFsVmFsdWUgaXMgcHJvdmlkZWQgdG8gdGhlIHJlZHVjZSBtZXRob2Q6XG4gKiAgLSBUaGUgcHJldmlvdXNWYWx1ZSBhcmd1bWVudCBpcyBpbml0aWFsVmFsdWUuXG4gKiAgLSBUaGUgY3VycmVudFZhbHVlIGFyZ3VtZW50IGlzIHRoZSB2YWx1ZSBvZiB0aGUgZmlyc3QgZWxlbWVudCBwcmVzZW50IGluIHRoZSBhcnJheS5cbiAqXG4gKiBJZiBhbiBpbml0aWFsVmFsdWUgaXMgbm90IHByb3ZpZGVkOlxuICogIC0gVGhlIHByZXZpb3VzVmFsdWUgYXJndW1lbnQgaXMgdGhlIHZhbHVlIG9mIHRoZSBmaXJzdCBlbGVtZW50IHByZXNlbnQgaW4gdGhlIGFycmF5LlxuICogIC0gVGhlIGN1cnJlbnRWYWx1ZSBhcmd1bWVudCBpcyB0aGUgdmFsdWUgb2YgdGhlIHNlY29uZCBlbGVtZW50IHByZXNlbnQgaW4gdGhlIGFycmF5LlxuICpcbiAqIEBjYWxsYmFjayBnZW9tUmVkdWNlQ2FsbGJhY2tcbiAqIEBwYXJhbSB7Kn0gcHJldmlvdXNWYWx1ZSBUaGUgYWNjdW11bGF0ZWQgdmFsdWUgcHJldmlvdXNseSByZXR1cm5lZCBpbiB0aGUgbGFzdCBpbnZvY2F0aW9uXG4gKiBvZiB0aGUgY2FsbGJhY2ssIG9yIGluaXRpYWxWYWx1ZSwgaWYgc3VwcGxpZWQuXG4gKiBAcGFyYW0ge0dlb21ldHJ5fSBjdXJyZW50R2VvbWV0cnkgVGhlIGN1cnJlbnQgRmVhdHVyZSBiZWluZyBwcm9jZXNzZWQuXG4gKiBAcGFyYW0ge251bWJlcn0gY3VycmVudEluZGV4IFRoZSBpbmRleCBvZiB0aGUgY3VycmVudCBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZCBpbiB0aGVcbiAqIGFycmF5LlN0YXJ0cyBhdCBpbmRleCAwLCBpZiBhbiBpbml0aWFsVmFsdWUgaXMgcHJvdmlkZWQsIGFuZCBhdCBpbmRleCAxIG90aGVyd2lzZS5cbiAqIEBwYXJhbSB7T2JqZWN0fSBjdXJyZW50UHJvcGVydGllcyBUaGUgY3VycmVudCBmZWF0dXJlIHByb3BlcnRpZXMgYmVpbmcgcHJvY2Vzc2VkLlxuICovXG5cbi8qKlxuICogUmVkdWNlIGdlb21ldHJ5IGluIGFueSBHZW9KU09OIG9iamVjdCwgc2ltaWxhciB0byBBcnJheS5yZWR1Y2UoKS5cbiAqXG4gKiBAbmFtZSBnZW9tUmVkdWNlXG4gKiBAcGFyYW0ge0dlb21ldHJ5fEZlYXR1cmVDb2xsZWN0aW9ufEZlYXR1cmV9IGdlb2pzb24gYW55IEdlb0pTT04gb2JqZWN0XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBhIG1ldGhvZCB0aGF0IHRha2VzIChwcmV2aW91c1ZhbHVlLCBjdXJyZW50R2VvbWV0cnksIGZlYXR1cmVJbmRleCwgY3VycmVudFByb3BlcnRpZXMpXG4gKiBAcGFyYW0geyp9IFtpbml0aWFsVmFsdWVdIFZhbHVlIHRvIHVzZSBhcyB0aGUgZmlyc3QgYXJndW1lbnQgdG8gdGhlIGZpcnN0IGNhbGwgb2YgdGhlIGNhbGxiYWNrLlxuICogQHJldHVybnMgeyp9IFRoZSB2YWx1ZSB0aGF0IHJlc3VsdHMgZnJvbSB0aGUgcmVkdWN0aW9uLlxuICogQGV4YW1wbGVcbiAqIHZhciBmZWF0dXJlcyA9IHR1cmYuZmVhdHVyZUNvbGxlY3Rpb24oW1xuICogICAgIHR1cmYucG9pbnQoWzI2LCAzN10sIHtmb286ICdiYXInfSksXG4gKiAgICAgdHVyZi5wb2ludChbMzYsIDUzXSwge2hlbGxvOiAnd29ybGQnfSlcbiAqIF0pO1xuICpcbiAqIHR1cmYuZ2VvbVJlZHVjZShmZWF0dXJlcywgZnVuY3Rpb24gKHByZXZpb3VzVmFsdWUsIGN1cnJlbnRHZW9tZXRyeSwgZmVhdHVyZUluZGV4LCBjdXJyZW50UHJvcGVydGllcykge1xuICogICAvLz1wcmV2aW91c1ZhbHVlXG4gKiAgIC8vPWN1cnJlbnRHZW9tZXRyeVxuICogICAvLz1mZWF0dXJlSW5kZXhcbiAqICAgLy89Y3VycmVudFByb3BlcnRpZXNcbiAqICAgcmV0dXJuIGN1cnJlbnRHZW9tZXRyeVxuICogfSk7XG4gKi9cbmZ1bmN0aW9uIGdlb21SZWR1Y2UoZ2VvanNvbiwgY2FsbGJhY2ssIGluaXRpYWxWYWx1ZSkge1xuICAgIHZhciBwcmV2aW91c1ZhbHVlID0gaW5pdGlhbFZhbHVlO1xuICAgIGdlb21FYWNoKGdlb2pzb24sIGZ1bmN0aW9uIChjdXJyZW50R2VvbWV0cnksIGN1cnJlbnRJbmRleCwgY3VycmVudFByb3BlcnRpZXMpIHtcbiAgICAgICAgaWYgKGN1cnJlbnRJbmRleCA9PT0gMCAmJiBpbml0aWFsVmFsdWUgPT09IHVuZGVmaW5lZCkgcHJldmlvdXNWYWx1ZSA9IGN1cnJlbnRHZW9tZXRyeTtcbiAgICAgICAgZWxzZSBwcmV2aW91c1ZhbHVlID0gY2FsbGJhY2socHJldmlvdXNWYWx1ZSwgY3VycmVudEdlb21ldHJ5LCBjdXJyZW50SW5kZXgsIGN1cnJlbnRQcm9wZXJ0aWVzKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcHJldmlvdXNWYWx1ZTtcbn1cblxuLyoqXG4gKiBDYWxsYmFjayBmb3IgZmxhdHRlbkVhY2hcbiAqXG4gKiBAY2FsbGJhY2sgZmxhdHRlbkVhY2hDYWxsYmFja1xuICogQHBhcmFtIHtGZWF0dXJlfSBjdXJyZW50RmVhdHVyZSBUaGUgY3VycmVudCBmbGF0dGVuZWQgZmVhdHVyZSBiZWluZyBwcm9jZXNzZWQuXG4gKiBAcGFyYW0ge251bWJlcn0gZmVhdHVyZUluZGV4IFRoZSBpbmRleCBvZiB0aGUgY3VycmVudCBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZCBpbiB0aGVcbiAqIGFycmF5LiBTdGFydHMgYXQgaW5kZXggMCwgaWYgYW4gaW5pdGlhbFZhbHVlIGlzIHByb3ZpZGVkLCBhbmQgYXQgaW5kZXggMSBvdGhlcndpc2UuXG4gKiBAcGFyYW0ge251bWJlcn0gZmVhdHVyZVN1YkluZGV4IFRoZSBzdWJpbmRleCBvZiB0aGUgY3VycmVudCBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZCBpbiB0aGVcbiAqIGFycmF5LiBTdGFydHMgYXQgaW5kZXggMCBhbmQgaW5jcmVhc2VzIGlmIHRoZSBmbGF0dGVuZWQgZmVhdHVyZSB3YXMgYSBtdWx0aS1nZW9tZXRyeS5cbiAqL1xuXG4vKipcbiAqIEl0ZXJhdGUgb3ZlciBmbGF0dGVuZWQgZmVhdHVyZXMgaW4gYW55IEdlb0pTT04gb2JqZWN0LCBzaW1pbGFyIHRvXG4gKiBBcnJheS5mb3JFYWNoLlxuICpcbiAqIEBuYW1lIGZsYXR0ZW5FYWNoXG4gKiBAcGFyYW0ge0dlb21ldHJ5fEZlYXR1cmVDb2xsZWN0aW9ufEZlYXR1cmV9IGdlb2pzb24gYW55IEdlb0pTT04gb2JqZWN0XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBhIG1ldGhvZCB0aGF0IHRha2VzIChjdXJyZW50RmVhdHVyZSwgZmVhdHVyZUluZGV4LCBmZWF0dXJlU3ViSW5kZXgpXG4gKiBAZXhhbXBsZVxuICogdmFyIGZlYXR1cmVzID0gdHVyZi5mZWF0dXJlQ29sbGVjdGlvbihbXG4gKiAgICAgdHVyZi5wb2ludChbMjYsIDM3XSwge2ZvbzogJ2Jhcid9KSxcbiAqICAgICB0dXJmLm11bHRpUG9pbnQoW1s0MCwgMzBdLCBbMzYsIDUzXV0sIHtoZWxsbzogJ3dvcmxkJ30pXG4gKiBdKTtcbiAqXG4gKiB0dXJmLmZsYXR0ZW5FYWNoKGZlYXR1cmVzLCBmdW5jdGlvbiAoY3VycmVudEZlYXR1cmUsIGZlYXR1cmVJbmRleCwgZmVhdHVyZVN1YkluZGV4KSB7XG4gKiAgIC8vPWN1cnJlbnRGZWF0dXJlXG4gKiAgIC8vPWZlYXR1cmVJbmRleFxuICogICAvLz1mZWF0dXJlU3ViSW5kZXhcbiAqIH0pO1xuICovXG5mdW5jdGlvbiBmbGF0dGVuRWFjaChnZW9qc29uLCBjYWxsYmFjaykge1xuICAgIGdlb21FYWNoKGdlb2pzb24sIGZ1bmN0aW9uIChnZW9tZXRyeSwgZmVhdHVyZUluZGV4LCBwcm9wZXJ0aWVzKSB7XG4gICAgICAgIC8vIENhbGxiYWNrIGZvciBzaW5nbGUgZ2VvbWV0cnlcbiAgICAgICAgdmFyIHR5cGUgPSAoZ2VvbWV0cnkgPT09IG51bGwpID8gbnVsbCA6IGdlb21ldHJ5LnR5cGU7XG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIG51bGw6XG4gICAgICAgIGNhc2UgJ1BvaW50JzpcbiAgICAgICAgY2FzZSAnTGluZVN0cmluZyc6XG4gICAgICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgICAgICAgY2FsbGJhY2soZmVhdHVyZShnZW9tZXRyeSwgcHJvcGVydGllcyksIGZlYXR1cmVJbmRleCwgMCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZ2VvbVR5cGU7XG5cbiAgICAgICAgLy8gQ2FsbGJhY2sgZm9yIG11bHRpLWdlb21ldHJ5XG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlICdNdWx0aVBvaW50JzpcbiAgICAgICAgICAgIGdlb21UeXBlID0gJ1BvaW50JztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdNdWx0aUxpbmVTdHJpbmcnOlxuICAgICAgICAgICAgZ2VvbVR5cGUgPSAnTGluZVN0cmluZyc7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnTXVsdGlQb2x5Z29uJzpcbiAgICAgICAgICAgIGdlb21UeXBlID0gJ1BvbHlnb24nO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICBnZW9tZXRyeS5jb29yZGluYXRlcy5mb3JFYWNoKGZ1bmN0aW9uIChjb29yZGluYXRlLCBmZWF0dXJlU3ViSW5kZXgpIHtcbiAgICAgICAgICAgIHZhciBnZW9tID0ge1xuICAgICAgICAgICAgICAgIHR5cGU6IGdlb21UeXBlLFxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzOiBjb29yZGluYXRlXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY2FsbGJhY2soZmVhdHVyZShnZW9tLCBwcm9wZXJ0aWVzKSwgZmVhdHVyZUluZGV4LCBmZWF0dXJlU3ViSW5kZXgpO1xuICAgICAgICB9KTtcblxuICAgIH0pO1xufVxuXG4vKipcbiAqIENhbGxiYWNrIGZvciBmbGF0dGVuUmVkdWNlXG4gKlxuICogVGhlIGZpcnN0IHRpbWUgdGhlIGNhbGxiYWNrIGZ1bmN0aW9uIGlzIGNhbGxlZCwgdGhlIHZhbHVlcyBwcm92aWRlZCBhcyBhcmd1bWVudHMgZGVwZW5kXG4gKiBvbiB3aGV0aGVyIHRoZSByZWR1Y2UgbWV0aG9kIGhhcyBhbiBpbml0aWFsVmFsdWUgYXJndW1lbnQuXG4gKlxuICogSWYgYW4gaW5pdGlhbFZhbHVlIGlzIHByb3ZpZGVkIHRvIHRoZSByZWR1Y2UgbWV0aG9kOlxuICogIC0gVGhlIHByZXZpb3VzVmFsdWUgYXJndW1lbnQgaXMgaW5pdGlhbFZhbHVlLlxuICogIC0gVGhlIGN1cnJlbnRWYWx1ZSBhcmd1bWVudCBpcyB0aGUgdmFsdWUgb2YgdGhlIGZpcnN0IGVsZW1lbnQgcHJlc2VudCBpbiB0aGUgYXJyYXkuXG4gKlxuICogSWYgYW4gaW5pdGlhbFZhbHVlIGlzIG5vdCBwcm92aWRlZDpcbiAqICAtIFRoZSBwcmV2aW91c1ZhbHVlIGFyZ3VtZW50IGlzIHRoZSB2YWx1ZSBvZiB0aGUgZmlyc3QgZWxlbWVudCBwcmVzZW50IGluIHRoZSBhcnJheS5cbiAqICAtIFRoZSBjdXJyZW50VmFsdWUgYXJndW1lbnQgaXMgdGhlIHZhbHVlIG9mIHRoZSBzZWNvbmQgZWxlbWVudCBwcmVzZW50IGluIHRoZSBhcnJheS5cbiAqXG4gKiBAY2FsbGJhY2sgZmxhdHRlblJlZHVjZUNhbGxiYWNrXG4gKiBAcGFyYW0geyp9IHByZXZpb3VzVmFsdWUgVGhlIGFjY3VtdWxhdGVkIHZhbHVlIHByZXZpb3VzbHkgcmV0dXJuZWQgaW4gdGhlIGxhc3QgaW52b2NhdGlvblxuICogb2YgdGhlIGNhbGxiYWNrLCBvciBpbml0aWFsVmFsdWUsIGlmIHN1cHBsaWVkLlxuICogQHBhcmFtIHtGZWF0dXJlfSBjdXJyZW50RmVhdHVyZSBUaGUgY3VycmVudCBGZWF0dXJlIGJlaW5nIHByb2Nlc3NlZC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBmZWF0dXJlSW5kZXggVGhlIGluZGV4IG9mIHRoZSBjdXJyZW50IGVsZW1lbnQgYmVpbmcgcHJvY2Vzc2VkIGluIHRoZVxuICogYXJyYXkuU3RhcnRzIGF0IGluZGV4IDAsIGlmIGFuIGluaXRpYWxWYWx1ZSBpcyBwcm92aWRlZCwgYW5kIGF0IGluZGV4IDEgb3RoZXJ3aXNlLlxuICogQHBhcmFtIHtudW1iZXJ9IGZlYXR1cmVTdWJJbmRleCBUaGUgc3ViaW5kZXggb2YgdGhlIGN1cnJlbnQgZWxlbWVudCBiZWluZyBwcm9jZXNzZWQgaW4gdGhlXG4gKiBhcnJheS4gU3RhcnRzIGF0IGluZGV4IDAgYW5kIGluY3JlYXNlcyBpZiB0aGUgZmxhdHRlbmVkIGZlYXR1cmUgd2FzIGEgbXVsdGktZ2VvbWV0cnkuXG4gKi9cblxuLyoqXG4gKiBSZWR1Y2UgZmxhdHRlbmVkIGZlYXR1cmVzIGluIGFueSBHZW9KU09OIG9iamVjdCwgc2ltaWxhciB0byBBcnJheS5yZWR1Y2UoKS5cbiAqXG4gKiBAbmFtZSBmbGF0dGVuUmVkdWNlXG4gKiBAcGFyYW0ge0dlb21ldHJ5fEZlYXR1cmVDb2xsZWN0aW9ufEZlYXR1cmV9IGdlb2pzb24gYW55IEdlb0pTT04gb2JqZWN0XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBhIG1ldGhvZCB0aGF0IHRha2VzIChwcmV2aW91c1ZhbHVlLCBjdXJyZW50RmVhdHVyZSwgZmVhdHVyZUluZGV4LCBmZWF0dXJlU3ViSW5kZXgpXG4gKiBAcGFyYW0geyp9IFtpbml0aWFsVmFsdWVdIFZhbHVlIHRvIHVzZSBhcyB0aGUgZmlyc3QgYXJndW1lbnQgdG8gdGhlIGZpcnN0IGNhbGwgb2YgdGhlIGNhbGxiYWNrLlxuICogQHJldHVybnMgeyp9IFRoZSB2YWx1ZSB0aGF0IHJlc3VsdHMgZnJvbSB0aGUgcmVkdWN0aW9uLlxuICogQGV4YW1wbGVcbiAqIHZhciBmZWF0dXJlcyA9IHR1cmYuZmVhdHVyZUNvbGxlY3Rpb24oW1xuICogICAgIHR1cmYucG9pbnQoWzI2LCAzN10sIHtmb286ICdiYXInfSksXG4gKiAgICAgdHVyZi5tdWx0aVBvaW50KFtbNDAsIDMwXSwgWzM2LCA1M11dLCB7aGVsbG86ICd3b3JsZCd9KVxuICogXSk7XG4gKlxuICogdHVyZi5mbGF0dGVuUmVkdWNlKGZlYXR1cmVzLCBmdW5jdGlvbiAocHJldmlvdXNWYWx1ZSwgY3VycmVudEZlYXR1cmUsIGZlYXR1cmVJbmRleCwgZmVhdHVyZVN1YkluZGV4KSB7XG4gKiAgIC8vPXByZXZpb3VzVmFsdWVcbiAqICAgLy89Y3VycmVudEZlYXR1cmVcbiAqICAgLy89ZmVhdHVyZUluZGV4XG4gKiAgIC8vPWZlYXR1cmVTdWJJbmRleFxuICogICByZXR1cm4gY3VycmVudEZlYXR1cmVcbiAqIH0pO1xuICovXG5mdW5jdGlvbiBmbGF0dGVuUmVkdWNlKGdlb2pzb24sIGNhbGxiYWNrLCBpbml0aWFsVmFsdWUpIHtcbiAgICB2YXIgcHJldmlvdXNWYWx1ZSA9IGluaXRpYWxWYWx1ZTtcbiAgICBmbGF0dGVuRWFjaChnZW9qc29uLCBmdW5jdGlvbiAoY3VycmVudEZlYXR1cmUsIGZlYXR1cmVJbmRleCwgZmVhdHVyZVN1YkluZGV4KSB7XG4gICAgICAgIGlmIChmZWF0dXJlSW5kZXggPT09IDAgJiYgZmVhdHVyZVN1YkluZGV4ID09PSAwICYmIGluaXRpYWxWYWx1ZSA9PT0gdW5kZWZpbmVkKSBwcmV2aW91c1ZhbHVlID0gY3VycmVudEZlYXR1cmU7XG4gICAgICAgIGVsc2UgcHJldmlvdXNWYWx1ZSA9IGNhbGxiYWNrKHByZXZpb3VzVmFsdWUsIGN1cnJlbnRGZWF0dXJlLCBmZWF0dXJlSW5kZXgsIGZlYXR1cmVTdWJJbmRleCk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHByZXZpb3VzVmFsdWU7XG59XG5cbi8qKlxuICogQ2FsbGJhY2sgZm9yIHNlZ21lbnRFYWNoXG4gKlxuICogQGNhbGxiYWNrIHNlZ21lbnRFYWNoQ2FsbGJhY2tcbiAqIEBwYXJhbSB7RmVhdHVyZTxMaW5lU3RyaW5nPn0gY3VycmVudFNlZ21lbnQgVGhlIGN1cnJlbnQgc2VnbWVudCBiZWluZyBwcm9jZXNzZWQuXG4gKiBAcGFyYW0ge251bWJlcn0gZmVhdHVyZUluZGV4IFRoZSBpbmRleCBvZiB0aGUgY3VycmVudCBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZCBpbiB0aGUgYXJyYXksIHN0YXJ0cyBhdCBpbmRleCAwLlxuICogQHBhcmFtIHtudW1iZXJ9IGZlYXR1cmVTdWJJbmRleCBUaGUgc3ViaW5kZXggb2YgdGhlIGN1cnJlbnQgZWxlbWVudCBiZWluZyBwcm9jZXNzZWQgaW4gdGhlXG4gKiBhcnJheS4gU3RhcnRzIGF0IGluZGV4IDAgYW5kIGluY3JlYXNlcyBmb3IgZWFjaCBpdGVyYXRpbmcgbGluZSBzZWdtZW50LlxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cblxuLyoqXG4gKiBJdGVyYXRlIG92ZXIgMi12ZXJ0ZXggbGluZSBzZWdtZW50IGluIGFueSBHZW9KU09OIG9iamVjdCwgc2ltaWxhciB0byBBcnJheS5mb3JFYWNoKClcbiAqIChNdWx0aSlQb2ludCBnZW9tZXRyaWVzIGRvIG5vdCBjb250YWluIHNlZ21lbnRzIHRoZXJlZm9yZSB0aGV5IGFyZSBpZ25vcmVkIGR1cmluZyB0aGlzIG9wZXJhdGlvbi5cbiAqXG4gKiBAcGFyYW0ge0ZlYXR1cmVDb2xsZWN0aW9ufEZlYXR1cmV8R2VvbWV0cnl9IGdlb2pzb24gYW55IEdlb0pTT05cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIGEgbWV0aG9kIHRoYXQgdGFrZXMgKGN1cnJlbnRTZWdtZW50LCBmZWF0dXJlSW5kZXgsIGZlYXR1cmVTdWJJbmRleClcbiAqIEByZXR1cm5zIHt2b2lkfVxuICogQGV4YW1wbGVcbiAqIHZhciBwb2x5Z29uID0gdHVyZi5wb2x5Z29uKFtbWy01MCwgNV0sIFstNDAsIC0xMF0sIFstNTAsIC0xMF0sIFstNDAsIDVdLCBbLTUwLCA1XV1dKTtcbiAqXG4gKiAvLyBJdGVyYXRlIG92ZXIgR2VvSlNPTiBieSAyLXZlcnRleCBzZWdtZW50c1xuICogdHVyZi5zZWdtZW50RWFjaChwb2x5Z29uLCBmdW5jdGlvbiAoY3VycmVudFNlZ21lbnQsIGZlYXR1cmVJbmRleCwgZmVhdHVyZVN1YkluZGV4KSB7XG4gKiAgIC8vPSBjdXJyZW50U2VnbWVudFxuICogICAvLz0gZmVhdHVyZUluZGV4XG4gKiAgIC8vPSBmZWF0dXJlU3ViSW5kZXhcbiAqIH0pO1xuICpcbiAqIC8vIENhbGN1bGF0ZSB0aGUgdG90YWwgbnVtYmVyIG9mIHNlZ21lbnRzXG4gKiB2YXIgdG90YWwgPSAwO1xuICogdmFyIGluaXRpYWxWYWx1ZSA9IDA7XG4gKiB0dXJmLnNlZ21lbnRFYWNoKHBvbHlnb24sIGZ1bmN0aW9uICgpIHtcbiAqICAgICB0b3RhbCsrO1xuICogfSwgaW5pdGlhbFZhbHVlKTtcbiAqL1xuZnVuY3Rpb24gc2VnbWVudEVhY2goZ2VvanNvbiwgY2FsbGJhY2spIHtcbiAgICBmbGF0dGVuRWFjaChnZW9qc29uLCBmdW5jdGlvbiAoZmVhdHVyZSwgZmVhdHVyZUluZGV4KSB7XG4gICAgICAgIHZhciBmZWF0dXJlU3ViSW5kZXggPSAwO1xuICAgICAgICAvLyBFeGNsdWRlIG51bGwgR2VvbWV0cmllc1xuICAgICAgICBpZiAoIWZlYXR1cmUuZ2VvbWV0cnkpIHJldHVybjtcbiAgICAgICAgLy8gKE11bHRpKVBvaW50IGdlb21ldHJpZXMgZG8gbm90IGNvbnRhaW4gc2VnbWVudHMgdGhlcmVmb3JlIHRoZXkgYXJlIGlnbm9yZWQgZHVyaW5nIHRoaXMgb3BlcmF0aW9uLlxuICAgICAgICB2YXIgdHlwZSA9IGZlYXR1cmUuZ2VvbWV0cnkudHlwZTtcbiAgICAgICAgaWYgKHR5cGUgPT09ICdQb2ludCcgfHwgdHlwZSA9PT0gJ011bHRpUG9pbnQnKSByZXR1cm47XG5cbiAgICAgICAgLy8gR2VuZXJhdGUgMi12ZXJ0ZXggbGluZSBzZWdtZW50c1xuICAgICAgICBjb29yZFJlZHVjZShmZWF0dXJlLCBmdW5jdGlvbiAocHJldmlvdXNDb29yZHMsIGN1cnJlbnRDb29yZCkge1xuICAgICAgICAgICAgdmFyIGN1cnJlbnRTZWdtZW50ID0gbGluZVN0cmluZyhbcHJldmlvdXNDb29yZHMsIGN1cnJlbnRDb29yZF0sIGZlYXR1cmUucHJvcGVydGllcyk7XG4gICAgICAgICAgICBjYWxsYmFjayhjdXJyZW50U2VnbWVudCwgZmVhdHVyZUluZGV4LCBmZWF0dXJlU3ViSW5kZXgpO1xuICAgICAgICAgICAgZmVhdHVyZVN1YkluZGV4Kys7XG4gICAgICAgICAgICByZXR1cm4gY3VycmVudENvb3JkO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuLyoqXG4gKiBDYWxsYmFjayBmb3Igc2VnbWVudFJlZHVjZVxuICpcbiAqIFRoZSBmaXJzdCB0aW1lIHRoZSBjYWxsYmFjayBmdW5jdGlvbiBpcyBjYWxsZWQsIHRoZSB2YWx1ZXMgcHJvdmlkZWQgYXMgYXJndW1lbnRzIGRlcGVuZFxuICogb24gd2hldGhlciB0aGUgcmVkdWNlIG1ldGhvZCBoYXMgYW4gaW5pdGlhbFZhbHVlIGFyZ3VtZW50LlxuICpcbiAqIElmIGFuIGluaXRpYWxWYWx1ZSBpcyBwcm92aWRlZCB0byB0aGUgcmVkdWNlIG1ldGhvZDpcbiAqICAtIFRoZSBwcmV2aW91c1ZhbHVlIGFyZ3VtZW50IGlzIGluaXRpYWxWYWx1ZS5cbiAqICAtIFRoZSBjdXJyZW50VmFsdWUgYXJndW1lbnQgaXMgdGhlIHZhbHVlIG9mIHRoZSBmaXJzdCBlbGVtZW50IHByZXNlbnQgaW4gdGhlIGFycmF5LlxuICpcbiAqIElmIGFuIGluaXRpYWxWYWx1ZSBpcyBub3QgcHJvdmlkZWQ6XG4gKiAgLSBUaGUgcHJldmlvdXNWYWx1ZSBhcmd1bWVudCBpcyB0aGUgdmFsdWUgb2YgdGhlIGZpcnN0IGVsZW1lbnQgcHJlc2VudCBpbiB0aGUgYXJyYXkuXG4gKiAgLSBUaGUgY3VycmVudFZhbHVlIGFyZ3VtZW50IGlzIHRoZSB2YWx1ZSBvZiB0aGUgc2Vjb25kIGVsZW1lbnQgcHJlc2VudCBpbiB0aGUgYXJyYXkuXG4gKlxuICogQGNhbGxiYWNrIHNlZ21lbnRSZWR1Y2VDYWxsYmFja1xuICogQHBhcmFtIHsqfSBbcHJldmlvdXNWYWx1ZV0gVGhlIGFjY3VtdWxhdGVkIHZhbHVlIHByZXZpb3VzbHkgcmV0dXJuZWQgaW4gdGhlIGxhc3QgaW52b2NhdGlvblxuICogb2YgdGhlIGNhbGxiYWNrLCBvciBpbml0aWFsVmFsdWUsIGlmIHN1cHBsaWVkLlxuICogQHBhcmFtIHtGZWF0dXJlPExpbmVTdHJpbmc+fSBbY3VycmVudFNlZ21lbnRdIFRoZSBjdXJyZW50IHNlZ21lbnQgYmVpbmcgcHJvY2Vzc2VkLlxuICogQHBhcmFtIHtudW1iZXJ9IFtjdXJyZW50SW5kZXhdIFRoZSBpbmRleCBvZiB0aGUgY3VycmVudCBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZCBpbiB0aGVcbiAqIGFycmF5LiBTdGFydHMgYXQgaW5kZXggMCwgaWYgYW4gaW5pdGlhbFZhbHVlIGlzIHByb3ZpZGVkLCBhbmQgYXQgaW5kZXggMSBvdGhlcndpc2UuXG4gKiBAcGFyYW0ge251bWJlcn0gW2N1cnJlbnRTdWJJbmRleF0gVGhlIHN1YmluZGV4IG9mIHRoZSBjdXJyZW50IGVsZW1lbnQgYmVpbmcgcHJvY2Vzc2VkIGluIHRoZVxuICogYXJyYXkuIFN0YXJ0cyBhdCBpbmRleCAwIGFuZCBpbmNyZWFzZXMgZm9yIGVhY2ggaXRlcmF0aW5nIGxpbmUgc2VnbWVudC5cbiAqL1xuXG4vKipcbiAqIFJlZHVjZSAyLXZlcnRleCBsaW5lIHNlZ21lbnQgaW4gYW55IEdlb0pTT04gb2JqZWN0LCBzaW1pbGFyIHRvIEFycmF5LnJlZHVjZSgpXG4gKiAoTXVsdGkpUG9pbnQgZ2VvbWV0cmllcyBkbyBub3QgY29udGFpbiBzZWdtZW50cyB0aGVyZWZvcmUgdGhleSBhcmUgaWdub3JlZCBkdXJpbmcgdGhpcyBvcGVyYXRpb24uXG4gKlxuICogQHBhcmFtIHtGZWF0dXJlQ29sbGVjdGlvbnxGZWF0dXJlfEdlb21ldHJ5fSBnZW9qc29uIGFueSBHZW9KU09OXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBhIG1ldGhvZCB0aGF0IHRha2VzIChwcmV2aW91c1ZhbHVlLCBjdXJyZW50U2VnbWVudCwgY3VycmVudEluZGV4KVxuICogQHBhcmFtIHsqfSBbaW5pdGlhbFZhbHVlXSBWYWx1ZSB0byB1c2UgYXMgdGhlIGZpcnN0IGFyZ3VtZW50IHRvIHRoZSBmaXJzdCBjYWxsIG9mIHRoZSBjYWxsYmFjay5cbiAqIEByZXR1cm5zIHt2b2lkfVxuICogQGV4YW1wbGVcbiAqIHZhciBwb2x5Z29uID0gdHVyZi5wb2x5Z29uKFtbWy01MCwgNV0sIFstNDAsIC0xMF0sIFstNTAsIC0xMF0sIFstNDAsIDVdLCBbLTUwLCA1XV1dKTtcbiAqXG4gKiAvLyBJdGVyYXRlIG92ZXIgR2VvSlNPTiBieSAyLXZlcnRleCBzZWdtZW50c1xuICogdHVyZi5zZWdtZW50UmVkdWNlKHBvbHlnb24sIGZ1bmN0aW9uIChwcmV2aW91c1NlZ21lbnQsIGN1cnJlbnRTZWdtZW50LCBjdXJyZW50SW5kZXgsIGN1cnJlbnRTdWJJbmRleCkge1xuICogICAvLz0gcHJldmlvdXNTZWdtZW50XG4gKiAgIC8vPSBjdXJyZW50U2VnbWVudFxuICogICAvLz0gY3VycmVudEluZGV4XG4gKiAgIC8vPSBjdXJyZW50U3ViSW5kZXhcbiAqICAgcmV0dXJuIGN1cnJlbnRTZWdtZW50XG4gKiB9KTtcbiAqXG4gKiAvLyBDYWxjdWxhdGUgdGhlIHRvdGFsIG51bWJlciBvZiBzZWdtZW50c1xuICogdmFyIGluaXRpYWxWYWx1ZSA9IDBcbiAqIHZhciB0b3RhbCA9IHR1cmYuc2VnbWVudFJlZHVjZShwb2x5Z29uLCBmdW5jdGlvbiAocHJldmlvdXNWYWx1ZSkge1xuICogICAgIHByZXZpb3VzVmFsdWUrKztcbiAqICAgICByZXR1cm4gcHJldmlvdXNWYWx1ZTtcbiAqIH0sIGluaXRpYWxWYWx1ZSk7XG4gKi9cbmZ1bmN0aW9uIHNlZ21lbnRSZWR1Y2UoZ2VvanNvbiwgY2FsbGJhY2ssIGluaXRpYWxWYWx1ZSkge1xuICAgIHZhciBwcmV2aW91c1ZhbHVlID0gaW5pdGlhbFZhbHVlO1xuICAgIHNlZ21lbnRFYWNoKGdlb2pzb24sIGZ1bmN0aW9uIChjdXJyZW50U2VnbWVudCwgY3VycmVudEluZGV4LCBjdXJyZW50U3ViSW5kZXgpIHtcbiAgICAgICAgaWYgKGN1cnJlbnRJbmRleCA9PT0gMCAmJiBpbml0aWFsVmFsdWUgPT09IHVuZGVmaW5lZCkgcHJldmlvdXNWYWx1ZSA9IGN1cnJlbnRTZWdtZW50O1xuICAgICAgICBlbHNlIHByZXZpb3VzVmFsdWUgPSBjYWxsYmFjayhwcmV2aW91c1ZhbHVlLCBjdXJyZW50U2VnbWVudCwgY3VycmVudEluZGV4LCBjdXJyZW50U3ViSW5kZXgpO1xuICAgIH0pO1xuICAgIHJldHVybiBwcmV2aW91c1ZhbHVlO1xufVxuXG4vKipcbiAqIENyZWF0ZSBGZWF0dXJlXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7R2VvbWV0cnl9IGdlb21ldHJ5IEdlb0pTT04gR2VvbWV0cnlcbiAqIEBwYXJhbSB7T2JqZWN0fSBwcm9wZXJ0aWVzIFByb3BlcnRpZXNcbiAqIEByZXR1cm5zIHtGZWF0dXJlfSBHZW9KU09OIEZlYXR1cmVcbiAqL1xuZnVuY3Rpb24gZmVhdHVyZShnZW9tZXRyeSwgcHJvcGVydGllcykge1xuICAgIGlmIChnZW9tZXRyeSA9PT0gdW5kZWZpbmVkKSB0aHJvdyBuZXcgRXJyb3IoJ05vIGdlb21ldHJ5IHBhc3NlZCcpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdHlwZTogJ0ZlYXR1cmUnLFxuICAgICAgICBwcm9wZXJ0aWVzOiBwcm9wZXJ0aWVzIHx8IHt9LFxuICAgICAgICBnZW9tZXRyeTogZ2VvbWV0cnlcbiAgICB9O1xufVxuXG4vKipcbiAqIENyZWF0ZSBMaW5lU3RyaW5nXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXk8QXJyYXk8bnVtYmVyPj59IGNvb3JkaW5hdGVzIExpbmUgQ29vcmRpbmF0ZXNcbiAqIEBwYXJhbSB7T2JqZWN0fSBwcm9wZXJ0aWVzIFByb3BlcnRpZXNcbiAqIEByZXR1cm5zIHtGZWF0dXJlPExpbmVTdHJpbmc+fSBHZW9KU09OIExpbmVTdHJpbmcgRmVhdHVyZVxuICovXG5mdW5jdGlvbiBsaW5lU3RyaW5nKGNvb3JkaW5hdGVzLCBwcm9wZXJ0aWVzKSB7XG4gICAgaWYgKCFjb29yZGluYXRlcykgdGhyb3cgbmV3IEVycm9yKCdObyBjb29yZGluYXRlcyBwYXNzZWQnKTtcbiAgICBpZiAoY29vcmRpbmF0ZXMubGVuZ3RoIDwgMikgdGhyb3cgbmV3IEVycm9yKCdDb29yZGluYXRlcyBtdXN0IGJlIGFuIGFycmF5IG9mIHR3byBvciBtb3JlIHBvc2l0aW9ucycpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdHlwZTogJ0ZlYXR1cmUnLFxuICAgICAgICBwcm9wZXJ0aWVzOiBwcm9wZXJ0aWVzIHx8IHt9LFxuICAgICAgICBnZW9tZXRyeToge1xuICAgICAgICAgICAgdHlwZTogJ0xpbmVTdHJpbmcnLFxuICAgICAgICAgICAgY29vcmRpbmF0ZXM6IGNvb3JkaW5hdGVzXG4gICAgICAgIH1cbiAgICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBjb29yZEVhY2g6IGNvb3JkRWFjaCxcbiAgICBjb29yZFJlZHVjZTogY29vcmRSZWR1Y2UsXG4gICAgcHJvcEVhY2g6IHByb3BFYWNoLFxuICAgIHByb3BSZWR1Y2U6IHByb3BSZWR1Y2UsXG4gICAgZmVhdHVyZUVhY2g6IGZlYXR1cmVFYWNoLFxuICAgIGZlYXR1cmVSZWR1Y2U6IGZlYXR1cmVSZWR1Y2UsXG4gICAgY29vcmRBbGw6IGNvb3JkQWxsLFxuICAgIGdlb21FYWNoOiBnZW9tRWFjaCxcbiAgICBnZW9tUmVkdWNlOiBnZW9tUmVkdWNlLFxuICAgIGZsYXR0ZW5FYWNoOiBmbGF0dGVuRWFjaCxcbiAgICBmbGF0dGVuUmVkdWNlOiBmbGF0dGVuUmVkdWNlLFxuICAgIHNlZ21lbnRFYWNoOiBzZWdtZW50RWFjaCxcbiAgICBzZWdtZW50UmVkdWNlOiBzZWdtZW50UmVkdWNlXG59O1xuIiwiZXhwb3J0cy5yZWFkID0gZnVuY3Rpb24gKGJ1ZmZlciwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG1cbiAgdmFyIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDFcbiAgdmFyIGVNYXggPSAoMSA8PCBlTGVuKSAtIDFcbiAgdmFyIGVCaWFzID0gZU1heCA+PiAxXG4gIHZhciBuQml0cyA9IC03XG4gIHZhciBpID0gaXNMRSA/IChuQnl0ZXMgLSAxKSA6IDBcbiAgdmFyIGQgPSBpc0xFID8gLTEgOiAxXG4gIHZhciBzID0gYnVmZmVyW29mZnNldCArIGldXG5cbiAgaSArPSBkXG5cbiAgZSA9IHMgJiAoKDEgPDwgKC1uQml0cykpIC0gMSlcbiAgcyA+Pj0gKC1uQml0cylcbiAgbkJpdHMgKz0gZUxlblxuICBmb3IgKDsgbkJpdHMgPiAwOyBlID0gZSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KSB7fVxuXG4gIG0gPSBlICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpXG4gIGUgPj49ICgtbkJpdHMpXG4gIG5CaXRzICs9IG1MZW5cbiAgZm9yICg7IG5CaXRzID4gMDsgbSA9IG0gKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCkge31cblxuICBpZiAoZSA9PT0gMCkge1xuICAgIGUgPSAxIC0gZUJpYXNcbiAgfSBlbHNlIGlmIChlID09PSBlTWF4KSB7XG4gICAgcmV0dXJuIG0gPyBOYU4gOiAoKHMgPyAtMSA6IDEpICogSW5maW5pdHkpXG4gIH0gZWxzZSB7XG4gICAgbSA9IG0gKyBNYXRoLnBvdygyLCBtTGVuKVxuICAgIGUgPSBlIC0gZUJpYXNcbiAgfVxuICByZXR1cm4gKHMgPyAtMSA6IDEpICogbSAqIE1hdGgucG93KDIsIGUgLSBtTGVuKVxufVxuXG5leHBvcnRzLndyaXRlID0gZnVuY3Rpb24gKGJ1ZmZlciwgdmFsdWUsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLCBjXG4gIHZhciBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxXG4gIHZhciBlTWF4ID0gKDEgPDwgZUxlbikgLSAxXG4gIHZhciBlQmlhcyA9IGVNYXggPj4gMVxuICB2YXIgcnQgPSAobUxlbiA9PT0gMjMgPyBNYXRoLnBvdygyLCAtMjQpIC0gTWF0aC5wb3coMiwgLTc3KSA6IDApXG4gIHZhciBpID0gaXNMRSA/IDAgOiAobkJ5dGVzIC0gMSlcbiAgdmFyIGQgPSBpc0xFID8gMSA6IC0xXG4gIHZhciBzID0gdmFsdWUgPCAwIHx8ICh2YWx1ZSA9PT0gMCAmJiAxIC8gdmFsdWUgPCAwKSA/IDEgOiAwXG5cbiAgdmFsdWUgPSBNYXRoLmFicyh2YWx1ZSlcblxuICBpZiAoaXNOYU4odmFsdWUpIHx8IHZhbHVlID09PSBJbmZpbml0eSkge1xuICAgIG0gPSBpc05hTih2YWx1ZSkgPyAxIDogMFxuICAgIGUgPSBlTWF4XG4gIH0gZWxzZSB7XG4gICAgZSA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpXG4gICAgaWYgKHZhbHVlICogKGMgPSBNYXRoLnBvdygyLCAtZSkpIDwgMSkge1xuICAgICAgZS0tXG4gICAgICBjICo9IDJcbiAgICB9XG4gICAgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICB2YWx1ZSArPSBydCAvIGNcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWUgKz0gcnQgKiBNYXRoLnBvdygyLCAxIC0gZUJpYXMpXG4gICAgfVxuICAgIGlmICh2YWx1ZSAqIGMgPj0gMikge1xuICAgICAgZSsrXG4gICAgICBjIC89IDJcbiAgICB9XG5cbiAgICBpZiAoZSArIGVCaWFzID49IGVNYXgpIHtcbiAgICAgIG0gPSAwXG4gICAgICBlID0gZU1heFxuICAgIH0gZWxzZSBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIG0gPSAodmFsdWUgKiBjIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKVxuICAgICAgZSA9IGUgKyBlQmlhc1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gdmFsdWUgKiBNYXRoLnBvdygyLCBlQmlhcyAtIDEpICogTWF0aC5wb3coMiwgbUxlbilcbiAgICAgIGUgPSAwXG4gICAgfVxuICB9XG5cbiAgZm9yICg7IG1MZW4gPj0gODsgYnVmZmVyW29mZnNldCArIGldID0gbSAmIDB4ZmYsIGkgKz0gZCwgbSAvPSAyNTYsIG1MZW4gLT0gOCkge31cblxuICBlID0gKGUgPDwgbUxlbikgfCBtXG4gIGVMZW4gKz0gbUxlblxuICBmb3IgKDsgZUxlbiA+IDA7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IGUgJiAweGZmLCBpICs9IGQsIGUgLz0gMjU2LCBlTGVuIC09IDgpIHt9XG5cbiAgYnVmZmVyW29mZnNldCArIGkgLSBkXSB8PSBzICogMTI4XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gUGJmO1xuXG52YXIgaWVlZTc1NCA9IHJlcXVpcmUoJ2llZWU3NTQnKTtcblxuZnVuY3Rpb24gUGJmKGJ1Zikge1xuICAgIHRoaXMuYnVmID0gQXJyYXlCdWZmZXIuaXNWaWV3ICYmIEFycmF5QnVmZmVyLmlzVmlldyhidWYpID8gYnVmIDogbmV3IFVpbnQ4QXJyYXkoYnVmIHx8IDApO1xuICAgIHRoaXMucG9zID0gMDtcbiAgICB0aGlzLnR5cGUgPSAwO1xuICAgIHRoaXMubGVuZ3RoID0gdGhpcy5idWYubGVuZ3RoO1xufVxuXG5QYmYuVmFyaW50ICA9IDA7IC8vIHZhcmludDogaW50MzIsIGludDY0LCB1aW50MzIsIHVpbnQ2NCwgc2ludDMyLCBzaW50NjQsIGJvb2wsIGVudW1cblBiZi5GaXhlZDY0ID0gMTsgLy8gNjQtYml0OiBkb3VibGUsIGZpeGVkNjQsIHNmaXhlZDY0XG5QYmYuQnl0ZXMgICA9IDI7IC8vIGxlbmd0aC1kZWxpbWl0ZWQ6IHN0cmluZywgYnl0ZXMsIGVtYmVkZGVkIG1lc3NhZ2VzLCBwYWNrZWQgcmVwZWF0ZWQgZmllbGRzXG5QYmYuRml4ZWQzMiA9IDU7IC8vIDMyLWJpdDogZmxvYXQsIGZpeGVkMzIsIHNmaXhlZDMyXG5cbnZhciBTSElGVF9MRUZUXzMyID0gKDEgPDwgMTYpICogKDEgPDwgMTYpLFxuICAgIFNISUZUX1JJR0hUXzMyID0gMSAvIFNISUZUX0xFRlRfMzI7XG5cblBiZi5wcm90b3R5cGUgPSB7XG5cbiAgICBkZXN0cm95OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5idWYgPSBudWxsO1xuICAgIH0sXG5cbiAgICAvLyA9PT0gUkVBRElORyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgcmVhZEZpZWxkczogZnVuY3Rpb24ocmVhZEZpZWxkLCByZXN1bHQsIGVuZCkge1xuICAgICAgICBlbmQgPSBlbmQgfHwgdGhpcy5sZW5ndGg7XG5cbiAgICAgICAgd2hpbGUgKHRoaXMucG9zIDwgZW5kKSB7XG4gICAgICAgICAgICB2YXIgdmFsID0gdGhpcy5yZWFkVmFyaW50KCksXG4gICAgICAgICAgICAgICAgdGFnID0gdmFsID4+IDMsXG4gICAgICAgICAgICAgICAgc3RhcnRQb3MgPSB0aGlzLnBvcztcblxuICAgICAgICAgICAgdGhpcy50eXBlID0gdmFsICYgMHg3O1xuICAgICAgICAgICAgcmVhZEZpZWxkKHRhZywgcmVzdWx0LCB0aGlzKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMucG9zID09PSBzdGFydFBvcykgdGhpcy5za2lwKHZhbCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgcmVhZE1lc3NhZ2U6IGZ1bmN0aW9uKHJlYWRGaWVsZCwgcmVzdWx0KSB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlYWRGaWVsZHMocmVhZEZpZWxkLCByZXN1bHQsIHRoaXMucmVhZFZhcmludCgpICsgdGhpcy5wb3MpO1xuICAgIH0sXG5cbiAgICByZWFkRml4ZWQzMjogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciB2YWwgPSByZWFkVUludDMyKHRoaXMuYnVmLCB0aGlzLnBvcyk7XG4gICAgICAgIHRoaXMucG9zICs9IDQ7XG4gICAgICAgIHJldHVybiB2YWw7XG4gICAgfSxcblxuICAgIHJlYWRTRml4ZWQzMjogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciB2YWwgPSByZWFkSW50MzIodGhpcy5idWYsIHRoaXMucG9zKTtcbiAgICAgICAgdGhpcy5wb3MgKz0gNDtcbiAgICAgICAgcmV0dXJuIHZhbDtcbiAgICB9LFxuXG4gICAgLy8gNjQtYml0IGludCBoYW5kbGluZyBpcyBiYXNlZCBvbiBnaXRodWIuY29tL2Rwdy9ub2RlLWJ1ZmZlci1tb3JlLWludHMgKE1JVC1saWNlbnNlZClcblxuICAgIHJlYWRGaXhlZDY0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHZhbCA9IHJlYWRVSW50MzIodGhpcy5idWYsIHRoaXMucG9zKSArIHJlYWRVSW50MzIodGhpcy5idWYsIHRoaXMucG9zICsgNCkgKiBTSElGVF9MRUZUXzMyO1xuICAgICAgICB0aGlzLnBvcyArPSA4O1xuICAgICAgICByZXR1cm4gdmFsO1xuICAgIH0sXG5cbiAgICByZWFkU0ZpeGVkNjQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgdmFsID0gcmVhZFVJbnQzMih0aGlzLmJ1ZiwgdGhpcy5wb3MpICsgcmVhZEludDMyKHRoaXMuYnVmLCB0aGlzLnBvcyArIDQpICogU0hJRlRfTEVGVF8zMjtcbiAgICAgICAgdGhpcy5wb3MgKz0gODtcbiAgICAgICAgcmV0dXJuIHZhbDtcbiAgICB9LFxuXG4gICAgcmVhZEZsb2F0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHZhbCA9IGllZWU3NTQucmVhZCh0aGlzLmJ1ZiwgdGhpcy5wb3MsIHRydWUsIDIzLCA0KTtcbiAgICAgICAgdGhpcy5wb3MgKz0gNDtcbiAgICAgICAgcmV0dXJuIHZhbDtcbiAgICB9LFxuXG4gICAgcmVhZERvdWJsZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciB2YWwgPSBpZWVlNzU0LnJlYWQodGhpcy5idWYsIHRoaXMucG9zLCB0cnVlLCA1MiwgOCk7XG4gICAgICAgIHRoaXMucG9zICs9IDg7XG4gICAgICAgIHJldHVybiB2YWw7XG4gICAgfSxcblxuICAgIHJlYWRWYXJpbnQ6IGZ1bmN0aW9uKGlzU2lnbmVkKSB7XG4gICAgICAgIHZhciBidWYgPSB0aGlzLmJ1ZixcbiAgICAgICAgICAgIHZhbCwgYjtcblxuICAgICAgICBiID0gYnVmW3RoaXMucG9zKytdOyB2YWwgID0gIGIgJiAweDdmOyAgICAgICAgaWYgKGIgPCAweDgwKSByZXR1cm4gdmFsO1xuICAgICAgICBiID0gYnVmW3RoaXMucG9zKytdOyB2YWwgfD0gKGIgJiAweDdmKSA8PCA3OyAgaWYgKGIgPCAweDgwKSByZXR1cm4gdmFsO1xuICAgICAgICBiID0gYnVmW3RoaXMucG9zKytdOyB2YWwgfD0gKGIgJiAweDdmKSA8PCAxNDsgaWYgKGIgPCAweDgwKSByZXR1cm4gdmFsO1xuICAgICAgICBiID0gYnVmW3RoaXMucG9zKytdOyB2YWwgfD0gKGIgJiAweDdmKSA8PCAyMTsgaWYgKGIgPCAweDgwKSByZXR1cm4gdmFsO1xuICAgICAgICBiID0gYnVmW3RoaXMucG9zXTsgICB2YWwgfD0gKGIgJiAweDBmKSA8PCAyODtcblxuICAgICAgICByZXR1cm4gcmVhZFZhcmludFJlbWFpbmRlcih2YWwsIGlzU2lnbmVkLCB0aGlzKTtcbiAgICB9LFxuXG4gICAgcmVhZFZhcmludDY0OiBmdW5jdGlvbigpIHsgLy8gZm9yIGNvbXBhdGliaWxpdHkgd2l0aCB2Mi4wLjFcbiAgICAgICAgcmV0dXJuIHRoaXMucmVhZFZhcmludCh0cnVlKTtcbiAgICB9LFxuXG4gICAgcmVhZFNWYXJpbnQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbnVtID0gdGhpcy5yZWFkVmFyaW50KCk7XG4gICAgICAgIHJldHVybiBudW0gJSAyID09PSAxID8gKG51bSArIDEpIC8gLTIgOiBudW0gLyAyOyAvLyB6aWd6YWcgZW5jb2RpbmdcbiAgICB9LFxuXG4gICAgcmVhZEJvb2xlYW46IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gQm9vbGVhbih0aGlzLnJlYWRWYXJpbnQoKSk7XG4gICAgfSxcblxuICAgIHJlYWRTdHJpbmc6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgZW5kID0gdGhpcy5yZWFkVmFyaW50KCkgKyB0aGlzLnBvcyxcbiAgICAgICAgICAgIHN0ciA9IHJlYWRVdGY4KHRoaXMuYnVmLCB0aGlzLnBvcywgZW5kKTtcbiAgICAgICAgdGhpcy5wb3MgPSBlbmQ7XG4gICAgICAgIHJldHVybiBzdHI7XG4gICAgfSxcblxuICAgIHJlYWRCeXRlczogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBlbmQgPSB0aGlzLnJlYWRWYXJpbnQoKSArIHRoaXMucG9zLFxuICAgICAgICAgICAgYnVmZmVyID0gdGhpcy5idWYuc3ViYXJyYXkodGhpcy5wb3MsIGVuZCk7XG4gICAgICAgIHRoaXMucG9zID0gZW5kO1xuICAgICAgICByZXR1cm4gYnVmZmVyO1xuICAgIH0sXG5cbiAgICAvLyB2ZXJib3NlIGZvciBwZXJmb3JtYW5jZSByZWFzb25zOyBkb2Vzbid0IGFmZmVjdCBnemlwcGVkIHNpemVcblxuICAgIHJlYWRQYWNrZWRWYXJpbnQ6IGZ1bmN0aW9uKGFyciwgaXNTaWduZWQpIHtcbiAgICAgICAgdmFyIGVuZCA9IHJlYWRQYWNrZWRFbmQodGhpcyk7XG4gICAgICAgIGFyciA9IGFyciB8fCBbXTtcbiAgICAgICAgd2hpbGUgKHRoaXMucG9zIDwgZW5kKSBhcnIucHVzaCh0aGlzLnJlYWRWYXJpbnQoaXNTaWduZWQpKTtcbiAgICAgICAgcmV0dXJuIGFycjtcbiAgICB9LFxuICAgIHJlYWRQYWNrZWRTVmFyaW50OiBmdW5jdGlvbihhcnIpIHtcbiAgICAgICAgdmFyIGVuZCA9IHJlYWRQYWNrZWRFbmQodGhpcyk7XG4gICAgICAgIGFyciA9IGFyciB8fCBbXTtcbiAgICAgICAgd2hpbGUgKHRoaXMucG9zIDwgZW5kKSBhcnIucHVzaCh0aGlzLnJlYWRTVmFyaW50KCkpO1xuICAgICAgICByZXR1cm4gYXJyO1xuICAgIH0sXG4gICAgcmVhZFBhY2tlZEJvb2xlYW46IGZ1bmN0aW9uKGFycikge1xuICAgICAgICB2YXIgZW5kID0gcmVhZFBhY2tlZEVuZCh0aGlzKTtcbiAgICAgICAgYXJyID0gYXJyIHx8IFtdO1xuICAgICAgICB3aGlsZSAodGhpcy5wb3MgPCBlbmQpIGFyci5wdXNoKHRoaXMucmVhZEJvb2xlYW4oKSk7XG4gICAgICAgIHJldHVybiBhcnI7XG4gICAgfSxcbiAgICByZWFkUGFja2VkRmxvYXQ6IGZ1bmN0aW9uKGFycikge1xuICAgICAgICB2YXIgZW5kID0gcmVhZFBhY2tlZEVuZCh0aGlzKTtcbiAgICAgICAgYXJyID0gYXJyIHx8IFtdO1xuICAgICAgICB3aGlsZSAodGhpcy5wb3MgPCBlbmQpIGFyci5wdXNoKHRoaXMucmVhZEZsb2F0KCkpO1xuICAgICAgICByZXR1cm4gYXJyO1xuICAgIH0sXG4gICAgcmVhZFBhY2tlZERvdWJsZTogZnVuY3Rpb24oYXJyKSB7XG4gICAgICAgIHZhciBlbmQgPSByZWFkUGFja2VkRW5kKHRoaXMpO1xuICAgICAgICBhcnIgPSBhcnIgfHwgW107XG4gICAgICAgIHdoaWxlICh0aGlzLnBvcyA8IGVuZCkgYXJyLnB1c2godGhpcy5yZWFkRG91YmxlKCkpO1xuICAgICAgICByZXR1cm4gYXJyO1xuICAgIH0sXG4gICAgcmVhZFBhY2tlZEZpeGVkMzI6IGZ1bmN0aW9uKGFycikge1xuICAgICAgICB2YXIgZW5kID0gcmVhZFBhY2tlZEVuZCh0aGlzKTtcbiAgICAgICAgYXJyID0gYXJyIHx8IFtdO1xuICAgICAgICB3aGlsZSAodGhpcy5wb3MgPCBlbmQpIGFyci5wdXNoKHRoaXMucmVhZEZpeGVkMzIoKSk7XG4gICAgICAgIHJldHVybiBhcnI7XG4gICAgfSxcbiAgICByZWFkUGFja2VkU0ZpeGVkMzI6IGZ1bmN0aW9uKGFycikge1xuICAgICAgICB2YXIgZW5kID0gcmVhZFBhY2tlZEVuZCh0aGlzKTtcbiAgICAgICAgYXJyID0gYXJyIHx8IFtdO1xuICAgICAgICB3aGlsZSAodGhpcy5wb3MgPCBlbmQpIGFyci5wdXNoKHRoaXMucmVhZFNGaXhlZDMyKCkpO1xuICAgICAgICByZXR1cm4gYXJyO1xuICAgIH0sXG4gICAgcmVhZFBhY2tlZEZpeGVkNjQ6IGZ1bmN0aW9uKGFycikge1xuICAgICAgICB2YXIgZW5kID0gcmVhZFBhY2tlZEVuZCh0aGlzKTtcbiAgICAgICAgYXJyID0gYXJyIHx8IFtdO1xuICAgICAgICB3aGlsZSAodGhpcy5wb3MgPCBlbmQpIGFyci5wdXNoKHRoaXMucmVhZEZpeGVkNjQoKSk7XG4gICAgICAgIHJldHVybiBhcnI7XG4gICAgfSxcbiAgICByZWFkUGFja2VkU0ZpeGVkNjQ6IGZ1bmN0aW9uKGFycikge1xuICAgICAgICB2YXIgZW5kID0gcmVhZFBhY2tlZEVuZCh0aGlzKTtcbiAgICAgICAgYXJyID0gYXJyIHx8IFtdO1xuICAgICAgICB3aGlsZSAodGhpcy5wb3MgPCBlbmQpIGFyci5wdXNoKHRoaXMucmVhZFNGaXhlZDY0KCkpO1xuICAgICAgICByZXR1cm4gYXJyO1xuICAgIH0sXG5cbiAgICBza2lwOiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgdmFyIHR5cGUgPSB2YWwgJiAweDc7XG4gICAgICAgIGlmICh0eXBlID09PSBQYmYuVmFyaW50KSB3aGlsZSAodGhpcy5idWZbdGhpcy5wb3MrK10gPiAweDdmKSB7fVxuICAgICAgICBlbHNlIGlmICh0eXBlID09PSBQYmYuQnl0ZXMpIHRoaXMucG9zID0gdGhpcy5yZWFkVmFyaW50KCkgKyB0aGlzLnBvcztcbiAgICAgICAgZWxzZSBpZiAodHlwZSA9PT0gUGJmLkZpeGVkMzIpIHRoaXMucG9zICs9IDQ7XG4gICAgICAgIGVsc2UgaWYgKHR5cGUgPT09IFBiZi5GaXhlZDY0KSB0aGlzLnBvcyArPSA4O1xuICAgICAgICBlbHNlIHRocm93IG5ldyBFcnJvcignVW5pbXBsZW1lbnRlZCB0eXBlOiAnICsgdHlwZSk7XG4gICAgfSxcblxuICAgIC8vID09PSBXUklUSU5HID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICB3cml0ZVRhZzogZnVuY3Rpb24odGFnLCB0eXBlKSB7XG4gICAgICAgIHRoaXMud3JpdGVWYXJpbnQoKHRhZyA8PCAzKSB8IHR5cGUpO1xuICAgIH0sXG5cbiAgICByZWFsbG9jOiBmdW5jdGlvbihtaW4pIHtcbiAgICAgICAgdmFyIGxlbmd0aCA9IHRoaXMubGVuZ3RoIHx8IDE2O1xuXG4gICAgICAgIHdoaWxlIChsZW5ndGggPCB0aGlzLnBvcyArIG1pbikgbGVuZ3RoICo9IDI7XG5cbiAgICAgICAgaWYgKGxlbmd0aCAhPT0gdGhpcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHZhciBidWYgPSBuZXcgVWludDhBcnJheShsZW5ndGgpO1xuICAgICAgICAgICAgYnVmLnNldCh0aGlzLmJ1Zik7XG4gICAgICAgICAgICB0aGlzLmJ1ZiA9IGJ1ZjtcbiAgICAgICAgICAgIHRoaXMubGVuZ3RoID0gbGVuZ3RoO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGZpbmlzaDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMubGVuZ3RoID0gdGhpcy5wb3M7XG4gICAgICAgIHRoaXMucG9zID0gMDtcbiAgICAgICAgcmV0dXJuIHRoaXMuYnVmLnN1YmFycmF5KDAsIHRoaXMubGVuZ3RoKTtcbiAgICB9LFxuXG4gICAgd3JpdGVGaXhlZDMyOiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgdGhpcy5yZWFsbG9jKDQpO1xuICAgICAgICB3cml0ZUludDMyKHRoaXMuYnVmLCB2YWwsIHRoaXMucG9zKTtcbiAgICAgICAgdGhpcy5wb3MgKz0gNDtcbiAgICB9LFxuXG4gICAgd3JpdGVTRml4ZWQzMjogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgIHRoaXMucmVhbGxvYyg0KTtcbiAgICAgICAgd3JpdGVJbnQzMih0aGlzLmJ1ZiwgdmFsLCB0aGlzLnBvcyk7XG4gICAgICAgIHRoaXMucG9zICs9IDQ7XG4gICAgfSxcblxuICAgIHdyaXRlRml4ZWQ2NDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgIHRoaXMucmVhbGxvYyg4KTtcbiAgICAgICAgd3JpdGVJbnQzMih0aGlzLmJ1ZiwgdmFsICYgLTEsIHRoaXMucG9zKTtcbiAgICAgICAgd3JpdGVJbnQzMih0aGlzLmJ1ZiwgTWF0aC5mbG9vcih2YWwgKiBTSElGVF9SSUdIVF8zMiksIHRoaXMucG9zICsgNCk7XG4gICAgICAgIHRoaXMucG9zICs9IDg7XG4gICAgfSxcblxuICAgIHdyaXRlU0ZpeGVkNjQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICB0aGlzLnJlYWxsb2MoOCk7XG4gICAgICAgIHdyaXRlSW50MzIodGhpcy5idWYsIHZhbCAmIC0xLCB0aGlzLnBvcyk7XG4gICAgICAgIHdyaXRlSW50MzIodGhpcy5idWYsIE1hdGguZmxvb3IodmFsICogU0hJRlRfUklHSFRfMzIpLCB0aGlzLnBvcyArIDQpO1xuICAgICAgICB0aGlzLnBvcyArPSA4O1xuICAgIH0sXG5cbiAgICB3cml0ZVZhcmludDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgIHZhbCA9ICt2YWwgfHwgMDtcblxuICAgICAgICBpZiAodmFsID4gMHhmZmZmZmZmIHx8IHZhbCA8IDApIHtcbiAgICAgICAgICAgIHdyaXRlQmlnVmFyaW50KHZhbCwgdGhpcyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnJlYWxsb2MoNCk7XG5cbiAgICAgICAgdGhpcy5idWZbdGhpcy5wb3MrK10gPSAgICAgICAgICAgdmFsICYgMHg3ZiAgfCAodmFsID4gMHg3ZiA/IDB4ODAgOiAwKTsgaWYgKHZhbCA8PSAweDdmKSByZXR1cm47XG4gICAgICAgIHRoaXMuYnVmW3RoaXMucG9zKytdID0gKCh2YWwgPj4+PSA3KSAmIDB4N2YpIHwgKHZhbCA+IDB4N2YgPyAweDgwIDogMCk7IGlmICh2YWwgPD0gMHg3ZikgcmV0dXJuO1xuICAgICAgICB0aGlzLmJ1Zlt0aGlzLnBvcysrXSA9ICgodmFsID4+Pj0gNykgJiAweDdmKSB8ICh2YWwgPiAweDdmID8gMHg4MCA6IDApOyBpZiAodmFsIDw9IDB4N2YpIHJldHVybjtcbiAgICAgICAgdGhpcy5idWZbdGhpcy5wb3MrK10gPSAgICh2YWwgPj4+IDcpICYgMHg3ZjtcbiAgICB9LFxuXG4gICAgd3JpdGVTVmFyaW50OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgdGhpcy53cml0ZVZhcmludCh2YWwgPCAwID8gLXZhbCAqIDIgLSAxIDogdmFsICogMik7XG4gICAgfSxcblxuICAgIHdyaXRlQm9vbGVhbjogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgIHRoaXMud3JpdGVWYXJpbnQoQm9vbGVhbih2YWwpKTtcbiAgICB9LFxuXG4gICAgd3JpdGVTdHJpbmc6IGZ1bmN0aW9uKHN0cikge1xuICAgICAgICBzdHIgPSBTdHJpbmcoc3RyKTtcbiAgICAgICAgdGhpcy5yZWFsbG9jKHN0ci5sZW5ndGggKiA0KTtcblxuICAgICAgICB0aGlzLnBvcysrOyAvLyByZXNlcnZlIDEgYnl0ZSBmb3Igc2hvcnQgc3RyaW5nIGxlbmd0aFxuXG4gICAgICAgIHZhciBzdGFydFBvcyA9IHRoaXMucG9zO1xuICAgICAgICAvLyB3cml0ZSB0aGUgc3RyaW5nIGRpcmVjdGx5IHRvIHRoZSBidWZmZXIgYW5kIHNlZSBob3cgbXVjaCB3YXMgd3JpdHRlblxuICAgICAgICB0aGlzLnBvcyA9IHdyaXRlVXRmOCh0aGlzLmJ1Ziwgc3RyLCB0aGlzLnBvcyk7XG4gICAgICAgIHZhciBsZW4gPSB0aGlzLnBvcyAtIHN0YXJ0UG9zO1xuXG4gICAgICAgIGlmIChsZW4gPj0gMHg4MCkgbWFrZVJvb21Gb3JFeHRyYUxlbmd0aChzdGFydFBvcywgbGVuLCB0aGlzKTtcblxuICAgICAgICAvLyBmaW5hbGx5LCB3cml0ZSB0aGUgbWVzc2FnZSBsZW5ndGggaW4gdGhlIHJlc2VydmVkIHBsYWNlIGFuZCByZXN0b3JlIHRoZSBwb3NpdGlvblxuICAgICAgICB0aGlzLnBvcyA9IHN0YXJ0UG9zIC0gMTtcbiAgICAgICAgdGhpcy53cml0ZVZhcmludChsZW4pO1xuICAgICAgICB0aGlzLnBvcyArPSBsZW47XG4gICAgfSxcblxuICAgIHdyaXRlRmxvYXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICB0aGlzLnJlYWxsb2MoNCk7XG4gICAgICAgIGllZWU3NTQud3JpdGUodGhpcy5idWYsIHZhbCwgdGhpcy5wb3MsIHRydWUsIDIzLCA0KTtcbiAgICAgICAgdGhpcy5wb3MgKz0gNDtcbiAgICB9LFxuXG4gICAgd3JpdGVEb3VibGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICB0aGlzLnJlYWxsb2MoOCk7XG4gICAgICAgIGllZWU3NTQud3JpdGUodGhpcy5idWYsIHZhbCwgdGhpcy5wb3MsIHRydWUsIDUyLCA4KTtcbiAgICAgICAgdGhpcy5wb3MgKz0gODtcbiAgICB9LFxuXG4gICAgd3JpdGVCeXRlczogZnVuY3Rpb24oYnVmZmVyKSB7XG4gICAgICAgIHZhciBsZW4gPSBidWZmZXIubGVuZ3RoO1xuICAgICAgICB0aGlzLndyaXRlVmFyaW50KGxlbik7XG4gICAgICAgIHRoaXMucmVhbGxvYyhsZW4pO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB0aGlzLmJ1Zlt0aGlzLnBvcysrXSA9IGJ1ZmZlcltpXTtcbiAgICB9LFxuXG4gICAgd3JpdGVSYXdNZXNzYWdlOiBmdW5jdGlvbihmbiwgb2JqKSB7XG4gICAgICAgIHRoaXMucG9zKys7IC8vIHJlc2VydmUgMSBieXRlIGZvciBzaG9ydCBtZXNzYWdlIGxlbmd0aFxuXG4gICAgICAgIC8vIHdyaXRlIHRoZSBtZXNzYWdlIGRpcmVjdGx5IHRvIHRoZSBidWZmZXIgYW5kIHNlZSBob3cgbXVjaCB3YXMgd3JpdHRlblxuICAgICAgICB2YXIgc3RhcnRQb3MgPSB0aGlzLnBvcztcbiAgICAgICAgZm4ob2JqLCB0aGlzKTtcbiAgICAgICAgdmFyIGxlbiA9IHRoaXMucG9zIC0gc3RhcnRQb3M7XG5cbiAgICAgICAgaWYgKGxlbiA+PSAweDgwKSBtYWtlUm9vbUZvckV4dHJhTGVuZ3RoKHN0YXJ0UG9zLCBsZW4sIHRoaXMpO1xuXG4gICAgICAgIC8vIGZpbmFsbHksIHdyaXRlIHRoZSBtZXNzYWdlIGxlbmd0aCBpbiB0aGUgcmVzZXJ2ZWQgcGxhY2UgYW5kIHJlc3RvcmUgdGhlIHBvc2l0aW9uXG4gICAgICAgIHRoaXMucG9zID0gc3RhcnRQb3MgLSAxO1xuICAgICAgICB0aGlzLndyaXRlVmFyaW50KGxlbik7XG4gICAgICAgIHRoaXMucG9zICs9IGxlbjtcbiAgICB9LFxuXG4gICAgd3JpdGVNZXNzYWdlOiBmdW5jdGlvbih0YWcsIGZuLCBvYmopIHtcbiAgICAgICAgdGhpcy53cml0ZVRhZyh0YWcsIFBiZi5CeXRlcyk7XG4gICAgICAgIHRoaXMud3JpdGVSYXdNZXNzYWdlKGZuLCBvYmopO1xuICAgIH0sXG5cbiAgICB3cml0ZVBhY2tlZFZhcmludDogICBmdW5jdGlvbih0YWcsIGFycikgeyB0aGlzLndyaXRlTWVzc2FnZSh0YWcsIHdyaXRlUGFja2VkVmFyaW50LCBhcnIpOyAgIH0sXG4gICAgd3JpdGVQYWNrZWRTVmFyaW50OiAgZnVuY3Rpb24odGFnLCBhcnIpIHsgdGhpcy53cml0ZU1lc3NhZ2UodGFnLCB3cml0ZVBhY2tlZFNWYXJpbnQsIGFycik7ICB9LFxuICAgIHdyaXRlUGFja2VkQm9vbGVhbjogIGZ1bmN0aW9uKHRhZywgYXJyKSB7IHRoaXMud3JpdGVNZXNzYWdlKHRhZywgd3JpdGVQYWNrZWRCb29sZWFuLCBhcnIpOyAgfSxcbiAgICB3cml0ZVBhY2tlZEZsb2F0OiAgICBmdW5jdGlvbih0YWcsIGFycikgeyB0aGlzLndyaXRlTWVzc2FnZSh0YWcsIHdyaXRlUGFja2VkRmxvYXQsIGFycik7ICAgIH0sXG4gICAgd3JpdGVQYWNrZWREb3VibGU6ICAgZnVuY3Rpb24odGFnLCBhcnIpIHsgdGhpcy53cml0ZU1lc3NhZ2UodGFnLCB3cml0ZVBhY2tlZERvdWJsZSwgYXJyKTsgICB9LFxuICAgIHdyaXRlUGFja2VkRml4ZWQzMjogIGZ1bmN0aW9uKHRhZywgYXJyKSB7IHRoaXMud3JpdGVNZXNzYWdlKHRhZywgd3JpdGVQYWNrZWRGaXhlZDMyLCBhcnIpOyAgfSxcbiAgICB3cml0ZVBhY2tlZFNGaXhlZDMyOiBmdW5jdGlvbih0YWcsIGFycikgeyB0aGlzLndyaXRlTWVzc2FnZSh0YWcsIHdyaXRlUGFja2VkU0ZpeGVkMzIsIGFycik7IH0sXG4gICAgd3JpdGVQYWNrZWRGaXhlZDY0OiAgZnVuY3Rpb24odGFnLCBhcnIpIHsgdGhpcy53cml0ZU1lc3NhZ2UodGFnLCB3cml0ZVBhY2tlZEZpeGVkNjQsIGFycik7ICB9LFxuICAgIHdyaXRlUGFja2VkU0ZpeGVkNjQ6IGZ1bmN0aW9uKHRhZywgYXJyKSB7IHRoaXMud3JpdGVNZXNzYWdlKHRhZywgd3JpdGVQYWNrZWRTRml4ZWQ2NCwgYXJyKTsgfSxcblxuICAgIHdyaXRlQnl0ZXNGaWVsZDogZnVuY3Rpb24odGFnLCBidWZmZXIpIHtcbiAgICAgICAgdGhpcy53cml0ZVRhZyh0YWcsIFBiZi5CeXRlcyk7XG4gICAgICAgIHRoaXMud3JpdGVCeXRlcyhidWZmZXIpO1xuICAgIH0sXG4gICAgd3JpdGVGaXhlZDMyRmllbGQ6IGZ1bmN0aW9uKHRhZywgdmFsKSB7XG4gICAgICAgIHRoaXMud3JpdGVUYWcodGFnLCBQYmYuRml4ZWQzMik7XG4gICAgICAgIHRoaXMud3JpdGVGaXhlZDMyKHZhbCk7XG4gICAgfSxcbiAgICB3cml0ZVNGaXhlZDMyRmllbGQ6IGZ1bmN0aW9uKHRhZywgdmFsKSB7XG4gICAgICAgIHRoaXMud3JpdGVUYWcodGFnLCBQYmYuRml4ZWQzMik7XG4gICAgICAgIHRoaXMud3JpdGVTRml4ZWQzMih2YWwpO1xuICAgIH0sXG4gICAgd3JpdGVGaXhlZDY0RmllbGQ6IGZ1bmN0aW9uKHRhZywgdmFsKSB7XG4gICAgICAgIHRoaXMud3JpdGVUYWcodGFnLCBQYmYuRml4ZWQ2NCk7XG4gICAgICAgIHRoaXMud3JpdGVGaXhlZDY0KHZhbCk7XG4gICAgfSxcbiAgICB3cml0ZVNGaXhlZDY0RmllbGQ6IGZ1bmN0aW9uKHRhZywgdmFsKSB7XG4gICAgICAgIHRoaXMud3JpdGVUYWcodGFnLCBQYmYuRml4ZWQ2NCk7XG4gICAgICAgIHRoaXMud3JpdGVTRml4ZWQ2NCh2YWwpO1xuICAgIH0sXG4gICAgd3JpdGVWYXJpbnRGaWVsZDogZnVuY3Rpb24odGFnLCB2YWwpIHtcbiAgICAgICAgdGhpcy53cml0ZVRhZyh0YWcsIFBiZi5WYXJpbnQpO1xuICAgICAgICB0aGlzLndyaXRlVmFyaW50KHZhbCk7XG4gICAgfSxcbiAgICB3cml0ZVNWYXJpbnRGaWVsZDogZnVuY3Rpb24odGFnLCB2YWwpIHtcbiAgICAgICAgdGhpcy53cml0ZVRhZyh0YWcsIFBiZi5WYXJpbnQpO1xuICAgICAgICB0aGlzLndyaXRlU1ZhcmludCh2YWwpO1xuICAgIH0sXG4gICAgd3JpdGVTdHJpbmdGaWVsZDogZnVuY3Rpb24odGFnLCBzdHIpIHtcbiAgICAgICAgdGhpcy53cml0ZVRhZyh0YWcsIFBiZi5CeXRlcyk7XG4gICAgICAgIHRoaXMud3JpdGVTdHJpbmcoc3RyKTtcbiAgICB9LFxuICAgIHdyaXRlRmxvYXRGaWVsZDogZnVuY3Rpb24odGFnLCB2YWwpIHtcbiAgICAgICAgdGhpcy53cml0ZVRhZyh0YWcsIFBiZi5GaXhlZDMyKTtcbiAgICAgICAgdGhpcy53cml0ZUZsb2F0KHZhbCk7XG4gICAgfSxcbiAgICB3cml0ZURvdWJsZUZpZWxkOiBmdW5jdGlvbih0YWcsIHZhbCkge1xuICAgICAgICB0aGlzLndyaXRlVGFnKHRhZywgUGJmLkZpeGVkNjQpO1xuICAgICAgICB0aGlzLndyaXRlRG91YmxlKHZhbCk7XG4gICAgfSxcbiAgICB3cml0ZUJvb2xlYW5GaWVsZDogZnVuY3Rpb24odGFnLCB2YWwpIHtcbiAgICAgICAgdGhpcy53cml0ZVZhcmludEZpZWxkKHRhZywgQm9vbGVhbih2YWwpKTtcbiAgICB9XG59O1xuXG5mdW5jdGlvbiByZWFkVmFyaW50UmVtYWluZGVyKGwsIHMsIHApIHtcbiAgICB2YXIgYnVmID0gcC5idWYsXG4gICAgICAgIGgsIGI7XG5cbiAgICBiID0gYnVmW3AucG9zKytdOyBoICA9IChiICYgMHg3MCkgPj4gNDsgIGlmIChiIDwgMHg4MCkgcmV0dXJuIHRvTnVtKGwsIGgsIHMpO1xuICAgIGIgPSBidWZbcC5wb3MrK107IGggfD0gKGIgJiAweDdmKSA8PCAzOyAgaWYgKGIgPCAweDgwKSByZXR1cm4gdG9OdW0obCwgaCwgcyk7XG4gICAgYiA9IGJ1ZltwLnBvcysrXTsgaCB8PSAoYiAmIDB4N2YpIDw8IDEwOyBpZiAoYiA8IDB4ODApIHJldHVybiB0b051bShsLCBoLCBzKTtcbiAgICBiID0gYnVmW3AucG9zKytdOyBoIHw9IChiICYgMHg3ZikgPDwgMTc7IGlmIChiIDwgMHg4MCkgcmV0dXJuIHRvTnVtKGwsIGgsIHMpO1xuICAgIGIgPSBidWZbcC5wb3MrK107IGggfD0gKGIgJiAweDdmKSA8PCAyNDsgaWYgKGIgPCAweDgwKSByZXR1cm4gdG9OdW0obCwgaCwgcyk7XG4gICAgYiA9IGJ1ZltwLnBvcysrXTsgaCB8PSAoYiAmIDB4MDEpIDw8IDMxOyBpZiAoYiA8IDB4ODApIHJldHVybiB0b051bShsLCBoLCBzKTtcblxuICAgIHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgdmFyaW50IG5vdCBtb3JlIHRoYW4gMTAgYnl0ZXMnKTtcbn1cblxuZnVuY3Rpb24gcmVhZFBhY2tlZEVuZChwYmYpIHtcbiAgICByZXR1cm4gcGJmLnR5cGUgPT09IFBiZi5CeXRlcyA/XG4gICAgICAgIHBiZi5yZWFkVmFyaW50KCkgKyBwYmYucG9zIDogcGJmLnBvcyArIDE7XG59XG5cbmZ1bmN0aW9uIHRvTnVtKGxvdywgaGlnaCwgaXNTaWduZWQpIHtcbiAgICBpZiAoaXNTaWduZWQpIHtcbiAgICAgICAgcmV0dXJuIGhpZ2ggKiAweDEwMDAwMDAwMCArIChsb3cgPj4+IDApO1xuICAgIH1cblxuICAgIHJldHVybiAoKGhpZ2ggPj4+IDApICogMHgxMDAwMDAwMDApICsgKGxvdyA+Pj4gMCk7XG59XG5cbmZ1bmN0aW9uIHdyaXRlQmlnVmFyaW50KHZhbCwgcGJmKSB7XG4gICAgdmFyIGxvdywgaGlnaDtcblxuICAgIGlmICh2YWwgPj0gMCkge1xuICAgICAgICBsb3cgID0gKHZhbCAlIDB4MTAwMDAwMDAwKSB8IDA7XG4gICAgICAgIGhpZ2ggPSAodmFsIC8gMHgxMDAwMDAwMDApIHwgMDtcbiAgICB9IGVsc2Uge1xuICAgICAgICBsb3cgID0gfigtdmFsICUgMHgxMDAwMDAwMDApO1xuICAgICAgICBoaWdoID0gfigtdmFsIC8gMHgxMDAwMDAwMDApO1xuXG4gICAgICAgIGlmIChsb3cgXiAweGZmZmZmZmZmKSB7XG4gICAgICAgICAgICBsb3cgPSAobG93ICsgMSkgfCAwO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbG93ID0gMDtcbiAgICAgICAgICAgIGhpZ2ggPSAoaGlnaCArIDEpIHwgMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICh2YWwgPj0gMHgxMDAwMDAwMDAwMDAwMDAwMCB8fCB2YWwgPCAtMHgxMDAwMDAwMDAwMDAwMDAwMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0dpdmVuIHZhcmludCBkb2VzblxcJ3QgZml0IGludG8gMTAgYnl0ZXMnKTtcbiAgICB9XG5cbiAgICBwYmYucmVhbGxvYygxMCk7XG5cbiAgICB3cml0ZUJpZ1ZhcmludExvdyhsb3csIGhpZ2gsIHBiZik7XG4gICAgd3JpdGVCaWdWYXJpbnRIaWdoKGhpZ2gsIHBiZik7XG59XG5cbmZ1bmN0aW9uIHdyaXRlQmlnVmFyaW50TG93KGxvdywgaGlnaCwgcGJmKSB7XG4gICAgcGJmLmJ1ZltwYmYucG9zKytdID0gbG93ICYgMHg3ZiB8IDB4ODA7IGxvdyA+Pj49IDc7XG4gICAgcGJmLmJ1ZltwYmYucG9zKytdID0gbG93ICYgMHg3ZiB8IDB4ODA7IGxvdyA+Pj49IDc7XG4gICAgcGJmLmJ1ZltwYmYucG9zKytdID0gbG93ICYgMHg3ZiB8IDB4ODA7IGxvdyA+Pj49IDc7XG4gICAgcGJmLmJ1ZltwYmYucG9zKytdID0gbG93ICYgMHg3ZiB8IDB4ODA7IGxvdyA+Pj49IDc7XG4gICAgcGJmLmJ1ZltwYmYucG9zXSAgID0gbG93ICYgMHg3Zjtcbn1cblxuZnVuY3Rpb24gd3JpdGVCaWdWYXJpbnRIaWdoKGhpZ2gsIHBiZikge1xuICAgIHZhciBsc2IgPSAoaGlnaCAmIDB4MDcpIDw8IDQ7XG5cbiAgICBwYmYuYnVmW3BiZi5wb3MrK10gfD0gbHNiICAgICAgICAgfCAoKGhpZ2ggPj4+PSAzKSA/IDB4ODAgOiAwKTsgaWYgKCFoaWdoKSByZXR1cm47XG4gICAgcGJmLmJ1ZltwYmYucG9zKytdICA9IGhpZ2ggJiAweDdmIHwgKChoaWdoID4+Pj0gNykgPyAweDgwIDogMCk7IGlmICghaGlnaCkgcmV0dXJuO1xuICAgIHBiZi5idWZbcGJmLnBvcysrXSAgPSBoaWdoICYgMHg3ZiB8ICgoaGlnaCA+Pj49IDcpID8gMHg4MCA6IDApOyBpZiAoIWhpZ2gpIHJldHVybjtcbiAgICBwYmYuYnVmW3BiZi5wb3MrK10gID0gaGlnaCAmIDB4N2YgfCAoKGhpZ2ggPj4+PSA3KSA/IDB4ODAgOiAwKTsgaWYgKCFoaWdoKSByZXR1cm47XG4gICAgcGJmLmJ1ZltwYmYucG9zKytdICA9IGhpZ2ggJiAweDdmIHwgKChoaWdoID4+Pj0gNykgPyAweDgwIDogMCk7IGlmICghaGlnaCkgcmV0dXJuO1xuICAgIHBiZi5idWZbcGJmLnBvcysrXSAgPSBoaWdoICYgMHg3Zjtcbn1cblxuZnVuY3Rpb24gbWFrZVJvb21Gb3JFeHRyYUxlbmd0aChzdGFydFBvcywgbGVuLCBwYmYpIHtcbiAgICB2YXIgZXh0cmFMZW4gPVxuICAgICAgICBsZW4gPD0gMHgzZmZmID8gMSA6XG4gICAgICAgIGxlbiA8PSAweDFmZmZmZiA/IDIgOlxuICAgICAgICBsZW4gPD0gMHhmZmZmZmZmID8gMyA6IE1hdGguY2VpbChNYXRoLmxvZyhsZW4pIC8gKE1hdGguTE4yICogNykpO1xuXG4gICAgLy8gaWYgMSBieXRlIGlzbid0IGVub3VnaCBmb3IgZW5jb2RpbmcgbWVzc2FnZSBsZW5ndGgsIHNoaWZ0IHRoZSBkYXRhIHRvIHRoZSByaWdodFxuICAgIHBiZi5yZWFsbG9jKGV4dHJhTGVuKTtcbiAgICBmb3IgKHZhciBpID0gcGJmLnBvcyAtIDE7IGkgPj0gc3RhcnRQb3M7IGktLSkgcGJmLmJ1ZltpICsgZXh0cmFMZW5dID0gcGJmLmJ1ZltpXTtcbn1cblxuZnVuY3Rpb24gd3JpdGVQYWNrZWRWYXJpbnQoYXJyLCBwYmYpICAgeyBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkrKykgcGJmLndyaXRlVmFyaW50KGFycltpXSk7ICAgfVxuZnVuY3Rpb24gd3JpdGVQYWNrZWRTVmFyaW50KGFyciwgcGJmKSAgeyBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkrKykgcGJmLndyaXRlU1ZhcmludChhcnJbaV0pOyAgfVxuZnVuY3Rpb24gd3JpdGVQYWNrZWRGbG9hdChhcnIsIHBiZikgICAgeyBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkrKykgcGJmLndyaXRlRmxvYXQoYXJyW2ldKTsgICAgfVxuZnVuY3Rpb24gd3JpdGVQYWNrZWREb3VibGUoYXJyLCBwYmYpICAgeyBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkrKykgcGJmLndyaXRlRG91YmxlKGFycltpXSk7ICAgfVxuZnVuY3Rpb24gd3JpdGVQYWNrZWRCb29sZWFuKGFyciwgcGJmKSAgeyBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkrKykgcGJmLndyaXRlQm9vbGVhbihhcnJbaV0pOyAgfVxuZnVuY3Rpb24gd3JpdGVQYWNrZWRGaXhlZDMyKGFyciwgcGJmKSAgeyBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkrKykgcGJmLndyaXRlRml4ZWQzMihhcnJbaV0pOyAgfVxuZnVuY3Rpb24gd3JpdGVQYWNrZWRTRml4ZWQzMihhcnIsIHBiZikgeyBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkrKykgcGJmLndyaXRlU0ZpeGVkMzIoYXJyW2ldKTsgfVxuZnVuY3Rpb24gd3JpdGVQYWNrZWRGaXhlZDY0KGFyciwgcGJmKSAgeyBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkrKykgcGJmLndyaXRlRml4ZWQ2NChhcnJbaV0pOyAgfVxuZnVuY3Rpb24gd3JpdGVQYWNrZWRTRml4ZWQ2NChhcnIsIHBiZikgeyBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkrKykgcGJmLndyaXRlU0ZpeGVkNjQoYXJyW2ldKTsgfVxuXG4vLyBCdWZmZXIgY29kZSBiZWxvdyBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9mZXJvc3MvYnVmZmVyLCBNSVQtbGljZW5zZWRcblxuZnVuY3Rpb24gcmVhZFVJbnQzMihidWYsIHBvcykge1xuICAgIHJldHVybiAoKGJ1Zltwb3NdKSB8XG4gICAgICAgIChidWZbcG9zICsgMV0gPDwgOCkgfFxuICAgICAgICAoYnVmW3BvcyArIDJdIDw8IDE2KSkgK1xuICAgICAgICAoYnVmW3BvcyArIDNdICogMHgxMDAwMDAwKTtcbn1cblxuZnVuY3Rpb24gd3JpdGVJbnQzMihidWYsIHZhbCwgcG9zKSB7XG4gICAgYnVmW3Bvc10gPSB2YWw7XG4gICAgYnVmW3BvcyArIDFdID0gKHZhbCA+Pj4gOCk7XG4gICAgYnVmW3BvcyArIDJdID0gKHZhbCA+Pj4gMTYpO1xuICAgIGJ1Zltwb3MgKyAzXSA9ICh2YWwgPj4+IDI0KTtcbn1cblxuZnVuY3Rpb24gcmVhZEludDMyKGJ1ZiwgcG9zKSB7XG4gICAgcmV0dXJuICgoYnVmW3Bvc10pIHxcbiAgICAgICAgKGJ1Zltwb3MgKyAxXSA8PCA4KSB8XG4gICAgICAgIChidWZbcG9zICsgMl0gPDwgMTYpKSArXG4gICAgICAgIChidWZbcG9zICsgM10gPDwgMjQpO1xufVxuXG5mdW5jdGlvbiByZWFkVXRmOChidWYsIHBvcywgZW5kKSB7XG4gICAgdmFyIHN0ciA9ICcnO1xuICAgIHZhciBpID0gcG9zO1xuXG4gICAgd2hpbGUgKGkgPCBlbmQpIHtcbiAgICAgICAgdmFyIGIwID0gYnVmW2ldO1xuICAgICAgICB2YXIgYyA9IG51bGw7IC8vIGNvZGVwb2ludFxuICAgICAgICB2YXIgYnl0ZXNQZXJTZXF1ZW5jZSA9XG4gICAgICAgICAgICBiMCA+IDB4RUYgPyA0IDpcbiAgICAgICAgICAgIGIwID4gMHhERiA/IDMgOlxuICAgICAgICAgICAgYjAgPiAweEJGID8gMiA6IDE7XG5cbiAgICAgICAgaWYgKGkgKyBieXRlc1BlclNlcXVlbmNlID4gZW5kKSBicmVhaztcblxuICAgICAgICB2YXIgYjEsIGIyLCBiMztcblxuICAgICAgICBpZiAoYnl0ZXNQZXJTZXF1ZW5jZSA9PT0gMSkge1xuICAgICAgICAgICAgaWYgKGIwIDwgMHg4MCkge1xuICAgICAgICAgICAgICAgIGMgPSBiMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChieXRlc1BlclNlcXVlbmNlID09PSAyKSB7XG4gICAgICAgICAgICBiMSA9IGJ1ZltpICsgMV07XG4gICAgICAgICAgICBpZiAoKGIxICYgMHhDMCkgPT09IDB4ODApIHtcbiAgICAgICAgICAgICAgICBjID0gKGIwICYgMHgxRikgPDwgMHg2IHwgKGIxICYgMHgzRik7XG4gICAgICAgICAgICAgICAgaWYgKGMgPD0gMHg3Rikge1xuICAgICAgICAgICAgICAgICAgICBjID0gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoYnl0ZXNQZXJTZXF1ZW5jZSA9PT0gMykge1xuICAgICAgICAgICAgYjEgPSBidWZbaSArIDFdO1xuICAgICAgICAgICAgYjIgPSBidWZbaSArIDJdO1xuICAgICAgICAgICAgaWYgKChiMSAmIDB4QzApID09PSAweDgwICYmIChiMiAmIDB4QzApID09PSAweDgwKSB7XG4gICAgICAgICAgICAgICAgYyA9IChiMCAmIDB4RikgPDwgMHhDIHwgKGIxICYgMHgzRikgPDwgMHg2IHwgKGIyICYgMHgzRik7XG4gICAgICAgICAgICAgICAgaWYgKGMgPD0gMHg3RkYgfHwgKGMgPj0gMHhEODAwICYmIGMgPD0gMHhERkZGKSkge1xuICAgICAgICAgICAgICAgICAgICBjID0gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoYnl0ZXNQZXJTZXF1ZW5jZSA9PT0gNCkge1xuICAgICAgICAgICAgYjEgPSBidWZbaSArIDFdO1xuICAgICAgICAgICAgYjIgPSBidWZbaSArIDJdO1xuICAgICAgICAgICAgYjMgPSBidWZbaSArIDNdO1xuICAgICAgICAgICAgaWYgKChiMSAmIDB4QzApID09PSAweDgwICYmIChiMiAmIDB4QzApID09PSAweDgwICYmIChiMyAmIDB4QzApID09PSAweDgwKSB7XG4gICAgICAgICAgICAgICAgYyA9IChiMCAmIDB4RikgPDwgMHgxMiB8IChiMSAmIDB4M0YpIDw8IDB4QyB8IChiMiAmIDB4M0YpIDw8IDB4NiB8IChiMyAmIDB4M0YpO1xuICAgICAgICAgICAgICAgIGlmIChjIDw9IDB4RkZGRiB8fCBjID49IDB4MTEwMDAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGMgPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjID09PSBudWxsKSB7XG4gICAgICAgICAgICBjID0gMHhGRkZEO1xuICAgICAgICAgICAgYnl0ZXNQZXJTZXF1ZW5jZSA9IDE7XG5cbiAgICAgICAgfSBlbHNlIGlmIChjID4gMHhGRkZGKSB7XG4gICAgICAgICAgICBjIC09IDB4MTAwMDA7XG4gICAgICAgICAgICBzdHIgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShjID4+PiAxMCAmIDB4M0ZGIHwgMHhEODAwKTtcbiAgICAgICAgICAgIGMgPSAweERDMDAgfCBjICYgMHgzRkY7XG4gICAgICAgIH1cblxuICAgICAgICBzdHIgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShjKTtcbiAgICAgICAgaSArPSBieXRlc1BlclNlcXVlbmNlO1xuICAgIH1cblxuICAgIHJldHVybiBzdHI7XG59XG5cbmZ1bmN0aW9uIHdyaXRlVXRmOChidWYsIHN0ciwgcG9zKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGMsIGxlYWQ7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYyA9IHN0ci5jaGFyQ29kZUF0KGkpOyAvLyBjb2RlIHBvaW50XG5cbiAgICAgICAgaWYgKGMgPiAweEQ3RkYgJiYgYyA8IDB4RTAwMCkge1xuICAgICAgICAgICAgaWYgKGxlYWQpIHtcbiAgICAgICAgICAgICAgICBpZiAoYyA8IDB4REMwMCkge1xuICAgICAgICAgICAgICAgICAgICBidWZbcG9zKytdID0gMHhFRjtcbiAgICAgICAgICAgICAgICAgICAgYnVmW3BvcysrXSA9IDB4QkY7XG4gICAgICAgICAgICAgICAgICAgIGJ1Zltwb3MrK10gPSAweEJEO1xuICAgICAgICAgICAgICAgICAgICBsZWFkID0gYztcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYyA9IGxlYWQgLSAweEQ4MDAgPDwgMTAgfCBjIC0gMHhEQzAwIHwgMHgxMDAwMDtcbiAgICAgICAgICAgICAgICAgICAgbGVhZCA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoYyA+IDB4REJGRiB8fCAoaSArIDEgPT09IHN0ci5sZW5ndGgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGJ1Zltwb3MrK10gPSAweEVGO1xuICAgICAgICAgICAgICAgICAgICBidWZbcG9zKytdID0gMHhCRjtcbiAgICAgICAgICAgICAgICAgICAgYnVmW3BvcysrXSA9IDB4QkQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbGVhZCA9IGM7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGxlYWQpIHtcbiAgICAgICAgICAgIGJ1Zltwb3MrK10gPSAweEVGO1xuICAgICAgICAgICAgYnVmW3BvcysrXSA9IDB4QkY7XG4gICAgICAgICAgICBidWZbcG9zKytdID0gMHhCRDtcbiAgICAgICAgICAgIGxlYWQgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGMgPCAweDgwKSB7XG4gICAgICAgICAgICBidWZbcG9zKytdID0gYztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChjIDwgMHg4MDApIHtcbiAgICAgICAgICAgICAgICBidWZbcG9zKytdID0gYyA+PiAweDYgfCAweEMwO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoYyA8IDB4MTAwMDApIHtcbiAgICAgICAgICAgICAgICAgICAgYnVmW3BvcysrXSA9IGMgPj4gMHhDIHwgMHhFMDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBidWZbcG9zKytdID0gYyA+PiAweDEyIHwgMHhGMDtcbiAgICAgICAgICAgICAgICAgICAgYnVmW3BvcysrXSA9IGMgPj4gMHhDICYgMHgzRiB8IDB4ODA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJ1Zltwb3MrK10gPSBjID4+IDB4NiAmIDB4M0YgfCAweDgwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnVmW3BvcysrXSA9IGMgJiAweDNGIHwgMHg4MDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcG9zO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHBhcnRpYWxTb3J0O1xuXG4vLyBGbG95ZC1SaXZlc3Qgc2VsZWN0aW9uIGFsZ29yaXRobTpcbi8vIFJlYXJyYW5nZSBpdGVtcyBzbyB0aGF0IGFsbCBpdGVtcyBpbiB0aGUgW2xlZnQsIGtdIHJhbmdlIGFyZSBzbWFsbGVyIHRoYW4gYWxsIGl0ZW1zIGluIChrLCByaWdodF07XG4vLyBUaGUgay10aCBlbGVtZW50IHdpbGwgaGF2ZSB0aGUgKGsgLSBsZWZ0ICsgMSl0aCBzbWFsbGVzdCB2YWx1ZSBpbiBbbGVmdCwgcmlnaHRdXG5cbmZ1bmN0aW9uIHBhcnRpYWxTb3J0KGFyciwgaywgbGVmdCwgcmlnaHQsIGNvbXBhcmUpIHtcbiAgICBsZWZ0ID0gbGVmdCB8fCAwO1xuICAgIHJpZ2h0ID0gcmlnaHQgfHwgKGFyci5sZW5ndGggLSAxKTtcbiAgICBjb21wYXJlID0gY29tcGFyZSB8fCBkZWZhdWx0Q29tcGFyZTtcblxuICAgIHdoaWxlIChyaWdodCA+IGxlZnQpIHtcbiAgICAgICAgaWYgKHJpZ2h0IC0gbGVmdCA+IDYwMCkge1xuICAgICAgICAgICAgdmFyIG4gPSByaWdodCAtIGxlZnQgKyAxO1xuICAgICAgICAgICAgdmFyIG0gPSBrIC0gbGVmdCArIDE7XG4gICAgICAgICAgICB2YXIgeiA9IE1hdGgubG9nKG4pO1xuICAgICAgICAgICAgdmFyIHMgPSAwLjUgKiBNYXRoLmV4cCgyICogeiAvIDMpO1xuICAgICAgICAgICAgdmFyIHNkID0gMC41ICogTWF0aC5zcXJ0KHogKiBzICogKG4gLSBzKSAvIG4pICogKG0gLSBuIC8gMiA8IDAgPyAtMSA6IDEpO1xuICAgICAgICAgICAgdmFyIG5ld0xlZnQgPSBNYXRoLm1heChsZWZ0LCBNYXRoLmZsb29yKGsgLSBtICogcyAvIG4gKyBzZCkpO1xuICAgICAgICAgICAgdmFyIG5ld1JpZ2h0ID0gTWF0aC5taW4ocmlnaHQsIE1hdGguZmxvb3IoayArIChuIC0gbSkgKiBzIC8gbiArIHNkKSk7XG4gICAgICAgICAgICBwYXJ0aWFsU29ydChhcnIsIGssIG5ld0xlZnQsIG5ld1JpZ2h0LCBjb21wYXJlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB0ID0gYXJyW2tdO1xuICAgICAgICB2YXIgaSA9IGxlZnQ7XG4gICAgICAgIHZhciBqID0gcmlnaHQ7XG5cbiAgICAgICAgc3dhcChhcnIsIGxlZnQsIGspO1xuICAgICAgICBpZiAoY29tcGFyZShhcnJbcmlnaHRdLCB0KSA+IDApIHN3YXAoYXJyLCBsZWZ0LCByaWdodCk7XG5cbiAgICAgICAgd2hpbGUgKGkgPCBqKSB7XG4gICAgICAgICAgICBzd2FwKGFyciwgaSwgaik7XG4gICAgICAgICAgICBpKys7XG4gICAgICAgICAgICBqLS07XG4gICAgICAgICAgICB3aGlsZSAoY29tcGFyZShhcnJbaV0sIHQpIDwgMCkgaSsrO1xuICAgICAgICAgICAgd2hpbGUgKGNvbXBhcmUoYXJyW2pdLCB0KSA+IDApIGotLTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjb21wYXJlKGFycltsZWZ0XSwgdCkgPT09IDApIHN3YXAoYXJyLCBsZWZ0LCBqKTtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBqKys7XG4gICAgICAgICAgICBzd2FwKGFyciwgaiwgcmlnaHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGogPD0gaykgbGVmdCA9IGogKyAxO1xuICAgICAgICBpZiAoayA8PSBqKSByaWdodCA9IGogLSAxO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gc3dhcChhcnIsIGksIGopIHtcbiAgICB2YXIgdG1wID0gYXJyW2ldO1xuICAgIGFycltpXSA9IGFycltqXTtcbiAgICBhcnJbal0gPSB0bXA7XG59XG5cbmZ1bmN0aW9uIGRlZmF1bHRDb21wYXJlKGEsIGIpIHtcbiAgICByZXR1cm4gYSA8IGIgPyAtMSA6IGEgPiBiID8gMSA6IDA7XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gcmJ1c2g7XG5cbnZhciBxdWlja3NlbGVjdCA9IHJlcXVpcmUoJ3F1aWNrc2VsZWN0Jyk7XG5cbmZ1bmN0aW9uIHJidXNoKG1heEVudHJpZXMsIGZvcm1hdCkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiByYnVzaCkpIHJldHVybiBuZXcgcmJ1c2gobWF4RW50cmllcywgZm9ybWF0KTtcblxuICAgIC8vIG1heCBlbnRyaWVzIGluIGEgbm9kZSBpcyA5IGJ5IGRlZmF1bHQ7IG1pbiBub2RlIGZpbGwgaXMgNDAlIGZvciBiZXN0IHBlcmZvcm1hbmNlXG4gICAgdGhpcy5fbWF4RW50cmllcyA9IE1hdGgubWF4KDQsIG1heEVudHJpZXMgfHwgOSk7XG4gICAgdGhpcy5fbWluRW50cmllcyA9IE1hdGgubWF4KDIsIE1hdGguY2VpbCh0aGlzLl9tYXhFbnRyaWVzICogMC40KSk7XG5cbiAgICBpZiAoZm9ybWF0KSB7XG4gICAgICAgIHRoaXMuX2luaXRGb3JtYXQoZm9ybWF0KTtcbiAgICB9XG5cbiAgICB0aGlzLmNsZWFyKCk7XG59XG5cbnJidXNoLnByb3RvdHlwZSA9IHtcblxuICAgIGFsbDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWxsKHRoaXMuZGF0YSwgW10pO1xuICAgIH0sXG5cbiAgICBzZWFyY2g6IGZ1bmN0aW9uIChiYm94KSB7XG5cbiAgICAgICAgdmFyIG5vZGUgPSB0aGlzLmRhdGEsXG4gICAgICAgICAgICByZXN1bHQgPSBbXSxcbiAgICAgICAgICAgIHRvQkJveCA9IHRoaXMudG9CQm94O1xuXG4gICAgICAgIGlmICghaW50ZXJzZWN0cyhiYm94LCBub2RlKSkgcmV0dXJuIHJlc3VsdDtcblxuICAgICAgICB2YXIgbm9kZXNUb1NlYXJjaCA9IFtdLFxuICAgICAgICAgICAgaSwgbGVuLCBjaGlsZCwgY2hpbGRCQm94O1xuXG4gICAgICAgIHdoaWxlIChub2RlKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBub2RlLmNoaWxkcmVuLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cbiAgICAgICAgICAgICAgICBjaGlsZCA9IG5vZGUuY2hpbGRyZW5baV07XG4gICAgICAgICAgICAgICAgY2hpbGRCQm94ID0gbm9kZS5sZWFmID8gdG9CQm94KGNoaWxkKSA6IGNoaWxkO1xuXG4gICAgICAgICAgICAgICAgaWYgKGludGVyc2VjdHMoYmJveCwgY2hpbGRCQm94KSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAobm9kZS5sZWFmKSByZXN1bHQucHVzaChjaGlsZCk7XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGNvbnRhaW5zKGJib3gsIGNoaWxkQkJveCkpIHRoaXMuX2FsbChjaGlsZCwgcmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBub2Rlc1RvU2VhcmNoLnB1c2goY2hpbGQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG5vZGUgPSBub2Rlc1RvU2VhcmNoLnBvcCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgY29sbGlkZXM6IGZ1bmN0aW9uIChiYm94KSB7XG5cbiAgICAgICAgdmFyIG5vZGUgPSB0aGlzLmRhdGEsXG4gICAgICAgICAgICB0b0JCb3ggPSB0aGlzLnRvQkJveDtcblxuICAgICAgICBpZiAoIWludGVyc2VjdHMoYmJveCwgbm9kZSkpIHJldHVybiBmYWxzZTtcblxuICAgICAgICB2YXIgbm9kZXNUb1NlYXJjaCA9IFtdLFxuICAgICAgICAgICAgaSwgbGVuLCBjaGlsZCwgY2hpbGRCQm94O1xuXG4gICAgICAgIHdoaWxlIChub2RlKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBub2RlLmNoaWxkcmVuLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cbiAgICAgICAgICAgICAgICBjaGlsZCA9IG5vZGUuY2hpbGRyZW5baV07XG4gICAgICAgICAgICAgICAgY2hpbGRCQm94ID0gbm9kZS5sZWFmID8gdG9CQm94KGNoaWxkKSA6IGNoaWxkO1xuXG4gICAgICAgICAgICAgICAgaWYgKGludGVyc2VjdHMoYmJveCwgY2hpbGRCQm94KSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAobm9kZS5sZWFmIHx8IGNvbnRhaW5zKGJib3gsIGNoaWxkQkJveCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBub2Rlc1RvU2VhcmNoLnB1c2goY2hpbGQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG5vZGUgPSBub2Rlc1RvU2VhcmNoLnBvcCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0sXG5cbiAgICBsb2FkOiBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICBpZiAoIShkYXRhICYmIGRhdGEubGVuZ3RoKSkgcmV0dXJuIHRoaXM7XG5cbiAgICAgICAgaWYgKGRhdGEubGVuZ3RoIDwgdGhpcy5fbWluRW50cmllcykge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGRhdGEubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzLmluc2VydChkYXRhW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcmVjdXJzaXZlbHkgYnVpbGQgdGhlIHRyZWUgd2l0aCB0aGUgZ2l2ZW4gZGF0YSBmcm9tIHN0cmF0Y2ggdXNpbmcgT01UIGFsZ29yaXRobVxuICAgICAgICB2YXIgbm9kZSA9IHRoaXMuX2J1aWxkKGRhdGEuc2xpY2UoKSwgMCwgZGF0YS5sZW5ndGggLSAxLCAwKTtcblxuICAgICAgICBpZiAoIXRoaXMuZGF0YS5jaGlsZHJlbi5sZW5ndGgpIHtcbiAgICAgICAgICAgIC8vIHNhdmUgYXMgaXMgaWYgdHJlZSBpcyBlbXB0eVxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbm9kZTtcblxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5oZWlnaHQgPT09IG5vZGUuaGVpZ2h0KSB7XG4gICAgICAgICAgICAvLyBzcGxpdCByb290IGlmIHRyZWVzIGhhdmUgdGhlIHNhbWUgaGVpZ2h0XG4gICAgICAgICAgICB0aGlzLl9zcGxpdFJvb3QodGhpcy5kYXRhLCBub2RlKTtcblxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5oZWlnaHQgPCBub2RlLmhlaWdodCkge1xuICAgICAgICAgICAgICAgIC8vIHN3YXAgdHJlZXMgaWYgaW5zZXJ0ZWQgb25lIGlzIGJpZ2dlclxuICAgICAgICAgICAgICAgIHZhciB0bXBOb2RlID0gdGhpcy5kYXRhO1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YSA9IG5vZGU7XG4gICAgICAgICAgICAgICAgbm9kZSA9IHRtcE5vZGU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGluc2VydCB0aGUgc21hbGwgdHJlZSBpbnRvIHRoZSBsYXJnZSB0cmVlIGF0IGFwcHJvcHJpYXRlIGxldmVsXG4gICAgICAgICAgICB0aGlzLl9pbnNlcnQobm9kZSwgdGhpcy5kYXRhLmhlaWdodCAtIG5vZGUuaGVpZ2h0IC0gMSwgdHJ1ZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgaW5zZXJ0OiBmdW5jdGlvbiAoaXRlbSkge1xuICAgICAgICBpZiAoaXRlbSkgdGhpcy5faW5zZXJ0KGl0ZW0sIHRoaXMuZGF0YS5oZWlnaHQgLSAxKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuZGF0YSA9IGNyZWF0ZU5vZGUoW10pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgcmVtb3ZlOiBmdW5jdGlvbiAoaXRlbSwgZXF1YWxzRm4pIHtcbiAgICAgICAgaWYgKCFpdGVtKSByZXR1cm4gdGhpcztcblxuICAgICAgICB2YXIgbm9kZSA9IHRoaXMuZGF0YSxcbiAgICAgICAgICAgIGJib3ggPSB0aGlzLnRvQkJveChpdGVtKSxcbiAgICAgICAgICAgIHBhdGggPSBbXSxcbiAgICAgICAgICAgIGluZGV4ZXMgPSBbXSxcbiAgICAgICAgICAgIGksIHBhcmVudCwgaW5kZXgsIGdvaW5nVXA7XG5cbiAgICAgICAgLy8gZGVwdGgtZmlyc3QgaXRlcmF0aXZlIHRyZWUgdHJhdmVyc2FsXG4gICAgICAgIHdoaWxlIChub2RlIHx8IHBhdGgubGVuZ3RoKSB7XG5cbiAgICAgICAgICAgIGlmICghbm9kZSkgeyAvLyBnbyB1cFxuICAgICAgICAgICAgICAgIG5vZGUgPSBwYXRoLnBvcCgpO1xuICAgICAgICAgICAgICAgIHBhcmVudCA9IHBhdGhbcGF0aC5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICBpID0gaW5kZXhlcy5wb3AoKTtcbiAgICAgICAgICAgICAgICBnb2luZ1VwID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG5vZGUubGVhZikgeyAvLyBjaGVjayBjdXJyZW50IG5vZGVcbiAgICAgICAgICAgICAgICBpbmRleCA9IGZpbmRJdGVtKGl0ZW0sIG5vZGUuY2hpbGRyZW4sIGVxdWFsc0ZuKTtcblxuICAgICAgICAgICAgICAgIGlmIChpbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaXRlbSBmb3VuZCwgcmVtb3ZlIHRoZSBpdGVtIGFuZCBjb25kZW5zZSB0cmVlIHVwd2FyZHNcbiAgICAgICAgICAgICAgICAgICAgbm9kZS5jaGlsZHJlbi5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgICAgICBwYXRoLnB1c2gobm9kZSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2NvbmRlbnNlKHBhdGgpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghZ29pbmdVcCAmJiAhbm9kZS5sZWFmICYmIGNvbnRhaW5zKG5vZGUsIGJib3gpKSB7IC8vIGdvIGRvd25cbiAgICAgICAgICAgICAgICBwYXRoLnB1c2gobm9kZSk7XG4gICAgICAgICAgICAgICAgaW5kZXhlcy5wdXNoKGkpO1xuICAgICAgICAgICAgICAgIGkgPSAwO1xuICAgICAgICAgICAgICAgIHBhcmVudCA9IG5vZGU7XG4gICAgICAgICAgICAgICAgbm9kZSA9IG5vZGUuY2hpbGRyZW5bMF07XG5cbiAgICAgICAgICAgIH0gZWxzZSBpZiAocGFyZW50KSB7IC8vIGdvIHJpZ2h0XG4gICAgICAgICAgICAgICAgaSsrO1xuICAgICAgICAgICAgICAgIG5vZGUgPSBwYXJlbnQuY2hpbGRyZW5baV07XG4gICAgICAgICAgICAgICAgZ29pbmdVcCA9IGZhbHNlO1xuXG4gICAgICAgICAgICB9IGVsc2Ugbm9kZSA9IG51bGw7IC8vIG5vdGhpbmcgZm91bmRcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICB0b0JCb3g6IGZ1bmN0aW9uIChpdGVtKSB7IHJldHVybiBpdGVtOyB9LFxuXG4gICAgY29tcGFyZU1pblg6IGNvbXBhcmVOb2RlTWluWCxcbiAgICBjb21wYXJlTWluWTogY29tcGFyZU5vZGVNaW5ZLFxuXG4gICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzLmRhdGE7IH0sXG5cbiAgICBmcm9tSlNPTjogZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgdGhpcy5kYXRhID0gZGF0YTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIF9hbGw6IGZ1bmN0aW9uIChub2RlLCByZXN1bHQpIHtcbiAgICAgICAgdmFyIG5vZGVzVG9TZWFyY2ggPSBbXTtcbiAgICAgICAgd2hpbGUgKG5vZGUpIHtcbiAgICAgICAgICAgIGlmIChub2RlLmxlYWYpIHJlc3VsdC5wdXNoLmFwcGx5KHJlc3VsdCwgbm9kZS5jaGlsZHJlbik7XG4gICAgICAgICAgICBlbHNlIG5vZGVzVG9TZWFyY2gucHVzaC5hcHBseShub2Rlc1RvU2VhcmNoLCBub2RlLmNoaWxkcmVuKTtcblxuICAgICAgICAgICAgbm9kZSA9IG5vZGVzVG9TZWFyY2gucG9wKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgX2J1aWxkOiBmdW5jdGlvbiAoaXRlbXMsIGxlZnQsIHJpZ2h0LCBoZWlnaHQpIHtcblxuICAgICAgICB2YXIgTiA9IHJpZ2h0IC0gbGVmdCArIDEsXG4gICAgICAgICAgICBNID0gdGhpcy5fbWF4RW50cmllcyxcbiAgICAgICAgICAgIG5vZGU7XG5cbiAgICAgICAgaWYgKE4gPD0gTSkge1xuICAgICAgICAgICAgLy8gcmVhY2hlZCBsZWFmIGxldmVsOyByZXR1cm4gbGVhZlxuICAgICAgICAgICAgbm9kZSA9IGNyZWF0ZU5vZGUoaXRlbXMuc2xpY2UobGVmdCwgcmlnaHQgKyAxKSk7XG4gICAgICAgICAgICBjYWxjQkJveChub2RlLCB0aGlzLnRvQkJveCk7XG4gICAgICAgICAgICByZXR1cm4gbm9kZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghaGVpZ2h0KSB7XG4gICAgICAgICAgICAvLyB0YXJnZXQgaGVpZ2h0IG9mIHRoZSBidWxrLWxvYWRlZCB0cmVlXG4gICAgICAgICAgICBoZWlnaHQgPSBNYXRoLmNlaWwoTWF0aC5sb2coTikgLyBNYXRoLmxvZyhNKSk7XG5cbiAgICAgICAgICAgIC8vIHRhcmdldCBudW1iZXIgb2Ygcm9vdCBlbnRyaWVzIHRvIG1heGltaXplIHN0b3JhZ2UgdXRpbGl6YXRpb25cbiAgICAgICAgICAgIE0gPSBNYXRoLmNlaWwoTiAvIE1hdGgucG93KE0sIGhlaWdodCAtIDEpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5vZGUgPSBjcmVhdGVOb2RlKFtdKTtcbiAgICAgICAgbm9kZS5sZWFmID0gZmFsc2U7XG4gICAgICAgIG5vZGUuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIC8vIHNwbGl0IHRoZSBpdGVtcyBpbnRvIE0gbW9zdGx5IHNxdWFyZSB0aWxlc1xuXG4gICAgICAgIHZhciBOMiA9IE1hdGguY2VpbChOIC8gTSksXG4gICAgICAgICAgICBOMSA9IE4yICogTWF0aC5jZWlsKE1hdGguc3FydChNKSksXG4gICAgICAgICAgICBpLCBqLCByaWdodDIsIHJpZ2h0MztcblxuICAgICAgICBtdWx0aVNlbGVjdChpdGVtcywgbGVmdCwgcmlnaHQsIE4xLCB0aGlzLmNvbXBhcmVNaW5YKTtcblxuICAgICAgICBmb3IgKGkgPSBsZWZ0OyBpIDw9IHJpZ2h0OyBpICs9IE4xKSB7XG5cbiAgICAgICAgICAgIHJpZ2h0MiA9IE1hdGgubWluKGkgKyBOMSAtIDEsIHJpZ2h0KTtcblxuICAgICAgICAgICAgbXVsdGlTZWxlY3QoaXRlbXMsIGksIHJpZ2h0MiwgTjIsIHRoaXMuY29tcGFyZU1pblkpO1xuXG4gICAgICAgICAgICBmb3IgKGogPSBpOyBqIDw9IHJpZ2h0MjsgaiArPSBOMikge1xuXG4gICAgICAgICAgICAgICAgcmlnaHQzID0gTWF0aC5taW4oaiArIE4yIC0gMSwgcmlnaHQyKTtcblxuICAgICAgICAgICAgICAgIC8vIHBhY2sgZWFjaCBlbnRyeSByZWN1cnNpdmVseVxuICAgICAgICAgICAgICAgIG5vZGUuY2hpbGRyZW4ucHVzaCh0aGlzLl9idWlsZChpdGVtcywgaiwgcmlnaHQzLCBoZWlnaHQgLSAxKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjYWxjQkJveChub2RlLCB0aGlzLnRvQkJveCk7XG5cbiAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgfSxcblxuICAgIF9jaG9vc2VTdWJ0cmVlOiBmdW5jdGlvbiAoYmJveCwgbm9kZSwgbGV2ZWwsIHBhdGgpIHtcblxuICAgICAgICB2YXIgaSwgbGVuLCBjaGlsZCwgdGFyZ2V0Tm9kZSwgYXJlYSwgZW5sYXJnZW1lbnQsIG1pbkFyZWEsIG1pbkVubGFyZ2VtZW50O1xuXG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgICBwYXRoLnB1c2gobm9kZSk7XG5cbiAgICAgICAgICAgIGlmIChub2RlLmxlYWYgfHwgcGF0aC5sZW5ndGggLSAxID09PSBsZXZlbCkgYnJlYWs7XG5cbiAgICAgICAgICAgIG1pbkFyZWEgPSBtaW5FbmxhcmdlbWVudCA9IEluZmluaXR5O1xuXG4gICAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBub2RlLmNoaWxkcmVuLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY2hpbGQgPSBub2RlLmNoaWxkcmVuW2ldO1xuICAgICAgICAgICAgICAgIGFyZWEgPSBiYm94QXJlYShjaGlsZCk7XG4gICAgICAgICAgICAgICAgZW5sYXJnZW1lbnQgPSBlbmxhcmdlZEFyZWEoYmJveCwgY2hpbGQpIC0gYXJlYTtcblxuICAgICAgICAgICAgICAgIC8vIGNob29zZSBlbnRyeSB3aXRoIHRoZSBsZWFzdCBhcmVhIGVubGFyZ2VtZW50XG4gICAgICAgICAgICAgICAgaWYgKGVubGFyZ2VtZW50IDwgbWluRW5sYXJnZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgbWluRW5sYXJnZW1lbnQgPSBlbmxhcmdlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgbWluQXJlYSA9IGFyZWEgPCBtaW5BcmVhID8gYXJlYSA6IG1pbkFyZWE7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldE5vZGUgPSBjaGlsZDtcblxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZW5sYXJnZW1lbnQgPT09IG1pbkVubGFyZ2VtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIG90aGVyd2lzZSBjaG9vc2Ugb25lIHdpdGggdGhlIHNtYWxsZXN0IGFyZWFcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFyZWEgPCBtaW5BcmVhKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtaW5BcmVhID0gYXJlYTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldE5vZGUgPSBjaGlsZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbm9kZSA9IHRhcmdldE5vZGUgfHwgbm9kZS5jaGlsZHJlblswXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBub2RlO1xuICAgIH0sXG5cbiAgICBfaW5zZXJ0OiBmdW5jdGlvbiAoaXRlbSwgbGV2ZWwsIGlzTm9kZSkge1xuXG4gICAgICAgIHZhciB0b0JCb3ggPSB0aGlzLnRvQkJveCxcbiAgICAgICAgICAgIGJib3ggPSBpc05vZGUgPyBpdGVtIDogdG9CQm94KGl0ZW0pLFxuICAgICAgICAgICAgaW5zZXJ0UGF0aCA9IFtdO1xuXG4gICAgICAgIC8vIGZpbmQgdGhlIGJlc3Qgbm9kZSBmb3IgYWNjb21tb2RhdGluZyB0aGUgaXRlbSwgc2F2aW5nIGFsbCBub2RlcyBhbG9uZyB0aGUgcGF0aCB0b29cbiAgICAgICAgdmFyIG5vZGUgPSB0aGlzLl9jaG9vc2VTdWJ0cmVlKGJib3gsIHRoaXMuZGF0YSwgbGV2ZWwsIGluc2VydFBhdGgpO1xuXG4gICAgICAgIC8vIHB1dCB0aGUgaXRlbSBpbnRvIHRoZSBub2RlXG4gICAgICAgIG5vZGUuY2hpbGRyZW4ucHVzaChpdGVtKTtcbiAgICAgICAgZXh0ZW5kKG5vZGUsIGJib3gpO1xuXG4gICAgICAgIC8vIHNwbGl0IG9uIG5vZGUgb3ZlcmZsb3c7IHByb3BhZ2F0ZSB1cHdhcmRzIGlmIG5lY2Vzc2FyeVxuICAgICAgICB3aGlsZSAobGV2ZWwgPj0gMCkge1xuICAgICAgICAgICAgaWYgKGluc2VydFBhdGhbbGV2ZWxdLmNoaWxkcmVuLmxlbmd0aCA+IHRoaXMuX21heEVudHJpZXMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zcGxpdChpbnNlcnRQYXRoLCBsZXZlbCk7XG4gICAgICAgICAgICAgICAgbGV2ZWwtLTtcbiAgICAgICAgICAgIH0gZWxzZSBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGFkanVzdCBiYm94ZXMgYWxvbmcgdGhlIGluc2VydGlvbiBwYXRoXG4gICAgICAgIHRoaXMuX2FkanVzdFBhcmVudEJCb3hlcyhiYm94LCBpbnNlcnRQYXRoLCBsZXZlbCk7XG4gICAgfSxcblxuICAgIC8vIHNwbGl0IG92ZXJmbG93ZWQgbm9kZSBpbnRvIHR3b1xuICAgIF9zcGxpdDogZnVuY3Rpb24gKGluc2VydFBhdGgsIGxldmVsKSB7XG5cbiAgICAgICAgdmFyIG5vZGUgPSBpbnNlcnRQYXRoW2xldmVsXSxcbiAgICAgICAgICAgIE0gPSBub2RlLmNoaWxkcmVuLmxlbmd0aCxcbiAgICAgICAgICAgIG0gPSB0aGlzLl9taW5FbnRyaWVzO1xuXG4gICAgICAgIHRoaXMuX2Nob29zZVNwbGl0QXhpcyhub2RlLCBtLCBNKTtcblxuICAgICAgICB2YXIgc3BsaXRJbmRleCA9IHRoaXMuX2Nob29zZVNwbGl0SW5kZXgobm9kZSwgbSwgTSk7XG5cbiAgICAgICAgdmFyIG5ld05vZGUgPSBjcmVhdGVOb2RlKG5vZGUuY2hpbGRyZW4uc3BsaWNlKHNwbGl0SW5kZXgsIG5vZGUuY2hpbGRyZW4ubGVuZ3RoIC0gc3BsaXRJbmRleCkpO1xuICAgICAgICBuZXdOb2RlLmhlaWdodCA9IG5vZGUuaGVpZ2h0O1xuICAgICAgICBuZXdOb2RlLmxlYWYgPSBub2RlLmxlYWY7XG5cbiAgICAgICAgY2FsY0JCb3gobm9kZSwgdGhpcy50b0JCb3gpO1xuICAgICAgICBjYWxjQkJveChuZXdOb2RlLCB0aGlzLnRvQkJveCk7XG5cbiAgICAgICAgaWYgKGxldmVsKSBpbnNlcnRQYXRoW2xldmVsIC0gMV0uY2hpbGRyZW4ucHVzaChuZXdOb2RlKTtcbiAgICAgICAgZWxzZSB0aGlzLl9zcGxpdFJvb3Qobm9kZSwgbmV3Tm9kZSk7XG4gICAgfSxcblxuICAgIF9zcGxpdFJvb3Q6IGZ1bmN0aW9uIChub2RlLCBuZXdOb2RlKSB7XG4gICAgICAgIC8vIHNwbGl0IHJvb3Qgbm9kZVxuICAgICAgICB0aGlzLmRhdGEgPSBjcmVhdGVOb2RlKFtub2RlLCBuZXdOb2RlXSk7XG4gICAgICAgIHRoaXMuZGF0YS5oZWlnaHQgPSBub2RlLmhlaWdodCArIDE7XG4gICAgICAgIHRoaXMuZGF0YS5sZWFmID0gZmFsc2U7XG4gICAgICAgIGNhbGNCQm94KHRoaXMuZGF0YSwgdGhpcy50b0JCb3gpO1xuICAgIH0sXG5cbiAgICBfY2hvb3NlU3BsaXRJbmRleDogZnVuY3Rpb24gKG5vZGUsIG0sIE0pIHtcblxuICAgICAgICB2YXIgaSwgYmJveDEsIGJib3gyLCBvdmVybGFwLCBhcmVhLCBtaW5PdmVybGFwLCBtaW5BcmVhLCBpbmRleDtcblxuICAgICAgICBtaW5PdmVybGFwID0gbWluQXJlYSA9IEluZmluaXR5O1xuXG4gICAgICAgIGZvciAoaSA9IG07IGkgPD0gTSAtIG07IGkrKykge1xuICAgICAgICAgICAgYmJveDEgPSBkaXN0QkJveChub2RlLCAwLCBpLCB0aGlzLnRvQkJveCk7XG4gICAgICAgICAgICBiYm94MiA9IGRpc3RCQm94KG5vZGUsIGksIE0sIHRoaXMudG9CQm94KTtcblxuICAgICAgICAgICAgb3ZlcmxhcCA9IGludGVyc2VjdGlvbkFyZWEoYmJveDEsIGJib3gyKTtcbiAgICAgICAgICAgIGFyZWEgPSBiYm94QXJlYShiYm94MSkgKyBiYm94QXJlYShiYm94Mik7XG5cbiAgICAgICAgICAgIC8vIGNob29zZSBkaXN0cmlidXRpb24gd2l0aCBtaW5pbXVtIG92ZXJsYXBcbiAgICAgICAgICAgIGlmIChvdmVybGFwIDwgbWluT3ZlcmxhcCkge1xuICAgICAgICAgICAgICAgIG1pbk92ZXJsYXAgPSBvdmVybGFwO1xuICAgICAgICAgICAgICAgIGluZGV4ID0gaTtcblxuICAgICAgICAgICAgICAgIG1pbkFyZWEgPSBhcmVhIDwgbWluQXJlYSA/IGFyZWEgOiBtaW5BcmVhO1xuXG4gICAgICAgICAgICB9IGVsc2UgaWYgKG92ZXJsYXAgPT09IG1pbk92ZXJsYXApIHtcbiAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2UgY2hvb3NlIGRpc3RyaWJ1dGlvbiB3aXRoIG1pbmltdW0gYXJlYVxuICAgICAgICAgICAgICAgIGlmIChhcmVhIDwgbWluQXJlYSkge1xuICAgICAgICAgICAgICAgICAgICBtaW5BcmVhID0gYXJlYTtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXggPSBpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBpbmRleDtcbiAgICB9LFxuXG4gICAgLy8gc29ydHMgbm9kZSBjaGlsZHJlbiBieSB0aGUgYmVzdCBheGlzIGZvciBzcGxpdFxuICAgIF9jaG9vc2VTcGxpdEF4aXM6IGZ1bmN0aW9uIChub2RlLCBtLCBNKSB7XG5cbiAgICAgICAgdmFyIGNvbXBhcmVNaW5YID0gbm9kZS5sZWFmID8gdGhpcy5jb21wYXJlTWluWCA6IGNvbXBhcmVOb2RlTWluWCxcbiAgICAgICAgICAgIGNvbXBhcmVNaW5ZID0gbm9kZS5sZWFmID8gdGhpcy5jb21wYXJlTWluWSA6IGNvbXBhcmVOb2RlTWluWSxcbiAgICAgICAgICAgIHhNYXJnaW4gPSB0aGlzLl9hbGxEaXN0TWFyZ2luKG5vZGUsIG0sIE0sIGNvbXBhcmVNaW5YKSxcbiAgICAgICAgICAgIHlNYXJnaW4gPSB0aGlzLl9hbGxEaXN0TWFyZ2luKG5vZGUsIG0sIE0sIGNvbXBhcmVNaW5ZKTtcblxuICAgICAgICAvLyBpZiB0b3RhbCBkaXN0cmlidXRpb25zIG1hcmdpbiB2YWx1ZSBpcyBtaW5pbWFsIGZvciB4LCBzb3J0IGJ5IG1pblgsXG4gICAgICAgIC8vIG90aGVyd2lzZSBpdCdzIGFscmVhZHkgc29ydGVkIGJ5IG1pbllcbiAgICAgICAgaWYgKHhNYXJnaW4gPCB5TWFyZ2luKSBub2RlLmNoaWxkcmVuLnNvcnQoY29tcGFyZU1pblgpO1xuICAgIH0sXG5cbiAgICAvLyB0b3RhbCBtYXJnaW4gb2YgYWxsIHBvc3NpYmxlIHNwbGl0IGRpc3RyaWJ1dGlvbnMgd2hlcmUgZWFjaCBub2RlIGlzIGF0IGxlYXN0IG0gZnVsbFxuICAgIF9hbGxEaXN0TWFyZ2luOiBmdW5jdGlvbiAobm9kZSwgbSwgTSwgY29tcGFyZSkge1xuXG4gICAgICAgIG5vZGUuY2hpbGRyZW4uc29ydChjb21wYXJlKTtcblxuICAgICAgICB2YXIgdG9CQm94ID0gdGhpcy50b0JCb3gsXG4gICAgICAgICAgICBsZWZ0QkJveCA9IGRpc3RCQm94KG5vZGUsIDAsIG0sIHRvQkJveCksXG4gICAgICAgICAgICByaWdodEJCb3ggPSBkaXN0QkJveChub2RlLCBNIC0gbSwgTSwgdG9CQm94KSxcbiAgICAgICAgICAgIG1hcmdpbiA9IGJib3hNYXJnaW4obGVmdEJCb3gpICsgYmJveE1hcmdpbihyaWdodEJCb3gpLFxuICAgICAgICAgICAgaSwgY2hpbGQ7XG5cbiAgICAgICAgZm9yIChpID0gbTsgaSA8IE0gLSBtOyBpKyspIHtcbiAgICAgICAgICAgIGNoaWxkID0gbm9kZS5jaGlsZHJlbltpXTtcbiAgICAgICAgICAgIGV4dGVuZChsZWZ0QkJveCwgbm9kZS5sZWFmID8gdG9CQm94KGNoaWxkKSA6IGNoaWxkKTtcbiAgICAgICAgICAgIG1hcmdpbiArPSBiYm94TWFyZ2luKGxlZnRCQm94KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoaSA9IE0gLSBtIC0gMTsgaSA+PSBtOyBpLS0pIHtcbiAgICAgICAgICAgIGNoaWxkID0gbm9kZS5jaGlsZHJlbltpXTtcbiAgICAgICAgICAgIGV4dGVuZChyaWdodEJCb3gsIG5vZGUubGVhZiA/IHRvQkJveChjaGlsZCkgOiBjaGlsZCk7XG4gICAgICAgICAgICBtYXJnaW4gKz0gYmJveE1hcmdpbihyaWdodEJCb3gpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG1hcmdpbjtcbiAgICB9LFxuXG4gICAgX2FkanVzdFBhcmVudEJCb3hlczogZnVuY3Rpb24gKGJib3gsIHBhdGgsIGxldmVsKSB7XG4gICAgICAgIC8vIGFkanVzdCBiYm94ZXMgYWxvbmcgdGhlIGdpdmVuIHRyZWUgcGF0aFxuICAgICAgICBmb3IgKHZhciBpID0gbGV2ZWw7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICBleHRlbmQocGF0aFtpXSwgYmJveCk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgX2NvbmRlbnNlOiBmdW5jdGlvbiAocGF0aCkge1xuICAgICAgICAvLyBnbyB0aHJvdWdoIHRoZSBwYXRoLCByZW1vdmluZyBlbXB0eSBub2RlcyBhbmQgdXBkYXRpbmcgYmJveGVzXG4gICAgICAgIGZvciAodmFyIGkgPSBwYXRoLmxlbmd0aCAtIDEsIHNpYmxpbmdzOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgaWYgKHBhdGhbaV0uY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHNpYmxpbmdzID0gcGF0aFtpIC0gMV0uY2hpbGRyZW47XG4gICAgICAgICAgICAgICAgICAgIHNpYmxpbmdzLnNwbGljZShzaWJsaW5ncy5pbmRleE9mKHBhdGhbaV0pLCAxKTtcblxuICAgICAgICAgICAgICAgIH0gZWxzZSB0aGlzLmNsZWFyKCk7XG5cbiAgICAgICAgICAgIH0gZWxzZSBjYWxjQkJveChwYXRoW2ldLCB0aGlzLnRvQkJveCk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgX2luaXRGb3JtYXQ6IGZ1bmN0aW9uIChmb3JtYXQpIHtcbiAgICAgICAgLy8gZGF0YSBmb3JtYXQgKG1pblgsIG1pblksIG1heFgsIG1heFkgYWNjZXNzb3JzKVxuXG4gICAgICAgIC8vIHVzZXMgZXZhbC10eXBlIGZ1bmN0aW9uIGNvbXBpbGF0aW9uIGluc3RlYWQgb2YganVzdCBhY2NlcHRpbmcgYSB0b0JCb3ggZnVuY3Rpb25cbiAgICAgICAgLy8gYmVjYXVzZSB0aGUgYWxnb3JpdGhtcyBhcmUgdmVyeSBzZW5zaXRpdmUgdG8gc29ydGluZyBmdW5jdGlvbnMgcGVyZm9ybWFuY2UsXG4gICAgICAgIC8vIHNvIHRoZXkgc2hvdWxkIGJlIGRlYWQgc2ltcGxlIGFuZCB3aXRob3V0IGlubmVyIGNhbGxzXG5cbiAgICAgICAgdmFyIGNvbXBhcmVBcnIgPSBbJ3JldHVybiBhJywgJyAtIGInLCAnOyddO1xuXG4gICAgICAgIHRoaXMuY29tcGFyZU1pblggPSBuZXcgRnVuY3Rpb24oJ2EnLCAnYicsIGNvbXBhcmVBcnIuam9pbihmb3JtYXRbMF0pKTtcbiAgICAgICAgdGhpcy5jb21wYXJlTWluWSA9IG5ldyBGdW5jdGlvbignYScsICdiJywgY29tcGFyZUFyci5qb2luKGZvcm1hdFsxXSkpO1xuXG4gICAgICAgIHRoaXMudG9CQm94ID0gbmV3IEZ1bmN0aW9uKCdhJyxcbiAgICAgICAgICAgICdyZXR1cm4ge21pblg6IGEnICsgZm9ybWF0WzBdICtcbiAgICAgICAgICAgICcsIG1pblk6IGEnICsgZm9ybWF0WzFdICtcbiAgICAgICAgICAgICcsIG1heFg6IGEnICsgZm9ybWF0WzJdICtcbiAgICAgICAgICAgICcsIG1heFk6IGEnICsgZm9ybWF0WzNdICsgJ307Jyk7XG4gICAgfVxufTtcblxuZnVuY3Rpb24gZmluZEl0ZW0oaXRlbSwgaXRlbXMsIGVxdWFsc0ZuKSB7XG4gICAgaWYgKCFlcXVhbHNGbikgcmV0dXJuIGl0ZW1zLmluZGV4T2YoaXRlbSk7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChlcXVhbHNGbihpdGVtLCBpdGVtc1tpXSkpIHJldHVybiBpO1xuICAgIH1cbiAgICByZXR1cm4gLTE7XG59XG5cbi8vIGNhbGN1bGF0ZSBub2RlJ3MgYmJveCBmcm9tIGJib3hlcyBvZiBpdHMgY2hpbGRyZW5cbmZ1bmN0aW9uIGNhbGNCQm94KG5vZGUsIHRvQkJveCkge1xuICAgIGRpc3RCQm94KG5vZGUsIDAsIG5vZGUuY2hpbGRyZW4ubGVuZ3RoLCB0b0JCb3gsIG5vZGUpO1xufVxuXG4vLyBtaW4gYm91bmRpbmcgcmVjdGFuZ2xlIG9mIG5vZGUgY2hpbGRyZW4gZnJvbSBrIHRvIHAtMVxuZnVuY3Rpb24gZGlzdEJCb3gobm9kZSwgaywgcCwgdG9CQm94LCBkZXN0Tm9kZSkge1xuICAgIGlmICghZGVzdE5vZGUpIGRlc3ROb2RlID0gY3JlYXRlTm9kZShudWxsKTtcbiAgICBkZXN0Tm9kZS5taW5YID0gSW5maW5pdHk7XG4gICAgZGVzdE5vZGUubWluWSA9IEluZmluaXR5O1xuICAgIGRlc3ROb2RlLm1heFggPSAtSW5maW5pdHk7XG4gICAgZGVzdE5vZGUubWF4WSA9IC1JbmZpbml0eTtcblxuICAgIGZvciAodmFyIGkgPSBrLCBjaGlsZDsgaSA8IHA7IGkrKykge1xuICAgICAgICBjaGlsZCA9IG5vZGUuY2hpbGRyZW5baV07XG4gICAgICAgIGV4dGVuZChkZXN0Tm9kZSwgbm9kZS5sZWFmID8gdG9CQm94KGNoaWxkKSA6IGNoaWxkKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVzdE5vZGU7XG59XG5cbmZ1bmN0aW9uIGV4dGVuZChhLCBiKSB7XG4gICAgYS5taW5YID0gTWF0aC5taW4oYS5taW5YLCBiLm1pblgpO1xuICAgIGEubWluWSA9IE1hdGgubWluKGEubWluWSwgYi5taW5ZKTtcbiAgICBhLm1heFggPSBNYXRoLm1heChhLm1heFgsIGIubWF4WCk7XG4gICAgYS5tYXhZID0gTWF0aC5tYXgoYS5tYXhZLCBiLm1heFkpO1xuICAgIHJldHVybiBhO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlTm9kZU1pblgoYSwgYikgeyByZXR1cm4gYS5taW5YIC0gYi5taW5YOyB9XG5mdW5jdGlvbiBjb21wYXJlTm9kZU1pblkoYSwgYikgeyByZXR1cm4gYS5taW5ZIC0gYi5taW5ZOyB9XG5cbmZ1bmN0aW9uIGJib3hBcmVhKGEpICAgeyByZXR1cm4gKGEubWF4WCAtIGEubWluWCkgKiAoYS5tYXhZIC0gYS5taW5ZKTsgfVxuZnVuY3Rpb24gYmJveE1hcmdpbihhKSB7IHJldHVybiAoYS5tYXhYIC0gYS5taW5YKSArIChhLm1heFkgLSBhLm1pblkpOyB9XG5cbmZ1bmN0aW9uIGVubGFyZ2VkQXJlYShhLCBiKSB7XG4gICAgcmV0dXJuIChNYXRoLm1heChiLm1heFgsIGEubWF4WCkgLSBNYXRoLm1pbihiLm1pblgsIGEubWluWCkpICpcbiAgICAgICAgICAgKE1hdGgubWF4KGIubWF4WSwgYS5tYXhZKSAtIE1hdGgubWluKGIubWluWSwgYS5taW5ZKSk7XG59XG5cbmZ1bmN0aW9uIGludGVyc2VjdGlvbkFyZWEoYSwgYikge1xuICAgIHZhciBtaW5YID0gTWF0aC5tYXgoYS5taW5YLCBiLm1pblgpLFxuICAgICAgICBtaW5ZID0gTWF0aC5tYXgoYS5taW5ZLCBiLm1pblkpLFxuICAgICAgICBtYXhYID0gTWF0aC5taW4oYS5tYXhYLCBiLm1heFgpLFxuICAgICAgICBtYXhZID0gTWF0aC5taW4oYS5tYXhZLCBiLm1heFkpO1xuXG4gICAgcmV0dXJuIE1hdGgubWF4KDAsIG1heFggLSBtaW5YKSAqXG4gICAgICAgICAgIE1hdGgubWF4KDAsIG1heFkgLSBtaW5ZKTtcbn1cblxuZnVuY3Rpb24gY29udGFpbnMoYSwgYikge1xuICAgIHJldHVybiBhLm1pblggPD0gYi5taW5YICYmXG4gICAgICAgICAgIGEubWluWSA8PSBiLm1pblkgJiZcbiAgICAgICAgICAgYi5tYXhYIDw9IGEubWF4WCAmJlxuICAgICAgICAgICBiLm1heFkgPD0gYS5tYXhZO1xufVxuXG5mdW5jdGlvbiBpbnRlcnNlY3RzKGEsIGIpIHtcbiAgICByZXR1cm4gYi5taW5YIDw9IGEubWF4WCAmJlxuICAgICAgICAgICBiLm1pblkgPD0gYS5tYXhZICYmXG4gICAgICAgICAgIGIubWF4WCA+PSBhLm1pblggJiZcbiAgICAgICAgICAgYi5tYXhZID49IGEubWluWTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTm9kZShjaGlsZHJlbikge1xuICAgIHJldHVybiB7XG4gICAgICAgIGNoaWxkcmVuOiBjaGlsZHJlbixcbiAgICAgICAgaGVpZ2h0OiAxLFxuICAgICAgICBsZWFmOiB0cnVlLFxuICAgICAgICBtaW5YOiBJbmZpbml0eSxcbiAgICAgICAgbWluWTogSW5maW5pdHksXG4gICAgICAgIG1heFg6IC1JbmZpbml0eSxcbiAgICAgICAgbWF4WTogLUluZmluaXR5XG4gICAgfTtcbn1cblxuLy8gc29ydCBhbiBhcnJheSBzbyB0aGF0IGl0ZW1zIGNvbWUgaW4gZ3JvdXBzIG9mIG4gdW5zb3J0ZWQgaXRlbXMsIHdpdGggZ3JvdXBzIHNvcnRlZCBiZXR3ZWVuIGVhY2ggb3RoZXI7XG4vLyBjb21iaW5lcyBzZWxlY3Rpb24gYWxnb3JpdGhtIHdpdGggYmluYXJ5IGRpdmlkZSAmIGNvbnF1ZXIgYXBwcm9hY2hcblxuZnVuY3Rpb24gbXVsdGlTZWxlY3QoYXJyLCBsZWZ0LCByaWdodCwgbiwgY29tcGFyZSkge1xuICAgIHZhciBzdGFjayA9IFtsZWZ0LCByaWdodF0sXG4gICAgICAgIG1pZDtcblxuICAgIHdoaWxlIChzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgcmlnaHQgPSBzdGFjay5wb3AoKTtcbiAgICAgICAgbGVmdCA9IHN0YWNrLnBvcCgpO1xuXG4gICAgICAgIGlmIChyaWdodCAtIGxlZnQgPD0gbikgY29udGludWU7XG5cbiAgICAgICAgbWlkID0gbGVmdCArIE1hdGguY2VpbCgocmlnaHQgLSBsZWZ0KSAvIG4gLyAyKSAqIG47XG4gICAgICAgIHF1aWNrc2VsZWN0KGFyciwgbWlkLCBsZWZ0LCByaWdodCwgY29tcGFyZSk7XG5cbiAgICAgICAgc3RhY2sucHVzaChsZWZ0LCBtaWQsIG1pZCwgcmlnaHQpO1xuICAgIH1cbn1cbiIsImltcG9ydCByYnVzaCBmcm9tICdyYnVzaCc7XG5pbXBvcnQgYmJveCBmcm9tICdAdHVyZi9iYm94JztcblxuLyoqXG4gKiBBIHRpbGUgb2JqZWN0XG4gKlxuICogQGNsYXNzIFRpbGVcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFRpbGUge1xuICBjb25zdHJ1Y3Rvcih4LCB5LCB6KSB7XG4gICAgdGhpcy54ID0geDtcbiAgICB0aGlzLnkgPSB5O1xuICAgIHRoaXMueiA9IHo7XG4gICAgdGhpcy5mZWF0dXJlcyA9IHt9O1xuXG4gICAgdGhpcy5sb2FkZWQgPSBmYWxzZTtcblxuICAgIHRoaXMuaW5kZXggPSByYnVzaCgpO1xuICAgIHRoaXMuZmVhdHVyZUdyb3VwID0gTC5mZWF0dXJlR3JvdXAoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDYWxsIHRoaXMgbWV0aG9kIHdoZW4gYWxsIGZlYXR1cmVzIGhhdmUgYmVlbiBhZGRlZCB0byB0aGUgdGlsZVxuICAgKlxuICAgKiBAcmV0dXJucyB7VGlsZX0gdGhpc1xuICAgKi9cbiAgaW5pdCgpIHtcbiAgICB0aGlzLmluZGV4RmVhdHVyZXMoKTtcbiAgICB0aGlzLnJlbmRlcigpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqXG4gICAqL1xuICByZW5kZXIoKSB7XG4gICAgZm9yIChjb25zdCBpZCBpbiB0aGlzLmZlYXR1cmVzKSB7XG4gICAgICBpZiAoIXRoaXMuZmVhdHVyZXMuaGFzT3duUHJvcGVydHkoaWQpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZmVhdHVyZSA9IHRoaXMuZmVhdHVyZXNbaWRdO1xuICAgICAgaWYgKGZlYXR1cmUub25NYXApIHtcbiAgICAgICAgdGhpcy5mZWF0dXJlR3JvdXAuYWRkTGF5ZXIoZmVhdHVyZS5sYXllcik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqXG4gICAqL1xuICBpbmRleEZlYXR1cmVzKCkge1xuICAgIGNvbnN0IGJib3hlcyA9IFtdO1xuICAgIGZvciAoY29uc3QgaWQgaW4gdGhpcy5mZWF0dXJlcykge1xuICAgICAgaWYgKCF0aGlzLmZlYXR1cmVzLmhhc093blByb3BlcnR5KGlkKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZlYXR1cmUgPSB0aGlzLmZlYXR1cmVzW2lkXTtcbiAgICAgIGNvbnN0IGdlb20gPSBmZWF0dXJlLmdlb2pzb24uZ2VvbWV0cnk7XG4gICAgICBjb25zdCBjID0gZ2VvbS5jb29yZGluYXRlcztcblxuICAgICAgbGV0IG1pblg7XG4gICAgICBsZXQgbWluWTtcbiAgICAgIGxldCBtYXhYO1xuICAgICAgbGV0IG1heFk7XG5cbiAgICAgIGlmIChnZW9tLnR5cGUgPT09ICdQb2ludCcpIHtcbiAgICAgICAgbWluWCA9IGNbMF07XG4gICAgICAgIG1heFggPSBjWzBdO1xuICAgICAgICBtaW5ZID0gY1sxXTtcbiAgICAgICAgbWF4WSA9IGNbMV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBbbWluWCwgbWluWSwgbWF4WCwgbWF4WV0gPSBiYm94KGdlb20pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBpdGVtID0ge1xuICAgICAgICBtaW5YLFxuICAgICAgICBtaW5ZLFxuICAgICAgICBtYXhYLFxuICAgICAgICBtYXhZLFxuICAgICAgICBpZDogZmVhdHVyZS5pZFxuICAgICAgfTtcblxuICAgICAgZmVhdHVyZS5pbmRleEVudHJ5ID0gaXRlbTtcblxuICAgICAgYmJveGVzLnB1c2goaXRlbSk7XG4gICAgfVxuXG4gICAgdGhpcy5pbmRleC5sb2FkKGJib3hlcyk7XG4gIH1cblxuICAvKipcbiAgICogQHBhcmFtIHtzdHJpbmd9IGlkXG4gICAqIEByZXR1cm5zIHtib29sZWFufSB0cnVlIGlzIHRoaXMgdGlsZSBjb250YWlucyBhIGZlYXR1cmUgd2l0aCB0aGUgZ2l2ZW4gaWRcbiAgICovXG4gIGNvbnRhaW5zKGlkKSB7XG4gICAgcmV0dXJuIGlkIGluIHRoaXMuZmVhdHVyZXM7XG4gIH1cblxuICAvKipcbiAgICogQHBhcmFtIHtGZWF0dXJlfSBmZWF0dXJlXG4gICAqIEByZXR1cm5zIHtUaWxlfSB0aGlzXG4gICAqL1xuICBhZGRGZWF0dXJlKGZlYXR1cmUpIHtcbiAgICB0aGlzLmZlYXR1cmVzW2ZlYXR1cmUuaWRdID0gZmVhdHVyZTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gaWRcbiAgICogQHJldHVybnMge1RpbGV9IHRoaXNcbiAgICovXG4gIHJlbW92ZUZlYXR1cmUoaWQpIHtcbiAgICBpZiAoIXRoaXMuY29udGFpbnMoaWQpKSB7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgY29uc3QgZmVhdHVyZSA9IHRoaXMuZ2V0RmVhdHVyZShpZCk7XG4gICAgdGhpcy5mZWF0dXJlR3JvdXAucmVtb3ZlTGF5ZXIoZmVhdHVyZS5sYXllcik7XG4gICAgdGhpcy5pbmRleC5yZW1vdmUoZmVhdHVyZS5pbmRleEVudHJ5KTtcbiAgICBkZWxldGUgdGhpcy5mZWF0dXJlc1tpZF07XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogQHBhcmFtIHtzdHJpbmd9IGlkXG4gICAqIEByZXR1cm5zIHtGZWF0dXJlfVxuICAgKi9cbiAgZ2V0RmVhdHVyZShpZCkge1xuICAgIHJldHVybiB0aGlzLmZlYXR1cmVzW2lkXTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAcGFyYW0ge251bWJlcn0gbWluWFxuICAgKiBAcGFyYW0ge251bWJlcn0gbWluWVxuICAgKiBAcGFyYW0ge251bWJlcn0gbWF4WFxuICAgKiBAcGFyYW0ge251bWJlcn0gbWF4WVxuICAgKiBAcmV0dXJucyB7QXJyYXk8U3RyaW5nPn0gYW4gYXJyYXkgb2YgZmVhdHVyZSBpZHMgb2YgZmVhdHVyZXMgdGhhdCBpbnRlcnNlY3RcbiAgICogdGhlIGJvdW5kaW5nIGJveFxuICAgKi9cbiAgc2VhcmNoKG1pblgsIG1pblksIG1heFgsIG1heFkpIHtcbiAgICByZXR1cm4gdGhpcy5pbmRleC5zZWFyY2goeyBtaW5YLCBtaW5ZLCBtYXhYLCBtYXhZIH0pLm1hcChyID0+IHIuaWQpO1xuICB9XG5cbiAgLyoqXG4gICAqXG4gICAqIEByZXR1cm5zIHtUaWxlfSB0aGlzXG4gICAqL1xuICBtYXJrQXNMb2FkZWQoKSB7XG4gICAgdGhpcy5sb2FkZWQgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBwcm9wZXJ0eVxuICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWVcbiAgICogQHBhcmFtIHtib29sZWFufSBvblxuICAgKiBAcGFyYW0ge2Jvb2xlYWR9IHRvZ2dsZWRcbiAgICogQHJldHVybnMge1RpbGV9IHRoaXNcbiAgICovXG4gIHRvZ2dsZUJ5UHJvcGVydHkocHJvcGVydHksIHZhbHVlLCBvbiwgdG9nZ2xlZCkge1xuICAgIGxldCBmZWF0dXJlO1xuICAgIGxldCBnZW9qO1xuICAgIGZvciAoY29uc3QgaWQgaW4gdGhpcy5mZWF0dXJlcykge1xuICAgICAgaWYgKCF0aGlzLmZlYXR1cmVzLmhhc093blByb3BlcnR5KGlkKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGZlYXR1cmUgPSB0aGlzLmdldEZlYXR1cmUoaWQpO1xuICAgICAgZ2VvaiA9IGZlYXR1cmUuZ2VvanNvbjtcbiAgICAgIGlmIChwcm9wZXJ0eSBpbiBnZW9qLnByb3BlcnRpZXMgJiYgZ2Vvai5wcm9wZXJ0aWVzW3Byb3BlcnR5XSA9PT0gdmFsdWUpIHtcbiAgICAgICAgaWYgKHRvZ2dsZWQpIHtcbiAgICAgICAgICBpZiAob24pIHtcbiAgICAgICAgICAgIHRoaXMuaW5kZXguaW5zZXJ0KGZlYXR1cmUuaW5kZXhFbnRyeSk7XG4gICAgICAgICAgICB0aGlzLmZlYXR1cmVHcm91cC5hZGRMYXllcihmZWF0dXJlLmxheWVyKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5pbmRleC5yZW1vdmUoZmVhdHVyZS5pbmRleEVudHJ5KTtcbiAgICAgICAgICAgIHRoaXMuZmVhdHVyZUdyb3VwLnJlbW92ZUxheWVyKGZlYXR1cmUubGF5ZXIpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gcHJvcGVydHlcbiAgICogQHBhcmFtIHtzdHJpbmd9IHZhbHVlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBzdHlsZVxuICAgKiBAcmV0dXJucyB7VGlsZX0gdGhpc1xuICAgKi9cbiAgcmVzdHlsZUJ5UHJvcGVydHkocHJvcGVydHksIHZhbHVlLCBzdHlsZSkge1xuICAgIGxldCBmZWF0dXJlO1xuICAgIGZvciAoY29uc3QgaWQgaW4gdGhpcy5mZWF0dXJlcykge1xuICAgICAgaWYgKCF0aGlzLmZlYXR1cmVzLmhhc093blByb3BlcnR5KGlkKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGZlYXR1cmUgPSB0aGlzLmdldEZlYXR1cmUoaWQpO1xuICAgICAgaWYgKHByb3BlcnR5IGluIGZlYXR1cmUuZ2VvanNvbi5wcm9wZXJ0aWVzXG4gICAgICAgICAgJiYgZmVhdHVyZS5nZW9qc29uLnByb3BlcnRpZXNbcHJvcGVydHldID09PSB2YWx1ZSkge1xuICAgICAgICBmZWF0dXJlLmxheWVyLnNldFN0eWxlKHN0eWxlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbn1cblxuIl19
