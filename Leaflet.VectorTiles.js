import work from 'webworkify';
import Tile from './tile';
import TileCache from './tile_cache';
import Feature from './feature';
import worker from './worker';


const DEFAULT_TILE_CACHE_SIZE = 25;


/**
 * Checks whether the given tile coordinates is within the normal range
 *
 * @param {Object} coords
 * @param {number} coords.x
 * @param {number} coords.y
 * @param {number} coords.z
 * @returns {boolean} true if the coordinates correspond to a valid tile
 */
function tileIsValid(coords) {
  if (coords.x < 0 || coords.y < 0 || coords.z < 0) {
    return false;
  }
  const nTiles = 4 ** coords.z;
  const maxIndex = Math.sqrt(nTiles) - 1;
  if (coords.x > maxIndex || coords.y > maxIndex) {
    return false;
  }
  return true;
}


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
   * @param {number} [options.tileCacheSize]
   */
  initialize(url, options) {
    L.Util.setOptions(options);
    L.GridLayer.prototype.initialize.call(this, options);

    this._url = url;

    // the FeatureGroup that holds per tile FeatureGroups
    this._featureGroup = L.featureGroup();

    // show tile boundaries and log tile loading and unloading
    this._debug = options.debug || false;

    // set the cache size
    this._tileCacheSize = options.tileCacheSize || DEFAULT_TILE_CACHE_SIZE;

    // store Tile objects representing vector tiles
    // keyed on tileKeys
    this._vectorTiles = {};

    // a lookup table for property value based styling
    // maps property names to values to style objects
    // this._propertyStyles = {
    //   propertyName: {
    //     value1: { L.Path style options }
    //   }
    // }
    this._propertyStyles = {};

    // a lookup table for whether or not features with property values are on the map
    // maps property names to values to booleans
    this._propertyOnMap = {};

    // a lookup table for individual feature styles
    // maps feaure ids to style objects
    this._featureStyles = {};

    // a lookup table for whether or not individual features are on the map
    // maps feature ids to booleans
    this._featureOnMap = {};

    // tile cache
    this._tileCache = new TileCache(this._tileCacheSize, this._debug);

    // mark a tile as loaded
    // this is needed because if a tile is unloaded before its finished loading
    // we need to wait for it to finish loading before we can clean up
    this.on('vt_tileload', (e) => {
      const tileKey = this._tileCoordsToKey(e.coords);
      const tile = this._vectorTiles[tileKey];
      if (tile.destroy) {
        this.destroyTile(e.coords);
      }
    });

    // listen for tileunload event and clean up old features
    this.on('tileunload', (e) => {
      // Leaflet will not call createTile on invalid tile coordinates but it will fire
      // tileunload on it. Ignore these.
      if (!tileIsValid(e.coords)) {
        return;
      }

      const tileKey = this._tileCoordsToKey(e.coords);

      // if the tile hasn't loaded yet, mark it for deletion for when it
      // is finished loading
      if (!(tileKey in this._vectorTiles) || !this._vectorTiles[tileKey].loaded) {
        // invalidate the tile so that it is deleted when its done loading
        if (this._debug) {
          console.log('(Main) marking tile', e.coords, 'for deletion after loading');
        }
        this._vectorTiles[tileKey].destroy = true;
      } else {
        // destroy it immediately
        this.destroyTile(e.coords);
      }
    });

    // web worker
    this.worker = work(worker);
    this.worker.addEventListener('message', (e) => {
      const { coords, features } = e.data;
      this._renderVectorTile(features, coords);
    });
  },

  onAdd(map) {
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
  search(min, max) {
    if (!this._map) {
      throw new Error('Vector tile layer not added to the map.');
    }

    const results = new Set();
    const minX = min.lng;
    const minY = min.lat;
    const maxX = max.lng;
    const maxY = max.lat;

    for (const tile of Object.values(this._vectorTiles)) {
      for (const result of tile.search(minX, minY, maxX, maxY)) {
        results.add(result);
      }
    }

    return Array.from(results);
  },

  /**
   * This method fetches vector tile data from the network and creates a tile
   * in the event that the tile is cached and the HTTP request returns a 304, it
   * uses the tile from the cache
   *
   * @param {Object} coords
   * @param {number} coords.x
   * @param {number} coords.y
   * @param {number} coords.z
   * @param {Function} done
   * @returns DOM element
   *
   * @private
   */
  createTile(coords) {
    if (this._debug) {
      console.log('(Main) creating tile:', coords);
    }

    const tileKey = this._tileCoordsToKey(coords);

    // check cache for tile
    let tile = this._tileCache.get(tileKey);
    let timestamp = null;
    if (!tile) {
      tile = new Tile(coords.x, coords.y, coords.z);
    } else {
      timestamp = tile.timestamp;
    }

    this._vectorTiles[tileKey] = tile;

    const url = L.Util.template(this._url, coords);

    // assign tile to a worker
    this.worker.postMessage({ url, coords, timestamp });

    // create an empty div for passing back to GridLayer
    const div = L.DomUtil.create('div');
    return div;
  },

  /**
   * @param {Array<Object>} features
   * @param {Object} coords
   * @param {number} coords.x
   * @param {number} coords.y
   * @param {number} coords.z
   * @fires vt_tileload
   *
   * @private
   */
  _renderVectorTile(features, coords) {
    const tileKey = this._tileCoordsToKey(coords);
    const tile = this._vectorTiles[tileKey];

    for (const [layerName, layer] of Object.entries(features)) {
      if (tile.destroy) {
        break;
      }
      for (const geojson of layer) {
        if (tile.destroy) {
          break;
        }
        const id = this.options.getFeatureId(geojson);
        const leafletLayer = this._geojsonToLeafletLayer(geojson);
        if (!leafletLayer) {
          // unsupported geometry type
          continue;
        }

        // create the Feature
        const feature = new Feature(id, layerName, geojson, leafletLayer);

        // add it to the tile
        tile.addFeature(feature);

        // calculate its style and if its visible
        const style = {};
        let onMap = true;

        // property based styles
        // TODO: for nested properties this will be comparing objects. Look into this.
        for (const [prop, val] of Object.entries(geojson.properties)) {
          // apply style from options
          if (prop in this.options.style && val in this.options.style[prop]) {
            Object.assign(style, this.options.style[prop][val]);
          }

          // apply style modifications
          if (prop in this._propertyStyles && val in this._propertyStyles[prop]) {
            Object.assign(style, this._propertyStyles[prop][val]);
          }

          // put on map based on property
          if (prop in this._propertyOnMap && val in this._propertyOnMap[prop]) {
            onMap = this._propertyOnMap[prop][val];
          }
        }

        // apply styles custom to this specific feature
        if (id in this._featureStyles) {
          Object.assign(style, this._featureStyles[id]);
        }

        feature.setStyle(style);

        // feature based on map
        if (id in this._featureOnMap) {
          onMap = this._featureOnMap[id];
        }

        feature.putOnMap(onMap);
      }
    }

    if (!tile.destroy) {
      // called when all features have been added to the tile
      tile.init();

      // add the featureGroup of this tile to the map
      tile.addTo(this._featureGroup);

      // cache the tile
      this._tileCache.put(tileKey, tile);
    }

    // mark tile as loaded
    tile.markAsLoaded();


    // the tile has ~actually~ loaded
    // the `tileload` event doesn't fire when `tileunload` fires first
    // but in our case we still need to be finished loading to clean up
    this.fire('vt_tileload', { coords });
  },

  /**
   * Remove the features of a tile from the map and delete that tile's
   * data structure
   *
   * @param {Object} coords
   * @private
   */
  destroyTile(coords) {
    if (this._debug) {
      console.log('(Main) destroying tile:', coords);
    }
    const tileKey = this._tileCoordsToKey(coords);
    const tile = this._vectorTiles[tileKey];

    // remove this tile's FeatureGroup from the map
    tile.removeFrom(this._featureGroup);

    // delete the tile
    delete this._vectorTiles[tileKey];
  },

  /**
   * Removes features from the map by property.
   * Wrapper function of `_toggleByProperty`.
   * Equivalent to `this._toggleByProperty(property, value, false)`.
   *
   * @param {string} property
   * @param {string} value
   */
  hideByProperty(property, value) {
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
  showByProperty(property, value) {
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
   *
   * @private
   */
  _toggleByProperty(property, value, on) {
    if (!(property in this._propertyOnMap)) {
      this._propertyOnMap[property] = {};
    }

    // did the state change?
    const toggled = this._propertyOnMap[property][value] !== on;

    this._propertyOnMap[property][value] = on;

    for (const tile of Object.values(this._vectorTiles)) {
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
  restyleByProperty(property, value, style) {
    if (!(property in this._propertyStyles)) {
      this._propertyStyles[property] = {};
    }

    if (!(value in this._propertyStyles[property])) {
      this._propertyStyles[property][value] = {};
    }

    Object.assign(this._propertyStyles[property][value], style);

    for (const tile of Object.values(this._vectorTiles)) {
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
  setFeatureStyle(id, style) {
    this._featureStyles[id] = style;
    for (const tile of Object.values(this._vectorTiles)) {
      if (tile.contains(id)) {
        const feature = tile.getFeature(id);
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
  getLayer(id) {
    for (const tile of Object.values(this._vectorTiles)) {
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
  getGeoJSON(id) {
    for (const tile of Object.values(this._vectorTiles)) {
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
  removeFeature(id) {
    for (const tile of Object.values(this._vectorTiles)) {
      tile.removeFeature(id);
    }
    return this;
  },

  /**
   * Set the maximum size of the cache
   *
   * @param {number} size
   * returns {L.VectorTiles} this
   */
  setTileCacheSize(size) {
    this._tileCacheSize = size;
    this._tileCache.setSize(this._tileCacheSize);
    return this;
  },

  /**
   * @returns {number} current maximum size of the cache
   */
  getTileCacheSize() {
    return this._tileCacheSize;
  },

  /**
   * Convert a GeoJSON feature into a Leaflet feature
   * Point -> L.Circle
   * LineString -> L.Polyline
   * Polygon/Multipolygon -> L.Polygon
   * Here we must make lon,lat (GeoJSON) into lat,lon (Leaflet)
   *
   * @param {Object} feature
   * @returns {L.Path}
   *
   * @private
   */
  _geojsonToLeafletLayer(feature) {
    let layer;
    let coords;
    let ring;
    const c = feature.geometry.coordinates;
    switch (feature.geometry.type) {
      case 'Point':
        layer = L.circle([c[1], c[0]], {
          radius: 40
        });
        break;

      case 'LineString':
        coords = [];
        for (const p of c) {
          coords.push([p[1], p[0]]);
        }
        layer = L.polyline(coords, {});
        break;

      case 'Polygon':
        coords = [];
        for (let i = 0; i < c.length; i++) {
          coords.push([]);
          ring = c[i];
          for (let j = 0; j < ring.length; j++) {
            coords[i].push([ring[j][1], ring[j][0]]);
          }
        }
        layer = L.polygon(coords, {});
        break;

      case 'MultiPolygon':
        coords = [];
        for (let i = 0; i < c.length; i++) {
          coords.push([]);
          const polygon = c[i];
          for (let j = 0; j < polygon.length; j++) {
            coords[i].push([]);
            ring = polygon[j];
            for (let k = 0; k < ring.length; k++) {
              coords[i][j].push([ring[k][1], ring[k][0]]);
            }
          }
        }
        layer = L.polygon(coords, {});
        break;

      default:
        console.log(`(Main) Unsupported feature type: ${feature.geometry.type}`);
        return null;
    }

    return layer;
  },

});

