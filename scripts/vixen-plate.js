/**
 * Vixen-style dovetail plate (male dovetail bar) with counterbored mounting holes.
 *
 *   node scripts/vixen-plate.js [out.3mf] [--base 34] [--angle 75] [--height 20] [--length 120]
 *        [--hole 6] [--recess-d 10] [--recess-depth 12] [--stagger 0]
 *
 * Coordinates: X along the length (0..length), Y across (centred on 0), Z up. Printed with the
 * wide dovetail face on the bed (Z = 0), so the flanks slope inward going up and need no supports.
 * The wide face (--base wide, the face a Vixen clamp grips) carries the hole recesses; the narrow
 * face at Z = height is base - 2 * height / tan(angle) wide and is the face that mounts to the scope.
 *
 * Holes: three mirrored pairs on the centreline at 60, 84 and 108 mm spacing along the length (so
 * mounts at any of those spacings work). --stagger offsets alternate pairs sideways if wanted.
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
  base: 34,          // mm, width of the wide (clamped) face
  angle: 75,         // degrees, flank angle measured from the wide face
  height: 20,        // mm
  length: 120,       // mm
  hole: 6,           // mm, through hole
  recessD: 10,       // mm, head recess diameter
  recessDepth: 12,   // mm, from the wide face
  spacings: [60, 84, 108], // mm, hole pair spacings along the length (12 mm pitch keeps 2 mm between 10 mm recesses)
  stagger: 0         // mm, lateral offset of alternate hole rows (0 = all on the centreline)
};

export async function createVixenPlateMesh(overrides = {}) {
  const c = { ...DEFAULTS, ...overrides };
  const { Manifold, fromManifold, cylZ } = await initManifold();

  const wide = c.base;
  const narrow = c.base - 2 * c.height / Math.tan((c.angle * Math.PI) / 180);
  const x0 = 0, x1 = c.length;
  const bar = Manifold.hull([
    [x0, -wide / 2, 0], [x1, -wide / 2, 0], [x1, wide / 2, 0], [x0, wide / 2, 0],
    [x0, -narrow / 2, c.height], [x1, -narrow / 2, c.height], [x1, narrow / 2, c.height], [x0, narrow / 2, c.height]
  ]);

  const mid = c.length / 2;
  const holes = [];
  c.spacings.forEach((s, i) => {
    const y = (i % 2 === 0 ? 1 : -1) * c.stagger;
    holes.push([mid - s / 2, y], [mid + s / 2, y]);
  });

  let solid = bar;
  for (const [x, y] of holes) {
    solid = solid
      .subtract(cylZ(x, y, -1, c.height + 1, c.hole))
      .subtract(cylZ(x, y, -1, c.recessDepth, c.recessD));
  }
  return { mesh: fromManifold(solid), config: c, wide, narrow, holes };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const num = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? Number(args[i + 1]) : fallback;
  };
  const outFile = path.resolve(args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) ?? 'output/vixen-plate.3mf');
  const { mesh, config, wide, narrow, holes } = await createVixenPlateMesh({
    base: num('base', DEFAULTS.base),
    angle: num('angle', DEFAULTS.angle),
    height: num('height', DEFAULTS.height),
    length: num('length', DEFAULTS.length),
    hole: num('hole', DEFAULTS.hole),
    recessD: num('recess-d', DEFAULTS.recessD),
    recessDepth: num('recess-depth', DEFAULTS.recessDepth),
    stagger: num('stagger', DEFAULTS.stagger)
  });
  export3MF(outFile, mesh, { name: 'vixen-plate' });

  const back = load3MFMesh(read3MF(outFile));
  const bb = computeBoundingBox(back);
  console.log(`Vixen plate: ${wide} mm wide at the base (clamped face) -> ${narrow.toFixed(2)} mm at the top, ${config.height} mm high, ${config.length} mm long, ${config.angle} deg flanks`);
  console.log(`Holes ${config.hole} mm with ${config.recessD} x ${config.recessDepth} mm recess from the wide face: ${holes.map(h => `(${h[0]},${h[1]})`).join(' ')}`);
  console.log(`size ${bb.size.map(n => n.toFixed(2)).join(' x ')} mm, volume ${(computeMeshVolumeAndArea(back).volume / 1000).toFixed(2)} cm³, watertight ${checkWatertight(back).isWatertight}`);
  console.log(`Wrote ${outFile}`);
}
