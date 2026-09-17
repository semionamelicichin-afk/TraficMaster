import { describe, expect, it } from 'vitest';
import { emptyNetwork } from '../domain/model';
import { buildRoad } from '../editor/roads';
import { setGateway } from '../domain/controls';
import { setZone } from '../domain/zones';
import { removeRoad } from '../domain/graph';
import { Traffic } from './traffic';
import { setSignal } from './signals';

function city() {
  const n = emptyNetwork();
  buildRoad(n, { x: 1, y: 4 }, { x: 7, y: 4 }, 1, false);
  buildRoad(n, { x: 4, y: 2 }, { x: 4, y: 4 }, 1, false);
  setGateway(n, '1,4', 'entry'); setGateway(n, '7,4', 'exit');
  setZone(n, { id: '4,2', x: 4, y: 2, kind: 'retail', capacity: 1, demand: 1 });
  return n;
}
function until(t: Traffic, condition: () => boolean, generate = false) {
  for (let i = 0; i < 4000 && !condition(); i++) t.tick(generate);
  expect(condition()).toBe(true);
}
function visitor(t: Traffic) {
  until(t, () => t.zones.jobs.some(j => j.external), true);
  return t.zones.jobs.find(j => j.external)!;
}
describe('gateway zone visits', () => {
  it('reserves one space, visits and dwells, then completes once at a valid city exit', () => {
    const n = city(), t = new Traffic(n), job = visitor(t);
    expect(job.home).toBe('1,4'); expect(job.homeSlot).toBe(-1);
    expect(t.zones.reservations('4,2')).toBe(1);
    until(t, () => job.phase === 'parked');
    expect(job.leg).toBe('return'); expect(t.zones.externalCompleted).toBe(0);
    for (let i = 0; i < 40; i++) t.tick(false);
    expect(job.phase).toBe('parked');
    until(t, () => job.phase === 'driving');
    expect(t.cars.find(c => c.id === job.carId)).toMatchObject({ destination: '7,4', cityTrip: true });
    until(t, () => t.zones.externalCompleted === 1);
    for (let i = 0; i < 100; i++) t.tick(false);
    expect(t.zones.externalCompleted).toBe(1); expect(t.zones.jobs).toHaveLength(0);
    expect(t.zones.reservations('4,2')).toBe(0);
  });
  it('does not dispatch without both directed entry and exit access, and bounds pending requests', () => {
    const n = city(); setGateway(n, '7,4', null);
    const t = new Traffic(n); t.advance(30);
    expect(t.zones.jobs).toHaveLength(0); expect([...t.zones.pendingVisitors]).toEqual(['4,2']);
    expect(t.zones.status(n.zones['4,2'])).toContain('No reachable');
    setGateway(n, '7,4', 'exit'); visitor(t);
    for (let i = 0; i < 1000; i++) { t.tick(); expect(t.zones.reservations('4,2')).toBeLessThanOrEqual(1); }
    expect(t.zones.pendingVisitors.size).toBeLessThanOrEqual(1);
  });
  it('keeps a visitor parked until an exit is restored and ignores deletion of the used entry', () => {
    const n = city(), t = new Traffic(n), job = visitor(t);
    setGateway(n, '1,4', null);
    setZone(n, { id: '1,4', x: 1, y: 4, kind: 'residential', capacity: 1, demand: 1 });
    expect(t.zones.reservations('1,4')).toBe(0);
    until(t, () => job.phase === 'parked'); setGateway(n, '7,4', null);
    for (let i = 0; i < 300; i++) t.tick(false);
    expect(job.phase).toBe('parked'); expect(t.zones.reservations('4,2')).toBe(1);
    expect(t.zones.status(n.zones['4,2'])).toContain('city exit');
    delete n.zones['1,4']; n.revision++; setGateway(n, '1,4', 'exit');
    until(t, () => t.zones.externalCompleted === 1);
    expect(t.zones.canceled).toBe(0);
  });
  it('reassigns a removed exit while the visitor is returning on the road', () => {
    const n = city(), t = new Traffic(n), job = visitor(t);
    until(t, () => job.leg === 'return' && job.phase === 'driving');
    setGateway(n, '7,4', null); setGateway(n, '1,4', 'exit');
    until(t, () => t.zones.externalCompleted === 1);
    expect(t.zones.canceled).toBe(0);
  });
  it('keeps a returning road vehicle pending when every exit is removed', () => {
    const n = city(), t = new Traffic(n), job = visitor(t);
    until(t, () => job.leg === 'return' && job.phase === 'driving');
    setGateway(n, '7,4', null);
    for (let i = 0; i < 500; i++) t.tick(false);
    expect(t.zones.externalCompleted).toBe(0); expect(t.zones.canceled).toBe(0);
    expect(t.cars.some(c => c.id === job.carId)).toBe(true);
    setGateway(n, '7,4', 'exit'); until(t, () => t.zones.externalCompleted === 1);
  });
  it('checks the actual exit instead of a repurposed entry zone when allowing arrival', () => {
    const n = city(), t = new Traffic(n), job = visitor(t);
    until(t, () => job.leg === 'return' && job.phase === 'driving');
    setGateway(n, '1,4', null);
    setZone(n, { id: '1,4', x: 1, y: 4, kind: 'residential', capacity: 1, demand: 1 });
    setZone(n, { ...n.zones['4,2'], capacity: 2 });
    const departure = t.departZone('1,4', '4,2')!;
    t.zones.jobs.push({ ...job, id: job.id + 1, external: false, leg: 'outbound', phase: 'leaving',
      carId: departure.id, homeSlot: 0, destinationSlot: 1 });
    const returning = t.cars.find(c => c.id === job.carId)!;
    expect(returning.destination).toBe('7,4'); expect(t.zones.canArrive(returning)).toBe(true);
  });
  it('reassigns an exit whose road is cut even if the exit designation remains', () => {
    const n = city(), t = new Traffic(n), job = visitor(t);
    until(t, () => job.leg === 'return' && job.phase === 'driving');
    removeRoad(n, '5,4|6,4'); setGateway(n, '1,4', 'exit');
    expect(n.gates['7,4']).toBe('exit');
    until(t, () => t.zones.externalCompleted === 1);
  });
  it('cancels an active visit and releases the car when its zone is deleted', () => {
    const n = city(), t = new Traffic(n), job = visitor(t), carId = job.carId;
    delete n.zones['4,2']; n.revision++; t.tick(false);
    expect(t.zones.jobs).toHaveLength(0); expect(t.zones.canceled).toBe(1);
    expect(t.cars.some(c => c.id === carId)).toBe(false);
  });
  it('uses bidirectional gateways and residential zones without creating an internal-home reservation', () => {
    const n = city(); setGateway(n, '1,4', 'both'); setGateway(n, '7,4', null);
    setZone(n, { ...n.zones['4,2'], kind: 'residential' });
    const t = new Traffic(n), job = visitor(t);
    expect(job.external).toBe(true);
    until(t, () => t.zones.externalCompleted === 1);
    expect(t.zones.completed).toBe(0);
  });
  it('remains deterministic at different frame rates and simulation speeds', () => {
    const a = new Traffic(city()), b = new Traffic(city());
    for (let i = 0; i < 3000; i++) a.advance(1 / 60);
    for (let i = 0; i < 750; i++) b.advance(4 / 60);
    expect(a.cars).toEqual(b.cars); expect(a.zones.jobs).toEqual(b.zones.jobs);
    expect(a.zones.externalCompleted).toBe(b.zones.externalCompleted);
  });
  it('keeps visitors and through traffic moving in a sustained mixed run', () => {
    const n = city(); setSignal(n, '4,4', 6);
    const t = new Traffic(n); t.advance(180);
    expect(t.zones.externalCompleted).toBeGreaterThan(1);
    expect(t.completed).toBeGreaterThan(t.zones.externalCompleted * 2);
    expect(t.vehicleCount).toBeLessThanOrEqual(180);
    expect(t.zones.reservations('4,2')).toBeLessThanOrEqual(1);
  });
  it('samples multiple city entries and keeps their parking reservations unique', () => {
    const n = city();
    buildRoad(n, { x: 4, y: 4 }, { x: 4, y: 6 }, 1, false); setGateway(n, '4,6', 'entry');
    setSignal(n, '4,4', 6);
    const t = new Traffic(n), origins = new Set<string>();
    for (let i = 0; i < 3600; i++) {
      t.tick();
      for (const job of t.zones.jobs) if (job.external) origins.add(job.home);
      expect(t.zones.reservations('4,2')).toBeLessThanOrEqual(1);
    }
    expect(origins).toEqual(new Set(['1,4', '4,6']));
  });
});
