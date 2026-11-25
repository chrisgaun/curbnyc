# CurbNYC

Experimental, mobile-first NYC parking sign explorer. Not a parking authorization or vacancy service. Version 0.1 displays live raw sign points, if the NYC API schema and network permit. No curb matching, schedule evaluation, holiday logic or meter pricing yet. Arrival/stay inputs are placeholders. Pilot uses an approximate Manhattan bounding box (not a borough boundary).

## Run

Serve this directory with `python3 -m http.server 8000` and open http://localhost:8000. For Android, deploy to an HTTPS static host (GitHub Pages works), open in Chrome and use Add to Home screen. GPS requires HTTPS or localhost. Internet required for live signs and tiles. Anonymous API queries can be throttled. No location is stored by the app; NYC Open Data and map tile providers receive network requests that may reveal approximate location.

## Data and design

- Signs: https://data.cityofnewyork.us/d/nfid-uabd
- Meter blockfaces: https://data.cityofnewyork.us/d/e7yp-wx55
- Meter zones: https://data.cityofnewyork.us/d/f72k-2u3b
- Rules: https://www.nyc.gov/html/dot/html/motorist/parking-regulations.shtml
- ASP: https://www.nyc.gov/html/dot/html/motorist/alternate-side-parking.shtml

Next: validate schema and actual data against field signs; ingest daily snapshots, map sign arrows to curb geometry using street centerlines and side, interpret overlapping schedules and exceptions, join passenger meter rate segments, model stay duration and price changes, then add hydrants and temporary restrictions. Default unknown if coverage or interpretation is incomplete. Do not color a curb legal based on absence of signs. Use America/New_York civil time. Field-test Bryant Park and expand only after validation. A future PostGIS database can store source snapshots, sign points, curb segments, normalized rules, and price intervals. No database is required for the raw sign prototype.

## Testing

`npm test` runs basic classifier and distance tests. Browser integration and live API requests are not verified. See CONTRIBUTING.md and SECURITY.md. Code MIT; data and tiles retain their respective terms.
