/**
 *
 */
const fs = require('fs');
const cors = require('cors');
const rbush = require('rbush');
const bbox = require('@turf/bbox');
const express = require('express');
const SphericalMercator = require('sphericalmercator');
const featureCollection = require('@turf/helpers').featureCollection;

const app = express();
app.use(cors());

const PORT = 12345;

const mercator = new SphericalMercator({ size: 256 });

// load features from file
const geoj = JSON.parse(fs.readFileSync('countries.geo.json'));

// index features
const tree = rbush();

var feature, bb;
for (var i = 0; i < geoj.features.length; i++) {
  feature = geoj.features[i];
  bb = bbox(feature);
  tree.insert({
    minX: bb[0],
    minY: bb[1],
    maxX: bb[2],
    maxY: bb[3],
    feature
  });
}

app.get('/:z/:x/:y', (req, res) => {
  const x = +req.params.x;
  const y = +req.params.y;
  const z = +req.params.z;
  const tileBbox = mercator.bbox(x, y, z, false, '4326');
  const features = tree.search({
    minX: tileBbox[0],
    minY: tileBbox[1],
    maxX: tileBbox[2],
    maxY: tileBbox[3],
  }).map(r => r.feature);
  res.send([{ layer: 'coutries', features: featureCollection(features) }]);
});

app.listen(PORT, () => {
  console.log(`Vector tile server listening on port :${PORT}`);
});

