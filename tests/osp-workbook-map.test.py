"""Synthetic OOXML-only regression tests; no carrier document or personal data."""

import copy
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

MODULE_PATH = Path(__file__).resolve().parents[1] / "tools" / "osp-check-workbook-map.py"
SPEC = importlib.util.spec_from_file_location("workbook_map", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class WorkbookMapTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.source = Path(self.directory.name) / "synthetic.zip"
        # Minimal read-only inspection fixture, not a workbook delivery artifact.
        with zipfile.ZipFile(self.source, "w") as archive:
            archive.writestr("xl/workbook.xml", '''<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Form" sheetId="1" r:id="rId1"/></sheets></workbook>''')
            archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
            archive.writestr("xl/styles.xml", '''<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs><xf/><xf><protection locked="0"/></xf></cellXfs></styleSheet>''')
            archive.writestr("xl/worksheets/sheet1.xml", '''<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" s="1"/><c r="B1" s="1"/><c r="C1"/><c r="D1"><f>1+1</f><v>2</v></c></row><row r="2"><c r="A2" s="1"/></row></sheetData><mergeCells><mergeCell ref="A1:B1"/></mergeCells></worksheet>''')
        self.before = self.source.read_bytes()
        self.inventory = {
            "schemaVersion": 1,
            "status": "draft_for_human_review",
            "sourceSha256": hashlib.sha256(self.before).hexdigest(),
            "excludedRanges": [{"sheet": "Form", "range": "A2:B2", "reason": "Carrier only"}],
            "groups": [{"sheet": "Form", "entries": [
                ["company.name", "A1", "A1:B1", "review_value"],
                ["country", "C1", "C1", "locked_input_review"],
                ["computed", "D1", "D1", "preserve"],
            ]}],
        }

    def check(self, inventory=None):
        return MODULE.check_map(self.source, inventory or self.inventory)

    def test_real_xml_parser_and_merged_child_not_double_counted(self):
        result = self.check()
        self.assertEqual(result["inventoryEntries"], 3)
        self.assertEqual(result["excludedUnlockedAnchors"], 1)
        self.assertEqual(result["lockedInputHolds"], ["Form!C1"])
        self.assertEqual(result["packageReadiness"], "not_evaluated")
        self.assertEqual(self.source.read_bytes(), self.before)

    def test_source_drift_rejected_before_xml_read(self):
        self.inventory["sourceSha256"] = "0" * 64
        with patch.object(MODULE, "read_workbook") as reader:
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                self.check()
            reader.assert_not_called()

    def test_merge_interior_and_changed_range_rejected(self):
        for entry in (["company.name", "B1", "A1:B1", "review_value"],
                      ["company.name", "A1", "A1", "review_value"]):
            with self.subTest(entry=entry):
                candidate = copy.deepcopy(self.inventory)
                candidate["groups"][0]["entries"][0] = entry
                with self.assertRaisesRegex(ValueError, "merged anchor"):
                    self.check(candidate)

    def test_omitted_unlocked_input_rejected(self):
        del self.inventory["groups"][0]["entries"][0]
        with self.assertRaisesRegex(ValueError, "Unclassified unlocked anchors: Form!A1"):
            self.check()

    def test_formula_or_locked_input_cannot_be_proposed_for_write(self):
        for index, message in ((1, "populated or locked"), (2, "Formula must be preserved")):
            with self.subTest(index=index):
                candidate = copy.deepcopy(self.inventory)
                candidate["groups"][0]["entries"][index][3] = "review_value"
                with self.assertRaisesRegex(ValueError, message):
                    self.check(candidate)

    def test_carrier_area_cannot_be_an_input(self):
        self.inventory["groups"][0]["entries"].append(["unsafe", "A2", "A2", "review_value"])
        with self.assertRaisesRegex(ValueError, "excluded area"):
            self.check()

    def test_duplicate_identifier_or_target_rejected(self):
        for identifier, cell, area in (("other", "A1", "A1:B1"), ("company.name", "A2", "A2")):
            with self.subTest(identifier=identifier):
                candidate = copy.deepcopy(self.inventory)
                candidate["groups"][0]["entries"].append([identifier, cell, area, "preserve"])
                with self.assertRaisesRegex(ValueError, "Duplicate"):
                    self.check(candidate)

    def test_hidden_sheet_and_unknown_disposition_rejected(self):
        with patch.object(MODULE, "read_workbook", return_value={"Form": {"state": "hidden"}}):
            with self.assertRaisesRegex(ValueError, "hidden sheet"):
                self.check()
        self.inventory["groups"][0]["entries"][0][3] = "auto_approve"
        with self.assertRaisesRegex(ValueError, "Unknown disposition"):
            self.check()

    def test_bounds_validation(self):
        for address in ("XFE1", "A1048577", "A0", "a1", "A1:B2:C3", "B2:A1"):
            with self.subTest(address=address), self.assertRaises(ValueError):
                MODULE.bounds(address)


if __name__ == "__main__":
    unittest.main()
