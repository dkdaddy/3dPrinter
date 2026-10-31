import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createBinarySTLBuffer,
  createAsciiSTLString,
  exportSTL
} from '../src/utils/stl.js';
import { createBox } from '../src/utils/primitives.js';

describe('stl exporter utilities', () => {
  it('creates binary STL buffer according to standard specification', () => {
    // 2 triangles
    const triangles = [
      [ [0, 0, 0], [1, 0, 0], [0, 1, 0] ],
      [ [1, 0, 0], [1, 1, 0], [0, 1, 0] ]
    ];

    const buf = createBinarySTLBuffer(triangles, 'TestPart');
    const expectedSize = 84 + 2 * 50; // 84 header + count, 50 bytes per triangle
    assert.equal(buf.length, expectedSize);

    // Check triangle count in uint32 at offset 80
    const count = buf.readUInt32LE(80);
    assert.equal(count, 2);
  });

  it('creates valid ASCII STL string', () => {
    const triangles = [
      [ [0, 0, 0], [1, 0, 0], [0, 1, 0] ]
    ];
    const ascii = createAsciiSTLString(triangles, 'UnitTri');
    assert.equal(ascii.startsWith('solid UnitTri'), true);
    assert.equal(ascii.includes('facet normal'), true);
    assert.equal(ascii.includes('vertex 0.000000 0.000000 0.000000'), true);
    assert.equal(ascii.trim().endsWith('endsolid UnitTri'), true);
  });

  it('exports box mesh to binary STL and computes correct volume & stats', () => {
    const box = createBox({ width: 10, depth: 10, height: 10 }); // 1000 mm^3
    const tmpFile = path.join(os.tmpdir(), `test-box-${Date.now()}.stl`);

    const stats = exportSTL(tmpFile, box);

    assert.equal(stats.triangles, 12); // 6 faces * 2 triangles
    assert.equal(stats.boundingBox.widthX, 10);
    assert.equal(stats.boundingBox.depthY, 10);
    assert.equal(stats.boundingBox.heightZ, 10);
    assert.equal(stats.volumeMm3, 1000);
    assert.equal(stats.isWatertight, true);

    const fileBuf = fs.readFileSync(tmpFile);
    assert.equal(fileBuf.length, 84 + 12 * 50);

    fs.unlinkSync(tmpFile);
  });
});
