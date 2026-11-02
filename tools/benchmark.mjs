// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { performance } from "node:perf_hooks";
import { ATTITUDE_PRESETS, DEFAULT_CONFIG } from "../scripts/constants.mjs";
import { buildD20Slots, normalizeConfig, normalizeState } from "../scripts/model.mjs";

function measure(label, iterations, operation) {
  operation();
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) operation();
  const elapsed = performance.now() - started;
  return { label, iterations, elapsed, perOperationMicroseconds: (elapsed * 1000) / iterations };
}

function largeState() {
  const pets = {};
  const relationships = {};
  const history = [];
  for (let petIndex = 0; petIndex < 200; petIndex += 1) {
    const petUuid = `Actor.pet-${petIndex}`;
    pets[petUuid] = {
      actorUuid: petUuid,
      actorId: `pet-${petIndex}`,
      nameSnapshot: `Pet ${petIndex}`,
      attitude: "playful",
      actionWeights: { ...ATTITUDE_PRESETS.playful.weights },
    };
    for (let ownerIndex = 0; ownerIndex < 5; ownerIndex += 1) {
      const id = `relationship-${petIndex}-${ownerIndex}`;
      relationships[id] = {
        id,
        petActorUuid: petUuid,
        petActorId: `pet-${petIndex}`,
        petNameSnapshot: `Pet ${petIndex}`,
        ownerActorUuid: `Actor.owner-${ownerIndex}`,
        ownerActorId: `owner-${ownerIndex}`,
        ownerNameSnapshot: `Owner ${ownerIndex}`,
        xp: petIndex + ownerIndex,
      };
    }
  }
  for (let index = 0; index < 5000; index += 1) history.push({ id: `history-${index}`, relationshipId: `relationship-${index % 200}-${index % 5}` });
  return { schemaVersion: 3, revision: 1, pets, relationships, history };
}

const configuration = normalizeConfig({ ...DEFAULT_CONFIG, historyLimit: 5000 });
const rawState = largeState();
const normalizedState = normalizeState(rawState, configuration);
const weights = { ...ATTITUDE_PRESETS.playful.weights };
buildD20Slots(weights);

const results = [
  measure("Cached normalized state read", 100_000, () => normalizeState(normalizedState, configuration)),
  measure("Fresh large-state normalization", 100, () => normalizeState(structuredClone(rawState), configuration)),
  measure("Cached weighted d20 table", 100_000, () => buildD20Slots(weights)),
];

for (const result of results) {
  console.log(`${result.label}: ${result.elapsed.toFixed(2)} ms total; ${result.perOperationMicroseconds.toFixed(3)} µs/op (${result.iterations} iterations)`);
}
