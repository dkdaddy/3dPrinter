import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  vec3,
  add3,
  sub3,
  scale3,
  dot3,
  cross3,
  length3,
  normalize3,
  computeNormal,
  signedTriangleVolume,
  rotateZ
} from '../src/utils/math3d.js';

describe('math3d utilities', () => {
  it('performs vector basic operations', () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, 5, 6);

    assert.deepEqual(add3(a, b), [5, 7, 9]);
    assert.deepEqual(sub3(b, a), [3, 3, 3]);
    assert.deepEqual(scale3(a, 2), [2, 4, 6]);
    assert.equal(dot3(a, b), 4 + 10 + 18);
  });

  it('computes cross product and face normal correctly', () => {
    const v1 = [0, 0, 0];
    const v2 = [1, 0, 0];
    const v3 = [0, 1, 0];

    const normal = computeNormal(v1, v2, v3);
    assert.deepEqual(normal, [0, 0, 1]);
  });

  it('computes signed tetrahedron volume', () => {
    // Unit tetrahedron with vertices (0,0,0), (1,0,0), (0,1,0), (0,0,1)
    const v1 = [1, 0, 0];
    const v2 = [0, 1, 0];
    const v3 = [0, 0, 1];

    const vol = signedTriangleVolume(v1, v2, v3);
    assert.equal(Math.abs(vol - 1 / 6) < 1e-6, true);
  });

  it('rotates vector around Z axis', () => {
    const v = [1, 0, 5];
    const rotated = rotateZ(v, Math.PI / 2);
    assert.equal(Math.abs(rotated[0] - 0) < 1e-6, true);
    assert.equal(Math.abs(rotated[1] - 1) < 1e-6, true);
    assert.equal(rotated[2], 5);
  });
});
