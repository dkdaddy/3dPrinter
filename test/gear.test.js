import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateGearProfile2D, createGearMesh } from '../src/utils/gear.js';
import { checkWatertight, computeBoundingBox, computeMeshVolumeAndArea } from '../src/utils/mesh.js';
import { polygonArea } from '../src/utils/polygon.js';

describe('gear utilities', () => {
  it('calculates theoretical involute gear specifications', () => {
    const teeth = 16;
    const module = 1.5;
    const { specs } = generateGearProfile2D({ teeth, module, pressureAngle: 20 });

    assert.equal(specs.teeth, 16);
    assert.equal(specs.module, 1.5);
    assert.equal(specs.pitchDiameter, 24.0); // d = m * z = 1.5 * 16
    assert.equal(specs.circularPitch.toFixed(2), (Math.PI * 1.5).toFixed(2));
    assert.equal(specs.tipDiameter > specs.pitchDiameter, true);
    assert.equal(specs.rootDiameter < specs.pitchDiameter, true);
  });

  it('generates a solid 3D watertight gear mesh', () => {
    const { mesh, specs } = createGearMesh({
      teeth: 16,
      module: 1.5,
      height: 7,
      boreDiameter: 5.0,
      hubDiameter: 0
    });

    assert.equal(mesh.vertices.length > 0, true);
    assert.equal(mesh.faces.length > 0, true);

    const wt = checkWatertight(mesh);
    assert.equal(wt.isWatertight, true);
    assert.equal(wt.boundaryEdges, 0);
    assert.equal(wt.nonManifoldEdges, 0);

    const bbox = computeBoundingBox(mesh);
    assert.equal(Math.round(bbox.size[2]), 7); // height = 7mm
    assert.equal(Math.abs(bbox.size[0] - specs.tipDiameter) < 0.2, true);
  });

  it('generates a simple counter-clockwise profile whose mesh volume matches its area', () => {
    const { points } = generateGearProfile2D({ teeth: 16, module: 1.5 });

    // Every vertex must advance CCW around the origin (no zigzag / self-intersection)
    let totalAngle = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      let d = Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]);
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      assert.equal(d > -1e-9, true);
      totalAngle += d;
    }
    assert.equal(Math.abs(totalAngle - 2 * Math.PI) < 1e-6, true);

    const height = 7;
    const boreDiameter = 5;
    const { mesh } = createGearMesh({ teeth: 16, module: 1.5, height, boreDiameter, hubDiameter: 0 });

    const boreArea = Math.PI * (boreDiameter / 2) ** 2; // 24-gon bore is slightly smaller
    const expected = (polygonArea(points) - boreArea) * height;
    const { volume } = computeMeshVolumeAndArea(mesh);
    assert.equal(Math.abs(volume - expected) / expected < 0.01, true);
  });

  it('generates gear with D-shaft bore', () => {
    const { mesh } = createGearMesh({
      teeth: 14,
      module: 1.5,
      height: 6,
      boreDiameter: 5.0,
      boreType: 'd-shaft',
      dShaftFlatDistance: 4.5,
      hubDiameter: 0
    });

    const wt = checkWatertight(mesh);
    assert.equal(wt.isWatertight, true);
  });
});
