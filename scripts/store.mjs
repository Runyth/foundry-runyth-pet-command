// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { DEFAULT_CONFIG, MODULE_ID, MODULE_VERSION, SCHEMA_VERSION } from "./constants.mjs";
import {
  createEmptyState,
  deepClone,
  mergeStates,
  normalizeConfig,
  normalizeState,
  validateImportEnvelope,
} from "./model.mjs";
import { t } from "./utilities.mjs";

const STATE_KEY = "state";
const CONFIG_KEY = "configuration";
const BACKUPS_KEY = "backups";

let activeStore = null;

function backupEntries(value) {
  return Array.isArray(value?.entries) ? value.entries : [];
}

export function registerStorageSettings() {
  game.settings.register(MODULE_ID, STATE_KEY, {
    scope: "world",
    config: false,
    type: Object,
    default: createEmptyState(),
    onChange: (value) => {
      const normalized = activeStore?.synchronizeState(value) ?? normalizeState(value);
      Hooks.callAll(`${MODULE_ID}.stateChanged`, normalized, { reason: "setting-change" });
    },
  });
  game.settings.register(MODULE_ID, CONFIG_KEY, {
    scope: "world",
    config: false,
    type: Object,
    default: { ...DEFAULT_CONFIG },
    onChange: (value) => {
      const normalized = activeStore?.synchronizeConfiguration(value) ?? normalizeConfig(value);
      Hooks.callAll(`${MODULE_ID}.configurationChanged`, normalized);
    },
  });
  game.settings.register(MODULE_ID, BACKUPS_KEY, {
    scope: "world",
    config: false,
    type: Object,
    default: { entries: [] },
    onChange: (value) => activeStore?.synchronizeBackups(value),
  });
}

export class PetCommandStore {
  #queue = Promise.resolve();
  #configuration;
  #state;
  #backups;

  constructor() {
    this.#configuration = normalizeConfig(game.settings.get(MODULE_ID, CONFIG_KEY));
    this.#state = normalizeState(game.settings.get(MODULE_ID, STATE_KEY), this.#configuration);
    this.#backups = backupEntries(game.settings.get(MODULE_ID, BACKUPS_KEY));
    activeStore = this;
  }

  get configuration() {
    return this.#configuration;
  }

  get state() {
    return this.#state;
  }

  get backups() {
    return this.#backups;
  }

  snapshotState() {
    return deepClone(this.#state);
  }

  snapshotRelationships({ includeTerminated = true } = {}) {
    const relationships = Object.values(this.#state.relationships);
    return deepClone(includeTerminated ? relationships : relationships.filter((relationship) => relationship.status === "active"));
  }

  snapshotPetProfiles() {
    return deepClone(Object.values(this.#state.pets));
  }

  synchronizeConfiguration(value) {
    this.#configuration = normalizeConfig(value);
    this.#state = normalizeState(this.#state, this.#configuration);
    return this.#configuration;
  }

  synchronizeState(value) {
    this.#state = normalizeState(value, this.#configuration);
    return this.#state;
  }

  synchronizeBackups(value) {
    this.#backups = backupEntries(value);
    return this.#backups;
  }

  async saveConfiguration(configuration) {
    this.#assertGm();
    const normalized = normalizeConfig(configuration);
    const saved = await game.settings.set(MODULE_ID, CONFIG_KEY, normalized);
    this.synchronizeConfiguration(saved ?? normalized);
    return this.#configuration;
  }

  async mutate(mutator, { backup = false, reason = "mutation" } = {}) {
    this.#assertGm();
    this.#queue = this.#queue.catch(() => undefined).then(async () => {
      this.#refreshStateFromSettings();
      const current = this.#state;
      if (backup) await this.#saveBackup(current, reason);
      const draft = deepClone(current);
      const result = await mutator(draft);
      draft.revision = current.revision + 1;
      draft.updatedAt = new Date().toISOString();
      const normalized = normalizeState(draft, this.#configuration);
      const saved = await game.settings.set(MODULE_ID, STATE_KEY, normalized);
      const state = this.synchronizeState(saved ?? normalized);
      return { state, result };
    });
    return this.#queue;
  }

  async replaceState(candidate, { backup = true, reason = "replace" } = {}) {
    this.#assertGm();
    const imported = normalizeState(validateImportEnvelope(candidate), this.#configuration);
    return this.mutate(
      (draft) => {
        for (const key of Object.keys(draft)) delete draft[key];
        Object.assign(draft, imported);
      },
      { backup, reason },
    );
  }

  async mergeState(candidate) {
    this.#assertGm();
    const imported = validateImportEnvelope(candidate);
    return this.mutate(
      (draft) => {
        const merged = mergeStates(draft, imported, this.#configuration);
        for (const key of Object.keys(draft)) delete draft[key];
        Object.assign(draft, merged);
      },
      { backup: true, reason: "import-merge" },
    );
  }

  exportEnvelope({ relationshipIds = null, petActorUuids = null } = {}) {
    const source = this.#state;
    let relationships = source.relationships;
    let pets = source.pets;

    if (Array.isArray(relationshipIds)) {
      relationships = Object.fromEntries(relationshipIds.filter((id) => source.relationships[id]).map((id) => [id, source.relationships[id]]));
      const includedPets = new Set(Object.values(relationships).map((relationship) => relationship.petActorUuid));
      pets = Object.fromEntries([...includedPets].filter((uuid) => source.pets[uuid]).map((uuid) => [uuid, source.pets[uuid]]));
    } else if (Array.isArray(petActorUuids)) {
      const includedPets = new Set(petActorUuids);
      pets = Object.fromEntries([...includedPets].filter((uuid) => source.pets[uuid]).map((uuid) => [uuid, source.pets[uuid]]));
      relationships = Object.fromEntries(
        Object.entries(source.relationships).filter(([, relationship]) => includedPets.has(relationship.petActorUuid)),
      );
    }

    const relationshipIdSet = new Set(Object.keys(relationships));
    return deepClone({
      format: "pet-command-export",
      moduleVersion: MODULE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      world: { id: game.world?.id ?? null, title: game.world?.title ?? null },
      state: {
        ...source,
        pets,
        relationships,
        history: source.history.filter((entry) => !entry.relationshipId || relationshipIdSet.has(entry.relationshipId)),
      },
    });
  }

  async restoreLatestBackup() {
    this.#assertGm();
    const latest = this.#backups.at(-1);
    if (!latest?.state) throw new Error(t("PETCOMMAND.Errors.BackupUnavailable", {}, "No automatic backup is available."));
    return this.replaceState(latest.state, { backup: true, reason: "restore-backup" });
  }

  diagnostics() {
    const state = this.#state;
    const relationships = Object.values(state.relationships);
    const petUuids = new Set(Object.keys(state.pets));
    const orphanRelationships = relationships.filter((relationship) => !petUuids.has(relationship.petActorUuid));
    const duplicatePairs = [];
    const seen = new Map();
    let activeRelationships = 0;
    let terminatedRelationships = 0;
    for (const relationship of relationships) {
      if (relationship.status === "active") activeRelationships += 1;
      else if (relationship.status === "terminated") terminatedRelationships += 1;
      const key = `${relationship.petActorUuid}::${relationship.ownerActorUuid}`;
      if (seen.has(key)) duplicatePairs.push([seen.get(key), relationship.id]);
      else seen.set(key, relationship.id);
    }
    return {
      schemaVersion: state.schemaVersion,
      revision: state.revision,
      pets: Object.keys(state.pets).length,
      relationships: relationships.length,
      activeRelationships,
      terminatedRelationships,
      orphanRelationships,
      duplicatePairs,
      backups: this.#backups.length,
    };
  }

  #refreshStateFromSettings() {
    const persisted = game.settings.get(MODULE_ID, STATE_KEY);
    if (
      persisted !== this.#state
      && (Number(persisted?.revision) !== this.#state.revision || persisted?.updatedAt !== this.#state.updatedAt)
    ) {
      this.synchronizeState(persisted);
    }
  }

  async #saveBackup(state, reason) {
    const entries = [...this.#backups, { createdAt: new Date().toISOString(), reason, state }].slice(-this.#configuration.backupLimit);
    const saved = await game.settings.set(MODULE_ID, BACKUPS_KEY, { entries });
    this.synchronizeBackups(saved ?? { entries });
  }

  #assertGm() {
    if (!game.user?.isGM) {
      throw new Error(t("PETCOMMAND.Errors.GmMutationOnly", {}, "Only a Game Master may modify Pet Command data."));
    }
  }
}
