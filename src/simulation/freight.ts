import type { Zone } from '../domain/model';
import { freightDestination } from '../domain/zones';
import { vehicles } from '../domain/vehicles';
import type { Traffic } from './traffic';

export interface DeliveryRequest {
  destination: string; requestedAt: number; units: number; tripId: number | null; delivered: boolean;
}

/** One outstanding request per destination, retained until its truck returns. */
export class Freight {
  requests = new Map<string, DeliveryRequest>();
  completed = 0;
  deliveredUnits = 0;
  totalDeliveryTime = 0;
  private due = new Map<string, number>();
  constructor(private traffic: Traffic) {}
  get waiting(): number { return [...this.requests.values()].filter(r => r.tripId === null).length; }
  get delayed(): number { return [...this.requests.values()].filter(r => !r.delivered && this.traffic.time - r.requestedAt >= 60).length; }
  get averageSeconds(): number { return this.completed ? this.totalDeliveryTime / this.completed : 0; }
  prepare(generate: boolean): void {
    const zones = this.traffic.network.zones;
    for (const id of this.due.keys()) if (!zones[id] || !freightDestination(zones[id])) this.due.delete(id);
    for (const [id] of this.requests) if (!zones[id] || !freightDestination(zones[id])) this.requests.delete(id);
    if (!generate) return;
    for (const zone of Object.values(zones).filter(freightDestination).sort((a, b) => a.id.localeCompare(b.id))) {
      if (!this.requests.has(zone.id) && this.traffic.time >= (this.due.get(zone.id) ?? 2)) {
        this.requests.set(zone.id, { destination: zone.id, requestedAt: this.traffic.time,
          units: Math.min(vehicles.truck.capacity, zone.demand * 4), tripId: null, delivered: false });
      }
    }
  }
  dispatch(): void {
    const requests = [...this.requests.values()].filter(r => r.tripId === null)
      .sort((a, b) => a.requestedAt - b.requestedAt || a.destination.localeCompare(b.destination));
    for (const request of requests) request.tripId = this.traffic.zones.startFreight(request.destination);
  }
  deliver(tripId: number): void {
    const request = [...this.requests.values()].find(r => r.tripId === tripId);
    if (!request || request.delivered) return;
    request.delivered = true; this.completed++; this.deliveredUnits += request.units;
    this.totalDeliveryTime += this.traffic.time - request.requestedAt;
  }
  release(tripId: number): void {
    const request = [...this.requests.values()].find(r => r.tripId === tripId);
    if (!request) return;
    if (!request.delivered) { request.tripId = null; return; }
    this.requests.delete(request.destination);
    const zone = this.traffic.network.zones[request.destination];
    if (zone) this.due.set(zone.id, this.traffic.time + 30 / zone.demand);
  }
  status(zone: Zone): string {
    if (zone.kind === 'warehouse') {
      const active = this.traffic.zones.jobs.filter(j => j.vehicleType === 'truck' && j.home === zone.id).length;
      return `Warehouse: ${active} / ${zone.capacity} trucks assigned. Truck capacity: ${vehicles.truck.capacity} units.`;
    }
    if (!freightDestination(zone)) return '';
    const request = this.requests.get(zone.id);
    if (!request) return 'Freight: ready for the next order.';
    const age = Math.floor(this.traffic.time - request.requestedAt);
    const state = request.delivered ? 'delivered; truck returning' : request.tripId === null ? 'waiting for a warehouse, route and free spaces' : 'loading or delivering';
    return `Freight: ${request.units} / ${vehicles.truck.capacity} units, ${state}. ${age}s since order${!request.delivered && age >= 60 ? ' (delayed)' : ''}.`;
  }
}
