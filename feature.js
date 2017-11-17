/**
 * A feature object
 *
 * @class Feature
 * @private
 */
export default class Feature {

  /**
   * Constructor
   *
   * @param {string} id
   * @param {string} layer
   * @param {Object} geojson
   * @param {L.Layer} leafletLayer
   */
  constructor(id, layer, geojson, leafletLayer) {
    this.id = id;
    this.layer = layer;
    this.geojson = geojson;
    this.leafletLayer = leafletLayer;
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
    this.leafletLayer.setStyle(this.style);
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
