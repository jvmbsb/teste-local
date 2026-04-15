'use strict';

/**
 * Dependency Graph class.
 */
class Graph {
  constructor() {
    this.edges = new Map(); // id (number) → Set<id>
  }
  add(id) {
    if (!this.edges.has(id)) this.edges.set(id, new Set());
  }
  link(from, to) {
    this.add(from);
    this.add(to);
    this.edges.get(from).add(to);
  }
  // BFS from seeds — returns Set of all reachable node ids
  resolve(seeds) {
    const visited = new Set();
    const queue   = [...seeds];
    while (queue.length > 0) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const deps = this.edges.get(id);
      if (deps) deps.forEach(d => queue.push(d));
    }
    return visited;
  }
}

module.exports = { Graph };
