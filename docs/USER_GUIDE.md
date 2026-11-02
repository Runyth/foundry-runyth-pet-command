# User Guide — v1.3.0

## GM relationship setup

Every owner–pet pair has independent XP and obedience. In the **Relationships** tab, the GM can additionally toggle **Player behaviour targets** per relationship.

When disabled, the player panel uses the pet profile's GM-defined random-target pools without exposing those checkboxes. When enabled, the owner Actor's player can see and choose the pools for their current command workflow.

This permission is relationship-specific. If one Actor owns several pets, the GM can expose the controls for some relationships and keep them hidden for others.

## Player command panel

The panel contains:

- relationship selector;
- command selector and difficulty/DC explanation;
- command target selector when applicable;
- optionally, random-behaviour target-pool checkboxes;
- Roll Command.

The player cannot edit XP, obedience, pet attitude, action weights, movement configuration, or persistent pet target-pool defaults.

## Owner Perspective

A GM or Assistant GM may select an Actor/token and open Owner Perspective. It behaves like the lightweight player panel but is privileged and always exposes random-behaviour target choices. Commands remain attributed to the selected owner relationship and do not change Foundry Actor ownership.

## Automatic movement

Successful commands now move when their semantics call for movement. Random reactions also use the same hardened movement engine. If an Attack succeeds, movement completes first and the configured D&D 5e attack follows.

If a route is blocked or constrained, Foundry remains authoritative. Pet Command reports a partial or rejected movement instead of forcing the token through invalid geometry.

## Relationship administration

The GM Manager retains all prior controls: manual XP, manual obedience override/reset, relationship termination/restoration/deletion, pet profiles, action weights, exports/imports, and backups.
