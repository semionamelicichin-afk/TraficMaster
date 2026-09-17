import { connectedRoads } from '../domain/graph';
import type { Network } from '../domain/model';
import { junctionControl } from '../domain/controls';

export function signalPhase(green: number, time: number): 'horizontal' | 'vertical' {
  return Math.floor((time + 1e-8) / green) % 2 === 0 ? 'horizontal' : 'vertical';
}
export function canEnter(network: Network, from: string, to: string, time: number): boolean {
  const signal = network.signals[to];
  if (!signal) return true;
  const a = network.nodes[from], b = network.nodes[to];
  return signalPhase(signal.green, time) === (a.y === b.y ? 'horizontal' : 'vertical');
}
export function setSignal(network: Network, node: string, green: number | null): void {
  if (green === null) {
    if (connectedRoads(network, node).length >= 2 && !network.junctions[node]) network.junctions[node] = junctionControl(network, node);
    delete network.signals[node]; network.revision++; return;
  }
  if (connectedRoads(network, node).length < 2) throw new Error('Select a junction with at least two connected roads.');
  if (!Number.isFinite(green) || green < 2 || green > 30) throw new Error('Green phase must be between 2 and 30 seconds.');
  network.signals[node] = { green };
  if (!network.junctions[node]) network.junctions[node] = junctionControl(network, node);
  network.revision++;
}
