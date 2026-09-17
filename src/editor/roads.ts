import { addNode, connectedRoads, validPoint } from '../domain/graph';
import { nodeId, roadId, type Network, type Point } from '../domain/model';

export function planRoad(network: Network, from: Point, to: Point): { points: Point[]; ids: string[] } {
  if (!validPoint(from) || !validPoint(to)) throw new Error('Choose points inside the grid.');
  if (from.x !== to.x && from.y !== to.y) throw new Error('Roads must be horizontal or vertical. Choose an aligned point.');
  const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  if (!length) throw new Error('Choose a different end point.');
  const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
  const points = Array.from({ length: length + 1 }, (_, i) => ({ x: from.x + dx * i, y: from.y + dy * i }));
  const ids = points.slice(1).map((p, i) => roadId(nodeId(points[i]), nodeId(p)));
  if (ids.some(id => network.roads[id])) throw new Error('A road already exists here. Select it to change lanes or direction.');
  return { points, ids };
}

export function buildRoad(network: Network, from: Point, to: Point, lanes: 1 | 2, oneWay: boolean): string[] {
  const { points, ids } = planRoad(network, from, to);
  points.forEach(p => addNode(network, p));
  ids.forEach((id, i) => { network.roads[id] = { id, a: nodeId(points[i]), b: nodeId(points[i + 1]), lanes, oneWay }; });
  for (const point of points) {
    const id = nodeId(point);
    if (connectedRoads(network, id).length !== 1) delete network.gates[id];
    const control = network.junctions[id];
    if (control) for (const road of connectedRoads(network, id)) {
      const from = road.a === id ? road.b : road.a;
      if (!control.main.includes(from) && !control.signs[from]) control.signs[from] = 'yield';
    }
  }
  network.revision++;
  return ids;
}
