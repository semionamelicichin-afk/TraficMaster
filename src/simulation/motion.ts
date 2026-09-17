export const ACCELERATION = 56;
export const BRAKING = 80;

/** Anticipate one fixed step of travel before applying the braking-distance bound. */
export function targetSpeed(speed: number, clearance: number, maximum: number, step: number, acceleration = ACCELERATION, braking = BRAKING): number {
  const brakingSpeed = Math.sqrt((braking * step) ** 2 + 2 * braking * Math.max(0, clearance)) - braking * step;
  return Math.min(maximum, speed + acceleration * step, brakingSpeed);
}
