import { expect, it } from 'vitest';
import { Controller } from './controller';
import { buildRoad } from '../editor/roads';
import { emptyNetwork } from '../domain/model';
import { findRoute } from '../domain/routing';

function editor() {
  const c = new Controller(); c.replace(emptyNetwork()); c.setTool('build'); return c;
}

it('applies coherent one-way direction across separately built roads as one undoable edit', () => {
  const c = editor();
  const ids = buildRoad(c.network, { x: 0, y: 1 }, { x: 2, y: 1 }, 1, false);
  buildRoad(c.network, { x: 4, y: 1 }, { x: 2, y: 1 }, 1, false);
  c.setTool('select'); c.click({ x: 0, y: 1 }, ids[0]);
  c.settings.lanes = 2; c.settings.oneWay = true; c.applyRoad();
  expect(Object.values(c.network.roads).every(r => r.lanes === 2 && r.oneWay)).toBe(true);
  expect(findRoute(c.network, '0,1', '4,1')).toHaveLength(5);
  expect(findRoute(c.network, '4,1', '0,1')).toBeNull();
  c.undo(); expect(Object.values(c.network.roads).every(r => r.lanes === 1 && !r.oneWay)).toBe(true);
  c.undo(true); expect(findRoute(c.network, '0,1', '4,1')).toHaveLength(5);
});

it('undoes and redoes construction and deletion with selection restored', () => {
  const c = editor(); c.click({ x: 0, y: 0 }, null); c.click({ x: 3, y: 0 }, null);
  const selected = c.selection;
  c.undo(); expect(Object.keys(c.network.roads)).toHaveLength(0); expect(c.selection).toBeNull();
  c.undo(true); expect(Object.keys(c.network.roads)).toHaveLength(3); expect(c.selection).toEqual(selected);
  c.setTool('erase'); c.click({ x: 0, y: 0 }, selected!.id);
  expect(Object.keys(c.network.roads)).toHaveLength(2);
  c.undo(); expect(Object.keys(c.network.roads)).toHaveLength(3);
});

it('preserves redo after failed construction and clears it after a new valid edit', () => {
  const c = editor(); c.click({ x: 0, y: 0 }, null); c.click({ x: 2, y: 0 }, null); c.undo();
  c.click({ x: 0, y: 0 }, null); c.click({ x: 1, y: 1 }, null);
  expect(c.error).toBe(true); expect(c.canRedo).toBe(true);
  c.click({ x: 0, y: 2 }, null); expect(c.canRedo).toBe(false);
});

it('undoes signal changes, removals and a city reset', () => {
  const c = new Controller(); c.selection = { kind: 'node', id: '6,4' };
  c.settings.green = 12; c.signal(); expect(c.network.signals['6,4'].green).toBe(12);
  c.undo(); expect(c.network.signals['6,4'].green).toBe(6);
  c.undo(true); c.signal(true); expect(c.network.signals['6,4']).toBeUndefined();
  c.undo(); expect(c.network.signals['6,4'].green).toBe(12);
  c.reset(false); expect(Object.keys(c.network.roads)).toHaveLength(0);
  c.undo(); expect(Object.keys(c.network.roads)).toHaveLength(64);
});

it('preserves running traffic and advances revision when restoring an edited network', () => {
  const c = new Controller(); c.running = true;
  c.traffic.advance(3); const traffic = c.traffic, ticks = traffic.ticks;
  c.selection = { kind: 'road', id: Object.keys(c.network.roads)[0] }; c.settings.lanes = 2; c.applyRoad();
  const revision = c.network.revision; c.undo();
  expect(c.running).toBe(true); expect(c.traffic).toBe(traffic); expect(traffic.ticks).toBe(ticks);
  expect(c.network.revision).toBeGreaterThan(revision); expect(traffic.network).toBe(c.network);
  traffic.tick(false);
});

it('bounds history to fifty map edits', () => {
  const c = new Controller(); c.selection = { kind: 'node', id: '6,4' };
  for (let i = 0; i < 55; i++) { c.settings.green = 2 + i % 20; c.signal(); }
  for (let i = 0; i < 50; i++) c.undo();
  expect(c.canUndo).toBe(false); expect(c.canRedo).toBe(true);
});

it('includes gateway roles and two-road priority in undo and redo', () => {
  const c = editor(); c.click({ x: 0, y: 0 }, null); c.click({ x: 2, y: 0 }, null);
  c.setTool('junction'); c.click({ x: 0, y: 0 }, null); c.gateway('entry');
  expect(c.network.gates['0,0']).toBe('entry'); c.undo(); expect(c.network.gates['0,0']).toBeUndefined();
  c.undo(true); expect(c.network.gates['0,0']).toBe('entry');
  c.click({ x: 1, y: 0 }, null); expect(c.isJunction).toBe(true);
  c.priority(['0,0', '2,0'], {}); expect(c.network.junctions['1,0'].main).toHaveLength(2);
  c.undo(); expect(c.network.junctions['1,0']).toBeUndefined();
  c.undo(true); expect(c.network.junctions['1,0'].main).toHaveLength(2);
});
