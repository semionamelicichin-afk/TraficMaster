import { describe, expect, it } from 'vitest';
import { addNode, connectedRoads, removeNode, removeRoad, updateRoad } from './graph';
import { emptyNetwork } from './model';
import { buildRoad, planRoad } from '../editor/roads';
import { findRoute } from './routing';

describe('road network and routing', () => {
  it('previews connections without mutating the network and rejects occupied segments', () => {
    const n = emptyNetwork();
    buildRoad(n, { x: 1, y: 2 }, { x: 3, y: 2 }, 1, false);
    const before = JSON.stringify(n);
    expect(planRoad(n, { x: 2, y: 0 }, { x: 2, y: 3 }).points).toContainEqual({ x: 2, y: 2 });
    expect(() => planRoad(n, { x: 1, y: 2 }, { x: 3, y: 2 })).toThrow('already');
    expect(JSON.stringify(n)).toBe(before);
  });
  it('adds nodes and roads, joins crossings and removes orphan nodes', () => {
    const n = emptyNetwork();
    addNode(n, { x: 1, y: 1 });
    const ids = buildRoad(n, { x: 1, y: 1 }, { x: 3, y: 1 }, 2, false);
    buildRoad(n, { x: 2, y: 0 }, { x: 2, y: 2 }, 1, false);
    expect(connectedRoads(n, '2,1')).toHaveLength(4);
    removeRoad(n, ids[0]);
    expect(n.nodes['1,1']).toBeUndefined();
    removeNode(n, '2,1');
    expect(Object.keys(n.roads)).toHaveLength(0);
  });
  it('rejects invalid construction atomically', () => {
    const n = emptyNetwork();
    expect(() => buildRoad(n, { x: 1, y: 1 }, { x: 2, y: 2 }, 1, false)).toThrow('horizontal');
    expect(() => addNode(n, { x: -1, y: 1 })).toThrow();
    buildRoad(n, { x: 1, y: 1 }, { x: 3, y: 1 }, 1, false);
    const before = JSON.stringify(n);
    expect(() => buildRoad(n, { x: 0, y: 1 }, { x: 4, y: 1 }, 1, false)).toThrow('already');
    expect(JSON.stringify(n)).toBe(before);
  });
  it('finds shortest routes and obeys one-way changes', () => {
    const n = emptyNetwork();
    const ids = buildRoad(n, { x: 1, y: 1 }, { x: 3, y: 1 }, 1, true);
    expect(findRoute(n, '1,1', '3,1')).toEqual(['1,1', '2,1', '3,1']);
    expect(findRoute(n, '3,1', '1,1')).toBeNull();
    ids.forEach(id => updateRoad(n, id, 2, false));
    expect(findRoute(n, '3,1', '1,1')).toHaveLength(3);
    removeRoad(n, ids[0]);
    expect(findRoute(n, '1,1', '3,1')).toBeNull();
  });
});
