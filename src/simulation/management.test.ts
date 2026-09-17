import { describe, expect, it } from 'vitest';
import { emptyNetwork } from '../domain/model';
import { buildRoad } from '../editor/roads';
import { approaches, junctionControl, setGateway, setJunction } from '../domain/controls';
import { demoNetwork } from '../domain/demo';
import { gatewayTrips } from '../domain/routing';
import { removeRoad } from '../domain/graph';
import { Traffic, stopProgress } from './traffic';
import { setSignal } from './signals';

function crossing() {
  const n = emptyNetwork();
  buildRoad(n, { x: 0, y: 2 }, { x: 4, y: 2 }, 1, false);
  buildRoad(n, { x: 2, y: 0 }, { x: 2, y: 4 }, 1, false);
  return n;
}
function atLine(t: Traffic, start: string, destination: string) {
  const c = t.addCar(start, destination)!;
  c.next = c.route[1]; c.progress = stopProgress(c); return c;
}
const ticks = (t: Traffic, count: number) => { for (let i = 0; i < count; i++) t.tick(false); };

describe('gateways', () => {
  it('spawns trips across multiple entries and exits only', () => {
    const n = demoNetwork(), t = new Traffic(n); t.advance(15);
    expect(t.cars.length).toBeGreaterThan(5);
    for (const car of t.cars) { expect(n.gates[car.origin]).toBe('entry'); expect(n.gates[car.destination]).toBe('exit'); }
    expect(new Set(t.cars.map(c => c.origin)).size).toBeGreaterThan(1);
    expect(new Set(t.cars.map(c => c.destination)).size).toBeGreaterThan(1);
  });
  it('waits for explicit reachable gateways and respects one-way travel', () => {
    const n = emptyNetwork(); buildRoad(n, { x: 0, y: 0 }, { x: 3, y: 0 }, 1, true);
    const t = new Traffic(n); t.advance(2); expect(t.cars).toHaveLength(0);
    setGateway(n, '3,0', 'entry'); setGateway(n, '0,0', 'exit');
    expect(gatewayTrips(n)).toHaveLength(0); t.advance(2); expect(t.cars).toHaveLength(0);
    setGateway(n, '0,0', 'entry'); setGateway(n, '3,0', 'exit');
    expect(gatewayTrips(n)).toEqual([{ start: '0,0', destination: '3,0' }]);
    t.advance(1); expect(t.cars.length).toBeGreaterThan(0);
  });
  it('supports bidirectional gateways and clears gateways when endpoints become internal', () => {
    const n = emptyNetwork(); buildRoad(n, { x: 0, y: 0 }, { x: 2, y: 0 }, 1, false);
    setGateway(n, '0,0', 'both'); setGateway(n, '2,0', 'both');
    expect(gatewayTrips(n)).toHaveLength(2);
    expect(() => setGateway(n, '1,0', 'entry')).toThrow('endpoint');
    buildRoad(n, { x: 2, y: 0 }, { x: 3, y: 0 }, 1, false);
    expect(n.gates['2,0']).toBeUndefined();
  });
  it('reroutes city trips when an exit is removed, and waits if no exit remains', () => {
    const n = emptyNetwork(); buildRoad(n, { x: 0, y: 0 }, { x: 3, y: 0 }, 1, false);
    setGateway(n, '0,0', 'entry'); setGateway(n, '3,0', 'exit');
    const t = new Traffic(n), car = t.addCar('0,0', '3,0', true)!;
    ticks(t, 10); setGateway(n, '3,0', null); ticks(t, 200);
    expect(t.completed).toBe(0); expect(car.next).toBeNull();
    setGateway(n, '0,0', 'exit'); ticks(t, 200);
    expect(car.destination).toBe('0,0'); expect(t.completed).toBe(1);
  });
});

describe('junction management', () => {
  it('requires exactly two main arms, supports a turning main road and repairs removed arms', () => {
    const n = crossing();
    expect(junctionControl(n, '2,2').main).toEqual(['1,2', '3,2']);
    expect(() => setJunction(n, '2,2', ['1,2'], {})).toThrow('exactly two');
    expect(() => setJunction(n, '2,2', ['1,2', '1,2'], {})).toThrow('exactly two');
    setJunction(n, '2,2', ['1,2', '2,1'], { '3,2': 'stop', '2,3': 'yield' });
    expect(junctionControl(n, '2,2').main).toEqual(['1,2', '2,1']);
    removeRoad(n, '1,2|2,2'); removeRoad(n, '2,1|2,2');
    expect(junctionControl(n, '2,2').main.sort()).toEqual(approaches(n, '2,2'));
    expect(n.junctions['2,2'].signs).toEqual({});
  });
  it('allows a two-road junction and designates both roads as main without signals', () => {
    const n = emptyNetwork(); buildRoad(n, { x: 0, y: 0 }, { x: 2, y: 0 }, 1, false);
    setJunction(n, '1,0', ['0,0', '2,0'], {});
    setSignal(n, '1,0', 6); expect(n.signals['1,0']).toBeDefined();
    setSignal(n, '1,0', null); expect(junctionControl(n, '1,0').main).toHaveLength(2);
    delete n.junctions['1,0']; setSignal(n, '1,0', 6); setSignal(n, '1,0', null);
    expect(n.junctions['1,0'].main).toHaveLength(2);
  });
  it('yields to a main-road vehicle even when the minor vehicle was created first', () => {
    const t = new Traffic(crossing());
    const minor = atLine(t, '2,1', '2,3'), main = atLine(t, '1,2', '3,2');
    ticks(t, 12);
    expect(main.crossing?.connection.incoming.to).toBe('2,2'); expect(minor.progress).toBe(stopProgress(minor)); expect(minor.speed).toBe(0);
    ticks(t, 160); expect(t.completed).toBe(2);
  });
  it('enforces a full one-second STOP and distinguishes Yield on an empty junction', () => {
    const n = crossing(); setJunction(n, '2,2', ['1,2', '3,2'], { '2,1': 'stop', '2,3': 'yield' });
    const t = new Traffic(n), stopped = atLine(t, '2,1', '2,3');
    ticks(t, 19); expect(stopped.progress).toBe(stopProgress(stopped)); expect(stopped.speed).toBe(0);
    t.tick(false); expect(stopped.crossing).not.toBeNull();
    const yielding = new Traffic(n), car = atLine(yielding, '2,3', '2,1');
    yielding.tick(false); expect(car.crossing).not.toBeNull();
  });
  it('lets active signals override stored STOP rules', () => {
    const n = crossing(); setJunction(n, '2,2', ['1,2', '3,2'], { '2,1': 'stop', '2,3': 'yield' });
    setSignal(n, '2,2', 6);
    const t = new Traffic(n); t.ticks = 120;
    const car = atLine(t, '2,1', '2,3'); t.tick(false);
    expect(car.crossing).not.toBeNull();
    expect(car.stoppedFor).toBeLessThan(1);
  });
});
