// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { API_VERSION, MODULE_ID, MODULE_TITLE } from "./constants.mjs";
import { PetCommandConfiguration, PetCommandManager, PetCommandPlayerPanel, configureAppServices } from "./apps.mjs";
import { normalizeState } from "./model.mjs";
import { PetCommandRollService } from "./rolls.mjs";
import { ownerPerspectiveRelationships, registerSocketHandlers } from "./socket.mjs";
import { PetCommandStore, registerStorageSettings } from "./store.mjs";
import { actorIdFromContextElement, controlledToken, invalidateActorCache, moduleError, moduleLog, notify, t } from "./utilities.mjs";

let store;
let rollService;
let manager;
let playerPanel;
let ownerPerspectivePanel;

const pendingApplicationRenders = new WeakSet();
let controlsRenderPending = false;

function scheduleApplicationRender(application) {
  if (!application?.rendered || pendingApplicationRenders.has(application)) return;
  pendingApplicationRenders.add(application);
  const schedule = globalThis.requestAnimationFrame ?? ((callback) => globalThis.setTimeout(callback, 0));
  schedule(() => {
    pendingApplicationRenders.delete(application);
    if (!application.rendered) return;
    void application.render().catch((error) => moduleError(error, "Application refresh failed"));
  });
}

function scheduleControlsRender() {
  if (controlsRenderPending) return;
  controlsRenderPending = true;
  const schedule = globalThis.requestAnimationFrame ?? ((callback) => globalThis.setTimeout(callback, 0));
  schedule(() => {
    controlsRenderPending = false;
    ui.controls?.render?.();
  });
}

function openManager({ actorId = null, tokenDocument = null, relationshipId = null, tab = null } = {}) {
  if (!game.user?.isGM) {
    notify("warn", t("PETCOMMAND.Errors.GmOnly"));
    return null;
  }
  if (manager?.rendered) {
    if (actorId || tokenDocument) {
      manager.pendingActorId = actorId ?? tokenDocument?.baseActor?.id ?? tokenDocument?.actorId ?? null;
      manager.pendingTokenDocument = tokenDocument;
      manager.activeTab = tab ?? "relationships";
    } else if (tab) manager.activeTab = tab;
    if (relationshipId) manager.selectedRelationshipId = relationshipId;
    void manager.render();
    manager.bringToFront();
    return manager;
  }
  manager = new PetCommandManager({ store, rollService, actorId, tokenDocument });
  if (relationshipId) manager.selectedRelationshipId = relationshipId;
  if (tab) manager.activeTab = tab;
  void manager.render({ force: true });
  return manager;
}

function openPlayerPanel() {
  if (game.user?.isGM) return openManager({ tab: "command" });
  if (playerPanel?.rendered) {
    void playerPanel.render();
    playerPanel.bringToFront();
    return playerPanel;
  }
  playerPanel = new PetCommandPlayerPanel({ store });
  void playerPanel.render({ force: true });
  return playerPanel;
}

function openOwnerPerspective({ actorId = null, tokenDocument = null } = {}) {
  if (!game.user?.isGM) {
    notify("warn", t("PETCOMMAND.Errors.OwnerPerspectiveNotAllowed"));
    return null;
  }
  const controlled = tokenDocument || actorId ? null : controlledToken();
  const effectiveTokenDocument = tokenDocument ?? controlled?.document ?? null;
  const resolvedActorId = actorId ?? effectiveTokenDocument?.baseActor?.id ?? effectiveTokenDocument?.actorId ?? null;
  if (!resolvedActorId) {
    notify("warn", t("PETCOMMAND.Errors.OwnerPerspectiveActorRequired"));
    return null;
  }
  if (ownerPerspectivePanel?.rendered) {
    ownerPerspectivePanel.setPerspective({ actorId: resolvedActorId, tokenDocument: effectiveTokenDocument });
    void ownerPerspectivePanel.render();
    ownerPerspectivePanel.bringToFront();
    return ownerPerspectivePanel;
  }
  ownerPerspectivePanel = new PetCommandPlayerPanel({
    store,
    rollService,
    ownerActorId: resolvedActorId,
    ownerTokenDocument: effectiveTokenDocument,
    perspectiveMode: true,
  });
  void ownerPerspectivePanel.render({ force: true });
  return ownerPerspectivePanel;
}

function publishApi() {
  const api = Object.freeze({
    version: API_VERSION,
    capabilities: Object.freeze([
      "relationships",
      "per-owner-xp",
      "obedience-rolls",
      "weighted-d20-behaviour",
      "delegated-behaviour-targets",
      "token-movement",
      "command-movement",
      "json-export-import",
      "player-command-panel",
      "privileged-owner-perspective",
      "dnd5e-default-attack",
    ]),
    openManager,
    openPlayerPanel,
    openOwnerPerspective,
    openConfiguration: () => new PetCommandConfiguration({ store }).render({ force: true }),
    getState: () => store.snapshotState(),
    getConfiguration: () => ({ ...store.configuration }),
    getRelationships: (options = {}) => store.snapshotRelationships(options),
    getPetProfiles: () => store.snapshotPetProfiles(),
    exportData: (options = {}) => store.exportEnvelope(options),
    importData: (data, { mode = "merge" } = {}) => (mode === "replace" ? store.replaceState(data) : store.mergeState(data)),
    rollObedience: (options) => rollService.rollObedience(options),
    rollBehaviour: (options) => rollService.rollBehaviour(options),
    rollCommandSequence: (options) => rollService.rollCommandSequence(options),
  });
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;
  Hooks.callAll(`${MODULE_ID}.apiReady`, api);
  return api;
}

function registerMenus() {
  game.settings.registerMenu(MODULE_ID, "manager", {
    name: "PETCOMMAND.Settings.ManagerName",
    label: "PETCOMMAND.Settings.ManagerLabel",
    hint: "PETCOMMAND.Settings.ManagerHint",
    icon: "fa-solid fa-paw",
    type: PetCommandManager,
    restricted: true,
  });
  game.settings.registerMenu(MODULE_ID, "configurationMenu", {
    name: "PETCOMMAND.Settings.ConfigurationName",
    label: "PETCOMMAND.Settings.ConfigurationLabel",
    hint: "PETCOMMAND.Settings.ConfigurationHint",
    icon: "fa-solid fa-gears",
    type: PetCommandConfiguration,
    restricted: true,
  });
}

function registerSceneControl() {
  Hooks.on("getSceneControlButtons", (controls) => {
    const tokens = controls.tokens;
    if (!tokens?.tools) return;
    tokens.tools[MODULE_ID] = {
      name: MODULE_ID,
      title: game.user.isGM ? "PETCOMMAND.Controls.Open" : "PETCOMMAND.Controls.OpenPlayer",
      icon: "fa-solid fa-paw",
      order: Object.keys(tokens.tools).length,
      button: true,
      visible: game.user.isGM || store.configuration.playerCommandsEnabled,
      onChange: () => {
        if (!game.user.isGM) return openPlayerPanel();
        const token = controlledToken();
        return openManager({ tokenDocument: token?.document ?? null, tab: token ? "relationships" : "command" });
      },
    };
    tokens.tools[`${MODULE_ID}-owner-perspective`] = {
      name: `${MODULE_ID}-owner-perspective`,
      title: "PETCOMMAND.Controls.OpenOwnerPerspective",
      icon: "fa-solid fa-user-tag",
      order: Object.keys(tokens.tools).length,
      button: true,
      visible: game.user.isGM,
      onChange: () => openOwnerPerspective(),
    };
  });
}

function registerActorContext() {
  Hooks.on("getActorContextOptions", (_application, entries) => {
    entries.push({
      label: "PETCOMMAND.Context.ManageAsPet",
      icon: "fa-solid fa-paw",
      visible: game.user?.isGM,
      onClick: (element) => {
        const actorId = actorIdFromContextElement(element);
        if (actorId) openManager({ actorId, tab: "relationships" });
      },
    });
    entries.push({
      label: "PETCOMMAND.Context.CommandAsActor",
      icon: "fa-solid fa-user-tag",
      visible: game.user?.isGM,
      onClick: (element) => {
        const actorId = actorIdFromContextElement(element);
        if (actorId) openOwnerPerspective({ actorId });
      },
    });
  });
}

function registerTokenHudButton() {
  Hooks.on("renderTokenHUD", (application, html, data) => {
    if (!game.user?.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    const column = root.querySelector(".col.right") ?? root.querySelector(".right") ?? root;
    const token = application?.object ?? application?.token ?? canvas?.tokens?.get(data?._id ?? data?.id ?? data?.tokenId);
    if (!token?.document) return;

    if (!root.querySelector("[data-pet-command-hud]")) {
      const manageButton = document.createElement("div");
      manageButton.className = "control-icon";
      manageButton.dataset.petCommandHud = "true";
      manageButton.title = t("PETCOMMAND.Context.ManageAsPet");
      manageButton.innerHTML = '<i class="fa-solid fa-paw"></i>';
      manageButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openManager({ tokenDocument: token.document, tab: "relationships" });
      });
      column.append(manageButton);
    }

    const ownerActorId = token.document.baseActor?.id ?? token.document.actorId ?? token.actor?.id ?? null;
    const hasOwnedPets = ownerPerspectiveRelationships(store, ownerActorId).length > 0;
    if (hasOwnedPets && !root.querySelector("[data-pet-command-owner-hud]")) {
      const perspectiveButton = document.createElement("div");
      perspectiveButton.className = "control-icon";
      perspectiveButton.dataset.petCommandOwnerHud = "true";
      perspectiveButton.title = t("PETCOMMAND.Context.CommandAsActor");
      perspectiveButton.innerHTML = '<i class="fa-solid fa-user-tag"></i>';
      perspectiveButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openOwnerPerspective({ tokenDocument: token.document });
      });
      column.append(perspectiveButton);
    }
  });
}

Hooks.once("init", () => {
  registerStorageSettings();
  store = new PetCommandStore();
  rollService = new PetCommandRollService(store);
  configureAppServices({ store, rollService, openManager, openOwnerPerspective });
  registerMenus();
  registerSceneControl();
  registerActorContext();
  registerTokenHudButton();
  publishApi();
  moduleLog(`${MODULE_TITLE} initialized.`);
});

Hooks.once("ready", async () => {
  registerSocketHandlers({ store, rollService });
  if (!game.user?.isGM) return;
  try {
    const stored = game.settings.get(MODULE_ID, "state");
    const normalized = normalizeState(stored, store.configuration);
    if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
      await game.settings.set(MODULE_ID, "state", normalized);
    }
  } catch (error) {
    moduleError(error, "State migration failed");
    notify("error", t("PETCOMMAND.Errors.MigrationFailed"));
  }
});

Hooks.on(`${MODULE_ID}.stateChanged`, () => {
  scheduleApplicationRender(manager);
  scheduleApplicationRender(playerPanel);
  scheduleApplicationRender(ownerPerspectivePanel);
});

Hooks.on(`${MODULE_ID}.configurationChanged`, () => {
  scheduleApplicationRender(manager);
  scheduleApplicationRender(playerPanel);
  scheduleApplicationRender(ownerPerspectivePanel);
  scheduleControlsRender();
});

for (const hook of ["createActor", "updateActor", "deleteActor"]) {
  Hooks.on(hook, () => {
    invalidateActorCache();
    scheduleApplicationRender(ownerPerspectivePanel);
  });
}
