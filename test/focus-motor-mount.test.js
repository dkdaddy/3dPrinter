import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateFocusMotorMount, createFocusMotorMountMesh, slotLayout, baseHolePosition } from '../src/parts/focus-motor-mount/index.js';
import { read3MF, load3MFMesh } from '../src/utils/threemf.js';
import { computeMeshVolumeAndArea } from '../src/utils/mesh.js';

describe('focus motor mount', () => {
  it('builds a watertight 70 x 40 plate with stud and wall', () => {
    const outputPath = path.join(os.tmpdir(), 'focus-motor-mount-test.3mf');
    const { stats } = generateFocusMotorMount({ outputPath });

    assert.equal(stats.isWatertight, true);
    assert.equal(stats.boundingBox.widthX, 70);
    assert.equal(stats.boundingBox.depthY, 40);
    assert.equal(stats.boundingBox.heightZ, 18);
    const reloaded = load3MFMesh(read3MF(outputPath));
    assert.equal(reloaded.faces.length, stats.triangles);
  });

  it('has the expected volume (plate + wall + stud - slots) and positive orientation', () => {
    const mesh = createFocusMotorMountMesh();
    const { volume } = computeMeshVolumeAndArea(mesh);
    const stud = Math.PI * 4.15 * 4.15 * 10;
    const slotArea = ({ x0, x1, width: w }) => (x1 - x0 - w) * w + Math.PI * (w / 2) ** 2;
    const slots = slotLayout().slots.reduce((sum, s) => sum + slotArea(s), 0) * 3;
    const wallHoles = 2 * Math.PI * 2 ** 2 * 3;
    const baseHole = Math.PI * 2 ** 2 * 3;
    const roundedCorner = (1 - Math.PI / 4) * 6 * 6; // area removed per 6mm-radius corner
    const corners = 4 * roundedCorner * 3 + 2 * roundedCorner * 3;
    // polygonal circles are slightly under the true area
    const expected = 70 * 40 * 3 + 3 * 40 * 15 + stud - slots - corners - wallHoles - baseHole;
    assert.equal(volume > 0, true);
    assert.equal(Math.abs(volume - expected) / expected < 0.005, true);
  });

  it('places the stud 10mm / 10mm from the edges and the wall centre 11.5mm from it', () => {
    const mesh = createFocusMotorMountMesh();
    const studTop = mesh.vertices.filter(v => v[2] === 13 && v[0] < 20);
    const cx = studTop.reduce((s, v) => s + v[0], 0) / studTop.length;
    const cy = studTop.reduce((s, v) => s + v[1], 0) / studTop.length;
    assert.equal(Math.abs(cx - 10) < 1e-6 && Math.abs(cy - 10) < 1e-6, true);
    const studR = Math.max(...studTop.map(v => Math.hypot(v[0] - cx, v[1] - cy)));
    assert.equal(Math.abs(studR - 4.15) < 1e-6, true);
    const wallX = [...new Set(mesh.vertices.filter(v => v[2] === 18 && v[0] > 15).map(v => v[0]))].sort((a, b) => a - b);
    assert.deepEqual(wallX, [20, 23]);
    assert.equal(Math.abs((wallX[0] + wallX[1]) / 2 - cx - 11.5) < 1e-6, true);
  });

  it('cuts staggered slots that follow the motor twisted to fit 35mm bolts into 30mm slots', () => {
    const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
    const layout = slotLayout();
    const [low, spindle, high] = layout.slots;

    assert.equal(near(layout.twistDeg, (Math.acos(30 / 35) * 180) / Math.PI), true);
    assert.equal(near(layout.shaftShiftY, 10 * Math.sin(Math.acos(30 / 35))), true);

    // Slot group fills the 24-65 envelope (24 = 1mm clear of the wall)
    assert.equal(near(Math.min(...layout.slots.map(s => s.x0)), 24), true);
    assert.equal(near(Math.max(...layout.slots.map(s => s.x1)), 65), true);
    assert.equal(near(layout.travel, 41 - 25.59, 0.01), true);

    // At both ends of the travel the bolts are 35mm apart and the shaft is 10mm off the bolt line, on the stud side
    for (const t of [0, layout.travel]) {
      const p1 = [low.x0 + low.width / 2 + t, low.cy];
      const p2 = [high.x0 + high.width / 2 + t, high.cy];
      const s = [spindle.x0 + spindle.width / 2 + t, spindle.cy];
      const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      const along = [p2[0] - p1[0], p2[1] - p1[1]];
      assert.equal(near(Math.hypot(...along), 35), true);
      const rel = [s[0] - mid[0], s[1] - mid[1]];
      assert.equal(near(Math.hypot(...rel), 10), true);
      assert.equal(near(rel[0] * along[0] + rel[1] * along[1], 0), true);
      assert.equal(rel[0] < 0, true);
      // the bolt on the Y = 0 side is the one nearer the stud end
      assert.equal(p1[0] < p2[0], true);
    }

    // The mesh has the slots where the layout says (bottom face outline vertices)
    const mesh = createFocusMotorMountMesh();
    const bottom = mesh.vertices.filter(v => v[2] === 0 && v[0] > 10 && v[0] < 66);
    const extent = s => {
      const vs = bottom.filter(v => v[0] >= s.x0 - 1e-6 && v[0] <= s.x1 + 1e-6 && Math.abs(v[1] - s.cy) <= s.width / 2 + 1e-6);
      return [Math.min(...vs.map(v => v[0])), Math.max(...vs.map(v => v[0])), Math.min(...vs.map(v => v[1])), Math.max(...vs.map(v => v[1]))];
    };
    for (const s of layout.slots) {
      const [x0, x1, y0, y1] = extent(s);
      assert.equal(near(x0, s.x0) && near(x1, s.x1), true, s.name);
      assert.equal(near(y0, s.cy - s.width / 2) && near(y1, s.cy + s.width / 2), true, s.name);
    }
  });

  it('can mirror the twist and put the shaft on the far side of the bolt line', () => {
    const mirrored = slotLayout({ shaftSide: 'far', lowYBoltToward: 'far' });
    const [low, spindle, high] = mirrored.slots;
    assert.equal(low.cx > high.cx, true);
    assert.equal(spindle.cy > 20 && mirrored.shaftShiftY > 0, true);
    assert.equal(createFocusMotorMountMesh({ shaftSide: 'far', lowYBoltToward: 'far' }).faces.length > 0, true);
  });

  it('drills two 4mm fixing holes through the wall, 8mm in from the side and top edges', () => {
    const mesh = createFocusMotorMountMesh();
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    for (const wx of [20, 23]) {
      for (const hy of [8, 32]) {
        const ring = mesh.vertices.filter(v => near(v[0], wx) && Math.hypot(v[1] - hy, v[2] - 10) < 2.1);
        assert.equal(ring.length, 32, `hole at y=${hy}, x=${wx}`);
        for (const v of ring) assert.equal(near(Math.hypot(v[1] - hy, v[2] - 10), 2), true);
      }
    }
  });

  it('puts a 4mm base plate hole 10mm from the stud end, centred across the width', () => {
    const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
    const hole = baseHolePosition();
    assert.equal(near(hole.x, 10) && near(hole.y, 20), true);
    assert.equal(hole.studGap >= 1 && hole.wallGap >= 1, true);

    const mesh = createFocusMotorMountMesh();
    for (const z of [0, 3]) {
      const ring = mesh.vertices.filter(v => near(v[2], z) && Math.hypot(v[0] - 10, v[1] - 20) < 2.1);
      assert.equal(ring.length, 32, `z=${z}`);
      for (const v of ring) assert.equal(near(Math.hypot(v[0] - 10, v[1] - 20), 2), true);
    }
    assert.throws(() => createFocusMotorMountMesh({ baseHoleDiameter: 12 })); // would touch the stud
    assert.throws(() => createFocusMotorMountMesh({ baseHoleFromStudEnd: 2 }));
  });

  it('rejects wall holes that do not fit', () => {
    assert.throws(() => createFocusMotorMountMesh({ wallHoleInset: 2 }));
    assert.throws(() => createFocusMotorMountMesh({ wallHoleInset: 18 }));
    assert.throws(() => createFocusMotorMountMesh({ wallHoleDiameter: 16 }));
  });

  it('rounds the plate corners and the top corners of the wall with a 6mm radius', () => {
    const mesh = createFocusMotorMountMesh();
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    const has = (x, y, z) => mesh.vertices.some(v => near(v[0], x) && near(v[1], y) && near(v[2], z));
    for (const [cx, cy] of [[0, 0], [70, 0], [0, 40], [70, 40]]) {
      assert.equal(has(cx, cy, 0), false);
      assert.equal(has(cx, cy, 3), false);
    }
    assert.equal(has(6, 0, 0) && has(0, 6, 0) && has(64, 0, 0) && has(70, 34, 3), true);
    // wall: straight up to 12mm, then a 6mm arc to the flat top
    assert.equal(has(20, 0, 18) || has(23, 0, 18), false);
    assert.equal(has(20, 0, 12) && has(23, 40, 12) && has(20, 6, 18) && has(23, 34, 18), true);
    // every arc vertex lies on the 6mm circle
    const arc = mesh.vertices.filter(v => v[0] < 6 && v[1] < 6 && v[2] === 0);
    for (const v of arc) assert.equal(near(Math.hypot(v[0] - 6, v[1] - 6), 6) || near(v[0], 0) || near(v[1], 0), true);
  });

  it('rejects corner radii that do not fit', () => {
    assert.throws(() => createFocusMotorMountMesh({ plateCornerRadius: 25 }));
    assert.throws(() => createFocusMotorMountMesh({ wallCornerRadius: 21 }));
  });

  it('writes a dimensions sidecar for the viewer overlay', () => {
    const outputPath = path.join(os.tmpdir(), 'focus-motor-mount-dims-test.3mf');
    generateFocusMotorMount({ outputPath });
    const { dimensions } = JSON.parse(fs.readFileSync(outputPath.replace(/\.3mf$/, '.dims.json'), 'utf8'));
    const labels = dimensions.map(d => d.label);
    for (const l of ['70', '40', '18', '11.5', 'Ø8.3', '10', '30', '24', '27.41', '19.41', '5', '5.15', '12', '8', 'Ø4']) assert.equal(labels.includes(l), true, l);
  });

  it('rejects dimensions where the stud would overlap the wall', () => {
    assert.throws(() => createFocusMotorMountMesh({ wallOffsetFromStud: 5 }));
  });

  it('rejects slots that do not fit on the plate', () => {
    assert.throws(() => createFocusMotorMountMesh({ screwSpacing: 40 })); // slots wider apart than the motor bolts
    assert.throws(() => createFocusMotorMountMesh({ slotEndFromStudEnd: 45 })); // no room left for motor travel
    assert.throws(() => createFocusMotorMountMesh({ slotStartFromStudEnd: 20 }));
    assert.throws(() => createFocusMotorMountMesh({ slotEndFromStudEnd: 70 }));
  });
});
