/**
 * Resizes the split-clamp ring of "ETX 90 / SV165 adapter" 3MF so it fits a larger tube.
 *
 *   node scripts/resize-etx-ring.js <in.3mf> <out.3mf> [--id 125] [--ring-object 1] [--move-objects 2,3]
 *
 * The ring (object --ring-object) consists of:
 *   - a cylindrical band: inner radius ~52 mm, outer radius ~55 mm (3 mm wall)
 *   - a screw lug on the -X side (kept rigid, moves outward with the ring)
 *   - a tall mounting wall on the +Y side (kept rigid, moves outward with the ring)
 * Only vertex positions change, so topology, holes and slits are preserved exactly.
 * The other objects (--move-objects: rail/stop) are moved +Y by the same amount.
 */

import path from 'node:path';
import {
  read3MF,
  write3MF,
  setObjectMesh,
  get3MFParts,
  computeBoundingBox,
  computeMeshVolumeAndArea,
  checkWatertight
} from '../src/utils/index.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [inFile, outFile] = positional;
if (!inFile || !outFile) {
  console.error('Usage: node scripts/resize-etx-ring.js <in.3mf> <out.3mf> [--id 125]');
  process.exit(1);
}

const newInnerDiameter = Number(opt('id', 125));
const ringObjectId = Number(opt('ring-object', 1));
const moveObjectIds = opt('move-objects', '2,3').split(',').map(Number);

// Measured from ETX_90_part_1_SV165_adapter_2.3mf (object-space mm)
const CENTER = [5.005, -0.456];
const R_IN = 52.0;
const R_OUT = 55.0;
const TOL = 0.02;

const pkg = read3MF(path.resolve(inFile));
const ring = pkg.objects.get(ringObjectId);
if (!ring?.mesh) throw new Error(`Object ${ringObjectId} is not a mesh`);

const wall = R_OUT - R_IN;
const rInNew = newInnerDiameter / 2;
const rOutNew = rInNew + wall;
const delta = rInNew - R_IN;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Lug (-X) and wall block (+Y) windows in which circle vertices slide along the attachment axis
// instead of radially, so the planar faces of the attachments stay planar.
const LUG_FLAT = 7.5, LUG_RADIAL = 30; // |dy| thresholds
const WALL_FLAT = 22, WALL_RADIAL = 42; // |dx| thresholds

const unclassified = [];
let counts = { inner: 0, outer: 0, lug: 0, wall: 0 };

const vertices = ring.mesh.vertices.map((v, idx) => {
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
      const dyn = dy * (1 + k * smoothstep(LUG_FLAT, LUG_RADIAL, Math.abs(dy)));
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
    return [x - delta, y, z];
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
    `${ring.mesh.vertices[unclassified[0]].map(n => n.toFixed(2))}); aborting`);
}

setObjectMesh(pkg, ringObjectId, { vertices, faces: ring.mesh.faces });

// Move rail / stop components outward (+Y) by the same amount. Component translations
// live in the pre-build-scale space, so convert mm to that space via the build scale.
const top = [...pkg.objects.values()].find(o => o.components?.some(c => moveObjectIds.includes(c.objectId)));
const buildScale = Math.hypot(pkg.build[0].transform[0], pkg.build[0].transform[1], pkg.build[0].transform[2]);
const shift = delta / buildScale;
for (const c of top.components) {
  if (moveObjectIds.includes(c.objectId)) c.transform[10] += shift;
}

// Keep the slicer's cached part matrices in sync (Bambu/Orca model_settings.config)
const settings = pkg.entries.find(e => e.name === 'Metadata/model_settings.config');
if (settings) {
  let xml = settings.data.toString('utf-8');
  xml = xml.replace(/<part id="(\d+)"[^>]*>[\s\S]*?<\/part>/g, block => {
    const name = block.match(/key="name" value="([^"]*)"/)?.[1];
    if (name !== 'rail' && name !== 'stop') return block;
    return block.replace(/(key="matrix" value=")([^"]*)(")/, (m, a, vals, b) => {
      const n = vals.split(/\s+/).map(Number);
      n[7] += shift;
      return `${a}${n.map(v => String(v)).join(' ')}${b}`;
    });
  });
  settings.data = Buffer.from(xml, 'utf-8');
}

write3MF(path.resolve(outFile), pkg);

// Report
const fmt = a => a.map(n => n.toFixed(2)).join(' x ');
console.log(`Inner diameter ${(R_IN * 2).toFixed(2)} -> ${newInnerDiameter.toFixed(2)} mm, wall ${wall.toFixed(2)} mm (outer ${(rOutNew * 2).toFixed(2)} mm)`);
console.log(`Vertices: ${counts.inner} inner-circle, ${counts.outer} outer-circle, ${counts.lug} lug, ${counts.wall} wall block; moved rail/stop +${delta.toFixed(2)} mm in Y`);
for (const part of get3MFParts(read3MF(path.resolve(outFile)))) {
  const bb = computeBoundingBox(part.mesh);
  console.log(`- ${part.name}: size ${fmt(bb.size)} mm, volume ${(computeMeshVolumeAndArea(part.mesh).volume / 1000).toFixed(2)} cm³, watertight ${checkWatertight(part.mesh).isWatertight}`);
}
