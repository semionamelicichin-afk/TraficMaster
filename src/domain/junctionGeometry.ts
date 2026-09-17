import { GRID, type Network, type Point } from './model';
import { lanePosition, type LaneConnection } from './lanes';

export interface Pose extends Point { angle: number }
export interface Curve {
  points: [Point, Point, Point, Point];
  distances: number[];
  length: number;
}
export const CROSSING_INSET = 16;
const SAMPLES = 64;

function evaluate(points: Curve['points'], t: number): Pose {
  const [a, b, c, d] = points, u = 1 - t;
  const x = u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x;
  const y = u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y;
  const dx = 3 * u * u * (b.x - a.x) + 6 * u * t * (c.x - b.x) + 3 * t * t * (d.x - c.x);
  const dy = 3 * u * u * (b.y - a.y) + 6 * u * t * (c.y - b.y) + 3 * t * t * (d.y - c.y);
  return { x, y, angle: Math.atan2(dy, dx) };
}

/** Tangent-aligned cubic with a distance table shared by motion and rendering. */
export function junctionCurve(network: Network, connection: LaneConnection, inset: number): Curve {
  const { incoming: a, outgoing: b } = connection;
  const start = lanePosition(network, a.from, a.to, a.index, GRID - inset)!;
  const end = lanePosition(network, b.from, b.to, b.index, inset)!;
  const from = network.nodes[a.from], via = network.nodes[a.to], to = network.nodes[b.to];
  const handle = connection.movement === 'straight' ? inset * 2 / 3 : Math.hypot(end.x - start.x, end.y - start.y) * 0.39;
  const points: Curve['points'] = [start,
    { x: start.x + (via.x - from.x) * handle, y: start.y + (via.y - from.y) * handle },
    { x: end.x - (to.x - via.x) * handle, y: end.y - (to.y - via.y) * handle }, end];
  const distances = [0];
  let previous = evaluate(points, 0);
  for (let i = 1; i <= SAMPLES; i++) {
    const point = evaluate(points, i / SAMPLES);
    distances.push(distances[i - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
    previous = point;
  }
  return { points, distances, length: distances[SAMPLES] };
}

export function curvePose(curve: Curve, distance: number): Pose {
  const d = Math.max(0, Math.min(curve.length, distance));
  let low = 0, high = SAMPLES;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (curve.distances[mid] < d) low = mid; else high = mid;
  }
  const fraction = (d - curve.distances[low]) / (curve.distances[high] - curve.distances[low]);
  return evaluate(curve.points, (low + fraction) / SAMPLES);
}
