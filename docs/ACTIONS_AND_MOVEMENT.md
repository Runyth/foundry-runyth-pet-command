# Actions, Targets, and Movement — v1.3.0

## Command targets are not random-behaviour targets

A **command target** belongs to the command being issued. A **random-behaviour target pool** is consulted only for the separate random reaction, normally after obedience fails. The two concepts remain independent.

Commands that do not use a target disable the target selector. Owner-targeted commands resolve the owner automatically. Required-target commands cannot be rolled without a target.

## Default random target pools

For newly created pet profiles, all five pools are enabled by default, including **party members**:

| Pool | New-profile default |
| --- | --- |
| Owner | Enabled |
| Party members | Enabled |
| NPCs | Enabled |
| Hostile tokens | Enabled |
| Currently targeted tokens | Enabled |

Existing profiles retain their saved pool choices during upgrade.

## Player-selectable random target pools

The GM can enable `playerBehaviourTargetsEnabled` on a specific owner–pet relationship from the Relationships table. When enabled, the owner sees the target-pool checkboxes in the player panel. The selection applies to the current panel/command flow only and does not mutate the pet profile.

The GM-side socket resolver normalizes and accepts submitted pools only when that exact relationship grants permission. Otherwise submitted pool data is discarded and the pet profile's defaults are used. Owner Perspective is privileged and may always choose these pools.

## Successful-command movement

| Command | Target mode | Movement |
| --- | --- | --- |
| Come | Owner | Toward owner |
| Stay | None | None |
| Heel | Owner | Toward owner |
| Quiet | None | None |
| Release | None | None |
| Fetch | Required | Toward target |
| Guard | Optional; owner fallback | Toward effective target |
| Search | None | Short local movement |
| Track | Required | Toward target |
| Distract | Required | Toward target |
| Retreat | Owner | Toward owner |
| Attack | Required | Toward target, then configured attack |
| Move | Required | Toward target |

Movement runs only after successful obedience and only when both the global movement setting and the pet profile's movement setting are enabled.

## Random-reaction movement

The twenty behavior entries retain their existing movement metadata. Movement-capable outcomes include short/medium wandering, circles, movement toward the owner, movement behind the owner, movement toward a target, and movement away from a target.

Aggressive target reactions such as **Chase target**, **Threaten target**, and **Snap at target** can therefore move toward a randomly chosen party member, NPC, hostile token, owner, or targeted token according to the enabled pools.

Random **Snap at target** remains behaviour only. It does not silently invoke D&D 5e attacks or damage.

## Foundry v13 movement pipeline

Runyth Pet Command uses the following sequence:

1. Resolve pet, owner, and effective target tokens in the current Scene.
2. Calculate a token-size-aware destination.
3. If approaching another token, stop adjacent to its projected edge rather than intentionally overlapping it.
4. If `Token.findMovementPath` is available, request a constrained route with walls and movement costs respected.
5. Pass routed waypoints to `TokenDocument.move`.
6. Await the token movement animation when Foundry exposes one.
7. Compare pre/post coordinates to distinguish full, partial, rejected, and no-op movement.
8. Only after command movement finishes does a successful **Attack** invoke the configured D&D 5e attack activity.

If pathfinding is unavailable or fails to produce a route, Runyth Pet Command lets `TokenDocument.move` perform Foundry's own constrained movement. A document-update fallback is retained only for environments lacking `TokenDocument.move`.

## Reliability boundaries

Runyth Pet Command does not bypass locked walls, collision rules, movement costs, Scene bounds, or permissions enforced by Foundry/other modules. A constrained route may therefore move only part of the requested distance or be rejected. These outcomes are recorded rather than being disguised as successful full movement.
