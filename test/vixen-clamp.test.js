import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createVixenClampMesh } from '../scripts/vixen-clamp.js';
import { createVixenPlateMesh } from '../scripts/vixen-plate.js';
import { computeBoundingBox, checkWatertight } from '../src/utils/mesh.js';

describe('vixen clamp', () => {
  it('is a watertight 44 x 38 x 15 block', async () => {
    const { mesh } = await createVixenClampMesh();
    assert.equal(checkWatertight(mesh).isWatertight, true);
    const bb = computeBoundingBox(mesh);
    assert.ok(Math.abs(bb.size[0] - 44) < 1e-3);
    assert.ok(Math.abs(bb.size[1] - 38) < 1e-3);
    assert.ok(Math.abs(bb.size[2] - 15) < 1e-3);
  });

  it('has a channel that the 34 mm / 75 deg bar fits into', async () => {
    const clamp = await createVixenClampMesh();
    const plate = await createVixenPlateMesh();
    // Bar width at the clamp's channel depth (clamp height - floor above the bar's base face)
    const depth = clamp.config.height - clamp.config.floor;
    const barAtTop = plate.wide - (2 * depth) / Math.tan((75 * Math.PI) / 180);
    assert.ok(clamp.floorW > plate.wide);
    assert.ok(clamp.topW > barAtTop);
  });
});
