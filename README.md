# Leaflet.VectorTiles

Render (GeoJSON) vector tiles on an [L.GridLayer][1] with an [L.Canvas][2] renderer

API Documentation is in [API.md](API.md)

## Developing

### `L.VectorTiles`

This extension is primarily a class `L.VectorTiles`. It extends `L.GridLayer`.

#### `createTiles()`

Classes that extend `L.GridLayer` must override the `createTiles` method.

The `createTiles` method in `L.VectorTiles` is called per tile. It does the following:
- Fetch the data for that tile from the tile service
- Create the data structure that represents each tile (`this._vectorTiles`)
- Index all features in the tile
- Render all features in the tile

#### State

#### `this._vectorTiles`

Each active tile on the map has an entry in `this._vectorTiles`

```
this._vectorTiles = {
	tileKey: {
    	index: rbush(), // spatial index of all features in this tile
        features: {
        	featureId: {
            	geojson: <GeoJSON feature>,
                layer: <L.Layer>
            },
            ...
        },
        featureGroup: <L.FeatureGroup>, // holdes all layers in this tile
        loaded: <Boolean>, // has this tile finished loading
        valid: <Boolean> // is the tile still on the map (false if the tile has been unloaded)
    }
}
```

#### `this._propertyStyles`

#### `this._propertyOnMap`

#### `this._featureStyles`

#### `this._featureOnMap`

#### Quirks

##### Performance

Bad performance in Leaflet 1.0.0. Much better in Leaflet 1.0.3.

##### `tileload` and `tileunload`

When a tile is finished loading (`createTile` has completed) the `tileload` event is fired. When a tile is removed the `tileunload` event is fired. We call `destroyTile()` on `tileunload`. Sometimes `tileunload` fires before `tileload` (when zooming or panning quickly, for example) so we may try to delete resources that we have not yet created. This scenario is currently handled with the `loaded` in `this._vectorTiles[tileKey]`. On `tileload` it is set to `true` and on `tileunload`, if `this._vectorTiles[tileKey].loaded` is false, `destroyTile` is called on `tileload` else it is called immediately.

[1]: http://leafletjs.com/reference-1.0.3.html#gridlayer
[2]: http://leafletjs.com/reference-1.0.3.html#canvas

