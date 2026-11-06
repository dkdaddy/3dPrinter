/**
 * Assembly preview: ETX 105 flat-plate mount + Vixen clamp + Vixen bar, in their assembled positions.
 *
 *   node scripts/etx105-assembly.js [out.3mf] [--mount output/ETX_105_flat_plate_mount.3mf]
 *
 * - The clamp's base sits on the mount's 45 x 45 plate, centred on it, with its channel along the
 *   telescope tube (the ring axis) and its four bolt holes over the plate's holes.
 * - The bar sits in the clamp channel, its 34 mm wide face on the clamp floor, centred along the clamp.
 * Each part is a separate object with a display colour (3MF basematerials). For viewing only; print
 * the parts from their own files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { read3MF, get3MFParts, load3MFMesh, getObjectWorldTransform, transformPoint, writeZip, computeBoundingBox, checkWatertight, computeMeshVolumeAndArea } from '../src/utils/index.js';
import { createVixenClampMesh } from './vixen-clamp.js';
import { createVixenPlateMesh } from './vixen-plate.js';

const COLORS = { mount: '#C8CCD2', clamp: '#D42A2A', bar: '#38BDF8', band2: '#9AA3AE' };

/**
 * Plate face of the mount (max Y). The face may be extended along the tube for a second band; the
 * 45 x 45 bolt square is at its low-Z end, so the clamp centre is taken from that square.
 */
export function findPlateFace(mesh) {
  const yFace = Math.max(...mesh.vertices.map(v => v[1]));
  const face = mesh.vertices.filter(v => v[1] > yFace - 1e-3);
  const xs = face.map(v => v[0]), zs = face.map(v => v[2]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const square = x1 - x0;
  return { yFace, cx: (x0 + x1) / 2, cz: z0 + square / 2, sizeX: square, sizeZ: square, faceLength: z1 - z0 };
}

const mapMesh = (mesh, f) => ({ vertices: mesh.vertices.map(f), faces: mesh.faces });

export async function createAssembly(mountFile, secondBandFile = path.join(path.dirname(mountFile), 'ETX_105_second_band.3mf')) {
  const pkg = read3MF(mountFile);
  const mount = get3MFParts(pkg)[0].mesh;
  const plate = findPlateFace(mount);

  const clamp = await createVixenClampMesh();
  const bar = await createVixenPlateMesh();
  const cy = clamp.config.length / 2;

  // Clamp space -> world: clamp +Z (up from its base) along the plate normal (+Y), clamp Y (channel)
  // along the tube axis (+Z), clamp X -> -X (keeps the rotation proper).
  const clampToWorld = ([x, y, z]) => [plate.cx - x, plate.yFace + z, plate.cz + (y - cy)];
  // Bar space -> clamp: bar length (X) along the channel, wide face on the clamp floor.
  const barToClamp = ([x, y, z]) => [-y, x - bar.config.length / 2 + cy, z + clamp.config.floor];

  const parts = [
    { name: 'mount', mesh: mount },
    { name: 'clamp', mesh: mapMesh(clamp.mesh, clampToWorld) },
    { name: 'bar', mesh: mapMesh(bar.mesh, v => clampToWorld(barToClamp(v))) }
  ];

  // Second band: printed band-down; mirrored along the tube into the mount's object space
  // (z_object = zTop - z_file), then placed with the mount's world transform.
  if (fs.existsSync(secondBandFile)) {
    const band2 = load3MFMesh(read3MF(secondBandFile));
    const leafId = [...pkg.objects.values()].find(o => o.mesh).id;
    const zTop = Math.max(...pkg.objects.get(leafId).mesh.vertices.map(v => v[2]));
    const T = getObjectWorldTransform(pkg, leafId);
    parts.push({
      name: 'band2',
      mesh: {
        vertices: band2.vertices.map(([x, y, z]) => transformPoint(T, [x, y, zTop - z])),
        faces: band2.faces.map(([a, b, c]) => [a, c, b]) // mirrored, so flip the winding
      }
    });
  }
  const clampHoles = clamp.holes.map(([x, y]) => clampToWorld([x, y, 0]));
  return { parts, plate, clampHoles };
}

function assemblyXml(parts) {
  const fmt = n => (Math.abs(n) < 1e-9 ? '0' : String(+n.toFixed(5)));
  const matId = parts.length + 1;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    ' <metadata name="Application">3D Printer Utils</metadata>',
    ' <metadata name="Title">etx105-assembly</metadata>',
    ' <resources>',
    `  <basematerials id="${matId}">`,
    ...parts.map(p => `   <base name="${p.name}" displaycolor="${COLORS[p.name]}"/>`),
    '  </basematerials>'
  ];
  parts.forEach((p, i) => {
    lines.push(`  <object id="${i + 1}" name="${p.name}" type="model" pid="${matId}" pindex="${i}">`, '   <mesh>', '    <vertices>');
    for (const [x, y, z] of p.mesh.vertices) lines.push(`     <vertex x="${fmt(x)}" y="${fmt(y)}" z="${fmt(z)}"/>`);
    lines.push('    </vertices>', '    <triangles>');
    for (const [a, b, c] of p.mesh.faces) lines.push(`     <triangle v1="${a}" v2="${b}" v3="${c}"/>`);
    lines.push('    </triangles>', '   </mesh>', '  </object>');
  });
  lines.push(' </resources>', ' <build>', ...parts.map((p, i) => `  <item objectid="${i + 1}"/>`), ' </build>', '</model>', '');
  return lines.join('\n');
}

export function write3MFAssembly(filePath, parts) {
  const entries = [
    {
      name: '[Content_Types].xml',
      data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>\n')
    },
    {
      name: '_rels/.rels',
      data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n')
    },
    { name: '3D/3dmodel.model', data: Buffer.from(assemblyXml(parts)) }
  ];
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, writeZip(entries.map(e => ({ ...e, compress: true }))));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--mount');
  const mountFile = path.resolve(i >= 0 ? args[i + 1] : 'output/ETX_105_flat_plate_mount.3mf');
  const outFile = path.resolve(args.find((a, k) => !a.startsWith('--') && !(k > 0 && args[k - 1].startsWith('--'))) ?? 'output/etx105-assembly.3mf');

  const { parts, plate, clampHoles } = await createAssembly(mountFile);
  write3MFAssembly(outFile, parts);

  console.log(`Plate face y=${plate.yFace.toFixed(2)}, ${plate.sizeX.toFixed(1)} x ${plate.faceLength.toFixed(1)} mm; clamp square centre (${plate.cx.toFixed(2)}, ${plate.cz.toFixed(2)})`);
  console.log(`Clamp bolt holes (x, z): ${clampHoles.map(h => `(${(h[0] - plate.cx).toFixed(1)}, ${(h[2] - plate.cz).toFixed(1)})`).join(' ')} relative to the plate centre`);
  for (const p of parts) {
    const bb = computeBoundingBox(p.mesh);
    console.log(`- ${p.name}: min [${bb.min.map(n => n.toFixed(1)).join(', ')}] max [${bb.max.map(n => n.toFixed(1)).join(', ')}], volume ${(computeMeshVolumeAndArea(p.mesh).volume / 1000).toFixed(2)} cm³, watertight ${checkWatertight(p.mesh).isWatertight}`);
  }
  console.log(`Wrote ${outFile}`);
}
