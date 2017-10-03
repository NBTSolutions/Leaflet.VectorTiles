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
   */
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.coords = { x, y, z };
    this._features = {};

    this.loaded = false;

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
   * This method adds all features in this tile to an rbush index
   */
  indexFeatures() {
    const bboxes = [];
    for (const id in this._features) {
      if (!this._features.hasOwnProperty(id)) {
        continue;
      }
      const feature = this._features[id];
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

    // bulk insert into spatial index
    this._index.load(bboxes);
  }

  /**
   * @param {string} id
   * @returns {boolean} true if this tile contains a feature with the given id
   */
  contains(id) {
    return id in this._features;
  }

  /**
   * @param {Feature} feature
   * @returns {Tile} this
   */
  addFeature(feature) {
    this._features[feature.id] = feature;
    this.featureGroup.addLayer(feature.layer);
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
    this.featureGroup.removeLayer(feature.layer);
    this._index.remove(feature.indexEntry);
    delete this._features[id];
    return this;
  }

  /**
   * @param {string} id
   * @returns {Feature}
   */
  getFeature(id) {
    return this._features[id];
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
    let feature;
    let geoj;
    for (const id in this._features) {
      if (!this._features.hasOwnProperty(id)) {
        continue;
      }
      feature = this.getFeature(id);
      geoj = feature.geojson;
      if (property in geoj.properties && geoj.properties[property] === value) {
        if (toggled) {
          if (on) {
            this._index.insert(feature.indexEntry);
            this.featureGroup.addLayer(feature.layer);
          } else {
            this._index.remove(feature.indexEntry);
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
  restyleByProperty(property, value, style) {
    let feature;
    for (const id in this._features) {
      if (!this._features.hasOwnProperty(id)) {
        continue;
      }
      feature = this.getFeature(id);
      if (property in feature.geojson.properties
          && feature.geojson.properties[property] === value) {
        feature.layer.setStyle(style);
      }
    }
    return this;
  }
}

