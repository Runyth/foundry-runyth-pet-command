import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { issueOwnerPerspectiveCommand, ownerPerspectiveRelationships, permittedPlayerTargetPools } from "../scripts/socket.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function relationship(id, owner, pet = "Pet") {
  return {
    id,
    status: "active",
    ownerActorId: owner.id,
    ownerActorUuid: owner.uuid,
    ownerNameSnapshot: owner.name,
    petNameSnapshot: pet,
  };
}

test("owner perspective filters active relationships to the selected owner Actor", () => {
  const ownerA = { id: "owner-a", uuid: "Actor.owner-a", name: "A" };
  const ownerB = { id: "owner-b", uuid: "Actor.owner-b", name: "B" };
  globalThis.game = {
    i18n: { lang: "en" },
    user: { isGM: true },
    actors: { get: (id) => ({ "owner-a": ownerA, "owner-b": ownerB })[id] ?? null },
  };
  const state = {
    relationships: {
      a1: relationship("a1", ownerA, "Dog"),
      a2: relationship("a2", ownerA, "Hawk"),
      b1: relationship("b1", ownerB, "Cat"),
      ended: { ...relationship("ended", ownerA, "Old Dog"), status: "terminated" },
    },
  };
  const store = { state };

  assert.deepEqual(ownerPerspectiveRelationships(store, ownerA.id).map((entry) => entry.id), ["a1", "a2"]);
  assert.deepEqual(ownerPerspectiveRelationships(store, ownerB.id).map((entry) => entry.id), ["b1"]);
});

test("owner perspective is unavailable to ordinary player clients", () => {
  const owner = { id: "owner", uuid: "Actor.owner", name: "Owner" };
  globalThis.game = {
    i18n: { lang: "en" },
    user: { isGM: false },
    actors: { get: () => owner },
  };
  const store = { state: { relationships: { one: relationship("one", owner) } } };
  assert.deepEqual(ownerPerspectiveRelationships(store, owner.id), []);
});

test("Assistant-GM-compatible isGM clients can issue a command only for the selected owner", async () => {
  const owner = {
    id: "owner",
    uuid: "Actor.owner",
    name: "Owner",
    getActiveTokens: () => [],
  };
  globalThis.game = {
    i18n: { lang: "en", localize: (key) => key },
    user: { id: "assistant", isGM: true, role: 3 },
    actors: { get: (id) => (id === owner.id ? owner : null) },
  };
  globalThis.canvas = { tokens: { get: () => null, placeables: [] } };
  globalThis.ChatMessage = { getSpeaker: ({ actor }) => ({ actor: actor.id, alias: actor.name }) };

  const rel = relationship("relationship", owner, "Dog");
  const store = {
    configuration: { autoBehaviourOnFailure: true, movementEnabled: true },
    state: { relationships: { [rel.id]: rel } },
  };
  let received = null;
  const rollService = {
    async rollCommandSequence(options) {
      received = options;
      return {
        obedience: {
          roll: { total: 17 },
          dc: 10,
          outcome: "success",
          xpAward: 0.25,
          command: { id: "come" },
        },
        behaviour: null,
        attack: null,
      };
    },
  };

  const result = await issueOwnerPerspectiveCommand({
    store,
    rollService,
    ownerActorId: owner.id,
    relationshipId: rel.id,
    commandId: "come",
  });

  assert.equal(result.obedience.total, 17);
  assert.equal(received.relationshipId, rel.id);
  assert.deepEqual(received.speaker, { actor: owner.id, alias: owner.name });
});

test("owner perspective is additive to existing manager and player entrypoints", () => {
  const main = readFileSync(join(root, "scripts/main.mjs"), "utf8");
  const apps = readFileSync(join(root, "scripts/apps.mjs"), "utf8");

  assert.match(main, /openOwnerPerspective/);
  assert.match(main, /PETCOMMAND\.Controls\.OpenOwnerPerspective/);
  assert.match(main, /PETCOMMAND\.Context\.CommandAsActor/);
  assert.match(main, /"privileged-owner-perspective"/);
  assert.match(apps, /requestPlayerCommand\(options\)/);
  assert.match(apps, /issueOwnerPerspectiveCommand/);
  assert.match(apps, /data-action="open-full-manager"/);
});

test("ordinary players cannot invoke the privileged owner-perspective command path", async () => {
  const owner = { id: "owner", uuid: "Actor.owner", name: "Owner", getActiveTokens: () => [] };
  globalThis.game = {
    i18n: { lang: "en", localize: (key) => key },
    user: { id: "player", isGM: false },
    actors: { get: () => owner },
  };

  await assert.rejects(
    issueOwnerPerspectiveCommand({
      store: { configuration: {}, state: { relationships: {} } },
      rollService: {},
      ownerActorId: owner.id,
      relationshipId: "missing",
      commandId: "come",
    }),
    /OwnerPerspectiveNotAllowed/,
  );
});

test("owner perspective rejects relationships belonging to another Actor", async () => {
  const ownerA = { id: "owner-a", uuid: "Actor.owner-a", name: "A", getActiveTokens: () => [] };
  const ownerB = { id: "owner-b", uuid: "Actor.owner-b", name: "B", getActiveTokens: () => [] };
  globalThis.game = {
    i18n: { lang: "en", localize: (key) => key },
    user: { id: "assistant", isGM: true, role: 3 },
    actors: { get: (id) => ({ "owner-a": ownerA, "owner-b": ownerB })[id] ?? null },
  };
  globalThis.canvas = { tokens: { get: () => null, placeables: [] } };
  globalThis.ChatMessage = { getSpeaker: ({ actor }) => ({ actor: actor.id }) };

  const otherRelationship = relationship("other", ownerB, "Cat");
  await assert.rejects(
    issueOwnerPerspectiveCommand({
      store: {
        configuration: { autoBehaviourOnFailure: true, movementEnabled: true },
        state: { relationships: { [otherRelationship.id]: otherRelationship } },
      },
      rollService: { rollCommandSequence: async () => assert.fail("mismatched relationship must not roll") },
      ownerActorId: ownerA.id,
      relationshipId: otherRelationship.id,
      commandId: "come",
    }),
    /OwnerPerspectiveRelationshipMismatch/,
  );
});


test("delegated random target pools are accepted only for explicitly permitted owner relationships", () => {
  const candidate = { owner: false, party: true, npc: false, hostile: false, targeted: false };
  assert.equal(permittedPlayerTargetPools({ playerBehaviourTargetsEnabled: false }, candidate), null);
  assert.deepEqual(permittedPlayerTargetPools({ playerBehaviourTargetsEnabled: true }, candidate), candidate);
});
