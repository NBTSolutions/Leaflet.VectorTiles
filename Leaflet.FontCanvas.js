/**
 * A canvas renderer that can draw fonts.
 * Useful for icon fonts.
 *
 * @class FontCanvas
 * @extends Canvas
 *
 * @example
 * var map = L.map('map', {
 *   renderer: new L.FontCanvas()
 * });
 */

L.FontCanvas = L.Canvas.extend({
  _updateCircle(layer) {
    if (!this._drawing || layer._empty()) { return; }

    const p = layer._point;
    const ctx = this._ctx;
    const r = layer._radius;
    const s = (layer._radiusY || r) / r;

    this._drawnLayers[layer._leaflet_id] = layer;

    if (layer.options.content && layer.options.font) {
      ctx.font = layer.options.font;
      ctx.fillStyle = layer.options.color;
      ctx.fillText(layer.options.content, p.x, p.y);
    } else {
      if (s !== 1) {
        ctx.save();
        ctx.scale(1, s);
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y / s, r, 0, Math.PI * 2, false);

      if (s !== 1) {
        ctx.restore();
      }

      this._fillStroke(ctx, layer);
    }
  }
});
