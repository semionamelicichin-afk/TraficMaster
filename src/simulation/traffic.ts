import { connectedRoads, edge } from '../domain/graph';
import { GRID, type Junction, type Network } from '../domain/model';
import { findRoute, gatewayTrips } from '../domain/routing';
import { canEnter } from './signals';
import { junctionControl } from '../domain/controls';
import { goesFirst, stopSatisfied } from './priority';
import { laneConnections, lanePosition, routeLanes, type LaneConnection } from '../domain/lanes';
import { CROSSING_INSET, curvePose, junctionCurve, type Curve, type Pose } from '../domain/junctionGeometry';
import { targetSpeed } from './motion';
import { vehicles, type VehicleType } from '../domain/vehicles';
import { ZoneTrips } from './zoneTrips';

export const STEP = 0.05;
export const GAP = 16;
export const MAX_SPEED = 28;
export const LANE_CHANGE_SECONDS = 0.6;
export interface LaneChange { from: number; to: number; elapsed: number }
export interface Crossing { connection: LaneConnection; curve: Curve; distance: number; inset: number }
export interface Car {
  id: number; origin: string; node: string; next: string | null; destination: string; cityTrip: boolean;
  route: string[]; progress: number; lane: number; born: number; speed: number; stoppedFor: number;
  laneChange: LaneChange | null;
  committedLane: number | null;
  length: number;
  vehicleType: VehicleType;
  held: boolean;
  crossing: Crossing | null;
  clearances: { node: string; remaining: number }[];
}
export const separation = (a: Car, b: Car): number => (a.length + b.length) / 2 + Math.max(vehicles[a.vehicleType].gap, vehicles[b.vehicleType].gap);
export const crossingInset = (car: Car): number => CROSSING_INSET + car.length / 2;
export const stopProgress = (car: Car): number => GRID - crossingInset(car);
export function carPose(network: Network, car: Car): Pose | null {
  if (car.held) return null;
  if (car.crossing) return curvePose(car.crossing.curve, car.crossing.distance);
  if (!car.next) return null;
  const point = lanePosition(network, car.node, car.next, visualLane(car), car.progress);
  if (!point) return null;
  const a = network.nodes[car.node], b = network.nodes[car.next];
  return { ...point, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}
export function occupiedLanes(car: Car): number[] {
  return car.laneChange ? [car.laneChange.from, car.laneChange.to] : [car.lane];
}
export function visualLane(car: Car): number {
  if (!car.laneChange) return car.lane;
  const t = Math.min(1, car.laneChange.elapsed / LANE_CHANGE_SECONDS);
  return car.laneChange.from + (car.laneChange.to - car.laneChange.from) * t * t * (3 - 2 * t);
}
export class Traffic {
  readonly zones = new ZoneTrips(this);
  cars: Car[] = [];
  ticks = 0;
  completed = 0;
  totalTripTime = 0;
  private accumulator = 0;
  private serial = 0;
  private seed = 12345;
  private revision: number;
  private occupied = new Map<string, number>();
  private junctionNodes = new Set<string>();
  private connections = new Map<string, LaneConnection[]>();
  private permittedLanes = new Map<string, number[]>();
  private trips: ReturnType<typeof gatewayTrips> = [];
  private tripsRevision = -1;
  constructor(public network: Network) { this.revision = -1; }
  get time(): number { return this.ticks * STEP; }
  get vehicleCount(): number { return this.cars.length + this.zones.jobs.filter(job => job.carId === null).length; }

  private connectionsFor(from: string, via: string, to: string): LaneConnection[] {
    const key = `${from}>${via}>${to}`;
    if (!this.connections.has(key)) this.connections.set(key, laneConnections(this.network, from, via, to));
    return this.connections.get(key)!;
  }
  private lanesFor(route: string[]): number[] {
    const key = route.slice(0, 3).join('>');
    if (!this.permittedLanes.has(key)) this.permittedLanes.set(key, routeLanes(this.network, route));
    return this.permittedLanes.get(key)!;
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  addCar(start: string, destination: string, cityTrip = false, length = 11, vehicleType: VehicleType = 'car'): Car | null {
    if (!Number.isFinite(length) || length < 5 || length > 26) throw new Error('Vehicle length must be between 5 and 26.');
    const route = findRoute(this.network, start, destination);
    if (!route || route.length < 2 || this.vehicleCount >= 180) return null;
    const car: Car = { id: ++this.serial, origin: start, node: start, next: null, destination, cityTrip, route, progress: 0, lane: 0, born: this.time, speed: 0, stoppedFor: 0, laneChange: null, committedLane: null, length, crossing: null, clearances: [], vehicleType, held: false };
    this.cars.push(car);
    return car;
  }
  addVehicle(type: VehicleType, start: string, destination: string): Car | null {
    return this.addCar(start, destination, false, vehicles[type].length, type);
  }
  departZone(start: string, destination: string, type: VehicleType = 'car'): Car | null {
    const car = this.addVehicle(type, start, destination);
    if (!car) return null;
    const next = car.route[1], lane = this.freeLane(start, next, car.id, this.lanesFor(car.route));
    if (lane === null) { this.discardCar(car.id); return null; }
    car.next = next; car.lane = lane; car.held = true;
    return car;
  }
  discardCar(id: number): void {
    this.cars = this.cars.filter(c => c.id !== id);
    for (const [node, owner] of this.occupied) if (owner === id) this.occupied.delete(node);
  }
  private spawn(): void {
    if (this.tripsRevision !== this.network.revision) {
      this.trips = gatewayTrips(this.network); this.tripsRevision = this.network.revision;
    }
    if (!this.trips.length) return;
    for (let attempt = 0; attempt < 8; attempt++) {
      const { start, destination } = this.trips[Math.floor(this.random() * this.trips.length)];
      if (this.cars.filter(c => c.node === start && !c.next).length >= 3) continue;
      if (this.addCar(start, destination, true)) return;
    }
  }
  private reroute(): void {
    if (this.revision === this.network.revision) return;
    this.revision = this.network.revision;
    this.connections.clear(); this.permittedLanes.clear();
    this.junctionNodes = new Set(Object.keys(this.network.nodes).filter(node => connectedRoads(this.network, node).length >= 3 || this.network.junctions[node] || this.network.signals[node]));
    this.occupied.clear();
    this.cars = this.cars.filter(car => !!this.network.nodes[car.node]);
    for (const car of this.cars) {
      if (car.crossing) {
        const { incoming, outgoing } = car.crossing.connection;
        const valid = this.connectionsFor(incoming.from, incoming.to, outgoing.to)
          .some(c => c.id === car.crossing!.connection.id);
        const updated = valid ? junctionCurve(this.network, car.crossing.connection, car.crossing.inset) : null;
        if (updated && JSON.stringify(updated.points) === JSON.stringify(car.crossing.curve.points)) {
          this.occupied.set(incoming.to, car.id);
          for (const clearance of car.clearances) this.occupied.set(clearance.node, car.id);
          continue;
        }
        car.crossing = null; car.next = null; car.progress = 0; car.committedLane = null; car.clearances = [];
      }
      car.stoppedFor = 0;
      const road = car.next ? edge(this.network, car.node, car.next) : undefined;
      if (!road || occupiedLanes(car).some(lane => lane >= road.lanes)) { car.next = null; car.progress = 0; car.laneChange = null; car.committedLane = null; car.clearances = []; }
      const start = car.next ?? car.node;
      if (car.cityTrip && !this.isExit(car.destination)) {
        const exit = Object.keys(this.network.gates).sort().find(id => this.isExit(id) && findRoute(this.network, start, id));
        if (exit) car.destination = exit;
      }
      const route = (car.cityTrip && !this.isExit(car.destination) ? null : findRoute(this.network, start, car.destination, car.next ? car.node : undefined)) ?? [start];
      car.route = car.next ? [car.node, ...route] : route;
      if (car.next && car.progress > stopProgress(car) && car.route[2]) {
        // An edited movement cannot be changed inside the crossing: reinsert at the last node.
        car.next = null; car.progress = 0; car.laneChange = null; car.committedLane = null; car.clearances = [];
        car.route = findRoute(this.network, car.node, car.destination) ?? [car.node];
      }
      if (!car.route[2]) car.committedLane = null;
      for (const clearance of car.clearances) this.occupied.set(clearance.node, car.id);
    }
  }
  private freeLane(from: string, to: string, except: number, candidates?: number[], progress = 0): number | null {
    const road = edge(this.network, from, to);
    if (!road) return null;
    const entering = this.cars.find(c => c.id === except)!;
    for (const lane of candidates ?? Array.from({ length: road.lanes }, (_, index) => index)) {
      if (!this.cars.some(c => c.id !== except && (
        (c.node === from && c.next === to && occupiedLanes(c).includes(lane) && (c.crossing ? stopProgress(c) : c.progress) < progress + separation(entering, c))
        || (c.crossing?.connection.outgoing.from === from && c.crossing.connection.outgoing.to === to && c.crossing.connection.outgoing.index === lane)))) return lane;
    }
    return null;
  }
  private nextLane(car: Car): number | null {
    const after = car.route[2];
    if (!car.next || !after || car.laneChange) return null;
    if (car.committedLane !== null) return car.committedLane;
    const preferred = this.lanesFor(car.route.slice(1));
    const candidates = this.connectionsFor(car.node, car.next, after)
      .filter(c => c.incoming.index === car.lane).map(c => c.outgoing.index)
      .filter(lane => !this.cars.some(other => other.id !== car.id && other.next === car.next
        && other.route[2] === after && other.committedLane === lane))
      .sort((a, b) => Number(preferred.includes(b)) - Number(preferred.includes(a)) || a - b);
    return this.freeLane(car.next, after, car.id, candidates, crossingInset(car));
  }
  private canChangeLane(car: Car, lane: number): boolean {
    return !this.cars.some(other => {
      if (other.id === car.id || !other.next) return false;
      if (other.node === car.node && other.next === car.next && occupiedLanes(other).includes(lane)) {
        return Math.abs((other.crossing ? stopProgress(other) : other.progress) - car.progress) < separation(car, other) + MAX_SPEED * LANE_CHANGE_SECONDS;
      }
      // Reserve clearance on both adjoining edges as well as the current edge.
      if (other.next === car.node && other.route[2] === car.next && (other.crossing || GRID - other.progress + car.progress < separation(car, other) + MAX_SPEED * LANE_CHANGE_SECONDS)) {
        return this.connectionsFor(other.node, car.node, car.next!)
          .some(c => occupiedLanes(other).includes(c.incoming.index) && c.outgoing.index === lane);
      }
      if (other.node === car.next && other.next === car.route[2] && GRID - car.progress + other.progress < separation(car, other) + MAX_SPEED * LANE_CHANGE_SECONDS) {
        return this.connectionsFor(car.node, car.next!, other.next)
          .some(c => c.incoming.index === lane && occupiedLanes(other).includes(c.outgoing.index));
      }
      return false;
    });
  }
  private prepareLane(car: Car): boolean {
    const permitted = this.lanesFor(car.route);
    if (!car.laneChange && permitted.length && !permitted.includes(car.lane) && car.progress >= crossingInset(car) && car.progress <= stopProgress(car)) {
      const target = permitted.find(lane => this.canChangeLane(car, lane));
      if (target !== undefined) car.laneChange = { from: car.lane, to: target, elapsed: 0 };
    }
    if (car.laneChange) {
      car.stoppedFor = 0;
      car.laneChange.elapsed += STEP;
      if (car.laneChange.elapsed + 1e-9 >= LANE_CHANGE_SECONDS) {
        car.lane = car.laneChange.to; car.laneChange = null;
      }
    }
    return !!car.laneChange || !permitted.includes(car.lane);
  }
  private isExit(node: string): boolean { return this.network.gates[node] === 'exit' || this.network.gates[node] === 'both'; }
  private arrived(car: Car): boolean { return car.node === car.destination && (!car.cityTrip || this.isExit(car.node)); }
  private complete(car: Car, position?: Pose | null): void {
    this.completed++; this.totalTripTime += this.time - car.born;
    this.zones.arrive(car, position ?? { x: this.network.nodes[car.node].x * GRID, y: this.network.nodes[car.node].y * GRID });
    this.cars = this.cars.filter(c => c.id !== car.id);
    for (const [node, owner] of this.occupied) if (owner === car.id) this.occupied.delete(node);
  }
  private clearRear(car: Car, distance: number): void {
    for (const clearance of car.clearances) {
      clearance.remaining -= distance;
      if (clearance.remaining <= 1e-8 && this.occupied.get(clearance.node) === car.id) this.occupied.delete(clearance.node);
    }
    car.clearances = car.clearances.filter(c => c.remaining > 1e-8);
  }
  private cross(car: Car, distance: number): void {
    const crossing = car.crossing!;
    const moved = Math.min(distance, crossing.curve.length - crossing.distance);
    crossing.distance += moved;
    this.clearRear(car, moved);
    car.speed = moved / STEP;
    car.progress = stopProgress(car) + crossing.inset * crossing.distance / crossing.curve.length;
    if (crossing.distance + 1e-8 < crossing.curve.length) return;
    car.node = crossing.connection.outgoing.from; car.next = crossing.connection.outgoing.to;
    car.lane = crossing.connection.outgoing.index; car.progress = crossing.inset;
    if (car.cityTrip && !this.isExit(car.destination)) {
      const exit = Object.keys(this.network.gates).sort().find(id => this.isExit(id) && findRoute(this.network, car.next!, id, car.node));
      if (exit) car.destination = exit;
    }
    const route = (car.cityTrip && !this.isExit(car.destination) ? null : findRoute(this.network, car.next, car.destination, car.node)) ?? [car.next];
    car.route = [car.node, ...route]; car.stoppedFor = 0; car.committedLane = null; car.crossing = null;
    car.clearances.push({ node: car.node, remaining: car.length / 2 });
  }
  private priorityBlocked(car: Car, control: Junction): boolean {
    if (!stopSatisfied(control, car.node, car.stoppedFor)) return true;
    return this.cars.some(other => {
      if (other.id === car.id || other.node === car.node || other.next !== car.next || other.progress < GRID - GAP * 2) return false;
      if (!stopSatisfied(control, other.node, other.stoppedFor)) return false;
      const after = other.route[2];
      if (after && this.nextLane(other) === null) return false;
      return goesFirst(control, other, car);
    });
  }
  advance(seconds: number): void {
    this.accumulator += seconds;
    while (this.accumulator + 1e-9 >= STEP) { this.tick(); this.accumulator -= STEP; }
  }
  tick(generate = true): void {
    this.reroute();
    this.ticks++;
    this.zones.tick(STEP, generate);
    if (generate && this.ticks % 14 === 0) this.spawn();
    const controls = new Map<string, Junction>();
    for (const car of [...this.cars].sort((a, b) => b.progress - a.progress || a.id - b.id)) {
      if (car.held) continue;
      const profile = vehicles[car.vehicleType];
      if (car.crossing) { this.cross(car, targetSpeed(car.speed, Infinity, profile.speed, STEP, profile.acceleration, profile.braking) * STEP); continue; }
      if (car.progress >= stopProgress(car) - 1e-8 && car.speed < 0.01) car.stoppedFor += STEP;
      const previousSpeed = car.speed;
      car.speed = 0;
      if (!car.next) {
        if (this.arrived(car)) { this.complete(car); continue; }
        const next = car.route[1];
        if (!next) continue;
        const lane = this.freeLane(car.node, next, car.id, this.lanesFor(car.route));
        if (lane === null) continue;
        car.next = next; car.lane = lane;
      }
      const preparingLane = this.prepareLane(car);
      const before = car.progress;
      let limit = GRID;
      if (car.next === car.destination && !this.zones.canArrive(car)) limit = GRID - car.length / 2 - profile.gap;
      for (const other of this.cars) {
        if (other.id !== car.id && other.node === car.node && other.next === car.next && occupiedLanes(other).some(lane => occupiedLanes(car).includes(lane)) && other.progress > car.progress) {
          limit = Math.min(limit, (other.crossing ? stopProgress(other) : other.progress) - separation(car, other));
        }
        if (other.node === car.next && other.next === car.route[2] && this.connectionsFor(car.node, car.next, other.next).some(c => occupiedLanes(car).includes(c.incoming.index) && occupiedLanes(other).includes(c.outgoing.index))) {
          limit = Math.min(limit, GRID + (other.crossing ? stopProgress(other) : other.progress) - separation(car, other));
        }
      }
      const junction = this.junctionNodes.has(car.next);
      let priorityBlocked = false;
      if (junction && !this.network.signals[car.next]) {
        if (!controls.has(car.next)) controls.set(car.next, junctionControl(this.network, car.next));
        priorityBlocked = this.priorityBlocked(car, controls.get(car.next)!);
      }
      const after = car.route[2];
      const nextLane = after ? this.nextLane(car) : null;
      const blocked = !canEnter(this.network, car.node, car.next, this.time)
        || priorityBlocked
        || (this.occupied.has(car.next) && this.occupied.get(car.next) !== car.id)
        || preparingLane || (!!after && nextLane === null);
      if (blocked) limit = Math.min(limit, stopProgress(car));
      const clearance = limit < GRID ? Math.max(0, limit - before) : Infinity;
      const speed = targetSpeed(previousSpeed, clearance, profile.speed, STEP, profile.acceleration, profile.braking);
      const travel = clearance < 0.02 ? clearance : speed * STEP;
      if (after) limit = Math.min(limit, stopProgress(car));
      car.progress = Math.max(before, Math.min(before + travel, limit));
      car.speed = (car.progress - before) / STEP;
      this.clearRear(car, car.progress - before);
      if (!blocked && after && nextLane !== null && car.progress >= stopProgress(car)) {
        const connection = this.connectionsFor(car.node, car.next, after).find(c => c.incoming.index === car.lane && c.outgoing.index === nextLane)!;
        const inset = crossingInset(car);
        car.crossing = { connection, curve: junctionCurve(this.network, connection, inset), distance: 0, inset };
        car.committedLane = nextLane; this.occupied.set(car.next, car.id);
        const approachTravel = car.progress - before;
        const remaining = travel - approachTravel;
        if (remaining > 0) { this.cross(car, remaining); car.speed += approachTravel / STEP; }
      }
      if (car.progress >= GRID) {
        const position = carPose(this.network, car);
        car.node = car.next; car.next = null; car.progress = 0; car.stoppedFor = 0; car.committedLane = null; car.route.shift();
        if (this.arrived(car)) {
          this.complete(car, position);
        } else if (after && nextLane !== null) { car.next = after; car.lane = nextLane; }
      }
    }
  }
}
