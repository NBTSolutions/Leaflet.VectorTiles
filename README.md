# Leaflet.VectorTiles

Render (GeoJSON) vector tiles on an [L.GridLayer](http://leafletjs.com/reference-1.0.3.html#gridlayer) with an [L.Canvas](http://leafletjs.com/reference-1.0.3.html#canvas) renderer

This extension also includes `L.FontCanvas` which extends `L.Canvas` with the capability of rendering fonts (useful for icon fonts).

API documentation is in [API.md](API.md).

## Dependencies

- [Leaflet 1.0.3](http://leafletjs.com/) (note that it will work in Leaflet 1.0.0 but performance if very bad)

## Usage

Include the following in your HTML header:

```html
<link rel="stylesheet" href="leaflet.css"/>
<script src="leaflet-src.js"></script>
<script src="Leaflet.VectorTiles.js"></script>
```

Note: `Leaflet.VectorTiles.js` must come after `Leaflet`

Example:

```js
var map = L.map('map', {
  renderer: new L.FontCanvas()
});

var url = 'http://mytiles.party/{z}/{x}/{y}';

var vtLayer = new L.VectorTiles(url, {
  getFeatureId: function(feature) {
    return feature.properties.id;
  },
  map: map,
  debug: true, // to show tile boundaries
  style: {
    treeType: {
      oak: {
        color: 'green',
        font: '10px icomoon',
        content: '\ue91a'
      },
      pine: {
        color: 'red'
      }
    },
    building: {
      guggenheim: {
        color: 'purple',
        font: '20px icomoon',
        content: '\ue915' // house icon
      }
    }
  }
});

vtLayer.addTo(map);
```

All styling is by feature properties. The keys in the style option are property names
and the keys in those objects correspond to values.

## Developing

```
npm run build
```

The above outputs a bundle named `leaflet.vector-tiles.js`

```
npm run build-dev
```

Outputs the bundle with a source map for easier debugging

#### `createTiles()`

Classes that extend `L.GridLayer` must override the `createTiles` method.

The `createTiles` method in `L.VectorTiles` is called per tile. It does the following:
- Fetch the data for that tile from the tile service
- Create the data structure that represents each tile (`this._vectorTiles`)
- Index all features in the tile
- Render all features in the tile

#### `Tile`

The `Tile` class manages all features

### Quirks

##### Performance

Performance is in very bad in Leaflet 1.0.0. It is much better in Leaflet 1.0.3.

##### Performance

`tileunload` doesn't fire on pan so old tiles stick around as you pan around

