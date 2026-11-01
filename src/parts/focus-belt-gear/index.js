import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  export3MF,
  generateGT2Profile2D,
  createCircle,
  ensureWinding,
  triangulatePolygonWithHoles,
  trianglesToMesh,
  computeBoundingBox,
  computeMeshVolumeAndArea,
  checkWatertight,
  estimateFilament
} from '../../utils/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Default configuration for the belt-driven focus gear: a GT2 toothed rim
 * between two flanges that keep the belt on, with the same push-fit
 * 20-tooth GT2 pinion-shaped centre hole as the focus wheel.
 */
export const DEFAULT_FOCUS_BELT_GEAR_CONFIG = {
  name: 'focus-belt-gear',
  teeth: 42,
  pitch: 2,              // GT2
  tipDiameter: undefined, // mm; defaults to pitch diameter - 0.508
  grooveTopWidth: 1.494, // mm, belt-tooth groove width at the tip circle (GT2)
  width: 18,             // mm, overall including both flanges
  flangeThickness: 2,    // mm, each side
  flangeOversize: 1.2,    // mm, radial, flange radius beyond the tooth tips
  pinionTeeth: 20,
  pinionPitch: 2,
  pinionTipDiameter: undefined,
  fitClearance: 0.1,     // mm radial clearance added to the pinion profile
  toothedBoreLength: 10, // mm of GT2-shaped bore at the bottom; the rest is a plain round bore
  boreDiameter: 16.1     // mm, plain round bore for the rest of the width
};

/**
 * Builds the flanged toothed rim as one watertight mesh (Z = axis).
 * The bore is `hole` (pinion-shaped) for the first `toothedBoreLength` mm from z=0,
 * then a plain round bore of `boreRadius` up to the top.
 */
function buildFlangedGear({ teethProfile, flangeRadius, hole, boreRadius, toothedBoreLength, width, flange }) {
  const outer = ensureWinding(createCircle(flangeRadius, 96), true);
  const toothLoop = ensureWinding(teethProfile, true);
  const holeLoop = ensureWinding(hole, false);
  const boreCCW = ensureWinding(createCircle(boreRadius, 72), true);
  const boreLoop = ensureWinding(boreCCW, false);
  const tris = [];

  const wall = (loop, z0, z1) => {
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const p = loop[i];
      const q = loop[(i + 1) % n];
      const b0 = [p[0], p[1], z0], b1 = [q[0], q[1], z0];
      const t0 = [p[0], p[1], z1], t1 = [q[0], q[1], z1];
      tris.push([b0, b1, t1], [b0, t1, t0]);
    }
  };

  // up=true: face normal +Z
  const cap = (outerLoop, holes, z, up) => {
    const { vertices, triangles } = triangulatePolygonWithHoles(outerLoop, holes);
    for (const [i, j, k] of triangles) {
      const a = [...vertices[i], z], b = [...vertices[j], z], c = [...vertices[k], z];
      tris.push(up ? [a, b, c] : [a, c, b]);
    }
  };

  const z1 = flange;
  const z2 = width - flange;

  cap(outer, [holeLoop], 0, false);
  cap(outer, [boreLoop], width, true);
  wall(outer, 0, z1);
  wall(outer, z2, width);
  // Exposed flange faces on the belt side; the tooth section is solid between them
  cap(outer, [toothLoop], z1, true);
  cap(outer, [toothLoop], z2, false);
  wall(toothLoop, z1, z2);
  // Pinion-shaped bore, then a ledge up to the plain round bore
  wall(holeLoop, 0, toothedBoreLength);
  cap(boreCCW, [holeLoop], toothedBoreLength, true);
  wall(boreLoop, toothedBoreLength, width);

  return trianglesToMesh(tris);
}

/**
 * Generates the belt gear 3MF (Z axis = bore axis, printed flat)
 * @param {Object} [customConfig]
 */
export function generateFocusBeltGear(customConfig = {}) {
  const config = { ...DEFAULT_FOCUS_BELT_GEAR_CONFIG, ...customConfig };

  const { points: teethProfile, specs } = generateGT2Profile2D({
    teeth: config.teeth,
    pitch: config.pitch,
    tipDiameter: config.tipDiameter,
    topWidth: config.grooveTopWidth
  });

  const { points: pinion, specs: pinionSpecs } = generateGT2Profile2D({
    teeth: config.pinionTeeth,
    pitch: config.pinionPitch,
    tipDiameter: config.pinionTipDiameter
  });
  const scale = (pinionSpecs.tipDiameter / 2 + config.fitClearance) / (pinionSpecs.tipDiameter / 2);
  const hole = pinion.map(([x, y]) => [x * scale, y * scale]);

  const flangeDiameter = specs.tipDiameter + 2 * config.flangeOversize;
  const boreDiameter = config.boreDiameter;
  const mesh = buildFlangedGear({
    teethProfile,
    flangeRadius: flangeDiameter / 2,
    hole,
    boreRadius: boreDiameter / 2,
    toothedBoreLength: config.toothedBoreLength,
    width: config.width,
    flange: config.flangeThickness
  });

  const outputPath = customConfig.outputPath || path.resolve(__dirname, '../../../output', `${config.name}.3mf`);
  export3MF(outputPath, mesh, { name: config.name });

  const bbox = computeBoundingBox(mesh);
  const { volume } = computeMeshVolumeAndArea(mesh);
  const filament = estimateFilament(volume);
  const round2 = v => Math.round(v * 100) / 100;
  const stats = {
    filePath: path.resolve(outputPath),
    fileName: path.basename(outputPath),
    triangles: mesh.faces.length,
    vertices: mesh.vertices.length,
    boundingBox: { widthX: round2(bbox.size[0]), depthY: round2(bbox.size[1]), heightZ: round2(bbox.size[2]) },
    volumeMm3: filament.volumeMm3,
    estimatedWeightGrams: filament.weightGrams,
    isWatertight: checkWatertight(mesh).isWatertight
  };

  console.log(`\n======================================================`);
  console.log(`  3D PRINTER PART GENERATOR: ${config.name.toUpperCase()}`);
  console.log(`======================================================`);
  console.log(`  - GT2 ${config.teeth}T:         pitch Ø${specs.pitchDiameter.toFixed(2)} mm, tip Ø${specs.tipDiameter.toFixed(2)} mm, root Ø${specs.rootDiameter.toFixed(2)} mm`);
  console.log(`  - Flanges:           Ø${flangeDiameter.toFixed(2)} mm, ${config.flangeThickness} mm each side`);
  console.log(`  - Overall Width:     ${config.width} mm (belt channel ${config.width - 2 * config.flangeThickness} mm)`);
  console.log(`  - Bore:              GT2 ${config.pinionTeeth}T push fit for ${config.toothedBoreLength} mm (tip Ø${pinionSpecs.tipDiameter.toFixed(2)} mm, ${config.fitClearance} mm clearance), then Ø${boreDiameter.toFixed(2)} mm round for ${config.width - config.toothedBoreLength} mm`);
  console.log(`  - Dimensions (XYZ):  ${stats.boundingBox.widthX} x ${stats.boundingBox.depthY} x ${stats.boundingBox.heightZ} mm`);
  console.log(`  - Watertight Mesh:   ${stats.isWatertight ? 'YES (Solid manifold)' : 'NO'}`);
  console.log(`  - Estimated Weight:  ${stats.estimatedWeightGrams} g (PLA)`);
  console.log(`  - Saved To:          ${stats.filePath}`);
  console.log(`======================================================\n`);

  return { config, specs: { ...specs, flangeDiameter }, stats };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--teeth' && args[i + 1]) config.teeth = parseInt(args[++i], 10);
    else if (arg === '--pitch' && args[i + 1]) config.pitch = parseFloat(args[++i]);
    else if (arg === '--tip-dia' && args[i + 1]) config.tipDiameter = parseFloat(args[++i]);
    else if (arg === '--width' && args[i + 1]) config.width = parseFloat(args[++i]);
    else if (arg === '--flange' && args[i + 1]) config.flangeThickness = parseFloat(args[++i]);
    else if (arg === '--flange-oversize' && args[i + 1]) config.flangeOversize = parseFloat(args[++i]);
    else if (arg === '--pinion-teeth' && args[i + 1]) config.pinionTeeth = parseInt(args[++i], 10);
    else if (arg === '--pinion-tip-dia' && args[i + 1]) config.pinionTipDiameter = parseFloat(args[++i]);
    else if (arg === '--clearance' && args[i + 1]) config.fitClearance = parseFloat(args[++i]);
    else if (arg === '--toothed-bore' && args[i + 1]) config.toothedBoreLength = parseFloat(args[++i]);
    else if (arg === '--bore-dia' && args[i + 1]) config.boreDiameter = parseFloat(args[++i]);
    else if (arg === '--out' && args[i + 1]) config.outputPath = args[++i];
  }
  return config;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  generateFocusBeltGear(parseArgs());
}
