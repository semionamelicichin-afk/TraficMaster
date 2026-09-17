import { buildRoad } from '../editor/roads';
import { emptyNetwork } from './model';

export function demoNetwork() {
  const network = emptyNetwork();
  for (const y of [4, 10]) buildRoad(network, { x: 2, y }, { x: 18, y }, 1, false);
  for (const x of [6, 14]) buildRoad(network, { x, y: 1 }, { x, y: 13 }, 1, false);
  buildRoad(network, { x: 6, y: 7 }, { x: 14, y: 7 }, 2, false);
  for (const x of [6, 14]) for (const y of [4, 7, 10]) network.signals[`${x},${y}`] = { green: 6 };
  for (const node of ['2,4', '2,10', '6,1', '14,1']) network.gates[node] = 'entry';
  for (const node of ['18,4', '18,10', '6,13', '14,13']) network.gates[node] = 'exit';
  return network;
}
