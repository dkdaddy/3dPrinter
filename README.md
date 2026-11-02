# 3D Printer Parts Utilities & Parametric 3MF Generator

A modular JavaScript / Node.js toolkit for procedurally generating 3D printable mechanical parts and exporting clean, watertight 3MF files.

---

## 🚀 Quick Start

### 1. Generate the Focus Wheel
Diamond-knurled 38mm x 8mm wheel with rounded outer edges and a hole shaped like a 20-tooth GT2 pulley (12.22mm tip diameter by default) for a push fit (`output/focus-wheel.3mf`):
```bash
npm run build:focus-wheel
# options: --diameter --width --knurls --knurl-depth --knurl-style (diamond|straight) --edge-radius --teeth --pitch --tip-dia --clearance
node src/parts/focus-wheel/index.js --tip-dia 12.6 --clearance 0.15
```
Increase `--clearance` (radial mm, default 0.1) if too tight, decrease if loose.

### 1b. Generate the Belt Gear
42-tooth GT2 gear (26.2mm tip diameter) with 2mm-thick flanges on each side (1.2mm taller than the tooth tips), 18mm wide overall (14mm belt channel). The bore is the 20T GT2 push-fit shape for the first 10mm (z=0 end), then a plain 16.1mm round bore for the remaining 8mm (`output/focus-belt-gear.3mf`):
```bash
npm run build:focus-belt-gear
# options: --teeth --pitch --tip-dia --width --flange --flange-oversize --pinion-teeth --pinion-tip-dia --clearance --toothed-bore --bore-dia
```

### 2. Generate All Registered Parts
```bash
npm run build:all
```

### 3. Run Automated Test Suite
```bash
npm test
```

### 4. Work with 3MF Files
Inspect an existing 3MF (including Bambu Studio / Orca project files) and optionally export a merged STL preview:
```bash
node scripts/inspect-3mf.js models/my-part.3mf --stl output/preview.stl
```
Resize the split-clamp ring of the ETX adapter for a different tube (inner diameter in mm; wall, lug, hole and the rail/stop plate are preserved and moved outward):
```bash
node scripts/resize-etx-ring.js models/ETX_90_part_1_SV165_adapter_2.3mf output/ETX_105_part_1_SV165_adapter.3mf --id 125
```
See [`notes/etx105-adapter.md`](notes/etx105-adapter.md) for measurements, assumptions and print settings.

### 5. Inspect 3D Models in the Interactive Viewer
Open [`viewer/index.html`](file:///C:/Users/bobco/code/3dPrinter/viewer/index.html) in your browser. Drag and drop any `.stl` or `.3mf` file (or serve the repo over HTTP and open `viewer/index.html?file=../models/my-part.3mf`) to rotate, zoom, toggle wireframe, and inspect print dimensions. The **Dimensions** button toggles the measurement overlay: overall X/Y/Z for any model, or the part's key dimensions when a `<name>.dims.json` sidecar sits next to the file (written by the focus motor mount generator).

---

## 📂 Project Structure

```
3dPrinter/
├── package.json               # NPM scripts and project configuration
├── README.md                  # Complete documentation and guide
├── output/                    # Generated .3mf files for your slicer
│   └── focus-wheel.3mf
├── src/
│   ├── parts/                 # Individual part scripts
│   │   └── focus-wheel/
│   │       └── index.js       # GT2 push-fit focus wheel generator
│   └── utils/                 # Core 3D geometry, 3MF and STL utilities
│       ├── index.js           # Public API re-exporting all utilities
│       ├── threemf.js         # 3MF reader / writer
│       ├── gt2.js             # GT2 timing pulley profile
│       ├── knurl.js           # Knurled wheel with rounded edges
│       ├── stl.js             # Binary & ASCII STL exporter with print stats
│       ├── gear.js            # Parametric involute gear geometry engine
│       ├── extrude.js         # 2D polygon with holes -> 3D watertight mesh
│       ├── polygon.js         # 2D curves, ear clipping, and hole bridging
│       ├── primitives.js      # Cylinder, tube, box, cone primitives
│       ├── mesh.js            # Mesh data structures, transforms, stats, manifold check
│       └── math3d.js          # Vector math, cross product, normals, volume
├── scripts/
│   └── generate-all.js        # Discovers and builds all parts in src/parts/
├── test/                      # Unit test suite (Node test runner)
│   ├── gear.test.js
│   ├── stl.test.js
│   ├── polygon.test.js
│   └── math3d.test.js
└── viewer/                    # Three.js 3D STL browser viewer
    └── index.html
```

---

## 🛠️ Utilities Overview

All utilities are modular ES modules located in [`src/utils/`](file:///C:/Users/bobco/code/3dPrinter/src/utils/index.js).

### 0. `threemf.js` / `zip.js` — 3MF Reader & Writer
- `read3MF(path)` / `parse3MF(buffer)`: parses a package into objects, components and build items (units and transforms handled).
- `get3MFParts(pkg)` / `load3MFMesh(pkg)`: world-space meshes in mm, per part or merged.
- `setObjectMesh(pkg, id, mesh)` + `write3MF(path, pkg)`: edit a mesh and save; all other entries (thumbnails, slicer settings) are preserved.
- `export3MF(path, mesh)`: write any generated mesh as a standalone 3MF.

### 1. `stl.js` — STL Exporter & Print Analyzer
- `exportSTL(filePath, mesh, options)`: Writes binary (or ASCII) STL, creates directories, and returns:
  - Bounding box dimensions ($X \times Y \times Z$ in mm)
  - Triangle count and vertex count
  - Watertight / manifold status
  - Volume ($mm^3$ and $cm^3$)
  - Estimated filament weight in grams (PLA, PETG, ABS) and length in meters (1.75mm)

### 2. `gear.js` — Parametric Involute Gear Engine
- `createGearMesh(options)`: Generates complete 3D gear mesh with:
  - Exact involute flank curvature
  - Addendum and dedendum circles
  - Low-tooth count profile-shift ($x$) to prevent tooth pointing and undercutting
  - Center shaft bore (round or D-shaft for motor flats)
  - Optional raised hub/collar for set-screw mounting

### 3. `extrude.js` — 2D to 3D Extrusion Engine
- `extrude(outerPolygon, height, options)`: Extrudes any 2D closed polygon along Z into a solid 3D watertight mesh. Supports inner hole polygons (cutouts, bores, mounting slots) and vertical twist (helical gears).

### 4. `polygon.js` — 2D Geometry & Triangulation
- Ear clipping triangulation with hole bridging (`triangulatePolygonWithHoles`)
- Primitives: `createCircle`, `createRectangle`, `createRoundedRectangle`, `createDShaftHole`
- Orientation check (`ensureWinding`, `isCCW`) and signed shoelace area (`polygonArea`)

### 5. `mesh.js` & `primitives.js`
- `checkWatertight(mesh)`: Verifies manifold edge conditions.
- `mergeMeshes(meshes)`: Merges multi-body components.
- `translateMesh`, `rotateMesh`, `scaleMesh`: 3D transformations.
- `createCylinder`, `createTube`, `createBox`: 3D primitive mesh generators.

---

## 💡 Creating a New 3D Printed Part

To add a new part to your project:

1. Create a folder in `src/parts/<your-part-name>/index.js`:
```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extrude, createRoundedRectangle, createCircle, export3MF } from '../../utils/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function generateMyBracket(options = {}) {
  // 1. Create 2D profile (e.g. 40x30mm bracket with rounded corners)
  const outer = createRoundedRectangle(40, 30, 4);

  // 2. Add M3 screw holes (Ø3.4mm)
  const hole1 = createCircle(1.7, 24).map(([x, y]) => [x - 12, y]);
  const hole2 = createCircle(1.7, 24).map(([x, y]) => [x + 12, y]);

  // 3. Extrude to 3D (4mm thick)
  const mesh = extrude(outer, 4, { holes: [hole1, hole2] });

  // 4. Export to 3MF
  const outputPath = path.resolve(__dirname, '../../../output/my-bracket.3mf');
  export3MF(outputPath, mesh, { name: 'my-bracket' });
  return outputPath;
}

// Allow direct CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  generateMyBracket();
}
```

2. Run `npm run build:all` or `node src/parts/<your-part-name>/index.js`!
