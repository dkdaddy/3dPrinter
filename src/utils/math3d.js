/**
 * 3D Vector and Matrix Math Utilities
 */

export function vec3(x = 0, y = 0, z = 0) {
  return [x, y, z];
}

export function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale3(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

export function lengthSq3(v) {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
}

export function length3(v) {
  return Math.sqrt(lengthSq3(v));
}

export function dist3(a, b) {
  return length3(sub3(a, b));
}

export function normalize3(v) {
  const len = length3(v);
  if (len < 1e-12) return [0, 0, 0];
  const inv = 1 / len;
  return [v[0] * inv, v[1] * inv, v[2] * inv];
}

/**
 * Computes face normal from 3 counter-clockwise vertices
 */
export function computeNormal(v1, v2, v3) {
  const u = sub3(v2, v1);
  const w = sub3(v3, v1);
  return normalize3(cross3(u, w));
}

/**
 * Signed volume of tetrahedron formed by origin and triangle (v1, v2, v3)
 */
export function signedTriangleVolume(v1, v2, v3) {
  return dot3(v1, cross3(v2, v3)) / 6.0;
}

/**
 * Surface area of triangle (v1, v2, v3)
 */
export function triangleArea(v1, v2, v3) {
  const cross = cross3(sub3(v2, v1), sub3(v3, v1));
  return 0.5 * length3(cross);
}

export function rotateX(v, rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

export function rotateY(v, rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

export function rotateZ(v, rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}
