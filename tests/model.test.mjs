// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { ACTIONS, ATTITUDE_PRESETS, COMMANDS, DEFAULT_CONFIG, DEFAULT_TARGET_POOLS, SCHEMA_VERSION } from "../scripts/constants.mjs";
import {
  automatedObedience,
  buildD20Slots,
  createPetProfile,
  createRelationship,
  effectiveObedience,
  mergeStates,
  obedienceDc,
  resolveD20Action,
} from "../scripts/model.mjs";

test("obedience rises monotonically with XP", () => {
  const samples = [0, 1, 5, 10, 20, 40, 80, 160].map((xp) => automatedObedience(xp, DEFAULT_CONFIG));
  assert.deepEqual(samples, [...samples].sort((a, b) => a - b));
  assert.equal(samples[0], 0);
  assert.ok(samples.at(-1) > 90);
});

test("manual obedience overrides and can return to automatic", () => {
  const relationship = { xp: 20, manualObedience: 93 };
  assert.equal(effectiveObedience(relationship), 93);
  relationship.manualObedience = null;
  assert.equal(effectiveObedience(relationship), automatedObedience(20));
});

test("better relationships have lower DCs", () => {
  const weak = obedienceDc({ xp: 0, manualObedience: null });
  const strong = obedienceDc({ xp: 200, manualObedience: null });
  assert.ok(strong < weak);
});

test("d20 table always contains exactly twenty result slots", () => {
  const slots = buildD20Slots(ATTITUDE_PRESETS.aggressive.weights);
  assert.equal(slots.length, 20);
  assert.ok(slots.every((id) => ACTIONS.some((action) => action.id === id)));
});

test("aggressive preset allocates more threatening results than docile preset", () => {
  const aggressive = buildD20Slots(ATTITUDE_PRESETS.aggressive.weights);
  const docile = buildD20Slots(ATTITUDE_PRESETS.docile.weights);
  const threatening = new Set(["chase-target", "threaten-target", "snap-at-target"]);
  const count = (slots) => slots.filter((id) => threatening.has(id)).length;
  assert.ok(count(aggressive) > count(docile));
});

test("roll total selects deterministic action slot", () => {
  const slots = buildD20Slots(ATTITUDE_PRESETS.playful.weights);
  assert.equal(resolveD20Action(1, ATTITUDE_PRESETS.playful.weights).id, slots[0]);
  assert.equal(resolveD20Action(20, ATTITUDE_PRESETS.playful.weights).id, slots[19]);
});

test("multiple owners create independent relationship records", () => {
  const pet = createPetProfile({ actorUuid: "Actor.pet", actorId: "pet", name: "Dog" });
  const first = createRelationship({ id: "r1", pet, owner: { actorUuid: "Actor.a", actorId: "a", name: "A" } });
  const second = createRelationship({ id: "r2", pet, owner: { actorUuid: "Actor.b", actorId: "b", name: "B" } });
  first.xp = 10;
  assert.equal(second.xp, 0);
  assert.equal(first.petActorUuid, second.petActorUuid);
});

test("merge import preserves existing and imported relationships", () => {
  const merged = mergeStates(
    { schemaVersion: 1, pets: {}, relationships: { a: { id: "a", petActorUuid: "Actor.p", ownerActorUuid: "Actor.o", xp: 1 } }, history: [] },
    { schemaVersion: 1, pets: {}, relationships: { b: { id: "b", petActorUuid: "Actor.p", ownerActorUuid: "Actor.q", xp: 2 } }, history: [] },
  );
  assert.deepEqual(Object.keys(merged.relationships).sort(), ["a", "b"]);
});

test("aggressive attitude makes attack easier and heel harder", async () => {
  const { commandDifficulty } = await import("../scripts/model.mjs");
  const attack = COMMANDS.find((command) => command.id === "attack");
  const heel = COMMANDS.find((command) => command.id === "heel");
  assert.ok(commandDifficulty(attack, "aggressive").total < commandDifficulty(attack, "docile").total);
  assert.ok(commandDifficulty(heel, "aggressive").total > commandDifficulty(heel, "docile").total);
});

test("target requirements distinguish quiet from attack", async () => {
  const { commandTargetRequirement } = await import("../scripts/model.mjs");
  const quiet = COMMANDS.find((command) => command.id === "quiet");
  const attack = COMMANDS.find((command) => command.id === "attack");
  assert.equal(commandTargetRequirement(quiet).usesTarget, false);
  assert.equal(commandTargetRequirement(attack).required, true);
});


test("new pet profiles include party members in random target pools by default", () => {
  const pet = createPetProfile({ actorUuid: "Actor.pet-defaults", actorId: "pet-defaults", name: "Dog" });
  assert.equal(DEFAULT_TARGET_POOLS.party, true);
  assert.equal(pet.targetPools.party, true);
});

test("relationship normalization adds delegated behaviour-target permission without altering older data", async () => {
  const { normalizeState } = await import("../scripts/model.mjs");
  const state = normalizeState({
    schemaVersion: 2,
    pets: {},
    relationships: {
      r: { id: "r", petActorUuid: "Actor.pet", ownerActorUuid: "Actor.owner" },
    },
    history: [],
  });
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.relationships.r.playerBehaviourTargetsEnabled, false);
});
