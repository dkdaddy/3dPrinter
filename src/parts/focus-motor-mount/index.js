import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  export3MF,
  trianglesToMesh,
  triangulatePolygonWithHoles,
  triangulateSimplePolygon,
  createCircle,
  computeBoundingBox,
  computeMeshVolumeAndArea,
  checkWatertight,
  estimateFilament
} from '../../utils/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Focus stepper motor mount.
 *
 * Coordinates: X along the 70mm long edge, Y along the 40mm short edge, Z up.
 * The plate sits at Z 0..plateThickness; the locating stud and the upright wall
 * both rise from the plate's top face. The wall spans the full plate width (Y).
 * Three through-slots (two screw slots and a spindle slot) run along X so the motor can be
 * repositioned. The motor bolts are further apart than the screw slots, so the motor is twisted
 * and the slots are staggered and offset to follow it (see slotLayout).
 */
export const DEFAULT_FOCUS_MOTOR_MOUNT_CONFIG = {
  name: 'focus-motor-mount',
  plateLength: 70,      // mm, X
  plateWidth: 40,       // mm, Y
  plateThickness: 3,    // mm
  studDiameter: 8.3,    // mm
  studHeight: 10,       // mm above the plate
  studFromLongEdge: 10, // mm, stud centre to the long edge (Y = 0)
  studFromShortEdge: 10, // mm, stud centre to the short edge (X = 0)
  wallThickness: 3,     // mm
  wallHeight: 15,       // mm above the plate
  wallOffsetFromStud: 11.5, // mm, wall mid-plane to stud centre, along +X
  slotStartFromStudEnd: 24, // mm, start of the slot group, measured from X = 0 (1mm clear of the wall)
  slotEndFromStudEnd: 65,   // mm, end of the slot group, measured from X = 0
  screwSpacing: 30,     // mm, between the two screw slot centre lines (across the plate)
  screwSlotWidth: 4,    // mm
  spindleSlotWidth: 12, // mm
  motorBoltSpacing: 35, // mm, actual bolt spacing on the motor; wider than screwSpacing so the motor is twisted
  motorShaftOffset: 10, // mm, shaft distance from the bolt line (perpendicular to it)
  shaftSide: 'stud',    // 'stud' = shaft on the stud/wall (low X) side of the bolt line, 'far' = other side
  lowYBoltToward: 'stud', // twist direction: the bolt on the Y = 0 side moves toward 'stud' (low X) or 'far'
  minSlotWall: 1,       // mm, minimum material between slots
  plateCornerRadius: 6, // mm, vertical corners of the base plate
  wallCornerRadius: 6,  // mm, top corners of the upright wall
  wallHoleDiameter: 4,  // mm, two fixing holes through the upright wall
  wallHoleInset: 8,     // mm, hole centres from the wall's side and top edges
  wallHoleSegments: 32,
  baseHoleDiameter: 4,  // mm, fixing hole in the base plate
  baseHoleFromStudEnd: 10, // mm, hole centre from the stud end (X = 0); centred across the width
  baseHoleSegments: 32,
  cornerSegments: 16,   // per 90 degree corner
  slotCapSegments: 16,
  studSegments: 64
};

/** Points along an arc (degrees, CCW); a zero radius collapses to the single corner point. */
function arcPoints(cx, cy, r, startDeg, endDeg, segments) {
  if (r <= 0) return [[cx, cy]];
  const clean = v => Math.round(v * 1e12) / 1e12;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = ((startDeg + (i / segments) * (endDeg - startDeg)) * Math.PI) / 180;
    pts.push([cx + r * clean(Math.cos(a)), cy + r * clean(Math.sin(a))]);
  }
  return pts;
}

/** Stadium-shaped outline (CCW) with its long axis along X. */
function createSlotOutline(cx, cy, length, width, segments) {
  const r = width / 2;
  const half = (length - width) / 2;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = -Math.PI / 2 + (i / segments) * Math.PI;
    pts.push([cx + half + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI / 2 + (i / segments) * Math.PI;
    pts.push([cx - half + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/**
 * Slot layout for a motor whose mounting bolts are further apart (motorBoltSpacing) than the slots
 * (screwSpacing), so it is twisted by acos(screwSpacing / motorBoltSpacing). The shaft sits
 * motorShaftOffset from the bolt line, perpendicular to it, so the twist also shifts it sideways.
 * Each slot spans the motor's travel plus its own width; the whole group fits the slotStart..slotEnd envelope.
 * Returns { slots: [{ name, x0, x1, cx, cy, width }], travel, twistDeg, shaftShiftY }.
 */
export function slotLayout(customConfig = {}) {
  const c = { ...DEFAULT_FOCUS_MOTOR_MOUNT_CONFIG, ...customConfig };
  const ratio = c.screwSpacing / c.motorBoltSpacing;
  if (ratio <= 0 || ratio > 1) {
    throw new Error('Motor bolt spacing must be at least the screw slot spacing');
  }
  const theta = Math.acos(ratio);
  // Rotation angle: the bolt on the low-Y side moves toward the stud end when lowYBoltToward is 'stud'
  const phi = c.lowYBoltToward === 'stud' ? -theta : theta;
  const sideSign = c.shaftSide === 'stud' ? -1 : 1;
  const cy = c.plateWidth / 2;
  const half = c.motorBoltSpacing / 2;

  // Positions relative to the bolt-line midpoint
  const parts = [
    { name: 'screwLow', dx: half * Math.sin(phi), dy: -half * Math.cos(phi), width: c.screwSlotWidth },
    { name: 'spindle', dx: sideSign * c.motorShaftOffset * Math.cos(phi), dy: sideSign * c.motorShaftOffset * Math.sin(phi), width: c.spindleSlotWidth },
    { name: 'screwHigh', dx: -half * Math.sin(phi), dy: half * Math.cos(phi), width: c.screwSlotWidth }
  ];
  const lowest = Math.min(...parts.map(p => p.dx - p.width / 2));
  const highest = Math.max(...parts.map(p => p.dx + p.width / 2));
  const travelStart = c.slotStartFromStudEnd - lowest;
  const travelEnd = c.slotEndFromStudEnd - highest;
  const travel = travelEnd - travelStart;

  const slots = parts.map(p => {
    const x0 = travelStart + p.dx - p.width / 2;
    const x1 = travelEnd + p.dx + p.width / 2;
    return { name: p.name, x0, x1, cx: (x0 + x1) / 2, cy: cy + p.dy, width: p.width };
  });
  return { slots, travel, twistDeg: (theta * 180) / Math.PI, shaftShiftY: parts[1].dy };
}

/**
 * Base plate fixing hole: baseHoleFromStudEnd from the stud end (X = 0), centred across the plate width.
 * Returns { x, y, studGap, wallGap } where the gaps are clear material to the stud and the wall.
 */
export function baseHolePosition(customConfig = {}) {
  const c = { ...DEFAULT_FOCUS_MOTOR_MOUNT_CONFIG, ...customConfig };
  const sx = c.studFromShortEdge;
  const sy = c.studFromLongEdge;
  const sr = c.studDiameter / 2;
  const hr = c.baseHoleDiameter / 2;
  const w0 = sx + c.wallOffsetFromStud - c.wallThickness / 2;
  const x = c.baseHoleFromStudEnd;
  const y = c.plateWidth / 2;
  return { x, y, studGap: Math.hypot(x - sx, y - sy) - sr - hr, wallGap: w0 - hr - x };
}

/** Builds the mount as a single watertight solid (true union, no overlapping shells). */
export function createFocusMotorMountMesh(customConfig = {}) {
  const c = { ...DEFAULT_FOCUS_MOTOR_MOUNT_CONFIG, ...customConfig };
  const L = c.plateLength;
  const W = c.plateWidth;
  const T = c.plateThickness;
  const H = T + c.wallHeight;
  const sx = c.studFromShortEdge;
  const sy = c.studFromLongEdge;
  const sr = c.studDiameter / 2;
  const sTop = T + c.studHeight;
  const wallMid = sx + c.wallOffsetFromStud;
  const w0 = wallMid - c.wallThickness / 2;
  const w1 = wallMid + c.wallThickness / 2;

  if (sx - sr < 0 || sx + sr > w0 || sy - sr < 0 || sy + sr > W || w1 > L) {
    throw new Error('Stud and wall do not fit on the plate with these dimensions');
  }
  const { slots, travel } = slotLayout(c);
  if (travel <= 0) {
    throw new Error('Slot envelope is too short for the twisted motor layout');
  }
  for (const s of slots) {
    if (s.x0 < w1 + c.minSlotWall - 1e-9 || s.x1 >= L || s.cy - s.width / 2 <= 0 || s.cy + s.width / 2 >= W) {
      throw new Error('Slots do not fit on the plate with these dimensions');
    }
  }
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      const xGap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
      const yGap = Math.abs(a.cy - b.cy) - (a.width + b.width) / 2;
      if (xGap < c.minSlotWall && yGap < c.minSlotWall) {
        throw new Error('Slots overlap or leave less than the minimum wall between them');
      }
    }
  }
  const outlines = slots.map(s => createSlotOutline(s.cx, s.cy, s.x1 - s.x0, s.width, c.slotCapSegments));

  const baseHole = baseHolePosition(c);
  const baseHr = c.baseHoleDiameter / 2;
  if (baseHole.studGap < c.minSlotWall || baseHole.wallGap < c.minSlotWall ||
      baseHole.x - baseHr < c.minSlotWall || baseHole.y - baseHr < c.minSlotWall || baseHole.y + baseHr > W - c.minSlotWall) {
    throw new Error('Base plate hole does not fit with these dimensions');
  }
  const baseHoleOutline = createCircle(baseHr, c.baseHoleSegments).map(([x, y]) => [baseHole.x + x, baseHole.y + y]);

  const rc = c.plateCornerRadius;
  const rw = c.wallCornerRadius;
  const cornerSegments = c.cornerSegments;
  const wallArcBase = H - rw;
  if (rc < 0 || rw < 0 || 2 * rc > Math.min(L, W) || w0 < rc || w1 > L - rc || 2 * rw > W || rw > c.wallHeight) {
    throw new Error('Corner radii do not fit with these dimensions');
  }
  // Plate outline in plan (CCW); each corner is an arc, straight edges join them
  const plan = [
    ...arcPoints(L - rc, rc, rc, -90, 0, cornerSegments),
    ...arcPoints(L - rc, W - rc, rc, 0, 90, cornerSegments),
    ...arcPoints(rc, W - rc, rc, 90, 180, cornerSegments),
    ...arcPoints(rc, rc, rc, 180, 270, cornerSegments)
  ];

  // Fixing holes through the wall, inset from the side and top edges
  const hr = c.wallHoleDiameter / 2;
  const holeCentres = [[c.wallHoleInset, H - c.wallHoleInset], [W - c.wallHoleInset, H - c.wallHoleInset]];
  const wallHoles = holeCentres.map(([hy, hz]) =>
    createCircle(hr, c.wallHoleSegments).map(([y, z]) => [hy + y, hz + z]));
  for (const [hy, hz] of holeCentres) {
    const cornerCentre = hy < W / 2 ? [rw, wallArcBase] : [W - rw, wallArcBase];
    const inCorner = hz > wallArcBase && (hy < rw || hy > W - rw);
    const clearOfCorner = !inCorner || Math.hypot(hy - cornerCentre[0], hz - cornerCentre[1]) + hr + c.minSlotWall <= rw;
    if (hy - hr < c.minSlotWall || hy + hr > W - c.minSlotWall || hz + hr > H - c.minSlotWall ||
        hz - hr < T + c.minSlotWall || !clearOfCorner) {
      throw new Error('Wall fixing holes do not fit with these dimensions');
    }
  }
  if (holeCentres[1][0] - holeCentres[0][0] < c.wallHoleDiameter + c.minSlotWall) {
    throw new Error('Wall fixing holes overlap each other');
  }

  const tris = [];
  // Adds triangles, flipping any whose normal opposes `outward`.
  const addFace = (list, outward) => {
    for (const [a, b, d] of list) {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const dot = n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2];
      tris.push(dot >= 0 ? [a, b, d] : [a, d, b]);
    }
  };
  const polyFace = (pts3, outward) => {
    // Triangulate in the 2D plane that drops the axis `outward` points along.
    const axis = outward.findIndex(v => v !== 0);
    const keep = [0, 1, 2].filter(i => i !== axis);
    const pts2 = pts3.map(p => [p[keep[0]], p[keep[1]]]);
    addFace(triangulateSimplePolygon(pts2).map(t => t.map(i => pts3[i])), outward);
  };
  // Horizontal face at height z with optional holes.
  const flatFace = (outer, holes, z, outward) => {
    const tri = triangulatePolygonWithHoles(outer, holes);
    addFace(tri.triangles.map(t => t.map(i => [tri.vertices[i][0], tri.vertices[i][1], z])), outward);
  };

  // Bottom (with slot openings)
  flatFace(plan, [...outlines, baseHoleOutline], 0, [0, 0, -1]);
  // Plate edge faces: corner arcs and the X = 0 / X = L ends are plain quads
  for (let i = 0; i < plan.length; i++) {
    const [x0, y0] = plan[i];
    const [x1, y1] = plan[(i + 1) % plan.length];
    if (Math.abs(y0 - y1) < 1e-9 && (Math.abs(y0) < 1e-9 || Math.abs(y0 - W) < 1e-9)) continue; // long sides carry the wall profile
    addFace(
      [[[x0, y0, 0], [x1, y1, 0], [x1, y1, T]], [[x0, y0, 0], [x1, y1, T], [x0, y0, T]]],
      [y1 - y0, x0 - x1, 0]
    );
  }
  // Long side faces carry the L-shaped profile (plate + wall)
  const profile = y => [
    [rc, y, 0], [L - rc, y, 0], [L - rc, y, T], [w1, y, T], [w1, y, wallArcBase], [w0, y, wallArcBase], [w0, y, T], [rc, y, T]
  ];
  polyFace(profile(0), [0, -1, 0]);
  polyFace(profile(W), [0, 1, 0]);

  // Wall faces (x = w0 and x = w1): rectangle with rounded top corners and the fixing holes, outline in (y, z)
  const wallOutline = [
    [0, T], [W, T],
    ...arcPoints(W - rw, wallArcBase, rw, 0, 90, cornerSegments),
    ...arcPoints(rw, wallArcBase, rw, 90, 180, cornerSegments)
  ];
  const wallFace = (x, outward) => {
    const tri = triangulatePolygonWithHoles(wallOutline, wallHoles);
    addFace(tri.triangles.map(t => t.map(i => [x, tri.vertices[i][0], tri.vertices[i][1]])), outward);
  };
  wallFace(w0, [-1, 0, 0]);
  wallFace(w1, [1, 0, 0]);
  // Hole walls: faces point toward the hole centre (away from the solid)
  for (const [hy, hz] of holeCentres) {
    const ring = createCircle(hr, c.wallHoleSegments).map(([y, z]) => [hy + y, hz + z]);
    for (let i = 0; i < ring.length; i++) {
      const [ya, za] = ring[i];
      const [yb, zb] = ring[(i + 1) % ring.length];
      addFace(
        [[[w0, ya, za], [w1, ya, za], [w1, yb, zb]], [[w0, ya, za], [w1, yb, zb], [w0, yb, zb]]],
        [0, hy - (ya + yb) / 2, hz - (za + zb) / 2]
      );
    }
  }
  // Wall top and the curved strips of the rounded corners between the two faces
  polyFace([[w0, rw, H], [w1, rw, H], [w1, W - rw, H], [w0, W - rw, H]], [0, 0, 1]);
  const wallArcs = [
    arcPoints(W - rw, wallArcBase, rw, 0, 90, cornerSegments),
    arcPoints(rw, wallArcBase, rw, 90, 180, cornerSegments)
  ];
  for (const arc of wallArcs) {
    for (let i = 0; i + 1 < arc.length; i++) {
      const [ya, za] = arc[i];
      const [yb, zb] = arc[i + 1];
      addFace(
        [[[w0, ya, za], [w1, ya, za], [w1, yb, zb]], [[w0, ya, za], [w1, yb, zb], [w0, yb, zb]]],
        [0, zb - za, ya - yb]
      );
    }
  }

  // Plate top, right of the wall, with slot openings
  const rightRegion = [
    [w1, 0],
    ...arcPoints(L - rc, rc, rc, -90, 0, cornerSegments),
    ...arcPoints(L - rc, W - rc, rc, 0, 90, cornerSegments),
    [w1, W]
  ];
  flatFace(rightRegion, outlines, T, [0, 0, 1]);

  // Slot walls: the solid lies to the right of each CCW outline edge, so faces point left (into the slot)
  for (const outline of [...outlines, baseHoleOutline]) {
    for (let i = 0; i < outline.length; i++) {
      const [x0, y0] = outline[i];
      const [x1, y1] = outline[(i + 1) % outline.length];
      addFace(
        [[[x0, y0, 0], [x1, y1, 0], [x1, y1, T]], [[x0, y0, 0], [x1, y1, T], [x0, y0, T]]],
        [y0 - y1, x1 - x0, 0]
      );
    }
  }

  // Plate top, left of the wall, with the stud footprint cut out
  const ring = createCircle(sr, c.studSegments).map(([x, y]) => [sx + x, sy + y]);
  const leftRegion = [
    ...arcPoints(rc, W - rc, rc, 90, 180, cornerSegments),
    ...arcPoints(rc, rc, rc, 180, 270, cornerSegments),
    [w0, 0], [w0, W]
  ];
  flatFace(leftRegion, [ring, baseHoleOutline], T, [0, 0, 1]);

  // Stud wall and cap
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    const mid = [(x0 + x1) / 2 - sx, (y0 + y1) / 2 - sy, 0];
    addFace([[[x0, y0, T], [x1, y1, T], [x1, y1, sTop]], [[x0, y0, T], [x1, y1, sTop], [x0, y0, sTop]]], mid);
    addFace([[[sx, sy, sTop], [x0, y0, sTop], [x1, y1, sTop]]], [0, 0, 1]);
  }

  return trianglesToMesh(tris);
}

/** Key dimensions for the viewer overlay (mm, relative to the model's minimum corner). */
export function focusMotorMountDimensions(customConfig = {}) {
  const c = { ...DEFAULT_FOCUS_MOTOR_MOUNT_CONFIG, ...customConfig };
  const L = c.plateLength;
  const W = c.plateWidth;
  const T = c.plateThickness;
  const H = T + c.wallHeight;
  const sx = c.studFromShortEdge;
  const sy = c.studFromLongEdge;
  const sr = c.studDiameter / 2;
  const wallMid = sx + c.wallOffsetFromStud;
  const w0 = wallMid - c.wallThickness / 2;
  const w1 = wallMid + c.wallThickness / 2;
  const f = v => `${parseFloat(v.toFixed(2))}`;
  const baseHole = baseHolePosition(c);
  const { slots, shaftShiftY } = slotLayout(c);
  const [screwLow, spindle, screwHigh] = slots;
  // Place the spacing dimension in the gap between the spindle and high screw slots when they are staggered
  const spacingX = screwHigh.x0 > spindle.x1 ? (screwHigh.x0 + spindle.x1) / 2 : (screwHigh.x0 + screwHigh.x1) / 2;

  return [
    { label: f(L), from: [0, 0, 0], to: [L, 0, 0], offset: [0, -8, 0] },
    { label: f(W), from: [L, 0, 0], to: [L, W, 0], offset: [8, 0, 0] },
    { label: f(T), from: [L, W, 0], to: [L, W, T], offset: [0, 8, 0], labelLift: 3 },
    { label: f(H), from: [0, 0, 0], to: [0, 0, H], offset: [-8, 0, 0] },
    { label: `${f(c.studHeight)}`, from: [sx - sr, sy, T], to: [sx - sr, sy, T + c.studHeight], offset: [-6, 0, 0] },
    { label: `Ø${f(c.studDiameter)}`, from: [sx, sy - sr, H], to: [sx, sy + sr, H], offset: [0, -9, 0] },
    { label: f(sx), from: [0, sy, T], to: [sx, sy, T], offset: [0, 0, 0], labelLift: 2.5 },
    { label: f(sy), from: [sx, 0, T], to: [sx, sy, T], offset: [0, 0, 0], labelLift: 2.5 },
    { label: f(c.wallOffsetFromStud), from: [sx, sy, H], to: [wallMid, sy, H], offset: [0, 0, 6] },
    { label: f(c.wallThickness), from: [w0, W, H], to: [w1, W, H], offset: [0, 8, 0] },
    { label: f(c.wallHeight), from: [w1, W, T], to: [w1, W, H], offset: [8, 0, 0] },
    { label: f(c.wallHoleInset), from: [w1, 0, H - c.wallHoleInset], to: [w1, c.wallHoleInset, H - c.wallHoleInset], offset: [4, 0, 0] },
    { label: f(c.wallHoleInset), from: [w1, c.wallHoleInset, H], to: [w1, c.wallHoleInset, H - c.wallHoleInset], offset: [4, 0, 0] },
    { label: `Ø${f(c.wallHoleDiameter)}`, from: [w1, W - c.wallHoleInset - c.wallHoleDiameter / 2, H - c.wallHoleInset], to: [w1, W - c.wallHoleInset + c.wallHoleDiameter / 2, H - c.wallHoleInset], offset: [4, 0, 6] },
    { label: f(baseHole.x), from: [0, baseHole.y, T], to: [baseHole.x, baseHole.y, T], offset: [0, 0, 0], labelLift: 2.5 },
    { label: `Ø${f(c.baseHoleDiameter)}`, from: [baseHole.x - c.baseHoleDiameter / 2, baseHole.y, T], to: [baseHole.x + c.baseHoleDiameter / 2, baseHole.y, T], offset: [0, 0, 8] },
    { label: f(c.slotStartFromStudEnd), from: [0, W, T], to: [c.slotStartFromStudEnd, W, T], offset: [0, 16, 0] },
    { label: f(spindle.x1 - spindle.x0), from: [spindle.x0, W, T], to: [spindle.x1, W, T], offset: [0, 6, 0] },
    { label: f(screwHigh.x1 - screwHigh.x0), from: [screwHigh.x0, W, T], to: [screwHigh.x1, W, T], offset: [0, 6, 0] },
    { label: f(screwLow.x1 - screwLow.x0), from: [screwLow.x0, 0, T], to: [screwLow.x1, 0, T], offset: [0, -5, 0] },
    { label: f(L - c.slotEndFromStudEnd), from: [c.slotEndFromStudEnd, W, T], to: [L, W, T], offset: [0, 16, 0] },
    { label: f(screwHigh.cy - screwLow.cy), from: [spacingX, screwLow.cy, T], to: [spacingX, screwHigh.cy, T], offset: [0, 0, 0], labelLift: 2.5 },
    { label: f(c.spindleSlotWidth), from: [spindle.x0 + 6, spindle.cy - c.spindleSlotWidth / 2, T], to: [spindle.x0 + 6, spindle.cy + c.spindleSlotWidth / 2, T], offset: [0, 0, 0] },
    ...(Math.abs(shaftShiftY) > 0.05
      ? [{ label: f(Math.abs(shaftShiftY)), from: [spindle.x0 + 14, W / 2, T], to: [spindle.x0 + 14, spindle.cy, T], offset: [0, 0, 0], labelLift: 2.5 }]
      : [])
  ];
}

/**
 * Generates the focus motor mount 3MF.
 * @param {Object} [customConfig]
 */
export function generateFocusMotorMount(customConfig = {}) {
  const config = { ...DEFAULT_FOCUS_MOTOR_MOUNT_CONFIG, ...customConfig };
  const mesh = createFocusMotorMountMesh(config);

  const outputPath = customConfig.outputPath || path.resolve(__dirname, '../../../output', `${config.name}.3mf`);
  export3MF(outputPath, mesh, { name: config.name });
  fs.writeFileSync(
    outputPath.replace(/\.3mf$/i, '') + '.dims.json',
    JSON.stringify({ dimensions: focusMotorMountDimensions(config) }, null, 2)
  );

  const bbox = computeBoundingBox(mesh);
  const { volume } = computeMeshVolumeAndArea(mesh);
  const filament = estimateFilament(volume);
  const round2 = v => Math.round(v * 100) / 100;
  const stats = {
    filePath: path.resolve(outputPath),
    fileName: path.basename(outputPath),
    triangles: mesh.faces.length,
    vertices: mesh.vertices.length,
    boundingBox: { widthX: round2(bbox.size[0]), depthY: round2(bbox.size[1]), heightZ: round2(bbox.size[2]) },
    volumeMm3: filament.volumeMm3,
    estimatedWeightGrams: filament.weightGrams,
    isWatertight: checkWatertight(mesh).isWatertight
  };

  console.log(`\n======================================================`);
  console.log(`  3D PRINTER PART GENERATOR: ${config.name.toUpperCase()}`);
  console.log(`======================================================`);
  console.log(`  - Plate:             ${config.plateLength} x ${config.plateWidth} x ${config.plateThickness} mm`);
  console.log(`  - Stud:              Ø${config.studDiameter} x ${config.studHeight} mm at X=${config.studFromShortEdge}, Y=${config.studFromLongEdge}`);
  console.log(`  - Wall:              ${config.wallThickness} x ${config.plateWidth} x ${config.wallHeight} mm, centre ${config.wallOffsetFromStud} mm from stud`);
  const layout = slotLayout(config);
  console.log(`  - Motor twist:       ${layout.twistDeg.toFixed(1)}° (bolts ${config.motorBoltSpacing} mm, slots ${config.screwSpacing} mm apart); shaft shifts ${layout.shaftShiftY.toFixed(2)} mm in Y; motor travel ${layout.travel.toFixed(2)} mm`);
  for (const s of layout.slots) {
    console.log(`  - Slot ${s.name.padEnd(9)}   X ${s.x0.toFixed(2)}-${s.x1.toFixed(2)}, Y centre ${s.cy.toFixed(2)}, ${s.width} mm wide`);
  }
  const baseHole = baseHolePosition(config);
  console.log(`  - Wall holes:        2 x Ø${config.wallHoleDiameter} mm, ${config.wallHoleInset} mm in from the side and top edges`);
  console.log(`  - Base plate hole:   Ø${config.baseHoleDiameter} mm at X=${baseHole.x}, Y=${baseHole.y} (${baseHole.x} mm from the stud end, centred across the width)`);
  console.log(`  - Dimensions (XYZ):  ${stats.boundingBox.widthX} x ${stats.boundingBox.depthY} x ${stats.boundingBox.heightZ} mm`);
  console.log(`  - Watertight Mesh:   ${stats.isWatertight ? 'YES (Solid manifold)' : 'NO'}`);
  console.log(`  - Estimated Weight:  ${stats.estimatedWeightGrams} g (PLA)`);
  console.log(`  - Saved To:          ${stats.filePath}`);
  console.log(`======================================================\n`);

  return { config, stats };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};
  const numeric = {
    '--length': 'plateLength',
    '--width': 'plateWidth',
    '--thickness': 'plateThickness',
    '--stud-dia': 'studDiameter',
    '--stud-height': 'studHeight',
    '--stud-from-long-edge': 'studFromLongEdge',
    '--stud-from-short-edge': 'studFromShortEdge',
    '--wall-thickness': 'wallThickness',
    '--wall-height': 'wallHeight',
    '--wall-offset': 'wallOffsetFromStud',
    '--slot-start': 'slotStartFromStudEnd',
    '--slot-end': 'slotEndFromStudEnd',
    '--screw-spacing': 'screwSpacing',
    '--screw-slot-width': 'screwSlotWidth',
    '--spindle-slot-width': 'spindleSlotWidth',
    '--corner-radius': 'plateCornerRadius',
    '--wall-corner-radius': 'wallCornerRadius',
    '--motor-bolt-spacing': 'motorBoltSpacing',
    '--shaft-offset': 'motorShaftOffset'
  };
  const choice = {
    '--shaft-side': ['shaftSide', ['stud', 'far']],
    '--low-bolt-toward': ['lowYBoltToward', ['stud', 'far']]
  };
  for (let i = 0; i < args.length; i++) {
    if (numeric[args[i]] && args[i + 1]) config[numeric[args[i]]] = parseFloat(args[++i]);
    else if (choice[args[i]] && args[i + 1]) {
      const [key, allowed] = choice[args[i]];
      if (!allowed.includes(args[i + 1])) throw new Error(`${args[i]} must be one of: ${allowed.join(', ')}`);
      config[key] = args[++i];
    }
    else if (args[i] === '--out' && args[i + 1]) config.outputPath = args[++i];
  }
  return config;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  generateFocusMotorMount(parseArgs());
}
