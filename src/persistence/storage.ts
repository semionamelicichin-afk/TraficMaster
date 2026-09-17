import { connectedRoads, validPoint } from '../domain/graph';
import { defaults, emptyNetwork, nodeId, roadId, type Network, type Settings } from '../domain/model';
import { approaches, setGateway, setJunction } from '../domain/controls';
import type { RoadSign } from '../domain/model';
import { validateZone } from '../domain/zones';
import type { Zone } from '../domain/model';

export const SAVE_KEY = 'traffic-flow-manager.v1';
export interface Save { version: 3; network: Network; settings: Settings }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function serialize(network: Network, settings: Settings): string {
  return JSON.stringify({ version: 3, network, settings });
}
export function deserialize(raw: string): Save {
  const fail = (): never => { throw new Error('This save is invalid or uses an unsupported version.'); };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail(); }
  if (!record(value) || ![1, 2, 3].includes(Number(value.version)) || typeof value.version !== 'number' || !record(value.network) || !record(value.settings)) return fail();
  const source = value.network, s = value.settings;
  if (!record(source.nodes) || !record(source.roads) || !record(source.signals)) return fail();
  if (![1, 2, 4].includes(Number(s.speed)) || typeof s.speed !== 'number' || (s.lanes !== 1 && s.lanes !== 2) || typeof s.oneWay !== 'boolean' || typeof s.green !== 'number' || s.green < 2 || s.green > 30) return fail();
  const network = emptyNetwork();
  for (const [id, node] of Object.entries(source.nodes)) {
    if (!record(node) || typeof node.x !== 'number' || typeof node.y !== 'number') return fail();
    const point = { x: node.x, y: node.y };
    if (!validPoint(point) || id !== nodeId(point) || node.id !== id) return fail();
    network.nodes[id] = { id, ...point };
  }
  for (const [id, road] of Object.entries(source.roads)) {
    if (!record(road) || typeof road.a !== 'string' || typeof road.b !== 'string' || (road.lanes !== 1 && road.lanes !== 2) || typeof road.oneWay !== 'boolean') return fail();
    const a = network.nodes[road.a], b = network.nodes[road.b];
    if (!a || !b || id !== roadId(a.id, b.id) || road.id !== id || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) return fail();
    network.roads[id] = { id, a: a.id, b: b.id, lanes: road.lanes, oneWay: road.oneWay };
  }
  for (const [id, signal] of Object.entries(source.signals)) {
    if (!record(signal) || typeof signal.green !== 'number' || signal.green < 2 || signal.green > 30 || connectedRoads(network, id).length < 2) return fail();
    network.signals[id] = { green: signal.green };
  }
  if (value.version === 1) {
    for (const id of Object.keys(network.nodes)) if (connectedRoads(network, id).length === 1) network.gates[id] = 'both';
  } else {
    if (!record(source.gates) || !record(source.junctions)) return fail();
    try {
      for (const [id, gate] of Object.entries(source.gates)) {
        if (gate !== 'entry' && gate !== 'exit' && gate !== 'both') return fail();
        setGateway(network, id, gate);
      }
      for (const [id, control] of Object.entries(source.junctions)) {
        if (!record(control) || !Array.isArray(control.main) || !control.main.every(item => typeof item === 'string') || !record(control.signs)) return fail();
        const arms = approaches(network, id);
        const signs: Record<string, RoadSign> = {};
        for (const [from, sign] of Object.entries(control.signs)) {
          if (!arms.includes(from) || control.main.includes(from) || (sign !== 'stop' && sign !== 'yield')) return fail();
          signs[from] = sign;
        }
        setJunction(network, id, control.main as string[], signs);
      }
    } catch { return fail(); }
  }
  if (value.version === 3) {
    if (!record(source.zones) || Object.keys(source.zones).length > 64) return fail();
    for (const [id, zone] of Object.entries(source.zones)) {
      if (!record(zone) || typeof zone.x !== 'number' || typeof zone.y !== 'number' || typeof zone.kind !== 'string'
        || typeof zone.capacity !== 'number' || typeof zone.demand !== 'number' || zone.id !== id) return fail();
      const parsed = { id, x: zone.x, y: zone.y, kind: zone.kind, capacity: zone.capacity, demand: zone.demand } as Zone;
      if (!validateZone(parsed) || network.gates[id]) return fail();
      network.zones[id] = parsed;
    }
  }
  return { version: 3, network, settings: { ...defaults, speed: s.speed as Settings['speed'], lanes: s.lanes, oneWay: s.oneWay, green: s.green } };
}
export function saveCity(storage: Pick<Storage, 'setItem'>, network: Network, settings: Settings): void {
  storage.setItem(SAVE_KEY, serialize(network, settings));
}
export function loadCity(storage: Pick<Storage, 'getItem'>): Save {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) throw new Error('No saved city yet. Build a network and choose Save.');
  return deserialize(raw);
}
