# Runyth Pet Command v1.3.0 Feature Release Report

## Objective

Add delegated random-behaviour target selection and make automatic token movement reliable for both successful commands and random reactions without regressing existing command, relationship, Owner Perspective, persistence, or attack behavior.

## Delivered

- Party members enabled by default for new pet random-target profiles.
- Per-relationship GM permission for player-visible random-target checkboxes.
- Transient player selections with GM-side authorization and normalization.
- Owner Perspective target-pool selection.
- Automatic successful-command movement.
- Shared Foundry-v13-aware command/reaction movement executor.
- Token-size-aware adjacency, pathfinding, constrained movement, animation awaiting, and partial movement reporting.
- Attack movement before D&D 5e attack execution.
- Schema 3 migration preserving previous data.

## Compatibility decisions

Random aggressive behavior remains non-damaging and does not silently execute D&D attacks. Foundry's collision/path constraints remain authoritative. Existing pet-profile random-target choices are not forcibly changed during migration; the new party-member default applies to newly created profiles.

## Verification

- Automated tests: 51 passed, 0 failed.
- Static validation: passed.
- Clean-extracted source tests and validation: passed.
- Clean installation entrypoint evaluation: passed.
- Installation/source runtime parity: passed.
- Deterministic archive rebuild: passed.
