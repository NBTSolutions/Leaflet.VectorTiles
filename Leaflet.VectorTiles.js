import Tile from './tile';
import TileCache from './tile_cache';
import Feature from './feature';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';


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
  const nTiles = Math.pow(4, coords.z);
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
   */
  initialize(url, options) {
    L.Util.setOptions(options);
    L.GridLayer.prototype.initialize.call(this, options);

    this._url = url;

    // the FeatureGroup that holds per tile FeatureGroups
    this._featureGroup = L.featureGroup();

    // show tile boundaries and log tile loading and unloading
    this._debug = options.debug;

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

    // mark a tile for destruction in case it is unloaded before it loads
    this._toDestroy = {};

    // tile cache
    this._tileCache = new TileCache(50, this._debug);

    // mark a tile as loaded
    // this is needed because if a tile is unloaded before its finished loading
    // we need to wait for it to finish loading before we can clean up
    this.on('vt_tileload', (e) => {
      const tileKey = this._tileCoordsToKey(e.coords);
      if (this._toDestroy[tileKey]) {
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
          console.log('marking tile', e.coords, 'for deletion after loading');
        }
        this._toDestroy[tileKey] = true;
      } else {
        // destroy it immediately
        this.destroyTile(e.coords);
      }
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

    for (const tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      for (const result of this._vectorTiles[tileKey].search(minX, minY, maxX, maxY)) {
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
   * @param {Function} done
   * @fires vt_tileload
   * @returns DOM element
   * @private
   */
  createTile(coords, done) {
    if (this._debug) {
      console.log("creating tile:", coords);
    }
    const tile = L.DomUtil.create('div', 'leaflet-tile');
    if (this.options.debug) {
      // show tile boundaries
      tile.style.outline = '1px solid red';
    }
    this._createTile(coords);
    done(null, tile);
    return tile;
  },

  _createTile(coords) {
    const tileKey = this._tileCoordsToKey(coords);

    // tile has already been unloaded
    if (this._toDestroy[tileKey]) {
      return;
    }

    let tile = this._tileCache.get(tileKey);

    if (!tile) {
      tile = new Tile(coords.x, coords.y, coords.z);
    }

    this._vectorTiles[tileKey] = tile;

    // fetch vector tile data for this tile
    const url = L.Util.template(this._url, coords);
    const headers = new Headers();
    if (tile.timeCreated) {
      headers.append('If-Modified-Since', tile.timeCreated);
    }
    fetch(url, { headers })
      .then(res => {
        // use cached tile
        if (res.status == '304') {
          // add tile to FeatureGroup to add to map
          tile.addTo(this._featureGroup);
          return;
        }

        // record time that tile was retrieved
        tile.timeCreated = new Date().getTime();

        // parse new vector tile
        res.blob()
          .then(blob => {
            const reader = new FileReader();
            return new Promise((resolve, reject) => {
              reader.onloadend = () => {
                resolve(new VectorTile(new Pbf(reader.result)));
              }
              reader.readAsArrayBuffer(blob);
            });
          })
          .then(function parseVectorTile(vtTile) {
            for (const vtLayerName in vtTile.layers) {
              // break out if this tile has already be unloaded
              if (this._toDestroy[tileKey]) {
                if (this._debug) {
                  console.log('Tile', coords, 'stopped while loading');
                }
                break;
              }

              const vtLayer = vtTile.layers[vtLayerName];

              for (let j = 0; j < vtLayer.length; j++) {
                // break out if this tile has already be unloaded
                if (this._toDestroy[tileKey]) {
                  if (this._debug) {
                    console.log('Tile', coords, 'stopped while loading');
                  }
                  break;
                }

                const vtFeature = vtLayer.feature(j);

                const geojson = vtFeature.toGeoJSON(coords.x, coords.y, coords.z);
                const id = this.options.getFeatureId(geojson);
                const layer = this._geojsonToLayer(geojson);
                if (!layer) {
                  // unsupported geometry type
                  continue;
                }

                // create the Feature
                const feature = new Feature(id, geojson, layer);

                // add it to the tile
                tile.addFeature(feature);

                // calculate its style and if its visible
                const style = {};
                let onMap = true;
                let prop;

                // property based styles
                for (prop in geojson.properties) {
                  // apply style from options
                  if (prop in this.options.style
                      && geojson.properties[prop] in this.options.style[prop]) {
                    Object.assign(style, this.options.style[prop][geojson.properties[prop]]);
                  }

                  // apply style modifications
                  if (prop in this._propertyStyles
                      && geojson.properties[prop] in this._propertyStyles[prop]) {
                    Object.assign(style, this._propertyStyles[prop][geojson.properties[prop]]);
                  }

                  // put on map based on property
                  if (prop in this._propertyOnMap
                      && geojson.properties[prop] in this._propertyOnMap[prop]) {
                    onMap = this._propertyOnMap[prop][geojson.properties[prop]];
                  }
                }

                // feature based styles
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

            if (!this._toDestroy[tileKey]) {
              // called when all features have been added to the tile
              tile.init();

              // add the featureGroup of this tile to the map
              tile.addTo(this._featureGroup);
            }

            // mark tile as loaded
            tile.markAsLoaded();

            // cache the tile
            this._tileCache.put(tileKey, tile);

            if (this._debug) {
              console.log('tile loaded:', coords, tile.featureGroup.getLayers().length, ' features');
            }

            // the tile has ~actually~ loaded
            // the `tileload` event doesn't fire when `tileunload` fires first
            // but in our case we still need to be finished loading to clean up
            this.fire('vt_tileload', { coords });
          }.bind(this))
          .catch(err => {
            console.log(err);
          });
      })
      .catch(err => {
        console.log(err);
      });
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
      console.log("destroying tile:", coords);
    }
    const tileKey = this._tileCoordsToKey(coords);
    const tile = this._vectorTiles[tileKey];

    // remove this tile's FeatureGroup from the map
    tile.removeFrom(this._featureGroup);

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
   * @private
   */
  _toggleByProperty(property, value, on) {
    if (!(property in this._propertyOnMap)) {
      this._propertyOnMap[property] = {};
    }

    // did the state change?
    const toggled = this._propertyOnMap[property][value] !== on;

    this._propertyOnMap[property][value] = on;

    let tile;
    for (const tileKey in this._vectorTiles) {
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
  restyleByProperty(property, value, style) {
    if (!(property in this._propertyStyles)) {
      this._propertyStyles[property] = {};
    }

    if (!(value in this._propertyStyles[property])) {
      this._propertyStyles[property][value] = {};
    }

    Object.assign(this._propertyStyles[property][value], style);

    let tile;
    for (const tileKey in this._vectorTiles) {
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
  setFeatureStyle(id, style) {
    this._featureStyles[id] = style;
    for (const tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      const tile = this._vectorTiles[tileKey];
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
    let tile;
    for (const tileKey in this._vectorTiles) {
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
  getGeoJSON(id) {
    let tile;
    for (const tileKey in this._vectorTiles) {
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
  removeFeature(id) {
    let tile;
    for (const tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      tile = this._vectorTiles[tileKey];
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
    this._tileCache.setSize(size);
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
   * @returns {L.Path}
   * @private
   */
  _geojsonToLayer(feature) {
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
        for (let i = 0; i < c.length; i++) {
          coords.push([c[i][1], c[i][0]]);
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
        console.log(`Unsupported feature type: ${feature.geometry.type}`);
        return null;
    }

    return layer;
  },

});

