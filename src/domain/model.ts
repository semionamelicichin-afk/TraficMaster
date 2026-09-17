export interface Point { x: number; y: number }
export interface RoadNode extends Point { id: string }
export interface Road { id: string; a: string; b: string; lanes: 1 | 2; oneWay: boolean }
export interface Signal { green: number }
export type Gateway = 'entry' | 'exit' | 'both';
export type RoadSign = 'yield' | 'stop';
export interface Junction { main: string[]; signs: Record<string, RoadSign> }
export type ZoneKind = 'residential' | 'business' | 'retail' | 'warehouse' | 'industrial';
export interface Zone extends Point { id: string; kind: ZoneKind; capacity: number; demand: number }
export interface Network { nodes: Record<string, RoadNode>; roads: Record<string, Road>; signals: Record<string, Signal>; gates: Record<string, Gateway>; junctions: Record<string, Junction>; zones: Record<string, Zone>; revision: number }
export interface Settings { speed: 1 | 2 | 4; lanes: 1 | 2; oneWay: boolean; green: number }
export const GRID = 64;
export const COLUMNS = 20;
export const ROWS = 14;
export const defaults: Settings = { speed: 1, lanes: 1, oneWay: false, green: 6 };
export function emptyNetwork(): Network { return { nodes: {}, roads: {}, signals: {}, gates: {}, junctions: {}, zones: {}, revision: 0 }; }
export const nodeId = (p: Point): string => `${p.x},${p.y}`;
export const roadId = (a: string, b: string): string => [a, b].sort().join('|');
