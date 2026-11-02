# v1.3.0 Incremental Best-Practice Changes

## UX

- New pet profiles include party members in random target pools by default.
- Delegated target controls appear only where the selected owner relationship permits them.
- Player changes are transient and do not silently rewrite GM configuration.
- Owner Perspective receives the same useful target choices without duplicating administrative controls.

## Security and authority

- Relationship-scoped permission is persisted explicitly.
- Ordinary player socket payloads are revalidated by the resolving GM.
- Unauthorized custom target-pool payloads are ignored rather than trusted.

## Movement

- Successful commands share one movement engine with random reactions.
- Uses Foundry v13 pathfinding and TokenDocument movement APIs.
- Respects walls and movement costs.
- Accounts for token dimensions and adjacent stopping distance.
- Awaits visible movement before explicit Attack execution.
- Distinguishes full, partial, rejected, disabled, missing-target, and no-op movement.

## Data

- Schema 3 is an additive migration with a single boolean relationship field.
- Existing pet target-pool preferences are preserved.
- Existing exports/imports/backups continue through normalization.

## Verification

- Added unit tests for movement geometry, pathfinding, partial movement, delegation, migration, and full command-sequence movement.
- Expanded static validation for new capabilities and architecture requirements.
