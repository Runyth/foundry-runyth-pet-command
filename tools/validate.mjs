// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(join(root, "module.json"));
const packageJson = readJson(join(root, "package.json"));
const english = readJson(join(root, "lang/en.json"));
const german = readJson(join(root, "lang/de.json"));

assert.equal(manifest.id, "runyth-pet-command");
assert.equal(manifest.version, packageJson.version);
assert.equal(manifest.compatibility.minimum, "13");
assert.equal(manifest.compatibility.maximum, "13");
assert.deepEqual(manifest.esmodules, ["scripts/main.mjs"], "The Foundry entrypoint must be the explicit .mjs bootstrap");
assert.ok(manifest.styles.includes("styles/runyth-pet-command.css"));
assert.equal(manifest.socket, true);

for (const path of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map((language) => language.path), manifest.license, manifest.readme]) {
  assert.ok(statSync(join(root, path)).isFile(), `Missing manifest path: ${path}`);
}

function flatten(object, prefix = "") {
  return Object.entries(object).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object" && !Array.isArray(value) ? flatten(value, path) : [path];
  });
}

const englishKeys = new Set(flatten(english));
assert.deepEqual([...englishKeys].sort(), flatten(german).sort(), "English and German localization keys differ");

function flattenValues(object, prefix = "", output = new Map()) {
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flattenValues(value, path, output);
    else output.set(path, String(value));
  }
  return output;
}

function placeholders(value) {
  return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort();
}

const englishValues = flattenValues(english);
const germanValues = flattenValues(german);
for (const [key, value] of englishValues) {
  assert.deepEqual(placeholders(germanValues.get(key) ?? ""), placeholders(value), `Localization placeholders differ for ${key}`);
}

const languages = new Map(manifest.languages.map((language) => [language.lang, language]));
assert.equal(languages.get("en")?.path, "lang/en.json");
assert.equal(languages.get("de")?.path, "lang/de.json");
assert.equal(languages.get("en")?.name, "English");
assert.equal(languages.get("de")?.name, "Deutsch");

const requiredDocs = [
  "README.md",
  "CHANGELOG.md",
  "docs/QUICK_START.md",
  "docs/USER_GUIDE.md",
  "docs/LEARNING_MODEL.md",
  "docs/ACTIONS_AND_MOVEMENT.md",
  "docs/CONFIGURATION.md",
  "docs/LOCALIZATION.md",
  "docs/REPRODUCIBLE_BUILD.md",
  "docs/DATA_AND_RECOVERY.md",
  "docs/ARCHITECTURE.md",
  "docs/API.md",
  "docs/TROUBLESHOOTING.md",
  "docs/MANUAL_TEST_PLAN.md",
  "docs/VALIDATION_REPORT.md",
  "docs/PERFORMANCE_AUDIT.md",
  "docs/PATCH_REPORT.md",
  "docs/CODE_AUDIT.md",
  "docs/INCREMENTAL_BEST_PRACTICE_CHANGELOG.md",
];
for (const path of requiredDocs) assert.ok(statSync(join(root, path)).isFile(), `Missing documentation: ${path}`);

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const allScriptPaths = files(join(root, "scripts"));
assert.ok(allScriptPaths.length > 0, "Runtime script directory is empty");
assert.ok(allScriptPaths.every((path) => path.endsWith(".mjs")), "Every runtime module must use the explicit .mjs extension");
const scriptPaths = allScriptPaths;
for (const path of scriptPaths) {
  execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
}

function relativeModuleSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]?.startsWith(".")) specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

function moduleGraph(entryPath) {
  const discovered = new Set();
  const pending = [entryPath];
  while (pending.length) {
    const path = pending.pop();
    if (discovered.has(path)) continue;
    discovered.add(path);
    const source = readFileSync(path, "utf8");
    for (const specifier of relativeModuleSpecifiers(source)) {
      const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
      assert.ok(cleanSpecifier.endsWith(".mjs"), `Runtime import must use .mjs: ${relative(root, path)} -> ${specifier}`);
      const importedPath = resolve(dirname(path), cleanSpecifier);
      assert.ok(importedPath.startsWith(`${root}/`), `Runtime import escapes the module root: ${specifier}`);
      assert.ok(statSync(importedPath).isFile(), `Missing runtime import: ${relative(root, importedPath)}`);
      pending.push(importedPath);
    }
  }
  return discovered;
}

const manifestEntryPath = join(root, manifest.esmodules[0]);
const reachableRuntimeModules = moduleGraph(manifestEntryPath);
assert.deepEqual(
  [...reachableRuntimeModules].sort(),
  [...scriptPaths].sort(),
  "Every packaged runtime module must be reachable from the manifest entrypoint",
);

const literalLocalizationReferences = new Set();
for (const path of scriptPaths) {
  const text = readFileSync(path, "utf8");
  for (const match of text.matchAll(/["'](PETCOMMAND\.[A-Za-z0-9_.-]+)["']/g)) literalLocalizationReferences.add(match[1]);
}
for (const key of literalLocalizationReferences) assert.ok(englishKeys.has(key), `Missing localization key: ${key}`);

const appsSource = readFileSync(join(root, "scripts/apps.mjs"), "utf8");
for (const key of ["PETCOMMAND.App.ManagerTitle", "PETCOMMAND.App.ConfigurationTitle"]) {
  assert.ok(appsSource.includes(`title: options.window?.title ?? t("${key}")`), `Application title is not localized through ${key}`);
}
for (const key of ["PETCOMMAND.App.PlayerTitle", "PETCOMMAND.App.OwnerPerspectiveTitle"]) {
  assert.ok(appsSource.includes(`t("${key}")`), `Player/perspective title is not localized through ${key}`);
}
const constantsSource = readFileSync(join(root, "scripts/constants.mjs"), "utf8");
const storeSource = readFileSync(join(root, "scripts/store.mjs"), "utf8");
assert.ok(constantsSource.includes(`MODULE_VERSION = "${manifest.version}"`), "Runtime module version differs from manifest");
assert.ok(constantsSource.includes(`API_VERSION = "${manifest.version}"`), "Runtime API version differs from manifest");

const modelSource = readFileSync(join(root, "scripts/model.mjs"), "utf8");
const rollsSource = readFileSync(join(root, "scripts/rolls.mjs"), "utf8");
const mainSource = readFileSync(join(root, "scripts/main.mjs"), "utf8");
assert.ok(storeSource.includes("get state() {\n    return this.#state;"), "State getter must return the canonical cache");
assert.ok(storeSource.includes("get configuration() {\n    return this.#configuration;"), "Configuration getter must return the canonical cache");
assert.ok(!storeSource.includes("get state() {\n    return normalizeState"), "State getter must not normalize on every read");
assert.ok(!modelSource.includes('const source = candidate && typeof candidate === "object" ? deepClone(candidate)'), "State normalization must not deep-clone its input");
assert.ok(modelSource.includes("const d20SlotCache = new WeakMap()"), "Weighted d20 allocation cache is missing");
assert.ok(mainSource.includes("requestAnimationFrame"), "Application refreshes must be frame-coalesced");
assert.ok(mainSource.includes("snapshotRelationships"), "Public relationship API must avoid cloning unrelated state");
assert.ok(mainSource.includes("snapshotPetProfiles"), "Public pet API must avoid cloning unrelated state");
assert.ok(mainSource.includes('"privileged-owner-perspective"'), "Owner Perspective API capability is missing");
assert.ok(mainSource.includes("openOwnerPerspective"), "Owner Perspective entrypoint is missing");
assert.ok(mainSource.includes("PETCOMMAND.Context.CommandAsActor"), "Actor/Token owner-perspective affordance is missing");
assert.ok(mainSource.includes('"delegated-behaviour-targets"'), "Delegated behaviour-target capability is missing");
assert.ok(mainSource.includes('"command-movement"'), "Successful command-movement capability is missing");
assert.match(constantsSource, /DEFAULT_TARGET_POOLS[\s\S]*party:\s*true/, "Party members must be enabled in new random-target pools by default");
assert.ok(appsSource.includes("issueOwnerPerspectiveCommand"), "Owner Perspective must reuse the player-style command surface with privileged resolution");
assert.ok(appsSource.includes("ownerPerspectiveRelationships"), "Owner Perspective must filter relationships by the selected owner Actor");
assert.ok(appsSource.includes('data-action="toggle-player-behaviour-targets"'), "Relationship-scoped delegated target controls are missing");
assert.ok(appsSource.includes('renderPoolCheckboxes(behaviourTargetPools, "playerPools")'), "Delegated player random-target checkboxes are missing");
assert.ok(appsSource.includes("behaviourTargetPoolsByRelationship"), "Delegated player target choices must remain transient per relationship");
assert.ok(rollsSource.includes("options.speaker ?? null"), "Privileged owner-perspective rolls must support owner-attributed chat speakers");
assert.ok(rollsSource.includes("movePetForCommand"), "Successful command movement integration is missing");
const movementSource = readFileSync(join(root, "scripts/movement.mjs"), "utf8");
assert.ok(movementSource.includes("findMovementPath"), "Foundry v13 token pathfinding must be attempted before command/reaction movement");
assert.ok(movementSource.includes("document.move"), "Foundry v13 TokenDocument.move must be the primary movement executor");
assert.ok(movementSource.includes('reason: completed ? "moved" : moved ? "partial" : "rejected"'), "Partial constrained movement detection is missing");
assert.ok(appsSource.includes("relationshipViewCache = new WeakMap()"), "Relationship view sorting cache is missing");
assert.ok(!appsSource.includes("render({ force: true })"), "Already-open application flows must not force rerenders");
assert.ok(!/data-action=["']tab["']/.test(appsSource), "Manager navigation must not use Foundry's reserved tab action");
assert.ok(!/action\s*===\s*["']tab["']/.test(appsSource), "Manager action handling must not use Foundry's reserved tab action");
assert.ok(!/\.changeTab\s*\(/.test(appsSource), "Custom manager navigation must not call ApplicationV2.changeTab without a configured group");
assert.ok(!readFileSync(join(root, "scripts/utilities.mjs"), "utf8").includes("typeof saveDataToFile"), "Deprecated global saveDataToFile detection must not be used");
assert.ok(!readFileSync(join(root, "scripts/utilities.mjs"), "utf8").includes("globalThis.saveDataToFile"), "Deprecated global saveDataToFile must not be used");
assert.ok(readFileSync(join(root, "scripts/utilities.mjs"), "utf8").includes("foundry?.utils?.saveDataToFile"), "Foundry v13 namespaced saveDataToFile is missing");
assert.ok(appsSource.includes("isUserInputError(error)"), "Expected UI validation failures must be separated from runtime defects");
assert.ok(appsSource.includes('data-action="import-json" disabled'), "Import action must remain disabled until a file is selected");
assert.ok(appsSource.includes('data-action="create-relationships" disabled'), "Relationship creation must remain disabled until an owner is selected");
assert.ok(appsSource.includes('data-action="switch-tab"'), "Module-owned manager tab action is missing");
assert.ok(appsSource.includes('role="tablist"') && appsSource.includes('role="tab"') && appsSource.includes('role="tabpanel"'), "Accessible tab semantics are incomplete");
const sequenceStart = rollsSource.indexOf("async rollCommandSequence(options)");
const sequenceEnd = rollsSource.indexOf("async postSummary", sequenceStart);
assert.ok(sequenceStart >= 0 && sequenceEnd > sequenceStart, "rollCommandSequence source block is missing");
const sequenceSource = rollsSource.slice(sequenceStart, sequenceEnd);
assert.equal((sequenceSource.match(/this\.store\.mutate\(/g) ?? []).length, 1, "Command sequence must persist through one mutation");
assert.ok(!constantsSource.includes("language:"), "Module configuration must not define a custom language setting");
assert.ok(!storeSource.includes('register(MODULE_ID, "language"'), "Module must use Foundry Language Preference instead of a custom setting");
for (const path of files(join(root, "tests")).filter((path) => path.endsWith(".mjs"))) {
  execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
}

const forbidden = ["eval(", "new Function(", "innerHTML = user", "libWrapper.register"];
for (const path of files(join(root, "scripts"))) {
  const text = readFileSync(path, "utf8");
  for (const pattern of forbidden) assert.ok(!text.includes(pattern), `${relative(root, path)} contains forbidden pattern ${pattern}`);
}

console.log("Manifest: valid");
console.log("Native localization, parity, placeholders, and literal references: valid");
console.log("Documentation set: complete");
console.log("ES-module entrypoint, recursive import graph, and syntax: valid");
console.log("ApplicationV2 navigation, performance architecture, and static safety checks: valid");
