/**
 * 2D to 3D Extrusion Engine
 */

import {
  ensureWinding,
  triangulatePolygonWithHoles
} from './polygon.js';
import { rotateZ } from './math3d.js';
import { trianglesToMesh } from './mesh.js';

/**
 * Extrudes a 2D polygon with optional holes into a 3D watertight mesh
 *
 * @param {Array<[number, number]>} outer - CCW 2D polygon points
 * @param {number} height - Total extrusion height
 * @param {Object} options
 * @param {Array<Array<[number, number]>>} [options.holes] - List of hole polygons
 * @param {number} [options.twist] - Twist angle in radians over height
 * @param {number} [options.steps] - Number of vertical layers (for twist)
 * @returns {{ vertices: Array<[number, number, number]>, faces: Array<[number, number, number]> }}
 */
export function extrude(outer, height, options = {}) {
  const {
    holes = [],
    twist = 0,
    steps = twist !== 0 ? Math.max(10, Math.ceil(Math.abs(twist) * 10)) : 1
  } = options;

  const outerCCW = ensureWinding(outer, true);
  const holesCW = holes.map(h => ensureWinding(h, false));

  const allTriangles = [];

  // Helper to transform a 2D point at a specific height layer
  function get3DPoint(pt2d, z) {
    let [x, y] = pt2d;
    if (twist !== 0) {
      const angle = (z / height) * twist;
      [x, y] = rotateZ([x, y, 0], angle).slice(0, 2);
    }
    return [x, y, z];
  }

  // 1. Bottom Cap (z = 0, normal pointing down [0, 0, -1])
  const capData = triangulatePolygonWithHoles(outerCCW, holesCW);
  for (const [i0, i1, i2] of capData.triangles) {
    const v0 = get3DPoint(capData.vertices[i0], 0);
    const v1 = get3DPoint(capData.vertices[i1], 0);
    const v2 = get3DPoint(capData.vertices[i2], 0);
    // Reverse winding for bottom face so normal points DOWN (-Z)
    allTriangles.push([v0, v2, v1]);
  }

  // 2. Top Cap (z = height, normal pointing up [0, 0, 1])
  for (const [i0, i1, i2] of capData.triangles) {
    const v0 = get3DPoint(capData.vertices[i0], height);
    const v1 = get3DPoint(capData.vertices[i1], height);
    const v2 = get3DPoint(capData.vertices[i2], height);
    // Standard CCW winding for top face so normal points UP (+Z)
    allTriangles.push([v0, v1, v2]);
  }

  // 3. Side Walls (Layer by Layer for outer perimeter)
  const layerHeight = height / steps;

  function buildWalls(loop, isHole) {
    const n = loop.length;
    for (let s = 0; s < steps; s++) {
      const zBottom = s * layerHeight;
      const zTop = (s + 1) * layerHeight;

      for (let i = 0; i < n; i++) {
        const nextIdx = (i + 1) % n;
        const pCurrent = loop[i];
        const pNext = loop[nextIdx];

        const b0 = get3DPoint(pCurrent, zBottom);
        const b1 = get3DPoint(pNext, zBottom);
        const t0 = get3DPoint(pCurrent, zTop);
        const t1 = get3DPoint(pNext, zTop);

        if (!isHole) {
          // Outer perimeter: CCW loop, outward normal
          allTriangles.push([b0, b1, t1]);
          allTriangles.push([b0, t1, t0]);
        } else {
          // Hole perimeter: CW loop, inward normal (into hole cavity)
          allTriangles.push([b0, b1, t1]);
          allTriangles.push([b0, t1, t0]);
        }
      }
    }
  }

  buildWalls(outerCCW, false);
  for (const hole of holesCW) {
    buildWalls(hole, true);
  }

  // Weld all duplicated vertices to form a clean watertight indexed mesh
  return trianglesToMesh(allTriangles);
}
