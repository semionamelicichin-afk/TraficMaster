import { describe, expect, it } from 'vitest';
import { emptyNetwork } from './model';
import { buildRoad } from '../editor/roads';
import { directedLanes, laneConnections, lanePosition, movement, routeLanes } from './lanes';

function crossing(lanes: 1 | 2 = 2) {
  const n = emptyNetwork();
  buildRoad(n, { x: 0, y: 1 }, { x: 2, y: 1 }, lanes, false);
  buildRoad(n, { x: 1, y: 0 }, { x: 1, y: 2 }, lanes, false);
  return n;
}
describe('directed lane connections', () => {
  it('has stable, distinct identifiers for each direction and lane', () => {
    const n = crossing();
    const forward = directedLanes(n, '0,1', '1,1'), reverse = directedLanes(n, '1,1', '0,1');
    expect(new Set([...forward, ...reverse].map(l => l.id)).size).toBe(4);
    expect(directedLanes(structuredClone(n), '0,1', '1,1')).toEqual(forward);
  });
  it('uses the inner lane for left turns, outer for right, and preserves lanes straight ahead', () => {
    const n = crossing();
    expect(routeLanes(n, ['0,1', '1,1', '1,0'])).toEqual([0]);
    expect(routeLanes(n, ['0,1', '1,1', '1,2'])).toEqual([1]);
    expect(laneConnections(n, '0,1', '1,1', '2,1').map(c => [c.incoming.index, c.outgoing.index])).toEqual([[0, 0], [1, 1]]);
    expect(movement(n, '2,1', '1,1', '1,2')).toBe('left');
    expect(movement(n, '1,0', '1,1', '0,1')).toBe('right');
    expect(movement(n, '1,2', '1,1', '0,1')).toBe('left');
  });
  it('allows all movements from one lane, including two-road bends, but no U-turn', () => {
    const n = crossing(1);
    for (const to of ['2,1', '1,0', '1,2']) expect(laneConnections(n, '0,1', '1,1', to)).toHaveLength(1);
    expect(laneConnections(n, '0,1', '1,1', '0,1')).toEqual([]);
    const bend = emptyNetwork();
    buildRoad(bend, { x: 0, y: 0 }, { x: 1, y: 0 }, 2, false);
    buildRoad(bend, { x: 1, y: 0 }, { x: 1, y: 1 }, 2, false);
    expect(routeLanes(bend, ['0,0', '1,0', '1,1'])).toEqual([1]);
  });
  it('defines narrowing and widening connections and rejects reverse one-way travel', () => {
    const n = emptyNetwork();
    buildRoad(n, { x: 0, y: 0 }, { x: 1, y: 0 }, 2, true);
    buildRoad(n, { x: 1, y: 0 }, { x: 2, y: 0 }, 1, true);
    buildRoad(n, { x: 2, y: 0 }, { x: 3, y: 0 }, 2, true);
    expect(laneConnections(n, '0,0', '1,0', '2,0').map(c => [c.incoming.index, c.outgoing.index])).toEqual([[0, 0], [1, 0]]);
    expect(laneConnections(n, '1,0', '2,0', '3,0').map(c => [c.incoming.index, c.outgoing.index])).toEqual([[0, 0], [0, 1]]);
    expect(directedLanes(n, '1,0', '0,0')).toEqual([]);
    expect(laneConnections(n, '3,0', '2,0', '1,0')).toEqual([]);
  });
  it('positions both directions on their own side and supports intermediate lateral positions', () => {
    const n = crossing();
    expect(lanePosition(n, '0,1', '1,1', 0, 32)).toEqual({ x: 32, y: 68 });
    expect(lanePosition(n, '1,1', '0,1', 0, 32)).toEqual({ x: 32, y: 60 });
    expect(lanePosition(n, '0,1', '1,1', 0.5, 32)).toEqual({ x: 32, y: 71.5 });
  });
});
