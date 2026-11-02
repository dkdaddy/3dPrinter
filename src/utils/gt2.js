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
 * @param {number} [params.topWidth] - If set, grooves flare from the R-arc bottom out to this width
 *   at the tip circle (real GT2 pulley is ~1.494) with rounded edges, instead of a plain semicircle
 * @param {number} [params.edgeFillet=0.15] - Rounding of the groove edges (only with topWidth)
 * @returns {{ points: Array<[number, number]>, specs: Object }} CCW outline, groove centred on angle 0 + half pitch
 */
export function generateGT2Profile2D(params = {}) {
  const {
    teeth = 20,
    pitch = 2,
    grooveRadius: r = 0.555,
    toothDepth = 0.75,
    samplesPerGroove = 14,
    landSamples = 3,
    topWidth,
    edgeFillet = 0.15
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

  // Groove outline in local (radial, tangential) coords, left to right, plus the
  // tangential angle at which the tip land starts
  let groove = [];
  for (let s = 0; s <= samplesPerGroove; s++) {
    const t = -t0 + (s / samplesPerGroove) * 2 * t0;
    groove.push([d - r * Math.cos(t), r * Math.sin(t)]);
  }
  let landOffset = Math.atan2(r * Math.sin(t0), d - r * Math.cos(t0));

  if (topWidth !== undefined) {
    const w = topWidth / 2;
    const Rt = Math.sqrt(R * R - w * w);
    // Tangent from the groove top corner T to the bottom arc
    const qx = Rt - d;
    const D = Math.hypot(qx, w);
    const aP = Math.atan2(w, qx) + Math.acos(r / D);
    const t1 = Math.PI - aP;
    const arc = [];
    for (let s = 0; s <= samplesPerGroove; s++) {
      const t = -t1 + (s / samplesPerGroove) * 2 * t1;
      arc.push([d - r * Math.cos(t), r * Math.sin(t)]);
    }

    // Rounded groove edge: quadratic curve through the corner T
    const P = [d + r * Math.cos(aP), r * Math.sin(aP)];
    const T = [Rt, w];
    const len1 = Math.hypot(T[0] - P[0], T[1] - P[1]);
    const dir1 = [(T[0] - P[0]) / len1, (T[1] - P[1]) / len1];
    const dir2 = [-w / R, Rt / R];
    const theta = Math.acos(-(dir1[0] * dir2[0] + dir1[1] * dir2[1]));
    const td = edgeFillet / Math.tan(theta / 2);
    const A = [T[0] - dir1[0] * td, T[1] - dir1[1] * td];
    const B = [T[0] + dir2[0] * td, T[1] + dir2[1] * td];
    const filletSteps = 6;
    const fillet = [];
    for (let s = 0; s <= filletSteps; s++) {
      const u = s / filletSteps;
      const k0 = (1 - u) * (1 - u);
      const k1 = 2 * u * (1 - u);
      const k2 = u * u;
      fillet.push([k0 * A[0] + k1 * T[0] + k2 * B[0], k0 * A[1] + k1 * T[1] + k2 * B[1]]);
    }
    const leftFillet = fillet.map(([a, b]) => [a, -b]).reverse();
    groove = [...leftFillet, ...arc, ...fillet];
    landOffset = Math.atan2(B[1], B[0]);
  }

  for (let i = 0; i < teeth; i++) {
    const phi = (i + 0.5) * step;
    const ux = Math.cos(phi);
    const uy = Math.sin(phi);
    const vx = -uy;
    const vy = ux;

    for (const [radial, tangential] of groove) {
      points.push([radial * ux + tangential * vx, radial * uy + tangential * vy]);
    }

    // Tip land up to the next groove, on the tip circle
    const landStart = phi + landOffset;
    const landEnd = phi + step - landOffset;
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
      grooveRadius: r,
      topWidth
    }
  };
}
