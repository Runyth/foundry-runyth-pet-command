// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
export const MODULE_ID = "runyth-pet-command";
export const MODULE_TITLE = "Runyth Pet Command";
export const MODULE_VERSION = "1.3.0";
export const API_VERSION = "1.3.0";
export const SCHEMA_VERSION = 3;

export const RELATIONSHIP_STATUS = Object.freeze({
  ACTIVE: "active",
  TERMINATED: "terminated",
});

export const DEFAULT_TARGET_POOLS = Object.freeze({
  owner: true,
  party: true,
  npc: true,
  hostile: true,
  targeted: true,
});

export const COMMANDS = Object.freeze([
  { id: "come", labelKey: "PETCOMMAND.Commands.Come", difficulty: -2, targetMode: "owner", movement: "toward-owner" },
  { id: "stay", labelKey: "PETCOMMAND.Commands.Stay", difficulty: -1, targetMode: "none", movement: "none" },
  { id: "heel", labelKey: "PETCOMMAND.Commands.Heel", difficulty: -1, targetMode: "owner", movement: "toward-owner" },
  { id: "quiet", labelKey: "PETCOMMAND.Commands.Quiet", difficulty: 0, targetMode: "none", movement: "none" },
  { id: "release", labelKey: "PETCOMMAND.Commands.Release", difficulty: 0, targetMode: "none", movement: "none" },
  { id: "fetch", labelKey: "PETCOMMAND.Commands.Fetch", difficulty: 1, targetMode: "required", movement: "toward-target" },
  { id: "guard", labelKey: "PETCOMMAND.Commands.Guard", difficulty: 1, targetMode: "optional-owner", movement: "toward-target" },
  { id: "search", labelKey: "PETCOMMAND.Commands.Search", difficulty: 2, targetMode: "none", movement: "random-short" },
  { id: "track", labelKey: "PETCOMMAND.Commands.Track", difficulty: 2, targetMode: "required", movement: "toward-target" },
  { id: "distract", labelKey: "PETCOMMAND.Commands.Distract", difficulty: 2, targetMode: "required", movement: "toward-target" },
  { id: "retreat", labelKey: "PETCOMMAND.Commands.Retreat", difficulty: 2, targetMode: "owner", movement: "toward-owner" },
  { id: "attack", labelKey: "PETCOMMAND.Commands.Attack", difficulty: 3, targetMode: "required", movement: "toward-target" },
  { id: "move", labelKey: "PETCOMMAND.Commands.Move", difficulty: 1, targetMode: "required", movement: "toward-target" },
]);

export const ACTIONS = Object.freeze([
  { id: "freeze", labelKey: "PETCOMMAND.Actions.Freeze", category: "passive", movement: "none" },
  { id: "sit", labelKey: "PETCOMMAND.Actions.Sit", category: "passive", movement: "none" },
  { id: "lie-down", labelKey: "PETCOMMAND.Actions.LieDown", category: "passive", movement: "none" },
  { id: "look-away", labelKey: "PETCOMMAND.Actions.LookAway", category: "passive", movement: "none" },
  { id: "vocalize", labelKey: "PETCOMMAND.Actions.Vocalize", category: "social", movement: "none" },
  { id: "sniff-nearby", labelKey: "PETCOMMAND.Actions.SniffNearby", category: "explore", movement: "random-short" },
  { id: "approach-owner", labelKey: "PETCOMMAND.Actions.ApproachOwner", category: "bond", movement: "toward-owner" },
  { id: "follow-owner", labelKey: "PETCOMMAND.Actions.FollowOwner", category: "bond", movement: "toward-owner" },
  { id: "wander", labelKey: "PETCOMMAND.Actions.Wander", category: "explore", movement: "random-medium" },
  { id: "run-circle", labelKey: "PETCOMMAND.Actions.RunCircle", category: "play", movement: "circle" },
  { id: "run-away", labelKey: "PETCOMMAND.Actions.RunAway", category: "fear", movement: "away-from-target" },
  { id: "hide-behind-owner", labelKey: "PETCOMMAND.Actions.HideBehindOwner", category: "fear", movement: "behind-owner" },
  { id: "guard-owner", labelKey: "PETCOMMAND.Actions.GuardOwner", category: "guard", movement: "toward-owner" },
  { id: "investigate-target", labelKey: "PETCOMMAND.Actions.InvestigateTarget", category: "explore", movement: "toward-target" },
  { id: "fetch-target", labelKey: "PETCOMMAND.Actions.FetchTarget", category: "play", movement: "toward-target" },
  { id: "chase-target", labelKey: "PETCOMMAND.Actions.ChaseTarget", category: "aggressive", movement: "toward-target" },
  { id: "threaten-target", labelKey: "PETCOMMAND.Actions.ThreatenTarget", category: "aggressive", movement: "toward-target-short" },
  { id: "snap-at-target", labelKey: "PETCOMMAND.Actions.SnapAtTarget", category: "aggressive", movement: "toward-target-short" },
  { id: "jump-on-target", labelKey: "PETCOMMAND.Actions.JumpOnTarget", category: "play", movement: "toward-target" },
  { id: "seek-affection", labelKey: "PETCOMMAND.Actions.SeekAffection", category: "bond", movement: "toward-owner" },
]);

export const COMMAND_BY_ID = Object.freeze(Object.fromEntries(COMMANDS.map((command) => [command.id, command])));
export const ACTION_BY_ID = Object.freeze(Object.fromEntries(ACTIONS.map((action) => [action.id, action])));

const weights = (values) => Object.freeze(Object.fromEntries(ACTIONS.map((action, index) => [action.id, values[index] ?? 0])));
const commandModifiers = (values) => Object.freeze(Object.fromEntries(COMMANDS.map((command, index) => [command.id, values[index] ?? 0])));

export const ATTITUDE_PRESETS = Object.freeze({
  docile: Object.freeze({
    labelKey: "PETCOMMAND.Attitudes.Docile",
    weights: weights([2, 6, 5, 2, 1, 2, 6, 5, 1, 1, 1, 3, 4, 2, 2, 1, 1, 1, 2, 6]),
    commandModifiers: commandModifiers([-1, -1, -1, -1, 0, 0, 0, 1, 1, 1, -1, 2, 0]),
  }),
  playful: Object.freeze({
    labelKey: "PETCOMMAND.Attitudes.Playful",
    weights: weights([1, 2, 2, 1, 3, 4, 4, 4, 4, 7, 1, 1, 2, 4, 7, 6, 2, 1, 7, 5]),
    commandModifiers: commandModifiers([0, 1, 0, 1, 1, -2, 1, -1, 0, -1, 0, 1, 0]),
  }),
  cautious: Object.freeze({
    labelKey: "PETCOMMAND.Attitudes.Cautious",
    weights: weights([7, 3, 3, 5, 3, 4, 4, 3, 2, 1, 7, 7, 4, 3, 1, 1, 3, 2, 1, 3]),
    commandModifiers: commandModifiers([-1, -1, 0, -1, 0, 1, 0, 0, 0, 2, -2, 2, 1]),
  }),
  aggressive: Object.freeze({
    labelKey: "PETCOMMAND.Attitudes.Aggressive",
    weights: weights([1, 1, 1, 1, 4, 2, 2, 2, 2, 2, 2, 1, 5, 3, 1, 6, 7, 8, 4, 1]),
    commandModifiers: commandModifiers([1, 1, 2, 2, 1, 1, -1, 0, -1, -1, 2, -4, 0]),
  }),
  independent: Object.freeze({
    labelKey: "PETCOMMAND.Attitudes.Independent",
    weights: weights([2, 2, 2, 6, 2, 6, 1, 1, 7, 2, 3, 2, 2, 6, 2, 3, 3, 2, 2, 1]),
    commandModifiers: commandModifiers([2, 1, 2, 1, -1, 1, 1, -1, -1, 0, 1, 0, 0]),
  }),
});

export const DEFAULT_CONFIG = Object.freeze({
  successXp: 0.25,
  failureXp: 1,
  curveScale: 40,
  curveShape: 1.2,
  minimumDc: 4,
  maximumDc: 18,
  obedienceFormula: "1d20",
  behaviourFormula: "1d20",
  autoBehaviourOnFailure: true,
  movementEnabled: true,
  movementDistanceSquares: 4,
  circleRadiusSquares: 2,
  chatMode: "gmroll",
  playerCommandsEnabled: true,
  successfulAttackUsesDefault: true,
  historyLimit: 300,
  backupLimit: 5,
});

export const BOND_LEVELS = Object.freeze([
  { minimum: 0, labelKey: "PETCOMMAND.BondLevels.Unfamiliar" },
  { minimum: 20, labelKey: "PETCOMMAND.BondLevels.Tolerant" },
  { minimum: 40, labelKey: "PETCOMMAND.BondLevels.Familiar" },
  { minimum: 60, labelKey: "PETCOMMAND.BondLevels.Bonded" },
  { minimum: 80, labelKey: "PETCOMMAND.BondLevels.Devoted" },
]);
