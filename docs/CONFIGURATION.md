# Configuration — v1.3.0

Global configuration remains in Foundry **Configure Settings → Module Settings → Pet Command**.

## Learning and obedience

- success XP
- failure XP
- curve scale
- curve shape
- minimum/maximum DC
- obedience formula
- behavior formula
- automatic behavior on failure

## Movement

- **Movement enabled** — master switch for automatic command/reaction movement.
- **Movement distance** — maximum intended travel for ordinary movement actions.
- **Circle radius** — intended radius for the circle behavior.

Each pet profile also has its own movement-enabled switch. Both switches must permit movement.

## Player commands and attacks

- **Player commands enabled** controls availability of the lightweight player panel.
- **Successful Attack uses default** controls whether an obedient explicit Attack command invokes the configured D&D 5e attack activity after movement.

## Random-target defaults

Random-target pools are pet-profile data rather than global settings. New profiles start with owner, party, NPC, hostile, and targeted-token pools enabled. Existing profile choices are preserved.

## Delegated player target selection

The permission to expose random-target pool choices is relationship data and is changed from the Manager's Relationships table. It is intentionally not a global switch: access can be granted to selected owner Actors/pet relationships only.

## Language

Pet Command follows Foundry's normal **Core Settings → Language Preference** and does not add a module-specific language selector.
