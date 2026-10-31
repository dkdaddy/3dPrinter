/**
 * Knurled wheel generator (diamond / crosshatch knurl with rounded edges)
 */

import { ensureWinding, triangulatePolygonWithHoles } from './polygon.js';
import { trianglesToMesh } from './mesh.js';

// Triangle wave: 1 at phase 0 (ridge), 0 at phase PI (groove)
function ridge(phase) {
  const t = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
  return Math.abs(2 * t - 1);
}

/**
 * Builds a solid knurled wheel (axis = Z) with a custom through-hole.
 *
 * @param {Object} opts
 * @param {number} opts.outerDiameter - Across knurl peaks (before edge rounding)
 * @param {number} opts.width - Z height
 * @param {number} opts.knurlCount - Ridges around the circumference
 * @param {number} opts.knurlDepth - Peak-to-valley depth
 * @param {'diamond'|'straight'} [opts.knurlStyle='diamond']
 * @param {number} [opts.edgeRadius=1] - Fillet radius on both outer edges
 * @param {Array<[number, number]>} opts.hole - Hole polygon
 * @param {number} [opts.samplesPerRidge=8]
 * @param {number} [opts.edgeSteps=6]
 */
export function createKnurledWheelMesh(opts) {
  const {
    outerDiameter,
    width,
    knurlCount: n,
    knurlDepth: depth,
    knurlStyle = 'diamond',
    edgeRadius: e = 1,
    hole,
    samplesPerRidge = 8,
    edgeSteps = 6
  } = opts;

  const R = outerDiameter / 2;
  const arcPitch = (2 * Math.PI * R) / n;
  const angSteps = n * samplesPerRidge;

  // Z rows: fillet rows at both ends, uniform rows between
  const zs = [];
  for (let j = 0; j <= edgeSteps; j++) {
    zs.push(e * (1 - Math.cos((j / edgeSteps) * (Math.PI / 2))));
  }
  const bodyHeight = width - 2 * e;
  const bodySteps = Math.max(1, Math.round(bodyHeight / (arcPitch / samplesPerRidge)));
  for (let j = 1; j < bodySteps; j++) zs.push(e + (j / bodySteps) * bodyHeight);
  for (let j = edgeSteps; j >= 0; j--) {
    zs.push(width - e * (1 - Math.cos((j / edgeSteps) * (Math.PI / 2))));
  }

  const k = (2 * Math.PI) / arcPitch; // 45 degree helix
  function radius(theta, z) {
    const a = n * theta;
    const h = knurlStyle === 'straight'
      ? ridge(a)
      : Math.min(ridge(a + k * (z - e)), ridge(a - k * (z - e)));
    const inset = z < e
      ? e - Math.sqrt(Math.max(0, e * e - (e - z) ** 2))
      : z > width - e
        ? e - Math.sqrt(Math.max(0, e * e - (z - (width - e)) ** 2))
        : 0;
    return R - depth * (1 - h) - inset;
  }

  // rows[j][i] = [x, y, z]
  const rows = zs.map(z => {
    const row = [];
    for (let i = 0; i < angSteps; i++) {
      const theta = (i / angSteps) * 2 * Math.PI;
      const r = radius(theta, z);
      row.push([r * Math.cos(theta), r * Math.sin(theta), z]);
    }
    return row;
  });

  const triangles = [];

  // Outer wall (CCW loop, outward normals)
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < angSteps; i++) {
      const i2 = (i + 1) % angSteps;
      const b0 = rows[j][i];
      const b1 = rows[j][i2];
      const t0 = rows[j + 1][i];
      const t1 = rows[j + 1][i2];
      triangles.push([b0, b1, t1]);
      triangles.push([b0, t1, t0]);
    }
  }

  // Caps with the hole
  const holeCW = ensureWinding(hole, false);
  const bottom = rows[0].map(p => [p[0], p[1]]);
  const top = rows[rows.length - 1].map(p => [p[0], p[1]]);
  const capBottom = triangulatePolygonWithHoles(ensureWinding(bottom, true), [holeCW]);
  const capTop = triangulatePolygonWithHoles(ensureWinding(top, true), [holeCW]);
  for (const [a, b, c] of capBottom.triangles) {
    const v = capBottom.vertices;
    triangles.push([[...v[a], 0], [...v[c], 0], [...v[b], 0]]);
  }
  for (const [a, b, c] of capTop.triangles) {
    const v = capTop.vertices;
    triangles.push([[...v[a], width], [...v[b], width], [...v[c], width]]);
  }

  // Hole wall
  for (let i = 0; i < holeCW.length; i++) {
    const p0 = holeCW[i];
    const p1 = holeCW[(i + 1) % holeCW.length];
    const b0 = [p0[0], p0[1], 0];
    const b1 = [p1[0], p1[1], 0];
    const t0 = [p0[0], p0[1], width];
    const t1 = [p1[0], p1[1], width];
    triangles.push([b0, b1, t1]);
    triangles.push([b0, t1, t0]);
  }

  return trianglesToMesh(triangles);
}
