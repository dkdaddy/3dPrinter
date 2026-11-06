import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { read3MF } from '../src/utils/threemf.js';
import { checkWatertight } from '../src/utils/mesh.js';
import { resizeRing, CENTER } from '../scripts/lib/etx-ring.js';

const source = read3MF(new URL('../models/ETX_90_part_1_SV165_adapter_2.3mf', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const ring = source.objects.get(1).mesh;

// Lug slit faces: the two lug vertex y levels closest to the slit centre
function slitWidth(vertices, rIn) {
  const lug = vertices.filter(v => v[0] < CENTER[0] - rIn - 6 && Math.abs(v[1] - CENTER[1]) < 6);
  const ys = lug.map(v => v[1] - CENTER[1]);
  return Math.min(...ys.filter(y => y > 0)) - Math.max(...ys.filter(y => y < 0));
}

describe('resizeRing', () => {
  it('keeps the slit at 2 mm by default', () => {
    const r = resizeRing(ring, { innerDiameter: 125 });
    assert.ok(Math.abs(slitWidth(r.vertices, r.rInNew + r.wall) - 2) < 1e-6);
  });

  it('reports the nut trap position in the new coordinates', () => {
    const r = resizeRing(ring, { innerDiameter: 125, slitExtra: 3 });
    assert.ok(Math.abs(r.nut.yOuter - r.nut.yFloor - 2.7) < 0.02);
    assert.ok(Math.abs(r.nut.yOuter - 7.04) < 0.02);
  });

  it('opens the slit wider while keeping the circle radii and watertightness', () => {
    const r = resizeRing(ring, { innerDiameter: 125, slitExtra: 3 });
    assert.ok(Math.abs(slitWidth(r.vertices, r.rInNew + r.wall) - 5) < 1e-6);
    assert.ok(checkWatertight({ vertices: r.vertices, faces: ring.faces }).isWatertight);

    const radii = r.vertices
      .map(v => Math.hypot(v[0] - CENTER[0], v[1] - CENTER[1]))
      .filter(d => Math.abs(d - 62.5) < 0.02 || Math.abs(d - 65.5) < 0.02);
    assert.ok(radii.length > 600);
  });
});
