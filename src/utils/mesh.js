/**
 * 3D Mesh Data Structure & Utilities
 */

import {
  vec3,
  add3,
  rotateX,
  rotateY,
  rotateZ,
  signedTriangleVolume,
  triangleArea
} from './math3d.js';

export function createMesh(vertices = [], faces = []) {
  return { vertices, faces };
}

export function meshToTriangles(mesh) {
  const triangles = [];
  for (const face of mesh.faces) {
    triangles.push([
      mesh.vertices[face[0]],
      mesh.vertices[face[1]],
      mesh.vertices[face[2]]
    ]);
  }
  return triangles;
}

export function trianglesToMesh(triangles) {
  const vertices = [];
  const faces = [];
  const vMap = new Map();

  function getOrAddVertex(v) {
    // Quantize to avoid floating point duplication
    const key = `${v[0].toFixed(5)},${v[1].toFixed(5)},${v[2].toFixed(5)}`;
    if (vMap.has(key)) {
      return vMap.get(key);
    }
    const idx = vertices.length;
    vertices.push([v[0], v[1], v[2]]);
    vMap.set(key, idx);
    return idx;
  }

  for (const tri of triangles) {
    const i0 = getOrAddVertex(tri[0]);
    const i1 = getOrAddVertex(tri[1]);
    const i2 = getOrAddVertex(tri[2]);
    if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
      faces.push([i0, i1, i2]);
    }
  }

  return { vertices, faces };
}

export function translateMesh(mesh, [dx = 0, dy = 0, dz = 0]) {
  const vertices = mesh.vertices.map(v => [v[0] + dx, v[1] + dy, v[2] + dz]);
  return { vertices, faces: [...mesh.faces] };
}

export function scaleMesh(mesh, factor) {
  const [sx, sy, sz] = Array.isArray(factor) ? factor : [factor, factor, factor];
  const vertices = mesh.vertices.map(v => [v[0] * sx, v[1] * sy, v[2] * sz]);
  return { vertices, faces: [...mesh.faces] };
}

export function rotateMesh(mesh, [rx = 0, ry = 0, rz = 0]) {
  let vertices = mesh.vertices;
  if (rx !== 0) vertices = vertices.map(v => rotateX(v, rx));
  if (ry !== 0) vertices = vertices.map(v => rotateY(v, ry));
  if (rz !== 0) vertices = vertices.map(v => rotateZ(v, rz));
  return { vertices, faces: [...mesh.faces] };
}

/**
 * Merges multiple meshes into a single watertight or composite mesh
 */
export function mergeMeshes(meshes) {
  const mergedVertices = [];
  const mergedFaces = [];

  for (const mesh of meshes) {
    const offset = mergedVertices.length;
    for (const v of mesh.vertices) {
      mergedVertices.push([v[0], v[1], v[2]]);
    }
    for (const f of mesh.faces) {
      mergedFaces.push([f[0] + offset, f[1] + offset, f[2] + offset]);
    }
  }

  return { vertices: mergedVertices, faces: mergedFaces };
}

/**
 * Computes bounding box of mesh
 */
export function computeBoundingBox(mesh) {
  if (mesh.vertices.length === 0) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      size: [0, 0, 0],
      center: [0, 0, 0]
    };
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const v of mesh.vertices) {
    if (v[0] < minX) minX = v[0];
    if (v[0] > maxX) maxX = v[0];
    if (v[1] < minY) minY = v[1];
    if (v[1] > maxY) maxY = v[1];
    if (v[2] < minZ) minZ = v[2];
    if (v[2] > maxZ) maxZ = v[2];
  }

  const size = [maxX - minX, maxY - minY, maxZ - minZ];
  const center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    size,
    center
  };
}

/**
 * Calculates volume (in mm^3) and surface area (in mm^2)
 */
export function computeMeshVolumeAndArea(mesh) {
  let volume = 0;
  let surfaceArea = 0;

  for (const [i1, i2, i3] of mesh.faces) {
    const v1 = mesh.vertices[i1];
    const v2 = mesh.vertices[i2];
    const v3 = mesh.vertices[i3];

    volume += signedTriangleVolume(v1, v2, v3);
    surfaceArea += triangleArea(v1, v2, v3);
  }

  return {
    volume: Math.abs(volume),
    surfaceArea
  };
}

/**
 * Checks manifold / watertight condition
 */
export function checkWatertight(mesh) {
  const edgeCount = new Map();

  for (const [i0, i1, i2] of mesh.faces) {
    const edges = [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ];
    for (const [a, b] of edges) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;

  for (const count of edgeCount.values()) {
    if (count === 1) boundaryEdges++;
    else if (count > 2) nonManifoldEdges++;
  }

  const isWatertight = boundaryEdges === 0 && nonManifoldEdges === 0;

  return {
    isWatertight,
    boundaryEdges,
    nonManifoldEdges,
    totalEdges: edgeCount.size
  };
}

/**
 * Estimates 3D printing filament consumption
 * density in g/cm³ (default PLA = 1.24)
 * filamentDiameter in mm (default 1.75mm)
 */
export function estimateFilament(volumeMm3, density = 1.24, filamentDiameter = 1.75) {
  const volumeCm3 = volumeMm3 / 1000.0;
  const weightGrams = volumeCm3 * density;
  const filamentAreaMm2 = Math.PI * Math.pow(filamentDiameter / 2, 2);
  const lengthMeters = (volumeMm3 / filamentAreaMm2) / 1000.0;

  return {
    volumeMm3: Math.round(volumeMm3 * 100) / 100,
    volumeCm3: Math.round(volumeCm3 * 100) / 100,
    weightGrams: Math.round(weightGrams * 100) / 100,
    lengthMeters: Math.round(lengthMeters * 100) / 100
  };
}
