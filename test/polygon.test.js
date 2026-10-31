import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  polygonArea,
  isCCW,
  ensureWinding,
  createCircle,
  createRectangle,
  triangulateSimplePolygon,
  triangulatePolygonWithHoles
} from '../src/utils/polygon.js';

describe('polygon utilities', () => {
  it('computes polygon area and detects winding', () => {
    // 10x10 square CCW
    const ccwSquare = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ];
    assert.equal(polygonArea(ccwSquare), 100);
    assert.equal(isCCW(ccwSquare), true);

    const cwSquare = [...ccwSquare].reverse();
    assert.equal(polygonArea(cwSquare), -100);
    assert.equal(isCCW(cwSquare), false);

    const ensured = ensureWinding(cwSquare, true);
    assert.equal(isCCW(ensured), true);
  });

  it('triangulates a simple polygon', () => {
    const square = createRectangle(10, 10);
    const tris = triangulateSimplePolygon(square);
    assert.equal(tris.length, 2);
  });

  it('triangulates a polygon with a hole', () => {
    const outer = createCircle(10, 32);
    const hole = createCircle(4, 16);

    const { vertices, triangles } = triangulatePolygonWithHoles(outer, [hole]);
    assert.equal(triangles.length > 0, true);

    // Sum of triangle signed areas should match outer area - hole area
    let totalTriArea = 0;
    for (const [i0, i1, i2] of triangles) {
      const p0 = vertices[i0];
      const p1 = vertices[i1];
      const p2 = vertices[i2];
      const triArea = ((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0])) * 0.5;
      totalTriArea += triArea;
    }

    const expectedArea = Math.abs(polygonArea(outer)) - Math.abs(polygonArea(hole));
    assert.equal(Math.abs(totalTriArea - expectedArea) < 1e-6, true);
  });
});
