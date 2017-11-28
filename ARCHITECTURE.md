# Architecture

### Tile Fetching and Parsing

When a tile comes into view, Leaflet calls `createTile` with the tile's coordinates as an arguemnt in the form `{ x: <int>, y: <int>, z: <int> }`.


#### Web Worker

The webworker fetches the tile, parses it, converts it to GeoJSON, and then returns an object with layer names as keys and arrays of geojson features as values.

When we request a tile from the url `/<x>/<y>/<z>.pbf`, the vector tile server returns a protocol buffer encoded binary blob of the tile's vector data.
We read the blob using a [`FileReader`](https://developer.mozilla.org/en-US/docs/Web/API/FileReader), decode the blob using the [pbf library](https://github.com/mapbox/pbf) and then parse the JSON output of that using the [vector-tile-js library](https://github.com/mapbox/vector-tile-js/).
That outputs [`VectorTileFeature`s](https://github.com/mapbox/vector-tile-js#vectortilefeature) for each feature in the tile, grouped by layer.
We can now iterate over each tile and feature and convert to GeoJSON as a method of projecting from pixel coordinates to lat/lons.
Now we create a [geojson-vt](https://github.com/mapbox/geojson-vt) index for the single zoom level of the tile we are processing.
geojson-vt simplifies and drops lines and polygons appropriateley so this gives us tile simplification.
Then, we request the simplified ile from the geojson-vt index.
Then we convert the tile back to GeoJSON using vector-tile-js.
Then we post the GeoJSON to the main thread with the coords.

*NOT IMPLEMENTED:*


*TODO: webworker pool*


### Tile Data Structure

The `Tile` data type encapsulates most of the functionality for storing the data of and rendering a given tile.

### Tile Caching

The tile cache is an implementation of a [Least Recently Used (LRU) cache](https://en.wikipedia.org/wiki/Cache_replacement_policies#Least_Recently_Used_.28LRU.29).
Internally, a doubly linked list is used to track the order of access (and insertion) of all items in the cache and a hash table is used to hold the data. Each node in the linked list holds `next` and `previous` pointers as well as a `data` field which holds the tile key used to access the tile in the cache's hash table.
When an item is first placed in the cache, we create an entry for it in the linked list, placing it at the head.
The tile itself is then placed in the hash table.
If the length of the list is greater than the maximum cache size, we pop the tail node of the list and use the tile key therein to delete the tile from the hash table.
Whenever a tile is fetched from (or reinserted into) the cache, its corresponding node is moved to the head of the list.

### Styling

Styling is primarily feature property based.
That is, a style applies to a feature when that feature has the corresponding `key: value` pair in its properties.
For example, the following style:

```js
style: {
    treeType: {
        oak: {
            color: 'green'
        }
    }
}
```

would apply to a feature like:

```js
{
    type: 'Feature',
    geometry: {
        type: 'Point',
        coordinates: [11, 78]
    },
    properties: {
        treeType: 'oak'
        id: 12
    }
}
```

The hierarchy of styling is as follows:

- default Leaflet styles for the layer
- property based styles as applied at library instantiation
- property based style modifications made at run time
- style modifications for the specific feature (by feature id)

TODO

- Layer based styling

### Indexing and Searching
