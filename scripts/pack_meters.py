"""Create the lossless, gzip-compressed browser snapshot from the canonical JSON."""
import argparse
from array import array
import gzip
import json
from pathlib import Path
import struct
import sys

PACKED = Path("data/meters-v1.bin.gz")
MAGIC = b"CM01"


def pack_snapshot(snapshot):
    axes = (array("d"), array("d"))
    rows = []
    for row in snapshot["features"]:
        geometry = row["the_geom"]
        line_string = geometry["type"] == "LineString"
        lines = [geometry["coordinates"]] if line_string else geometry["coordinates"]
        for line in lines:
            for coordinate in line:
                if len(coordinate) != 2:
                    raise ValueError("Compact snapshots support two-dimensional coordinates")
                for axis, value in zip(axes, coordinate):
                    axis.append(value)
        properties = {k: v for k, v in row.items() if k not in ("geometry", "the_geom") and isinstance(v, str)}
        rows.append([line_string, list(map(len, lines)), properties])

    header = json.dumps({"metadata": snapshot["metadata"], "rows": rows}, separators=(",", ":"),
                        ensure_ascii=False, allow_nan=False).encode()
    binary = bytearray(MAGIC + struct.pack("<I", len(header)) + header)
    for axis in axes:
        if sys.byteorder != "little":
            axis.byteswap()
        values = axis.tobytes()
        # Put high bytes with high bytes and low bytes with low bytes for gzip.
        for column in range(8):
            binary.extend(values[column::8])
    return gzip.compress(binary, compresslevel=6, mtime=0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path, nargs="?", default=PACKED)
    args = parser.parse_args()
    args.output.write_bytes(pack_snapshot(json.loads(args.input.read_bytes())))


if __name__ == "__main__":
    main()
