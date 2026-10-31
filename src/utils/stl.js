/**
 * STL File Exporter & Analyzer (Binary & ASCII)
 */

import fs from 'node:fs';
import path from 'node:path';
import { computeNormal } from './math3d.js';
import {
  meshToTriangles,
  computeBoundingBox,
  computeMeshVolumeAndArea,
  checkWatertight,
  estimateFilament
} from './mesh.js';

/**
 * Creates binary STL buffer from array of triangles
 * @param {Array<[ [x,y,z], [x,y,z], [x,y,z] ]>} triangles
 * @param {string} [headerText]
 * @returns {Buffer}
 */
export function createBinarySTLBuffer(triangles, headerText = '3D Printer Utils - Binary STL') {
  const triangleCount = triangles.length;
  const bufferSize = 84 + triangleCount * 50;
  const buffer = Buffer.alloc(bufferSize);

  // 80-byte header (avoid starting with 'solid')
  const cleanHeader = headerText.replace(/^solid/i, 'part').slice(0, 80);
  buffer.write(cleanHeader, 0, 'utf-8');

  // 4-byte triangle count
  buffer.writeUInt32LE(triangleCount, 80);

  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    const [v1, v2, v3] = triangles[i];
    const normal = computeNormal(v1, v2, v3);

    // Normal (3 x Float32)
    buffer.writeFloatLE(normal[0], offset);
    buffer.writeFloatLE(normal[1], offset + 4);
    buffer.writeFloatLE(normal[2], offset + 8);

    // Vertex 1 (3 x Float32)
    buffer.writeFloatLE(v1[0], offset + 12);
    buffer.writeFloatLE(v1[1], offset + 16);
    buffer.writeFloatLE(v1[2], offset + 20);

    // Vertex 2 (3 x Float32)
    buffer.writeFloatLE(v2[0], offset + 24);
    buffer.writeFloatLE(v2[1], offset + 28);
    buffer.writeFloatLE(v2[2], offset + 32);

    // Vertex 3 (3 x Float32)
    buffer.writeFloatLE(v3[0], offset + 36);
    buffer.writeFloatLE(v3[1], offset + 40);
    buffer.writeFloatLE(v3[2], offset + 44);

    // Attribute byte count (UInt16 = 0)
    buffer.writeUInt16LE(0, offset + 48);

    offset += 50;
  }

  return buffer;
}

/**
 * Creates ASCII STL string from array of triangles
 */
export function createAsciiSTLString(triangles, solidName = 'part') {
  let output = `solid ${solidName}\n`;

  for (const [v1, v2, v3] of triangles) {
    const normal = computeNormal(v1, v2, v3);
    output += `  facet normal ${normal[0].toFixed(6)} ${normal[1].toFixed(6)} ${normal[2].toFixed(6)}\n`;
    output += `    outer loop\n`;
    output += `      vertex ${v1[0].toFixed(6)} ${v1[1].toFixed(6)} ${v1[2].toFixed(6)}\n`;
    output += `      vertex ${v2[0].toFixed(6)} ${v2[1].toFixed(6)} ${v2[2].toFixed(6)}\n`;
    output += `      vertex ${v3[0].toFixed(6)} ${v3[1].toFixed(6)} ${v3[2].toFixed(6)}\n`;
    output += `    endloop\n`;
    output += `  endfacet\n`;
  }

  output += `endsolid ${solidName}\n`;
  return output;
}

/**
 * Exports mesh to STL file and returns detailed part metrics
 *
 * @param {string} filePath - Target file path (.stl)
 * @param {Object} mesh - { vertices, faces }
 * @param {Object} [options]
 * @param {boolean} [options.ascii=false] - Generate ASCII instead of binary
 * @param {string} [options.name='part']
 * @param {number} [options.filamentDensity=1.24] - Density in g/cm³ (PLA default)
 * @returns {Object} Print statistics and file info
 */
export function exportSTL(filePath, mesh, options = {}) {
  const {
    ascii = false,
    name = path.basename(filePath, path.extname(filePath)),
    filamentDensity = 1.24
  } = options;

  const triangles = meshToTriangles(mesh);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (ascii) {
    const stlContent = createAsciiSTLString(triangles, name);
    fs.writeFileSync(filePath, stlContent, 'utf-8');
  } else {
    const buffer = createBinarySTLBuffer(triangles, name);
    fs.writeFileSync(filePath, buffer);
  }

  const fileStats = fs.statSync(filePath);
  const bbox = computeBoundingBox(mesh);
  const { volume, surfaceArea } = computeMeshVolumeAndArea(mesh);
  const watertight = checkWatertight(mesh);
  const filament = estimateFilament(volume, filamentDensity);

  return {
    filePath: path.resolve(filePath),
    fileName: path.basename(filePath),
    fileSizeKB: Math.round((fileStats.size / 1024) * 10) / 10,
    format: ascii ? 'ASCII' : 'Binary',
    triangles: triangles.length,
    vertices: mesh.vertices.length,
    boundingBox: {
      widthX: Math.round(bbox.size[0] * 100) / 100,
      depthY: Math.round(bbox.size[1] * 100) / 100,
      heightZ: Math.round(bbox.size[2] * 100) / 100
    },
    volumeMm3: filament.volumeMm3,
    surfaceAreaMm2: Math.round(surfaceArea * 100) / 100,
    estimatedWeightGrams: filament.weightGrams,
    estimatedFilamentMeters: filament.lengthMeters,
    isWatertight: watertight.isWatertight
  };
}
