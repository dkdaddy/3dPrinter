/**
 * Vixen-style dovetail clamp (female receiver) for the 34 mm / 75 deg dovetail bar, modelled on the
 * ACOLY dovetail base mount photo.
 *
 *   node scripts/vixen-clamp.js [out.3mf] [--width 44] [--length 38] [--height 15] [--floor 8]
 *        [--slot-width 34] [--clearance 0.4] [--angle 75] [--jaw-gap 8] [--wall-thickness 0]
 *        [--screw-d 4.2] [--screw-z 11.5] [--screw-sides 1]
 *        [--recess-w 10] [--recess-l 24] [--recess-depth 2] [--centre-hole 6] [--centre-hole-y 6]
 *        [--hole 6] [--hole-x 10] [--hole-y 10]
 *
 * Outer size from the owner (44 x 38 x 15 mm, 8 mm base); the rest is read from its photo or
 * assumed (see notes/vixen-clamp.md). Coordinates: X across the clamp (centred on 0), Y along the
 * dovetail channel (0..length, the bar slides in from either end), Z up with the floor on the bed.
 *
 * - A flat base plate (--floor thick) with two identical jaw walls of uniform thickness, leaning
 *   inward at --angle from the base so they overhang the bar. The channel is --slot-width +
 *   --clearance wide at the floor; the overhang is 15 deg from vertical, so it prints without supports.
 * - Each jaw is split into two blocks by a --jaw-gap wide notch down to the floor.
 * - Thumbscrews square to the wall (15 deg below horizontal) through the -X jaw, one per block
 *   (two in total); --screw-sides 2 puts them on both jaws.
 * - Floor: a shallow oblong recess with two through holes in its middle, and four fixing holes.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  export3MF,
  load3MFMesh,
  read3MF,
  computeBoundingBox,
  computeMeshVolumeAndArea,
  checkWatertight
} from '../src/utils/index.js';
import { initManifold } from './lib/manifold-mesh.js';

export const DEFAULTS = {
  width: 44,         // mm, X
  length: 38,        // mm, Y (along the channel)
  height: 15,        // mm, Z
  floor: 8,          // mm, floor thickness under the channel
  slotWidth: 34,     // mm, bar width at its base (wide face)
  clearance: 0.4,    // mm, added to the channel floor width
  angle: 75,         // degrees, flank angle from the floor
  jawGap: 8,         // mm, notch splitting each jaw into two blocks
  wallThickness: 0,  // mm, square to the wall; 0 = fill the base width (about 4.6 mm)
  screwD: 4.2,       // mm, thumbscrew hole (M5 tap size)
  screwZ: 11.5,      // mm, height of the screw axis at the wall mid-plane
  screwSides: 1,     // 1 = -X jaw only (as in the photo), 2 = both jaws
  recessW: 10,       // mm, oblong recess width (X)
  recessL: 24,       // mm, oblong recess length (Y)
  recessDepth: 2,    // mm, below the channel floor level
  centreHole: 6,     // mm, two through holes in the recess
  centreHoleY: 6,    // mm, their offset from the centre along Y
  hole: 6,           // mm, four floor fixing holes (M6, as on the owner's metal shoe)
  holeX: 10,         // mm, hole offset from the centre across X (20 mm square pattern)
  holeY: 10          // mm, hole offset from the centre along Y
};

export async function createVixenClampMesh(overrides = {}) {
  const c = { ...DEFAULTS, ...overrides };
  const { Manifold, fromManifold, cylZ } = await initManifold();

  const a = (c.angle * Math.PI) / 180;
  const tan = Math.tan(a);
  const floorW = c.slotWidth + c.clearance;
  const widthAt = z => floorW - (2 * (z - c.floor)) / tan; // channel width (between inner faces)
  // Horizontal wall thickness; default puts the wall's outer foot on the base edge
  const wallT = c.wallThickness || ((c.width - floorW) / 2) * Math.sin(a);
  const hT = wallT / Math.sin(a);
  const h = c.height;
  const rise = (h - c.floor) / tan; // inward lean of each wall over its height

  // Base plate plus two identical walls leaning inward at `angle`, uniform thickness
  const base = Manifold.cube([c.width, c.length, c.floor]).translate([-c.width / 2, 0, 0]);
  const wall = side => {
    const xi = floorW / 2, xo = floorW / 2 + hT; // |x| of inner / outer foot
    const pts = [[xi, c.floor - 0.01], [xo, c.floor - 0.01], [xi - rise, h], [xo - rise, h]];
    return Manifold.hull(pts.flatMap(([x, z]) => [[side * x, 0, z], [side * x, c.length, z]]));
  };

  const cy = c.length / 2;
  let solid = base.add(wall(-1)).add(wall(1))
    // notch splitting each jaw in two
    .subtract(Manifold.cube([c.width + 2, c.jawGap, h]).translate([-c.width / 2 - 1, cy - c.jawGap / 2, c.floor]));

  // Central oblong recess with two through holes
  const half = (c.recessL - c.recessW) / 2;
  const r = c.recessW / 2;
  const recessZ0 = c.floor - c.recessDepth;
  solid = solid
    .subtract(Manifold.cube([c.recessW, 2 * half, c.recessDepth + 1]).translate([-r, cy - half, recessZ0]))
    .subtract(cylZ(0, cy - half, recessZ0, c.floor + 1, c.recessW))
    .subtract(cylZ(0, cy + half, recessZ0, c.floor + 1, c.recessW));
  for (const sy of [-1, 1]) solid = solid.subtract(cylZ(0, cy + sy * c.centreHoleY, -1, c.floor + 1, c.centreHole));

  const holes = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = sx * c.holeX, y = cy + sy * c.holeY;
      holes.push([x, y]);
      solid = solid.subtract(cylZ(x, y, -1, c.floor + 1, c.hole));
    }
  }

  // Thumbscrews: square to the wall (pointing inward and down at 90 - angle), through the middle of
  // the wall's thickness at screwZ, one per jaw block.
  const sides = c.screwSides >= 2 ? [-1, 1] : [-1];
  const blockLen = (c.length - c.jawGap) / 2;
  const screws = [blockLen / 2, c.length - blockLen / 2];
  const midX = z => floorW / 2 + hT / 2 - (z - c.floor) / tan; // |x| of the wall mid-plane
  for (const side of sides) {
    const dir = [-side * Math.sin(a), -Math.cos(a)]; // (x, z), inward and down
    // A +Z cylinder rotated about Y by theta points along (sin theta, 0, cos theta)
    const theta = (Math.atan2(dir[0], dir[1]) * 180) / Math.PI;
    const reach = wallT / 2 + 3;
    for (const y of screws) {
      const start = [side * midX(c.screwZ) - dir[0] * reach, y, c.screwZ - dir[1] * reach];
      const hole = Manifold.cylinder(2 * reach, c.screwD / 2, c.screwD / 2, 48).rotate([0, theta, 0]).translate(start);
      solid = solid.subtract(hole);
    }
  }

  return { mesh: fromManifold(solid), config: c, floorW, topW: widthAt(h), wallT, holes, screws };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const num = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? Number(args[i + 1]) : fallback;
  };
  const outFile = path.resolve(args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) ?? 'output/vixen-clamp.3mf');
  const kebab = k => k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
  const overrides = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, num(kebab(k), v)]));
  const { mesh, config, floorW, topW } = await createVixenClampMesh(overrides);
  export3MF(outFile, mesh, { name: 'vixen-clamp' });

  const back = load3MFMesh(read3MF(outFile));
  const bb = computeBoundingBox(back);
  console.log(`Vixen clamp ${config.width} x ${config.length} x ${config.height} mm; channel ${floorW.toFixed(2)} mm at the floor -> ${topW.toFixed(2)} mm at the top (${config.angle} deg)`);
  console.log(`size ${bb.size.map(n => n.toFixed(2)).join(' x ')} mm, volume ${(computeMeshVolumeAndArea(back).volume / 1000).toFixed(2)} cm³, watertight ${checkWatertight(back).isWatertight}`);
  console.log(`Wrote ${outFile}`);
}
