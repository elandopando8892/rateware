"""Read-only check of a source-bound draft inventory. Does not approve or fill a form."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
DISPOSITIONS = {
    "review_value", "review_decision", "evidence_review", "optional_reference",
    "carrier_only", "preserve", "layout_only", "sensitive_hold",
    "manual_signature", "locked_input_review",
}
PROPOSED_INPUTS = {"review_value", "review_decision", "evidence_review", "optional_reference"}


def coordinates(cell):
    match = re.fullmatch(r"([A-Z]{1,3})([1-9][0-9]*)", cell)
    if not match:
        raise ValueError(f"Invalid cell: {cell}")
    column = 0
    for letter in match[1]:
        column = column * 26 + ord(letter) - 64
    row = int(match[2])
    if column > 16384 or row > 1048576:
        raise ValueError(f"Out-of-bounds cell: {cell}")
    return column, row


def bounds(address):
    parts = address.split(":")
    if len(parts) not in (1, 2):
        raise ValueError(f"Invalid range: {address}")
    start, end = coordinates(parts[0]), coordinates(parts[-1])
    if start[0] > end[0] or start[1] > end[1]:
        raise ValueError(f"Reversed range: {address}")
    return start, end


def within(cell, address):
    column, row = coordinates(cell)
    start, end = bounds(address)
    return start[0] <= column <= end[0] and start[1] <= row <= end[1]


def read_workbook(source):
    """Inspect OOXML structure without loading Excel, evaluating formulas or running VBA."""
    sheets = {}
    with zipfile.ZipFile(source) as archive:
        if sum(item.file_size for item in archive.infolist()) > 64 * 1024 * 1024:
            raise ValueError("Source exceeds inspection size limit")
        book = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = {node.attrib["Id"]: node.attrib["Target"] for node in
                ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
                if node.attrib.get("TargetMode") != "External"}
        styles = ET.fromstring(archive.read("xl/styles.xml")).find("s:cellXfs", NS)
        if styles is None:
            raise ValueError("Missing cell styles")
        unlocked = {index for index, style in enumerate(styles)
                    if style.find("s:protection", NS) is not None
                    and style.find("s:protection", NS).attrib.get("locked") == "0"}
        for sheet in book.findall("s:sheets/s:sheet", NS):
            target = rels[sheet.attrib[REL_ID]]
            path = target.lstrip("/") if target.startswith("/") else "xl/" + target
            xml = ET.fromstring(archive.read(path))
            cells = {}
            for cell in xml.findall("s:sheetData/s:row/s:c", NS):
                # Presence only: no raw customer values or formulas in audit output.
                value = cell.find("s:v", NS)
                has_text = any((text.text or "").strip() for text in cell.findall(".//s:t", NS))
                cells[cell.attrib["r"]] = {
                    "unlocked": int(cell.attrib.get("s", "0")) in unlocked,
                    "formula": cell.find("s:f", NS) is not None,
                    "populated": value is not None and bool((value.text or "").strip()) or has_text,
                }
            sheets[sheet.attrib["name"]] = {
                "state": sheet.attrib.get("state", "visible"),
                "cells": cells,
                "merges": [node.attrib["ref"] for node in xml.findall("s:mergeCells/s:mergeCell", NS)],
            }
    return sheets


def check_map(source, inventory):
    with open(source, "rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != inventory.get("sourceSha256"):
        raise ValueError("Source SHA-256 differs from draft inventory")
    if inventory.get("schemaVersion") != 1 or inventory.get("status") != "draft_for_human_review":
        raise ValueError("Only version 1 draft inventories are supported")
    sheets = read_workbook(source)
    exclusions = inventory.get("excludedRanges", [])
    for exclusion in exclusions:
        if exclusion["sheet"] not in sheets or not exclusion.get("reason"):
            raise ValueError("Invalid excluded range")
        bounds(exclusion["range"])
    targets, identifiers, counts, input_holds = set(), set(), {}, []
    if not inventory.get("groups"):
        raise ValueError("Empty inventory")
    for group in inventory["groups"]:
        name = group["sheet"]
        if name not in sheets or sheets[name]["state"] != "visible":
            raise ValueError(f"Unknown or hidden sheet: {name}")
        sheet = sheets[name]
        for identifier, cell, expected_range, disposition in group["entries"]:
            address = f"{name}!{cell}"
            coordinates(cell)
            bounds(expected_range)
            if disposition not in DISPOSITIONS:
                raise ValueError(f"Unknown disposition: {address}")
            if address in targets or identifier in identifiers:
                raise ValueError(f"Duplicate inventory entry: {address}")
            targets.add(address)
            identifiers.add(identifier)
            metadata = sheet["cells"].get(cell)
            if metadata is None:
                raise ValueError(f"Missing source cell: {address}")
            merged = [area for area in sheet["merges"] if within(cell, area)]
            actual_range = merged[0] if merged else cell
            if actual_range != expected_range or actual_range.split(":")[0] != cell:
                raise ValueError(f"Not the expected merged anchor: {address}")
            if any(item["sheet"] == name and within(cell, item["range"]) for item in exclusions):
                if disposition not in {"carrier_only", "preserve"}:
                    raise ValueError(f"Attempted input in excluded area: {address}")
            if metadata["formula"] and disposition != "preserve":
                raise ValueError(f"Formula must be preserved: {address}")
            if disposition in PROPOSED_INPUTS and (metadata["populated"] or not metadata["unlocked"]):
                raise ValueError(f"Proposed input is populated or locked: {address}")
            if disposition == "layout_only" and metadata["populated"]:
                raise ValueError(f"Populated cell cannot be a spacer: {address}")
            if disposition == "locked_input_review":
                if metadata["unlocked"] or metadata["populated"]:
                    raise ValueError(f"Expected a locked blank input: {address}")
                input_holds.append(address)
            counts[disposition] = counts.get(disposition, 0) + 1
    uncovered = []
    excluded_anchors = 0
    for name, sheet in sheets.items():
        if sheet["state"] != "visible":
            continue
        for cell, metadata in sheet["cells"].items():
            if not metadata["unlocked"]:
                continue
            merged = [area for area in sheet["merges"] if within(cell, area)]
            if merged and merged[0].split(":")[0] != cell:
                continue
            if any(item["sheet"] == name and within(cell, item["range"]) for item in exclusions):
                excluded_anchors += 1
                continue
            if f"{name}!{cell}" not in targets:
                uncovered.append(f"{name}!{cell}")
    if uncovered:
        raise ValueError("Unclassified unlocked anchors: " + ", ".join(uncovered))
    return {
        "sourceSha256": digest,
        "inventoryEntries": len(targets),
        "dispositions": counts,
        "excludedUnlockedAnchors": excluded_anchors,
        "lockedInputHolds": input_holds,
        "unclassifiedUnlockedAnchors": [],
        "packageReadiness": "not_evaluated",
        "scope": "Physical source/destination check only. No values, semantic approvals, PDF or signatures validated.",
        "effects": "read_only",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--map", required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(check_map(args.source, json.loads(args.map.read_text(encoding="utf-8"))), indent=2))
    except (ValueError, KeyError, TypeError, zipfile.BadZipFile, ET.ParseError) as error:
        parser.exit(1, f"Inventory check failed: {error}\n")
