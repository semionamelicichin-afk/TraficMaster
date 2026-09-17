import { type Point, type Zone } from '../domain/model';
import { lanePosition } from '../domain/lanes';
import { freightDestination, passengerZone, pocketDirection, pocketPosition, zoneAccess, zoneRoute } from '../domain/zones';
import type { Pose } from '../domain/junctionGeometry';
import { vehicles } from '../domain/vehicles';
import type { Car, Traffic } from './traffic';
import { findRoute } from '../domain/routing';
import { Freight } from './freight';

export interface ZoneTrip {
  id: number; home: string; destination: string; homeSlot: number; destinationSlot: number;
  leg: 'outbound' | 'return'; phase: 'parked' | 'leaving' | 'driving' | 'arriving';
  carId: number | null; wait: number; finished: boolean;
  transfer: { from: Point; via: Point; to: Point; elapsed: number; duration: number } | null;
  external: boolean;
  vehicleType: 'car' | 'truck';
}
export class ZoneTrips {
  readonly freight: Freight;
  jobs: ZoneTrip[] = [];
  completed = 0;
  visits = 0;
  canceled = 0;
  externalCompleted = 0;
  pendingVisitors = new Set<string>();
  private visitorDue = new Map<string, number>();
  private gatewayRoutes = new Map<string, { entries: string[]; exits: string[] }>();
  pending = new Set<string>();
  private due = new Map<string, number>();
  private serial = 0;
  private preferVisitors = false;
  private preferFreight = true;
  private revision = -1;
  private routes = new Map<string, boolean>();
  constructor(private traffic: Traffic) { this.freight = new Freight(traffic); }
  private get network() { return this.traffic.network; }
  private connected(from: Zone, to: Zone): boolean {
    this.refreshRoutes();
    const key = `${from.id}>${to.id}`;
    if (!this.routes.has(key)) this.routes.set(key, zoneRoute(this.network, from, to));
    return this.routes.get(key)!;
  }
  private refreshRoutes(): void {
    if (this.revision !== this.network.revision) {
      this.routes.clear(); this.gatewayRoutes.clear(); this.revision = this.network.revision;
    }
  }
  private gateways(zone: Zone): { entries: string[]; exits: string[] } {
    this.refreshRoutes();
    if (!this.gatewayRoutes.has(zone.id)) {
      const gates = Object.keys(this.network.gates).sort();
      this.gatewayRoutes.set(zone.id, zoneAccess(this.network, zone) ? { entries: [], exits: [] } : {
        entries: gates.filter(id => this.network.gates[id] !== 'exit' && findRoute(this.network, id, zone.id)),
        exits: gates.filter(id => this.network.gates[id] !== 'entry' && findRoute(this.network, zone.id, id)),
      });
    }
    return this.gatewayRoutes.get(zone.id)!;
  }
  reservations(id: string): number { return this.jobs.filter(j => (!j.external && j.home === id) || j.destination === id).length; }
  canResize(id: string, capacity: number): boolean {
    return this.jobs.every(j => (j.external || j.home !== id || j.homeSlot < capacity) && (j.destination !== id || j.destinationSlot < capacity));
  }
  private freeSlot(zone: Zone): number | null {
    const used = this.jobs.map(j => !j.external && j.home === zone.id ? j.homeSlot : j.destination === zone.id ? j.destinationSlot : -1);
    for (let slot = 0; slot < zone.capacity; slot++) if (!used.includes(slot)) return slot;
    return null;
  }
  currentZone(job: ZoneTrip): string {
    const source = job.leg === 'outbound' ? job.home : job.destination;
    const target = job.leg === 'outbound' ? job.destination : job.home;
    return job.phase === 'arriving' || job.finished ? target : source;
  }
  private busy(id: string): boolean {
    return this.jobs.some(j => (j.phase === 'arriving' || j.phase === 'leaving') && this.currentZone(j) === id);
  }
  status(zone: Zone): string {
    const error = zoneAccess(this.network, zone); if (error) return error;
    if (!passengerZone(zone)) return 'Connected: service access available.';
    const others = Object.values(this.network.zones).filter(z => passengerZone(z) && (zone.kind === 'residential' ? z.kind !== 'residential' : z.kind === 'residential'));
    const gateways = this.gateways(zone);
    if (this.jobs.some(j => j.external && j.destination === zone.id && j.leg === 'return' && j.phase === 'parked') && !gateways.exits.length) return 'Waiting for a reachable city exit.';
    if (!others.some(z => this.connected(zone, z)) && !(gateways.entries.length && gateways.exits.length)) return 'No reachable home/work/shop round trip or city visit.';
    return this.pending.has(zone.id) || this.pendingVisitors.has(zone.id) ? 'Waiting for parking or an available route.' : 'Connected: entry and exit available.';
  }
  canArrive(car: Car): boolean {
    const job = this.jobs.find(j => j.carId === car.id);
    return !job || !this.busy(car.destination);
  }
  arrive(car: Car, point: Point): void {
    const job = this.jobs.find(j => j.carId === car.id);
    if (!job) return;
    if (job.external && job.leg === 'return') {
      this.externalCompleted++; this.jobs = this.jobs.filter(j => j.id !== job.id); return;
    }
    const id = job.leg === 'outbound' ? job.destination : job.home;
    const zone = this.network.zones[id];
    if (!zone) { this.cancel(job); return; }
    job.carId = null; job.phase = 'arriving';
    this.transfer(job, point, pocketPosition(this.network, zone, job.leg === 'outbound' ? job.destinationSlot : job.homeSlot));
  }
  private transfer(job: ZoneTrip, from: Point, to: Point): void {
    const zone = this.network.zones[this.currentZone(job)], direction = pocketDirection(this.network, zone);
    const slot = zone.id === job.home ? job.homeSlot : job.destinationSlot;
    const parked = pocketPosition(this.network, zone, slot);
    const via = { x: parked.x - direction.x * 18, y: parked.y - direction.y * 18 };
    job.transfer = { from, via, to, elapsed: 0, duration: (Math.hypot(via.x - from.x, via.y - from.y) + Math.hypot(to.x - via.x, to.y - via.y)) / 12 };
  }
  pose(job: ZoneTrip): Pose | null {
    if (job.phase === 'driving') return null;
    if (job.transfer) {
      const { from, via, to } = job.transfer;
      const first = Math.hypot(via.x - from.x, via.y - from.y), second = Math.hypot(to.x - via.x, to.y - via.y);
      const distance = Math.min(first + second, job.transfer.elapsed * 12);
      const a = distance < first ? from : via, b = distance < first ? via : to;
      const t = distance < first ? distance / first : (distance - first) / second;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    const id = job.finished ? job.home : job.leg === 'outbound' ? job.home : job.destination;
    const zone = this.network.zones[id];
    if (!zone) return null;
    const direction = pocketDirection(this.network, zone);
    return { ...pocketPosition(this.network, zone, id === job.home ? job.homeSlot : job.destinationSlot), angle: Math.atan2(direction.y, direction.x) };
  }
  private cancel(job: ZoneTrip): void {
    if (job.carId !== null) this.traffic.discardCar(job.carId);
    this.jobs = this.jobs.filter(j => j.id !== job.id); this.canceled++;
    if (job.vehicleType === 'truck') this.freight.release(job.id);
  }
  tick(step: number, generate: boolean): void {
    this.freight.prepare(generate);
    for (const id of this.pending) if (this.network.zones[id]?.kind !== 'residential') this.pending.delete(id);
    for (const id of this.due.keys()) if (!this.network.zones[id]) this.due.delete(id);
    for (const id of this.pendingVisitors) if (!this.network.zones[id] || !passengerZone(this.network.zones[id])) this.pendingVisitors.delete(id);
    for (const id of this.visitorDue.keys()) if (!this.network.zones[id]) this.visitorDue.delete(id);
    for (const job of [...this.jobs]) {
      const home = this.network.zones[job.home], destination = this.network.zones[job.destination];
      const rolesValid = destination && (job.vehicleType === 'truck'
        ? home?.kind === 'warehouse' && freightDestination(destination)
        : passengerZone(destination) && (job.external || (home?.kind === 'residential' && destination.kind !== 'residential')));
      if (!rolesValid || (!job.external && (!home || job.homeSlot >= home.capacity))
        || job.destinationSlot >= destination.capacity
        || (job.carId !== null && !this.traffic.cars.some(c => c.id === job.carId))) { this.cancel(job); continue; }
      if (job.external && job.phase === 'driving' && job.leg === 'return') this.reassignExit(job);
      if (job.phase === 'leaving' && ((job.external ? !this.gateways(destination).exits.length : !this.connected(home, destination)) || !this.traffic.cars.find(c => c.id === job.carId)?.next)) {
        this.traffic.discardCar(job.carId!); job.carId = null; job.phase = 'parked'; job.transfer = null; continue;
      }
      if (job.transfer) {
        job.transfer.elapsed += step;
        if (job.transfer.elapsed + 1e-8 < job.transfer.duration) continue;
        job.transfer = null;
        if (job.phase === 'leaving') {
          const car = this.traffic.cars.find(c => c.id === job.carId)!;
          car.held = false; job.phase = 'driving';
        } else {
          job.phase = 'parked';
          if (job.leg === 'outbound') {
            if (job.vehicleType === 'car') this.visits++;
            job.leg = 'return'; job.wait = vehicles[job.vehicleType].serviceSeconds * (destination.kind === 'business' ? 2 : 1);
          } else {
            if (job.vehicleType === 'car') this.completed++;
            job.finished = true; job.wait = 2;
          }
        }
        continue;
      }
      if (job.phase !== 'parked') continue;
      job.wait = Math.max(0, job.wait - step);
      if (job.wait > 1e-8) continue;
      if (job.finished) {
        this.jobs = this.jobs.filter(j => j.id !== job.id);
        if (job.vehicleType === 'truck') this.freight.release(job.id);
        continue;
      }
      if (job.vehicleType === 'truck' && job.leg === 'return') this.freight.deliver(job.id);
      if (job.external) {
        const exits = this.gateways(destination).exits;
        if (!exits.length || this.busy(destination.id)) continue;
        const car = this.traffic.departZone(destination.id, exits.includes(job.home) ? job.home : exits[0]);
        if (!car) continue;
        car.cityTrip = true; job.carId = car.id; job.phase = 'leaving';
        this.transfer(job, pocketPosition(this.network, destination, job.destinationSlot), lanePosition(this.network, car.node, car.next!, car.lane, 0)!);
        continue;
      }
      const source = job.leg === 'outbound' ? home : destination, target = job.leg === 'outbound' ? destination : home;
      if (!this.connected(source, target) || this.busy(source.id)) continue;
      const car = this.traffic.departZone(source.id, target.id, job.vehicleType);
      if (!car) continue;
      job.carId = car.id; job.phase = 'leaving';
      const point = lanePosition(this.network, car.node, car.next!, car.lane, 0)!;
      this.transfer(job, pocketPosition(this.network, source, source.id === home.id ? job.homeSlot : job.destinationSlot), point);
    }
    if (!generate) return;
    const zones = Object.values(this.network.zones).sort((a, b) => a.id.localeCompare(b.id));
    const freightFirst = this.preferFreight;
    if (freightFirst) this.freight.dispatch();
    const visitorsFirst = this.preferVisitors;
    if (visitorsFirst) this.dispatchVisitors(zones);
    for (const home of zones.filter(z => z.kind === 'residential')) {
      if (this.traffic.time < (this.due.get(home.id) ?? 1)) continue;
      const homeSlot = this.freeSlot(home);
      const targets = zones.filter(z => passengerZone(z) && z.kind !== 'residential' && this.connected(home, z) && this.freeSlot(z) !== null);
      if (homeSlot === null || !targets.length || this.jobs.length >= 64 || this.traffic.vehicleCount >= 180) { this.pending.add(home.id); continue; }
      const target = targets[this.serial % targets.length];
      this.jobs.push({ id: ++this.serial, home: home.id, destination: target.id, homeSlot, destinationSlot: this.freeSlot(target)!, leg: 'outbound', phase: 'parked', carId: null, wait: 0.5, finished: false, transfer: null, external: false, vehicleType: 'car' });
      this.pending.delete(home.id); this.due.set(home.id, this.traffic.time + 12 / home.demand);
      this.preferVisitors = true;
      this.preferFreight = true;
    }
    if (!visitorsFirst) this.dispatchVisitors(zones);
    if (!freightFirst) this.freight.dispatch();
  }
  startFreight(destination: string): number | null {
    const target = this.network.zones[destination];
    if (!target || !freightDestination(target) || this.jobs.length >= 64 || this.traffic.vehicleCount >= 180) return null;
    const destinationSlot = this.freeSlot(target);
    if (destinationSlot === null) return null;
    const home = Object.values(this.network.zones).filter(z => z.kind === 'warehouse' && this.freeSlot(z) !== null && this.connected(z, target))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!home) return null;
    const id = ++this.serial;
    this.jobs.push({ id, home: home.id, destination, homeSlot: this.freeSlot(home)!, destinationSlot,
      leg: 'outbound', phase: 'parked', carId: null, wait: vehicles.truck.serviceSeconds,
      finished: false, transfer: null, external: false, vehicleType: 'truck' });
    this.preferFreight = false;
    return id;
  }
  private dispatchVisitors(zones: Zone[]): void {
    for (const zone of zones) {
      if (!passengerZone(zone)) continue;
      if (this.traffic.time < (this.visitorDue.get(zone.id) ?? 3)) continue;
      if (!Object.keys(this.network.gates).length) { this.pendingVisitors.delete(zone.id); continue; }
      const { entries, exits } = this.gateways(zone), slot = this.freeSlot(zone);
      if (slot === null || !entries.length || !exits.length || this.jobs.length >= 64 || this.traffic.vehicleCount >= 180) { this.pendingVisitors.add(zone.id); continue; }
      const entry = entries[this.serial % entries.length];
      if (this.traffic.cars.filter(c => c.node === entry && !c.next).length >= 3) { this.pendingVisitors.add(zone.id); continue; }
      const car = this.traffic.addCar(entry, zone.id);
      if (!car) continue;
      this.jobs.push({ id: ++this.serial, home: entry, destination: zone.id, homeSlot: -1, destinationSlot: slot, external: true,
        leg: 'outbound', phase: 'driving', carId: car.id, wait: 0, finished: false, transfer: null, vehicleType: 'car' });
      this.pendingVisitors.delete(zone.id); this.visitorDue.set(zone.id, this.traffic.time + 18 / zone.demand);
      this.preferVisitors = false;
      this.preferFreight = true;
    }
  }
  private reassignExit(job: ZoneTrip): void {
    const car = this.traffic.cars.find(c => c.id === job.carId)!;
    if (car.crossing) return;
    if (this.network.gates[car.destination] && this.network.gates[car.destination] !== 'entry'
      && (car.route.length > 2 || car.route.at(-1) === car.destination)) return;
    const start = car.next ?? car.node;
    const exit = Object.keys(this.network.gates).sort().find(id => this.network.gates[id] !== 'entry'
      && findRoute(this.network, start, id, car.next ? car.node : undefined));
    if (!exit) return;
    car.destination = exit;
    const route = findRoute(this.network, start, exit, car.next ? car.node : undefined)!;
    car.route = car.next ? [car.node, ...route] : route;
  }
}
