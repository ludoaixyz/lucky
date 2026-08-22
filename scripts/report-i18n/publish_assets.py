from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError as error:
    raise SystemExit(
        "[report] pypdf is required to publish the manifest. Install it with: python -m pip install pypdf"
    ) from error

ROOT = Path(__file__).resolve().parents[2]
PDF_DIR = ROOT / "generated" / "report-pdf"
PUBLIC_DIR = ROOT / "apps" / "report" / "public" / "reports"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    documents = {
        "en": ("English", PDF_DIR / "report-en.pdf"),
        "zh-CN": ("简体中文", PDF_DIR / "report-zh-CN.pdf"),
    }
    missing = [str(path) for _, path in documents.values() if not path.is_file()]
    if missing:
        raise SystemExit("[report] Missing generated PDFs:\n" + "\n".join(missing))
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    keep: set[str] = set()
    manifest_documents: dict[str, object] = {}
    for locale, (label, source) in documents.items():
        sha = digest(source)
        name = f"report-{locale}.{sha[:12]}.pdf"
        shutil.copy2(source, PUBLIC_DIR / name)
        keep.add(name)
        pages = len(PdfReader(source).pages)
        manifest_documents[locale] = {
            "label": label,
            "file": name,
            "sha256": sha,
            "pages": pages,
        }
    for candidate in PUBLIC_DIR.glob("report-*.pdf"):
        if candidate.name not in keep and re.fullmatch(r"report-(?:en|zh-CN)\.[a-f0-9]{12}\.pdf", candidate.name):
            candidate.unlink()
    manifest = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "documents": manifest_documents,
    }
    (PUBLIC_DIR / "report-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"[report] Published {len(documents)} fingerprinted PDFs and report-manifest.json")


if __name__ == "__main__":
    main()
