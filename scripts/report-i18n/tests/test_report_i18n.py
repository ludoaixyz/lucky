from __future__ import annotations

import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

TOOL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOL_DIR))

from report_i18n import (  # noqa: E402
    ReportI18nError,
    build_docx,
    extract_units,
    invariant_tokens,
    sync_memory,
    terminology_warnings,
    translation_segments,
    validate_docx,
    validate_memory,
    validate_terminology,
)

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def fixture_docx(path: Path, text: str = "Win rate is 93.15% at https://example.com/") -> None:
    document = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="{W}"><w:body><w:tbl><w:tr><w:tc><w:p>
<w:r><w:rPr><w:b/></w:rPr><w:t>Win rate is </w:t></w:r>
<w:r><w:t>{text.removeprefix("Win rate is ")}</w:t></w:r>
</w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>'''
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>")
        archive.writestr("word/document.xml", document)
        archive.writestr(f"word/styles.xml", f'<w:styles xmlns:w="{W}"/>')
        archive.writestr("word/media/image1.png", b"png")


class ReportI18nTests(unittest.TestCase):
    def test_extraction_ids_are_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.docx"
            fixture_docx(source)
            first = extract_units(source)
            second = extract_units(source)
            self.assertEqual(
                [unit["id"] for unit in first["units"]],
                [unit["id"] for unit in second["units"]],
            )
            self.assertTrue(first["units"][0]["id"].startswith("document."))

    def test_unchanged_units_preserve_translation_and_changed_units_are_stale(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.docx"
            fixture_docx(source)
            english = extract_units(source)
            memory = sync_memory(english, None)
            unit = english["units"][0]
            memory["entries"][unit["id"]]["translation"] = "⟦R0⟧胜率为 ⟦/R0⟧⟦R1⟧93.15%，网址为 https://example.com/⟦/R1⟧"
            memory["entries"][unit["id"]]["status"] = "translated"
            unchanged = sync_memory(english, memory)
            self.assertEqual(unchanged["entries"][unit["id"]]["status"], "translated")
            fixture_docx(source, "Win rate is 94.15% at https://example.com/")
            changed = sync_memory(extract_units(source), unchanged)
            self.assertEqual(changed["entries"][unit["id"]]["status"], "stale")

    def test_missing_translation_and_changed_invariants_block_validation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.docx"
            fixture_docx(source)
            english = extract_units(source)
            memory = sync_memory(english, None)
            self.assertIn("missing Chinese translation", "\n".join(validate_memory(english, memory)))
            unit = english["units"][0]
            memory["entries"][unit["id"]].update(
                translation="⟦R0⟧胜率为 ⟦/R0⟧⟦R1⟧92%⟦/R1⟧", status="translated"
            )
            self.assertIn("changed", "\n".join(validate_memory(english, memory)))

    def test_marker_validation(self) -> None:
        unit = {"id": "x", "segments": [{}, {}]}
        with self.assertRaises(ReportI18nError):
            translation_segments(unit, "⟦R0⟧文本⟦/R0⟧")

    def test_terminology_validation_rejects_forbidden_slot_term(self) -> None:
        english = {"units": [{"id": "x", "source": "Bathala Slot Analysis"}]}
        chinese = {
            "entries": {
                "x": {
                    "translation": "⟦R0⟧Bathala 角子机分析⟦/R0⟧",
                    "status": "translated",
                }
            }
        }
        glossary = {"forbiddenTerms": {"角子机": "老虎机"}}
        self.assertIn(
            "prohibited terminology",
            "\n".join(validate_terminology(english, chinese, glossary)),
        )

    def test_spelled_out_million_matches_numeric_invariant(self) -> None:
        self.assertEqual(
            invariant_tokens("Only 34 out of 1 million paid spins reached ≥500×."),
            invariant_tokens("1,000,000 次付费 Spin 中仅 34 次达到 ≥500×。"),
        )

    def test_advisory_terminology_is_reported_without_becoming_validation_error(self) -> None:
        english = {"units": [{"id": "x", "source": "Volatility Profile"}]}
        chinese = {
            "entries": {
                "x": {
                    "translation": "⟦R0⟧波动性配置⟦/R0⟧",
                    "status": "translated",
                }
            }
        }
        glossary = {"warningTerms": {"波动性配置": "波动性特征"}}
        self.assertIn(
            "review terminology",
            "\n".join(terminology_warnings(english, chinese, glossary)),
        )
        self.assertEqual(validate_terminology(english, chinese, glossary), [])

    def test_generated_docx_is_valid_and_preserves_tables_images_numbers_and_urls(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.docx"
            fixture_docx(source)
            english = extract_units(source)
            memory = sync_memory(english, None)
            unit = english["units"][0]
            memory["entries"][unit["id"]].update(
                translation="⟦R0⟧胜率为 ⟦/R0⟧⟦R1⟧93.15%，网址为 https://example.com/⟦/R1⟧",
                status="translated",
            )
            en_json = root / "en.json"
            zh_json = root / "zh.json"
            en_json.write_text(json.dumps(english), encoding="utf-8")
            zh_json.write_text(json.dumps(memory), encoding="utf-8")
            en_docx, zh_docx = build_docx(source, en_json, zh_json, root / "out")
            validate_docx(en_docx, source)
            validate_docx(zh_docx, source)
            with zipfile.ZipFile(zh_docx) as archive:
                xml = archive.read("word/document.xml").decode("utf-8")
                self.assertIn("93.15%", xml)
                self.assertIn("https://example.com/", xml)
                self.assertIn("Microsoft YaHei", xml)


if __name__ == "__main__":
    unittest.main()
