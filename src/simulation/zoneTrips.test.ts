import { describe, expect, it } from 'vitest';
import { defaults, emptyNetwork } from '../domain/model';
import { pocketPosition, setZone, zoneAccess } from '../domain/zones';
import { buildRoad } from '../editor/roads';
import { removeRoad, updateRoad } from '../domain/graph';
import { carPose, Traffic } from './traffic';
import { vehicles, type VehicleType } from '../domain/vehicles';
import { deserialize, serialize } from '../persistence/storage';
import { Controller } from '../ui/controller';

function city(capacity = 2) {
  const n = emptyNetwork();
  buildRoad(n, { x: 2, y: 4 }, { x: 6, y: 4 }, 1, false);
  setZone(n, { id: '2,4', x: 2, y: 4, kind: 'residential', demand: 3, capacity });
  setZone(n, { id: '6,4', x: 6, y: 4, kind: 'business', demand: 1, capacity });
  return n;
}
const until = (t: Traffic, condition: () => boolean, max = 4000) => {
  for (let i = 0; i < max && !condition(); i++) t.tick();
  expect(condition()).toBe(true);
};
describe('zone passenger trips', () => {
  it('creates internal trips without gateways, dwells and returns exactly once', () => {
    const n = city(1), t = new Traffic(n);
    until(t, () => t.zones.visits === 1);
    expect(t.zones.jobs[0]).toMatchObject({ phase: 'parked', leg: 'return', carId: null });
    const before = t.cars.length;
    for (let i = 0; i < 100; i++) t.tick(false);
    expect(t.cars.length).toBe(before); expect(t.zones.completed).toBe(0);
    until(t, () => t.zones.completed === 1);
    expect(t.completed).toBe(2); expect(t.zones.visits).toBe(1);
    for (let i = 0; i < 100; i++) t.tick(false);
    expect(t.zones.completed).toBe(1); expect(t.zones.jobs).toHaveLength(0);
  });
  it('bounds reservations and pending demand and keeps every held car attached to an itinerary', () => {
    const n = city(2), t = new Traffic(n);
    for (let i = 0; i < 2500; i++) {
      t.tick();
      for (const zone of Object.values(n.zones)) expect(t.zones.reservations(zone.id)).toBeLessThanOrEqual(zone.capacity);
      expect(t.zones.pending.size).toBeLessThanOrEqual(1);
      expect(new Set(t.zones.jobs.map(j => j.homeSlot)).size).toBe(t.zones.jobs.length);
      expect(new Set(t.zones.jobs.map(j => j.destinationSlot)).size).toBe(t.zones.jobs.length);
      for (const car of t.cars.filter(c => c.held)) expect(t.zones.jobs.filter(j => j.carId === car.id)).toHaveLength(1);
    }
    expect(t.zones.completed).toBeGreaterThan(2);
  });
  it('shows unreachable demand and resumes after restoring an access road', () => {
    const n = city(), t = new Traffic(n);
    removeRoad(n, '4,4|5,4'); t.advance(15);
    expect(t.zones.jobs).toHaveLength(0); expect(t.zones.pending.has('2,4')).toBe(true);
    expect(t.zones.status(n.zones['2,4'])).toContain('No reachable');
    buildRoad(n, { x: 4, y: 4 }, { x: 5, y: 4 }, 1, false);
    until(t, () => t.zones.completed > 0);
  });
  it('keeps a return trip parked during disconnection and cancels deleted destinations', () => {
    const n = city(1), t = new Traffic(n);
    until(t, () => t.zones.visits === 1);
    removeRoad(n, '4,4|5,4'); t.advance(15);
    expect(t.zones.jobs[0]).toMatchObject({ phase: 'parked', leg: 'return' });
    expect(t.zones.completed).toBe(0);
    buildRoad(n, { x: 4, y: 4 }, { x: 5, y: 4 }, 1, false);
    until(t, () => t.zones.jobs[0].phase === 'driving');
    delete n.zones['6,4']; n.revision++; t.tick();
    expect(t.zones.jobs).toHaveLength(0); expect(t.cars).toHaveLength(0); expect(t.zones.canceled).toBe(1);
  });
  it('preserves deterministic trips across render speeds', () => {
    const a = new Traffic(city()), b = new Traffic(city());
    for (let i = 0; i < 2400; i++) a.advance(1 / 60);
    for (let i = 0; i < 600; i++) b.advance(4 / 60);
    expect(a.zones.jobs).toEqual(b.zones.jobs); expect(a.cars).toEqual(b.cars);
    expect(a.zones.completed).toBe(b.zones.completed);
  });
  it('keeps a vehicle visible through parking transfers without position jumps or overlapping spaces', () => {
    const n = city(4), t = new Traffic(n), previous = new Map<number, { x: number; y: number }>();
    for (let tick = 0; tick < 2000; tick++) {
      t.tick();
      const parked = t.zones.jobs.filter(j => j.phase === 'parked').map(j => t.zones.pose(j)!);
      for (let a = 0; a < parked.length; a++) for (let b = a + 1; b < parked.length; b++) {
        expect(Math.abs(parked[a].x - parked[b].x) >= 11 || Math.abs(parked[a].y - parked[b].y) >= 5).toBe(true);
      }
      for (const job of t.zones.jobs) {
        const car = t.cars.find(c => c.id === job.carId);
        const pose = t.zones.pose(job) ?? (car ? carPose(n, car) : null);
        expect(pose).not.toBeNull();
        const before = previous.get(job.id);
        if (before) expect(Math.hypot(pose!.x - before.x, pose!.y - before.y)).toBeLessThanOrEqual(1.405);
        previous.set(job.id, pose!);
      }
    }
    expect(t.zones.completed).toBeGreaterThan(0);
  });
  it('protects reserved slots and parks a departure when its access becomes invalid', () => {
    const n = city(2), t = new Traffic(n);
    until(t, () => t.zones.jobs.some(j => j.homeSlot === 1));
    expect(t.zones.canResize('2,4', 1)).toBe(false);
    const job = t.zones.jobs.find(j => j.homeSlot === 1)!;
    until(t, () => job.phase === 'leaving');
    updateRoad(n, '2,4|3,4', 1, true); t.tick();
    expect(job.phase).toBe('parked'); expect(job.carId).toBeNull(); expect(job.transfer).toBeNull();
    updateRoad(n, '2,4|3,4', 1, false);
    until(t, () => job.phase === 'driving');
  });
  it('includes parked vehicles in the existing global vehicle limit', () => {
    const n = city(), t = new Traffic(n);
    until(t, () => t.zones.jobs.length === 1);
    expect(t.vehicleCount).toBe(1);
    for (let i = 0; i < 200; i++) t.addCar('2,4', '6,4');
    expect(t.vehicleCount).toBe(180);
    expect(t.addVehicle('bus', '2,4', '6,4')).toBeNull();
    for (let i = 0; i < 100; i++) { t.tick(); expect(t.vehicleCount).toBeLessThanOrEqual(180); }
  });
});
describe('zone editor and saves', () => {
  it('keeps all four parking spaces clear of a neighboring two-lane road', () => {
    const n = city(4);
    buildRoad(n, { x: 1, y: 3 }, { x: 3, y: 3 }, 2, false);
    for (let slot = 0; slot < 4; slot++) {
      const point = pocketPosition(n, n.zones['2,4'], slot);
      // Include the car's half length while it travels along the parking aisle.
      expect(point.y - 5.5).toBeGreaterThan(3 * 64 + 18);
    }
  });
  it('validates endpoints, gateway separation and one-way access', () => {
    const n = city();
    expect(() => setZone(n, { id: '3,4', x: 3, y: 4, kind: 'retail', demand: 1, capacity: 1 })).toThrow('endpoint');
    updateRoad(n, '2,4|3,4', 1, true);
    expect(zoneAccess(n, n.zones['2,4'])).toContain('entry');
    expect(() => setZone(n, { ...n.zones['2,4'], capacity: 8 })).toThrow('parking');
  });
  it('migrates v1/v2, saves v3 zones including disconnected access, and rejects malformed zones', () => {
    const n = city(); removeRoad(n, '2,4|3,4');
    const saved = deserialize(serialize(n, defaults));
    expect(saved.version).toBe(3); expect(saved.network.zones).toEqual(n.zones);
    for (const version of [1, 2]) expect(deserialize(JSON.stringify({ version, network: n, settings: defaults })).network.zones).toEqual({});
    for (const capacity of [0, 5, 1.5]) {
      n.zones['2,4'].capacity = capacity;
      expect(() => deserialize(serialize(n, defaults))).toThrow('invalid');
    }
  });
  it('includes creation, edits and removal in undo/redo', () => {
    const c = new Controller(); c.replace(city()); c.selection = { kind: 'node', id: '6,4' };
    c.zone('retail', 3, 2); expect(c.network.zones['6,4'].kind).toBe('retail');
    c.undo(); expect(c.network.zones['6,4'].kind).toBe('business');
    c.undo(true); expect(c.network.zones['6,4'].capacity).toBe(3);
    c.removeZone(); expect(c.network.zones['6,4']).toBeUndefined();
    c.undo(); expect(c.network.zones['6,4'].kind).toBe('retail');
  });
});
describe('vehicle profiles', () => {
  it.each(Object.keys(vehicles) as VehicleType[])('applies the %s dimensions and motion limits', type => {
    const n = emptyNetwork(); buildRoad(n, { x: 0, y: 0 }, { x: 4, y: 0 }, 1, true);
    const t = new Traffic(n), car = t.addVehicle(type, '0,0', '4,0')!;
    expect(car.length).toBe(vehicles[type].length);
    for (let i = 0; i < 400 && t.cars.includes(car); i++) {
      t.tick(false); expect(car.speed).toBeLessThanOrEqual(vehicles[type].speed + 1e-8);
    }
    expect(t.completed).toBe(1);
  });
});
