/**
 *
 */
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';

/**
 * Fetches and processes the vector tile for a given tile coordinate
 */
module.exports = function(self) {
  self.addEventListener('message', e => {
    const { url, coords } = e.data;
    fetch(url)
      .then(res => res.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const features = getFeatures(new VectorTile(new Pbf(reader.result)), coords);
          self.postMessage({ coords, features });
        }
        reader.readAsArrayBuffer(blob);
      });
  });
};

/**
 * Projects vector tile data to lat/lng coordinates and returns a list of
 * GeoJSON features
 */
function getFeatures(vectorTile, coords) {
  const features = [];
  for (const layerName in vectorTile.layers) {
    const layer = vectorTile.layers[layerName];
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const geojson = feature.toGeoJSON(coords.x, coords.y, coords.z);
      features.push(geojson);
    }
  }
  return features;
}
