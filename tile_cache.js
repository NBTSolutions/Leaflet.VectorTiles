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
    this.data = data;
    this.prev = null;
    this.next = null;
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
   * Retrieve an item from the cache
   *
   * @param {string} tileKey
   * @returns {Tile|null}
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
      console.log(this._stringifyList());
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
    let node = new Node({ tileKey });
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
        console.log(this._stringifyList());
      }
      delete this._cache[tailtileKey];
    }
  }

  /**
   * @param {number} size
   */
  setSize(size) {
    if (size < 0) {
      throw "Size cannot be a negative number";
    }

    if (this._debug) {
      console.log('tile cache:', 'changing cache size from', this._size, 'to', size);
    }

    if (size >= this._size) {
      // we are increasing the size, no need to remove items from the cache
      this._size = size;
      return;
    }

    this._size = size;

    if (this._head == null) {
      // this cache is empty
      return;
    }

    let node = this._head;
    let garbage = node;
    if (size > 0) {
      let c = 1;
      while (c < size && node.next != null) {
        node = node.next;
        c++;
      }
      garbage = node.next;
      node.next = null;
    }

    // collect the garbage
    while (garbage != null) {
      let { tileKey } = garbage.data;
      if (this._debug) {
        console.log('tile cache:', 'removing tile', tileKey, 'due to cache resize');
        console.log(this._stringifyList());
      }
      delete this._cache[tileKey]; // delete from cache
      garbage = garbage.next;
    }

    // when this function exits, there should be no more references to the garbage
    // nodes in the linked list, so they will be garbage collected as usual
  }

  /**
   * Returns a string reprenting the current order of tiles in the cache
   *
   * @returns {string}
   * @private
   */
  _stringifyList() {
    let node = this._head;
    let out = '';
    while (node !== null) {
      out += `(coords = ${node.data.tileKey}, feature count = ${Object.keys(this._cache[node.data.tileKey].tile._features).length}) -> `;
      node = node.next;
    }
    return out;
  }
}

