/**
 * Parametric Involute Gear Generator
 */

import { degToRad, radToDeg } from './math3d.js';
import {
  createCircle,
  createDShaftHole,
  isCCW,
  ensureWinding
} from './polygon.js';
import { extrude } from './extrude.js';
import { mergeMeshes } from './mesh.js';
import { createTube } from './primitives.js';

/**
 * Calculates involute function inv(phi) = tan(phi) - phi
 */
function inv(phi) {
  return Math.tan(phi) - phi;
}

/**
 * Generates the 2D perimeter points of an involute spur gear.
 *
 * @param {Object} params
 * @param {number} params.teeth - Number of teeth (z)
 * @param {number} params.module - Metric module (m) in mm
 * @param {number} [params.pressureAngle=20] - Pressure angle in degrees
 * @param {number} [params.backlash=0.2] - Tooth thinning for 3D print clearance in mm
 * @param {number} [params.clearance=0.25] - Root clearance factor (times module)
 * @param {number} [params.profileShift=0] - Profile shift coefficient (x)
 * @param {number} [params.samplesPerFlank=8] - Involute curve resolution
 * @returns {{ points: Array<[number, number]>, specs: Object }}
 */
export function generateGearProfile2D(params) {
  const {
    teeth,
    module: m,
    pressureAngle: paDeg = 20,
    backlash = 0.2,
    clearance = 0.25,
    samplesPerFlank = 8
  } = params;

  // Auto profile-shift for low tooth counts to prevent undercutting/pointing
  let x = params.profileShift;
  if (x === undefined || x === null) {
    if (teeth < 17) {
      x = Math.max(0.1, (17 - teeth) / 17);
    } else {
      x = 0.0;
    }
  }

  const alpha = degToRad(paDeg);
  const rp = (m * teeth) / 2;                // Pitch radius
  const rb = rp * Math.cos(alpha);            // Base circle radius
  const ha = (1.0 + x) * m;                   // Addendum
  const hd = (1.0 + clearance - x) * m;       // Dedendum
  let ra = rp + ha;                           // Tip radius
  const rf = Math.max(m * 0.2, rp - hd);      // Root radius

  const pitch = Math.PI * m;                  // Circular pitch
  const tp = m * (Math.PI / 2 + 2 * x * Math.tan(alpha)) - backlash; // Tooth thickness at pitch circle
  const dThetaP = tp / (2 * rp);              // Half tooth angle at pitch circle
  const invAlpha = inv(alpha);

  // Involute angle theta as a function of radius r
  // theta(r) is angle from tooth symmetry axis
  function thetaFlank(r) {
    const phi = Math.sqrt(Math.max(0, Math.pow(r / rb, 2) - 1));
    return (dThetaP + invAlpha) - inv(phi);
  }

  // Ensure tip radius does not exceed tooth point intersection
  const thetaAtRa = thetaFlank(ra);
  if (thetaAtRa < 0.01) {
    // Binary search for radius where theta >= 0.015 (safe tip width)
    let low = rb;
    let high = ra;
    for (let iter = 0; iter < 20; iter++) {
      const mid = (low + high) / 2;
      if (thetaFlank(mid) > 0.015) {
        low = mid;
      } else {
        high = mid;
      }
    }
    ra = low;
  }

  const angularPitch = (2 * Math.PI) / teeth;
  const points = [];

  for (let tooth = 0; tooth < teeth; tooth++) {
    const toothCenterAngle = tooth * angularPitch;

    // The profile is traversed counter-clockwise: each tooth is entered on its
    // trailing (-theta) flank and exited on its leading (+theta) flank.

    // 1. Root curve from previous tooth's leading flank to this tooth's trailing flank
    const rootTheta = rf < rb ? thetaFlank(rb) : thetaFlank(rf);
    const prevLeadingFlankAngle = (tooth - 1) * angularPitch + rootTheta;
    const currentTrailingFlankAngle = toothCenterAngle - rootTheta;

    let startRootAngle = prevLeadingFlankAngle;
    let endRootAngle = currentTrailingFlankAngle;
    while (endRootAngle < startRootAngle) endRootAngle += 2 * Math.PI;

    // Add intermediate root points (2 segments per root trough)
    const rootSteps = 3;
    for (let s = 1; s < rootSteps; s++) {
      const rootAngle = startRootAngle + (s / rootSteps) * (endRootAngle - startRootAngle);
      points.push([rf * Math.cos(rootAngle), rf * Math.sin(rootAngle)]);
    }

    // 2. Trailing flank: from rf up to ra
    // Sub-base radial line if rf < rb
    if (rf < rb) {
      const angle = toothCenterAngle - thetaFlank(rb);
      points.push([rf * Math.cos(angle), rf * Math.sin(angle)]);
    }

    // Involute curve on trailing flank
    const rStart = Math.max(rf, rb);
    for (let i = 0; i <= samplesPerFlank; i++) {
      const r = rStart + (i / samplesPerFlank) * (ra - rStart);
      const theta = toothCenterAngle - thetaFlank(r);
      points.push([r * Math.cos(theta), r * Math.sin(theta)]);
    }

    // 3. Tip crest (Addendum arc)
    const tipStartAngle = toothCenterAngle - thetaFlank(ra);
    const tipEndAngle = toothCenterAngle + thetaFlank(ra);
    const tipSteps = 2;
    for (let i = 1; i < tipSteps; i++) {
      const tAngle = tipStartAngle + (i / tipSteps) * (tipEndAngle - tipStartAngle);
      points.push([ra * Math.cos(tAngle), ra * Math.sin(tAngle)]);
    }

    // 4. Leading flank: from ra down to rf
    for (let i = samplesPerFlank; i >= 0; i--) {
      const r = rStart + (i / samplesPerFlank) * (ra - rStart);
      const theta = toothCenterAngle + thetaFlank(r);
      points.push([r * Math.cos(theta), r * Math.sin(theta)]);
    }

    // Sub-base radial line on leading flank
    if (rf < rb) {
      const angle = toothCenterAngle + thetaFlank(rb);
      points.push([rf * Math.cos(angle), rf * Math.sin(angle)]);
    }
  }

  const profileCCW = ensureWinding(points, true);

  return {
    points: profileCCW,
    specs: {
      teeth,
      module: m,
      pitchDiameter: rp * 2,
      baseDiameter: rb * 2,
      tipDiameter: ra * 2,
      rootDiameter: rf * 2,
      toothHeight: ra - rf,
      circularPitch: pitch,
      pressureAngleDeg: paDeg,
      backlash,
      profileShift: x
    }
  };
}

/**
 * Generates a complete 3D gear mesh (gear body + center bore + optional hub)
 *
 * @param {Object} options
 * @param {number} options.teeth - Number of teeth
 * @param {number} options.module - Gear module in mm
 * @param {number} options.height - Gear face width / thickness in mm
 * @param {number} [options.boreDiameter=0] - Center shaft bore diameter (0 for solid)
 * @param {string} [options.boreType='round'] - 'round', 'd-shaft', or 'none'
 * @param {number} [options.dShaftFlatDistance] - Flat distance for D-shaft
 * @param {number} [options.hubDiameter=0] - Raised collar diameter (0 for none)
 * @param {number} [options.hubHeight=0] - Raised collar height
 * @param {number} [options.twist=0] - Twist angle in rad for helical gears
 * @returns {{ mesh: Object, specs: Object }}
 */
export function createGearMesh(options) {
  const {
    teeth = 16,
    module: m = 1.5,
    height = 8,
    boreDiameter = 5,
    boreType = 'round',
    dShaftFlatDistance = boreDiameter * 0.9,
    hubDiameter = 0,
    hubHeight = 0,
    twist = 0
  } = options;

  // 1. Generate 2D gear profile
  const { points: gearProfile2D, specs } = generateGearProfile2D(options);

  // 2. Prepare center bore hole
  const holes = [];
  let borePolygon = null;

  if (boreDiameter > 0 && boreType !== 'none') {
    if (boreType === 'd-shaft') {
      borePolygon = createDShaftHole(boreDiameter, dShaftFlatDistance, 36);
    } else {
      borePolygon = createCircle(boreDiameter / 2, 36);
    }
    holes.push(borePolygon);
  }

  // 3. Extrude the main gear body
  let mainGearMesh = extrude(gearProfile2D, height, {
    holes,
    twist
  });

  // 4. Add optional hub / collar atop the gear
  if (hubDiameter > 0 && hubHeight > 0) {
    const hubHoles = borePolygon ? [borePolygon] : [];
    const hubCircle = createCircle(hubDiameter / 2, 48);
    const hubMesh = extrude(hubCircle, hubHeight, {
      holes: hubHoles
    });

    // Translate hub up so it sits on top of gear body
    const translatedHub = {
      vertices: hubMesh.vertices.map(v => [v[0], v[1], v[2] + height]),
      faces: [...hubMesh.faces]
    };

    mainGearMesh = mergeMeshes([mainGearMesh, translatedHub]);
  }

  return {
    mesh: mainGearMesh,
    specs: {
      ...specs,
      faceWidth: height,
      boreDiameter: boreDiameter > 0 ? boreDiameter : 'None',
      boreType: boreDiameter > 0 ? boreType : 'None',
      hubDiameter: hubDiameter > 0 ? hubDiameter : 'None',
      hubHeight: hubHeight > 0 ? hubHeight : 'None'
    }
  };
}
