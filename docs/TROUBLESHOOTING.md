# Troubleshooting — v1.3.0

## Pet does not move

Check, in order:

1. global **Movement enabled** is on;
2. the pet profile's movement switch is on;
3. the pet Actor has a token in the active Scene;
4. the command/reaction actually has a movement type;
5. required command/random targets exist;
6. Foundry walls, Scene bounds, movement costs, elevation, or another module are not rejecting the route.

A result marked **partial** means Foundry moved the token but constrained the requested route. **Rejected** means no actual coordinate change was observed.

## Attack succeeds but no attack roll

Confirm **Successful Attack uses default** is enabled and the pet profile has a usable D&D 5e Attack activity or a configured default attack. Pet Command moves first and then delegates to the D&D 5e activity workflow.

## Player cannot see behavior target pools

The GM must enable **Player behaviour targets** on that exact owner–pet relationship. The permission is not global. Owner Perspective always exposes the controls to GM/Assistant GM users.

## Party checkbox is not automatically enabled on an older pet

Version 1.3.0 changes the default for newly created pet profiles. Existing saved target-pool choices are intentionally preserved to avoid overwriting a GM's earlier configuration. Enable **Party members** manually on that existing profile if desired.

## Upgrade/runtime caching

Replace the complete `Data/modules/pet-command` directory with the new installation ZIP, restart Foundry, and hard-refresh connected browsers. The module runtime is an explicit `.mjs` graph beginning at `scripts/main.mjs`.
