export type VehicleType = 'car' | 'bus' | 'truck' | 'garbage';
export interface VehicleProfile {
  name: string; length: number; width: number; speed: number;
  acceleration: number; braking: number; gap: number; serviceSeconds: number; capacity: number; color: number;
}
export const vehicles: Record<VehicleType, VehicleProfile> = {
  car: { name: 'Passenger car', length: 11, width: 5, speed: 28, acceleration: 56, braking: 80, gap: 5, serviceSeconds: 4, capacity: 4, color: 0x99c5ff },
  bus: { name: 'Bus', length: 24, width: 5.5, speed: 22, acceleration: 28, braking: 60, gap: 6, serviceSeconds: 8, capacity: 40, color: 0xffd47d },
  truck: { name: 'Truck', length: 22, width: 5.5, speed: 20, acceleration: 24, braking: 56, gap: 7, serviceSeconds: 12, capacity: 12, color: 0xf7a792 },
  garbage: { name: 'Garbage truck', length: 20, width: 5.5, speed: 18, acceleration: 22, braking: 52, gap: 6, serviceSeconds: 10, capacity: 10, color: 0x70ddd0 },
};
