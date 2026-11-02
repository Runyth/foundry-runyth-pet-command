# Runyth Pet Command v1.3.0 Performance Audit

## Result

The v1.3.0 feature work preserves the v1.1.2+ performance architecture and adds no recurring background work.

## Movement

Pathfinding and token movement are asynchronous Foundry operations and are awaited only when a movement-capable command/reaction actually occurs. No pathfinding is performed during rendering, idle time, or commands that do not move.

Scene-token resolution remains a bounded pass over current placeables. Destination calculations are constant-time. Pathfinding is delegated to Foundry rather than implementing a parallel graph search in module code.

## Player target controls

Delegated random-target choices are stored in an in-memory `Map` scoped to the open player-panel instance. Checkbox changes do not write world settings or force a full render. GM-side normalization is constant-size because the set of target pools is fixed.

## Persistence

A full command sequence still performs one module state mutation. Token movement is a Scene document operation and does not cause an additional relationship-state transaction.

## Existing optimizations retained

- canonical normalized state/config caches;
- memoized weighted d20 tables;
- weakly cached relationship/profile views;
- Actor sort caching;
- frame-coalesced ApplicationV2 refreshes;
- narrow public API snapshots;
- no polling, intervals, artificial delays, or background workers.
