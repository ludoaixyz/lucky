from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DOCX = ROOT / "Lucky888_Bathala_Prototype_Analysis_HTML.docx"
MEMORY_DIR = ROOT / "report-i18n"
EN_JSON = MEMORY_DIR / "en.json"
ZH_JSON = MEMORY_DIR / "zh-CN.json"
GLOSSARY_JSON = MEMORY_DIR / "glossary.zh-CN.json"
GENERATED_DOCX = ROOT / "generated" / "report-docx"

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W_P = f"{{{W_NS}}}p"
W_R = f"{{{W_NS}}}r"
W_T = f"{{{W_NS}}}t"
TRANSLATABLE_PART = re.compile(
    r"^word/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$"
)
TEXT_NODE = re.compile(r"(<w:t\b[^>]*>)(.*?)(</w:t>)", re.DOTALL)
RUN_NODE = re.compile(r"<w:r\b[^>]*>.*?</w:r>", re.DOTALL)
PARAGRAPH_NODE = re.compile(r"<w:p\b[^>]*>.*?</w:p>", re.DOTALL)
MARKER = re.compile(r"⟦R(\d+)⟧(.*?)⟦/R\1⟧", re.DOTALL)
URL = re.compile(r"https?://[^\s<>]+", re.IGNORECASE)
NUMBER = re.compile(r"(?<![\w.])[-+]?\d[\d,]*(?:\.\d+)?(?:%|×)?(?!\w)")
TECHNICAL_ONLY = re.compile(
    r"^(?:L[1-5]|H[1-4]|JSON|CSV|HTML5|RTP|CoV|npm|scripts/simulate\.ts|https?://\S+)$",
    re.IGNORECASE,
)


class ReportI18nError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalized(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_source_bytes(path: Path = SOURCE_DOCX) -> bytes:
    try:
        return path.read_bytes()
    except PermissionError as error:
        raise ReportI18nError(
            f"Cannot read {path.name}. Close the document in Microsoft Word and try again."
        ) from error


def package_parts(data: bytes) -> dict[str, bytes]:
    try:
        from io import BytesIO

        with zipfile.ZipFile(BytesIO(data)) as archive:
            bad = archive.testzip()
            if bad:
                raise ReportI18nError(f"DOCX ZIP integrity failed at {bad}")
            return {name: archive.read(name) for name in archive.namelist()}
    except zipfile.BadZipFile as error:
        raise ReportI18nError("The canonical DOCX is not a valid OOXML ZIP package.") from error


def nearest(element: ET.Element, parent: dict[ET.Element, ET.Element], tag: str) -> ET.Element | None:
    node = parent.get(element)
    while node is not None:
        if node.tag == tag:
            return node
        node = parent.get(node)
    return None


def structural_path(element: ET.Element, parent: dict[ET.Element, ET.Element]) -> str:
    segments: list[str] = []
    node = element
    while node in parent:
        owner = parent[node]
        siblings = [child for child in owner if child.tag == node.tag]
        segments.append(f"{local_name(node.tag)}.{siblings.index(node):04d}")
        node = owner
    return ".".join(reversed(segments))


def part_prefix(part: str) -> str:
    stem = Path(part).stem
    return "document" if stem == "document" else stem


def is_translatable(source: str) -> bool:
    if not source or TECHNICAL_ONLY.fullmatch(source):
        return False
    without_urls = URL.sub("", source)
    return bool(re.search(r"[A-Za-z]", without_urls))


def extract_units(source_path: Path = SOURCE_DOCX) -> dict[str, Any]:
    source_bytes = read_source_bytes(source_path)
    parts = package_parts(source_bytes)
    units: list[dict[str, Any]] = []

    for part_name in sorted(name for name in parts if TRANSLATABLE_PART.fullmatch(name)):
        try:
            root = ET.fromstring(parts[part_name])
        except ET.ParseError as error:
            raise ReportI18nError(f"Malformed XML in {part_name}: {error}") from error
        parent = {child: owner for owner in root.iter() for child in owner}
        all_text_nodes = list(root.iter(W_T))
        node_indexes = {node: index for index, node in enumerate(all_text_nodes)}
        paragraphs = list(root.iter(W_P))

        for paragraph in paragraphs:
            own_nodes = [
                node
                for node in paragraph.iter(W_T)
                if nearest(node, parent, W_P) is paragraph
            ]
            if not own_nodes:
                continue

            grouped: list[dict[str, Any]] = []
            for node in own_nodes:
                run = nearest(node, parent, W_R)
                run_xml = ET.tostring(run, encoding="utf-8") if run is not None else b""
                style_node = run.find(f"{{{W_NS}}}rPr") if run is not None else None
                style_hash = sha256_bytes(
                    ET.tostring(style_node, encoding="utf-8") if style_node is not None else b""
                )[:12]
                if grouped and grouped[-1]["runIdentity"] == id(run):
                    grouped[-1]["source"] += node.text or ""
                    grouped[-1]["textNodeIndexes"].append(node_indexes[node])
                else:
                    grouped.append(
                        {
                            "runIdentity": id(run),
                            "source": node.text or "",
                            "textNodeIndexes": [node_indexes[node]],
                            "styleHash": style_hash,
                            "runHash": sha256_bytes(run_xml)[:12],
                        }
                    )

            # Keep explicit Word run boundaries even when adjacent runs share formatting. This
            # preserves hyperlink fields, emphasized spans, and independently positioned header text.
            segments: list[dict[str, Any]] = [
                {
                    "marker": f"R{index}",
                    "source": group["source"],
                    "textNodeIndexes": group["textNodeIndexes"],
                    "styleHash": group["styleHash"],
                }
                for index, group in enumerate(grouped)
            ]

            source = normalized("".join(segment["source"] for segment in segments))
            if not is_translatable(source):
                continue
            path = structural_path(paragraph, parent)
            unit_id = f"{part_prefix(part_name)}.{path}"
            tagged = "".join(
                f"⟦{segment['marker']}⟧{segment['source']}⟦/{segment['marker']}⟧"
                for segment in segments
            )
            context_kind = (
                "table-cell"
                if nearest(paragraph, parent, f"{{{W_NS}}}tc") is not None
                else "paragraph"
            )
            units.append(
                {
                    "id": unit_id,
                    "part": part_name,
                    "path": path,
                    "source": source,
                    "sourceHash": sha256_bytes(source.encode("utf-8")),
                    "context": context_kind,
                    "segments": segments,
                    "taggedSource": tagged,
                }
            )

    ids = [unit["id"] for unit in units]
    if len(ids) != len(set(ids)):
        duplicates = [item for item, count in Counter(ids).items() if count > 1]
        raise ReportI18nError(f"Non-unique structural IDs: {duplicates[:5]}")
    return {
        "version": 1,
        "source": {
            "path": source_path.name,
            "sha256": sha256_bytes(source_bytes),
            "extractedAt": utc_now(),
        },
        "units": units,
    }


def sync_memory(english: dict[str, Any], existing: dict[str, Any] | None) -> dict[str, Any]:
    old_entries = (existing or {}).get("entries", {})
    old_obsolete = (existing or {}).get("obsolete", {})
    entries: dict[str, Any] = {}
    current_ids: set[str] = set()
    for unit in english["units"]:
        unit_id = unit["id"]
        current_ids.add(unit_id)
        old = old_entries.get(unit_id)
        if old is None:
            entries[unit_id] = {
                "sourceHash": unit["sourceHash"],
                "source": unit["source"],
                "translation": "",
                "status": "missing",
            }
        elif old.get("sourceHash") == unit["sourceHash"]:
            entries[unit_id] = {
                **old,
                "source": unit["source"],
                "status": "translated" if old.get("translation") else "missing",
            }
        else:
            entries[unit_id] = {
                **old,
                "previousSource": old.get("source", ""),
                "source": unit["source"],
                "sourceHash": unit["sourceHash"],
                "status": "stale",
            }
    obsolete = dict(old_obsolete)
    for unit_id, old in old_entries.items():
        if unit_id not in current_ids:
            obsolete[unit_id] = {**old, "removedAt": utc_now()}
    for unit_id in list(obsolete):
        if unit_id in current_ids:
            obsolete.pop(unit_id)
    return {
        "version": 1,
        "locale": "zh-CN",
        "sourceSha256": english["source"]["sha256"],
        "syncedAt": utc_now(),
        "entries": entries,
        "obsolete": obsolete,
    }


def translation_segments(unit: dict[str, Any], translation: str) -> list[str]:
    matches = list(MARKER.finditer(translation))
    expected = [f"R{i}" for i in range(len(unit["segments"]))]
    actual = [f"R{match.group(1)}" for match in matches]
    residue = MARKER.sub("", translation).strip()
    if actual != expected or residue:
        raise ReportI18nError(
            f"{unit['id']}: formatting markers must appear exactly once and in order: {expected}"
        )
    return [match.group(2) for match in matches]


def invariant_tokens(text: str) -> Counter[str]:
    canonical = re.sub(r"\b1\s+million\b", "1,000,000", text, flags=re.IGNORECASE)
    return Counter(URL.findall(canonical) + NUMBER.findall(canonical))


def validate_terminology(
    english: dict[str, Any],
    chinese: dict[str, Any],
    glossary: dict[str, Any],
) -> list[str]:
    issues: list[str] = []
    entries = chinese.get("entries", {})
    forbidden = glossary.get("forbiddenTerms", {})
    for unit in english["units"]:
        entry = entries.get(unit["id"])
        if not entry or not entry.get("translation"):
            continue
        translated_text = MARKER.sub(lambda match: match.group(2), entry["translation"])
        for term, preferred in forbidden.items():
            if term in translated_text:
                issues.append(
                    f'{unit["id"]}: prohibited terminology "{term}"; prefer "{preferred}"'
                )
        if "Feature Frequency" in unit["source"] and not any(
            preferred in translated_text for preferred in ("奖励功能触发频率", "功能触发频率")
        ):
            issues.append(
                f'{unit["id"]}: "Feature Frequency" should use 奖励功能触发频率'
            )
    return issues


def terminology_warnings(
    english: dict[str, Any],
    chinese: dict[str, Any],
    glossary: dict[str, Any],
) -> list[str]:
    warnings: list[str] = []
    entries = chinese.get("entries", {})
    warning_terms = glossary.get("warningTerms", {})
    for unit in english["units"]:
        entry = entries.get(unit["id"])
        if not entry or not entry.get("translation"):
            continue
        translated_text = MARKER.sub(lambda match: match.group(2), entry["translation"])
        for term, preferred in warning_terms.items():
            if term in translated_text:
                warnings.append(
                    f'{unit["id"]}: review terminology "{term}"; prefer "{preferred}"'
                )
    return warnings


def validate_memory(english: dict[str, Any], chinese: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    entries = chinese.get("entries", {})
    if chinese.get("sourceSha256") != english["source"]["sha256"]:
        errors.append("Chinese memory was not synced to the current canonical DOCX.")
    for unit in english["units"]:
        entry = entries.get(unit["id"])
        if not entry or not entry.get("translation"):
            errors.append(f"{unit['id']}: missing Chinese translation")
            continue
        if entry.get("sourceHash") != unit["sourceHash"] or entry.get("status") == "stale":
            errors.append(f"{unit['id']}: stale Chinese translation")
            continue
        try:
            translated_segments = translation_segments(unit, entry["translation"])
        except ReportI18nError as error:
            errors.append(str(error))
            continue
        translated_text = "".join(translated_segments)
        if invariant_tokens(unit["source"]) != invariant_tokens(translated_text):
            errors.append(f"{unit['id']}: numbers, percentages, multipliers, or URLs changed")
    if GLOSSARY_JSON.exists():
        errors.extend(validate_terminology(english, chinese, load_json(GLOSSARY_JSON)))
    return errors


def status_summary(english: dict[str, Any], chinese: dict[str, Any]) -> dict[str, int]:
    values = Counter(entry.get("status", "missing") for entry in chinese.get("entries", {}).values())
    return {
        "english": len(english["units"]),
        "translated": values["translated"],
        "missing": values["missing"],
        "stale": values["stale"],
        "obsolete": len(chinese.get("obsolete", {})),
    }


def print_status(english: dict[str, Any], chinese: dict[str, Any]) -> None:
    summary = status_summary(english, chinese)
    print("Report localization status\n")
    print(f"English units:        {summary['english']:4d}")
    print(f"Translated Chinese:   {summary['translated']:4d}")
    print(f"Missing Chinese:      {summary['missing']:4d}")
    print(f"Stale Chinese:        {summary['stale']:4d}")
    print(f"Obsolete:             {summary['obsolete']:4d}")


def add_chinese_font(run_xml: str) -> str:
    visible = "".join(html.unescape(match.group(2)) for match in TEXT_NODE.finditer(run_xml))
    if not re.search(r"[\u3400-\u9fff]", visible):
        return run_xml
    font_attr = ' w:eastAsia="Microsoft YaHei"'
    fonts = re.search(r"<w:rFonts\b[^>]*/>", run_xml)
    if fonts:
        updated = re.sub(r'\s+w:eastAsia="[^"]*"', "", fonts.group(0)[:-2]) + font_attr + "/>"
        return run_xml[: fonts.start()] + updated + run_xml[fonts.end() :]
    rpr = re.search(r"<w:rPr\b[^>]*>", run_xml)
    if rpr:
        return run_xml[: rpr.end()] + f"<w:rFonts{font_attr}/>" + run_xml[rpr.end() :]
    run_open = re.search(r"<w:r\b[^>]*>", run_xml)
    if not run_open:
        return run_xml
    return run_xml[: run_open.end()] + f"<w:rPr><w:rFonts{font_attr}/></w:rPr>" + run_xml[run_open.end() :]


def apply_translations(
    xml_bytes: bytes,
    units: list[dict[str, Any]],
    entries: dict[str, Any],
    part_name: str,
) -> bytes:
    replacements: dict[int, str] = {}
    for unit in units:
        values = translation_segments(unit, entries[unit["id"]]["translation"])
        for segment, value in zip(unit["segments"], values, strict=True):
            indexes = segment["textNodeIndexes"]
            replacements[indexes[0]] = value
            for index in indexes[1:]:
                replacements[index] = ""
    counter = -1

    def replace_text(match: re.Match[str]) -> str:
        nonlocal counter
        counter += 1
        if counter not in replacements:
            return match.group(0)
        value = html.escape(replacements[counter], quote=False)
        opening = match.group(1)
        if replacements[counter][:1].isspace() or replacements[counter][-1:].isspace():
            if "xml:space=" not in opening:
                opening = opening[:-1] + ' xml:space="preserve">'
        return opening + value + match.group(3)

    xml = TEXT_NODE.sub(replace_text, xml_bytes.decode("utf-8"))
    xml = RUN_NODE.sub(lambda match: add_chinese_font(match.group(0)), xml)

    def tighten_body_spacing(match: re.Match[str]) -> str:
        paragraph = match.group(0)
        visible = "".join(html.unescape(item.group(2)) for item in TEXT_NODE.finditer(paragraph))
        if not re.search(r"[\u3400-\u9fff]", visible):
            return paragraph
        # The source uses 1.5-line body spacing (360 twips). Microsoft YaHei's metrics make that
        # substantially looser than Arial, so use a readable 1.375-line equivalent for Chinese.
        return re.sub(r'(<w:spacing\b[^>]*\bw:line=")360("[^>]*/>)', r"\g<1>330\2", paragraph)

    xml = PARAGRAPH_NODE.sub(tighten_body_spacing, xml)
    if part_name == "word/document.xml":
        drawing_anchor = -1

        def protect_config_screenshot(match: re.Match[str]) -> str:
            nonlocal drawing_anchor
            paragraph = match.group(0)
            if "<w:drawing>" not in paragraph:
                return paragraph
            drawing_anchor += paragraph.count("<w:drawing>")
            if drawing_anchor != 5:
                return paragraph
            # The four-column configuration screenshot is the sixth floating drawing. Chinese
            # reflow otherwise strands its lower edge beyond the physical page; scale the drawing
            # as a unit (display dimensions only) while preserving its aspect ratio and source image.
            extent = re.search(r'<wp:extent cx="(\d+)" cy="(\d+)"', paragraph)
            if not extent:
                return paragraph
            width, height = (int(value) for value in extent.groups())
            scaled_width = round(width * 0.82)
            scaled_height = round(height * 0.82)
            return paragraph.replace(
                f'cx="{width}" cy="{height}"',
                f'cx="{scaled_width}" cy="{scaled_height}"',
            )

        xml = PARAGRAPH_NODE.sub(protect_config_screenshot, xml)
    return xml.encode("utf-8")


def validate_docx(path: Path, baseline: Path | None = None) -> None:
    with zipfile.ZipFile(path) as archive:
        bad = archive.testzip()
        if bad:
            raise ReportI18nError(f"Generated DOCX ZIP integrity failed at {bad}")
        names = set(archive.namelist())
        for required in ("[Content_Types].xml", "word/document.xml", "word/styles.xml"):
            if required not in names:
                raise ReportI18nError(f"Generated DOCX is missing {required}")
        for name in names:
            if name.endswith(".xml"):
                try:
                    ET.fromstring(archive.read(name))
                except ET.ParseError as error:
                    raise ReportI18nError(f"Generated DOCX has malformed XML in {name}: {error}")
        generated_tables = archive.read("word/document.xml").count(b"<w:tbl>")
        generated_media = len([name for name in names if name.startswith("word/media/")])
    if baseline:
        with zipfile.ZipFile(baseline) as archive:
            baseline_names = set(archive.namelist())
            baseline_tables = archive.read("word/document.xml").count(b"<w:tbl>")
            baseline_media = len([name for name in baseline_names if name.startswith("word/media/")])
        if generated_tables != baseline_tables:
            raise ReportI18nError("Generated DOCX table count changed")
        if generated_media != baseline_media:
            raise ReportI18nError("Generated DOCX image count changed")


def build_docx(
    source: Path = SOURCE_DOCX,
    english_path: Path = EN_JSON,
    chinese_path: Path = ZH_JSON,
    output_dir: Path = GENERATED_DOCX,
) -> tuple[Path, Path]:
    english = load_json(english_path)
    chinese = load_json(chinese_path)
    errors = validate_memory(english, chinese)
    if errors:
        sample = "\n".join(f"- {error}" for error in errors[:20])
        raise ReportI18nError(
            f"Cannot generate zh-CN DOCX ({len(errors)} validation errors).\n{sample}\n"
            "Run: npm run report:i18n:status"
        )
    source_bytes = read_source_bytes(source)
    if sha256_bytes(source_bytes) != english["source"]["sha256"]:
        raise ReportI18nError("English extraction is stale. Run npm run report:i18n:sync.")
    output_dir.mkdir(parents=True, exist_ok=True)
    en_output = output_dir / "report-en.docx"
    zh_output = output_dir / "report-zh-CN.docx"
    en_output.write_bytes(source_bytes)

    units_by_part: dict[str, list[dict[str, Any]]] = {}
    for unit in english["units"]:
        units_by_part.setdefault(unit["part"], []).append(unit)
    with zipfile.ZipFile(source) as source_zip, zipfile.ZipFile(zh_output, "w") as output_zip:
        for info in source_zip.infolist():
            data = source_zip.read(info.filename)
            if info.filename in units_by_part:
                data = apply_translations(
                    data, units_by_part[info.filename], chinese["entries"], info.filename
                )
            output_zip.writestr(info, data)
    validate_docx(en_output, source)
    validate_docx(zh_output, source)
    return en_output, zh_output


def command_extract() -> None:
    english = extract_units()
    write_json(EN_JSON, english)
    existing = load_json(ZH_JSON) if ZH_JSON.exists() else None
    chinese = sync_memory(english, existing)
    write_json(ZH_JSON, chinese)
    print(f"[report-i18n] Extracted {len(english['units'])} units to {EN_JSON.relative_to(ROOT)}")
    print_status(english, chinese)


def command_sync() -> None:
    english = extract_units()
    write_json(EN_JSON, english)
    existing = load_json(ZH_JSON) if ZH_JSON.exists() else None
    chinese = sync_memory(english, existing)
    write_json(ZH_JSON, chinese)
    print_status(english, chinese)


def command_status() -> None:
    print_status(load_json(EN_JSON), load_json(ZH_JSON))


def command_validate() -> None:
    english = load_json(EN_JSON)
    chinese = load_json(ZH_JSON)
    errors = validate_memory(english, chinese)
    if errors:
        print("\n".join(f"[report-i18n] {error}" for error in errors), file=sys.stderr)
        raise ReportI18nError(f"Validation failed with {len(errors)} error(s).")
    if GLOSSARY_JSON.exists():
        warnings = terminology_warnings(english, chinese, load_json(GLOSSARY_JSON))
        for warning in warnings:
            print(f"[report-i18n] Terminology warning: {warning}", file=sys.stderr)
    print(f"[report-i18n] Validated {len(english['units'])} Chinese translation units.")


def command_build() -> None:
    en_output, zh_output = build_docx()
    print(f"[report-i18n] Created {en_output.relative_to(ROOT)}")
    print(f"[report-i18n] Created {zh_output.relative_to(ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Lucky888 report localization tooling")
    parser.add_argument("command", choices=("extract", "sync", "status", "validate", "build"))
    args = parser.parse_args()
    try:
        globals()[f"command_{args.command}"]()
    except (ReportI18nError, FileNotFoundError, json.JSONDecodeError) as error:
        print(f"[report-i18n] {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
