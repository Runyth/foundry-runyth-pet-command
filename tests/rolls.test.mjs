// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { ACTIONS, DEFAULT_CONFIG } from "../scripts/constants.mjs";
import { createPetProfile, createRelationship, normalizeState } from "../scripts/model.mjs";
import { PetCommandRollService } from "../scripts/rolls.mjs";

class MockRoll {
  static totals = [1, 7];

  constructor(formula) {
    this.formula = formula;
    this.total = 0;
  }

  async evaluate() {
    this.total = MockRoll.totals.shift() ?? 1;
    return this;
  }

  async toMessage() {
    return null;
  }
}

test("failed command sequence persists obedience and behaviour in one mutation", async () => {
  const previous = {
    Roll: globalThis.Roll,
    game: globalThis.game,
    canvas: globalThis.canvas,
    foundry: globalThis.foundry,
  };
  globalThis.Roll = MockRoll;
  globalThis.foundry = { utils: { randomID: () => `id-${Math.random()}` } };
  globalThis.game = {
    user: { id: "gm", isGM: true, targets: new Set() },
    users: { contents: [{ id: "gm", isGM: true }] },
    i18n: { format: (key) => key, localize: (key) => key },
  };
  globalThis.canvas = { tokens: { placeables: [], get: () => null } };

  try {
    const profile = createPetProfile({ actorUuid: "Actor.pet", actorId: "pet", name: "Dog" });
    const relationship = createRelationship({
      id: "relationship",
      pet: profile,
      owner: { actorUuid: "Actor.owner", actorId: "owner", name: "Owner" },
    });
    let state = normalizeState({
      schemaVersion: 2,
      revision: 0,
      pets: { [profile.actorUuid]: profile },
      relationships: { [relationship.id]: relationship },
      history: [],
    });
    let mutationCount = 0;
    const store = {
      configuration: { ...DEFAULT_CONFIG, movementEnabled: false },
      get state() {
        return state;
      },
      async mutate(mutator) {
        mutationCount += 1;
        const draft = structuredClone(state);
        await mutator(draft);
        state = normalizeState(draft, this.configuration);
        return { state };
      },
    };

    MockRoll.totals = [1, 7];
    const service = new PetCommandRollService(store);
    const result = await service.rollCommandSequence({
      relationshipId: relationship.id,
      commandId: "come",
      includeBehaviour: true,
      executeMovement: false,
      postToChat: false,
    });

    assert.equal(result.obedience.outcome, "failure");
    assert.ok(result.behaviour);
    assert.equal(mutationCount, 1);
    assert.equal(state.history.length, 2);
    assert.equal(state.relationships.relationship.commandCount, 1);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test("successful movement-capable command moves before one persistence transaction", async () => {
  const previous = {
    Roll: globalThis.Roll,
    game: globalThis.game,
    canvas: globalThis.canvas,
    foundry: globalThis.foundry,
  };
  globalThis.Roll = MockRoll;
  globalThis.foundry = { utils: { randomID: () => `id-${Math.random()}` } };
  globalThis.game = {
    user: { id: "gm", isGM: true, targets: new Set() },
    users: { contents: [{ id: "gm", isGM: true }] },
    i18n: { format: (key) => key, localize: (key) => key },
  };

  const makeToken = ({ id, x }) => {
    const document = {
      id,
      uuid: `Scene.test.Token.${id}`,
      actorId: id,
      x,
      y: 0,
      width: 1,
      height: 1,
      getSize() {
        return { width: 100, height: 100 };
      },
      getCenterPoint() {
        return { x: this.x + 50, y: this.y + 50 };
      },
      async move(waypoints) {
        const destination = waypoints.at(-1);
        this.x = destination.x;
        this.y = destination.y;
        return true;
      },
    };
    return { id, document, actor: { id }, movementAnimationPromise: null };
  };

  const petToken = makeToken({ id: "pet", x: 0 });
  const ownerToken = makeToken({ id: "owner", x: 600 });
  globalThis.canvas = {
    grid: { size: 100 },
    dimensions: { sceneRect: { x: 0, y: 0, width: 2000, height: 2000 } },
    scene: { width: 2000, height: 2000 },
    tokens: {
      placeables: [petToken, ownerToken],
      get: (id) => [petToken, ownerToken].find((token) => token.id === id) ?? null,
    },
  };

  try {
    const profile = createPetProfile({ actorUuid: "Actor.pet", actorId: "pet", name: "Dog" });
    const relationship = createRelationship({
      id: "relationship",
      pet: profile,
      owner: { actorUuid: "Actor.owner", actorId: "owner", name: "Owner" },
    });
    let state = normalizeState({
      schemaVersion: 3,
      revision: 0,
      pets: { [profile.actorUuid]: profile },
      relationships: { [relationship.id]: relationship },
      history: [],
    });
    let mutationCount = 0;
    const store = {
      configuration: { ...DEFAULT_CONFIG, movementEnabled: true },
      get state() {
        return state;
      },
      async mutate(mutator) {
        mutationCount += 1;
        const draft = structuredClone(state);
        await mutator(draft);
        state = normalizeState(draft, this.configuration);
        return { state };
      },
    };

    MockRoll.totals = [20];
    const service = new PetCommandRollService(store);
    const result = await service.rollCommandSequence({
      relationshipId: relationship.id,
      commandId: "come",
      postToChat: false,
    });

    assert.equal(result.obedience.outcome, "success");
    assert.equal(result.commandMovement.moved, true);
    assert.ok(petToken.document.x > 0, "the pet token should move toward the owner");
    assert.equal(mutationCount, 1, "movement must not introduce an extra world-state write");
    assert.deepEqual(state.history.at(-1).commandMovement, { moved: true, reason: "moved" });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test("failed command random reaction can select a party member and move toward them", async () => {
  const previous = {
    Roll: globalThis.Roll,
    game: globalThis.game,
    canvas: globalThis.canvas,
    foundry: globalThis.foundry,
  };
  globalThis.Roll = MockRoll;
  globalThis.foundry = { utils: { randomID: () => `id-${Math.random()}` } };
  globalThis.game = {
    user: { id: "gm", isGM: true, targets: new Set() },
    users: { contents: [{ id: "gm", isGM: true }] },
    i18n: { format: (key) => key, localize: (key) => key },
  };

  const makeToken = ({ id, x, hasPlayerOwner = false }) => {
    const document = {
      id,
      uuid: `Scene.test.Token.${id}`,
      actorId: id,
      x,
      y: 0,
      width: 1,
      height: 1,
      disposition: 0,
      getSize() {
        return { width: 100, height: 100 };
      },
      getCenterPoint() {
        return { x: this.x + 50, y: this.y + 50 };
      },
      async move(waypoints) {
        const destination = waypoints.at(-1);
        this.x = destination.x;
        this.y = destination.y;
        return true;
      },
    };
    return { id, name: id, document, actor: { id, type: hasPlayerOwner ? "character" : "npc", hasPlayerOwner }, movementAnimationPromise: null };
  };

  const petToken = makeToken({ id: "pet", x: 0 });
  const ownerToken = makeToken({ id: "owner", x: 800, hasPlayerOwner: true });
  const partyToken = makeToken({ id: "party", x: 300, hasPlayerOwner: true });
  globalThis.canvas = {
    grid: { size: 100 },
    dimensions: { sceneRect: { x: 0, y: 0, width: 2000, height: 2000 } },
    scene: { width: 2000, height: 2000 },
    tokens: {
      placeables: [petToken, ownerToken, partyToken],
      get: (id) => [petToken, ownerToken, partyToken].find((token) => token.id === id) ?? null,
    },
  };

  try {
    const profile = createPetProfile({ actorUuid: "Actor.pet", actorId: "pet", name: "Dog" });
    profile.actionWeights = Object.fromEntries(ACTIONS.map((action) => [action.id, action.id === "snap-at-target" ? 100 : 0]));
    const relationship = createRelationship({
      id: "relationship",
      pet: profile,
      owner: { actorUuid: "Actor.owner", actorId: "owner", name: "Owner" },
    });
    let state = normalizeState({
      schemaVersion: 3,
      revision: 0,
      pets: { [profile.actorUuid]: profile },
      relationships: { [relationship.id]: relationship },
      history: [],
    });
    let mutationCount = 0;
    const store = {
      configuration: { ...DEFAULT_CONFIG, movementEnabled: true },
      get state() {
        return state;
      },
      async mutate(mutator) {
        mutationCount += 1;
        const draft = structuredClone(state);
        await mutator(draft);
        state = normalizeState(draft, this.configuration);
        return { state };
      },
    };

    MockRoll.totals = [1, 1];
    const result = await new PetCommandRollService(store).rollCommandSequence({
      relationshipId: relationship.id,
      commandId: "stay",
      targetPools: { owner: false, party: true, npc: false, hostile: false, targeted: false },
      postToChat: false,
    });

    assert.equal(result.obedience.outcome, "failure");
    assert.equal(result.behaviour.action.id, "snap-at-target");
    assert.equal(result.behaviour.targetToken.id, "party");
    assert.equal(result.behaviour.movement.moved, true);
    assert.ok(petToken.document.x > 0, "the pet should physically approach the selected party member");
    assert.equal(mutationCount, 1);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
