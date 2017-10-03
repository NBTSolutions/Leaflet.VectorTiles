/**
 * LRU cache for Tile objects
 */


/**
 * Node object for tile cache linked list
 *
 * @class Node
 * @private
 */
class Node {
  constructor(data) {
    self.data = data;
    self.prev = null;
    self.next = null;
  }
}


/**
 * This class implements an LRU cache
 * Objects in the cache are stored by key in a hash table, hashed on `tileKey`
 * A separate doubly linked list is used to maintain the order of eviction. By maintaining
 * references to corresponding nodes in this._cache, we achieve constant time `get`s and `put`s.
 *
 * @class TileCache
 * @private
 */
export default class TileCache {

  /**
   * Constructor
   *
   * @param {number} size - maximum number of items the cache can hold
   * @param {boolean} [debug=false] - enables debug printing
   */
  constructor(size, debug = false) {
    this._size = size;
    this._debug = debug;
    this._cache = {}; // a hashtable for holding cached items
    this._head = null; // the head of a doubly linked list that maintains the order of items by age
    this._tail = null // tail pointer to the order linked list
  }

  /**
   * @param {string} tileKey
   */
  get(tileKey) {
    if (!(tileKey in this._cache)) {
      if (this._debug) {
        console.log('tile cache:', 'miss', tileKey);
      }
      return null;
    }

    if (this._debug) {
      console.log('tile cache', 'hit', tileKey);
    }

    // move node to front of linked list
    const node = this._cache[tileKey].node;
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node === this._tail) {
      this._tail = node.prev;
    }
    node.next = this._head;

    return this._cache[tileKey].tile;
  }

  /**
   * @param {string} tileKey
   * @param {Tile} tile
   */
  put(tileKey, tile) {
    if (this._debug) {
      console.log('tile cache:', 'caching', tileKey);
    }

    if (tileKey in this._cache) {
      // move to front of linked list
      const node = this._cache[tileKey].node;
      if (node.prev) {
        node.prev.next = node.next;
      }
      node.next = this._head;
      // the data may be new so always replace it
      this._cache[tileKey].tile = tile;
      return this;
    }

    // place at heaad of order linked list
    let node = new Node({ tile, tileKey });
    if (this._head) {
      this._head.prev = node;
    }
    node.next = this._head;
    this._head = node;

    this._cache[tileKey] = { tileKey, tile, node };

    if (Object.keys(this._cache) > this._size) {
      // we need to evict an item

      // remove from linked list
      const tailNode = this._tail;
      this._tail = tailNode.prev;
      tailNode.prev.next = null;

      // remove from cache table
      const tailtileKey = tailNode.data.tileKey;
      if (this._debug) {
        console.log('tile cache:', 'evicting', tileKey);
      }
      delete this._cache[tailtileKey];
    }
  }
}

