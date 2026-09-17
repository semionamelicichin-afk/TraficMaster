import { connectedRoads } from './graph';
import type { Gateway, Junction, Network, RoadSign } from './model';

export function approaches(network: Network, node: string): string[] {
  return connectedRoads(network, node).map(r => r.a === node ? r.b : r.a).sort();
}
export function approachName(network: Network, node: string, from: string): string {
  const a = network.nodes[node], b = network.nodes[from];
  return b.x < a.x ? 'West' : b.x > a.x ? 'East' : b.y < a.y ? 'North' : 'South';
}
export function junctionControl(network: Network, node: string): Junction {
  const arms = approaches(network, node);
  const stored = network.junctions[node];
  const main = (stored?.main ?? []).filter(id => arms.includes(id)).slice(0, 2);
  const horizontal = arms.filter(id => network.nodes[id].y === network.nodes[node].y);
  const vertical = arms.filter(id => network.nodes[id].x === network.nodes[node].x);
  for (const id of [...(horizontal.length === 2 ? horizontal : vertical.length === 2 ? vertical : arms), ...arms]) {
    if (main.length < 2 && !main.includes(id)) main.push(id);
  }
  const signs: Record<string, RoadSign> = {};
  for (const id of arms) if (!main.includes(id)) signs[id] = stored?.signs[id] ?? 'yield';
  return { main, signs };
}
export function setJunction(network: Network, node: string, main: string[], signs: Record<string, RoadSign>): void {
  const arms = approaches(network, node);
  if (arms.length < 2 || main.length !== 2 || new Set(main).size !== 2 || main.some(id => !arms.includes(id))) {
    throw new Error('Choose exactly two different main-road approaches.');
  }
  const minor = arms.filter(id => !main.includes(id));
  if (minor.some(id => signs[id] !== 'yield' && signs[id] !== 'stop')) throw new Error('Choose STOP or Yield for every minor approach.');
  network.junctions[node] = { main: [...main], signs: Object.fromEntries(minor.map(id => [id, signs[id]])) };
  network.revision++;
}
export function setGateway(network: Network, node: string, gate: Gateway | null): void {
  if (gate && network.zones[node]) throw new Error('Remove the zone before assigning a city gateway.');
  if (connectedRoads(network, node).length !== 1) throw new Error('Select a road endpoint to configure a city gateway.');
  if (gate) network.gates[node] = gate; else delete network.gates[node];
  network.revision++;
}
