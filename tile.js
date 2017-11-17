import rbush from 'rbush';
import bbox from '@turf/bbox';

/**
 * A tile object
 *
 * @class Tile
 * @private
 */
export default class Tile {

  /**
   * Constructor
   *
   * param {number} x - x coordinate of tile
   * param {number} y - y coordinate of tile
   * param {number} z - z coordinate of tile
   *
   * @private
   */
  constructor(x, y, z, debug = false) {
    this.x = x;
    this.y = y;
    this.z = z;
    this._debug = debug;
    this.coords = { x, y, z };
    this._features = {};

    this.loaded = false;
    this.destroy = false; // used in tile mark/sweep

    this._index = rbush();
    this.featureGroup = L.featureGroup();
  }

  /**
   * We call this method when all features have been added to the tile
   *
   * @returns {Tile} this
   */
  init() {
    this.indexFeatures();
    return this;
  }

  /**
   *
   */
  updateTimestamp() {
    this.timestamp = new Date().getTime();
  }

  /**
   * This method adds all features in this tile to an rbush index
   */
  indexFeatures() {
    if (this._debug) {
      console.log('(Tile)', this.coords, 'indexing features');
    }
    const bboxes = [];
    for (const layer of Object.values(this._features)) {
      for (const feature of Object.values(layer)) {
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
          [minX, minY, maxX, maxY] = bbox(geom);
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
    }

    // bulk insert into spatial index
    this._index.load(bboxes);
  }

  /**
   * @param {string} id
   * @returns {boolean} true if this tile contains a feature with the given id
   */
  contains(id) {
    for (const layer of Object.values(this._features)) {
      if (id in layer) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param {Feature} feature
   * @returns {Tile} this
   */
  addFeature(feature) {
    if (!(feature.layer in this._features)) {
      this._features[feature.layer] = {};
    }
    this._features[feature.layer][feature.id] = feature;
    this.featureGroup.addLayer(feature.leafletLayer);
    return this;
  }

  /**
   * @param {string} id
   * @returns {Tile} this
   */
  removeFeature(id) {
    if (!this.contains(id)) {
      return this;
    }
    const feature = this.getFeature(id);
    this.featureGroup.removeLayer(feature.leafletLayer);
    this._index.remove(feature.indexEntry);
    delete this._features[feature.layer][id];
    return this;
  }

  /**
   * @param {string} id
   * @returns {Feature}
   */
  getFeature(id) {
    for (const layer of Object.values(this._features)) {
      if (id in layer) {
        return layer[id];
      }
    }
    return null;
  }

  /**
   * This method adds this tile to the given layer by calling `addLayer` with the
   * tile's underlying FeatureGroup
   *
   * @param {L.Map|L.FeatureGroup|L.LayerGroup}
   * @returns {Tile} this
   */
  addTo(layer) {
    layer.addLayer(this.featureGroup);
    return this;
  }

  /**
   * This method removes this tile from the given layer by calling `removeLayer` with
   * the tile's underlying FeatureGroup
   *
   * @param {L.Map|L.FeatureGroup|L.LayerGroup}
   * @returns {Tile} this
   */
  removeFrom(layer) {
    layer.removeLayer(this.featureGroup);
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
    return this._index.search({ minX, minY, maxX, maxY }).map(r => r.id);
  }

  /**
   * Marks the tile as loaded
   *
   * @returns {Tile} this
   */
  markAsLoaded() {
    this.loaded = true;
    this.updateTimestamp();
    return this;
  }

  /**
   * @param {string} property
   * @param {string} value
   * @param {boolean} on
   * @param {boolead} toggled
   * @returns {Tile} this
   */
  toggleByProperty(property, value, on, toggled) {
    for (const layer of Object.values(this._features)) {
      for (const feature of Object.values(layer)) {
        const geoj = feature.geojson;
        if (property in geoj.properties && geoj.properties[property] === value) {
          if (toggled) {
            if (on) {
              this._index.insert(feature.indexEntry);
              this.featureGroup.addLayer(feature.leafletLayer);
            } else {
              this._index.remove(feature.indexEntry);
              this.featureGroup.removeLayer(feature.leafletLayer);
            }
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
  restyleByProperty(property, value, style) {
    for (const layer of Object.values(this._features)) {
      for (const feature of Object.values(layer)) {
        if (property in feature.geojson.properties
            && feature.geojson.properties[property] === value) {
          feature.leafletLayer.setStyle(style);
        }
      }
    }
    return this;
  }
}

