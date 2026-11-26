# Street cleaning calendar and curb exclusion audit

The map's collapsed **Street cleaning and curb restrictions** panel lists planned NYC DOT holiday suspensions for the selected New York arrival and stay dates. It links to NYC311 for current and emergency information. A date absent from the planned calendar does not establish current enforcement. The panel leaves blockface-specific street cleaning and temporary restrictions to posted signs and official notices.

## Calendar source and refresh

The app bundles 2026 and 2027 planned dates from the [NYC DOT calendar](https://www.nyc.gov/html/dot/html/motorist/alternate-side-parking.shtml). The importer checks the published all-day events, expands exclusive end dates, and records date-level meter exceptions only when explicitly indicated. This includes observed Independence Day, Christmas, and New Year's dates that a recurring holiday formula misses. The existing Sunday, commercial-precedence, and daylight-saving review behavior remains in effect. Years outside the bundled calendar use the preexisting six-date meter rule and show that the planned street cleaning calendar is unavailable.

For updates, download the official [2026 ICS](https://www.nyc.gov/html/dot/downloads/misc/2026-alternate-side.ics) and [2027 ICS](https://www.nyc.gov/html/dot/downloads/misc/2027-alternate-side.ics) as `2026.ics` and `2027.ics`, or use the equivalent `home4.nyc.gov` DOT mirror. Compare dates and meter exceptions against the official HTML tables, then run `python3 scripts/import_asp_calendar.py --checked YYYY-MM-DD 2026.ics 2027.ics > asp-calendar-data.js`. Include both current and next published years when available and rerun `npm test`. The bundled data records each file's SHA-256 and when it was checked. This is a planned calendar, with no live emergency feed.

## Curb exclusion source audit

| Source | Midtown sample | Williamsburg sample | Limitation |
| --- | ---: | ---: | --- |
| [NYC DEP hydrants](https://data.cityofnewyork.us/d/5bgh-vtsn) | 233 points | 250 points | There are two coordinate representations and no curb-side or field-accuracy confidence in these records. |
| [MTA bus GTFS](https://www.mta.info/developers) | 29 stops from the Manhattan feed | 29 stops from the Brooklyn feed | The stop point locates scheduled service. It supplies no regulatory bus-zone endpoints. Borough feeds omit some operators or routes, and temporary detours are generally absent. |

The sample bounds were west/south/east/north `-73.991,40.749,-73.980,40.757` and `-73.962,40.710,-73.953,40.721`. The DEP records were queried using `within_box(the_geom,north,west,south,east)` with `the_geom,unitid,latitude,longitude`. The stops were selected from `stops.txt`; both MTA feeds reported version 20261009 and service dates October 12, 2026 through January 2, 2027. A local planar comparison of the two DEP position fields found a maximum difference of 24.4 feet in Midtown and 1.2 feet in Williamsburg. This measures internal agreement rather than real-world accuracy. One Midtown discrepancy exceeds the general 15-foot hydrant distance described by [NYC DOT](https://www.nyc.gov/html/dot/html/motorist/parking-regulations.shtml).

Before adding a hydrant exclusion, field-check the asset, shortest physical distance, roadway configuration, and correct curb side. For a bus zone, verify both regulatory endpoints and active restrictions from DOT signage. The app has no point-based exclusion layer because these inputs cannot establish enforceable curb extents.

The [NYC DOT weekly advisory](https://www.nyc.gov/html/dot/html/motorist/weektraf.shtml), [NYC311 closures](https://portal.311.nyc.gov/article/?kanumber=KA-01081), and [permitted event data](https://data.cityofnewyork.us/d/tvpp-9vvx) provide leads for temporary closures. These sources can change and lack comprehensive curb-side prohibition geometry. The app directs users to the advisory and posted signs.
