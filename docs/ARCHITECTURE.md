# Runyth Pet Command v1.3.0 Architecture

## State model

Schema version: **3**.

- `pets[actorUuid]`: pet-wide profile, including attitude, action weights, random-target defaults, movement flag, and default attack selection.
- `relationships[id]`: owner-specific XP/obedience/lifecycle plus `playerBehaviourTargetsEnabled`.
- `history[]`: bounded command, behaviour, attack, and administration events.

The v2→v3 normalization adds `playerBehaviourTargetsEnabled: false` to legacy relationships and preserves all other stored values.

## Permission model

Ordinary player command requests remain GM-authoritative over the module socket. The sender must control the owner Actor and the relationship must be active. Custom behavior target pools are accepted only if that exact relationship has `playerBehaviourTargetsEnabled` enabled.

GM/Assistant GM Owner Perspective resolves through the privileged local path but verifies that the chosen relationship belongs to the selected owner Actor. It does not mutate Foundry ownership or impersonate another user.

## Movement model

`movement.mjs` is shared by command success and random behavior. It resolves target semantics, calculates token-size-aware waypoints, attempts Foundry v13 token pathfinding, executes `TokenDocument.move`, awaits animation, and reports actual displacement.

Movement is intentionally external to the state mutation. The command sequence performs rolls/movement/attack workflows first and then persists relationship/history changes through one world-setting transaction. This avoids a second state write merely because a token moved.

## Rendering and performance

- canonical normalized state/config caches;
- weakly cached sorted relationship/profile views;
- Actor caches invalidated by Actor document hooks;
- animation-frame-coalesced rerenders;
- no polling or MutationObservers;
- transient delegated target-pool selections live only inside the player-panel instance.

## Runtime loading

All browser modules use explicit `.mjs` extensions and are recursively validated from `scripts/main.mjs` before packaging.
