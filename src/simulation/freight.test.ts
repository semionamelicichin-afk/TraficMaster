import { describe, expect, it } from 'vitest';
import { defaults, emptyNetwork } from '../domain/model';
import { removeRoad } from '../domain/graph';
import { setZone } from '../domain/zones';
import { vehicles } from '../domain/vehicles';
import { buildRoad } from '../editor/roads';
import { deserialize, serialize } from '../persistence/storage';
import { Traffic } from './traffic';

function city(end = 6, capacity = 1) {
  const n = emptyNetwork();
  buildRoad(n, { x: 2, y: 4 }, { x: end, y: 4 }, 1, false);
  setZone(n, { id: '2,4', x: 2, y: 4, kind: 'warehouse', demand: 1, capacity });
  setZone(n, { id: `${end},4`, x: end, y: 4, kind: 'industrial', demand: 3, capacity });
  return n;
}
function until(t: Traffic, done: () => boolean, generate = false, max = 8000) {
  for (let i = 0; i < max && !done(); i++) t.tick(generate);
  expect(done()).toBe(true);
}
function order(t: Traffic) { until(t, () => t.zones.jobs.length > 0, true); }

describe('warehouse deliveries', () => {
  it('loads a typed truck, unloads once, returns and releases the fleet slot', () => {
    const t = new Traffic(city()), f = t.zones.freight;
    order(t);
    expect(t.zones.jobs[0]).toMatchObject({ vehicleType: 'truck', wait: vehicles.truck.serviceSeconds, phase: 'parked' });
    expect(f.requests.get('6,4')).toMatchObject({ units: 12, delivered: false });
    until(t, () => t.cars.some(c => !c.held));
    expect(t.cars[0]).toMatchObject({ length: 22, vehicleType: 'truck' });
    until(t, () => t.zones.jobs[0].leg === 'return');
    expect(f.completed).toBe(0);
    for (let i = 0; i < 100; i++) t.tick(false);
    expect(f.completed).toBe(0);
    until(t, () => f.completed === 1);
    expect(f.deliveredUnits).toBe(12); expect(f.averageSeconds).toBeGreaterThan(24);
    until(t, () => t.zones.jobs.length === 0);
    expect(f.requests.size).toBe(0); expect(f.completed).toBe(1);
    expect(t.zones.completed).toBe(0); expect(t.zones.visits).toBe(0);
    expect(t.vehicleCount).toBe(0); expect(t.zones.reservations('2,4')).toBe(0);
    until(t, () => f.completed === 2, true);
  });
  it('keeps a single aged request when disconnected and serves it after repair', () => {
    const n = city(), t = new Traffic(n), f = t.zones.freight;
    removeRoad(n, '4,4|5,4');
    for (let i = 0; i < 1500; i++) t.tick();
    expect(f.requests.size).toBe(1); expect(f.waiting).toBe(1); expect(f.delayed).toBe(1);
    expect(f.status(n.zones['6,4'])).toContain('waiting');
    const requestedAt = f.requests.get('6,4')!.requestedAt;
    buildRoad(n, { x: 4, y: 4 }, { x: 5, y: 4 }, 1, false);
    order(t); expect(f.requests.get('6,4')!.requestedAt).toBe(requestedAt);
    until(t, () => f.completed === 1);
    expect(f.averageSeconds).toBeGreaterThan(75);
  });
  it('waits on a disrupted outbound route and never duplicates the assigned order', () => {
    const n = city(), t = new Traffic(n); order(t);
    until(t, () => t.zones.jobs[0].phase === 'driving');
    removeRoad(n, '4,4|5,4');
    for (let i = 0; i < 800; i++) t.tick();
    expect(t.zones.freight.requests.size).toBe(1); expect(t.zones.jobs).toHaveLength(1);
    expect(t.zones.freight.completed).toBe(0);
    buildRoad(n, { x: 4, y: 4 }, { x: 5, y: 4 }, 1, false);
    until(t, () => t.zones.freight.completed === 1);
  });
  it('counts unloading once even while the return route is blocked', () => {
    const n = city(), t = new Traffic(n); order(t);
    until(t, () => t.zones.jobs[0].leg === 'return');
    removeRoad(n, '4,4|5,4');
    for (let i = 0; i < 1500; i++) t.tick();
    expect(t.zones.freight.completed).toBe(1); expect(t.zones.jobs).toHaveLength(1);
    expect(t.zones.jobs[0].phase).toBe('parked');
    buildRoad(n, { x: 4, y: 4 }, { x: 5, y: 4 }, 1, false);
    until(t, () => t.zones.jobs.length === 0);
    expect(t.zones.freight.completed).toBe(1);
  });
  it('requeues an undelivered order after warehouse removal and cancels a deleted destination', () => {
    const n = city(), t = new Traffic(n); order(t);
    const requestedAt = t.zones.freight.requests.get('6,4')!.requestedAt;
    delete n.zones['2,4']; n.revision++; t.tick();
    expect(t.zones.jobs).toHaveLength(0); expect(t.zones.freight.waiting).toBe(1);
    setZone(n, { id: '2,4', x: 2, y: 4, kind: 'warehouse', demand: 1, capacity: 1 }); order(t);
    expect(t.zones.freight.requests.get('6,4')!.requestedAt).toBe(requestedAt);
    delete n.zones['6,4']; n.revision++; t.tick();
    expect(t.zones.jobs).toHaveLength(0); expect(t.zones.freight.requests.size).toBe(0);
    expect(t.vehicleCount).toBe(0); expect(t.zones.freight.completed).toBe(0);
  });
  it('releases delivered work without redelivery when its warehouse changes role', () => {
    const n = city(), t = new Traffic(n); order(t);
    until(t, () => t.zones.freight.completed === 1);
    setZone(n, { ...n.zones['2,4'], kind: 'business' }); t.tick(false);
    expect(t.zones.freight.requests.size).toBe(0); expect(t.zones.freight.completed).toBe(1);
    expect(t.zones.jobs).toHaveLength(0); expect(t.vehicleCount).toBe(0);
  });
  it('shares finite parking with passenger trips and prevents service starvation', () => {
    const n = city(6, 2);
    setZone(n, { ...n.zones['6,4'], kind: 'retail', capacity: 1 });
    buildRoad(n, { x: 4, y: 2 }, { x: 4, y: 4 }, 1, false);
    setZone(n, { id: '4,2', x: 4, y: 2, kind: 'residential', capacity: 1, demand: 3 });
    n.signals['4,4'] = { green: 4 }; n.revision++;
    const t = new Traffic(n);
    for (let i = 0; i < 7000; i++) {
      t.tick();
      expect(t.zones.reservations('6,4')).toBeLessThanOrEqual(1);
      expect(t.zones.freight.requests.size).toBeLessThanOrEqual(1);
      expect(t.cars.filter(c => c.vehicleType === 'truck').length).toBeLessThanOrEqual(1);
      expect(t.vehicleCount).toBeLessThanOrEqual(180);
    }
    expect(t.zones.freight.completed).toBeGreaterThan(1); expect(t.zones.completed).toBeGreaterThan(1);
  });
  it('delivers faster on a shorter route with identical loading and demand', () => {
    const short = new Traffic(city(4)), long = new Traffic(city(10));
    for (const t of [short, long]) { order(t); until(t, () => t.zones.freight.completed === 1); }
    expect(short.zones.freight.averageSeconds).toBeLessThan(long.zones.freight.averageSeconds);
    expect(short.zones.freight.deliveredUnits).toBe(long.zones.freight.deliveredUnits);
  });
  it('keeps long trucks clear of neighboring two-lane roads throughout pocket transfers', () => {
    const n = city(6, 4), t = new Traffic(n); order(t);
    const job = t.zones.jobs[0]; job.homeSlot = 3; job.destinationSlot = 3;
    let samples = 0;
    for (let i = 0; i < 4000 && t.zones.jobs.length; i++) {
      t.tick(false);
      if (!t.zones.jobs.length) break;
      const pose = t.zones.pose(job);
      if (!pose) continue;
      const halfHeight = Math.abs(Math.sin(pose.angle)) * vehicles.truck.length / 2
        + Math.abs(Math.cos(pose.angle)) * vehicles.truck.width / 2;
      expect(Math.abs(pose.y - 4 * 64) + halfHeight).toBeLessThan(64 - 18);
      samples++;
    }
    expect(samples).toBeGreaterThan(100); expect(t.zones.freight.completed).toBe(1);
  });
  it('restores new zone kinds and restarts transient requests after loading', () => {
    const n = city(), t = new Traffic(n); order(t);
    const saved = deserialize(serialize(n, defaults));
    expect(saved.network.zones).toEqual(n.zones);
    const loaded = new Traffic(saved.network);
    expect(loaded.zones.freight.requests.size).toBe(0); order(loaded);
    expect(loaded.zones.jobs[0].vehicleType).toBe('truck');
  });
  it('produces identical freight states at different frame rates and speeds', () => {
    const a = new Traffic(city()), b = new Traffic(city());
    for (let i = 0; i < 6000; i++) a.advance(1 / 60);
    for (let i = 0; i < 1500; i++) b.advance(4 / 60);
    expect(a.zones.jobs).toEqual(b.zones.jobs); expect(a.cars).toEqual(b.cars);
    expect(a.zones.freight.requests).toEqual(b.zones.freight.requests);
    expect(a.zones.freight.completed).toBe(b.zones.freight.completed);
  });
});
