import { connectedRoads } from '../domain/graph';
import type { Network } from '../domain/model';

export function roadSection(network: Network, id: string): { roads: string[]; nodes: string[] } {
  const seed = network.roads[id];
  if (!seed) return { roads: [], nodes: [] };
  const roads = [id], nodes = [seed.a, seed.b], visited = new Set([id]);
  for (const prepend of [true, false]) {
    let current = prepend ? nodes[0] : nodes[nodes.length - 1];
    while (connectedRoads(network, current).length === 2 && !network.signals[current] && !network.junctions[current]) {
      const next = connectedRoads(network, current).find(r => !visited.has(r.id));
      if (!next) break;
      visited.add(next.id);
      current = next.a === current ? next.b : next.a;
      if (prepend) { roads.unshift(next.id); nodes.unshift(current); }
      else { roads.push(next.id); nodes.push(current); }
    }
  }
  return { roads, nodes };
}
