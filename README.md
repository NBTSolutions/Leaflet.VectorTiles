# Leaflet.VectorTiles

Render (GeoJSON) vector tiles on an [L.GridLayer][1] with an [L.Canvas][2] renderer

## Developing

### `L.VectorTiles`

This library is primarily a class `L.VectorTiles`. It extends `L.GridLayer`.

#### `createTiles()`

Classes that extend `L.GridLayer` must override the `createTiles` method.

The `createTiles` method in `L.VectorTiles` is called per tile. It:
- Fetches the data for that tile from the tile service
- Create the data structure that represents each tile (`this._vectorTiles`)
- Index all features in the tile
- Render all features in the tile

#### State

##### `this._vectorTiles`

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
        loaded: <Boolean> // has this tile finished loading
    }
}
```

One of the main tasks of this extension is preserving feature state as it appears across different tiles (usually as a result of zooming). The two data structures used to do this are `this._propertyStates` and  `this._styles`.

##### `this._propertyStates`

A user may restyle, hide, or show features based on its (GeoJSON) properties using `restyleByProperty`, `hideByProperty`, and `showByProperty` respectively. `this._propertyStates` is used to keep track of these style modifications so that features in tiles that are loaded after a property based modification is made are displayed correctly (for example: if a feature is selected/highlighted, it show remain highlighted after zooming). The structure of `this._propertyStates` is

```js
this._propertyStates = {
	property1: {
    	value1: {
        	style: L.Path.options,
            onMap: true
        }
    },
    ...
};
```

##### `this._styles`

`this._styles` tracks per feature style modification. It maps feature ids to corresponding styles.

```
this._styles = {
	featureId: L.Path.options,
    ...
};
```

#### Quirks

##### Performance

Currently the performance bottleneck is in calling `featureGroup.addTo(this._featureGroup)`

##### `tileload` and `tileunload`

When a tile is finished loading (`createTile` has completed) the `tileload` event is fired. When a tile is removed the `tileunload` event is fired. We call `destroyTile()` on `tileunload`. Sometimes `tileunload` fires before `tileload` (when zooming or panning quickly, for example) so we may try to delete resources that we have not yet created. This scenario is currently handled with the `loaded` in `this._vectorTiles[tileKey]`. On `tileload` it is set to `true` and on `tileunload`, if `this._vectorTiles[tileKey].loaded` is false, `destroyTile` is called on `tileload` else it is called immediately.

[1]: http://leafletjs.com/reference-1.0.3.html#gridlayer
[2]: http://leafletjs.com/reference-1.0.3.html#canvas

