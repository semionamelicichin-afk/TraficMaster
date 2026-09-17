import { describe, expect, it } from 'vitest';
import { emptyNetwork, type Network } from '../domain/model';
import { buildRoad } from '../editor/roads';
import { removeRoad } from '../domain/graph';
import { laneConnections, lanePosition } from '../domain/lanes';
import { curvePose, junctionCurve } from '../domain/junctionGeometry';
import { ACCELERATION, targetSpeed } from './motion';
import { carPose, crossingInset, MAX_SPEED, separation, STEP, stopProgress, Traffic, type Car } from './traffic';
import { setSignal } from './signals';

const ticks = (t: Traffic, count: number) => { for (let i = 0; i < count; i++) t.tick(false); };
function until(t: Traffic, condition: () => boolean, maximum = 500) {
  for (let i = 0; i < maximum && !condition(); i++) t.tick(false);
  expect(condition()).toBe(true);
}
function crossing() {
  const n = emptyNetwork();
  buildRoad(n, { x: 0, y: 2 }, { x: 4, y: 2 }, 1, false);
  buildRoad(n, { x: 2, y: 0 }, { x: 2, y: 4 }, 1, false);
  return n;
}
function bodiesOverlap(n: Network, a: Car, b: Car): boolean {
  const pa = carPose(n, a)!, pb = carPose(n, b)!;
  const axes = [pa.angle, pa.angle + Math.PI / 2, pb.angle, pb.angle + Math.PI / 2];
  return axes.every(angle => {
    const distance = Math.abs((pa.x - pb.x) * Math.cos(angle) + (pa.y - pb.y) * Math.sin(angle));
    const radiusA = a.length / 2 * Math.abs(Math.cos(pa.angle - angle)) + 2.5 * Math.abs(Math.sin(pa.angle - angle));
    const radiusB = b.length / 2 * Math.abs(Math.cos(pb.angle - angle)) + 2.5 * Math.abs(Math.sin(pb.angle - angle));
    return distance < radiusA + radiusB - 1e-6;
  });
}

describe('physical crossing paths', () => {
  it.each(['2,1', '3,2', '2,3'])('joins road positions and tangents continuously toward %s', to => {
    const n = crossing(), connection = laneConnections(n, '1,2', '2,2', to)[0];
    const curve = junctionCurve(n, connection, 29);
    expect(curvePose(curve, 0)).toMatchObject(lanePosition(n, '1,2', '2,2', 0, 35)!);
    expect(curvePose(curve, curve.length)).toMatchObject(lanePosition(n, '2,2', to, 0, 29)!);
    expect(curvePose(curve, 0).angle).toBeCloseTo(0);
    const end = n.nodes[to];
    expect(curvePose(curve, curve.length).angle).toBeCloseTo(Math.atan2(end.y - 2, end.x - 2));
    for (let distance = 1; distance < curve.length; distance++) {
      const a = curvePose(curve, distance - 1), b = curvePose(curve, distance);
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(1.002);
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(0.995);
    }
  });

  it.each([11, 26])('moves a length-%i vehicle around turns without position jumps', length => {
    const n = crossing(), t = new Traffic(n), car = t.addCar('0,2', '2,4', false, length)!;
    let previous: ReturnType<typeof carPose> = null, curved = false, angled = false;
    for (let i = 0; i < 500 && !t.completed; i++) {
      t.tick(false);
      const pose = carPose(n, car);
      if (pose && previous) expect(Math.hypot(pose.x - previous.x, pose.y - previous.y)).toBeLessThanOrEqual(MAX_SPEED * STEP + 0.005);
      if (car.crossing?.connection.movement === 'right') {
        curved = true;
        angled ||= pose!.angle > 0.1 && pose!.angle < Math.PI / 2 - 0.1;
      }
      previous = pose;
    }
    expect(curved && angled).toBe(true); expect(t.completed).toBe(1);
  });

  it('holds the crossing while the rear of a long vehicle is blocked beyond the exit', () => {
    const n = crossing(); setSignal(n, '3,2', 30);
    const t = new Traffic(n); t.ticks = 600;
    const main = t.addCar('1,2', '4,2', false, 26)!, minor = t.addCar('2,1', '2,3')!;
    main.next = '2,2'; main.progress = stopProgress(main);
    minor.next = '2,2'; minor.progress = stopProgress(minor);
    until(t, () => main.node === '2,2' && main.speed === 0);
    expect(main.progress).toBe(stopProgress(main));
    expect(main.clearances.some(c => c.node === '2,2' && c.remaining > 0)).toBe(true);
    ticks(t, 60);
    expect(minor.crossing).toBeNull(); expect(minor.progress).toBe(stopProgress(minor));
    setSignal(n, '3,2', null);
    until(t, () => minor.crossing !== null);
    expect(main.clearances.some(c => c.node === '2,2')).toBe(false);
    until(t, () => t.completed === 2);
  });

  it('does not admit conflicting movements even when a signal changes mid-turn', () => {
    const n = crossing(); setSignal(n, '2,2', 2);
    const t = new Traffic(n); t.ticks = 35;
    const main = t.addCar('1,2', '2,3', false, 26)!, minor = t.addCar('2,1', '3,2')!;
    main.next = '2,2'; main.progress = stopProgress(main);
    minor.next = '2,2'; minor.progress = stopProgress(minor);
    let changedDuringCrossing = false;
    for (let i = 0; i < 220; i++) {
      t.tick(false);
      if (main.crossing && t.time >= 2) changedDuringCrossing = true;
      expect(t.cars.filter(c => c.crossing?.connection.incoming.to === '2,2').length).toBeLessThanOrEqual(1);
    }
    expect(changedDuringCrossing).toBe(true); expect(t.completed).toBe(2);
  });

  it('keeps mixed-length queues separated on straights and across their connectors', () => {
    const n = emptyNetwork(); buildRoad(n, { x: 0, y: 0 }, { x: 4, y: 0 }, 1, true);
    setSignal(n, '3,0', 30);
    const t = new Traffic(n); t.ticks = 600;
    for (const length of [26, 11, 26, 11, 11]) t.addCar('0,0', '4,0', false, length);
    for (let i = 0; i < 400; i++) {
      t.tick(false);
      const active = t.cars.filter(c => c.next).sort((a, b) => carPose(n, a)!.x - carPose(n, b)!.x);
      for (let j = 1; j < active.length; j++) {
        expect(carPose(n, active[j])!.x - carPose(n, active[j - 1])!.x).toBeGreaterThanOrEqual(separation(active[j], active[j - 1]) - 1e-6);
      }
    }
    const leader = t.cars[0];
    expect(leader.progress + leader.length / 2).toBeCloseTo(48);
    expect(crossingInset(leader)).toBe(29);
  });

  it('preserves a valid crossing during unrelated edits and recovers if its road is removed', () => {
    const n = crossing(), t = new Traffic(n), car = t.addCar('1,2', '2,4')!;
    until(t, () => car.crossing?.connection.movement === 'right');
    const before = carPose(n, car)!;
    buildRoad(n, { x: 7, y: 7 }, { x: 8, y: 7 }, 1, false); t.tick(false);
    expect(car.crossing).not.toBeNull();
    expect(Math.hypot(carPose(n, car)!.x - before.x, carPose(n, car)!.y - before.y)).toBeLessThan(1.405);
    removeRoad(n, '2,2|2,3'); t.tick(false);
    expect(car.crossing).toBeNull(); expect(car.committedLane).toBeNull();
    buildRoad(n, { x: 2, y: 2 }, { x: 2, y: 3 }, 1, false);
    until(t, () => t.completed === 1);
  });

  it('applies destination edits made during an active crossing on exit', () => {
    const n = crossing(), t = new Traffic(n), car = t.addCar('1,2', '4,2')!;
    until(t, () => car.crossing !== null);
    removeRoad(n, '3,2|4,2');
    ticks(t, 150); expect(car.node).toBe('3,2'); expect(car.next).toBeNull(); expect(t.completed).toBe(0);
    buildRoad(n, { x: 3, y: 2 }, { x: 4, y: 2 }, 1, false);
    until(t, () => t.completed === 1);
  });
  it('produces equal mixed-length traffic states at 1x, 2x and 4x frame stepping', () => {
    const simulations = [1, 2, 4].map(speed => {
      const t = new Traffic(crossing());
      for (const length of [11, 26, 11]) t.addCar('0,2', '2,4', false, length);
      for (let frame = 0; frame < 384 / speed; frame++) t.advance(speed / 60);
      return t;
    });
    for (const t of simulations.slice(1)) {
      expect(t.ticks).toBe(simulations[0].ticks);
      expect(t.cars).toEqual(simulations[0].cars);
      expect(t.completed).toBe(simulations[0].completed);
      expect(t.totalTripTime).toBe(simulations[0].totalTripTime);
    }
  });
  it.each(['merge', 'turns'])('keeps mixed-length vehicle bodies apart in a queued %s scenario', scenario => {
    const n = emptyNetwork();
    buildRoad(n, { x: 0, y: 2 }, { x: 2, y: 2 }, 2, false);
    buildRoad(n, { x: 2, y: 2 }, { x: 4, y: 2 }, 1, false);
    buildRoad(n, { x: 2, y: 0 }, { x: 2, y: 2 }, 2, false);
    buildRoad(n, { x: 2, y: 2 }, { x: 2, y: 4 }, 2, false);
    const t = new Traffic(n);
    for (let i = 0; i < 8; i++) {
      t.addCar('0,2', scenario === 'merge' ? '4,2' : i % 2 ? '2,0' : '2,4', false, i % 2 ? 11 : 26);
    }
    for (let i = 0; i < 1200 && t.completed < 8; i++) {
      t.tick(false);
      const cars = t.cars.filter(c => c.next);
      for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
        expect(bodiesOverlap(n, cars[a], cars[b]), `Bodies ${cars[a].id}/${cars[b].id} overlap at tick ${t.ticks}`).toBe(false);
      }
    }
    expect(t.completed).toBe(8);
  });
});

describe('vehicle motion', () => {
  it('accelerates gradually and brakes before a stopped queue', () => {
    const n = emptyNetwork(); buildRoad(n, { x: 0, y: 0 }, { x: 2, y: 0 }, 1, true);
    setSignal(n, '1,0', 30);
    const t = new Traffic(n); t.ticks = 600; const car = t.addCar('0,0', '2,0')!;
    t.tick(false); expect(car.speed).toBeCloseTo(ACCELERATION * STEP);
    let previous = car.speed, braking = false, cruising = false;
    for (let i = 0; i < 120; i++) {
      t.tick(false); cruising ||= Math.abs(car.speed - MAX_SPEED) < 1e-8;
      braking ||= car.speed > 0 && car.speed < previous;
      expect(car.speed).toBeLessThanOrEqual(previous + ACCELERATION * STEP + 1e-6);
      expect(car.progress).toBeLessThanOrEqual(stopProgress(car)); previous = car.speed;
    }
    expect(cruising && braking).toBe(true); expect(car.speed).toBe(0);
    expect(car.progress).toBe(stopProgress(car));
    expect(targetSpeed(28, 0, 28, STEP)).toBe(0);
  });
  it('rejects unsupported vehicle lengths', () => {
    const t = new Traffic(crossing());
    for (const length of [NaN, Infinity, -1, 27]) expect(() => t.addCar('1,2', '3,2', false, length)).toThrow('length');
  });
});
