import { connectedRoads } from '../domain/graph';
import type { Network, Road } from '../domain/model';

export const roadWidth = (road: Pick<Road, 'lanes' | 'oneWay'>): number => road.lanes * (road.oneWay ? 7 : 14) + 8;

/** Keep markings outside corners, intersections and width transitions. */
export function markingInset(network: Network, node: string): number {
  const roads = connectedRoads(network, node);
  if (roads.length === 2) {
    const ends = roads.map(r => network.nodes[r.a === node ? r.b : r.a]);
    if ((ends[0].x === ends[1].x || ends[0].y === ends[1].y)
      && roadWidth(roads[0]) === roadWidth(roads[1]) && roads[0].oneWay === roads[1].oneWay) return 0;
  }
  return roads.length ? Math.max(...roads.map(roadWidth)) / 2 + 4 : 0;
}
