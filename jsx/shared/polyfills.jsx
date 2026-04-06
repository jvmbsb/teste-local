/**
 * DeepClean v2 — ES3 Polyfills (shared)
 * Loaded by both snapshot and execute entry points via #include.
 * All guards prevent double-installation.
 */
(function () {
  if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function (s, f) {
      f = f || 0;
      for (var i = f; i < this.length; i++) { if (this[i] === s) return i; }
      return -1;
    };
  }
  if (!Array.prototype.forEach) {
    Array.prototype.forEach = function (fn, ctx) {
      for (var i = 0; i < this.length; i++) fn.call(ctx, this[i], i, this);
    };
  }
  if (!Array.prototype.map) {
    Array.prototype.map = function (fn, ctx) {
      var r = [];
      for (var i = 0; i < this.length; i++) r.push(fn.call(ctx, this[i], i, this));
      return r;
    };
  }
  if (!Array.prototype.filter) {
    Array.prototype.filter = function (fn, ctx) {
      var r = [];
      for (var i = 0; i < this.length; i++) { if (fn.call(ctx, this[i], i, this)) r.push(this[i]); }
      return r;
    };
  }
  if (!Array.prototype.push) {
    Array.prototype.push = function () {
      for (var i = 0; i < arguments.length; i++) this[this.length] = arguments[i];
      return this.length;
    };
  }
})();
