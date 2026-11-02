// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { useDefaultAttack } from "../scripts/attacks.mjs";

function createFixture({ cancelled = false } = {}) {
  const targets = new Set();
  const previous = {
    id: "previous",
    document: { id: "previous", actorId: "other", uuid: "Scene.scene.Token.previous" },
    setTarget(active) {
      if (active) targets.add(this);
      else targets.delete(this);
    },
  };
  const target = {
    id: "target",
    name: "Bandit",
    document: { id: "target", actorId: "enemy", uuid: "Scene.scene.Token.target" },
    setTarget(active, { releaseOthers = false } = {}) {
      if (releaseOthers) targets.clear();
      if (active) targets.add(this);
      else targets.delete(this);
    },
  };
  let sawSelectedTarget = false;
  const activity = {
    id: "bite-activity",
    name: "Bite",
    type: "attack",
    canUse: true,
    sort: 0,
    async rollAttack() {
      sawSelectedTarget = targets.has(target) && targets.size === 1;
      return cancelled ? null : [{}];
    },
  };
  const item = {
    id: "bite-item",
    name: "Bite",
    isOwner: true,
    sort: 0,
    system: { activities: [activity] },
  };
  const actor = { id: "pet", items: [item] };
  const pet = {
    id: "pet-token",
    actor,
    document: { id: "pet-token", actorId: "pet", uuid: "Scene.scene.Token.pet" },
  };

  targets.add(previous);
  globalThis.game = {
    system: { id: "dnd5e" },
    actors: { get: (id) => (id === "pet" ? actor : null) },
    user: { targets },
    i18n: { lang: "en" },
  };
  globalThis.canvas = { tokens: { placeables: [pet, target, previous] } };
  return { target, previous, targets, sawSelectedTarget: () => sawSelectedTarget };
}

test("successful default attack rolls against the command target and restores prior targets", async () => {
  const fixture = createFixture();
  const result = await useDefaultAttack({
    profile: { actorId: "pet", defaultAttackItemId: "bite-item", defaultAttackActivityId: "bite-activity" },
    relationship: { petActorId: "pet" },
    targetTokenId: "target",
  });

  assert.equal(result.used, true);
  assert.equal(result.attackLabel, "Bite");
  assert.equal(fixture.sawSelectedTarget(), true);
  assert.deepEqual([...fixture.targets], [fixture.previous]);
});

test("cancelled D&D 5e attack rolls are reported without losing prior targets", async () => {
  const fixture = createFixture({ cancelled: true });
  const result = await useDefaultAttack({
    profile: { actorId: "pet" },
    relationship: { petActorId: "pet" },
    targetTokenId: "target",
  });

  assert.equal(result.used, false);
  assert.equal(result.reason, "attack-cancelled");
  assert.deepEqual([...fixture.targets], [fixture.previous]);
});
