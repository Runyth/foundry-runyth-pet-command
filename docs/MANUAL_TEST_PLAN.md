# Pet Command v1.3.0 Manual Foundry Test Plan

Use Foundry v13 with a cloned/test world.

## Upgrade regression

1. Install v1.3.0 over a world with existing v1.2.0 relationships.
2. Confirm XP, manual obedience, profiles, history, termination state, target pools, backups, and attack selections remain intact.
3. Confirm existing relationships default **Player behaviour targets** to disabled.
4. Create a new pet profile and confirm **Party members** is checked by default.

## Delegated player target choices

1. Log in as GM and a player controlling an owner Actor.
2. With delegation disabled, confirm the player cannot see random-target pool checkboxes.
3. Enable **Player behaviour targets** for that relationship.
4. Confirm checkboxes appear without giving access to XP/profile administration.
5. Toggle pools, issue a failing command, and confirm the random target comes only from eligible checked pools.
6. Disable delegation and confirm the controls disappear and pet-profile defaults apply again.
7. Repeat from GM/Assistant-GM Owner Perspective and confirm target controls are available.

## Successful command movement

Place pet and owner/targets several squares apart. Verify:

- Come/Heel/Retreat move toward owner.
- Fetch/Track/Distract/Move move toward selected target.
- Guard moves toward target or owner fallback.
- Search makes a short local movement.
- Stay/Quiet/Release do not move.
- Attack moves toward target and only then opens/executes the configured D&D 5e attack workflow.

## Geometry and path constraints

1. Test 1×1 and larger pet/target tokens; approaching pets should stop adjacent without deliberate overlap.
2. Start a pet already adjacent; it should not overshoot or move through the target.
3. Place walls between pet and target; verify movement follows a valid Foundry route when one exists.
4. Block all valid routes; verify Pet Command does not force the token through the wall.
5. Test terrain/movement-cost constraints supplied by the world/system/modules.
6. Verify partial constrained movement is reported as partial rather than rejected.

## Random reactions

Force/weight movement reactions such as Chase, Threaten, Snap, Run Away, Wander, and Run Circle. Verify the token physically moves using the same constraints. Confirm random Snap does not automatically make a D&D attack or apply damage.

## Multiplayer authority

Attempt to submit custom target pools from a relationship whose delegation is disabled. Confirm the active GM ignores the custom pools. Confirm only controlled owner relationships can be commanded by an ordinary player.
