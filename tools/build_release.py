#!/usr/bin/env python3
"""Build deterministic source, installation, and documentation ZIP archives."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import zipfile

FIXED_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
INSTALL_DIRECTORIES = ("lang", "scripts", "styles")
INSTALL_FILES = ("LICENSE", "README.md", "module.json")
DOCUMENTATION_DIRECTORIES = ("docs", "reports")
DOCUMENTATION_FILES = ("CHANGELOG.md", "LICENSE", "README.md")
EXCLUDED_PARTS = {".git", "dist", "__pycache__", "node_modules"}


def all_files(root: Path) -> list[Path]:
  """Return every source file that belongs in the reproducible project archive."""
  return sorted(
    path
    for path in root.rglob("*")
    if path.is_file()
    and not any(part in EXCLUDED_PARTS for part in path.relative_to(root).parts)
    and path.suffix != ".pyc"
  )


def selected_files(root: Path, directories: tuple[str, ...], files: tuple[str, ...]) -> list[Path]:
  """Return files from an explicit release allowlist."""
  selected: list[Path] = []
  for name in files:
    path = root / name
    if path.is_file():
      selected.append(path)
  for name in directories:
    directory = root / name
    if directory.is_dir():
      selected.extend(path for path in directory.rglob("*") if path.is_file())
  return sorted(selected)


def write_zip(root: Path, destination: Path, archive_root: str, files: list[Path]) -> None:
  """Write one deterministic ZIP archive from an explicit file list."""
  with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
      relative = path.relative_to(root).as_posix()
      info = zipfile.ZipInfo(f"{archive_root}/{relative}", FIXED_TIMESTAMP)
      info.compress_type = zipfile.ZIP_DEFLATED
      info.external_attr = (0o755 if path.suffix == ".py" else 0o644) << 16
      archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def sha256(path: Path) -> str:
  """Calculate a SHA-256 digest without loading the complete archive into memory."""
  digest = hashlib.sha256()
  with path.open("rb") as handle:
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
      digest.update(chunk)
  return digest.hexdigest()


def main() -> int:
  root = Path(__file__).resolve().parents[1]
  manifest = json.loads((root / "module.json").read_text(encoding="utf-8"))
  version = manifest["version"]
  output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / "dist"
  output.mkdir(parents=True, exist_ok=True)

  source_zip = output / f"pet-command-source-v{version}.zip"
  install_zip = output / f"pet-command-v{version}.zip"
  documentation_zip = output / f"pet-command-documentation-v{version}.zip"
  checksum_path = output / f"pet-command-v{version}.sha256"
  for path in (source_zip, install_zip, documentation_zip, checksum_path):
    path.unlink(missing_ok=True)

  write_zip(root, source_zip, f"pet-command-source-v{version}", all_files(root))
  write_zip(
    root,
    install_zip,
    "pet-command",
    selected_files(root, INSTALL_DIRECTORIES, INSTALL_FILES),
  )
  write_zip(
    root,
    documentation_zip,
    f"pet-command-documentation-v{version}",
    selected_files(root, DOCUMENTATION_DIRECTORIES, DOCUMENTATION_FILES),
  )

  archives = (source_zip, install_zip, documentation_zip)
  checksum_path.write_text(
    "".join(f"{sha256(path)}  {path.name}\n" for path in archives),
    encoding="utf-8",
  )

  for path in (*archives, checksum_path):
    print(path)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
