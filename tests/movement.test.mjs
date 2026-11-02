// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";

import { COMMAND_BY_ID } from "../scripts/constants.mjs";
import { movePetForCommand } from "../scripts/movement.mjs";

function token({ id, x, y = 0, width = 1, height = 1, moveImpl = null, pathImpl = null }) {
  const document = {
    id,
    uuid: `Scene.test.Token.${id}`,
    actorId: id,
    x,
    y,
    width,
    height,
    elevation: 0,
    getSize() {
      return { width: width * 100, height: height * 100 };
    },
    getCenterPoint() {
      return { x: this.x + (width * 100) / 2, y: this.y + (height * 100) / 2 };
    },
    async move(waypoints, options) {
      if (moveImpl) return moveImpl.call(this, waypoints, options);
      const final = Array.isArray(waypoints) ? waypoints.at(-1) : waypoints;
      this.x = final.x;
      this.y = final.y;
      return true;
    },
  };
  return {
    id,
    document,
    actor: { id },
    movementAnimationPromise: null,
    findMovementPath: pathImpl,
  };
}

function withCanvas(callback) {
  const previous = globalThis.canvas;
  globalThis.canvas = {
    grid: { size: 100 },
    dimensions: { sceneRect: { x: 0, y: 0, width: 2000, height: 2000 } },
    scene: { width: 2000, height: 2000 },
  };
  return Promise.resolve(callback()).finally(() => {
    if (previous === undefined) delete globalThis.canvas;
    else globalThis.canvas = previous;
  });
}

const configuration = { movementDistanceSquares: 4, circleRadiusSquares: 2 };

test("successful attack movement approaches the target without overlapping it", async () => withCanvas(async () => {
  const pet = token({ id: "pet", x: 0 });
  const target = token({ id: "target", x: 500 });
  const result = await movePetForCommand({
    command: COMMAND_BY_ID.attack,
    petToken: pet,
    targetToken: target,
    configuration,
  });

  assert.equal(result.moved, true);
  assert.equal(result.reason, "moved");
  assert.ok(pet.document.x >= 395 && pet.document.x <= 400, `unexpected destination ${pet.document.x}`);
  assert.ok(pet.document.x + 100 < target.document.x + 1, "pet must not overlap target token");
}));

test("approach movement does not overshoot when already adjacent", async () => withCanvas(async () => {
  const pet = token({ id: "pet", x: 0 });
  const owner = token({ id: "owner", x: 100 });
  const result = await movePetForCommand({
    command: COMMAND_BY_ID.come,
    petToken: pet,
    ownerToken: owner,
    configuration,
  });

  assert.equal(result.moved, false);
  assert.equal(result.reason, "already-positioned");
  assert.equal(pet.document.x, 0);
}));

test("movement uses Foundry pathfinding before TokenDocument.move when available", async () => withCanvas(async () => {
  let requestedPath = null;
  let movedPath = null;
  const pet = token({
    id: "pet",
    x: 0,
    pathImpl(waypoints) {
      requestedPath = waypoints;
      return { promise: Promise.resolve([waypoints[0], { x: 0, y: 100 }, { x: 200, y: 100 }]) };
    },
    moveImpl(waypoints) {
      movedPath = waypoints;
      const final = waypoints.at(-1);
      this.x = final.x;
      this.y = final.y;
      return true;
    },
  });
  const target = token({ id: "target", x: 500 });

  const result = await movePetForCommand({ command: COMMAND_BY_ID.attack, petToken: pet, targetToken: target, configuration });

  assert.equal(result.pathfound, true);
  assert.equal(requestedPath[0].x, 0);
  assert.deepEqual(movedPath, [{ x: 0, y: 100 }, { x: 200, y: 100 }]);
  assert.deepEqual(result.destination, { x: 200, y: 100 });
}));

test("a constrained partial move is reported as movement instead of a false rejection", async () => withCanvas(async () => {
  const pet = token({
    id: "pet",
    x: 0,
    moveImpl(waypoints) {
      const final = waypoints.at(-1);
      this.x = Math.round(final.x / 2);
      this.y = final.y;
      return false;
    },
  });
  const target = token({ id: "target", x: 500 });

  const result = await movePetForCommand({ command: COMMAND_BY_ID.attack, petToken: pet, targetToken: target, configuration });

  assert.equal(result.moved, true);
  assert.equal(result.reason, "partial");
  assert.ok(pet.document.x > 0);
}));
