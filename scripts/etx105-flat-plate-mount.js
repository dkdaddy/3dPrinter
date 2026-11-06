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
 */

import path from 'node:path';
import Module from 'manifold-3d';
import {
  read3MF,
  write3MF,
  setObjectMesh,
  get3MFParts,
  computeBoundingBox,
  computeMeshVolumeAndArea,
  checkWatertight
} from '../src/utils/index.js';
import { resizeRing, CENTER } from './lib/etx-ring.js';

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
const ringObjectId = 1;
const removeObjectIds = [2, 3];

const wasm = await Module();
wasm.setup();
const { Manifold, Mesh } = wasm;

function toManifold(mesh) {
  const build = (flip) => {
    const m = new Mesh({
      numProp: 3,
      vertProperties: new Float32Array(mesh.vertices.flat()),
      triVerts: new Uint32Array(mesh.faces.flatMap(f => (flip ? [f[0], f[2], f[1]] : f)))
    });
    m.merge();
    return new Manifold(m);
  };
  let m = build(false);
  if (m.volume() < 0) m = build(true);
  if (m.status() !== 'NoError') throw new Error(`Ring mesh is not a valid manifold: ${m.status()}`);
  return m;
}

function fromManifold(m) {
  const mesh = m.getMesh();
  const vertices = [];
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
    vertices.push([mesh.vertProperties[i], mesh.vertProperties[i + 1], mesh.vertProperties[i + 2]]);
  }
  const faces = [];
  for (let i = 0; i < mesh.triVerts.length; i += 3) {
    faces.push([mesh.triVerts[i], mesh.triVerts[i + 1], mesh.triVerts[i + 2]]);
  }
  return { vertices, faces };
}

// Cylinder along +Y from y0 to y1 at (x, z)
const cylY = (x, z, y0, y1, d) =>
  Manifold.cylinder(y1 - y0, d / 2, d / 2, 96).rotate([-90, 0, 0]).translate([x, y0, z]);

const pkg = read3MF(path.resolve(inFile));
const ring = pkg.objects.get(ringObjectId);
if (!ring?.mesh) throw new Error(`Object ${ringObjectId} is not a mesh`);

const resized = resizeRing(ring.mesh, { innerDiameter, slitExtra });
const yFace = Math.max(...resized.vertices.map(v => v[1])); // wall block outer face
const cx = CENTER[0];

const plate = Manifold.cube([plateSize, plateThickness + 1, plateSize]).translate([
  cx - plateSize / 2,
  yFace - 1,
  plateZ - plateSize / 2
]);

let solid = toManifold({ vertices: resized.vertices, faces: ring.mesh.faces }).add(plate);

// Replace the hex nut trap with a round hole for a brass insert: fill the hex (flush with the
// lug's outer face, overlapping into the floor), then drill the insert hole from the outer face.
const { nut } = resized;
const yOuter = Math.fround(nut.yOuter);
const hexFill = Manifold.cylinder(yOuter - nut.yFloor + 0.5, nut.cornerRadius + 0.2, nut.cornerRadius + 0.2, 6)
  .rotate([-90, 0, 0])
  .translate([nut.x, nut.yFloor - 0.5, nut.z]);
solid = solid.add(hexFill).subtract(cylY(nut.x, nut.z, yOuter - insertDepth, yOuter + 1, insertD));

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
