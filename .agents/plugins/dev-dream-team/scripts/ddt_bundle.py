#!/usr/bin/env python3
"""Resolve the canonical Dev Dream Team bundle without copying shared resources."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


class BundleError(RuntimeError):
    pass


def is_bundle_root(path: Path) -> bool:
    return all(
        candidate.is_file()
        for candidate in (
            path / ".codex-plugin" / "plugin.json",
            path / "ddt" / "attachments.json",
            path / "ddt" / "kernel.md",
            path / "scripts" / "ddt_context.py",
        )
    )


def candidates(start: Path) -> list[Path]:
    configured = os.environ.get("DDT_BUNDLE_ROOT")
    if configured:
        return [Path(configured).expanduser()]
    values: list[Path] = []
    values.extend([start, *start.parents])
    for parent in [start, *start.parents]:
        values.append(parent / ".agents" / "plugins" / "dev-dream-team")
        values.append(parent / "plugins" / "dev-dream-team")
    values.append(Path.home() / ".gemini" / "config" / "plugins" / "dev-dream-team")
    values.append(Path.home() / "plugins" / "dev-dream-team")
    return values


def resolve(start: Path) -> Path:
    found: list[Path] = []
    for candidate in candidates(start.resolve()):
        resolved = candidate.resolve()
        if is_bundle_root(resolved) and resolved not in found:
            found.append(resolved)
    if not found:
        raise BundleError(
            "DDT bundle not found; set DDT_BUNDLE_ROOT or install the complete bundle under ~/plugins/dev-dream-team"
        )
    if len(found) > 1:
        # Prioritize local project bundle if start is inside the project
        local_bundles = [b for b in found if any(parent == b or parent in b.parents for parent in [start, *start.parents])]
        if len(local_bundles) == 1:
            return local_bundles[0]
        # Otherwise prefer global antigravity plugin
        global_bundle = (Path.home() / ".gemini" / "config" / "plugins" / "dev-dream-team").resolve()
        if global_bundle in found:
            return global_bundle
        raise BundleError(f"ambiguous DDT bundles: {', '.join(str(path) for path in found)}")
    return found[0]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", default=os.getcwd(), help="invoking skill path or working directory")
    args = parser.parse_args()
    try:
        root = resolve(Path(args.start))
    except BundleError as error:
        print(json.dumps({"ok": False, "reason": str(error)}, indent=2))
        return 2
    print(
        json.dumps(
            {
                "ok": True,
                "root": str(root),
                "attachments": str(root / "ddt" / "attachments.json"),
                "context_helper": str(root / "scripts" / "ddt_context.py"),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
