import { connectedRoads, edge, validPoint } from './graph';
import { GRID, nodeId, type Network, type Point, type Zone } from './model';
import { findRoute } from './routing';

export const zoneColors = { residential: 0x54b996, business: 0x6799d1, retail: 0xdca45b, warehouse: 0xb18cda, industrial: 0xc78d79 };
export const passengerZone = (zone: Zone): boolean => ['residential', 'business', 'retail'].includes(zone.kind);
export const freightDestination = (zone: Zone): boolean => zone.kind === 'retail' || zone.kind === 'industrial';
export function validateZone(zone: Zone): boolean {
  return validPoint(zone) && zone.id === nodeId(zone) && Object.hasOwn(zoneColors, zone.kind)
    && Number.isInteger(zone.capacity) && zone.capacity >= 1 && zone.capacity <= 4
    && Number.isInteger(zone.demand) && zone.demand >= 1 && zone.demand <= 3;
}
export function zoneAccess(network: Network, zone: Zone): string | null {
  if (!network.nodes[zone.id]) return 'Disconnected: rebuild the access road.';
  const roads = connectedRoads(network, zone.id);
  if (roads.length !== 1) return 'Needs a dedicated road endpoint.';
  if (network.gates[zone.id]) return 'Remove the city gateway to use this access.';
  const road = roads[0], other = road.a === zone.id ? road.b : road.a;
  if (!edge(network, other, zone.id)) return 'No permitted entry direction.';
  if (!edge(network, zone.id, other)) return 'No permitted exit direction.';
  return null;
}
export function setZone(network: Network, zone: Zone): void {
  if (!validateZone(zone)) throw new Error('Choose a valid zone, 1–4 parking spaces and demand 1–3.');
  if (!network.zones[zone.id]) {
    if (Object.keys(network.zones).length >= 64) throw new Error('This city supports up to 64 zones.');
    const error = zoneAccess(network, zone); if (error) throw new Error(error);
  }
  network.zones[zone.id] = { ...zone }; network.revision++;
}
export function zoneRoute(network: Network, from: Zone, to: Zone): boolean {
  return from.id !== to.id && !zoneAccess(network, from) && !zoneAccess(network, to)
    && !!findRoute(network, from.id, to.id) && !!findRoute(network, to.id, from.id);
}
export function pocketPosition(network: Network, zone: Zone, slot: number): Point {
  const road = connectedRoads(network, zone.id)[0];
  const other = road ? network.nodes[road.a === zone.id ? road.b : road.a] : undefined;
  const dx = other ? zone.x - other.x : 1, dy = other ? zone.y - other.y : 0;
  // Freight pockets leave room for a long body turning beside the outermost slot.
  const freight = zone.kind === 'warehouse' || freightDestination(zone);
  const forward = freight ? 24 : 18, lateral = (freight ? 15 : 21) + slot * 6;
  return { x: zone.x * GRID + dx * forward - dy * lateral, y: zone.y * GRID + dy * forward + dx * lateral };
}
export function pocketDirection(network: Network, zone: Zone): Point {
  const road = connectedRoads(network, zone.id)[0];
  const other = road ? network.nodes[road.a === zone.id ? road.b : road.a] : undefined;
  return other ? { x: zone.x - other.x, y: zone.y - other.y } : { x: 1, y: 0 };
}
