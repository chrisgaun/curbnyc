"""Audit NYC DOT sign-to-LION associations offline. Never infer curb permission."""
import argparse
from collections import Counter, defaultdict
import json
import math
from pathlib import Path
import re

BOROUGHS = {"Manhattan": 1, "Bronx": 2, "Brooklyn": 3, "Queens": 4, "Staten Island": 5}
CARDINAL = {"N": (0, 1), "S": (0, -1), "E": (1, 0), "W": (-1, 0)}
NEIGHBORHOODS = {
    "midtown": ("Manhattan", {f"WEST {n} STREET" for n in range(40, 45)}, (986500, 212200, 990900, 216100)),
    "williamsburg": ("Brooklyn", {"BEDFORD AVENUE", "NORTH 5 STREET", "NORTH 6 STREET", "NORTH 7 STREET"},
                     (994600, 199550, 997600, 203650)),
}
DAYS = "MONDAY TUESDAY WEDNESDAY THURSDAY FRIDAY SATURDAY SUNDAY".split()
TIME = r"(\d{1,2})(?::(\d{2}))?\s*(AM|PM)"
RESTRICTIONS = ("NO STOPPING", "NO STANDING", "NO PARKING")


def name(value):
    return " ".join((value or "").upper().split())


def xy(row, x, y):
    try:
        point = float(row[x]), float(row[y])
    except (KeyError, TypeError, ValueError):
        return None
    return point if all(map(math.isfinite, point)) else None


def feet(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def minute(hour, minute_text, period):
    h, m = int(hour), int(minute_text or "0")
    return (h % 12) * 60 + m + 720 * (period == "PM") if 1 <= h <= 12 and m < 60 else None


def classify(sign):
    # Strip face artwork and sign design history. Extent still requires field verification.
    desc = name(sign.get("sign_description"))
    desc = re.split(r"\s+\(SUPERSED(?:ES|ED BY)\b", desc, maxsplit=1)[0]
    desc = re.sub(r"\s*(<->|<-|->)$", "", desc).strip()
    for label in RESTRICTIONS:
        if desc == label or desc.startswith(label + " "):
            break
    else:
        label = "VEHICLE RESTRICTION" if re.match(r"^(COMMERCIAL VEHICLES ONLY|TRUCK LOADING ONLY)\b", desc) else "UNCLASSIFIED"
        return {"kind": label, "window": None}
    details = desc[len(label):].strip()
    if details == "ANYTIME" and not sign.get("sign_notes"):
        return {"kind": label, "window": {"daily": True}}
    cleaning = label == "NO PARKING" and details.startswith("(SANITATION BROOM SYMBOL)")
    if cleaning:
        label = "STREET CLEANING"
        details = details.removeprefix("(SANITATION BROOM SYMBOL)").strip()
    times = re.fullmatch(rf"(.+?)\s+{TIME}\s*[-–]\s*{TIME}", details)
    if times and not sign.get("sign_notes"):
        days = times[1].split()
        start = minute(*times.groups()[1:4])
        end = minute(*times.groups()[4:7])
        if all(day in DAYS for day in days) and start is not None and end is not None and start < end:
            return {"kind": label, "window": {"days": days, "startMinute": start, "endMinute": end}}
    return {"kind": label, "window": None}


def endpoints(segment):
    start = xy(segment, "XFrom", "YFrom")
    end = xy(segment, "XTo", "YTo")
    if not start or not end or feet(start, end) < 30 or str(segment.get("CurveFlag") or "").strip():
        return None
    return start, end


def side_match(segment, sign_point, cardinal):
    line = endpoints(segment)
    if not line:
        return None
    (x, y), (end_x, end_y) = line
    dx, dy = end_x - x, end_y - y
    length = math.hypot(dx, dy)
    px, py = sign_point[0] - x, sign_point[1] - y
    along = (dx * px + dy * py) / length
    cross = (dx * py - dy * px) / length
    ux, uy = CARDINAL[cardinal]
    left_alignment = (-dy * ux + dx * uy) / length
    if not (1 <= along <= length - 1 and 4 <= abs(cross) <= 85 and abs(left_alignment) >= 0.5):
        return None
    if (cross > 0) != (left_alignment > 0):
        return None
    side = "L" if cross > 0 else "R"
    face = segment.get(side + "BlockFaceID")
    if not re.fullmatch(r"[1-9]\d{9}", str(face or "")):
        return None
    return {"segmentId": segment["SegmentID"], "blockfaceId": face, "lionSide": side,
            "offsetFeet": round(abs(cross), 1)}


def audit(signs, segments):
    names_at_node = defaultdict(set)
    by_street = defaultdict(list)
    for segment in segments:
        street = name(segment.get("Street"))
        alias = name(segment.get("SAFStreetName"))
        side_boros = {segment.get("LBoro"), segment.get("RBoro")} & set(BOROUGHS.values())
        for borough in side_boros:
            for node in (segment.get("NodeIDFrom"), segment.get("NodeIDTo")):
                if node and str(node).strip(" 0"):
                    names_at_node[borough, node].update(filter(None, (street, alias)))
            if (segment.get("LBoro") == borough == segment.get("RBoro")
                    and str(segment.get("SegCount")).strip() == "1"
                    and str(segment.get("RW_TYPE")).strip() == "1"
                    and segment.get("SegmentID")):
                for key in set(filter(None, (street, alias))):
                    by_street[borough, key].append(segment)

    results = []
    for sign in signs:
        classification = classify(sign)
        result = {"order": sign.get("order_number"), "design": sign.get("sign_code"),
                  "street": name(sign.get("on_street")), "side": sign.get("side_of_street"),
                  "arrow": sign.get("arrow_direction") or None, "extent": "unverified",
                  "status": "unknown", **classification}
        results.append(result)
        if sign.get("record_type") != "Current" or str(sign.get("order_number") or "").startswith("R-"):
            result["status"] = "historical_or_unconfirmed"
            continue
        point = xy(sign, "sign_x_coord", "sign_y_coord")
        if sign.get("sign_design_voided_on_date") or sign.get("sign_location") or not point:
            result["status"] = "unsupported_record"
            continue
        borough = BOROUGHS.get(sign.get("borough"))
        cardinal = sign.get("side_of_street")
        from_street, to_street = name(sign.get("from_street")), name(sign.get("to_street"))
        if (not borough or cardinal not in CARDINAL or not from_street or from_street == to_street or not to_street
                or any(str(sign.get(key) or "").strip() for key in ("on_street_suffix", "from_street_suffix", "to_street_suffix"))):
            result["status"] = "unsupported_location"
            continue
        candidates = []
        for segment in by_street[borough, result["street"]]:
            start = names_at_node[borough, segment.get("NodeIDFrom")]
            end = names_at_node[borough, segment.get("NodeIDTo")]
            if from_street in start and to_street in end or to_street in start and from_street in end:
                match = side_match(segment, point, cardinal)
                if match:
                    candidates.append(match)
        if len(candidates) == 1:
            result.update(candidates[0], status="candidate")
        else:
            result["status"] = "ambiguous" if candidates else "unmatched"
    return results


def filter_neighborhood(signs, neighborhood):
    borough, streets, (west, south, east, north) = NEIGHBORHOODS[neighborhood]
    return [row for row in signs if row.get("borough") == borough and name(row.get("on_street")) in streets
            and (point := xy(row, "sign_x_coord", "sign_y_coord"))
            and west <= point[0] <= east and south <= point[1] <= north]


def pilot_report(signs, lion):
    if not signs or not lion.get("features") or lion.get("exceededTransferLimit"):
        raise ValueError("Expected complete, non-empty DOT and LION samples")
    ref = lion.get("spatialReference", {})
    if 2263 not in (ref.get("wkid"), ref.get("latestWkid")):
        raise ValueError("LION input must use EPSG:2263")
    segments = [feature["attributes"] for feature in lion["features"]]
    rows = audit(signs, segments)
    return {"counts": dict(sorted(Counter(row["status"] for row in rows).items())),
            "candidateBlockfaces": sorted({row["blockfaceId"] for row in rows if row["status"] == "candidate"}),
            "rows": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("signs", type=Path)
    parser.add_argument("lion", type=Path)
    parser.add_argument("--neighborhood", choices=NEIGHBORHOODS)
    args = parser.parse_args()
    signs = json.loads(args.signs.read_text())
    if args.neighborhood:
        signs = filter_neighborhood(signs, args.neighborhood)
    print(json.dumps(pilot_report(signs, json.loads(args.lion.read_text())), indent=2))


if __name__ == "__main__":
    main()
