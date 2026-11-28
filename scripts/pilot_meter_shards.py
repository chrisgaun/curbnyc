"""Create temporary, immutable grid assets for the viewport download pilot."""
import argparse
from collections import defaultdict
from hashlib import sha256
import json
import math
from pathlib import Path
import re

from pack_meters import pack_snapshot

STEP = 0.02


def build(snapshot, output):
    metadata, rows = snapshot["metadata"], snapshot["features"]
    version = metadata["version"]
    if not re.fullmatch(r"[a-f0-9]{64}", version) or metadata["recordCount"] != len(rows):
        raise ValueError("Expected complete versioned canonical snapshot")
    groups = defaultdict(list)
    for ordinal, row in enumerate(rows):
        geom = row["the_geom"]
        lines = [geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"]
        cells = [(math.floor(x / STEP), math.floor(y / STEP)) for line in lines for x, y in line]
        xs, ys = zip(*cells)
        if (max(xs) - min(xs) + 1) * (max(ys) - min(ys) + 1) > 64:
            raise ValueError(f"Meter feature {ordinal} spans too many cells")
        tagged = {**row, "snapshot_ordinal": str(ordinal)}
        for x in range(min(xs), max(xs) + 1):
            for y in range(min(ys), max(ys) + 1):
                groups[f"{x},{y}"].append(tagged)
    folder = output / version
    folder.mkdir(parents=True)
    assets = {}
    for key, records in sorted(groups.items()):
        payload = pack_snapshot({"metadata": {**metadata, "recordCount": len(records)}, "features": records})
        (folder / f"{key}.bin.gz").write_bytes(payload)
        assets[key] = {"count": len(records), "bytes": len(payload), "sha256": sha256(payload).hexdigest()}
    manifest = {"version": version, "recordCount": len(rows), "step": STEP, "cells": assets}
    # The manifest appears only once every required cell has been written.
    (folder / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")))
    return folder


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    folder = build(json.loads(args.snapshot.read_bytes()), args.output)
    print(folder)


if __name__ == "__main__":
    main()
