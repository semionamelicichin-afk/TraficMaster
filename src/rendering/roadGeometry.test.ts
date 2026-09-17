import { expect, it } from 'vitest';
import { emptyNetwork } from '../domain/model';
import { buildRoad } from '../editor/roads';
import { markingInset } from './roadGeometry';

it('keeps straight markings continuous and clears wide intersections', () => {
  const n = emptyNetwork();
  buildRoad(n, { x: 0, y: 2 }, { x: 4, y: 2 }, 1, false);
  expect(markingInset(n, '2,2')).toBe(0);
  buildRoad(n, { x: 2, y: 0 }, { x: 2, y: 4 }, 2, false);
  expect(markingInset(n, '2,2')).toBe(22);
});

it('clears markings at corners and changes of road width', () => {
  const n = emptyNetwork();
  buildRoad(n, { x: 0, y: 1 }, { x: 1, y: 1 }, 1, false);
  buildRoad(n, { x: 1, y: 1 }, { x: 1, y: 2 }, 1, false);
  expect(markingInset(n, '1,1')).toBe(15);
  buildRoad(n, { x: 1, y: 2 }, { x: 1, y: 3 }, 2, false);
  expect(markingInset(n, '1,2')).toBe(22);
});
