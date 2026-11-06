import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createAssembly } from '../scripts/etx105-assembly.js';
import { computeBoundingBox } from '../src/utils/mesh.js';

const mountFile = fileURLToPath(new URL('../output/ETX_105_flat_plate_mount.3mf', import.meta.url));

describe('ETX 105 assembly', () => {
  it('bolts the clamp to the 45 mm plate with its holes on the 20 mm pattern', async () => {
    const { plate, clampHoles } = await createAssembly(mountFile);
    assert.ok(Math.abs(plate.sizeX - 45) < 0.01 && Math.abs(plate.sizeZ - 45) < 0.01);
    const offsets = clampHoles.map(h => [h[0] - plate.cx, h[2] - plate.cz].map(n => Math.round(n * 1000) / 1000));
    for (const [dx, dz] of offsets) {
      assert.equal(Math.abs(dx), 10);
      assert.equal(Math.abs(dz), 10);
    }
  });

  it('seats the clamp on the plate and the bar on the clamp floor', async () => {
    const { parts, plate } = await createAssembly(mountFile);
    const [, clamp, bar] = parts.map(p => computeBoundingBox(p.mesh));
    assert.ok(Math.abs(clamp.min[1] - plate.yFace) < 1e-6);
    assert.ok(Math.abs(bar.min[1] - (plate.yFace + 8)) < 1e-6);
    assert.ok(Math.abs(bar.size[2] - 120) < 1e-6);
  });

  it('places the second band at the far end, 90 mm from the first, under the plate lap', async () => {
    const { parts, plate } = await createAssembly(mountFile);
    const byName = Object.fromEntries(parts.map(p => [p.name, computeBoundingBox(p.mesh)]));
    assert.ok(byName.band2);
    assert.ok(Math.abs(byName.band2.max[2] - byName.mount.max[2]) < 1e-3);
    assert.ok(Math.abs(byName.mount.max[2] - byName.mount.min[2] - 100) < 1e-3);
    // pad top meets the 8 mm lap underside (plate top 14 mm above the face, lap 8 mm thick)
    assert.ok(Math.abs(byName.band2.max[1] - (plate.yFace - 14 + 6)) < 1e-3);
  });
});
