# Reproducible Release Build

The source archive includes runtime files, documentation, tests, validation tooling, archive verification, and the deterministic three-archive release builder.

## Requirements

- Python 3.10 or newer
- Node.js 22 or newer

## Validate

```text
npm test
npm run validate
npm run benchmark
```

## Build all release archives

From the extracted source-project root:

```text
python tools/build_release.py
```

The command creates:

```text
dist/pet-command-source-v<version>.zip
dist/pet-command-v<version>.zip
dist/pet-command-documentation-v<version>.zip
dist/pet-command-v<version>.sha256
```

Archive roles:

1. **Source** — complete reproducible project, including runtime code, tests, tools, and documentation.
2. **Installation** — only the non-versioned `pet-command/` runtime tree required by Foundry and manifest-referenced metadata.
3. **Documentation** — documentation, reports, audit material, changelog, incremental best-practice changelog, and captured test evidence.

Files are sorted, ZIP timestamps are fixed, permissions are normalized, and SHA-256 digests are generated automatically.

## Verify archives

```text
python tools/verify_release.py dist
```

Verification checks ZIP integrity, root layout, installation allowlists, required evidence, the exact manifest entrypoint, the complete recursive `.mjs` import graph inside the installation ZIP, absence of runtime `.js` files, runtime byte parity, and a byte-identical second build.
