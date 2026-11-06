# ETX 105 adapter notes

Adapts the ETX 90 / SVBONY SV165 adapter (`models/ETX_90_part_1_SV165_adapter_2.3mf`, Bambu Studio project) so the ring slips over the ETX 105 tube.

- Result: `output/ETX_105_part_1_SV165_adapter.3mf`
- Regenerate: `node scripts/resize-etx-ring.js models/ETX_90_part_1_SV165_adapter_2.3mf output/ETX_105_part_1_SV165_adapter.3mf --id 125`
- Inspect any 3MF: `node scripts/inspect-3mf.js <file.3mf>`

## Source model (measured)

One object with three parts (all watertight individually; `rail` and `stop` overlap each other by design):

| Part | Size (mm) | Notes |
| :--- | :--- | :--- |
| `ring` | 120 x 111 x 47 | Split clamp. 10 mm tall band, **ID 104.0, wall 3.0 mm (OD 110)**, centre at (5.005, -0.456) in object space |
| `rail` | 41 x 15.9 x 6.7 | Attached to the outer face of the tall wall block (+Y side of the ring) |
| `stop` | 41 x 15.9 x 50.8 | Same footprint as `rail`, tall; has a through hole |

Ring features: screw lug on the -X side (12 mm wide, 2 mm slit, screw hole along Y) and a tall mounting wall block on the +Y side.

## Changes for the ETX 105

- Tube OD supplied by owner: **124 mm**.
- Ring ID 104.0 -> **125.0 mm** (1.0 mm total clearance). Wall kept at 3.0 mm, so OD is 131 mm.
- Only vertex positions change, so topology, the lug, slit and screw hole are preserved:
  - inner/outer circle vertices move to the new radii (radially, sliding along X near the lug and along Y near the wall block so the attachment faces stay planar)
  - lug moves 10.5 mm outward (-X), wall block, `rail` and `stop` move 10.5 mm outward (+Y)
- Rail/stop to wall overlap is unchanged (0.6 mm). Slicer part matrices in `Metadata/model_settings.config` are updated to match; thumbnails are stale until re-sliced.
- Footprint 141 x 147 mm (fits the A1's 256 mm bed), height unchanged at about 50.8 mm.

## Assumptions to verify on the real scope

- **1.0 mm clearance is a guess.** The original 104.0 mm ID presumably gave about 1 mm over an ETX 90 tube of about 103 mm, but that tube size was not confirmed (not found online; owner did not know it). Re-run with a different `--id` if the first print is too tight or loose.
- The ring slips over the OTA at 124 mm; the position along the tube was not changed.
- The SV165 mounting geometry (rail/stop) was moved rigidly and not otherwise modified.

## Print settings (from the project)

Bambu Lab A1, 0.4 mm nozzle, 0.20 mm Standard, Bambu PLA Basic, 2 walls, 15% grid infill, 5 top / 3 bottom layers, auto (normal) supports.

Estimated time about 2 to 3 hours and 25 to 40 g (rough estimate, +/-30%; not sliced). Re-slice in Bambu Studio for real numbers and check that supports around the vertical plate are reasonable.

## Variant: flat-plate mount (`output/ETX_105_flat_plate_mount.3mf`)

- Regenerate: `node scripts/etx105-flat-plate-mount.js models/ETX_90_part_1_SV165_adapter_2.3mf output/ETX_105_flat_plate_mount.3mf` (needs `npm install` for `manifold-3d`, used for the boolean cuts). All dimensions are options, see the script header.
- Ring: same 125 mm ID circle, lug slit opened from 2 to **5 mm** (bolt mounts 3 mm further apart). The band arc is 3 mm shorter, so closing the bolt to the old 2 mm gap gives a clamped ID of about 124.0 mm (about 123.4 mm fully closed) instead of 125.
- `rail` / `stop` (SV165 shoe) removed. New **45 x 45 x 14 mm plate** on the wall block's outer face, plate centre 2 mm above the block centre so the lower recesses clear the ring band.
- 4 x **6 mm** through holes on a **20 mm** square pattern. Each has a **10 mm dia x 8 mm deep** recess on the underside for an M6 socket head; the recess continues through the 3.9 mm wall block so the heads can be fitted from inside the ring.
- Total height 48 mm (hole is 6 mm deep above the 8 mm recess; M6 x 14 gives 8 mm thread in the shoe), footprint 141 x 144 mm. Printed ring-flat the plate stands vertical and the horizontal recesses need supports or bridging; the project's print settings are kept, thumbnails are stale.
- Assumed (verify on the real shoe): 6.0 mm / 10.0 mm are nominal with no print tolerance added; use `--hole` / `--recess-d` to open them up (for example 6.3 / 10.4).
- Lug hex nut trap replaced by a round hole for a brass insert: **5.6 mm dia x 4 mm deep** from the lug's outer face (`--insert-d` / `--insert-depth`, sized for an M4 insert; the existing 4.6 mm bore continues through the remaining 1 mm to the slit). Check against your insert's datasheet.

## Related fixes in this repo

- Gear profile was traced clockwise per tooth, producing a self-intersecting outline and a wrong (about half) volume; fixed in `src/utils/gear.js` with a regression test.
- `checkWatertight` does not check face orientation; compare mesh volume against expected geometry when validating new parts.
