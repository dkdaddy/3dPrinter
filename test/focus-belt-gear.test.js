import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { generateFocusBeltGear } from '../src/parts/focus-belt-gear/index.js';
import { read3MF, load3MFMesh } from '../src/utils/threemf.js';

describe('focus belt gear', () => {
  it('builds a watertight 42T GT2 gear, 18mm wide with 2mm flanges', () => {
    const outputPath = path.join(os.tmpdir(), 'focus-belt-gear-test.3mf');
    const { stats, specs, config } = generateFocusBeltGear({ outputPath });

    assert.equal(stats.isWatertight, true);
    const reloaded = load3MFMesh(read3MF(outputPath));
    assert.equal(reloaded.faces.length, stats.triangles);
    assert.equal(Math.round(stats.boundingBox.    heightZ), 18);
        assert.equal(specs.teeth, 42);
        assert.equal(Math.abs(specs.pitchDiameter - 26.74) < 0.01, true);
        assert.equal(Math.abs(specs.tipDiameter - 26.23) < 0.01, true);
        assert.equal(Math.abs(specs.flangeDiameter - 28.63) < 0.01, true);
    assert.equal(Math.abs(stats.boundingBox.widthX - specs.flangeDiameter) < 0.1, true);
    assert.equal(config.boreDiameter, 16.1);
    assert.equal(config.toothedBoreLength, 10);
  });
});
