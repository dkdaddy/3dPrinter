/**
 * 3MF (3D Manufacturing Format) reader / writer.
 *
 * Reads full packages (including slicer project files such as Bambu Studio / Orca),
 * lets meshes be edited in object space and writes the package back while keeping every
 * other entry (thumbnails, slicer settings, ...) untouched.
 *
 * Transforms use the 3MF row-vector convention: 12 numbers
 * [m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32], p' = p * M.
 */

import fs from 'node:fs';
import path from 'node:path';
import { readZip, writeZip } from './zip.js';
import { mergeMeshes } from './mesh.js';

export const MODEL_PATH = '3D/3dmodel.model';
export const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

const UNIT_TO_MM = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000
};

function parseAttrs(text) {
  const attrs = {};
  for (const m of text.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1]] = m[2];
  return attrs;
}

function parseTransform(text) {
  if (!text) return [...IDENTITY];
  const m = text.trim().split(/\s+/).map(Number);
  if (m.length !== 12 || m.some(Number.isNaN)) throw new Error(`Invalid 3MF transform: "${text}"`);
  return m;
}

function fmt(n) {
  return String(Number(n.toPrecision(9)));
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Returns the transform that applies `a` first and then `b`. */
export function multiplyTransforms(a, b) {
  const to4 = m => [
    [m[0], m[1], m[2], 0],
    [m[3], m[4], m[5], 0],
    [m[6], m[7], m[8], 0],
    [m[9], m[10], m[11], 1]
  ];
  const A = to4(a);
  const B = to4(b);
  const out = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      out.push(A[r][0] * B[0][c] + A[r][1] * B[1][c] + A[r][2] * B[2][c] + A[r][3] * B[3][c]);
    }
  }
  return out;
}

export function transformPoint(m, [x, y, z]) {
  return [
    x * m[0] + y * m[3] + z * m[6] + m[9],
    x * m[1] + y * m[4] + z * m[7] + m[10],
    x * m[2] + y * m[5] + z * m[8] + m[11]
  ];
}

/** Inverse of an affine 3MF transform. */
export function invertTransform(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-300) throw new Error('Singular transform cannot be inverted');
  const inv = [
    (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det
  ];
  const t = [m[9], m[10], m[11]];
  inv.push(
    -(t[0] * inv[0] + t[1] * inv[3] + t[2] * inv[6]),
    -(t[0] * inv[1] + t[1] * inv[4] + t[2] * inv[7]),
    -(t[0] * inv[2] + t[1] * inv[5] + t[2] * inv[8])
  );
  return inv;
}

/**
 * Parses a 3MF package buffer.
 * @returns {{ entries: Array<{name:string,data:Buffer}>, unit: string, header: string,
 *   objects: Map<number, Object>, build: Array<Object> }}
 */
export function parse3MF(buffer) {
  const entries = readZip(buffer);
  const modelEntry = entries.find(e => e.name.toLowerCase() === MODEL_PATH.toLowerCase());
  if (!modelEntry) throw new Error(`3MF package has no ${MODEL_PATH}`);
  const xml = modelEntry.data.toString('utf-8');

  const resStart = xml.indexOf('<resources');
  if (resStart < 0) throw new Error('3MF model has no <resources>');
  const header = xml.slice(0, resStart);
  const unit = parseAttrs(header.match(/<model\b[^>]*>/)?.[0] ?? '').unit ?? 'millimeter';

  const objects = new Map();
  for (const om of xml.matchAll(/<object\b([^>]*?)(?:\/>|>([\s\S]*?)<\/object>)/g)) {
    const attrs = parseAttrs(om[1]);
    const body = om[2] ?? '';
    const obj = { id: Number(attrs.id), attrs: om[1].trim(), type: attrs.type ?? 'model' };

    if (/<mesh\b/.test(body)) {
      const vertices = [];
      for (const vm of body.matchAll(/<vertex\b([^>]*?)\/>/g)) {
        const a = parseAttrs(vm[1]);
        vertices.push([Number(a.x), Number(a.y), Number(a.z)]);
      }
      const faces = [];
      const faceExtras = [];
      for (const tm of body.matchAll(/<triangle\b([^>]*?)\/>/g)) {
        const a = parseAttrs(tm[1]);
        faces.push([Number(a.v1), Number(a.v2), Number(a.v3)]);
        const extra = tm[1].replace(/\b(?:v1|v2|v3)\s*=\s*"[^"]*"/g, '').trim();
        faceExtras.push(extra);
      }
      obj.mesh = { vertices, faces };
      if (faceExtras.some(Boolean)) obj.faceExtras = faceExtras;
    } else {
      obj.components = [...body.matchAll(/<component\b([^>]*?)\/>/g)].map(cm => {
        const a = parseAttrs(cm[1]);
        return { objectId: Number(a.objectid), transform: parseTransform(a.transform), path: a.path };
      });
    }
    objects.set(obj.id, obj);
  }

  const build = [...xml.matchAll(/<item\b([^>]*?)\/>/g)].map(im => {
    const a = parseAttrs(im[1]);
    return { objectId: Number(a.objectid), transform: parseTransform(a.transform), printable: a.printable };
  });

  return { entries, unit, header, objects, build };
}

export function read3MF(filePath) {
  return parse3MF(fs.readFileSync(filePath));
}

/** Names of parts for slicer projects, keyed by `${objectId}` -> component order. */
function readPartNames(pkg) {
  const entry = pkg.entries.find(e => e.name === 'Metadata/model_settings.config');
  const names = new Map();
  if (!entry) return names;
  const xml = entry.data.toString('utf-8');
  for (const om of xml.matchAll(/<object\s+id="(\d+)"[^>]*>([\s\S]*?)<\/object>/g)) {
    const parts = [...om[2].matchAll(/<part\b[^>]*>([\s\S]*?)<\/part>/g)]
      .map(pm => pm[1].match(/key="name"\s+value="([^"]*)"/)?.[1]);
    names.set(Number(om[1]), parts);
  }
  return names;
}

/**
 * Flattens every build item into leaf meshes in world space (millimetres, build transform applied).
 * @returns {Array<{ name: string, objectId: number, mesh: {vertices,faces} }>}
 */
export function get3MFParts(pkg) {
  const unitScale = UNIT_TO_MM[pkg.unit] ?? 1;
  const partNames = readPartNames(pkg);
  const result = [];

  function visit(objectId, transform, topId, partIndex) {
    const obj = pkg.objects.get(objectId);
    if (!obj) throw new Error(`3MF references missing object ${objectId}`);
    if (obj.mesh) {
      const vertices = obj.mesh.vertices.map(v => transformPoint(transform, v).map(c => c * unitScale));
      const name = partNames.get(topId)?.[partIndex] ?? `object-${objectId}`;
      result.push({ name, objectId, mesh: { vertices, faces: obj.mesh.faces.map(f => [...f]) } });
      return;
    }
    obj.components.forEach((c, idx) => {
      visit(c.objectId, multiplyTransforms(c.transform, transform), topId, obj.id === topId ? idx : partIndex);
    });
  }

  for (const item of pkg.build) visit(item.objectId, item.transform, item.objectId, 0);
  return result;
}

/** Merges the whole build plate into one mesh in millimetres. */
export function load3MFMesh(pkg) {
  return mergeMeshes(get3MFParts(pkg).map(p => p.mesh));
}

/**
 * Returns the transform that maps a leaf object's local space to world millimetres for the
 * first place it is used. Useful to express edits in world space and convert them back.
 */
export function getObjectWorldTransform(pkg, leafObjectId) {
  const unitScale = UNIT_TO_MM[pkg.unit] ?? 1;
  const scale = [unitScale, 0, 0, 0, unitScale, 0, 0, 0, unitScale, 0, 0, 0];

  function find(objectId, transform) {
    if (objectId === leafObjectId) return transform;
    const obj = pkg.objects.get(objectId);
    for (const c of obj?.components ?? []) {
      const r = find(c.objectId, multiplyTransforms(c.transform, transform));
      if (r) return r;
    }
    return null;
  }

  for (const item of pkg.build) {
    const t = find(item.objectId, item.transform);
    if (t) return multiplyTransforms(t, scale);
  }
  throw new Error(`Object ${leafObjectId} is not reachable from the build`);
}

/** Replaces a leaf object's mesh (object space). */
export function setObjectMesh(pkg, objectId, mesh) {
  const obj = pkg.objects.get(objectId);
  if (!obj?.mesh) throw new Error(`Object ${objectId} is not a mesh object`);
  obj.mesh = { vertices: mesh.vertices, faces: mesh.faces };
  delete obj.faceExtras;
}

function serializeObject(obj) {
  const lines = [`  <object ${obj.attrs}>`];
  if (obj.mesh) {
    lines.push('   <mesh>', '    <vertices>');
    for (const [x, y, z] of obj.mesh.vertices) {
      lines.push(`     <vertex x="${fmt(x)}" y="${fmt(y)}" z="${fmt(z)}"/>`);
    }
    lines.push('    </vertices>', '    <triangles>');
    obj.mesh.faces.forEach(([a, b, c], i) => {
      const extra = obj.faceExtras?.[i] ? ` ${obj.faceExtras[i]}` : '';
      lines.push(`     <triangle v1="${a}" v2="${b}" v3="${c}"${extra}/>`);
    });
    lines.push('    </triangles>', '   </mesh>');
  } else {
    lines.push('   <components>');
    for (const c of obj.components) {
      const p = c.path ? ` p:path="${c.path}"` : '';
      lines.push(`    <component objectid="${c.objectId}" transform="${c.transform.map(fmt).join(' ')}"${p}/>`);
    }
    lines.push('   </components>');
  }
  lines.push('  </object>');
  return lines.join('\n');
}

/** Serializes the package back to a 3MF buffer, preserving all untouched entries. */
export function serialize3MF(pkg) {
  const modelXml = [
    pkg.header.trimEnd(),
    ' <resources>',
    ...[...pkg.objects.values()].map(serializeObject),
    ' </resources>',
    ' <build>',
    ...pkg.build.map(i => {
      const printable = i.printable !== undefined ? ` printable="${i.printable}"` : '';
      return `  <item objectid="${i.objectId}" transform="${i.transform.map(fmt).join(' ')}"${printable}/>`;
    }),
    ' </build>',
    '</model>',
    ''
  ].join('\n');

  const entries = pkg.entries.map(e => (e.name.toLowerCase() === MODEL_PATH.toLowerCase()
    ? { name: e.name, data: Buffer.from(modelXml, 'utf-8') }
    : { name: e.name, data: e.data, compress: !/\.png$/i.test(e.name) }));
  return writeZip(entries);
}

export function write3MF(filePath, pkg) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serialize3MF(pkg));
}

/**
 * Creates a brand-new, minimal 3MF package from a mesh (millimetres).
 * @param {{vertices: number[][], faces: number[][]}} mesh
 * @param {{ name?: string }} [options]
 */
export function create3MFPackage(mesh, options = {}) {
  const title = escapeXml(options.name ?? 'part');
  const header = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    ' <metadata name="Application">3D Printer Utils</metadata>',
    ` <metadata name="Title">${title}</metadata>`,
    ''
  ].join('\n');

  const entries = [
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>\n'
    },
    {
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n'
    },
    { name: MODEL_PATH, data: '' }
  ];

  return {
    entries,
    unit: 'millimeter',
    header,
    objects: new Map([[1, { id: 1, attrs: 'id="1" type="model"', type: 'model', mesh: { vertices: mesh.vertices, faces: mesh.faces } }]]),
    build: [{ objectId: 1, transform: [...IDENTITY], printable: '1' }]
  };
}

/** Exports a mesh as a standalone 3MF file. */
export function export3MF(filePath, mesh, options = {}) {
  write3MF(filePath, create3MFPackage(mesh, options));
  return filePath;
}
