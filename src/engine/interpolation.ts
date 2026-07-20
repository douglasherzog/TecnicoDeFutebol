export interface Vec2 {
  x: number;
  y: number;
}

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const lerpCoord = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

/** Smooth start/end (3t² - 2t³) */
export const smoothStep = (t: number): number => t * t * (3 - 2 * t);

/** Smooth start/end with steeper curve */
export const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

/** Strong ease in/out */
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Natural deceleration */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export const magnitude = (v: Vec2): number => Math.hypot(v.x, v.y);

export const normalize = (v: Vec2): Vec2 => {
  const m = magnitude(v) || 1;
  return { x: v.x / m, y: v.y / m };
};

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });

export const limit = (v: Vec2, max: number): Vec2 => {
  const m = magnitude(v);
  if (m <= max || m === 0) return v;
  const s = max / m;
  return { x: v.x * s, y: v.y * s };
};

/** Shortest signed angle difference in radians, range [-PI, PI] */
export const shortestAngleDelta = (from: number, to: number): number => {
  const d = to - from;
  return Math.atan2(Math.sin(d), Math.cos(d));
};

/** Interpolate an angle by the shortest path */
export const lerpAngle = (from: number, to: number, t: number): number =>
  from + shortestAngleDelta(from, to) * t;

/** Quadratic Bezier point at t in [0,1] */
export const quadraticBezier = (a: Vec2, b: Vec2, c: Vec2, t: number): Vec2 => {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
};

/** Control point perpendicular to the from->to segment, offset by curveFactor * distance * side */
export const bezierControlPoint = (
  from: Vec2,
  to: Vec2,
  curveFactor: number,
  side: number,
): Vec2 => {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const perpX = -dy / dist;
  const perpY = dx / dist;
  const offset = dist * curveFactor;
  return { x: mid.x + perpX * offset * side, y: mid.y + perpY * offset * side };
};

/** Parabolic height: 0 at endpoints, max at t=0.5 */
export const parabolaHeight = (t: number, maxHeight: number): number =>
  4 * maxHeight * clamp(t, 0, 1) * (1 - clamp(t, 0, 1));

/** Simulate natural steering: accelerate/decelerate towards target with limited speed and force */
export function integrateSteering(
  position: Vec2,
  velocity: Vec2,
  target: Vec2,
  dt: number,
  maxSpeed: number,
  maxForce: number,
): { position: Vec2; velocity: Vec2 } {
  const desiredX = target.x - position.x;
  const desiredY = target.y - position.y;
  const dist = Math.hypot(desiredX, desiredY);

  let desiredVX = 0;
  let desiredVY = 0;
  if (dist > 0.5) {
    desiredVX = (desiredX / dist) * maxSpeed;
    desiredVY = (desiredY / dist) * maxSpeed;
  }

  let steerX = desiredVX - velocity.x;
  let steerY = desiredVY - velocity.y;
  const steerMag = Math.hypot(steerX, steerY);
  if (steerMag > maxForce) {
    const s = maxForce / steerMag;
    steerX *= s;
    steerY *= s;
  }

  let newVX = velocity.x + steerX * dt;
  let newVY = velocity.y + steerY * dt;
  const newVMag = Math.hypot(newVX, newVY);
  if (newVMag > maxSpeed) {
    const s = maxSpeed / newVMag;
    newVX *= s;
    newVY *= s;
  }

  return {
    position: { x: position.x + newVX * dt, y: position.y + newVY * dt },
    velocity: { x: newVX, y: newVY },
  };
}

/** Ball flight with curved ground trajectory and parabolic height */
export function computeBallFlight(
  from: Vec2,
  to: Vec2,
  control: Vec2,
  t: number,
  maxHeight: number,
): { position: Vec2; height: number } {
  const position = quadraticBezier(from, to, control, t);
  const height = parabolaHeight(t, maxHeight);
  return { position, height };
}

/** Shortest distance from a point to the segment between a and b. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ap = { x: p.x - a.x, y: p.y - a.y };
  const abLen = magnitude(ab);
  if (abLen === 0) return distance(p, a);
  const t = clamp((ap.x * ab.x + ap.y * ab.y) / (abLen * abLen), 0, 1);
  const projection = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return distance(p, projection);
}
