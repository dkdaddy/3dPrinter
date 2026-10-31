/**
 * GT2 (2mm pitch) timing pulley profile
 */

/**
 * Generates the 2D outline of a GT2 pulley: round tip circle with semicircular
 * belt-tooth grooves (R0.555) cut to the standard tooth depth.
 *
 * @param {Object} params
 * @param {number} [params.teeth=20]
 * @param {number} [params.pitch=2] - Belt pitch in mm
 * @param {number} [params.grooveRadius=0.555] - Belt tooth radius
 * @param {number} [params.toothDepth=0.75] - Groove depth below the tip circle
 * @param {number} [params.tipDiameter] - Defaults to pitch diameter - 0.508 (GT2 pitch line offset)
 * @param {number} [params.samplesPerGroove=14]
 * @param {number} [params.landSamples=3] - Extra points along each tip land
 * @returns {{ points: Array<[number, number]>, specs: Object }} CCW outline, groove centred on angle 0 + half pitch
 */
export function generateGT2Profile2D(params = {}) {
  const {
    teeth = 20,
    pitch = 2,
    grooveRadius: r = 0.555,
    toothDepth = 0.75,
    samplesPerGroove = 14,
    landSamples = 3
  } = params;

  const pitchDiameter = (teeth * pitch) / Math.PI;
  const tipDiameter = params.tipDiameter ?? pitchDiameter - 0.508;
  const R = tipDiameter / 2;
  const rootRadius = R - toothDepth;
  const d = rootRadius + r; // groove circle centre radius

  const cosT0 = (d * d + r * r - R * R) / (2 * d * r);
  const t0 = Math.acos(Math.min(1, Math.max(-1, cosT0)));

  const step = (2 * Math.PI) / teeth;
  const points = [];

  for (let i = 0; i < teeth; i++) {
    const phi = (i + 0.5) * step;
    const ux = Math.cos(phi);
    const uy = Math.sin(phi);
    const vx = -uy;
    const vy = ux;

    for (let s = 0; s <= samplesPerGroove; s++) {
      const t = -t0 + (s / samplesPerGroove) * 2 * t0;
      const radial = d - r * Math.cos(t);
      const tangential = r * Math.sin(t);
      points.push([radial * ux + tangential * vx, radial * uy + tangential * vy]);
    }

    // Tip land up to the next groove, on the tip circle
    const landStart = phi + Math.atan2(r * Math.sin(t0), d - r * Math.cos(t0));
    const landEnd = phi + step - Math.atan2(r * Math.sin(t0), d - r * Math.cos(t0));
    for (let s = 1; s <= landSamples; s++) {
      const a = landStart + (s / (landSamples + 1)) * (landEnd - landStart);
      points.push([R * Math.cos(a), R * Math.sin(a)]);
    }
  }

  return {
    points,
    specs: {
      teeth,
      pitch,
      pitchDiameter,
      tipDiameter,
      rootDiameter: rootRadius * 2,
      toothDepth,
      grooveRadius: r
    }
  };
}
