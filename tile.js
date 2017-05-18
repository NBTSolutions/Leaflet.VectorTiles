import rbush from 'rbush';
import bbox from '@turf/bbox';

/**
 * A tile object
 *
 * @class Tile
 * @private
 */
export default class Tile {
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
   *
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
   * @returns {Tile} this
   */
  removeFeature(id) {
    if (!this.contains(id)) {
      return this;
    }
    const feature = this.getFeature(id);
    this.featureGroup.removeLayer(feature.layer);
    this.index.remove(feature.indexEntry);
    delete this.features[id];
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
   * @param {string} property
   * @param {string} value
   * @param {boolean} on
   * @param {boolead} toggled
   * @returns {Tile} this
   */
  toggleByProperty(property, value, on, toggled) {
    let feature;
    let geoj;
    for (const id in this.features) {
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
  restyleByProperty(property, value, style) {
    let feature;
    for (const id in this.features) {
      if (!this.features.hasOwnProperty(id)) {
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

