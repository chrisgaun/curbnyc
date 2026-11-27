import copy
import json
from pathlib import Path
import unittest

from scripts.audit_sign_blockfaces import audit, classify, pilot_report

FIXTURES = json.loads((Path(__file__).resolve().parents[1] / "fixtures/sign-blockfaces.json").read_text())


class SignBlockfaceTests(unittest.TestCase):
    def test_real_source_samples(self):
        for neighborhood, fixture in FIXTURES.items():
            with self.subTest(neighborhood=neighborhood):
                rows = pilot_report(fixture["signs"], fixture["lion"])["rows"]
                observed = [{key: row.get(key) for key in expected} for row, expected in zip(rows, fixture["expected"])]
                self.assertEqual(observed, fixture["expected"])
                self.assertTrue(all(row["extent"] == "unverified" for row in rows))

    def test_opposite_side_and_history_are_rejected(self):
        fixture = FIXTURES["williamsburg"]
        sign = fixture["signs"][0]
        segments = [feature["attributes"] for feature in fixture["lion"]["features"]]
        wrong_side, historical = audit(
            [{**sign, "side_of_street": "S"}, {**sign, "record_type": "Historical"}], segments
        )
        self.assertEqual(wrong_side["status"], "unmatched")
        self.assertEqual(historical["status"], "historical_or_unconfirmed")

    def test_duplicate_candidates_are_ambiguous(self):
        fixture = FIXTURES["williamsburg"]
        segments = [feature["attributes"] for feature in fixture["lion"]["features"]]
        segment_id = fixture["expected"][0]["segmentId"]
        duplicate = next(segment for segment in segments if segment["SegmentID"] == segment_id)
        [row] = audit(fixture["signs"][:1], [*segments, {**duplicate, "SegmentID": "9999999"}])
        self.assertEqual(row["status"], "ambiguous")
        self.assertNotIn("blockfaceId", row)

    def test_invalid_source_crs_fails(self):
        fixture = copy.deepcopy(FIXTURES["williamsburg"])
        fixture["lion"]["spatialReference"] = {"wkid": 4326}
        with self.assertRaisesRegex(ValueError, "EPSG:2263"):
            pilot_report(fixture["signs"], fixture["lion"])

    def test_window_only_when_plain_text_has_no_qualifiers(self):
        sign = FIXTURES["williamsburg"]["signs"][0]
        self.assertEqual(classify(sign), {
            "kind": "STREET CLEANING", "window": {"days": ["MONDAY", "THURSDAY"], "startMinute": 540, "endMinute": 630}
        })
        self.assertIsNone(classify({**sign, "sign_notes": "Seasonal exception"})["window"])
        self.assertIsNone(classify({"sign_description": "NO STANDING ANYTIME EXCEPT TRUCKS"})["window"])
        self.assertEqual(classify({"sign_description": "NO STOPPING ANYTIME"})["window"], {"daily": True})


if __name__ == "__main__":
    unittest.main()
