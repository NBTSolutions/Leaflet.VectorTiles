/**
 * A feature object
 *
 * @class Feature
 * @private
 */
export default class Feature {
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
