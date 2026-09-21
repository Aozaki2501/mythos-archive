#!/usr/bin/env python3
"""Check that a re-import did not change the already-published archive years.

``import-legacy-archive.py --force`` clears and rebuilds ``content/<year>/``.
This script records an md5 manifest of the historical years so a later run can
prove the rebuild is byte-identical, instead of trusting the report.

Usage (from the project root)::

    python scripts/check-legacy-content.py --write-baseline
    python scripts/check-legacy-content.py

Exit code is 0 only when every recorded file is present and unchanged.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONTENT_ROOT = PROJECT_ROOT / "content"
BASELINE_PATH = PROJECT_ROOT / "archive-import-baseline.json"
DEFAULT_YEARS = (2020, 2021, 2022, 2023, 2024, 2025)


def digest(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def snapshot(years: tuple[int, ...]) -> dict[str, str]:
    rows: dict[str, str] = {}
    for year in years:
        base = CONTENT_ROOT / str(year)
        if not base.is_dir():
            continue
        for dirpath, _dirnames, filenames in os.walk(base):
            for name in sorted(filenames):
                full = Path(dirpath) / name
                rows[str(full.relative_to(PROJECT_ROOT)).replace(os.sep, "/")] = digest(full)
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="核对历届导入内容是否与基线一致")
    parser.add_argument("--baseline", type=Path, default=BASELINE_PATH)
    parser.add_argument("--years", type=int, nargs="+", default=list(DEFAULT_YEARS))
    parser.add_argument("--write-baseline", action="store_true", help="把当前状态写为基线")
    args = parser.parse_args()

    current = snapshot(tuple(args.years))

    if args.write_baseline:
        args.baseline.write_text(
            json.dumps(current, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(f"baseline written: {args.baseline} ({len(current)} files)")
        return 0

    if not args.baseline.exists():
        print(f"缺少基线文件 {args.baseline}，先跑一次 --write-baseline", file=sys.stderr)
        return 2

    base = json.loads(args.baseline.read_text(encoding="utf-8"))
    missing = sorted(set(base) - set(current))
    added = sorted(set(current) - set(base))
    changed = sorted(key for key in set(base) & set(current) if base[key] != current[key])

    print(f"baseline={len(base)} current={len(current)}")
    print(f"missing={len(missing)} added={len(added)} changed={len(changed)}")
    for label, rows in (("missing", missing), ("added", added), ("changed", changed)):
        for key in rows[:20]:
            print(f"  {label}: {key}")

    if missing or added or changed:
        print("历届内容与基线不一致，别直接发布。", file=sys.stderr)
        return 1
    print("历届内容与基线逐字节一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
