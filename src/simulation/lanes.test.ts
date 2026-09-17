import { describe, expect, it } from 'vitest';
import { emptyNetwork } from '../domain/model';
import { buildRoad } from '../editor/roads';
import { removeRoad, updateRoad } from '../domain/graph';
import { carPose, GAP, occupiedLanes, stopProgress, Traffic, visualLane } from './traffic';

const ticks = (t: Traffic, count: number) => { for (let i = 0; i < count; i++) t.tick(false); };
const until = (t: Traffic, condition: () => boolean) => {
  for (let i = 0; i < 300 && !condition(); i++) t.tick(false);
  expect(condition()).toBe(true);
};
function turningRoad() {
  const n = emptyNetwork();
  buildRoad(n, { x: 0, y: 0 }, { x: 2, y: 0 }, 2, true);
  buildRoad(n, { x: 2, y: 0 }, { x: 2, y: 2 }, 2, true);
  return n;
}
describe('automatic lane use', () => {
  it('selects a legal entry lane before a right turn', () => {
    const t = new Traffic(turningRoad()), car = t.addCar('1,0', '2,2')!;
    t.tick(false); expect(car.lane).toBe(1);
    ticks(t, 160); expect(t.completed).toBe(1);
  });
  it('changes lanes smoothly upstream, reserving both lanes until completion', () => {
    const t = new Traffic(turningRoad()), car = t.addCar('0,0', '2,2')!;
    until(t, () => car.node === '1,0');
    expect(car.node).toBe('1,0'); expect(car.laneChange).toBeNull();
    until(t, () => car.laneChange !== null);
    expect(occupiedLanes(car)).toEqual([0, 1]);
    expect(visualLane(car)).toBeGreaterThan(0); expect(visualLane(car)).toBeLessThan(1);
    for (let i = 0; i < 12; i++) {
      const previous = visualLane(car); t.tick(false);
      expect(visualLane(car)).toBeGreaterThanOrEqual(previous);
      expect(visualLane(car) - previous).toBeLessThan(0.13);
    }
    expect(car.laneChange).toBeNull(); expect(car.lane).toBe(1);
    ticks(t, 160); expect(t.completed).toBe(1);
  });
  it('waits for front and rear clearance instead of entering an occupied lane', () => {
    const n = turningRoad(); n.signals['2,0'] = { green: 30 };
    const t = new Traffic(n); t.ticks = 600; t.tick(false);
    const changing = t.addCar('1,0', '2,2')!, ahead = t.addCar('1,0', '2,2')!, behind = t.addCar('1,0', '2,2')!;
    for (const car of [changing, ahead, behind]) { car.next = '2,0'; car.lane = 1; }
    changing.lane = 0; changing.progress = 32; ahead.progress = stopProgress(ahead); behind.progress = 16;
    ticks(t, 30);
    expect(changing.laneChange).toBeNull(); expect(changing.lane).toBe(0);
    expect(changing.progress).toBeLessThanOrEqual(stopProgress(changing));
    t.cars = [changing]; ticks(t, 12);
    expect(changing.lane).toBe(1); expect(changing.laneChange).toBeNull();
    expect(changing.progress).toBe(stopProgress(changing));
  });
  it('preserves the straight lane when the neighboring outgoing lane is empty', () => {
    const n = emptyNetwork(); buildRoad(n, { x: 0, y: 0 }, { x: 3, y: 0 }, 2, true);
    n.signals['2,0'] = { green: 30 };
    const t = new Traffic(n); t.ticks = 600; t.tick(false);
    const car = t.addCar('0,0', '3,0')!, leader = t.addCar('1,0', '3,0')!;
    car.next = '1,0'; car.lane = 1; car.progress = stopProgress(car);
    leader.next = '2,0'; leader.lane = 1; leader.progress = 0;
    ticks(t, 25); expect(car.lane).toBe(1);
    expect(car.laneChange).toBeNull();
  });
  it('keeps spacing through a two-to-one merge with simultaneous arrivals', () => {
    const n = emptyNetwork();
    buildRoad(n, { x: 0, y: 0 }, { x: 1, y: 0 }, 2, true);
    buildRoad(n, { x: 1, y: 0 }, { x: 3, y: 0 }, 1, true);
    const t = new Traffic(n); t.tick(false);
    const a = t.addCar('0,0', '3,0')!, b = t.addCar('0,0', '3,0')!;
    a.next = b.next = '1,0'; a.progress = b.progress = stopProgress(a); b.lane = 1;
    for (let i = 0; i < 180; i++) {
      t.tick(false);
      if (t.cars.includes(a) && t.cars.includes(b) && (a.node !== '0,0' || b.node !== '0,0')) {
        expect(Math.abs(carPose(n, a)!.x - carPose(n, b)!.x)).toBeGreaterThanOrEqual(GAP - 1e-8);
      }
    }
    expect(t.completed).toBe(2);
  });
  it('cancels a lane change when its target lane is removed', () => {
    const n = turningRoad(), t = new Traffic(n), car = t.addCar('0,0', '2,2')!;
    until(t, () => car.laneChange !== null);
    updateRoad(n, '1,0|2,0', 1, true); t.tick(false);
    expect(car.laneChange).toBeNull(); expect(car.lane).toBe(0);
    ticks(t, 200); expect(t.completed).toBe(1);
  });
  it('restarts an edited turn from the last node if it is too late to change lanes', () => {
    const n = emptyNetwork();
    const main = buildRoad(n, { x: 0, y: 1 }, { x: 2, y: 1 }, 2, false);
    buildRoad(n, { x: 1, y: 1 }, { x: 1, y: 2 }, 2, false);
    buildRoad(n, { x: 1, y: 2 }, { x: 2, y: 2 }, 2, false);
    buildRoad(n, { x: 2, y: 2 }, { x: 2, y: 1 }, 2, false);
    const t = new Traffic(n), car = t.addCar('0,1', '2,1')!;
    until(t, () => car.crossing !== null);
    expect(car.committedLane).toBe(0);
    removeRoad(n, main[1]); t.tick(false);
    expect(car.node).toBe('0,1'); expect(car.lane).toBe(1);
    expect(car.progress).toBeLessThan(GAP); expect(car.committedLane).toBeNull();
    ticks(t, 300); expect(t.completed).toBe(1);
  });
  it('waits for a forward route after an edit instead of making an automatic U-turn', () => {
    const n = emptyNetwork();
    const main = buildRoad(n, { x: 0, y: 0 }, { x: 2, y: 0 }, 1, false);
    buildRoad(n, { x: 0, y: 0 }, { x: 0, y: 1 }, 1, false);
    buildRoad(n, { x: 0, y: 1 }, { x: 2, y: 1 }, 1, false);
    buildRoad(n, { x: 2, y: 1 }, { x: 2, y: 0 }, 1, false);
    const t = new Traffic(n), car = t.addCar('0,0', '2,0')!;
    ticks(t, 5); removeRoad(n, main[1]); ticks(t, 100);
    expect(car.node).toBe('1,0'); expect(car.next).toBeNull(); expect(t.completed).toBe(0);
    buildRoad(n, { x: 1, y: 0 }, { x: 1, y: 1 }, 1, false);
    ticks(t, 200); expect(t.completed).toBe(1);
  });
});
