# Vixen plate

Male dovetail bar with counterbored mounting holes. Regenerate: `npm run build:vixen-plate` (or `node scripts/vixen-plate.js output/vixen-plate.3mf`; all dimensions are options, see the script header). Output: `output/vixen-plate.3mf`.

- Cross-section: **34 mm** wide at the base (the wide face the clamp grips), **75 deg** flanks, **20 mm** high, so the top (mounting) face is 34 - 2 x 20 / tan 75 = **23.28 mm** wide. Length **120 mm**.
- Holes: six **6 mm** holes, each with a **10 mm dia x 12 mm deep** head recess opening on the 34 mm base face (8 mm of 6 mm hole remains through the narrow top). Recess diameter 10 mm was assumed for an M6 socket head.
- Hole layout: all six holes on the centreline, in mirrored pairs at **60, 84 and 108 mm** spacing along the length (x = 30/90, 18/102, 6/114 on the 120 mm bar). The 12 mm pitch leaves 2 mm between neighbouring 10 mm recesses; 60 / 80 / 100 mm would put the recesses tangent, so the largest spacing is 108 mm rather than 100 mm. The outermost recesses are only 1 mm from the bar ends. `--stagger` offsets alternate pairs sideways if wanted.
- Printed with the 34 mm base face on the bed: the flanks slope inward going up, so no supports are needed and the recesses open onto the bed (the 6 mm hole bridges over each recess). M6 screw length depends on what the narrow top bolts into: under-head length = 8 mm + thread depth.
