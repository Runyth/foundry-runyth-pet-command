// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { ATTITUDE_PRESETS, DEFAULT_CONFIG } from "../scripts/constants.mjs";
import { buildD20Slots, createEmptyState, normalizeConfig, normalizeState } from "../scripts/model.mjs";
import { PetCommandStore } from "../scripts/store.mjs";

function withMockGame(callback) {
  const previousGame = globalThis.game;
  const values = new Map([
    ["runyth-pet-command.configuration", { ...DEFAULT_CONFIG }],
    ["runyth-pet-command.state", createEmptyState("2026-08-03T00:00:00.000Z")],
    ["runyth-pet-command.backups", { entries: [] }],
  ]);
  const writes = [];
  globalThis.game = {
    user: { isGM: true },
    world: { id: "test", title: "Test" },
    settings: {
      get: (namespace, key) => values.get(`${namespace}.${key}`),
      async set(namespace, key, value) {
        writes.push({ namespace, key, value });
        values.set(`${namespace}.${key}`, value);
        return value;
      },
    },
  };
  return Promise.resolve(callback({ writes })).finally(() => {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  });
}

test("normalized configuration and state are reused on repeated reads", () => {
  const configuration = normalizeConfig({ ...DEFAULT_CONFIG });
  assert.strictEqual(normalizeConfig(configuration), configuration);

  const state = normalizeState(createEmptyState(), configuration);
  assert.strictEqual(normalizeState(state, configuration), state);
});

test("unchanged weighted d20 tables reuse their frozen allocation", () => {
  const weights = { ...ATTITUDE_PRESETS.playful.weights };
  const first = buildD20Slots(weights);
  const second = buildD20Slots(weights);
  assert.strictEqual(second, first);
  assert.equal(Object.isFrozen(first), true);

  weights.wander += 1;
  assert.notStrictEqual(buildD20Slots(weights), first);
});

test("store getters use cached canonical data and snapshots remain isolated", async () => {
  await withMockGame(async ({ writes }) => {
    const store = new PetCommandStore();
    assert.strictEqual(store.state, store.state);
    assert.strictEqual(store.configuration, store.configuration);

    const snapshot = store.snapshotState();
    assert.notStrictEqual(snapshot, store.state);
    snapshot.revision = 999;
    assert.equal(store.state.revision, 0);

    await store.mutate((draft) => {
      draft.pets["Actor.pet"] = { actorUuid: "Actor.pet", actorId: "pet", nameSnapshot: "Pet" };
      draft.relationships.one = {
        id: "one",
        petActorUuid: "Actor.pet",
        petActorId: "pet",
        petNameSnapshot: "Pet",
        ownerActorUuid: "Actor.owner",
        ownerActorId: "owner",
        ownerNameSnapshot: "Owner",
        status: "active",
      };
      draft.history.push({ id: "one" });
    });
    assert.equal(writes.filter((entry) => entry.key === "state").length, 1);
    assert.equal(store.state.history.length, 1);

    const relationships = store.snapshotRelationships();
    const pets = store.snapshotPetProfiles();
    assert.equal(relationships.length, 1);
    assert.equal(pets.length, 1);
    relationships[0].petNameSnapshot = "Changed";
    pets[0].nameSnapshot = "Changed";
    assert.equal(store.state.relationships.one.petNameSnapshot, "Pet");
    assert.equal(store.state.pets["Actor.pet"].nameSnapshot, "Pet");
  });
});
