# Data and Recovery — v1.3.0

## Authoritative storage

Pet Command stores authoritative world data in `pet-command.state`, configuration in `pet-command.configuration`, and rolling snapshots in `pet-command.backups`.

The module does not destructively modify Actor system data. Relationships store Actor UUIDs/IDs plus readable name snapshots.

## Schema 3

Version 1.3.0 adds one relationship field:

```json
{
  "playerBehaviourTargetsEnabled": false
}
```

Legacy schema-2 state is normalized automatically. The new permission defaults to disabled; XP, manual obedience, profile target pools, history, lifecycle state, and all other records are preserved.

## Export/import

Every export remains a versioned `pet-command-export` JSON envelope containing `moduleVersion`, `schemaVersion`, world metadata, and the selected state scope. Exports may contain all data, one pet with its relationships, or one relationship with its pet profile.

Merge and replace imports continue to normalize data through the current schema. Future schema versions are rejected rather than guessed.

## Backups

Automatic full snapshots continue before destructive or administratively significant state edits such as relationship changes, manual XP/obedience edits, pet-profile changes, imports, and restoration.

## Cross-world portability

Actor identifiers remain world-specific. Exported records are readable and recoverable across worlds, but Pet Command does not silently relink them to unrelated Actors. Automatic token movement requires matching Actors/tokens in the active Scene.
