/**
 * Inspect a 3MF file: lists parts with size / volume / watertight status.
 *
 *   node scripts/inspect-3mf.js <file.3mf> [--stl output/preview.stl]
 */

import path from 'node:path';
import {
  read3MF,
  get3MFParts,
  load3MFMesh,
  computeBoundingBox,
  computeMeshVolumeAndArea,
  checkWatertight,
  exportSTL
} from '../src/utils/index.js';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--stl');
const stlIdx = args.indexOf('--stl');

if (!file) {
  console.error('Usage: node scripts/inspect-3mf.js <file.3mf> [--stl out.stl]');
  process.exit(1);
}

const pkg = read3MF(path.resolve(file));
console.log(`File: ${file}`);
console.log(`Unit: ${pkg.unit}, objects: ${pkg.objects.size}, build items: ${pkg.build.length}`);
console.log(`Package entries: ${pkg.entries.map(e => e.name).join(', ')}\n`);

const fmt = a => a.map(n => n.toFixed(2)).join(' x ');
for (const part of get3MFParts(pkg)) {
  const bb = computeBoundingBox(part.mesh);
  const { volume } = computeMeshVolumeAndArea(part.mesh);
  const wt = checkWatertight(part.mesh);
  console.log(`- ${part.name} (object ${part.objectId}): ${part.mesh.faces.length} tris`);
  console.log(`    size ${fmt(bb.size)} mm, min [${fmt(bb.min)}], volume ${(volume / 1000).toFixed(2)} cm³, watertight ${wt.isWatertight}`);
}

if (stlIdx >= 0 && args[stlIdx + 1]) {
  exportSTL(path.resolve(args[stlIdx + 1]), load3MFMesh(pkg));
}
