/**
 * Example GeoJSON tile server
 */
const fs = require('fs');
const cors = require('cors');
const rbush = require('rbush');
const bbox = require('@turf/bbox');
const vtpbf = require('vt-pbf');
const express = require('express');
const geojsonvt = require('geojson-vt');
const SphericalMercator = require('sphericalmercator');
const featureCollection = require('@turf/helpers').featureCollection;

const app = express();
app.use(express.static('.'))
app.use(cors());

const PORT = 12345;

const mercator = new SphericalMercator({ size: 256 });

// load features from file
const countryGeoj = JSON.parse(fs.readFileSync('countries.geojson'));
const pointGeoj = JSON.parse(fs.readFileSync('points-10000.geojson'));

// name the points so that we can id them
for (let i = 0; i < pointGeoj.features.length; i++) {
  let point = pointGeoj.features[i];
  point.properties.name = `${i}`;
}

// tile index for Vector Tiles
const countryTileIndex = geojsonvt(countryGeoj, {
  buffer: 0,
  debug: 2,
});

const pointTileIndex = geojsonvt(pointGeoj, {
  buffer: 0,
  debug: 2,
});

// returned when empty tiles are requested
const emptyFeatCollection = featureCollection([]);

app.get('/:z/:x/:y', (req, res) => {
  const [x, y, z] = [+req.params.x, +req.params.y, +req.params.z];
  const countries = countryTileIndex.getTile(z, x, y) || emptyFeatCollection;
  const points = pointTileIndex.getTile(z, x, y) || emptyFeatCollection;
  const buff = vtpbf.fromGeojsonVt({ countries, points });
  res.send(buff);
});

app.get('/geojson/:type', (req, res) => {
  const { type } = req.params;
  if (type === 'country') {
    res.json(countryGeoj);
  } else if (type === 'point') {
    res.json(pointGeoj);
  } else {
    res.status(404).send({ nah: 'b' });
  }
});

app.listen(PORT, () => {
  console.log(`app listening on port :${PORT}`);
});

