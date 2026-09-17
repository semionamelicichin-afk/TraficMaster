import { expect, it } from 'vitest';
import { emptyNetwork } from '../domain/model';
import { buildRoad } from './roads';
import { roadSection } from './section';

it('selects bends but stops at junctions and endpoints', () => {
  const n = emptyNetwork();
  const ids = buildRoad(n, { x: 0, y: 0 }, { x: 3, y: 0 }, 1, false);
  buildRoad(n, { x: 3, y: 0 }, { x: 3, y: 2 }, 1, false);
  buildRoad(n, { x: 1, y: 0 }, { x: 1, y: 1 }, 1, false);
  const section = roadSection(n, ids[1]);
  expect(section.roads).toHaveLength(4);
  expect(section.nodes).toEqual(['1,0', '2,0', '3,0', '3,1', '3,2']);
  expect(section.roads).not.toContain(ids[0]);
});

it('selects a closed loop once and keeps ordered adjacent nodes', () => {
  const n = emptyNetwork();
  const ids = buildRoad(n, { x: 0, y: 0 }, { x: 2, y: 0 }, 1, false);
  buildRoad(n, { x: 2, y: 0 }, { x: 2, y: 2 }, 1, false);
  buildRoad(n, { x: 2, y: 2 }, { x: 0, y: 2 }, 1, false);
  buildRoad(n, { x: 0, y: 2 }, { x: 0, y: 0 }, 1, false);
  const section = roadSection(n, ids[0]);
  expect(new Set(section.roads).size).toBe(8);
  expect(section.nodes).toHaveLength(9);
  expect(section.nodes[0]).toBe(section.nodes.at(-1));
  section.roads.forEach((id, i) => expect([n.roads[id].a, n.roads[id].b].sort()).toEqual([section.nodes[i], section.nodes[i + 1]].sort()));
});
