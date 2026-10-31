import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGearMesh, exportSTL } from '../../utils/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Default configuration for the small toothed gearwheel
 */
export const DEFAULT_GEARWHEEL_CONFIG = {
  name: 'small-gearwheel',
  teeth: 16,            // 16 teeth
  module: 1.5,          // 1.5 mm module (24mm pitch diameter, ~27mm outer diameter)
  height: 7,            // 7mm gear face width
  pressureAngle: 20,    // Standard 20-degree involute
  boreDiameter: 5.0,    // 5mm center shaft bore (e.g. standard NEMA 17 motor shaft or 5mm axle)
  boreType: 'round',    // 'round' or 'd-shaft'
  dShaftFlatDistance: 4.5,
  hubDiameter: 0,       // Set e.g. 11.0 mm to add raised collar hub
  hubHeight: 0,         // Set e.g. 5.0 mm to add raised collar hub
  backlash: 0.2,        // 0.2mm backlash for FDM 3D printer tolerance
  samplesPerFlank: 8    // Resolution of involute flank curve
};

/**
 * Generates the small toothed gearwheel STL
 * @param {Object} [customConfig]
 * @returns {Object} STL export stats & theoretical gear specifications
 */
export function generateSmallGearwheel(customConfig = {}) {
  const config = { ...DEFAULT_GEARWHEEL_CONFIG, ...customConfig };

  console.log(`\n======================================================`);
  console.log(`  3D PRINTER PART GENERATOR: ${config.name.toUpperCase()}`);
  console.log(`======================================================`);
  console.log(`Parameters:`);
  console.log(`  - Teeth (z):         ${config.teeth}`);
  console.log(`  - Module (m):        ${config.module} mm`);
  console.log(`  - Face Width:        ${config.height} mm`);
  console.log(`  - Shaft Bore:        ${config.boreDiameter} mm (${config.boreType})`);
  console.log(`  - Hub Collar:        Ø${config.hubDiameter} mm x ${config.hubHeight} mm`);
  console.log(`  - Backlash:          ${config.backlash} mm`);
  console.log(`------------------------------------------------------`);

  // Generate 3D mesh
  const { mesh, specs } = createGearMesh(config);

  // Output file path
  const outputPath = customConfig.outputPath || path.resolve(__dirname, '../../../output', `${config.name}.stl`);

  // Export to STL
  const stats = exportSTL(outputPath, mesh, {
    name: config.name,
    ascii: false
  });

  console.log(`Calculated Gear Mechanics:`);
  console.log(`  - Pitch Diameter:    ${specs.pitchDiameter.toFixed(2)} mm`);
  console.log(`  - Tip (Outer) Dia:   ${specs.tipDiameter.toFixed(2)} mm`);
  console.log(`  - Root Diameter:     ${specs.rootDiameter.toFixed(2)} mm`);
  console.log(`  - Tooth Height:      ${specs.toothHeight.toFixed(2)} mm`);
  console.log(`  - Circular Pitch:    ${specs.circularPitch.toFixed(2)} mm`);
  console.log(`------------------------------------------------------`);
  console.log(`3D Print Mesh Analysis:`);
  console.log(`  - Dimensions (XYZ):  ${stats.boundingBox.widthX} x ${stats.boundingBox.depthY} x ${stats.boundingBox.heightZ} mm`);
  console.log(`  - Triangle Count:    ${stats.triangles.toLocaleString()} triangles`);
  console.log(`  - Vertices:          ${stats.vertices.toLocaleString()}`);
  console.log(`  - Watertight Mesh:   ${stats.isWatertight ? 'YES (Solid manifold)' : 'NO'}`);
  console.log(`  - Volume:            ${(stats.volumeMm3 / 1000).toFixed(2)} cm³ (${stats.volumeMm3} mm³)`);
  console.log(`  - Estimated Weight:  ${stats.estimatedWeightGrams} g (PLA)`);
  console.log(`  - Filament Length:   ${stats.estimatedFilamentMeters} m (1.75mm)`);
  console.log(`  - File Size:         ${stats.fileSizeKB} KB (${stats.format})`);
  console.log(`  - Saved To:          ${stats.filePath}`);
  console.log(`======================================================\n`);

  return { config, specs, stats };
}

// Parse command-line args if run directly
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--teeth' && args[i + 1]) config.teeth = parseInt(args[++i], 10);
    else if (arg === '--module' && args[i + 1]) config.module = parseFloat(args[++i]);
    else if (arg === '--height' && args[i + 1]) config.height = parseFloat(args[++i]);
    else if (arg === '--bore' && args[i + 1]) config.boreDiameter = parseFloat(args[++i]);
    else if (arg === '--bore-type' && args[i + 1]) config.boreType = args[++i];
    else if (arg === '--hub-dia' && args[i + 1]) config.hubDiameter = parseFloat(args[++i]);
    else if (arg === '--hub-height' && args[i + 1]) config.hubHeight = parseFloat(args[++i]);
    else if (arg === '--no-hub') { config.hubDiameter = 0; config.hubHeight = 0; }
    else if (arg === '--out' && args[i + 1]) config.outputPath = args[++i];
  }
  return config;
}

// Execute if run directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const cliConfig = parseArgs();
  generateSmallGearwheel(cliConfig);
}
