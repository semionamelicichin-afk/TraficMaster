import { neighbors } from './graph';
import type { Network } from './model';

export function gatewayTrips(network: Network): { start: string; destination: string }[] {
  const entries = Object.keys(network.gates).filter(id => network.gates[id] !== 'exit').sort();
  const exits = Object.keys(network.gates).filter(id => network.gates[id] !== 'entry').sort();
  return entries.flatMap(start => exits.filter(destination => destination !== start && findRoute(network, start, destination)).map(destination => ({ start, destination })));
}

/** Dijkstra over unit-length grid edges, respecting directed roads. */
export function findRoute(network: Network, start: string, destination: string, arrivingFrom?: string): string[] | null {
  if (!network.nodes[start] || !network.nodes[destination]) return null;
  const distance = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, string>();
  const open = new Set([start]);
  while (open.size) {
    const current = [...open].sort((a, b) => distance.get(a)! - distance.get(b)!)[0];
    open.delete(current);
    if (current === destination) {
      const route = [current];
      while (previous.has(route[0])) route.unshift(previous.get(route[0])!);
      return route;
    }
    for (const next of neighbors(network, current)) {
      if (current === start && next === arrivingFrom) continue;
      const cost = distance.get(current)! + 1;
      if (cost < (distance.get(next) ?? Infinity)) { distance.set(next, cost); previous.set(next, current); open.add(next); }
    }
  }
  return null;
}
