/**
 * 2D Polygon, Path & Triangulation Utilities
 */

export function vec2(x = 0, y = 0) {
  return [x, y];
}

export function distSq2(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

export function dist2(a, b) {
  return Math.sqrt(distSq2(a, b));
}

/**
 * Computes 2D cross product of vector OA and OB: (A.x - O.x)*(B.y - O.y) - (A.y - O.y)*(B.x - O.x)
 * > 0 for CCW turn, < 0 for CW turn, = 0 collinear.
 */
export function cross2D(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * Signed area using shoelace formula. Positive for CCW, negative for CW.
 */
export function polygonArea(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return area * 0.5;
}

export function isCCW(points) {
  return polygonArea(points) > 0;
}

export function ensureWinding(points, ccw = true) {
  const currentCCW = isCCW(points);
  if (currentCCW !== ccw) {
    return [...points].reverse();
  }
  return [...points];
}

function samePoint(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

/**
 * Checks if point P is strictly inside triangle (A, B, C)
 */
export function pointInTriangle(p, a, b, c) {
  const c1 = cross2D(a, b, p);
  const c2 = cross2D(b, c, p);
  const c3 = cross2D(c, a, p);

  const hasNeg = c1 < -1e-9 || c2 < -1e-9 || c3 < -1e-9;
  const hasPos = c1 > 1e-9 || c2 > 1e-9 || c3 > 1e-9;

  return !(hasNeg && hasPos);
}

/**
 * Checks if segment AB strictly intersects segment CD (excluding endpoints)
 */
export function segmentsIntersectStrict(a, b, c, d) {
  const ccw = (p1, p2, p3) => {
    return (p3[1] - p1[1]) * (p2[0] - p1[0]) > (p2[1] - p1[1]) * (p3[0] - p1[0]);
  };

  const d1 = cross2D(a, b, c);
  const d2 = cross2D(a, b, d);
  const d3 = cross2D(c, d, a);
  const d4 = cross2D(c, d, b);

  if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) &&
      ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) {
    return true;
  }

  return false;
}

/**
 * Ear clipping triangulation for a simple 2D polygon without holes (CCW order)
 * Returns array of [i, j, k] index triplets.
 */
export function triangulateSimplePolygon(points) {
  const n = points.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];

  const indices = [];
  for (let i = 0; i < n; i++) indices.push(i);

  const triangles = [];
  let count = indices.length;
  let attempts = 0;
  const maxAttempts = count * count * 2;

  while (count > 3 && attempts < maxAttempts) {
    attempts++;
    let earFound = false;

    for (let i = 0; i < count; i++) {
      const prevIdx = (i - 1 + count) % count;
      const currIdx = i;
      const nextIdx = (i + 1) % count;

      const pPrev = points[indices[prevIdx]];
      const pCurr = points[indices[currIdx]];
      const pNext = points[indices[nextIdx]];

      // Must be convex (> 0 for CCW)
      const cp = cross2D(pPrev, pCurr, pNext);
      if (cp <= 1e-9) continue;

      // Check if any other polygon point is inside this triangle
      let isEar = true;
      for (let j = 0; j < count; j++) {
        if (j === prevIdx || j === currIdx || j === nextIdx) continue;
        const pt = points[indices[j]];
        // Bridged holes duplicate vertices; coincident points must not block an ear
        if (samePoint(pt, pPrev) || samePoint(pt, pCurr) || samePoint(pt, pNext)) continue;
        if (pointInTriangle(pt, pPrev, pCurr, pNext)) {
          isEar = false;
          break;
        }
      }

      if (isEar) {
        triangles.push([indices[prevIdx], indices[currIdx], indices[nextIdx]]);
        indices.splice(currIdx, 1);
        count--;
        earFound = true;
        break;
      }
    }

    if (!earFound && count > 3) {
      // Fallback: pick the first convex vertex to avoid infinite loop on degenerate/flat vertices
      let bestIdx = -1;
      let maxCp = -Infinity;
      for (let i = 0; i < count; i++) {
        const prevIdx = (i - 1 + count) % count;
        const nextIdx = (i + 1) % count;
        const cp = cross2D(points[indices[prevIdx]], points[indices[i]], points[indices[nextIdx]]);
        if (cp > maxCp) {
          maxCp = cp;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        const prevIdx = (bestIdx - 1 + count) % count;
        const nextIdx = (bestIdx + 1) % count;
        triangles.push([indices[prevIdx], indices[bestIdx], indices[nextIdx]]);
        indices.splice(bestIdx, 1);
        count--;
      } else {
        break;
      }
    }
  }

  if (indices.length === 3) {
    triangles.push([indices[0], indices[1], indices[2]]);
  }

  return triangles;
}

/**
 * True when point p lies inside the interior wedge at vertex v of a CCW polygon (prev -> v -> next).
 */
function inCone(prev, v, next, p) {
  const left = (a, b, c) => cross2D(a, b, c) > 1e-9;
  const leftOn = (a, b, c) => cross2D(a, b, c) >= -1e-9;
  if (leftOn(v, next, prev)) {
    return left(v, p, prev) && left(p, v, next);
  }
  return !(leftOn(v, p, next) && leftOn(p, v, prev));
}

/**
 * Bridges holes into outer polygon and triangulates the combined polygon.
 * outer: array of [x, y] in CCW order
 * holes: array of arrays of [x, y]
 * Returns { vertices: [[x, y], ...], triangles: [[i, j, k], ...] }
 */
export function triangulatePolygonWithHoles(outer, holes = []) {
  let outerPoly = ensureWinding(outer, true);
  if (!holes || holes.length === 0) {
    const tris = triangulateSimplePolygon(outerPoly);
    return { vertices: outerPoly, triangles: tris };
  }

  // Sort holes by max X descending
  const sortedHoles = holes.map(h => ensureWinding(h, false)); // holes in CW
  sortedHoles.sort((hA, hB) => {
    const maxA = Math.max(...hA.map(p => p[0]));
    const maxB = Math.max(...hB.map(p => p[0]));
    return maxB - maxA;
  });

  let combined = [...outerPoly];

  for (const hole of sortedHoles) {
    // Find rightmost vertex of hole
    let maxHoleX = -Infinity;
    let holeIdx = 0;
    for (let i = 0; i < hole.length; i++) {
      if (hole[i][0] > maxHoleX) {
        maxHoleX = hole[i][0];
        holeIdx = i;
      }
    }
    const hPt = hole[holeIdx];

    // Find visible vertex in combined with x >= hPt.x and minimal distance
    let bestOuterIdx = -1;
    let minDist = Infinity;

    for (let i = 0; i < combined.length; i++) {
      const oPt = combined[i];
      if (oPt[0] < hPt[0] - 1e-6) continue;

      // Check if segment hPt -> oPt intersects any edge of combined or hole
      let intersects = false;
      const allPolys = [combined, hole];
      for (const poly of allPolys) {
        for (let e = 0; e < poly.length; e++) {
          const e1 = poly[e];
          const e2 = poly[(e + 1) % poly.length];
          // Skip if edge shares endpoint
          if ((e1[0] === hPt[0] && e1[1] === hPt[1]) || (e2[0] === hPt[0] && e2[1] === hPt[1]) ||
              (e1[0] === oPt[0] && e1[1] === oPt[1]) || (e2[0] === oPt[0] && e2[1] === oPt[1])) {
            continue;
          }
          if (segmentsIntersectStrict(hPt, oPt, e1, e2)) {
            intersects = true;
            break;
          }
        }
        if (intersects) break;
      }

      if (!intersects) {
        const d = distSq2(hPt, oPt);
        if (d < minDist) {
          minDist = d;
          bestOuterIdx = i;
        }
      }
    }

    if (bestOuterIdx === -1) {
      // Fallback: choose nearest vertex in combined
      for (let i = 0; i < combined.length; i++) {
        const d = distSq2(hPt, combined[i]);
        if (d < minDist) {
          minDist = d;
          bestOuterIdx = i;
        }
      }
    }

    // Bridged holes duplicate vertices; attach at the occurrence whose interior wedge faces the hole
    if (bestOuterIdx !== -1) {
      const target = combined[bestOuterIdx];
      const n = combined.length;
      for (let j = 0; j < n; j++) {
        if (!samePoint(combined[j], target)) continue;
        if (inCone(combined[(j - 1 + n) % n], combined[j], combined[(j + 1) % n], hPt)) {
          bestOuterIdx = j;
          break;
        }
      }
    }

    // Bridge insertion:
    // [0..bestOuterIdx] + [holeIdx..end, 0..holeIdx] + [bestOuterIdx..end]
    const holeCycle = [];
    for (let i = 0; i < hole.length; i++) {
      holeCycle.push(hole[(holeIdx + i) % hole.length]);
    }
    holeCycle.push(hole[holeIdx]); // return to bridge start on hole

    combined = [
      ...combined.slice(0, bestOuterIdx + 1),
      ...holeCycle,
      ...combined.slice(bestOuterIdx)
    ];
  }

  const triangles = triangulateSimplePolygon(combined);
  return { vertices: combined, triangles };
}

/**
 * Common 2D Shapes for 3D Printing
 */

export function createCircle(radius, segments = 48) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
  }
  return points;
}

export function createRectangle(width, height, center = true) {
  const hw = width / 2;
  const hh = height / 2;
  if (center) {
    return [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh]
    ];
  }
  return [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height]
  ];
}

export function createRoundedRectangle(width, height, radius, segmentsPerCorner = 8) {
  const r = Math.min(radius, width / 2, height / 2);
  const hw = width / 2 - r;
  const hh = height / 2 - r;
  const points = [];

  const corners = [
    { cx: hw, cy: hh, start: 0, end: Math.PI / 2 },
    { cx: -hw, cy: hh, start: Math.PI / 2, end: Math.PI },
    { cx: -hw, cy: -hh, start: Math.PI, end: (3 * Math.PI) / 2 },
    { cx: hw, cy: -hh, start: (3 * Math.PI) / 2, end: 2 * Math.PI }
  ];

  for (const c of corners) {
    for (let i = 0; i < segmentsPerCorner; i++) {
      const angle = c.start + (i / segmentsPerCorner) * (c.end - c.start);
      points.push([c.cx + r * Math.cos(angle), c.cy + r * Math.sin(angle)]);
    }
  }

  return points;
}

/**
 * Creates a D-shaft hole profile (e.g. for NEMA 17 or DC motor shafts)
 * diameter: full shaft diameter (e.g. 5mm)
 * flatDistance: distance from curved edge to flat edge (e.g. 4.5mm),
 * or distance from center = flatDistance - diameter/2.
 */
export function createDShaftHole(diameter, flatDistance = diameter * 0.9, segments = 36) {
  const r = diameter / 2;
  const flatY = flatDistance - r; // distance from center to flat chord
  const points = [];

  // Flat chord angle
  const flatAngle = Math.acos(Math.max(-1, Math.min(1, flatY / r)));

  // Arc portion from -flatAngle to +flatAngle (or opposite)
  const arcSegments = segments - 2;
  for (let i = 0; i <= arcSegments; i++) {
    const angle = flatAngle + (i / arcSegments) * (2 * Math.PI - 2 * flatAngle);
    points.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }

  // Flat line
  points.push([r * Math.cos(flatAngle), flatY]);
  points.push([r * Math.cos(-flatAngle), flatY]);

  return points;
}
