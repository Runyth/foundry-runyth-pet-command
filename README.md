# Runyth Pet Command v1.3.0 — Delegated Behaviour Targets & Reliable Movement

**Runyth Pet Command** manages party pets in and outside combat in Foundry VTT v13. Version 1.3.0 is additive: the existing GM Manager, player panel, Owner Perspective, relationship XP model, random behaviour system, exports, and D&D 5e attack integration remain intact.

## Model

Runyth Pet Command deliberately separates:

1. **Pet profile** — attitude, weighted d20 random behaviours, GM-owned default random-target pools, movement enablement, and optional default D&D 5e attack.
2. **Pet–owner relationship** — XP, automatic/manual obedience, history, active/terminated state, and whether that owner Actor may choose random-behaviour target pools from the player panel.

A pet can have several independent owners. Commands and XP are always attributed to the selected relationship.

## Core workflow

1. Register a pet Actor or selected pet token.
2. Add one or more owner Actors.
3. Select the owner–pet relationship that is issuing the command.
4. Choose a command and its target when applicable.
5. Roll obedience against the displayed DC.
6. On failure, optionally resolve a separate weighted d20 random behaviour.
7. When movement is applicable and enabled, Runyth Pet Command moves the pet using Foundry's token movement APIs.
8. A successful explicit **Attack** command moves first, then invokes the configured D&D 5e attack activity.

## Random-behaviour targets

New pet profiles enable these target pools by default:

- owner;
- **party members**;
- NPCs;
- hostile tokens;
- currently targeted tokens.

The GM may change the pet profile defaults at any time. Existing pet profiles retain their already-saved target-pool choices during the v1.3.0 upgrade.

### Delegating target choices to a player Actor

In **Relationships**, the GM can enable **Player behaviour targets** for an individual owner–pet relationship. That owner sees the random-behaviour target checkboxes in the lightweight player command panel and can choose which pools apply to that command's possible failure behaviour.

These choices are deliberately transient. They do not rewrite the pet profile defaults. The resolving GM revalidates the submitted target pools before rolling, so enabling the UI does not grant general module administration rights.

GM and Assistant GM users using **Owner Perspective** always see these target-pool controls for the selected owner Actor.

## Reliable automatic movement

Version 1.3.0 extends movement to successful commands as well as random reactions.

| Command | Automatic movement after success |
| --- | --- |
| Come, Heel, Retreat | Toward owner |
| Fetch, Track, Distract, Attack, Move | Toward selected command target |
| Guard | Toward selected target, or owner fallback |
| Search | Short local movement |
| Stay, Quiet, Release | None |

Movement uses token-size-aware destinations, Foundry v13 pathfinding when available, `TokenDocument.move`, wall/movement-cost constraints, and animation completion. Pets approaching a creature stop adjacent rather than deliberately overlapping it. If Foundry constrains a route and the pet moves only part of the intended distance, that is recorded as **partial movement** instead of a false rejection.

Random movements such as wandering, circles, fleeing, approaching, chasing, threatening, or snapping use the same movement executor.

## Attack boundary

Only a successful explicit **Attack** command invokes the configured D&D 5e default attack. The pet moves toward the selected target first and then runs the ordinary D&D 5e attack workflow. Random aggressive behaviour such as **Snap at target** can move toward the randomly selected target but does not automatically roll an attack or apply damage.

## Player and privileged interfaces

- **Player panel:** available when player commands are enabled; shows only active relationships whose owner Actor the user controls.
- **Owner Perspective:** GM/Assistant GM can operate the player-style command surface as a selected owner Actor without altering Foundry ownership or impersonating another user.
- **GM Manager:** full relationship, pet-profile, XP, recovery, delegation, and configuration controls.

## Data and compatibility

- Foundry VTT: v13
- Runtime: native `.mjs` ES-module graph
- State schema: 3
- Localization: Foundry-native `lang/*.json`; complete English and German
- External services: none
- General pet/relationship behavior: system-agnostic
- Default attack automation: D&D 5e activity workflow

The schema-3 migration adds only the relationship permission `playerBehaviourTargetsEnabled`. Existing relationships default to disabled, and all other data is preserved.

## Installation

The installation archive contains one unversioned module root:

```text
runyth-pet-command-v1.3.0.zip
└── runyth-pet-command/
    └── module.json
```

Replace the complete existing `Data/modules/runyth-pet-command` directory, restart Foundry, enable **Runyth Pet Command**, and hard-refresh connected clients after an upgrade.

## Documentation

- `docs/QUICK_START.md`
- `docs/USER_GUIDE.md`
- `docs/ACTIONS_AND_MOVEMENT.md`
- `docs/CONFIGURATION.md`
- `docs/DATA_AND_RECOVERY.md`
- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/PERFORMANCE_AUDIT.md`
- `docs/CODE_AUDIT.md`
- `docs/MANUAL_TEST_PLAN.md`
- `docs/VALIDATION_REPORT.md`
- `docs/INCREMENTAL_BEST_PRACTICE_CHANGELOG.md`

## Development and reproducible release

```text
npm test
npm run validate
npm run benchmark
python tools/build_release.py
python tools/verify_release.py dist
```

The builder creates separate source, installation-only, and documentation/evidence ZIP archives with deterministic timestamps and file ordering.
