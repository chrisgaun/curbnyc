"""Validate and publish a versioned snapshot of official NYC meter blockfaces."""
import datetime
import hashlib
import json
import math
import os
import pathlib
import urllib.parse
import urllib.request

SOURCE = "https://data.cityofnewyork.us/resource/e7yp-wx55.json"
SNAPSHOT = pathlib.Path("data/meters.json")
PAGE_SIZE = 5000
MIN_LINES = 9000


def valid_coordinate(coordinate):
    return (
        isinstance(coordinate, list)
        and len(coordinate) >= 2
        and all(type(value) in (int, float) and abs(value) <= bound and math.isfinite(value)
                for value, bound in zip(coordinate, (180, 90)))
    )


def has_meter_line(row):
    geometry = row.get("the_geom") if isinstance(row, dict) else None
    if not isinstance(geometry, dict):
        return False
    coordinates = geometry.get("coordinates")
    if geometry.get("type") == "LineString":
        lines = [coordinates]
    elif geometry.get("type") == "MultiLineString":
        lines = coordinates
    else:
        return False
    return bool(lines) and isinstance(lines, list) and all(
        isinstance(line, list) and len(line) >= 2 and all(map(valid_coordinate, line))
        for line in lines
    )


def get_rows():
    rows = []
    seen = set()
    for offset in range(0, 30000, PAGE_SIZE):
        query = urllib.parse.urlencode({"$limit": PAGE_SIZE, "$offset": offset, "$order": ":id"})
        with urllib.request.urlopen(SOURCE + "?" + query, timeout=60) as response:
            page = json.load(response)
        if not isinstance(page, list) or len(page) > PAGE_SIZE:
            raise RuntimeError("Unexpected meter data page")
        signature = hashlib.sha256(encode(page)).digest()
        if signature in seen:
            raise RuntimeError("NYC data returned a repeated page")
        seen.add(signature)
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
    raise RuntimeError("Pagination limit exceeded")


def encode(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()


def build_snapshot(rows, previous_count, fetched_at):
    valid = [row for row in rows if has_meter_line(row)]
    if len(valid) < MIN_LINES or len(valid) * 10 < previous_count * 9:
        raise RuntimeError(f"Refusing to replace snapshot with {len(valid)} valid lines")
    return {
        "metadata": {
            "dataset": "e7yp-wx55",
            "fetchedAt": fetched_at,
            "version": hashlib.sha256(encode(valid)).hexdigest(),
            "recordCount": len(valid),
        },
        "features": valid,
    }


def main():
    previous_count = 0
    if SNAPSHOT.exists():
        previous = json.loads(SNAPSHOT.read_bytes())
        previous_count = len(previous if isinstance(previous, list) else previous["features"])
    rows = get_rows()
    fetched_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    snapshot = build_snapshot(rows, previous_count, fetched_at)
    SNAPSHOT.parent.mkdir(exist_ok=True)
    temporary = SNAPSHOT.with_suffix(".json.tmp")
    temporary.write_bytes(encode(snapshot))
    os.replace(temporary, SNAPSHOT)
    print(f"Wrote {snapshot['metadata']['recordCount']} official meter blockfaces")


if __name__ == "__main__":
    main()
