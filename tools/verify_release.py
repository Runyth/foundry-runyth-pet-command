#!/usr/bin/env python3
"""Verify Pet Command release archive structure, parity, and reproducibility."""

from __future__ import annotations

import hashlib
import json
import posixpath
import re
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

INSTALL_TOP_LEVEL = {"lang", "scripts", "styles", "LICENSE", "README.md", "module.json"}
DOCUMENTATION_REQUIRED = {
  "CHANGELOG.md",
  "README.md",
  "LICENSE",
  "docs/PATCH_REPORT.md",
  "docs/CODE_AUDIT.md",
  "docs/INCREMENTAL_BEST_PRACTICE_CHANGELOG.md",
  "docs/VALIDATION_REPORT.md",
  "docs/PERFORMANCE_AUDIT.md",
  "docs/MANUAL_TEST_PLAN.md",
  "reports/TEST_RESULTS.txt",
  "reports/VALIDATION_RESULTS.txt",
  "reports/BENCHMARK_RESULTS.txt",
  "reports/ARCHIVE_VALIDATION.txt",
}


def sha256(path: Path) -> str:
  digest = hashlib.sha256()
  with path.open("rb") as handle:
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
      digest.update(chunk)
  return digest.hexdigest()


def entries(path: Path) -> dict[str, bytes]:
  with zipfile.ZipFile(path) as archive:
    bad = archive.testzip()
    if bad:
      raise AssertionError(f"CRC failure in {path.name}: {bad}")
    return {name: archive.read(name) for name in archive.namelist() if not name.endswith("/")}


def strip_root(values: dict[str, bytes], expected_root: str) -> dict[str, bytes]:
  prefix = f"{expected_root}/"
  if not values or any(not name.startswith(prefix) for name in values):
    raise AssertionError(f"Archive does not contain only root {expected_root}/")
  return {name[len(prefix):]: content for name, content in values.items()}



def module_specifiers(source: str) -> set[str]:
  """Return literal relative ESM imports and re-exports from one source file."""
  patterns = (
    re.compile(r'(?:import|export)\s+(?:[^"\']*?\s+from\s+)?["\']([^"\']+)["\']'),
    re.compile(r'import\s*\(\s*["\']([^"\']+)["\']\s*\)'),
  )
  return {
    match.group(1)
    for pattern in patterns
    for match in pattern.finditer(source)
    if match.group(1).startswith(".")
  }


def verify_install_module_graph(install: dict[str, bytes], entrypoint: str) -> None:
  """Verify every recursive runtime import exists, uses .mjs, and stays inside scripts/."""
  pending = [entrypoint]
  discovered: set[str] = set()
  while pending:
    current = pending.pop()
    if current in discovered:
      continue
    if current not in install:
      raise AssertionError(f"Installation archive is missing runtime module: {current}")
    if not current.endswith(".mjs"):
      raise AssertionError(f"Runtime module does not use .mjs: {current}")
    discovered.add(current)
    source = install[current].decode("utf-8")
    for specifier in module_specifiers(source):
      clean = re.split(r"[?#]", specifier, maxsplit=1)[0]
      if not clean.endswith(".mjs"):
        raise AssertionError(f"Runtime import does not use .mjs: {current} -> {specifier}")
      target = posixpath.normpath(posixpath.join(posixpath.dirname(current), clean))
      if target.startswith("../") or not target.startswith("scripts/"):
        raise AssertionError(f"Runtime import escapes scripts/: {current} -> {specifier}")
      pending.append(target)

  packaged_scripts = {name for name in install if name.startswith("scripts/")}
  if discovered != packaged_scripts:
    missing = sorted(packaged_scripts - discovered)
    extra = sorted(discovered - packaged_scripts)
    raise AssertionError(f"Runtime graph mismatch; unreachable={missing}, missing={extra}")

def main() -> int:
  root = Path(__file__).resolve().parents[1]
  output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / "dist"
  version = json.loads((root / "module.json").read_text(encoding="utf-8"))["version"]

  source_path = output / f"pet-command-source-v{version}.zip"
  install_path = output / f"pet-command-v{version}.zip"
  documentation_path = output / f"pet-command-documentation-v{version}.zip"
  for path in (source_path, install_path, documentation_path):
    if not path.is_file():
      raise AssertionError(f"Missing archive: {path}")

  source = strip_root(entries(source_path), f"pet-command-source-v{version}")
  install = strip_root(entries(install_path), "pet-command")
  documentation = strip_root(entries(documentation_path), f"pet-command-documentation-v{version}")

  for name in install:
    top = name.split("/", 1)[0]
    if top not in INSTALL_TOP_LEVEL:
      raise AssertionError(f"Installation archive contains non-runtime entry: {name}")
  if "module.json" not in install or "scripts/main.mjs" not in install:
    raise AssertionError("Installation archive is missing required runtime files")
  install_manifest = json.loads(install["module.json"].decode("utf-8"))
  if install_manifest["version"] != version:
    raise AssertionError("Installation manifest version mismatch")
  if install_manifest.get("esmodules") != ["scripts/main.mjs"]:
    raise AssertionError("Installation manifest does not declare the hardened .mjs entrypoint")
  if any(name.endswith(".js") for name in install if name.startswith("scripts/")):
    raise AssertionError("Installation archive contains ambiguous .js runtime modules")
  verify_install_module_graph(install, install_manifest["esmodules"][0])

  missing_documentation = sorted(DOCUMENTATION_REQUIRED - documentation.keys())
  if missing_documentation:
    raise AssertionError(f"Documentation archive is missing: {missing_documentation}")

  for name, content in install.items():
    if source.get(name) != content:
      raise AssertionError(f"Runtime file differs between source and installation archives: {name}")

  with tempfile.TemporaryDirectory(prefix="pet-command-rebuild-") as temporary:
    rebuild = Path(temporary)
    subprocess.run([sys.executable, str(root / "tools/build_release.py"), str(rebuild)], check=True, stdout=subprocess.PIPE, text=True)
    for original in (source_path, install_path, documentation_path):
      rebuilt = rebuild / original.name
      if sha256(original) != sha256(rebuilt):
        raise AssertionError(f"Non-deterministic rebuild: {original.name}")

  print("Source archive integrity and root: PASS")
  print("Installation-only allowlist, manifest, and recursive ESM graph: PASS")
  print("Documentation evidence completeness: PASS")
  print("Source/install runtime byte parity: PASS")
  print("Deterministic two-pass rebuild: PASS")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
