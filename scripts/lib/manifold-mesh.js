import Module from 'manifold-3d';

/** Boolean-modelling helpers on top of manifold-3d (mesh <-> Manifold conversion, cylinders). */
export async function initManifold() {
  const wasm = await Module();
  wasm.setup();
  const { Manifold, Mesh } = wasm;

  function toManifold(mesh) {
    const build = (flip) => {
      const m = new Mesh({
        numProp: 3,
        vertProperties: new Float32Array(mesh.vertices.flat()),
        triVerts: new Uint32Array(mesh.faces.flatMap(f => (flip ? [f[0], f[2], f[1]] : f)))
      });
      m.merge();
      return new Manifold(m);
    };
    let m = build(false);
    if (m.volume() < 0) m = build(true);
    if (m.status() !== 'NoError') throw new Error(`Mesh is not a valid manifold: ${m.status()}`);
    return m;
  }

  function fromManifold(m) {
    const mesh = m.getMesh();
    const vertices = [];
    for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
      vertices.push([mesh.vertProperties[i], mesh.vertProperties[i + 1], mesh.vertProperties[i + 2]]);
    }
    const faces = [];
    for (let i = 0; i < mesh.triVerts.length; i += 3) {
      faces.push([mesh.triVerts[i], mesh.triVerts[i + 1], mesh.triVerts[i + 2]]);
    }
    return { vertices, faces };
  }

  // Cylinder along +Y from y0 to y1 at (x, z)
  const cylY = (x, z, y0, y1, d) =>
    Manifold.cylinder(y1 - y0, d / 2, d / 2, 96).rotate([-90, 0, 0]).translate([x, y0, z]);

  // Cylinder along +Z from z0 to z1 at (x, y)
  const cylZ = (x, y, z0, z1, d) =>
    Manifold.cylinder(z1 - z0, d / 2, d / 2, 96).translate([x, y, z0]);

  // Cylinder along +X from x0 to x1 at (y, z)
  const cylX = (y, z, x0, x1, d) =>
    Manifold.cylinder(x1 - x0, d / 2, d / 2, 96).rotate([0, 90, 0]).translate([x0, y, z]);

  return { Manifold, toManifold, fromManifold, cylY, cylZ, cylX };
}
