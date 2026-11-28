# Viewport-sized meter download pilot

The active app still loads one compact citywide meter inventory. This offline pilot measures the payload and geometry parity of selecting smaller, versioned geographic assets. It does not publish assets or change the browser loader.

## Reproduce

```sh
output=$(mktemp -d)
folder=$(python3 scripts/pilot_meter_shards.py data/meters.json "$output")
node scripts/check_meter_shard_pilot.mjs data/meters.json "$folder"
```

The generator assigns each ordered record to every 0.02° grid cell touched by its bounding box. The verifier enumerates cells for the full selected radius, validates the file size, SHA-256, record count, and snapshot version for each required asset, then deduplicates by the record's canonical ordinal. The same exact line distance test used in the app filters the result. A required missing or damaged file fails verification. The output directory is keyed by the snapshot digest and the generator refuses to overwrite an existing version in that directory.

## Measured on the checked-in 11,185-record snapshot

| Center | Exact lines at 500 m | Cell downloads | Cold bytes including manifest |
| --- | ---: | ---: | ---: |
| Bryant Park | 121 | 2 | 549,862 |
| Times Square | 106 | 4 | 935,278 |
| Williamsburg | 30 | 2 | 113,935 |
| Lower Manhattan | 63 | 1 | 115,681 |
| Jackson Heights | 99 | 1 | 150,938 |
| No-meter control | 0 | 0 | 22,809 |

The current whole-city compact file is 6,574,069 bytes. The 500 m samples reduce meter payload by about 92% at Bryant Park and 98% at Williamsburg. All 24 area/radius tests match the complete canonical inventory, including order, exact geometry and schedule strings. Missing and corrupt required assets fail validation. These are file sizes and parity checks. Network timing, caching, device behavior and browser integration remain unmeasured.

Publishing every pilot asset would total roughly 8.27 MB across 196 cells and the manifest, around 26% more than the current compact file due to duplication and separate compression. Before a rollout, choose retention and immutable hosting, verify version-pinned atomic publication, and measure device startup and fast pans. Use complete-snapshot fallback if any required asset or the manifest fails. Geographic cell requests can reveal the viewed area to the asset host, which needs review before enabling the browser path.
