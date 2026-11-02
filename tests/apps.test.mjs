// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "scripts/apps.mjs"), "utf8");

test("manager navigation never invokes Foundry's reserved tab action", () => {
  assert.doesNotMatch(source, /data-action=["']tab["']/);
  assert.doesNotMatch(source, /action\s*===\s*["']tab["']/);
  assert.doesNotMatch(source, /\.changeTab\s*\(/);
});

test("manager navigation uses a validated module-owned action", () => {
  assert.match(source, /data-action="switch-tab"/);
  assert.match(source, /action === "switch-tab"/);
  assert.match(source, /MANAGER_TABS\.includes\(tab\)/);
});

test("manager tabs expose accessible tab semantics", () => {
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tab"/);
  assert.match(source, /role="tabpanel"/);
  assert.match(source, /aria-selected=/);
  assert.match(source, /aria-controls="pc-manager-panel"/);
});

test("manager tabs support roving keyboard navigation", () => {
  for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"]) {
    assert.ok(source.includes(`event.key === "${key}"`), `Missing keyboard navigation for ${key}`);
  }
  assert.match(source, /tabindex="\$\{active \? 0 : -1\}"/);
});

test("every manager navigation button declares button type", () => {
  assert.match(source, /<button id="pc-tab-\$\{id\}" type="button" role="tab"/);
  assert.match(source, /<button type="button" data-action="switch-tab" data-tab="relationships"/);
});

test("manager can delegate random-behaviour target controls per relationship", () => {
  assert.match(source, /data-action="toggle-player-behaviour-targets"/);
  assert.match(source, /playerBehaviourTargetsEnabled/);
  assert.match(source, /#setPlayerBehaviourTargetAccess/);
});

test("player command panel exposes transient target-pool controls only when permitted", () => {
  assert.match(source, /canChooseBehaviourTargets/);
  assert.match(source, /renderPoolCheckboxes\(behaviourTargetPools, "playerPools"\)/);
  assert.match(source, /behaviourTargetPoolsByRelationship/);
  assert.match(source, /const targetPools = canChooseBehaviourTargets \? readPools\(form, "playerPools"\) : null/);
});
