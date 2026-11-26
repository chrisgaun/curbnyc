"""Generate planned NYC DOT suspension dates from official all-day iCalendar files."""
import argparse
from datetime import date, datetime, timedelta
from hashlib import sha256
import json
from pathlib import Path
import re


def event_date(fields, key):
    raw = fields.get(key + ";VALUE=DATE")
    if raw is None:
        # The 2026 calendar encodes All Saints' Day as local midnight to midnight.
        timed = fields.get(key + ';TZID="Eastern Standard Time"', "")
        if not re.fullmatch(r"\d{8}T000000", timed):
            raise ValueError(f"{key} must be an all-day date or NYC local midnight")
        raw = timed[:8]
    return datetime.strptime(raw, "%Y%m%d").date()


def parse_events(payload, year):
    text = re.sub(r"\r?\n[ \t]", "", payload.decode("utf-8-sig"))
    if "BEGIN:VCALENDAR" not in text or f"X-WR-CALNAME:ASP {year}" not in text:
        raise ValueError(f"Expected the NYC DOT ASP calendar for {year}")
    events = re.findall(r"BEGIN:VEVENT\r?\n(.*?)\r?\nEND:VEVENT", text, re.S)
    if len(events) < 30 or text.count("BEGIN:VEVENT") != len(events):
        raise ValueError(f"Incomplete calendar for {year}")
    dates = {}
    for event in events:
        fields = dict(line.split(":", 1) for line in event.splitlines() if ":" in line)
        if any("RRULE" in key or "RECURRENCE" in key or "EXDATE" in key for key in fields):
            raise ValueError("Recurring ASP events are unsupported")
        summary = next((value for key, value in fields.items() if key.split(";")[0] == "SUMMARY"), "")
        if summary.strip().casefold() != "alternate side parking suspended":
            raise ValueError(f"Unexpected calendar event: {summary!r}")
        start = event_date(fields, "DTSTART")
        end = event_date(fields, "DTEND")
        if not 1 <= (end - start).days <= 7 or start.year != year or (end - timedelta(days=1)).year != year:
            raise ValueError(f"Unexpected event span: {start} to {end}")
        description = " ".join(fields.get("DESCRIPTION", "").lower().split())
        no_meter = bool(re.search(r"parking meters will not be in effect", description))
        meter_on = bool(re.search(r"parking meters will be in effect", description))
        if no_meter == meter_on and start.weekday() != 6:
            raise ValueError(f"Meter status is ambiguous on {start}")
        for days in range((end - start).days):
            day = (start + timedelta(days=days)).isoformat()
            if day in dates and dates[day] != no_meter:
                raise ValueError(f"Conflicting meter status on {day}")
            dates[day] = no_meter
    return {"sha256": sha256(payload).hexdigest(), "dates": dict(sorted(dates.items()))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checked", required=True, type=date.fromisoformat)
    parser.add_argument("calendars", nargs="+", type=Path, metavar="YEAR.ics")
    args = parser.parse_args()
    data = {"checked": args.checked.isoformat(), "years": {
        file.stem: parse_events(file.read_bytes(), int(file.stem)) for file in args.calendars
    }}
    print("// Generated from the published NYC DOT ASP iCalendar files.")
    print("export const calendar=" + json.dumps(data, indent=1) + ";")


if __name__ == "__main__":
    main()
