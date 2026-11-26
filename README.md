# CurbNYC

CurbNYC is a free, open-source NYC parking map. It shows official NYC meter blockfaces near the center of the map, with passenger-meter hours, published rates, and commercial restrictions when the meter schedule supports them.

[Open the map](https://chrisgaun.github.io/curbnyc/)

## Use the map

Allow location access to start near your position or browse from Bryant Park. Tap a colored curb for its schedule, or use Settings to change arrival time, stay length, and search radius. Expand **Data and nearby meters** for the nearby list.

Check all posted signs. A curb with no scheduled meter payment can still have other restrictions. The app does not determine vacancy or cover hydrants, alternate-side rules, temporary restrictions, or unmapped curbs.

## Develop locally

Run `python3 -m http.server 8000` from the repository root and open `http://localhost:8000`. Browser geolocation requires HTTPS or localhost. Run `npm test` for the schedule, spatial selection, and background request tests.

The active entry point is `index.html`. It uses MapLibre GL JS and official NYC Open Data for [meter blockfaces](https://data.cityofnewyork.us/d/e7yp-wx55), [streets](https://data.cityofnewyork.us/d/inkn-q76z), [buildings](https://data.cityofnewyork.us/d/5zhs-2jue), and [parks](https://data.cityofnewyork.us/d/y6ja-fw4f). Background requests include the map viewport. The code is MIT-licensed. Source data and third-party assets have their own terms.

The [Alpha 1 release](https://github.com/chrisgaun/curbnyc/releases/tag/v0.1.0-alpha.1) records the approved v0.12 build. `meters-baseline.html` is the independent meter-layer reference.

## Midtown vector tile pilot

`scripts/prototype_basemap_tiles.cjs` generates static XYZ Mapbox Vector Tiles for zooms 14–16 around Bryant Park and Times Square. Use Node.js 22.12+ and install the pilot tools outside the checkout:

```sh
npm install --prefix /tmp/curb-tile-tools geojson-vt@5.0.4 vt-pbf@3.1.3
NODE_PATH=/tmp/curb-tile-tools/node_modules node scripts/prototype_basemap_tiles.cjs INPUT_DIR OUTPUT_DIR
```

Supply `streets.geojson`, `buildings.geojson`, and `parks.geojson` from the datasets above, covering west −73.995, south 40.744, east −73.974, and north 40.764. Serve the output as `{z}/{x}/{y}.pbf` with NYC Open Data attribution. The PBF source layers are named `streets`, `buildings`, and `parks`. The street label field is `st_label`. The app continues to use the viewport loader while the pilot is evaluated.
