"""Fetch the official meter inventory without spatial API queries."""
import json
import pathlib
import urllib.parse
import urllib.request

BASE = "https://data.cityofnewyork.us/resource/e7yp-wx55.json"
rows = []
for offset in range(0, 30000, 5000):
    url = BASE + "?" + urllib.parse.urlencode({"$limit": 5000, "$offset": offset, "$order": ":id"})
    with urllib.request.urlopen(url, timeout=60) as response:
        page = json.load(response)
    if not isinstance(page, list):
        raise RuntimeError("Expected a list of records")
    rows.extend(page)
    if len(page) < 5000:
        break
else:
    raise RuntimeError("Pagination limit exceeded")
valid = [row for row in rows if isinstance(row.get("the_geom"), dict) and row["the_geom"].get("type") in ("LineString", "MultiLineString")]
if len(valid) < 9000:
    raise RuntimeError(f"Refusing to publish incomplete inventory: {len(valid)}")
path = pathlib.Path("data/meters.json")
path.parent.mkdir(exist_ok=True)
path.write_text(json.dumps(valid, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
print(f"Wrote {len(valid)} official meter blockfaces")
