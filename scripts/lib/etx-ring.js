/**
 * Shared geometry edits for the ETX 90 / SV165 adapter ring (ring object space, mm).
 *
 * The ring consists of:
 *   - a cylindrical band: inner radius 52 mm, outer radius 55 mm (3 mm wall)
 *   - a screw lug on the -X side with a 2 mm slit (kept rigid, moves outward with the ring)
 *   - a tall mounting wall block on the +Y side (kept rigid, moves outward with the ring)
 * Only vertex positions change, so topology, holes and slits are preserved exactly.
 */

// Measured from ETX_90_part_1_SV165_adapter_2.3mf (object-space mm)
export const CENTER = [5.005, -0.456];
export const R_IN = 52.0;
export const R_OUT = 55.0;
const TOL = 0.02;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Lug (-X) and wall block (+Y) windows in which circle vertices slide along the attachment axis
// instead of radially, so the planar faces of the attachments stay planar.
const LUG_FLAT = 7.5, LUG_RADIAL = 30; // |dy| thresholds
const WALL_FLAT = 22, WALL_RADIAL = 42; // |dx| thresholds

// Hex nut trap in the lug's +Y half (axis along Y): centre in (x, z), corner radius, floor / outer-face y.
// resizeRing leaves it untouched; callers fill it (see `nut` in the result) to fit something else.
const NUT_CENTER = [-54.83, -18.5];
const NUT_R = 3.98;
const NUT_Y_FLOOR = 2.84, NUT_Y_OUTER = 5.54;

/**
 * Resizes the ring to a new inner diameter and optionally opens the lug slit wider.
 *
 * The slit is opened by sliding the two lug halves apart along the band: the lug moves
 * rigidly by slitExtra / 2 each way and the band vertices ease back to zero shift over
 * ~30 mm of arc, so the inner/outer circles keep their radius and the band arc gets
 * slitExtra mm shorter (the loop is tighter once the bolt is closed).
 * The result's `nut` describes the (unchanged) hex nut trap in the new coordinates.
 */
export function resizeRing(mesh, { innerDiameter, slitExtra = 0 }) {
  const wall = R_OUT - R_IN;
  const rInNew = innerDiameter / 2;
  const rOutNew = rInNew + wall;
  const delta = rInNew - R_IN;
  const half = slitExtra / 2;

  const unclassified = [];
  const counts = { inner: 0, outer: 0, lug: 0, wall: 0 };
  let nutOuterY = null;

  const slitShift = (dy) => Math.sign(dy) * half * (1 - smoothstep(LUG_FLAT, LUG_RADIAL, Math.abs(dy)));

  const vertices = mesh.vertices.map((v, idx) => {
    const [x, y, z] = v;
    const dx = x - CENTER[0];
    const dy = y - CENTER[1];
    const r = Math.hypot(dx, dy);

    const isInner = Math.abs(r - R_IN) < TOL;
    const isOuter = Math.abs(r - R_OUT) < TOL;

    if (isInner || isOuter) {
      isInner ? counts.inner++ : counts.outer++;
      const R = isInner ? R_IN : R_OUT;
      const Rn = isInner ? rInNew : rOutNew;
      const k = Rn / R - 1;

      if (dx < -40 && Math.abs(dy) < LUG_RADIAL + 10) {
        const dyn = dy * (1 + k * smoothstep(LUG_FLAT, LUG_RADIAL, Math.abs(dy))) + slitShift(dy);
        return [CENTER[0] - Math.sqrt(Rn * Rn - dyn * dyn), CENTER[1] + dyn, z];
      }
      if (dy > 40 && Math.abs(dx) < WALL_RADIAL + 10) {
        const dxn = dx * (1 + k * smoothstep(WALL_FLAT, WALL_RADIAL, Math.abs(dx)));
        return [CENTER[0] + dxn, CENTER[1] + Math.sqrt(Rn * Rn - dxn * dxn), z];
      }
      return [CENTER[0] + dx * (Rn / R), CENTER[1] + dy * (Rn / R), z];
    }

    if (dx < -40 && Math.abs(dy) < 15) {
      counts.lug++;
      const ny = y + slitShift(dy);
      if (Math.abs(Math.hypot(x - NUT_CENTER[0], z - NUT_CENTER[1]) - NUT_R) < 0.05 && Math.abs(y - NUT_Y_OUTER) < 0.05) {
        nutOuterY = ny;
      }
      return [x - delta, ny, z];
    }
    if (dy > 40 && Math.abs(dx) < 25) {
      counts.wall++;
      return [x, y + delta, z];
    }

    unclassified.push(idx);
    return v;
  });

  if (unclassified.length > 0) {
    throw new Error(`${unclassified.length} ring vertices could not be classified (e.g. #${unclassified[0]}: ` +
      `${mesh.vertices[unclassified[0]].map(n => n.toFixed(2))}); aborting`);
  }

  const nut = {
    x: NUT_CENTER[0] - delta,
    z: NUT_CENTER[1],
    cornerRadius: NUT_R,
    yFloor: NUT_Y_FLOOR + half,
    yOuter: nutOuterY
  };

  return { vertices, counts, delta, wall, rInNew, rOutNew, nut };
}
