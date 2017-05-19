import Tile from './tile';
import Feature from './feature';

/**
 * Manages interactive tiles of data
 *
 * @class VectorTiles
 * @extends GridLayer
 *
 * @example
 * var vtLayer = new L.VectorTiles('http://mytiles.com/{z}/{x}/{y}.pbf', {
 *   map: map,
 *   debug: true
 * }).addTo(map);
 */

L.VectorTiles = L.GridLayer.extend({

  style: {},

  /**
   * Constructor
   *
   * @constructs
   * @param {string} url The url for fectching vector tiles
   * @param {Object} options
   * @param {L.Map} [options.map]
   * @param {Function} [options.getFeatureId]
   * @param {boolean} [options.debug]
   * @param {Object} [options.style]
   */
  initialize(url, options) {
    L.Util.setOptions(options);
    L.GridLayer.prototype.initialize.call(this, options);

    this._url = url;

    // TODO: figure out how to do without this
    this._map = options.map;

    // the FeatureGroup that holds per tile FeatureGroups
    this._featureGroup = L.featureGroup()
      .addTo(this._map);

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

    // mark a tile as loaded
    // this is needed because if a tile is unloaded before its finished loading
    // we need to wait for it to finish loading before we can clean up
    this.on('vt_tileload', (e) => {
      const tileKey = this._tileCoordsToKey(e.coords);
      if (!this._vectorTiles[tileKey].valid) {
        this.destroyTile(e.coords);
      }
    });

    // listen for tileunload event and clean up old features
    this.on('tileunload', (e) => {
      // Leaflet will not call createTile for tiles with negative
      // coordinates but it will fire unload on them so
      // ignore those events
      if (e.coords.x < 0 || e.coords.y < 0 || e.coords.z < 0) {
        return;
      }

      const tileKey = this._tileCoordsToKey(e.coords);

      // TODO: figure out why we're unloading tiles we never loaded
      if (!(tileKey in this._vectorTiles)) {
        console.log('unloading tile that was never loaded:', tileKey);
        return;
      }

      // if the tile hasn't loaded yet wait until it loads to destroy it
      if (!this._vectorTiles[tileKey].loaded) {
        // invalidate the tile so that it is deleted when its done loading
        this._vectorTiles[tileKey].valid = false;
      } else {
        this.destroyTile(e.coords);
      }
    });
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
  createTile(coords, done) {
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

    const tile = new Tile(coords.x, coords.y, coords.z);
    this._vectorTiles[tileKey] = tile;

    // fetch vector tile data for this tile
    const url = L.Util.template(this._url, coords);
    fetch(url)
      .then(res => res.json())
      .then((layers) => {
        for (let i = 0; i < layers.length; i++) {
          // break out if this tile has already be unloaded
          if (!tile.valid) {
            break;
          }
          for (let j = 0; j < layers[i].features.features.length; j++) {
            // break out if this tile has already be unloaded
            if (!tile.valid) {
              break;
            }

            const geojson = layers[i].features.features[j];
            const id = this.options.getFeatureId(geojson);
            const layer = this._geojsonToLayer(geojson);
            if (!layer) {
              // unsupported geometry type
              continue;
            }

            const feature = new Feature(id, geojson, layer);

            tile.addFeature(feature);

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

        if (tile.valid) {
          // called when all features have been added to the tile
          tile.init();

          // add the featureGroup of this tile to the map
          tile.featureGroup.addTo(this._featureGroup);
        }

        // mark tile as loaded
        tile.markAsLoaded();

        // the tile has ~actually~ loaded
        // the `tileload` event doesn't fire when `tileunload` fires first
        // but in our case we still need to be finished loading to clean up
        this.fire('vt_tileload', { coords });
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
    const tileKey = this._tileCoordsToKey(coords);

    // remove this tile's FeatureGroup from the map
    this._featureGroup.removeLayer(this._vectorTiles[tileKey].featureGroup);

    // delete the tile's data
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
  }

});

