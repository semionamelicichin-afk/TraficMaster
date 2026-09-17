import { COLUMNS, ROWS, nodeId, roadId, type Network, type Point, type Road, type RoadNode } from './model';

export function validPoint(p: Point): boolean {
  return Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x <= COLUMNS && p.y <= ROWS;
}
export function addNode(network: Network, point: Point): RoadNode {
  if (!validPoint(point)) throw new Error('Choose a point inside the grid.');
  const id = nodeId(point);
  if (!network.nodes[id]) { network.nodes[id] = { ...point, id }; network.revision++; }
  return network.nodes[id];
}
export function connectedRoads(network: Network, id: string): Road[] {
  return Object.values(network.roads).filter(r => r.a === id || r.b === id);
}
export function removeRoad(network: Network, id: string): void {
  const road = network.roads[id];
  if (!road) return;
  delete network.roads[id];
  for (const node of [road.a, road.b]) {
    const count = connectedRoads(network, node).length;
    if (count === 0) delete network.nodes[node];
    if (count !== 1) delete network.gates[node];
    if (count < 2) { delete network.signals[node]; delete network.junctions[node]; }
    else if (network.junctions[node]) {
      const arms = connectedRoads(network, node).map(r => r.a === node ? r.b : r.a);
      const control = network.junctions[node];
      control.main = control.main.filter(id => arms.includes(id));
      for (const id of arms) if (control.main.length < 2 && !control.main.includes(id)) control.main.push(id);
      control.signs = Object.fromEntries(arms.filter(id => !control.main.includes(id)).map(id => [id, control.signs[id] ?? 'yield']));
    }
  }
  network.revision++;
}
export function removeNode(network: Network, id: string): void {
  connectedRoads(network, id).forEach(r => removeRoad(network, r.id));
  delete network.nodes[id]; delete network.signals[id]; delete network.gates[id]; delete network.junctions[id]; network.revision++;
}
export function updateRoad(network: Network, id: string, lanes: 1 | 2, oneWay: boolean): void {
  const road = network.roads[id];
  if (!road) throw new Error('Select a road first.');
  road.lanes = lanes; road.oneWay = oneWay; network.revision++;
}
export function neighbors(network: Network, id: string): string[] {
  return connectedRoads(network, id).flatMap(r => r.a === id ? [r.b] : r.oneWay ? [] : [r.a]);
}
export function edge(network: Network, a: string, b: string): Road | undefined {
  const road = network.roads[roadId(a, b)];
  return road && (road.a === a || !road.oneWay) ? road : undefined;
}
