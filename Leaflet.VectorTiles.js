/**
 * A canvas renderer that can draw fonts.
 * Useful for icon fonts.
 *
 * @class FontCanvas
 * @extends Canvas
 *
 * @example
 * var map = L.map('map', {
 *   renderer: new L.FontCanvas()
 * });
 */

L.FontCanvas = L.Canvas.extend({
  _updateCircle(layer) {
    if (!this._drawing || layer._empty()) { return; }

    const p = layer._point;
    const ctx = this._ctx;
    const r = layer._radius;
    const s = (layer._radiusY || r) / r;

    this._drawnLayers[layer._leaflet_id] = layer;

    if (layer.options.content && layer.options.font) {
      ctx.font = layer.options.font;
      ctx.fillStyle = layer.options.color;
      ctx.fillText(layer.options.content, p.x, p.y);
    } else {
      if (s !== 1) {
        ctx.save();
        ctx.scale(1, s);
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y / s, r, 0, Math.PI * 2, false);

      if (s !== 1) {
        ctx.restore();
      }

      this._fillStroke(ctx, layer);
    }
  }
});


/**
 * A feature object
 *
 * @class Feature
 * @private
 */
class Feature {
  constructor(id, geojson, layer) {
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
  setStyle(style) {
    Object.assign(this.style, style);
    this.layer.setStyle(this.style);
    return this;
  }

  /**
   * @param {boolean} on
   * @returns {Feature} this
   */
  putOnMap(on) {
    this.onMap = on;
    return this;
  }
}


/**
 * A tile object
 *
 * @class Tile
 * @private
 */
class Tile {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    //this.features = features;
    this.features = {};

    // is the tile on the map?
    this.valid = true;
    this.loaded = false;

    this.index = rbush();
    this.featureGroup = L.featureGroup();
  }

  /**
   * Call this method when all features have been added to the tile
   *
   * @returns {Tile} this
   */
  init() {
    this.indexFeatures();
    this.render();
    return this;
  }

  /**
   * TODO: consider doing this in the feature loop in VectorTiles#_createTile
   */
  render() {
    for (const id in this.features) {
      if (!this.features.hasOwnProperty(id)) {
        continue;
      }
      const feature = this.features[id];
      if (feature.onMap) {
        this.featureGroup.addLayer(feature.layer);
      }
    }
  }

  /**
   *
   */
  indexFeatures() {
    const bboxes = [];
    for (const id in this.features) {
      if (!this.features.hasOwnProperty(id)) {
        continue;
      }
      const feature = this.features[id];
      const geom = feature.geojson.geometry;
      const c = geom.coordinates;

      let minX;
      let minY;
      let maxX;
      let maxY;

      if (geom.type === 'Point') {
        minX = c[0];
        maxX = c[0];
        minY = c[1];
        maxY = c[1];
      } else {
        [minX, minY, maxX, maxY] = turf.bbox(geom);
      }

      const item = {
        minX,
        minY,
        maxX,
        maxY,
        id: feature.id
      };

      feature.indexEntry = item;

      bboxes.push(item);
    }

    // bulk load all the features for this tile
    this.index.load(bboxes);
  }

  /**
   * @param {string} id
   * @returns {boolean} true is this tile contains a feature with the given id
   */
  contains(id) {
    return id in this.features;
  }

  /**
   * @param {Feature} feature
   * @returns {Tile} this
   */
  addFeature(feature) {
    this.features[feature.id] = feature;
    return this;
  }

  /**
   * @param {string} id
   * @returns {Feature}
   */
  getFeature(id) {
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
  search(minX, minY, maxX, maxY) {
    return this.index.search({ minX, minY, maxX, maxY }).map(r => r.id);
  }

  /**
   *
   * @returns {Tile} this
   */
  markAsLoaded() {
    this.loaded = true;
    return this;
  }

  /**
   * @return {L.FeatureGroup}
   */
  getFeatureGroup() {
    return this.featureGroup;
  }

  /**
   * Must call to delete this tile
   */
  delete() {}
}

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

    // pointers to individual layers
    // this._vectorTiles = {
    //   <tileKey>: {
    //     loaded: <Boolean>,
    //     features: {
    //       <featureId>: {
    //         geojson: <GeoJSON feature>,
    //         layer: <Leaflet layer>,
    //         indexEntry: <RBush index item>,
    //       }
    //     },
    //     featureGroup: <L.FeatureGroup>,
    //     index: <RBush>
    //     loaded: <boolean>,
    //     valid: <boolean>
    //   }
    // }
    this._vectorTiles = window.vectorTiles = {};

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
      const tileKey = this._tileCoordsToKey(e.coords);

      // if the tile hasn't loaded yet wait until it loads to destroy it
      if (!(tileKey in this._vectorTiles) || !this._vectorTiles[tileKey].loaded) {
        // invalidate the tile so that it is deleted when its done loading
        this._vectorTiles[tileKey].valid = false;
      } else {
        this.destroyTile(e.coords);
      }
    });

    // are you currently zooming
    this._zooming = false;

    this._map.on('zoomstart', () => {
      this._zooming = true;
    });

    this._map.on('zoomend', () => {
      this._zooming = false;
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

    // the following flag is set when tile rendering bails early
    // because we've zoomed past this tile for example
    let cancelled = false;

    const tile = new Tile(coords.x, coords.y, coords.z);
    this._vectorTiles[tileKey] = tile;

    // fetch vector tile data for this tile
    const url = L.Util.template(this._url, coords);
    fetch(url)
      .then(res => res.json())
      .then((layers) => {
        for (let i = 0; i < layers.length; i++) {
          // break out if we're already past this zoom level
          // before we're done loading the tile
          // TODO: better cancellation condition
          if (coords.z !== this._map.getZoom()) {
            cancelled = true;
            break;
          }
          for (let j = 0; j < layers[i].features.features.length; j++) {
            // break out if we're already past this zoom level
            // before we're done loading the tile
            if (coords.z !== this._map.getZoom()) {
              cancelled = true;
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

            //layer.setStyle(style);
            feature.setStyle(style);

            // feature based on map
            if (id in this._featureOnMap) {
              onMap = this._featureOnMap[id];
            }

            feature.putOnMap(onMap);
          }
        }

        if (!cancelled) {
          // called when all features have been added to the tile
          tile.init();

          // add the featureGroup of this tile to the map
          tile.getFeatureGroup().addTo(this._featureGroup);
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
    this._featureGroup.removeLayer(this._vectorTiles[tileKey].getFeatureGroup());

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

    // iterate over all features and toggle as needed
    for (const tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      const features = this._vectorTiles[tileKey].features;
      const featureGroup = this._vectorTiles[tileKey].featureGroup;
      for (const id in features) {
        if (!features.hasOwnProperty(id)) {
          continue;
        }
        const feature = features[id];
        if (property in feature.geojson.properties
            && feature.geojson.properties[property] === value) {
          if (toggled) {
            if (on) {
              // add to spatial index
              this._vectorTiles[tileKey].index.insert(feature.indexEntry);
              // add to map
              featureGroup.addLayer(feature.layer);
            } else {
              // remove from spatial index
              this._vectorTiles[tileKey].index.remove(feature.indexEntry);
              // remove from map
              featureGroup.removeLayer(feature.layer);
            }
          }
        }
      }
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

    for (const tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      const features = this._vectorTiles[tileKey].features;
      for (const id in features) {
        if (!features.hasOwnProperty(id)) {
          continue;
        }
        const feature = features[id];
        if (property in feature.geojson.properties
            && feature.geojson.properties[property] === value) {
          feature.layer.setStyle(style);
        }
      }
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
   * TODO.
   * Revert a feature to its origin style.
   *
   * @param {string} id
   */
  resetFeatureStyle(id) {
    delete this._featureStyles[id];
    for (const tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      const features = this._vectorTiles[tileKey].features;
      if (id in features) {
        // const layer = features[id].layer;
        // layer.resetStyle();
      }
    }
  },

  /**
   * Returns the feature group that holds all features in the GridLayer
   * intended for use with Leaflet.Draw
   *
   * @returns {L.FeatureGroup}
   */
  getFeatureGroup() {
    return this._featureGroup;
  },

  /**
   * Returns a reference to the layer identified by the id
   *
   * @param {string} id
   * @returns {L.Path}
   */
  getLayer(id) {
    for (const tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      const features = this._vectorTiles[tileKey].features;
      for (const featureId in features) {
        if (featureId === id) {
          return features[id].layer;
        }
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
    for (const tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      const features = this._vectorTiles[tileKey].features;
      for (const featureId in features) {
        if (featureId === id) {
          return features[id].geojson;
        }
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
    for (const tileKey in this._vectorTiles) {
      if (!this._vectorTiles.hasOwnProperty(tileKey)) {
        continue;
      }
      const tile = this._vectorTiles[tileKey];
      const features = tile.features;
      for (const featureId in features) {
        if (featureId === id) {
          const feature = features[id];
          // remove layer from feature group
          tile.featureGroup.removeLayer(feature.layer);
          // remove from tile index
          tile.index.remove(feature.indexEntry);
          // remove from feature list
          delete features[id];
        }
      }
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
    switch (feature.geometry.type) {
      case 'Point':
        coords = feature.geometry.coordinates;
        layer = L.circle([coords[1], coords[0]], {
          radius: 40
        });
        break;

      case 'LineString':
        coords = feature.geometry.coordinates.map(c => [c[1], c[0]]);
        layer = L.polyline(coords, {});
        break;

      case 'Polygon':
      case 'MultiPolygon':
        coords = feature.geometry.coordinates.map(ring => ring.map(c => [c[1], c[0]]));
        layer = L.polygon(coords, {});
        break;

      default:
        console.log(`Unsupported feature type: ${feature.geometry.type}`);
        return null;
    }

    return layer;
  }

});

