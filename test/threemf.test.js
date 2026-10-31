import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readZip, writeZip } from '../src/utils/zip.js';
import {
  parse3MF,
  create3MFPackage,
  serialize3MF,
  get3MFParts,
  load3MFMesh,
  setObjectMesh,
  multiplyTransforms,
  invertTransform,
  transformPoint
} from '../src/utils/threemf.js';
import { createBox } from '../src/utils/primitives.js';
import { computeBoundingBox, computeMeshVolumeAndArea, checkWatertight } from '../src/utils/mesh.js';

describe('zip utilities', () => {
  it('round-trips stored and deflated entries', () => {
    const big = Buffer.from('abc'.repeat(1000));
    const small = Buffer.from([1, 2, 3]);
    const entries = readZip(writeZip([{ name: 'a/big.txt', data: big }, { name: 'small.bin', data: small }]));
    assert.deepEqual(entries.map(e => e.name), ['a/big.txt', 'small.bin']);
    assert.equal(entries[0].data.equals(big), true);
    assert.equal(entries[1].data.equals(small), true);
  });
});

describe('3MF utilities', () => {
  it('composes and inverts transforms using the row-vector convention', () => {
    const scale2 = [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0];
    const move = [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 0];
    // scale first, then move
    const m = multiplyTransforms(scale2, move);
    assert.deepEqual(transformPoint(m, [1, 1, 1]), [12, 2, 2]);
    const back = transformPoint(invertTransform(m), [12, 2, 2]);
    back.forEach((c, i) => assert.equal(Math.abs(c - 1) < 1e-12, true, `axis ${i}`));
  });

  it('exports a mesh to 3MF and reads it back unchanged', () => {
    const box = createBox({ width: 10, depth: 20, height: 30 });
    const pkg = parse3MF(serialize3MF(create3MFPackage(box, { name: 'box' })));
    const mesh = load3MFMesh(pkg);

    assert.equal(mesh.faces.length, box.faces.length);
    assert.equal(checkWatertight(mesh).isWatertight, true);
    assert.deepEqual(computeBoundingBox(mesh).size.map(Math.round), [10, 20, 30]);
    assert.equal(Math.abs(computeMeshVolumeAndArea(mesh).volume - 6000) < 1e-6, true);
  });

  it('flattens nested components and build transforms to millimetres', () => {
    const pkg = create3MFPackage(createBox({ width: 1, depth: 1, height: 1, center: true }));
    // An inch-based model: leaf box wrapped in a component, scaled by the build item
    pkg.unit = 'inch';
    pkg.header = pkg.header.replace('unit="millimeter"', 'unit="inch"');
    pkg.objects.set(2, {
      id: 2,
      attrs: 'id="2" type="model"',
      type: 'model',
      components: [{ objectId: 1, transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 0, 0] }]
    });
    pkg.build = [{ objectId: 2, transform: [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0] }];

    const reread = parse3MF(serialize3MF(pkg));
    const [part] = get3MFParts(reread);
    const bb = computeBoundingBox(part.mesh);
    assert.equal(Math.abs(bb.size[0] - 2 * 25.4) < 1e-6, true);
    // centered box shifted by 5 inches, then scaled by 2 => center at 10 inches
    assert.equal(Math.abs((bb.min[0] + bb.max[0]) / 2 - 10 * 25.4) < 1e-6, true);
  });

  it('edits an object mesh and keeps other package entries intact', () => {
    const pkg = create3MFPackage(createBox({ width: 10, depth: 10, height: 10 }));
    pkg.entries.push({ name: 'Metadata/keep.txt', data: Buffer.from('keep me') });

    setObjectMesh(pkg, 1, createBox({ width: 20, depth: 10, height: 10 }));
    const reread = parse3MF(serialize3MF(pkg));

    assert.equal(reread.entries.find(e => e.name === 'Metadata/keep.txt').data.toString(), 'keep me');
    assert.equal(Math.round(computeBoundingBox(load3MFMesh(reread)).size[0]), 20);
  });
});
