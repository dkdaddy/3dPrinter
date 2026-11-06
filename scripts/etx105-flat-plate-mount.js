/**
 * Builds the ETX 105 flat-plate mount from "ETX 90 / SV165 adapter" 3MF.
 *
 *   node scripts/etx105-flat-plate-mount.js <in.3mf> <out.3mf> [--id 125] [--slit-extra 3]
 *        [--plate 45] [--plate-thickness 12] [--hole 6] [--hole-pitch 20]
 *        [--recess-d 10] [--recess-depth 8] [--plate-z 2] [--insert-d 5.6] [--insert-depth 4]
 *
 * - Ring: same inner circle as the ETX 105 adapter, lug slit opened wider by --slit-extra mm
 *   (band arc is that much shorter, so closing the bolt clamps the 124 mm tube tighter).
 * - The rail/stop (SV165 / vixen shoe mount) are removed and replaced with a flat square plate
 *   on the wall block with a square pattern of through holes. Each hole has a bolt-head recess on
 *   the underside (ring side), continued through the wall block so the heads can be fitted
 *   from inside the ring.
 * - The lug's hex nut trap is replaced by a round hole for a brass insert (--insert-d / --insert-depth).
 * - Second band (--spacing 90 between band centres, 0 = none): the plate is extended along the tube
 *   and ends in a thinner lap; a separately printed band (written to --second-band-out, default
 *   ETX_105_second_band.3mf next to <out.3mf>) has a pad with two M3 insert holes under the lap,
 *   joined by two M3 screws through counterbored holes in the lap. See notes/etx105-adapter.md.
 */

import path from 'node:path';
import {
  read3MF,
  write3MF,
  export3MF,
  setObjectMesh,
  get3MFParts,
  computeBoundingBox,
  computeMeshVolumeAndArea,
  checkWatertight
} from '../src/utils/index.js';
import { resizeRing, CENTER } from './lib/etx-ring.js';
import { initManifold } from './lib/manifold-mesh.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [inFile, outFile] = positional;
if (!inFile || !outFile) {
  console.error('Usage: node scripts/etx105-flat-plate-mount.js <in.3mf> <out.3mf> [--id 125] [--slit-extra 3]');
  process.exit(1);
}

const innerDiameter = opt('id', 125);
const slitExtra = opt('slit-extra', 3);
const insertD = opt('insert-d', 5.6);
const insertDepth = opt('insert-depth', 4);
const plateSize = opt('plate', 45);
const plateThickness = opt('plate-thickness', 14);
const holeD = opt('hole', 6);
const holePitch = opt('hole-pitch', 20);
const recessD = opt('recess-d', 10);
const recessDepth = opt('recess-depth', 8);
// Plate centre height in ring object space (wall block spans z -23.5..23.5; the 10 mm band is
// z -23.5..-13.5). 2 keeps the lower recesses clear of the band.
const plateZ = opt('plate-z', 2);
// Second band: printed separately, joined to a lap at the far end of the extended plate with
// screws into brass inserts. --spacing 0 disables it.
const spacing = opt('spacing', 90);          // mm, between band centres along the tube
const bandBlock = opt('band-block', 20);     // mm, length of the second band's block / lap along the tube
const padTop = opt('pad-top', 6);            // mm, second band's pad top above the wall block face
const joinX = opt('join-x', 12);             // mm, joining screws at cx +/- joinX
const joinInsertD = opt('join-insert-d', 4.0); // M3 insert hole
const joinInsertDepth = opt('join-insert-depth', 6.5);
const joinScrewD = opt('join-screw-d', 3.4); // M3 clearance
const joinCbD = opt('join-cb-d', 6.5);       // M3 socket head counterbore
const joinCbDepth = opt('join-cb-depth', 3.5);
const secondBandOut = path.resolve(
  args[args.indexOf('--second-band-out') + 1] && args.includes('--second-band-out')
    ? args[args.indexOf('--second-band-out') + 1]
    : path.join(path.dirname(outFile), 'ETX_105_second_band.3mf')
);
const ringObjectId = 1;
const removeObjectIds = [2, 3];

const { Manifold, toManifold, fromManifold, cylY } = await initManifold();

const pkg = read3MF(path.resolve(inFile));
const ring = pkg.objects.get(ringObjectId);
if (!ring?.mesh) throw new Error(`Object ${ringObjectId} is not a mesh`);

const resized = resizeRing(ring.mesh, { innerDiameter, slitExtra });
const yFace = Math.max(...resized.vertices.map(v => v[1])); // wall block outer face
const zMin = Math.min(...resized.vertices.map(v => v[2]));  // band bottom (band is 10 mm tall)
const bandH = 10;
const cx = CENTER[0];

const box = (x0, x1, y0, y1, z0, z1) => Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
const px0 = cx - plateSize / 2, px1 = cx + plateSize / 2;

const plate = box(px0, px1, yFace - 1, yFace + plateThickness, plateZ - plateSize / 2, plateZ + plateSize / 2);

let ringSolid = toManifold({ vertices: resized.vertices, faces: ring.mesh.faces });

// Replace the hex nut trap with a round hole for a brass insert: fill the hex (flush with the
// lug's outer face, overlapping into the floor), then drill the insert hole from the outer face.
const { nut } = resized;
const yOuter = Math.fround(nut.yOuter);
const hexFill = Manifold.cylinder(yOuter - nut.yFloor + 0.5, nut.cornerRadius + 0.2, nut.cornerRadius + 0.2, 6)
  .rotate([-90, 0, 0])
  .translate([nut.x, nut.yFloor - 0.5, nut.z]);
ringSolid = ringSolid.add(hexFill).subtract(cylY(nut.x, nut.z, yOuter - insertDepth, yOuter + 1, insertD));

let solid = ringSolid.add(plate);

// Plate extension to the second band: full thickness, then a thinner lap over the band's pad
const zTop = zMin + spacing + bandH;          // far end of the mount (outer edge of band 2)
const lapZ0 = zTop - bandBlock;               // start of the lap / band 2's block
const joinZ = lapZ0 + bandBlock / 2;
const lapY0 = yFace + padTop;
if (spacing) {
  if (lapZ0 < plateZ + plateSize / 2) throw new Error(`--spacing ${spacing} is too small for the plate`);
  solid = solid
    .add(box(px0, px1, yFace - 1, yFace + plateThickness, plateZ + plateSize / 2 - 1, lapZ0 - 0.3))
    .add(box(px0, px1, lapY0, yFace + plateThickness, lapZ0 - 0.31, zTop));
  for (const sx of [-1, 1]) {
    const x = cx + sx * joinX;
    solid = solid
      .subtract(cylY(x, joinZ, lapY0 - 1, yFace + plateThickness + 1, joinScrewD))
      .subtract(cylY(x, joinZ, yFace + plateThickness - joinCbDepth, yFace + plateThickness + 1, joinCbD));
  }
}

const p = holePitch / 2;
const holeCentres = [[-p, -p], [p, -p], [-p, p], [p, p]].map(([dx, dz]) => [cx + dx, plateZ + dz]);
const cuts = holeCentres.flatMap(([x, z]) => [
  cylY(x, z, yFace - 5, yFace + plateThickness + 1, holeD),
  // recess: from inside the ring, through the wall block, 'recessDepth' into the plate
  cylY(x, z, yFace - 10, yFace + recessDepth, recessD)
]);
for (const c of cuts) solid = solid.subtract(c);

const mesh = fromManifold(solid);
setObjectMesh(pkg, ringObjectId, mesh);

// Drop rail/stop objects and their components
for (const obj of pkg.objects.values()) {
  if (obj.components) obj.components = obj.components.filter(c => !removeObjectIds.includes(c.objectId));
}
for (const id of removeObjectIds) pkg.objects.delete(id);

const settings = pkg.entries.find(e => e.name === 'Metadata/model_settings.config');
if (settings) {
  let xml = settings.data.toString('utf-8');
  xml = xml.replace(/\s*<part id="(\d+)"[^>]*>[\s\S]*?<\/part>/g, block => {
    const name = block.match(/key="name" value="([^"]*)"/)?.[1];
    if (name === 'rail' || name === 'stop') return '';
    return block.replace('value="ring"', 'value="mount"');
  });
  settings.data = Buffer.from(xml, 'utf-8');
}

write3MF(path.resolve(outFile), pkg);

// Second band, in print orientation (band on the bed): the ring cut down to the band plus a
// bandBlock long piece of its wall block, a pad on top with the insert holes. In the assembly it
// is mirrored along the tube so the band sits at the far end (z_mount = zTop - z_print).
let band2Mesh = null;
if (spacing) {
  let band2 = ringSolid
    .intersect(box(-1000, 1000, -1000, 1000, zMin - 1, zMin + bandBlock))
    .add(box(px0, px1, yFace - 1, lapY0, zMin, zMin + bandBlock));
  for (const sx of [-1, 1]) {
    band2 = band2.subtract(cylY(cx + sx * joinX, zMin + bandBlock / 2, lapY0 - joinInsertDepth, lapY0 + 1, joinInsertD));
  }
  band2Mesh = fromManifold(band2.translate([0, 0, -zMin]));
  export3MF(secondBandOut, band2Mesh, { name: 'ETX_105_second_band' });
}

const fmt = a => a.map(n => n.toFixed(2)).join(' x ');
const slitFaces = [...new Set(mesh.vertices.filter(v => v[0] < CENTER[0] - resized.rInNew - resized.wall - 4).map(v => v[1].toFixed(2)))];
console.log(`Ring ID ${innerDiameter} mm (OD ${(resized.rOutNew * 2).toFixed(1)}), slit widened by ${slitExtra} mm (2 -> ${2 + slitExtra} mm)`);
console.log(`Plate ${plateSize} x ${plateSize} x ${plateThickness} mm, ${holeD} mm holes on ${holePitch} mm pitch, recess ${recessD} dia x ${recessDepth} deep`);
console.log(`Lug insert hole ${insertD} dia x ${insertDepth} deep (replaces the hex nut trap)`);
console.log(`Lug vertex y values: ${slitFaces.join(', ')}`);
for (const part of get3MFParts(read3MF(path.resolve(outFile)))) {
  const bb = computeBoundingBox(part.mesh);
  console.log(`- ${part.name}: size ${fmt(bb.size)} mm, volume ${(computeMeshVolumeAndArea(part.mesh).volume / 1000).toFixed(2)} cm³, watertight ${checkWatertight(part.mesh).isWatertight}`);
}
if (band2Mesh) {
  const bb = computeBoundingBox(band2Mesh);
  console.log(`Second band: ${spacing} mm between band centres, joined by 2 x M3 (insert ${joinInsertD} x ${joinInsertDepth} deep, screw M3 x ${Math.round(plateThickness - padTop - joinCbDepth + 5)})`);
  console.log(`- second band: size ${fmt(bb.size)} mm, volume ${(computeMeshVolumeAndArea(band2Mesh).volume / 1000).toFixed(2)} cm³, watertight ${checkWatertight(band2Mesh).isWatertight} -> ${secondBandOut}`);
}
