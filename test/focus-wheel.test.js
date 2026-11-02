import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { generateFocusWheel } from '../src/parts/focus-wheel/index.js';
import { read3MF, load3MFMesh } from '../src/utils/threemf.js';

describe('focus wheel', () => {
  it('builds a watertight 38 x 8mm knurled wheel with a pinion-shaped hole', () => {
    const outputPath = path.join(os.tmpdir(), 'focus-wheel-test.3mf');
    const { stats, specs } = generateFocusWheel({ outputPath });

    assert.equal(stats.isWatertight, true);
    assert.equal(stats.fileName.endsWith('.3mf'), true);
    const reloaded = load3MFMesh(read3MF(outputPath));
    assert.equal(reloaded.faces.length, stats.triangles);
    assert.equal(Math.round(stats.boundingBox.heightZ), 8);
    assert.equal(Math.abs(stats.boundingBox.widthX - 38) < 0.1, true);
    assert.equal(specs.teeth, 20);
    assert.equal(Math.abs(specs.tipDiameter - 12.22) < 0.05, true);
    assert.equal(Math.abs(specs.pitchDiameter - 12.73) < 0.01, true);
  });
});
