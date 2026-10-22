"""Import the supplied Matvaretabellen workbook; standard library only.
Usage: python scripts/import-food-table.py path/to/table.xlsx
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(sys.argv[1]) as archive:
    strings = ["".join(node.itertext()) for node in ET.fromstring(archive.read("xl/sharedStrings.xml"))]

    def rows(sheet):
        for row in ET.fromstring(archive.read(sheet)).findall(".//m:sheetData/m:row", NS):
            result = {}
            for cell in row:
                value = cell.find("m:v", NS)
                text = value.text if value is not None else ""
                if cell.get("t") == "s":
                    text = strings[int(text)]
                result[re.sub(r"\d", "", cell.get("r"))] = text
            yield result

    sources = {r.get("A"): r for r in rows("xl/worksheets/sheet3.xml")}
    foods = []
    category = ""
    for row in rows("xl/worksheets/sheet2.xml"):
        if row.get("A") == "Matvare ID":
            assert row["H"] == "Karbohydrat (g)"
            continue
        if not row.get("B"):
            category = row.get("A", category)
            continue
        code = sources.get(row["A"], {}).get("H", "")
        raw = row.get("H", "")
        # Source code 10 means missing/unknown, never a true zero.
        carbs = float(raw) if raw and code != "10" else None
        assert carbs is None or 0 <= carbs <= 100
        foods.append({"id": row["A"], "name": row["B"], "category": category,
                      "carbsPer100g": carbs, "sourceCode": code})
    assert len({f["id"] for f in foods}) == len(foods) == 2121
    target = Path("artifacts/karb/data/foods.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(foods, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"Imported {len(foods)} foods; {sum(f['carbsPer100g'] is None for f in foods)} unknown carbohydrate values.")
