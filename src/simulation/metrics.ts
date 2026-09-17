import type { Network } from '../domain/model';
import { GRID } from '../domain/model';
import { GAP, type Traffic } from './traffic';

export function metrics(traffic: Traffic, network: Network) {
  const count = traffic.cars.length;
  const capacity = Object.values(network.roads).reduce((sum, r) => sum + GRID / GAP * r.lanes * (r.oneWay ? 1 : 2), 0);
  return {
    count,
    averageSpeed: count ? traffic.cars.reduce((sum, c) => sum + c.speed, 0) / count * 3.6 : 0,
    averageTrip: traffic.completed ? traffic.totalTripTime / traffic.completed : 0,
    queued: traffic.cars.filter(c => c.speed < 1).length,
    congestion: capacity ? Math.min(100, count / capacity * 100) : 0,
    completed: traffic.completed
  };
}
