import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createVixenPlateMesh } from '../scripts/vixen-plate.js';
import { computeBoundingBox, computeMeshVolumeAndArea, checkWatertight } from '../src/utils/mesh.js';

describe('vixen plate', () => {
  it('is a watertight 120 x 34 x 20 dovetail bar (34 at the base, 23.3 at the top) with the expected volume', async () => {
    const { mesh, wide, narrow } = await createVixenPlateMesh();
    assert.equal(checkWatertight(mesh).isWatertight, true);

    const bb = computeBoundingBox(mesh);
    assert.ok(Math.abs(bb.size[0] - 120) < 1e-3);
    assert.ok(Math.abs(bb.size[1] - wide) < 1e-3);
    assert.ok(Math.abs(bb.size[2] - 20) < 1e-3);
    assert.equal(wide, 34);
    assert.ok(Math.abs(narrow - (34 - 2 * 20 / Math.tan((75 * Math.PI) / 180))) < 1e-9);

    const barVolume = ((wide + narrow) / 2) * 20 * 120;
    const perHole = Math.PI * 5 ** 2 * 12 + Math.PI * 3 ** 2 * 8;
    const { volume } = computeMeshVolumeAndArea(mesh);
    assert.ok(Math.abs(volume - (barVolume - 6 * perHole)) / volume < 0.01);
  });

  it('places six holes in mirrored pairs at 60, 84 and 108 mm spacing on the centreline', async () => {
    const { holes } = await createVixenPlateMesh();
    assert.equal(holes.length, 6);
    assert.ok(holes.every(h => h[1] === 0));
    const xs = holes.map(h => h[0]).sort((a, b) => a - b);
    assert.deepEqual([xs[3] - xs[2], xs[4] - xs[1], xs[5] - xs[0]], [60, 84, 108]);
  });
});
