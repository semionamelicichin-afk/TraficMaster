import type { Junction } from '../domain/model';

export const STOP_SECONDS = 1;
export function isMain(control: Junction, from: string): boolean { return control.main.includes(from); }
export function stopSatisfied(control: Junction, from: string, stoppedFor: number): boolean {
  return isMain(control, from) || control.signs[from] !== 'stop' || stoppedFor + 1e-8 >= STOP_SECONDS;
}
/** Equal-priority approaches use stable vehicle IDs; the junction reservation prevents simultaneous entry. */
export function goesFirst(control: Junction, a: { id: number; node: string }, b: { id: number; node: string }): boolean {
  const rankA = isMain(control, a.node) ? 0 : 1, rankB = isMain(control, b.node) ? 0 : 1;
  return rankA < rankB || (rankA === rankB && a.id < b.id);
}
