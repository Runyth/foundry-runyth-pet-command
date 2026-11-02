import assert from "node:assert/strict";
import test from "node:test";
import { ACTIONS, ATTITUDE_PRESETS, DEFAULT_CONFIG } from "../scripts/constants.mjs";
import { buildD20Slots, normalizeConfig, normalizeState, validateImportEnvelope } from "../scripts/model.mjs";

test("default failure XP exceeds success XP", () => {
  assert.ok(DEFAULT_CONFIG.failureXp > DEFAULT_CONFIG.successXp);
});

test("zero-weight actions receive no d20 slots when other weights exist", () => {
  const weights = { ...ATTITUDE_PRESETS.docile.weights, "snap-at-target": 0 };
  assert.ok(!buildD20Slots(weights).includes("snap-at-target"));
});



test("weighted allocation remains a valid d20 table across varied inputs", () => {
  const ids = new Set(ACTIONS.map((action) => action.id));
  for (let sample = 0; sample < 100; sample += 1) {
    const weights = Object.fromEntries(ACTIONS.map((action, index) => [action.id, (sample * 17 + index * 13) % 23]));
    const slots = buildD20Slots(weights);
    assert.equal(slots.length, 20);
    assert.ok(slots.every((id) => ids.has(id)));
  }
});

test("normalization clamps malformed configuration", () => {
  const config = normalizeConfig({ minimumDc: -100, maximumDc: 100, curveShape: 0, backupLimit: 999 });
  assert.equal(config.minimumDc, 1);
  assert.equal(config.maximumDc, 30);
  assert.equal(config.curveShape, 0.1);
  assert.equal(config.backupLimit, 20);
});

test("terminated state and manual obedience survive normalization", () => {
  const state = normalizeState({
    schemaVersion: 1,
    pets: { "Actor.pet": { actorUuid: "Actor.pet", nameSnapshot: "Dog", attitude: "docile" } },
    relationships: {
      r: {
        id: "r",
        petActorUuid: "Actor.pet",
        ownerActorUuid: "Actor.owner",
        petNameSnapshot: "Dog",
        ownerNameSnapshot: "Owner",
        xp: 12,
        manualObedience: 77,
        status: "terminated",
        terminationReason: `  ${"x".repeat(300)}  `
      }
    },
    history: []
  });
  assert.equal(state.relationships.r.status, "terminated");
  assert.equal(state.relationships.r.manualObedience, 77);
});

test("future export schemas are rejected", () => {
  assert.throws(() => validateImportEnvelope({ state: { schemaVersion: 99 } }), /supports schema/);
});
