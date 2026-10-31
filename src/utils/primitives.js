/**
 * 3D Primitives (Cylinder, Tube, Box, Cone)
 */

import { trianglesToMesh } from './mesh.js';

/**
 * Creates a solid 3D cylinder
 */
export function createCylinder({
  radius = 5,
  height = 10,
  segments = 36,
  center = false
}) {
  const z0 = center ? -height / 2 : 0;
  const z1 = center ? height / 2 : height;
  const triangles = [];

  const circlePoints = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    circlePoints.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
  }

  // Bottom cap (normal down)
  const centerBottom = [0, 0, z0];
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const p1 = [circlePoints[i][0], circlePoints[i][1], z0];
    const p2 = [circlePoints[next][0], circlePoints[next][1], z0];
    triangles.push([centerBottom, p2, p1]);
  }

  // Top cap (normal up)
  const centerTop = [0, 0, z1];
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const p1 = [circlePoints[i][0], circlePoints[i][1], z1];
    const p2 = [circlePoints[next][0], circlePoints[next][1], z1];
    triangles.push([centerTop, p1, p2]);
  }

  // Side walls
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const b0 = [circlePoints[i][0], circlePoints[i][1], z0];
    const b1 = [circlePoints[next][0], circlePoints[next][1], z0];
    const t0 = [circlePoints[i][0], circlePoints[i][1], z1];
    const t1 = [circlePoints[next][0], circlePoints[next][1], z1];

    triangles.push([b0, b1, t1]);
    triangles.push([b0, t1, t0]);
  }

  return trianglesToMesh(triangles);
}

/**
 * Creates a hollow tube / bushing with center hole
 */
export function createTube({
  outerRadius = 10,
  innerRadius = 5,
  height = 10,
  segments = 36,
  center = false
}) {
  const z0 = center ? -height / 2 : 0;
  const z1 = center ? height / 2 : height;
  const triangles = [];

  const outerPts = [];
  const innerPts = [];

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    outerPts.push([outerRadius * Math.cos(angle), outerRadius * Math.sin(angle)]);
    innerPts.push([innerRadius * Math.cos(angle), innerRadius * Math.sin(angle)]);
  }

  // Caps
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;

    const ob0 = [outerPts[i][0], outerPts[i][1], z0];
    const ob1 = [outerPts[next][0], outerPts[next][1], z0];
    const ib0 = [innerPts[i][0], innerPts[i][1], z0];
    const ib1 = [innerPts[next][0], innerPts[next][1], z0];

    const ot0 = [outerPts[i][0], outerPts[i][1], z1];
    const ot1 = [outerPts[next][0], outerPts[next][1], z1];
    const it0 = [innerPts[i][0], innerPts[i][1], z1];
    const it1 = [innerPts[next][0], innerPts[next][1], z1];

    // Bottom cap (quad: ib0, ib1, ob1, ob0) normal DOWN
    triangles.push([ob0, ob1, ib1]);
    triangles.push([ob0, ib1, ib0]);

    // Top cap normal UP
    triangles.push([ot0, it1, ot1]);
    triangles.push([ot0, it0, it1]);

    // Outer wall
    triangles.push([ob0, ob1, ot1]);
    triangles.push([ob0, ot1, ot0]);

    // Inner wall (facing center)
    triangles.push([ib0, it1, ib1]);
    triangles.push([ib0, it0, it1]);
  }

  return trianglesToMesh(triangles);
}

/**
 * Creates a 3D box
 */
export function createBox({
  width = 10,
  depth = 10,
  height = 10,
  center = false
}) {
  const x0 = center ? -width / 2 : 0;
  const x1 = center ? width / 2 : width;
  const y0 = center ? -depth / 2 : 0;
  const y1 = center ? depth / 2 : depth;
  const z0 = center ? -height / 2 : 0;
  const z1 = center ? height / 2 : height;

  const v = [
    [x0, y0, z0], // 0
    [x1, y0, z0], // 1
    [x1, y1, z0], // 2
    [x0, y1, z0], // 3
    [x0, y0, z1], // 4
    [x1, y0, z1], // 5
    [x1, y1, z1], // 6
    [x0, y1, z1]  // 7
  ];

  const faces = [
    [0, 2, 1], [0, 3, 2], // bottom (-z)
    [4, 5, 6], [4, 6, 7], // top (+z)
    [0, 1, 5], [0, 5, 4], // front (-y)
    [2, 3, 7], [2, 7, 6], // back (+y)
    [0, 4, 7], [0, 7, 3], // left (-x)
    [1, 2, 6], [1, 6, 5]  // right (+x)
  ];

  return { vertices: v, faces };
}
