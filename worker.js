/**
 *
 */
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';

/**
 * Fetches and processes the vector tile for a given tile coordinate
 */
module.exports = function(self) {
  self.addEventListener('message', e => {
    const { url, coords, timestamp } = e.data;
    const headers = new Headers();
    if (timestamp) {
      headers.append('If-Modified-Since', timestamp);
    }
    fetch(url)
      .then(res => {
        if (res.status === 404) {
          return self.postMessage({ coords, features: [] });
        }
        res.blob()
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const features = getFeatures(new VectorTile(new Pbf(reader.result)), coords);
              self.postMessage({ coords, features });
            };
            reader.readAsArrayBuffer(blob);
          });
      })
    .catch(e => {
      console.log(e);
    });
  });
};

/**
 * Projects vector tile data to lat/lng coordinates and returns a list of
 * GeoJSON features
 */
function getFeatures(vectorTile, coords) {
  const features = {};
  for (const layerName in vectorTile.layers) {
    const l = features[layerName] = [];
    const layer = vectorTile.layers[layerName];
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const geojson = feature.toGeoJSON(coords.x, coords.y, coords.z);
      l.push(geojson);
    }
  }
  return features;
}
