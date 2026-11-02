import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createKnurledWheelMesh,
  export3MF,
  generateGT2Profile2D,
  computeBoundingBox,
  computeMeshVolumeAndArea,
  checkWatertight,
  estimateFilament
} from '../../utils/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Default configuration for the focus turning wheel.
 * The centre hole is the negative of a 20-tooth GT2 pulley so the wheel
 * push-fits over it and drives it without slipping.
 */
export const DEFAULT_FOCUS_WHEEL_CONFIG = {
  name: 'focus-wheel',
  outerDiameter: 38,    // mm, across knurl peaks
  width: 8,             // mm
  knurlStyle: 'diamond', // 'diamond' or 'straight'
  knurlCount: 48,       // ridges around the circumference
  knurlDepth: 0.8,      // mm, peak-to-valley
  edgeRadius: 1.0,      // mm, rounding on both outer edges
  pinionTeeth: 20,
  pinionPitch: 2,       // GT2
  pinionTipDiameter: undefined, // mm; defaults to standard GT2 (12.22mm for 20T), set to match your measurement
  fitClearance: 0.1     // mm radial clearance added to the pinion profile (push fit)
};

/**
 * Generates the focus wheel STL (Z axis = pinion axis, printed flat)
 * @param {Object} [customConfig]
 */
export function generateFocusWheel(customConfig = {}) {
  const config = { ...DEFAULT_FOCUS_WHEEL_CONFIG, ...customConfig };

  // GT2 pulley profile, scaled up so the tips clear by fitClearance
  const { points: pinion, specs } = generateGT2Profile2D({
    teeth: config.pinionTeeth,
    pitch: config.pinionPitch,
    tipDiameter: config.pinionTipDiameter
  });
  const scale = (specs.tipDiameter / 2 + config.fitClearance) / (specs.tipDiameter / 2);
  const hole = pinion.map(([x, y]) => [x * scale, y * scale]);

  const mesh = createKnurledWheelMesh({
    outerDiameter: config.outerDiameter,
    width: config.width,
    knurlCount: config.knurlCount,
    knurlDepth: config.knurlDepth,
    knurlStyle: config.knurlStyle,
    edgeRadius: config.edgeRadius,
    hole
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
  console.log(`  - Outer Diameter:    ${config.outerDiameter} mm (${config.knurlStyle} knurl, ${config.knurlCount} ridges, ${config.knurlDepth} mm deep, ${config.edgeRadius} mm edge radius)`);
  console.log(`  - Width:             ${config.width} mm`);
  console.log(`  - Pinion:            GT2 ${config.pinionTeeth}T (tip Ø${specs.tipDiameter.toFixed(2)} mm, root Ø${specs.rootDiameter.toFixed(2)} mm)`);
  console.log(`  - Fit Clearance:     ${config.fitClearance} mm radial`);
  console.log(`  - Dimensions (XYZ):  ${stats.boundingBox.widthX} x ${stats.boundingBox.depthY} x ${stats.boundingBox.heightZ} mm`);
  console.log(`  - Watertight Mesh:   ${stats.isWatertight ? 'YES (Solid manifold)' : 'NO'}`);
  console.log(`  - Estimated Weight:  ${stats.estimatedWeightGrams} g (PLA)`);
  console.log(`  - Saved To:          ${stats.filePath}`);
  console.log(`======================================================\n`);

  return { config, specs, stats };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--diameter' && args[i + 1]) config.outerDiameter = parseFloat(args[++i]);
    else if (arg === '--width' && args[i + 1]) config.width = parseFloat(args[++i]);
    else if (arg === '--knurls' && args[i + 1]) config.knurlCount = parseInt(args[++i], 10);
    else if (arg === '--knurl-depth' && args[i + 1]) config.knurlDepth = parseFloat(args[++i]);
    else if (arg === '--knurl-style' && args[i + 1]) config.knurlStyle = args[++i];
    else if (arg === '--edge-radius' && args[i + 1]) config.edgeRadius = parseFloat(args[++i]);
    else if (arg === '--teeth' && args[i + 1]) config.pinionTeeth = parseInt(args[++i], 10);
    else if (arg === '--pitch' && args[i + 1]) config.pinionPitch = parseFloat(args[++i]);
    else if (arg === '--tip-dia' && args[i + 1]) config.pinionTipDiameter = parseFloat(args[++i]);
    else if (arg === '--clearance' && args[i + 1]) config.fitClearance = parseFloat(args[++i]);
    else if (arg === '--out' && args[i + 1]) config.outputPath = args[++i];
  }
  return config;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  generateFocusWheel(parseArgs());
}
