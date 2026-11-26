# Non-metered sign association pilot

This offline audit connects individual NYC DOT sign records to potential LION blockface IDs. The public map still shows the independent meter layer. The audit emits an association status and a sign class. It leaves the extent of every sign unverified and makes no parking eligibility determination.

## Sources and matching

- [NYC DOT Parking Regulation Locations and Signs](https://data.cityofnewyork.us/d/nfid-uabd) includes current and historical orders. Use only Current records. Exclude repair orders, voided designs, intersection placement codes, unresolved roadbed suffixes, and rows without a usable point or cardinal side. Order numbers and sign codes can repeat. A sign code describes a design and does not identify a sign instance. Single-arrow direction is recorded for review. A blank arrow field can represent a sign with two arrows or no arrow.
- [NYC Planning LION 26C](https://www.nyc.gov/content/planning/pages/resources/datasets/lion) provides roadway geometry, node topology, segment IDs, and left/right blockface IDs. The sign table does not expose these IDs. The join requires the borough, normalized main street name, and both cross streets at the two LION endpoint nodes. Known same-node aliases in the LION segment attributes are allowed. Multiple coincident roadbeds and curves requiring more geometry are left unresolved.
- DOT labels the sign X/Y fields longitude and latitude, but the sampled values are numeric strings near 990,000 and 210,000. The audit treats the observed values as State Plane Long Island survey feet for this pilot and compares them with LION coordinates in EPSG:2263. Candidate examples corroborate this interpretation through local offsets and named block endpoints. Verify the coordinate reference with DOT before relying on it in production.
- The sign point must fall within the segment's projected length, 4–85 feet to either side, with its signed offset agreeing with DOT's stated block side. These are conservative pilot filters and need field calibration. Neither a match nor an arrow resolves the restriction's extent. The parser recognizes no stopping, no standing, no parking, street cleaning, and select vehicle restrictions. It normalizes only explicit anytime restrictions and simple written day/time windows without qualifiers. Overlap cannot be assessed until extents and exceptions are verified.

## Reproduce the audit

1. Download the official [LION FeatureServer](https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/LION/FeatureServer/0). Use its `query` endpoint with `f=json`, `where=1=1`, `geometryType=esriGeometryEnvelope`, `inSR=4326`, `outSR=2263`, and `outFields=*`. Use the bounds `-73.991,40.749,-73.980,40.757` for Midtown and `-73.962,40.710,-73.953,40.721` for Williamsburg.
2. Download JSON from `https://data.cityofnewyork.us/resource/nfid-uabd.json` with `$order=:id`. Query Manhattan rows separately with `on_street like 'WEST%40%STREET'` through `'WEST%44%STREET'`, then combine the five arrays. Query Brooklyn for `BEDFORD AVENUE` plus `on_street like 'NORTH%5%STREET'` through `'NORTH%7%STREET'`. The audit filters exact normalized names and applies a projected pilot envelope. Paginate if a response reaches the requested limit.
3. Run `python3 scripts/audit_sign_blockfaces.py SIGNS.json LION.json --neighborhood midtown` or use `--neighborhood williamsburg`. The checked-in trimmed fixtures make the offline regression run independent of live APIs. Run `python3 -m unittest scripts.test_sign_blockfaces`.

## Observed on November 26, 2026

| Pilot | Filtered sign records | Candidate matches | Distinct candidate blockfaces | Other |
| --- | ---: | ---: | ---: | ---: |
| Midtown | 659 | 33 | 5 | 626 unmatched |
| Williamsburg | 355 | 117 | 33 | 234 unmatched, 4 unsupported |

These are candidate association counts. The two queries use different street slices and overlapping but nonidentical geometry and sign envelopes. Field accuracy and regulatory coverage remain unmeasured.

For a field validation pass, start on West 40 Street by Bryant Park and North 7 Street between Berry Street and Bedford Avenue. Record both curb sides, pole order, arrows, sign wording, the first and last affected points, and any exceptions. Include unmatched and negative controls. Compare against LION candidates before showing users a sign-derived layer or assigning precedence across overlapping restrictions.
