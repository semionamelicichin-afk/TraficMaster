import { describe, expect, it } from 'vitest';
import { emptyNetwork, GRID } from '../domain/model';
import { demoNetwork } from '../domain/demo';
import { buildRoad } from '../editor/roads';
import { removeRoad, updateRoad } from '../domain/graph';
import { carPose, Traffic, GAP } from './traffic';
import { ACCELERATION } from './motion';
import { canEnter, setSignal, signalPhase } from './signals';
import { metrics } from './metrics';

const advance = (t: Traffic, ticks: number) => { for (let i = 0; i < ticks; i++) t.tick(false); };
describe('traffic control', () => {
  it('alternates two phases at exact boundaries and validates junctions', () => {
    expect(signalPhase(6, 0)).toBe('horizontal');
    expect(signalPhase(6, 6)).toBe('vertical');
    expect(signalPhase(6, 12)).toBe('horizontal');
    const n = demoNetwork();
    expect(canEnter(n, '5,4', '6,4', 0)).toBe(true);
    expect(canEnter(n, '6,3', '6,4', 0)).toBe(false);
    expect(() => setSignal(n, '2,4', 6)).toThrow('junction');
    expect(() => setSignal(n, '6,4', 0)).toThrow('between');
    setSignal(n, '6,4', null);
    expect(canEnter(n, '6,3', '6,4', 0)).toBe(true);
  });
  it('queues at red, maintains spacing, and resumes on green', () => {
    const t = new Traffic(demoNetwork());
    const first = t.addCar('6,3', '6,5')!;
    const second = t.addCar('6,3', '6,5')!;
    advance(t, 100);
    expect(first.node).toBe('6,3');
    expect(first.progress).toBeLessThan(GRID);
    expect(first.speed).toBe(0);
    expect(first.progress - second.progress).toBeGreaterThanOrEqual(GAP - 0.001);
    advance(t, 90);
    expect(t.completed).toBeGreaterThan(0);
  });
  it('completes trips and computes metrics with sensible zero values', () => {
    const n = emptyNetwork(); buildRoad(n, { x: 0, y: 0 }, { x: 1, y: 0 }, 1, true);
    const t = new Traffic(n);
    expect(metrics(t, n)).toMatchObject({ count: 0, averageTrip: 0, averageSpeed: 0, congestion: 0 });
    t.addCar('0,0', '1,0'); t.tick(false);
    expect(metrics(t, n)).toMatchObject({ count: 1, queued: 0, congestion: 25, averageSpeed: ACCELERATION * 0.05 * 3.6 });
    advance(t, 65);
    expect(metrics(t, n)).toMatchObject({ count: 0, completed: 1 });
    expect(metrics(t, n).averageTrip).toBeGreaterThan(2);
  });
  it('re-routes around a removed future edge while preserving current progress', () => {
    const n = emptyNetwork();
    const main = buildRoad(n, { x: 0, y: 0 }, { x: 2, y: 0 }, 1, false);
    buildRoad(n, { x: 1, y: 0 }, { x: 1, y: 1 }, 1, false);
    buildRoad(n, { x: 1, y: 1 }, { x: 2, y: 1 }, 1, false);
    buildRoad(n, { x: 2, y: 1 }, { x: 2, y: 0 }, 1, false);
    const t = new Traffic(n), car = t.addCar('0,0', '2,0')!;
    advance(t, 5); const progress = car.progress;
    removeRoad(n, main[1]); t.tick(false);
    expect(car.progress).toBeGreaterThan(progress);
    expect(car.route).toEqual(['0,0', '1,0', '1,1', '2,1', '2,0']);
    advance(t, 220); expect(t.completed).toBe(1);
  });
  it('waits for an unreachable destination and retries after a new connection', () => {
    const n = emptyNetwork();
    const ids = buildRoad(n, { x: 0, y: 0 }, { x: 3, y: 0 }, 1, false);
    const t = new Traffic(n), car = t.addCar('0,0', '3,0')!;
    t.tick(false); removeRoad(n, ids[1]); advance(t, 60);
    expect(car.node).toBe('1,0'); expect(car.next).toBeNull(); expect(t.completed).toBe(0);
    buildRoad(n, { x: 1, y: 0 }, { x: 2, y: 0 }, 1, false);
    advance(t, 120); expect(t.completed).toBe(1);
  });
  it('respects a one-way edit on an occupied edge', () => {
    const n = emptyNetwork(); const ids = buildRoad(n, { x: 0, y: 0 }, { x: 2, y: 0 }, 1, false);
    const t = new Traffic(n), car = t.addCar('2,0', '0,0')!;
    advance(t, 10); updateRoad(n, ids[1], 1, true); t.tick(false);
    expect(car.next).toBeNull(); expect(car.progress).toBe(0);
  });
  it('uses both lanes and keeps cars separated across edge boundaries', () => {
    const n = emptyNetwork(); buildRoad(n, { x: 0, y: 0 }, { x: 3, y: 0 }, 2, true);
    n.signals['2,0'] = { green: 30 };
    const t = new Traffic(n); t.ticks = 600;
    for (let i = 0; i < 12; i++) t.addCar('0,0', '3,0');
    let lanesUsed = false;
    for (let tick = 0; tick < 180; tick++) {
      t.tick(false);
      lanesUsed ||= t.cars.some(c => c.lane === 1 && c.next !== null);
      for (const lane of [0, 1]) {
        const positions = t.cars.filter(c => c.next && c.lane === lane).map(c => carPose(n, c)!.x).sort((a, b) => a - b);
        for (let i = 1; i < positions.length; i++) expect(positions[i] - positions[i - 1]).toBeGreaterThanOrEqual(GAP - 0.001);
      }
    }
    expect(lanesUsed).toBe(true);
  });
  it('produces the same state across different render frame intervals', () => {
    const a = new Traffic(demoNetwork()), b = new Traffic(demoNetwork());
    for (let i = 0; i < 120; i++) a.advance(0.1);
    for (let i = 0; i < 720; i++) b.advance(1 / 60);
    expect(a.ticks).toBe(b.ticks); expect(a.cars).toEqual(b.cars);
    expect(a.completed).toBe(b.completed);
  });
  it('keeps the demo moving during a sustained run', () => {
    const t = new Traffic(demoNetwork());
    t.advance(180);
    expect(t.completed).toBeGreaterThan(20);
    expect(t.cars.length).toBeLessThanOrEqual(180);
  });
});
