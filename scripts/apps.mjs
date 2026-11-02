import {
  ACTIONS,
  ACTION_BY_ID,
  ATTITUDE_PRESETS,
  COMMANDS,
  COMMAND_BY_ID,
  DEFAULT_CONFIG,
  DEFAULT_TARGET_POOLS,
  MODULE_ID,
  RELATIONSHIP_STATUS,
} from "./constants.mjs";
import { attackChoices, parseAttackKey, selectedAttackKey } from "./attacks.mjs";
import {
  automatedObedience,
  bondLevel,
  buildD20Slots,
  commandDifficulty,
  commandTargetRequirement,
  createPetProfile,
  createRelationship,
  difficultyBand,
  effectiveObedience,
  normalizeTargetPools,
  obedienceBaseDc,
  normalizeWeights,
  obedienceDc,
  roundTo,
} from "./model.mjs";
import { accessibleRelationships, issueOwnerPerspectiveCommand, ownerPerspectiveRelationships, requestPlayerCommand } from "./socket.mjs";
import { actorReference, controlledToken, downloadJson, escapeHtml, isUserInputError, notify, randomId, readJsonFile, t, UserInputError, worldActors } from "./utilities.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;

let defaultStore = null;
let defaultRollService = null;
let defaultOpenManager = null;
let defaultOpenOwnerPerspective = null;
const relationshipViewCache = new WeakMap();
const petProfileViewCache = new WeakMap();
const MANAGER_TABS = Object.freeze(["command", "relationships", "profile", "data"]);

export function configureAppServices({ store, rollService, openManager = null, openOwnerPerspective = null }) {
  defaultStore = store;
  defaultRollService = rollService;
  defaultOpenManager = openManager;
  defaultOpenOwnerPerspective = openOwnerPerspective;
}

function option(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function checked(value) {
  return value ? "checked" : "";
}

function selectedValues(select) {
  return [...select.selectedOptions].map((entry) => entry.value);
}

function actorOptions(selectedId = null, excludeId = null) {
  return worldActors()
    .filter((actor) => actor.id !== excludeId)
    .map((actor) => option(actor.id, `${actor.name} · ${actor.type}`, actor.id === selectedId))
    .join("");
}


function ownerPerspectiveActorOptions(store, selectedActorId = null) {
  const ownerIds = new Set(
    Object.values(store.state.relationships)
      .filter((relationship) => relationship.status === RELATIONSHIP_STATUS.ACTIVE && relationship.ownerActorId)
      .map((relationship) => relationship.ownerActorId),
  );
  if (selectedActorId) ownerIds.add(selectedActorId);
  return worldActors()
    .filter((actor) => ownerIds.has(actor.id))
    .map((actor) => option(actor.id, `${actor.name} · ${actor.type}`, actor.id === selectedActorId))
    .join("");
}

function relationshipLabel(relationship) {
  return `${relationship.petNameSnapshot} ↔ ${relationship.ownerNameSnapshot}${relationship.status === RELATIONSHIP_STATUS.TERMINATED ? ` · ${t("PETCOMMAND.Status.Terminated")}` : ""}`;
}


function sortedRelationships(state) {
  const language = game.i18n?.lang ?? "en";
  const cached = relationshipViewCache.get(state);
  if (cached?.language === language) return cached.relationships;
  const relationships = Object.freeze(
    Object.values(state.relationships).sort((left, right) => relationshipLabel(left).localeCompare(relationshipLabel(right), language)),
  );
  relationshipViewCache.set(state, { language, relationships });
  return relationships;
}

function sortedPetProfiles(state) {
  const language = game.i18n?.lang ?? "en";
  const cached = petProfileViewCache.get(state);
  if (cached?.language === language) return cached.profiles;
  const profiles = Object.freeze(
    Object.values(state.pets).sort((left, right) => left.nameSnapshot.localeCompare(right.nameSnapshot, language)),
  );
  petProfileViewCache.set(state, { language, profiles });
  return profiles;
}

function targetTokenOptions(selectedId = "", placeholderKey = "PETCOMMAND.Targets.NoExplicitTarget") {
  const tokens = (canvas?.tokens?.placeables ?? []).filter((token) => game.user?.isGM || token.visible);
  return [option("", t(placeholderKey), !selectedId)]
    .concat(tokens.map((token) => option(token.id, token.name, token.id === selectedId)))
    .join("");
}

function renderPoolCheckboxes(values, prefix = "targetPools") {
  return Object.keys(DEFAULT_TARGET_POOLS)
    .map(
      (pool) => `
        <label class="pc-check">
          <input type="checkbox" name="${prefix}.${pool}" ${checked(values?.[pool])}>
          <span>${escapeHtml(t(`PETCOMMAND.TargetPools.${pool}`))}</span>
        </label>`,
    )
    .join("");
}

function readPools(form, prefix = "targetPools") {
  return Object.fromEntries(Object.keys(DEFAULT_TARGET_POOLS).map((pool) => [pool, Boolean(form.querySelector(`[name="${prefix}.${pool}"]`)?.checked)]));
}

function statusBadge(status) {
  return `<span class="pc-badge ${status === RELATIONSHIP_STATUS.ACTIVE ? "is-active" : "is-terminated"}">${escapeHtml(
    t(status === RELATIONSHIP_STATUS.ACTIVE ? "PETCOMMAND.Status.Active" : "PETCOMMAND.Status.Terminated"),
  )}</span>`;
}

function signedModifier(value) {
  const number = Number(value) || 0;
  return `${number >= 0 ? "+" : "−"}${Math.abs(number)}`;
}

function commandDisplay(command, profile) {
  const difficulty = commandDifficulty(command, profile?.attitude);
  const band = difficultyBand(difficulty.total);
  return {
    difficulty,
    band,
    label: `${t(command.labelKey)} — ${t(`PETCOMMAND.Difficulty.${band}`)} (${signedModifier(difficulty.total)} DC)`,
  };
}

function commandTargetHelp(command) {
  return t(`PETCOMMAND.CommandTargets.${command.id}`);
}

function renderCommandTargetField(command, selectedId = "") {
  const requirement = commandTargetRequirement(command);
  const disabled = !requirement.selectable;
  const currentTargets = [...(game.user?.targets ?? [])];
  const effectiveSelectedId = selectedId || (requirement.required && currentTargets.length === 1 ? currentTargets[0].id : "");
  const labelKey = requirement.required ? "PETCOMMAND.Labels.CommandTargetRequired" : "PETCOMMAND.Labels.CommandTarget";
  const placeholderKey = requirement.required
    ? "PETCOMMAND.Targets.SelectRequired"
    : requirement.ownerFallback
      ? "PETCOMMAND.Targets.OwnerFallback"
      : "PETCOMMAND.Targets.NotUsed";
  return `<label class="pc-field ${disabled ? "is-disabled" : ""}">
    <span>${escapeHtml(t(labelKey))}</span>
    <select name="targetTokenId" ${disabled ? "disabled" : ""}>${targetTokenOptions(effectiveSelectedId, placeholderKey)}</select>
    <small>${escapeHtml(commandTargetHelp(command))}</small>
  </label>`;
}

export class PetCommandManager extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "pet-command-manager",
    classes: ["pet-command", "standard-form"],
    tag: "div",
    window: {
      title: "PETCOMMAND.App.ManagerTitle",
      icon: "fa-solid fa-paw",
      resizable: true,
    },
    position: {
      width: 1050,
      height: 780,
    },
  };

  constructor({ store, rollService, actorId = null, tokenDocument = null, ...options } = {}) {
    super({
      ...options,
      window: { ...(options.window ?? {}), title: options.window?.title ?? t("PETCOMMAND.App.ManagerTitle") },
    });
    this.store = store ?? defaultStore;
    this.rollService = rollService ?? defaultRollService;
    this.activeTab = actorId || tokenDocument ? "relationships" : "command";
    this.selectedRelationshipId = null;
    this.selectedPetActorUuid = null;
    this.selectedCommandId = "come";
    this.pendingActorId = actorId ?? tokenDocument?.baseActor?.id ?? tokenDocument?.actorId ?? null;
    this.pendingTokenDocument = tokenDocument;
    this.lastResult = null;
    this._listenerController = null;
  }

  async _renderHTML() {
    const state = this.store.state;
    const configuration = this.store.configuration;
    const relationships = sortedRelationships(state);
    const activeRelationships = relationships.filter((relationship) => relationship.status === RELATIONSHIP_STATUS.ACTIVE);
    if (!state.relationships[this.selectedRelationshipId]) this.selectedRelationshipId = activeRelationships[0]?.id ?? relationships[0]?.id ?? null;
    const relationship = state.relationships[this.selectedRelationshipId] ?? null;
    if (!state.pets[this.selectedPetActorUuid]) this.selectedPetActorUuid = relationship?.petActorUuid ?? Object.keys(state.pets)[0] ?? null;
    const profile = state.pets[this.selectedPetActorUuid] ?? null;

    const root = document.createElement("div");
    root.className = "pc-shell";
    root.innerHTML = `
      <nav class="pc-tabs" role="tablist" aria-label="${escapeHtml(t("PETCOMMAND.App.Navigation"))}">
        ${this.#tabButton("command", "PETCOMMAND.Tabs.Command", "fa-solid fa-dice-d20")}
        ${this.#tabButton("relationships", "PETCOMMAND.Tabs.Relationships", "fa-solid fa-link")}
        ${this.#tabButton("profile", "PETCOMMAND.Tabs.Profile", "fa-solid fa-paw")}
        ${this.#tabButton("data", "PETCOMMAND.Tabs.Data", "fa-solid fa-file-export")}
      </nav>
      <main id="pc-manager-panel" class="pc-content" role="tabpanel" aria-labelledby="pc-tab-${this.activeTab}" tabindex="0">
        ${this.activeTab === "command" ? this.#renderCommandTab(state, configuration, relationship, relationships) : ""}
        ${this.activeTab === "relationships" ? this.#renderRelationshipsTab(state, configuration, relationships) : ""}
        ${this.activeTab === "profile" ? this.#renderProfileTab(state, profile) : ""}
        ${this.activeTab === "data" ? this.#renderDataTab(state) : ""}
      </main>`;
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._listenerController?.abort();
    this._listenerController = new AbortController();
    const listenerOptions = { signal: this._listenerController.signal };
    this.element.addEventListener("click", (event) => this.#handleClick(event), listenerOptions);
    this.element.addEventListener("change", (event) => this.#handleChange(event), listenerOptions);
    this.element.addEventListener("input", (event) => this.#handleInput(event), listenerOptions);
    this.element.addEventListener("keydown", (event) => this.#handleKeydown(event), listenerOptions);
  }

  async _onClose(options) {
    this._listenerController?.abort();
    this._listenerController = null;
    await super._onClose(options);
  }

  #tabButton(id, labelKey, icon) {
    const active = this.activeTab === id;
    return `<button id="pc-tab-${id}" type="button" role="tab" class="pc-tab ${active ? "is-active" : ""}"
      aria-selected="${active}" aria-controls="pc-manager-panel" tabindex="${active ? 0 : -1}"
      data-action="switch-tab" data-tab="${id}">
      <i class="${icon}" aria-hidden="true"></i><span>${escapeHtml(t(labelKey))}</span>
    </button>`;
  }

  #renderCommandTab(state, configuration, relationship, relationships) {
    if (!relationship) {
      return `<section class="pc-empty"><i class="fa-solid fa-paw"></i><h2>${escapeHtml(t("PETCOMMAND.Empty.NoRelationships"))}</h2><p>${escapeHtml(
        t("PETCOMMAND.Empty.NoRelationshipsHelp"),
      )}</p><button type="button" data-action="switch-tab" data-tab="relationships"><i class="fa-solid fa-plus"></i> ${escapeHtml(
        t("PETCOMMAND.ActionsUi.CreateRelationship"),
      )}</button></section>`;
    }

    const profile = state.pets[relationship.petActorUuid];
    const auto = automatedObedience(relationship.xp, configuration);
    const effective = effectiveObedience(relationship, configuration);
    const command = COMMAND_BY_ID[this.selectedCommandId] ?? COMMANDS[0];
    const display = commandDisplay(command, profile);
    const baseDc = obedienceBaseDc(relationship, configuration);
    const dc = obedienceDc(relationship, display.difficulty.total, configuration);
    const level = bondLevel(effective);
    const pools = profile?.targetPools ?? DEFAULT_TARGET_POOLS;
    const terminated = relationship.status === RELATIONSHIP_STATUS.TERMINATED;

    return `
      <section class="pc-panel">
        <div class="pc-panel-header">
          <div>
            <h2>${escapeHtml(t("PETCOMMAND.Command.Title"))}</h2>
            <p>${escapeHtml(t("PETCOMMAND.Command.Help"))}</p>
          </div>
          ${statusBadge(relationship.status)}
        </div>

        <div class="pc-grid two">
          <label class="pc-field span-2">
            <span>${escapeHtml(t("PETCOMMAND.Labels.Relationship"))}</span>
            <select name="relationshipId">
              ${relationships.map((entry) => option(entry.id, relationshipLabel(entry), entry.id === relationship.id)).join("")}
            </select>
          </label>

          <article class="pc-card">
            <h3>${escapeHtml(relationship.petNameSnapshot)} ↔ ${escapeHtml(relationship.ownerNameSnapshot)}</h3>
            <dl class="pc-stats">
              <div><dt>${escapeHtml(t("PETCOMMAND.Labels.XP"))}</dt><dd>${relationship.xp}</dd></div>
              <div><dt>${escapeHtml(t("PETCOMMAND.Labels.Automatic"))}</dt><dd>${auto}%</dd></div>
              <div><dt>${escapeHtml(t("PETCOMMAND.Labels.Effective"))}</dt><dd>${effective}%</dd></div>
              <div><dt>${escapeHtml(t("PETCOMMAND.Labels.BondLevel"))}</dt><dd>${escapeHtml(t(level.labelKey))}</dd></div>
              <div><dt>${escapeHtml(t("PETCOMMAND.Labels.Commands"))}</dt><dd>${relationship.commandCount}</dd></div>
              <div><dt>${escapeHtml(t("PETCOMMAND.Labels.Record"))}</dt><dd>${relationship.successCount} / ${relationship.failureCount}</dd></div>
            </dl>
          </article>

          <article class="pc-card">
            <h3>${escapeHtml(t("PETCOMMAND.Command.Adjustment"))}</h3>
            <label class="pc-field compact">
              <span>${escapeHtml(t("PETCOMMAND.Labels.XP"))}</span>
              <div class="pc-inline"><input name="relationshipXp" type="number" min="0" step="0.25" value="${relationship.xp}"><button type="button" data-action="save-xp">${escapeHtml(
                t("PETCOMMAND.ActionsUi.Save"),
              )}</button></div>
            </label>
            <label class="pc-field compact">
              <span>${escapeHtml(t("PETCOMMAND.Labels.ManualObedience"))}: <strong data-manual-value>${effective}%</strong></span>
              <input name="manualObedience" type="range" min="0" max="100" step="1" value="${effective}">
            </label>
            <div class="pc-inline wrap">
              <button type="button" data-action="save-manual"><i class="fa-solid fa-sliders"></i> ${escapeHtml(t("PETCOMMAND.ActionsUi.UseManual"))}</button>
              <button type="button" data-action="reset-manual"><i class="fa-solid fa-rotate-left"></i> ${escapeHtml(t("PETCOMMAND.ActionsUi.ResetAutomatic"))}</button>
              ${relationship.manualObedience === null ? `<span class="pc-note">${escapeHtml(t("PETCOMMAND.Command.AutomaticActive"))}</span>` : `<span class="pc-note warning">${escapeHtml(
                t("PETCOMMAND.Command.ManualActive"),
              )}</span>`}
            </div>
          </article>
        </div>

        <form id="pc-roll-form" class="pc-stack ${terminated ? "is-disabled" : ""}">
          <div class="pc-grid three">
            <label class="pc-field">
              <span>${escapeHtml(t("PETCOMMAND.Labels.Command"))}</span>
              <select name="commandId" ${terminated ? "disabled" : ""}>
                ${COMMANDS.map((entry) => option(entry.id, commandDisplay(entry, profile).label, entry.id === command.id)).join("")}
              </select>
              <small>${escapeHtml(t("PETCOMMAND.Command.DifficultyHelp"))}</small>
            </label>
            ${renderCommandTargetField(command)}
            <div class="pc-dc difficulty-${display.band}">
              <span>${escapeHtml(t("PETCOMMAND.Labels.Threshold"))}</span>
              <strong>${dc}</strong>
              <small>${escapeHtml(t("PETCOMMAND.Command.DcBreakdown", {
                base: baseDc,
                command: signedModifier(display.difficulty.base),
                attitude: signedModifier(display.difficulty.attitude),
                attitudeName: t(ATTITUDE_PRESETS[profile?.attitude]?.labelKey ?? "PETCOMMAND.Attitudes.Docile"),
              }))}</small>
            </div>
          </div>

          <fieldset>
            <legend>${escapeHtml(t("PETCOMMAND.Command.RandomFailureTargets"))}</legend>
            <div class="pc-checkbox-grid">${renderPoolCheckboxes(pools)}</div>
          </fieldset>

          <div class="pc-checkbox-grid options">
            <label class="pc-check"><input type="checkbox" name="includeBehaviour" ${checked(configuration.autoBehaviourOnFailure)}><span>${escapeHtml(
              t("PETCOMMAND.Command.RollBehaviourOnFailure"),
            )}</span></label>
            <label class="pc-check"><input type="checkbox" name="postToChat" checked><span>${escapeHtml(t("PETCOMMAND.Command.PostToChat"))}</span></label>
            <label class="pc-check"><input type="checkbox" name="executeMovement" ${checked(configuration.movementEnabled)}><span>${escapeHtml(
              t("PETCOMMAND.Command.ExecuteMovement"),
            )}</span></label>
          </div>

          <div class="pc-actions">
            <button type="button" class="primary" data-action="roll-sequence" ${terminated ? "disabled" : ""}><i class="fa-solid fa-dice-d20"></i> ${escapeHtml(
              t("PETCOMMAND.ActionsUi.RollSequence"),
            )}</button>
            <button type="button" data-action="roll-obedience" ${terminated ? "disabled" : ""}><i class="fa-solid fa-check"></i> ${escapeHtml(
              t("PETCOMMAND.ActionsUi.RollObedience"),
            )}</button>
            <button type="button" data-action="roll-behaviour" ${terminated ? "disabled" : ""}><i class="fa-solid fa-shuffle"></i> ${escapeHtml(
              t("PETCOMMAND.ActionsUi.RollBehaviour"),
            )}</button>
          </div>
        </form>

        ${this.#renderLastResult()}
      </section>`;
  }

  #renderLastResult() {
    if (!this.lastResult) return "";
    return `<article class="pc-result ${this.lastResult.kind ?? ""}"><h3>${escapeHtml(this.lastResult.title)}</h3><p>${escapeHtml(this.lastResult.body)}</p></article>`;
  }

  #renderRelationshipsTab(state, configuration, relationships) {
    const pendingActor = this.pendingActorId ? game.actors.get(this.pendingActorId) : null;
    return `
      <section class="pc-panel">
        <div class="pc-panel-header"><div><h2>${escapeHtml(t("PETCOMMAND.Relationships.Title"))}</h2><p>${escapeHtml(
          t("PETCOMMAND.Relationships.Help"),
        )}</p></div><span class="pc-badge">${relationships.length}</span></div>

        <form id="pc-create-form" class="pc-card pc-stack">
          <h3>${escapeHtml(t("PETCOMMAND.Relationships.RegisterPet"))}</h3>
          <div class="pc-grid three">
            <label class="pc-field">
              <span>${escapeHtml(t("PETCOMMAND.Labels.PetActor"))}</span>
              <select name="petActorId">${actorOptions(pendingActor?.id)}</select>
            </label>
            <label class="pc-field">
              <span>${escapeHtml(t("PETCOMMAND.Labels.Attitude"))}</span>
              <select name="attitude">${Object.entries(ATTITUDE_PRESETS).map(([id, preset]) => option(id, t(preset.labelKey), id === "docile")).join("")}</select>
            </label>
            <div class="pc-field">
              <span>${escapeHtml(t("PETCOMMAND.Relationships.SceneSelection"))}</span>
              <button type="button" data-action="use-controlled-token"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(t("PETCOMMAND.ActionsUi.UseSelectedToken"))}</button>
            </div>
          </div>
          <label class="pc-field">
            <span>${escapeHtml(t("PETCOMMAND.Labels.Owners"))}</span>
            <select name="ownerActorIds" multiple size="7">${actorOptions(null, pendingActor?.id)}</select>
            <small>${escapeHtml(t("PETCOMMAND.Relationships.OwnerHelp"))}</small>
          </label>
          <div class="pc-actions"><button type="button" class="primary" data-action="create-relationships" disabled><i class="fa-solid fa-link"></i> ${escapeHtml(
            t("PETCOMMAND.ActionsUi.CreateRelationships"),
          )}</button></div>
        </form>

        <div class="pc-table-wrap">
          <table class="pc-table">
            <thead><tr>
              <th>${escapeHtml(t("PETCOMMAND.Labels.Pet"))}</th>
              <th>${escapeHtml(t("PETCOMMAND.Labels.Owner"))}</th>
              <th>${escapeHtml(t("PETCOMMAND.Labels.XP"))}</th>
              <th>${escapeHtml(t("PETCOMMAND.Labels.Obedience"))}</th>
              <th>${escapeHtml(t("PETCOMMAND.Relationships.PlayerBehaviourTargets"))}</th>
              <th>${escapeHtml(t("PETCOMMAND.Labels.Status"))}</th>
              <th>${escapeHtml(t("PETCOMMAND.Labels.Actions"))}</th>
            </tr></thead>
            <tbody>
              ${relationships.length ? relationships.map((relationship) => {
                const effective = effectiveObedience(relationship, configuration);
                return `<tr>
                  <td>${escapeHtml(relationship.petNameSnapshot)}</td>
                  <td>${escapeHtml(relationship.ownerNameSnapshot)}</td>
                  <td>${relationship.xp}</td>
                  <td>${effective}%${relationship.manualObedience === null ? "" : " *"}</td>
                  <td><label class="pc-check pc-table-check" title="${escapeHtml(t("PETCOMMAND.Relationships.PlayerBehaviourTargetsHelp"))}">
                    <input type="checkbox" data-action="toggle-player-behaviour-targets" data-id="${relationship.id}" ${checked(relationship.playerBehaviourTargetsEnabled)}>
                    <span>${escapeHtml(t(relationship.playerBehaviourTargetsEnabled ? "PETCOMMAND.Common.Enabled" : "PETCOMMAND.Common.Disabled"))}</span>
                  </label></td>
                  <td><div class="pc-status-cell">${statusBadge(relationship.status)}${relationship.terminationReason ? `<small title="${escapeHtml(
                    relationship.terminationReason,
                  )}">${escapeHtml(relationship.terminationReason)}</small>` : ""}</div></td>
                  <td><div class="pc-row-actions">
                    <button type="button" data-action="select-relationship" data-id="${relationship.id}" title="${escapeHtml(t("PETCOMMAND.ActionsUi.Open"))}"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
                    <button type="button" data-action="open-owner-perspective" data-owner-id="${escapeHtml(relationship.ownerActorId ?? "")}" title="${escapeHtml(t("PETCOMMAND.ActionsUi.OpenOwnerPerspective"))}" ${relationship.ownerActorId ? "" : "disabled"}><i class="fa-solid fa-user-tag"></i></button>
                    ${relationship.status === RELATIONSHIP_STATUS.ACTIVE
                      ? `<button type="button" data-action="terminate-relationship" data-id="${relationship.id}" title="${escapeHtml(t("PETCOMMAND.ActionsUi.Terminate"))}"><i class="fa-solid fa-link-slash"></i></button>`
                      : `<button type="button" data-action="restore-relationship" data-id="${relationship.id}" title="${escapeHtml(t("PETCOMMAND.ActionsUi.Restore"))}"><i class="fa-solid fa-link"></i></button>`}
                    <button type="button" data-action="export-relationship" data-id="${relationship.id}" title="${escapeHtml(t("PETCOMMAND.ActionsUi.Export"))}"><i class="fa-solid fa-file-export"></i></button>
                    <button type="button" data-action="delete-relationship" data-id="${relationship.id}" title="${escapeHtml(t("PETCOMMAND.ActionsUi.Delete"))}"><i class="fa-solid fa-trash"></i></button>
                  </div></td>
                </tr>`;
              }).join("") : `<tr><td colspan="7" class="pc-muted">${escapeHtml(t("PETCOMMAND.Empty.NoRelationships"))}</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  #renderProfileTab(state, profile) {
    const profiles = sortedPetProfiles(state);
    if (!profile) return `<section class="pc-empty"><i class="fa-solid fa-paw"></i><h2>${escapeHtml(t("PETCOMMAND.Empty.NoPets"))}</h2></section>`;
    const slots = buildD20Slots(profile.actionWeights);
    const attacks = attackChoices(profile);
    const currentAttackKey = selectedAttackKey(profile);
    return `
      <section class="pc-panel">
        <div class="pc-panel-header"><div><h2>${escapeHtml(t("PETCOMMAND.Profile.Title"))}</h2><p>${escapeHtml(t("PETCOMMAND.Profile.Help"))}</p></div></div>
        <form id="pc-profile-form" class="pc-stack">
          <div class="pc-grid three">
            <label class="pc-field span-2"><span>${escapeHtml(t("PETCOMMAND.Labels.Pet"))}</span><select name="petActorUuid">${profiles
              .map((entry) => option(entry.actorUuid, entry.nameSnapshot, entry.actorUuid === profile.actorUuid))
              .join("")}</select></label>
            <label class="pc-field"><span>${escapeHtml(t("PETCOMMAND.Labels.Attitude"))}</span><select name="attitude">${Object.entries(ATTITUDE_PRESETS)
              .map(([id, preset]) => option(id, t(preset.labelKey), id === profile.attitude))
              .join("")}</select></label>
          </div>

          <label class="pc-field">
            <span>${escapeHtml(t("PETCOMMAND.Profile.DefaultAttack"))}</span>
            <select name="defaultAttack">
              ${option("", t("PETCOMMAND.Profile.DefaultAttackAutomatic"), !currentAttackKey)}
              ${attacks.map((attack) => option(attack.key, attack.label, attack.key === currentAttackKey)).join("")}
            </select>
            <small>${escapeHtml(attacks.length ? t("PETCOMMAND.Profile.DefaultAttackHelp") : t("PETCOMMAND.Profile.NoAttacksFound"))}</small>
          </label>

          <div class="pc-grid two">
            <fieldset><legend>${escapeHtml(t("PETCOMMAND.Profile.TargetPools"))}</legend><div class="pc-checkbox-grid">${renderPoolCheckboxes(
              profile.targetPools,
              "profilePools",
            )}</div></fieldset>
            <fieldset><legend>${escapeHtml(t("PETCOMMAND.Profile.Movement"))}</legend><label class="pc-check"><input type="checkbox" name="movementEnabled" ${checked(
              profile.movementEnabled,
            )}><span>${escapeHtml(t("PETCOMMAND.Profile.AllowMovement"))}</span></label><p class="pc-note">${escapeHtml(t("PETCOMMAND.Profile.MovementHelp"))}</p></fieldset>
          </div>

          <div class="pc-panel-header compact"><div><h3>${escapeHtml(t("PETCOMMAND.Profile.ActionWeights"))}</h3><p>${escapeHtml(
            t("PETCOMMAND.Profile.ActionWeightsHelp"),
          )}</p></div><button type="button" data-action="apply-attitude-preset"><i class="fa-solid fa-wand-magic-sparkles"></i> ${escapeHtml(
            t("PETCOMMAND.ActionsUi.ApplyPreset"),
          )}</button></div>

          <div class="pc-weight-grid">
            ${ACTIONS.map(
              (action) => `<label class="pc-weight"><span>${escapeHtml(t(action.labelKey))}</span><input type="number" min="0" max="1000" step="0.25" name="weight.${action.id}" value="${
                profile.actionWeights[action.id]
              }"></label>`,
            ).join("")}
          </div>

          <div class="pc-card"><h3>${escapeHtml(t("PETCOMMAND.Profile.EffectiveTable"))}</h3><ol class="pc-d20-table">${slots
            .map((actionId, index) => `<li><strong>${index + 1}</strong><span>${escapeHtml(t(ACTION_BY_ID[actionId]?.labelKey ?? actionId))}</span></li>`)
            .join("")}</ol></div>

          <div class="pc-actions"><button type="button" class="primary" data-action="save-profile"><i class="fa-solid fa-floppy-disk"></i> ${escapeHtml(
            t("PETCOMMAND.ActionsUi.SaveProfile"),
          )}</button></div>
        </form>
      </section>`;
  }

  #renderDataTab(state) {
    const diagnostics = this.store.diagnostics();
    const relationships = Object.values(state.relationships);
    const pets = Object.values(state.pets);
    return `
      <section class="pc-panel">
        <div class="pc-panel-header"><div><h2>${escapeHtml(t("PETCOMMAND.Data.Title"))}</h2><p>${escapeHtml(t("PETCOMMAND.Data.Help"))}</p></div></div>
        <div class="pc-grid two">
          <article class="pc-card pc-stack">
            <h3>${escapeHtml(t("PETCOMMAND.Data.Export"))}</h3>
            <button type="button" data-action="export-all"><i class="fa-solid fa-box-archive"></i> ${escapeHtml(t("PETCOMMAND.ActionsUi.ExportAll"))}</button>
            <label class="pc-field"><span>${escapeHtml(t("PETCOMMAND.Labels.Pet"))}</span><select name="exportPetUuid">${pets
              .map((profile) => option(profile.actorUuid, profile.nameSnapshot))
              .join("")}</select></label>
            <button type="button" data-action="export-pet" ${pets.length ? "" : "disabled"}><i class="fa-solid fa-paw"></i> ${escapeHtml(
              t("PETCOMMAND.ActionsUi.ExportPet"),
            )}</button>
            <label class="pc-field"><span>${escapeHtml(t("PETCOMMAND.Labels.Relationship"))}</span><select name="exportRelationshipId">${relationships
              .map((relationship) => option(relationship.id, relationshipLabel(relationship)))
              .join("")}</select></label>
            <button type="button" data-action="export-selected-relationship" ${relationships.length ? "" : "disabled"}><i class="fa-solid fa-link"></i> ${escapeHtml(
              t("PETCOMMAND.ActionsUi.ExportRelationship"),
            )}</button>
          </article>

          <article class="pc-card pc-stack">
            <h3>${escapeHtml(t("PETCOMMAND.Data.Import"))}</h3>
            <label class="pc-field"><span>${escapeHtml(t("PETCOMMAND.Data.JsonFile"))}</span><input type="file" name="importFile" accept="application/json,.json"></label>
            <label class="pc-field"><span>${escapeHtml(t("PETCOMMAND.Data.ImportMode"))}</span><select name="importMode"><option value="merge">${escapeHtml(
              t("PETCOMMAND.Data.Merge"),
            )}</option><option value="replace">${escapeHtml(t("PETCOMMAND.Data.Replace"))}</option></select></label>
            <button type="button" class="primary" data-action="import-json" disabled><i class="fa-solid fa-file-import"></i> ${escapeHtml(t("PETCOMMAND.ActionsUi.Import"))}</button>
            <hr>
            <button type="button" data-action="restore-backup" ${diagnostics.backups ? "" : "disabled"}><i class="fa-solid fa-clock-rotate-left"></i> ${escapeHtml(
              t("PETCOMMAND.ActionsUi.RestoreBackup"),
            )}</button>
            <small>${escapeHtml(t("PETCOMMAND.Data.BackupCount", { count: diagnostics.backups }))}</small>
          </article>
        </div>

        <article class="pc-card">
          <h3>${escapeHtml(t("PETCOMMAND.Data.Diagnostics"))}</h3>
          <dl class="pc-stats diagnostics">
            <div><dt>${escapeHtml(t("PETCOMMAND.Data.Schema"))}</dt><dd>${diagnostics.schemaVersion}</dd></div>
            <div><dt>${escapeHtml(t("PETCOMMAND.Data.Revision"))}</dt><dd>${diagnostics.revision}</dd></div>
            <div><dt>${escapeHtml(t("PETCOMMAND.Labels.Pets"))}</dt><dd>${diagnostics.pets}</dd></div>
            <div><dt>${escapeHtml(t("PETCOMMAND.Labels.Relationships"))}</dt><dd>${diagnostics.relationships}</dd></div>
            <div><dt>${escapeHtml(t("PETCOMMAND.Status.Active"))}</dt><dd>${diagnostics.activeRelationships}</dd></div>
            <div><dt>${escapeHtml(t("PETCOMMAND.Status.Terminated"))}</dt><dd>${diagnostics.terminatedRelationships}</dd></div>
            <div><dt>${escapeHtml(t("PETCOMMAND.Data.Orphans"))}</dt><dd>${diagnostics.orphanRelationships.length}</dd></div>
            <div><dt>${escapeHtml(t("PETCOMMAND.Data.Duplicates"))}</dt><dd>${diagnostics.duplicatePairs.length}</dd></div>
          </dl>
        </article>
      </section>`;
  }

  async #handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.action;
    try {
      if (action === "switch-tab") return await this.#switchTab(button.dataset.tab);
      if (action === "use-controlled-token") return await this.#useControlledToken();
      if (action === "create-relationships") return await this.#createRelationships();
      if (action === "select-relationship") {
        this.selectedRelationshipId = button.dataset.id;
        this.activeTab = "command";
        return await this.render();
      }
      if (action === "open-owner-perspective") {
        return defaultOpenOwnerPerspective?.({ actorId: button.dataset.ownerId });
      }
      if (action === "save-xp") return await this.#saveXp();
      if (action === "save-manual") return await this.#saveManual();
      if (action === "reset-manual") return await this.#resetManual();
      if (action === "roll-sequence") return await this.#roll("sequence");
      if (action === "roll-obedience") return await this.#roll("obedience");
      if (action === "roll-behaviour") return await this.#roll("behaviour");
      if (action === "terminate-relationship") return await this.#setRelationshipStatus(button.dataset.id, RELATIONSHIP_STATUS.TERMINATED);
      if (action === "restore-relationship") return await this.#setRelationshipStatus(button.dataset.id, RELATIONSHIP_STATUS.ACTIVE);
      if (action === "delete-relationship") return await this.#deleteRelationship(button.dataset.id);
      if (action === "export-relationship") return this.#exportRelationship(button.dataset.id);
      if (action === "apply-attitude-preset") return await this.#applyAttitudePreset();
      if (action === "save-profile") return await this.#saveProfile();
      if (action === "export-all") return this.#exportAll();
      if (action === "export-pet") return this.#exportPet();
      if (action === "export-selected-relationship") return this.#exportSelectedRelationship();
      if (action === "import-json") return await this.#importJson();
      if (action === "restore-backup") return await this.#restoreBackup();
    } catch (error) {
      if (isUserInputError(error)) {
        notify("warn", error.message ?? String(error));
        const field = error.fieldName ? this.element.querySelector(`[name="${error.fieldName}"]`) : null;
        field?.setAttribute("aria-invalid", "true");
        field?.focus();
        return;
      }
      console.error(`${MODULE_ID} | UI action failed`, error);
      notify("error", error.message ?? String(error));
    }
  }

  async #handleChange(event) {
    const target = event.target;
    if (target.dataset.action === "toggle-player-behaviour-targets") {
      await this.#setPlayerBehaviourTargetAccess(target.dataset.id, target.checked);
      return;
    }
    if (target.name === "relationshipId") {
      this.selectedRelationshipId = target.value;
      await this.render();
    } else if (target.name === "commandId") {
      this.selectedCommandId = target.value;
      await this.render();
    } else if (target.name === "petActorUuid") {
      this.selectedPetActorUuid = target.value;
      await this.render();
    } else if (target.name === "petActorId") {
      this.pendingActorId = target.value;
      target.removeAttribute("aria-invalid");
    } else if (target.name === "ownerActorIds") {
      target.removeAttribute("aria-invalid");
      const button = this.element.querySelector('[data-action="create-relationships"]');
      if (button) button.disabled = selectedValues(target).length === 0;
    } else if (target.name === "importFile") {
      target.removeAttribute("aria-invalid");
      const button = this.element.querySelector('[data-action="import-json"]');
      if (button) button.disabled = !target.files?.length;
    }
  }

  #handleInput(event) {
    if (event.target.name === "manualObedience") {
      const label = this.element.querySelector("[data-manual-value]");
      if (label) label.textContent = `${event.target.value}%`;
    }
  }

  #handleKeydown(event) {
    const currentTab = event.target.closest('[role="tab"][data-action="switch-tab"]');
    if (!currentTab) return;
    const currentIndex = MANAGER_TABS.indexOf(currentTab.dataset.tab);
    if (currentIndex < 0) return;

    let nextIndex = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % MANAGER_TABS.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + MANAGER_TABS.length) % MANAGER_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = MANAGER_TABS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    this.#switchTab(MANAGER_TABS[nextIndex], { focus: true }).catch((error) => {
      console.error(`${MODULE_ID} | Keyboard tab navigation failed`, error);
      notify("error", error.message ?? String(error));
    });
  }

  async #switchTab(tab, { focus = true } = {}) {
    if (!MANAGER_TABS.includes(tab) || tab === this.activeTab) return;
    this.activeTab = tab;
    await this.render();
    if (focus) this.element.querySelector(`[data-action="switch-tab"][data-tab="${tab}"]`)?.focus();
  }

  async #useControlledToken() {
    const token = controlledToken();
    if (!token) throw new UserInputError(t("PETCOMMAND.Errors.SelectOneToken"));
    this.pendingTokenDocument = token.document;
    this.pendingActorId = token.document.baseActor?.id ?? token.actor?.id ?? token.document.actorId;
    await this.render();
    notify("info", t("PETCOMMAND.Notifications.TokenSelected", { name: token.name }));
  }

  async #createRelationships() {
    const form = this.element.querySelector("#pc-create-form");
    const petActorId = form.querySelector('[name="petActorId"]').value;
    const petActor = game.actors.get(petActorId);
    if (!petActor) throw new UserInputError(t("PETCOMMAND.Errors.PetActorRequired"), { fieldName: "petActorId" });
    const ownerIds = selectedValues(form.querySelector('[name="ownerActorIds"]')).filter((id) => id !== petActorId);
    if (!ownerIds.length) throw new UserInputError(t("PETCOMMAND.Errors.OwnerRequired"), { fieldName: "ownerActorIds" });
    const attitude = form.querySelector('[name="attitude"]').value;
    const tokenDocument = this.pendingTokenDocument && (this.pendingTokenDocument.baseActor?.id ?? this.pendingTokenDocument.actorId) === petActorId ? this.pendingTokenDocument : null;
    const petRef = actorReference(petActor, tokenDocument);
    const createdIds = [];

    await this.store.mutate(
      (draft) => {
        let profile = draft.pets[petRef.actorUuid];
        if (!profile) {
          profile = createPetProfile({ ...petRef, attitude });
          draft.pets[petRef.actorUuid] = profile;
        } else if (tokenDocument) {
          profile.preferredTokenUuid = tokenDocument.uuid;
          profile.updatedAt = new Date().toISOString();
        }
        const relationshipsByOwner = new Map(
          Object.values(draft.relationships)
            .filter((relationship) => relationship.petActorUuid === petRef.actorUuid)
            .map((relationship) => [relationship.ownerActorUuid, relationship]),
        );
        const createdAt = new Date().toISOString();
        for (const ownerId of ownerIds) {
          const owner = game.actors.get(ownerId);
          if (!owner) continue;
          const ownerRef = actorReference(owner);
          const duplicate = relationshipsByOwner.get(ownerRef.actorUuid);
          if (duplicate) {
            createdIds.push(duplicate.id);
            continue;
          }
          const id = randomId("relationship-");
          const relationship = createRelationship({ id, pet: petRef, owner: ownerRef, now: createdAt });
          draft.relationships[id] = relationship;
          relationshipsByOwner.set(ownerRef.actorUuid, relationship);
          draft.history.push({ id: randomId("history-"), type: "relationship-created", relationshipId: id, createdAt });
          createdIds.push(id);
        }
      },
      { backup: true, reason: "create-relationships" },
    );

    this.selectedRelationshipId = createdIds[0] ?? this.selectedRelationshipId;
    this.selectedPetActorUuid = petRef.actorUuid;
    this.activeTab = "command";
    this.pendingActorId = null;
    this.pendingTokenDocument = null;
    notify("info", t("PETCOMMAND.Notifications.RelationshipsCreated", { count: createdIds.length }));
  }

  async #saveXp() {
    const value = Number(this.element.querySelector('[name="relationshipXp"]').value);
    if (!Number.isFinite(value) || value < 0) throw new UserInputError(t("PETCOMMAND.Errors.InvalidXp"), { fieldName: "xp" });
    await this.store.mutate(
      (draft) => {
        draft.relationships[this.selectedRelationshipId].xp = roundTo(value, 3);
        draft.relationships[this.selectedRelationshipId].updatedAt = new Date().toISOString();
      },
      { backup: true, reason: "manual-xp" },
    );
  }

  async #saveManual() {
    const value = Number(this.element.querySelector('[name="manualObedience"]').value);
    await this.store.mutate(
      (draft) => {
        draft.relationships[this.selectedRelationshipId].manualObedience = Math.round(Math.min(100, Math.max(0, value)));
        draft.relationships[this.selectedRelationshipId].updatedAt = new Date().toISOString();
      },
      { backup: true, reason: "manual-obedience" },
    );
  }

  async #resetManual() {
    await this.store.mutate(
      (draft) => {
        draft.relationships[this.selectedRelationshipId].manualObedience = null;
        draft.relationships[this.selectedRelationshipId].updatedAt = new Date().toISOString();
      },
      { backup: true, reason: "reset-obedience" },
    );
  }

  async #roll(kind) {
    const form = this.element.querySelector("#pc-roll-form");
    const options = {
      relationshipId: this.selectedRelationshipId,
      commandId: form.querySelector('[name="commandId"]').value,
      targetTokenId: form.querySelector('[name="targetTokenId"]').value,
      targetPools: readPools(form),
      includeBehaviour: form.querySelector('[name="includeBehaviour"]').checked,
      postToChat: form.querySelector('[name="postToChat"]').checked,
      executeMovement: form.querySelector('[name="executeMovement"]').checked,
    };
    this.selectedCommandId = options.commandId;
    if (kind === "sequence") {
      const result = await this.rollService.rollCommandSequence(options);
      const obedience = result.obedience;
      this.lastResult = {
        kind: obedience.outcome,
        title: t(obedience.outcome === "success" ? "PETCOMMAND.Results.Success" : "PETCOMMAND.Results.Failure"),
        body: result.behaviour
          ? t("PETCOMMAND.Results.SequenceWithBehaviour", { total: obedience.roll.total, dc: obedience.dc, action: t(result.behaviour.action.labelKey) })
          : result.attack?.used
            ? t("PETCOMMAND.Results.SequenceWithAttack", { total: obedience.roll.total, dc: obedience.dc, attack: result.attack.attackLabel, target: result.attack.targetName })
            : result.attack
              ? t("PETCOMMAND.Results.SequenceAttackUnavailable", { total: obedience.roll.total, dc: obedience.dc, reason: t(`PETCOMMAND.AttackReasons.${result.attack.reason}`) })
              : t("PETCOMMAND.Results.ObedienceSummary", { total: obedience.roll.total, dc: obedience.dc, xp: obedience.xpAward }),
      };
    } else if (kind === "obedience") {
      const result = await this.rollService.rollObedience(options);
      this.lastResult = {
        kind: result.outcome,
        title: t(result.outcome === "success" ? "PETCOMMAND.Results.Success" : "PETCOMMAND.Results.Failure"),
        body: t("PETCOMMAND.Results.ObedienceSummary", { total: result.roll.total, dc: result.dc, xp: result.xpAward }),
      };
    } else {
      const result = await this.rollService.rollBehaviour({ ...options, targetTokenId: null });
      this.lastResult = {
        kind: "behaviour",
        title: t("PETCOMMAND.Results.RandomBehaviour"),
        body: t("PETCOMMAND.Results.BehaviourSummary", { slot: result.slot, action: t(result.action.labelKey), target: result.targetToken?.name ?? t("PETCOMMAND.Labels.NoTarget") }),
      };
    }
    await this.render();
  }

  async #setPlayerBehaviourTargetAccess(id, enabled) {
    await this.store.mutate(
      (draft) => {
        const relationship = draft.relationships[id];
        if (!relationship) throw new UserInputError(t("PETCOMMAND.Errors.RelationshipMissing"));
        relationship.playerBehaviourTargetsEnabled = Boolean(enabled);
        relationship.updatedAt = new Date().toISOString();
        draft.history.push({
          id: randomId("history-"),
          type: "player-behaviour-target-access",
          relationshipId: id,
          enabled: Boolean(enabled),
          createdAt: relationship.updatedAt,
        });
      },
      { backup: true, reason: "player-behaviour-target-access" },
    );
  }

  async #setRelationshipStatus(id, status) {
    let terminationReason = "";
    if (status === RELATIONSHIP_STATUS.TERMINATED) {
      const response = await DialogV2.input({
        window: { title: t("PETCOMMAND.Confirm.TerminateTitle") },
        content: `<label class="pc-field"><span>${escapeHtml(t("PETCOMMAND.Labels.TerminationReason"))}</span><input name="reason" type="text" maxlength="240" autofocus></label><p class="pc-note">${escapeHtml(
          t("PETCOMMAND.Confirm.TerminateHelp"),
        )}</p>`,
        ok: { label: t("PETCOMMAND.ActionsUi.Terminate") },
        modal: true,
        rejectClose: false,
      });
      if (!response) return;
      terminationReason = String(response.reason ?? "").trim().slice(0, 240);
    }

    await this.store.mutate(
      (draft) => {
        const relationship = draft.relationships[id];
        relationship.status = status;
        relationship.terminatedAt = status === RELATIONSHIP_STATUS.TERMINATED ? new Date().toISOString() : null;
        relationship.terminationReason = status === RELATIONSHIP_STATUS.TERMINATED ? terminationReason : "";
        relationship.updatedAt = new Date().toISOString();
        draft.history.push({
          id: randomId("history-"),
          type: status === RELATIONSHIP_STATUS.TERMINATED ? "relationship-terminated" : "relationship-restored",
          relationshipId: id,
          terminationReason: status === RELATIONSHIP_STATUS.TERMINATED ? terminationReason : null,
          createdAt: new Date().toISOString(),
        });
      },
      { backup: true, reason: `relationship-${status}` },
    );
  }

  async #deleteRelationship(id) {
    const confirmed = await DialogV2.confirm({
      window: { title: t("PETCOMMAND.Confirm.DeleteTitle") },
      content: `<p>${escapeHtml(t("PETCOMMAND.Confirm.DeleteRelationship"))}</p>`,
      modal: true,
      rejectClose: false,
    });
    if (!confirmed) return;
    await this.store.mutate(
      (draft) => {
        delete draft.relationships[id];
        draft.history.push({ id: randomId("history-"), type: "relationship-deleted", relationshipId: id, createdAt: new Date().toISOString() });
      },
      { backup: true, reason: "delete-relationship" },
    );
    if (this.selectedRelationshipId === id) this.selectedRelationshipId = null;
  }

  #exportRelationship(id) {
    downloadJson(`pet-command-relationship-${id}.json`, this.store.exportEnvelope({ relationshipIds: [id] }));
  }

  async #applyAttitudePreset() {
    const form = this.element.querySelector("#pc-profile-form");
    const attitude = form.querySelector('[name="attitude"]').value;
    const preset = ATTITUDE_PRESETS[attitude] ?? ATTITUDE_PRESETS.docile;
    for (const [actionId, weight] of Object.entries(preset.weights)) {
      const input = form.querySelector(`[name="weight.${actionId}"]`);
      if (input) input.value = weight;
    }
  }

  async #saveProfile() {
    const form = this.element.querySelector("#pc-profile-form");
    const actorUuid = form.querySelector('[name="petActorUuid"]').value;
    const attitude = form.querySelector('[name="attitude"]').value;
    const weights = Object.fromEntries(ACTIONS.map((action) => [action.id, Number(form.querySelector(`[name="weight.${action.id}"]`).value)]));
    const targetPools = readPools(form, "profilePools");
    const movementEnabled = form.querySelector('[name="movementEnabled"]').checked;
    const attackSelection = parseAttackKey(form.querySelector('[name="defaultAttack"]').value);
    await this.store.mutate(
      (draft) => {
        const profile = draft.pets[actorUuid];
        profile.attitude = ATTITUDE_PRESETS[attitude] ? attitude : "docile";
        profile.actionWeights = normalizeWeights(weights, profile.attitude);
        profile.customWeights = true;
        profile.targetPools = normalizeTargetPools(targetPools);
        profile.movementEnabled = movementEnabled;
        profile.defaultAttackItemId = attackSelection.itemId;
        profile.defaultAttackActivityId = attackSelection.activityId;
        profile.updatedAt = new Date().toISOString();
      },
      { backup: true, reason: "save-pet-profile" },
    );
    this.selectedPetActorUuid = actorUuid;
    notify("info", t("PETCOMMAND.Notifications.ProfileSaved"));
  }

  #exportAll() {
    downloadJson(`pet-command-all-${new Date().toISOString().slice(0, 10)}.json`, this.store.exportEnvelope());
  }

  #exportPet() {
    const uuid = this.element.querySelector('[name="exportPetUuid"]').value;
    downloadJson(`pet-command-pet-${uuid.replaceAll(".", "-")}.json`, this.store.exportEnvelope({ petActorUuids: [uuid] }));
  }

  #exportSelectedRelationship() {
    const id = this.element.querySelector('[name="exportRelationshipId"]').value;
    this.#exportRelationship(id);
  }

  async #importJson() {
    const file = this.element.querySelector('[name="importFile"]').files[0];
    const mode = this.element.querySelector('[name="importMode"]').value;
    const data = await readJsonFile(file);
    if (mode === "replace") {
      const confirmed = await DialogV2.confirm({
        window: { title: t("PETCOMMAND.Confirm.ReplaceTitle") },
        content: `<p>${escapeHtml(t("PETCOMMAND.Confirm.ReplaceData"))}</p>`,
        modal: true,
        rejectClose: false,
      });
      if (!confirmed) return;
      await this.store.replaceState(data, { backup: true, reason: "import-replace" });
    } else {
      await this.store.mergeState(data);
    }
    notify("info", t("PETCOMMAND.Notifications.ImportComplete"));
  }

  async #restoreBackup() {
    const confirmed = await DialogV2.confirm({
      window: { title: t("PETCOMMAND.Confirm.RestoreTitle") },
      content: `<p>${escapeHtml(t("PETCOMMAND.Confirm.RestoreBackup"))}</p>`,
      modal: true,
      rejectClose: false,
    });
    if (!confirmed) return;
    await this.store.restoreLatestBackup();
  }
}


export class PetCommandPlayerPanel extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "pet-command-player-panel",
    classes: ["pet-command", "pet-command-player", "standard-form"],
    tag: "div",
    window: { title: "PETCOMMAND.App.PlayerTitle", icon: "fa-solid fa-paw", resizable: true },
    position: { width: 650, height: 620 },
  };

  constructor({ store, rollService, ownerActorId = null, ownerTokenDocument = null, perspectiveMode = false, ...options } = {}) {
    const perspectiveTitle = perspectiveMode ? t("PETCOMMAND.App.OwnerPerspectiveTitle") : t("PETCOMMAND.App.PlayerTitle");
    super({
      ...options,
      window: { ...(options.window ?? {}), title: options.window?.title ?? perspectiveTitle },
    });
    this.store = store ?? defaultStore;
    this.rollService = rollService ?? defaultRollService;
    this.perspectiveMode = Boolean(perspectiveMode);
    this.ownerActorId = ownerActorId ?? ownerTokenDocument?.baseActor?.id ?? ownerTokenDocument?.actorId ?? null;
    this.ownerTokenId = ownerTokenDocument?.id ?? null;
    this.selectedRelationshipId = null;
    this.selectedCommandId = "come";
    this.lastResult = null;
    this.busy = false;
    this.behaviourTargetPoolsByRelationship = new Map();
    this._listenerController = null;
  }

  setPerspective({ actorId = null, tokenDocument = null } = {}) {
    this.perspectiveMode = true;
    this.ownerActorId = actorId ?? tokenDocument?.baseActor?.id ?? tokenDocument?.actorId ?? null;
    this.ownerTokenId = tokenDocument?.id ?? null;
    this.selectedRelationshipId = null;
    this.selectedCommandId = "come";
    this.lastResult = null;
    this.behaviourTargetPoolsByRelationship.clear();
  }

  #isOwnerPerspective() {
    return this.perspectiveMode && Boolean(game.user?.isGM);
  }

  #ownerActor() {
    return this.ownerActorId ? game.actors?.get(this.ownerActorId) ?? null : null;
  }

  #relationships() {
    return this.#isOwnerPerspective()
      ? ownerPerspectiveRelationships(this.store, this.ownerActorId)
      : accessibleRelationships(this.store);
  }

  #perspectiveHeader(owner) {
    if (!this.#isOwnerPerspective()) return "";
    return `<label class="pc-field pc-perspective-selector">
      <span>${escapeHtml(t("PETCOMMAND.Player.ActingAs"))}</span>
      <select name="perspectiveOwnerActorId">${ownerPerspectiveActorOptions(this.store, owner?.id ?? this.ownerActorId)}</select>
      <small>${escapeHtml(t("PETCOMMAND.Player.PerspectiveSelectorHelp"))}</small>
    </label>`;
  }

  async _renderHTML() {
    const root = document.createElement("div");
    root.className = "pc-shell";
    const configuration = this.store.configuration;
    const ownerPerspective = this.#isOwnerPerspective();

    if (this.perspectiveMode && !ownerPerspective) {
      root.innerHTML = `<main class="pc-content"><section class="pc-empty"><i class="fa-solid fa-lock"></i><h2>${escapeHtml(t("PETCOMMAND.Errors.OwnerPerspectiveNotAllowed"))}</h2></section></main>`;
      return root;
    }
    if (!ownerPerspective && !configuration.playerCommandsEnabled) {
      root.innerHTML = `<main class="pc-content"><section class="pc-empty"><i class="fa-solid fa-lock"></i><h2>${escapeHtml(t("PETCOMMAND.Player.Disabled"))}</h2></section></main>`;
      return root;
    }

    const owner = ownerPerspective ? this.#ownerActor() : null;
    if (ownerPerspective && !owner) {
      root.innerHTML = `<main class="pc-content"><section class="pc-empty"><i class="fa-solid fa-user-slash"></i><h2>${escapeHtml(t("PETCOMMAND.Errors.OwnerPerspectiveActorMissing"))}</h2></section></main>`;
      return root;
    }

    const relationships = this.#relationships();
    let relationship = this.store.state.relationships[this.selectedRelationshipId] ?? null;
    if (!relationship || !relationships.some((entry) => entry.id === relationship.id)) {
      relationship = relationships[0] ?? null;
      this.selectedRelationshipId = relationship?.id ?? null;
    }

    if (!relationship) {
      const title = ownerPerspective ? t("PETCOMMAND.Player.PerspectiveTitle", { owner: owner.name }) : t("PETCOMMAND.Player.NoRelationships");
      const help = ownerPerspective ? t("PETCOMMAND.Player.NoPerspectiveRelationshipsHelp", { owner: owner.name }) : t("PETCOMMAND.Player.NoRelationshipsHelp");
      root.innerHTML = `<main class="pc-content"><section class="pc-panel">
        ${this.#perspectiveHeader(owner)}
        <section class="pc-empty"><i class="fa-solid fa-paw"></i><h2>${escapeHtml(title)}</h2><p>${escapeHtml(help)}</p></section>
      </section></main>`;
      return root;
    }

    const profile = this.store.state.pets[relationship.petActorUuid];
    const command = COMMAND_BY_ID[this.selectedCommandId] ?? COMMANDS[0];
    const display = commandDisplay(command, profile);
    const baseDc = obedienceBaseDc(relationship, configuration);
    const dc = obedienceDc(relationship, display.difficulty.total, configuration);
    const effective = effectiveObedience(relationship, configuration);
    const level = bondLevel(effective);
    const canChooseBehaviourTargets = ownerPerspective || relationship.playerBehaviourTargetsEnabled;
    const behaviourTargetPools = this.behaviourTargetPoolsByRelationship.get(relationship.id) ?? profile.targetPools;
    const heading = ownerPerspective ? t("PETCOMMAND.Player.PerspectiveTitle", { owner: owner.name }) : t("PETCOMMAND.Player.Title");
    const help = ownerPerspective ? t("PETCOMMAND.Player.PerspectiveHelp") : t("PETCOMMAND.Player.Help");

    root.innerHTML = `<main class="pc-content"><section class="pc-panel">
      ${this.#perspectiveHeader(owner)}
      <div class="pc-panel-header"><div><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(help)}</p></div><span class="pc-badge is-active">${effective}%</span></div>
      <form id="pc-player-command-form" class="pc-stack">
        <label class="pc-field"><span>${escapeHtml(t("PETCOMMAND.Labels.Relationship"))}</span><select name="relationshipId">
          ${relationships.map((entry) => option(entry.id, relationshipLabel(entry), entry.id === relationship.id)).join("")}
        </select></label>
        <article class="pc-card pc-owner-relationship-summary">
          <div class="pc-panel-header compact"><div><h3>${escapeHtml(relationship.petNameSnapshot)} ↔ ${escapeHtml(relationship.ownerNameSnapshot)}</h3></div>
            ${ownerPerspective ? `<button type="button" data-action="open-full-manager"><i class="fa-solid fa-sliders"></i> ${escapeHtml(t("PETCOMMAND.ActionsUi.OpenFullManager"))}</button>` : ""}
          </div>
          <dl class="pc-stats">
            <div><dt>${escapeHtml(t("PETCOMMAND.Labels.XP"))}</dt><dd>${relationship.xp}</dd></div>
            <div><dt>${escapeHtml(t("PETCOMMAND.Labels.Effective"))}</dt><dd>${effective}%</dd></div>
            <div><dt>${escapeHtml(t("PETCOMMAND.Labels.BondLevel"))}</dt><dd>${escapeHtml(t(level.labelKey))}</dd></div>
            <div><dt>${escapeHtml(t("PETCOMMAND.Labels.Commands"))}</dt><dd>${relationship.commandCount}</dd></div>
            <div><dt>${escapeHtml(t("PETCOMMAND.Results.Success"))}</dt><dd>${relationship.successCount}</dd></div>
            <div><dt>${escapeHtml(t("PETCOMMAND.Results.Failure"))}</dt><dd>${relationship.failureCount}</dd></div>
          </dl>
        </article>
        <div class="pc-grid two">
          <label class="pc-field"><span>${escapeHtml(t("PETCOMMAND.Labels.Command"))}</span><select name="commandId">
            ${COMMANDS.map((entry) => option(entry.id, commandDisplay(entry, profile).label, entry.id === command.id)).join("")}
          </select><small>${escapeHtml(t("PETCOMMAND.Command.DifficultyHelp"))}</small></label>
          ${renderCommandTargetField(command)}
        </div>
        <div class="pc-card pc-player-summary">
          <div class="pc-dc difficulty-${display.band}"><span>${escapeHtml(t("PETCOMMAND.Labels.Threshold"))}</span><strong>${dc}</strong></div>
          <div><strong>${escapeHtml(t(`PETCOMMAND.Difficulty.${display.band}`))}</strong><p>${escapeHtml(t("PETCOMMAND.Command.DcBreakdown", {
            base: baseDc,
            command: signedModifier(display.difficulty.base),
            attitude: signedModifier(display.difficulty.attitude),
            attitudeName: t(ATTITUDE_PRESETS[profile?.attitude]?.labelKey ?? "PETCOMMAND.Attitudes.Docile"),
          }))}</p></div>
        </div>
        ${canChooseBehaviourTargets ? `<fieldset class="pc-player-behaviour-targets"><legend>${escapeHtml(t("PETCOMMAND.Player.RandomBehaviourTargets"))}</legend>
          <div class="pc-checkbox-grid">${renderPoolCheckboxes(behaviourTargetPools, "playerPools")}</div>
          <small>${escapeHtml(t(ownerPerspective ? "PETCOMMAND.Player.RandomBehaviourTargetsOwnerHelp" : "PETCOMMAND.Player.RandomBehaviourTargetsHelp"))}</small>
        </fieldset>` : ""}
        <div class="pc-actions"><button type="button" class="primary" data-action="player-roll" ${this.busy ? "disabled" : ""}><i class="fa-solid fa-dice-d20"></i> ${escapeHtml(t(this.busy ? "PETCOMMAND.Player.Rolling" : "PETCOMMAND.Player.RollCommand"))}</button></div>
      </form>
      ${this.#renderResult()}
    </section></main>`;
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._listenerController?.abort();
    this._listenerController = new AbortController();
    const listenerOptions = { signal: this._listenerController.signal };
    this.element.addEventListener("change", async (event) => {
      if (event.target.name?.startsWith("playerPools.")) {
        const form = this.element.querySelector("#pc-player-command-form");
        if (form && this.selectedRelationshipId) {
          this.behaviourTargetPoolsByRelationship.set(this.selectedRelationshipId, readPools(form, "playerPools"));
        }
        return;
      }
      if (event.target.name === "perspectiveOwnerActorId") {
        this.ownerActorId = event.target.value;
        this.ownerTokenId = null;
        this.selectedRelationshipId = null;
        this.lastResult = null;
      } else if (event.target.name === "relationshipId") this.selectedRelationshipId = event.target.value;
      else if (event.target.name === "commandId") this.selectedCommandId = event.target.value;
      else return;
      await this.render();
    }, listenerOptions);
    this.element.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      if (button.dataset.action === "open-full-manager") {
        event.preventDefault();
        defaultOpenManager?.({ relationshipId: this.selectedRelationshipId, tab: "command" });
        return;
      }
      if (button.dataset.action !== "player-roll") return;
      event.preventDefault();
      await this.#roll();
    }, listenerOptions);
  }

  async _onClose(options) {
    this._listenerController?.abort();
    this._listenerController = null;
    await super._onClose(options);
  }

  #renderResult() {
    if (!this.lastResult) return "";
    return `<article class="pc-result ${this.lastResult.kind}"><h3>${escapeHtml(this.lastResult.title)}</h3><p>${escapeHtml(this.lastResult.body)}</p></article>`;
  }

  async #roll() {
    const form = this.element.querySelector("#pc-player-command-form");
    this.selectedCommandId = form.querySelector('[name="commandId"]').value;
    const targetTokenId = form.querySelector('[name="targetTokenId"]')?.value || null;
    this.busy = true;
    await this.render();
    try {
      const relationship = this.store.state.relationships[this.selectedRelationshipId] ?? null;
      const canChooseBehaviourTargets = this.#isOwnerPerspective() || Boolean(relationship?.playerBehaviourTargetsEnabled);
      const targetPools = canChooseBehaviourTargets ? readPools(form, "playerPools") : null;
      if (canChooseBehaviourTargets && relationship) this.behaviourTargetPoolsByRelationship.set(relationship.id, targetPools);
      const options = {
        relationshipId: this.selectedRelationshipId,
        commandId: this.selectedCommandId,
        targetTokenId,
        targetPools,
      };
      const result = this.#isOwnerPerspective()
        ? await issueOwnerPerspectiveCommand({
            store: this.store,
            rollService: this.rollService,
            ownerActorId: this.ownerActorId,
            ownerTokenId: this.ownerTokenId,
            ...options,
          })
        : await requestPlayerCommand(options);
      const obedience = result.obedience;
      let body = t("PETCOMMAND.Results.ObedienceSummary", { total: obedience.total, dc: obedience.dc, xp: obedience.xpAward });
      if (result.behaviour) body = t("PETCOMMAND.Results.SequenceWithBehaviour", { total: obedience.total, dc: obedience.dc, action: t(ACTION_BY_ID[result.behaviour.actionId]?.labelKey ?? result.behaviour.actionId) });
      else if (result.attack?.used) body = t("PETCOMMAND.Results.SequenceWithAttack", { total: obedience.total, dc: obedience.dc, attack: result.attack.attackLabel, target: result.attack.targetName });
      else if (result.attack) body = t("PETCOMMAND.Results.SequenceAttackUnavailable", { total: obedience.total, dc: obedience.dc, reason: t(`PETCOMMAND.AttackReasons.${result.attack.reason}`) });
      this.lastResult = {
        kind: obedience.outcome,
        title: t(obedience.outcome === "success" ? "PETCOMMAND.Results.Success" : "PETCOMMAND.Results.Failure"),
        body,
      };
    } catch (error) {
      this.lastResult = { kind: "failure", title: t("PETCOMMAND.Player.RequestFailed"), body: error.message ?? String(error) };
    } finally {
      this.busy = false;
      await this.render();
    }
  }
}

export class PetCommandConfiguration extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "pet-command-configuration",
    classes: ["pet-command", "standard-form"],
    tag: "div",
    window: { title: "PETCOMMAND.App.ConfigurationTitle", icon: "fa-solid fa-gears", resizable: true },
    position: { width: 720, height: 720 },
  };

  constructor({ store, ...options } = {}) {
    super({
      ...options,
      window: { ...(options.window ?? {}), title: options.window?.title ?? t("PETCOMMAND.App.ConfigurationTitle") },
    });
    this.store = store ?? defaultStore;
    this._listenerController = null;
  }

  async _renderHTML() {
    const config = this.store.configuration;
    const root = document.createElement("div");
    root.className = "pc-shell";
    root.innerHTML = `
      <form id="pc-config-form" class="pc-panel pc-stack">
        <div class="pc-panel-header"><div><h2>${escapeHtml(t("PETCOMMAND.Configuration.Title"))}</h2><p>${escapeHtml(
          t("PETCOMMAND.Configuration.Help"),
        )}</p></div></div>
        <fieldset><legend>${escapeHtml(t("PETCOMMAND.Configuration.Learning"))}</legend><div class="pc-grid two">
          ${this.#number("successXp", "PETCOMMAND.Configuration.SuccessXp", config.successXp, 0, 1000, 0.05)}
          ${this.#number("failureXp", "PETCOMMAND.Configuration.FailureXp", config.failureXp, 0, 1000, 0.05)}
          ${this.#number("curveScale", "PETCOMMAND.Configuration.CurveScale", config.curveScale, 0.01, 1000000, 0.25)}
          ${this.#number("curveShape", "PETCOMMAND.Configuration.CurveShape", config.curveShape, 0.1, 10, 0.05)}
        </div></fieldset>
        <fieldset><legend>${escapeHtml(t("PETCOMMAND.Configuration.Thresholds"))}</legend><div class="pc-grid two">
          ${this.#number("minimumDc", "PETCOMMAND.Configuration.MinimumDc", config.minimumDc, 1, 30, 1)}
          ${this.#number("maximumDc", "PETCOMMAND.Configuration.MaximumDc", config.maximumDc, 1, 30, 1)}
          ${this.#text("obedienceFormula", "PETCOMMAND.Configuration.ObedienceFormula", config.obedienceFormula)}
          ${this.#text("behaviourFormula", "PETCOMMAND.Configuration.BehaviourFormula", config.behaviourFormula)}
        </div></fieldset>
        <fieldset><legend>${escapeHtml(t("PETCOMMAND.Configuration.Movement"))}</legend><div class="pc-grid two">
          ${this.#number("movementDistanceSquares", "PETCOMMAND.Configuration.MovementDistance", config.movementDistanceSquares, 1, 30, 1)}
          ${this.#number("circleRadiusSquares", "PETCOMMAND.Configuration.CircleRadius", config.circleRadiusSquares, 1, 15, 1)}
          <label class="pc-check"><input type="checkbox" name="movementEnabled" ${checked(config.movementEnabled)}><span>${escapeHtml(
            t("PETCOMMAND.Configuration.MovementEnabled"),
          )}</span></label>
          <label class="pc-check"><input type="checkbox" name="autoBehaviourOnFailure" ${checked(config.autoBehaviourOnFailure)}><span>${escapeHtml(
            t("PETCOMMAND.Configuration.AutoBehaviour"),
          )}</span></label>
        </div></fieldset>
        <fieldset><legend>${escapeHtml(t("PETCOMMAND.Configuration.PlayerAndAttack"))}</legend><div class="pc-grid two">
          <label class="pc-check"><input type="checkbox" name="playerCommandsEnabled" ${checked(config.playerCommandsEnabled)}><span>${escapeHtml(
            t("PETCOMMAND.Configuration.PlayerCommandsEnabled"),
          )}</span></label>
          <label class="pc-check"><input type="checkbox" name="successfulAttackUsesDefault" ${checked(config.successfulAttackUsesDefault)}><span>${escapeHtml(
            t("PETCOMMAND.Configuration.SuccessfulAttackUsesDefault"),
          )}</span></label>
        </div><p class="pc-note">${escapeHtml(t("PETCOMMAND.Configuration.PlayerAndAttackHelp"))}</p></fieldset>
        <fieldset><legend>${escapeHtml(t("PETCOMMAND.Configuration.DataAndChat"))}</legend><div class="pc-grid two">
          <label class="pc-field"><span>${escapeHtml(t("PETCOMMAND.Configuration.ChatMode"))}</span><select name="chatMode">
            ${["roll", "gmroll", "blindroll", "selfroll"].map((mode) => option(mode, t(`PETCOMMAND.ChatModes.${mode}`), config.chatMode === mode)).join("")}
          </select></label>
          ${this.#number("historyLimit", "PETCOMMAND.Configuration.HistoryLimit", config.historyLimit, 20, 5000, 10)}
          ${this.#number("backupLimit", "PETCOMMAND.Configuration.BackupLimit", config.backupLimit, 1, 20, 1)}
        </div></fieldset>
        <div class="pc-actions"><button type="button" data-action="reset-config"><i class="fa-solid fa-rotate-left"></i> ${escapeHtml(
          t("PETCOMMAND.ActionsUi.ResetDefaults"),
        )}</button><button type="button" class="primary" data-action="save-config"><i class="fa-solid fa-floppy-disk"></i> ${escapeHtml(
          t("PETCOMMAND.ActionsUi.SaveConfiguration"),
        )}</button></div>
      </form>`;
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._listenerController?.abort();
    this._listenerController = new AbortController();
    this.element.addEventListener(
      "click",
      async (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        event.preventDefault();
        try {
          if (button.dataset.action === "save-config") await this.#save();
          if (button.dataset.action === "reset-config") await this.#reset();
        } catch (error) {
          notify("error", error.message ?? String(error));
        }
      },
      { signal: this._listenerController.signal },
    );
  }

  async _onClose(options) {
    this._listenerController?.abort();
    this._listenerController = null;
    await super._onClose(options);
  }

  #number(name, labelKey, value, min, max, step) {
    return `<label class="pc-field"><span>${escapeHtml(t(labelKey))}</span><input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
  }

  #text(name, labelKey, value) {
    return `<label class="pc-field"><span>${escapeHtml(t(labelKey))}</span><input type="text" name="${name}" value="${escapeHtml(value)}"></label>`;
  }

  async #save() {
    const form = this.element.querySelector("#pc-config-form");
    const values = Object.fromEntries(new FormData(form).entries());
    values.movementEnabled = form.querySelector('[name="movementEnabled"]').checked;
    values.autoBehaviourOnFailure = form.querySelector('[name="autoBehaviourOnFailure"]').checked;
    values.playerCommandsEnabled = form.querySelector('[name="playerCommandsEnabled"]').checked;
    values.successfulAttackUsesDefault = form.querySelector('[name="successfulAttackUsesDefault"]').checked;
    await this.store.saveConfiguration(values);
    notify("info", t("PETCOMMAND.Notifications.ConfigurationSaved"));
  }

  async #reset() {
    const confirmed = await DialogV2.confirm({
      window: { title: t("PETCOMMAND.Confirm.ResetConfigTitle") },
      content: `<p>${escapeHtml(t("PETCOMMAND.Confirm.ResetConfig"))}</p>`,
      modal: true,
      rejectClose: false,
    });
    if (!confirmed) return;
    await this.store.saveConfiguration({ ...DEFAULT_CONFIG });
  }
}
