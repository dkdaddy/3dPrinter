# Vixen clamp

Female Vixen-style dovetail receiver that holds the [vixen plate](vixen-plate.md) bar. Regenerate: `npm run build:vixen-clamp` (or `node scripts/vixen-clamp.js output/vixen-clamp.3mf`; all dimensions are options, see the script header). Output: `output/vixen-clamp.3mf`.

Modelled after the ACOLY dovetail base mount (Amazon B0FWC5MTNX, photo supplied by the owner; the listing page itself could not be read). From the owner: **44 wide x 38 long x 15 high**, base about **8 mm** thick, walls angled **75 deg** with uniform thickness, both sides the same.

Read from the photo / assumed (check against the real part and the bar):

- A flat **8 mm** base plate with two **identical jaw walls** of uniform thickness (**4.64 mm** square to the wall), leaning inward at **75 deg** from the base so they overhang the bar. The outer foot of each wall sits on the 44 mm base edge. Channel along the 38 mm length: **34.4 mm** at the floor (34 mm bar + 0.4 mm clearance), **30.65 mm** at the top (7 mm walls). The 34 mm bar is 30.25 mm wide 7 mm up, so it clears by about 0.2 mm per side. The bar slides in from either end.
- Each jaw is split into two blocks by an **8 mm** notch down to the floor (as in the photo).
- Thumbscrews on **one jaw only (-X), one per block, two in total**, as in the photo: **4.2 mm** holes (M5 tap size) square to the wall (15 deg below horizontal, pointing in and down onto the bar's flank), centred in the wall at 11.5 mm above the bed. With 7 mm tall walls only about 1.2 mm of wall is left above and below each hole. `--screw-sides 2` adds screws to the other jaw too.
- Floor: a shallow oblong recess **10 x 24 mm, 2 mm deep** (into the top of the base) with two **6 mm** through holes (+/-6 mm from the centre), and four **6 mm** through holes on a **20 mm** square (the owner's spec for the metal shoe, so they line up with the ETX 105 mount plate). Recess and centre-hole sizes are estimated from the photo.
- Print with the floor on the bed; the walls overhang 15 deg from vertical so no supports are needed. The screw holes are not threaded in the model: tap them or use heat-set inserts.