import { edge } from './graph';
import { GRID, type Network, type Point, type Road } from './model';

export type Movement = 'left' | 'straight' | 'right';
export interface DirectedLane {
  id: string;
  from: string;
  to: string;
  index: number;
}
export interface LaneConnection {
  id: string;
  incoming: DirectedLane;
  outgoing: DirectedLane;
  movement: Movement;
}

/** Lane zero is the leftmost lane in the direction of travel. */
export function directedLanes(network: Network, from: string, to: string): DirectedLane[] {
  const road = edge(network, from, to);
  return road ? Array.from({ length: road.lanes }, (_, index) => ({
    id: `${road.id}:${from}>${to}:${index}`, from, to, index,
  })) : [];
}

export function movement(network: Network, from: string, via: string, to: string): Movement | null {
  if (from === to || !edge(network, from, via) || !edge(network, via, to)) return null;
  const a = network.nodes[from], b = network.nodes[via], c = network.nodes[to];
  const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  return cross === 0 ? 'straight' : cross < 0 ? 'left' : 'right';
}

/** Straight movements preserve lanes; widening branches and narrowing merges explicitly. */
export function laneConnections(network: Network, from: string, via: string, to: string): LaneConnection[] {
  const turn = movement(network, from, via, to);
  if (!turn) return [];
  const incoming = directedLanes(network, from, via), outgoing = directedLanes(network, via, to);
  return incoming.flatMap(source => {
    if (incoming.length === 2 && ((turn === 'left' && source.index !== 0) || (turn === 'right' && source.index !== 1))) return [];
    return outgoing.filter(target => {
      if (outgoing.length === 1) return true;
      if (turn === 'left') return target.index === 0;
      if (turn === 'right') return target.index === outgoing.length - 1;
      return incoming.length === 1 || target.index === source.index;
    }).map(target => ({ id: `${source.id}>${target.id}`, incoming: source, outgoing: target, movement: turn }));
  });
}

export function routeLanes(network: Network, route: string[]): number[] {
  if (route.length < 2) return [];
  if (route.length === 2) return directedLanes(network, route[0], route[1]).map(lane => lane.index);
  return [...new Set(laneConnections(network, route[0], route[1], route[2]).map(c => c.incoming.index))];
}

export function laneOffset(road: Pick<Road, 'lanes' | 'oneWay'>, lane: number): number {
  return road.oneWay ? (lane - (road.lanes - 1) / 2) * 7 : 4 + lane * 7;
}

/** Fractional lane indices describe the actual lateral position while changing lanes. */
export function lanePosition(network: Network, from: string, to: string, lane: number, progress: number): Point | null {
  const road = edge(network, from, to);
  if (!road) return null;
  const a = network.nodes[from], b = network.nodes[to], dx = b.x - a.x, dy = b.y - a.y;
  const offset = laneOffset(road, lane);
  return { x: a.x * GRID + dx * progress - dy * offset, y: a.y * GRID + dy * progress + dx * offset };
}
