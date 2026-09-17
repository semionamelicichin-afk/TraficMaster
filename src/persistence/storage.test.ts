import { describe, expect, it } from 'vitest';
import { demoNetwork } from '../domain/demo';
import { defaults } from '../domain/model';
import { deserialize, loadCity, saveCity, serialize } from './storage';
import { setJunction } from '../domain/controls';

describe('saved cities', () => {
  it('migrates legacy endpoints and validates and restores v2 junction controls', () => {
    const n = demoNetwork();
    const legacy = deserialize(JSON.stringify({ version: 1, network: n, settings: defaults }));
    expect(Object.values(legacy.network.gates)).toHaveLength(8);
    expect(Object.values(legacy.network.gates).every(g => g === 'both')).toBe(true);
    setJunction(n, '6,4', ['5,4', '6,3'], { '7,4': 'stop', '6,5': 'yield' });
    const loaded = deserialize(serialize(n, defaults));
    expect(loaded.version).toBe(3); expect(loaded.network.gates).toEqual(n.gates);
    expect(loaded.network.junctions).toEqual(n.junctions);
    n.junctions['6,4'].main = ['5,4', '5,4'];
    expect(() => deserialize(serialize(n, defaults))).toThrow('invalid');
  });
  it('round trips the graph, signals and settings through storage', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const n = demoNetwork(), settings = { ...defaults, speed: 4 as const, lanes: 2 as const };
    saveCity(storage, n, settings);
    const saved = loadCity(storage);
    expect(saved.network.roads).toEqual(n.roads); expect(saved.network.nodes).toEqual(n.nodes);
    expect(saved.network.signals).toEqual(n.signals); expect(saved.settings).toEqual(settings);
  });
  it('rejects malformed, outdated and inconsistent saves', () => {
    for (const raw of ['bad', '{}', 'null', '{"version":2}']) expect(() => deserialize(raw)).toThrow('invalid');
    const n = demoNetwork(); delete n.nodes['2,4'];
    expect(() => deserialize(serialize(n, defaults))).toThrow('invalid');
    expect(() => deserialize(serialize(demoNetwork(), { ...defaults, green: 100 }))).toThrow('invalid');
    expect(() => loadCity({ getItem: () => null })).toThrow('No saved city');
  });
  it('propagates storage failures without replacing the caller state', () => {
    const n = demoNetwork(); const before = serialize(n, defaults);
    expect(() => saveCity({ setItem: () => { throw new Error('Quota exceeded'); } }, n, defaults)).toThrow('Quota');
    expect(serialize(n, defaults)).toBe(before);
  });
});
