// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import {
  ACTIONS,
  ACTION_BY_ID,
  ATTITUDE_PRESETS,
  BOND_LEVELS,
  DEFAULT_CONFIG,
  DEFAULT_TARGET_POOLS,
  RELATIONSHIP_STATUS,
  SCHEMA_VERSION,
} from "./constants.mjs";
import { t, UserInputError } from "./utilities.mjs";

const normalizedConfigurations = new WeakSet([DEFAULT_CONFIG]);
const normalizedStateHistoryLimits = new WeakMap();
const d20SlotCache = new WeakMap();


export function clamp(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, number));
}

export function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function deepClone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function createEmptyState(now = new Date().toISOString()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    pets: {},
    relationships: {},
    history: [],
  };
}

export function normalizeConfig(candidate = {}) {
  if (candidate && typeof candidate === "object" && normalizedConfigurations.has(candidate)) return candidate;
  const config = { ...DEFAULT_CONFIG, ...(candidate ?? {}) };
  const normalized = Object.freeze({
    successXp: clamp(config.successXp, 0, 1000),
    failureXp: clamp(config.failureXp, 0, 1000),
    curveScale: clamp(config.curveScale, 0.01, 1_000_000),
    curveShape: clamp(config.curveShape, 0.1, 10),
    minimumDc: Math.round(clamp(config.minimumDc, 1, 30)),
    maximumDc: Math.round(clamp(config.maximumDc, 1, 30)),
    obedienceFormula: String(config.obedienceFormula || "1d20").trim() || "1d20",
    behaviourFormula: String(config.behaviourFormula || "1d20").trim() || "1d20",
    autoBehaviourOnFailure: Boolean(config.autoBehaviourOnFailure),
    movementEnabled: Boolean(config.movementEnabled),
    movementDistanceSquares: clamp(config.movementDistanceSquares, 1, 30),
    circleRadiusSquares: clamp(config.circleRadiusSquares, 1, 15),
    chatMode: ["roll", "gmroll", "blindroll", "selfroll"].includes(config.chatMode) ? config.chatMode : "gmroll",
    playerCommandsEnabled: config.playerCommandsEnabled !== false,
    successfulAttackUsesDefault: config.successfulAttackUsesDefault !== false,
    historyLimit: Math.round(clamp(config.historyLimit, 20, 5000)),
    backupLimit: Math.round(clamp(config.backupLimit, 1, 20)),
  });
  normalizedConfigurations.add(normalized);
  return normalized;
}

export function normalizeWeights(candidate = {}, fallbackAttitude = "docile") {
  const fallback = ATTITUDE_PRESETS[fallbackAttitude]?.weights ?? ATTITUDE_PRESETS.docile.weights;
  return Object.fromEntries(ACTIONS.map((action) => [action.id, roundTo(clamp(candidate?.[action.id] ?? fallback[action.id], 0, 1000), 3)]));
}

export function normalizeTargetPools(candidate = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_TARGET_POOLS).map(([key, fallback]) => [key, Boolean(candidate?.[key] ?? fallback)]));
}

export function createPetProfile({ actorUuid, actorId = null, name, attitude = "docile", tokenUuid = null, now = new Date().toISOString() }) {
  const effectiveAttitude = ATTITUDE_PRESETS[attitude] ? attitude : "docile";
  return {
    actorUuid: String(actorUuid),
    actorId: actorId ? String(actorId) : null,
    nameSnapshot: String(name || t("PETCOMMAND.Fallback.UnnamedPet", {}, "Unnamed pet")),
    attitude: effectiveAttitude,
    customWeights: false,
    actionWeights: normalizeWeights(ATTITUDE_PRESETS[effectiveAttitude].weights, effectiveAttitude),
    targetPools: normalizeTargetPools(),
    movementEnabled: true,
    defaultAttackItemId: null,
    defaultAttackActivityId: null,
    preferredTokenUuid: tokenUuid ? String(tokenUuid) : null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createRelationship({ id, pet, owner, now = new Date().toISOString() }) {
  if (!id || !pet?.actorUuid || !owner?.actorUuid) {
    throw new Error(t("PETCOMMAND.Errors.RelationshipDataRequired", {}, "A relationship requires an ID, a pet, and an owner."));
  }
  return {
    id: String(id),
    petActorUuid: String(pet.actorUuid),
    petActorId: pet.actorId ? String(pet.actorId) : null,
    petNameSnapshot: String(pet.name || t("PETCOMMAND.Fallback.UnnamedPet", {}, "Unnamed pet")),
    ownerActorUuid: String(owner.actorUuid),
    ownerActorId: owner.actorId ? String(owner.actorId) : null,
    ownerNameSnapshot: String(owner.name || t("PETCOMMAND.Fallback.UnnamedOwner", {}, "Unnamed owner")),
    xp: 0,
    manualObedience: null,
    status: RELATIONSHIP_STATUS.ACTIVE,
    terminationReason: "",
    createdAt: now,
    updatedAt: now,
    terminatedAt: null,
    commandCount: 0,
    successCount: 0,
    failureCount: 0,
    playerBehaviourTargetsEnabled: false,
  };
}

export function automatedObedience(xp, config = DEFAULT_CONFIG) {
  const effective = normalizeConfig(config);
  const safeXp = Math.max(0, Number(xp) || 0);
  const progress = 1 - Math.exp(-((safeXp / effective.curveScale) ** effective.curveShape));
  return Math.round(clamp(progress * 100, 0, 100));
}

export function effectiveObedience(relationship, config = DEFAULT_CONFIG) {
  const automated = automatedObedience(relationship?.xp, config);
  const manual = relationship?.manualObedience;
  return manual === null || manual === undefined || manual === "" ? automated : Math.round(clamp(manual, 0, 100));
}

export function obedienceBaseDc(relationship, config = DEFAULT_CONFIG) {
  const effective = normalizeConfig(config);
  const low = Math.min(effective.minimumDc, effective.maximumDc);
  const high = Math.max(effective.minimumDc, effective.maximumDc);
  const obedience = effectiveObedience(relationship, effective);
  return Math.round(clamp(high - ((high - low) * obedience) / 100, 1, 30));
}

export function attitudeCommandModifier(attitude, commandId) {
  return Number(ATTITUDE_PRESETS[attitude]?.commandModifiers?.[commandId] ?? 0);
}

export function commandDifficulty(command, attitude = "docile") {
  const base = Number(command?.difficulty ?? 0);
  const attitudeModifier = attitudeCommandModifier(attitude, command?.id);
  return { base, attitude: attitudeModifier, total: base + attitudeModifier };
}

export function difficultyBand(modifier) {
  const value = Number(modifier) || 0;
  if (value <= -3) return "very-easy";
  if (value <= -1) return "easy";
  if (value === 0) return "standard";
  if (value <= 2) return "hard";
  return "very-hard";
}

export function commandTargetRequirement(command) {
  const mode = command?.targetMode ?? "none";
  return {
    mode,
    usesTarget: mode !== "none",
    selectable: mode === "required" || mode === "optional-owner",
    required: mode === "required",
    ownerFallback: mode === "owner" || mode === "optional-owner",
  };
}

export function obedienceDc(relationship, commandDifficulty = 0, config = DEFAULT_CONFIG) {
  return Math.round(clamp(obedienceBaseDc(relationship, config) + Number(commandDifficulty || 0), 1, 30));
}

export function awardForOutcome(outcome, config = DEFAULT_CONFIG) {
  const effective = normalizeConfig(config);
  return outcome === "success" ? effective.successXp : effective.failureXp;
}

export function bondLevel(obedience) {
  const score = clamp(obedience, 0, 100);
  for (let index = BOND_LEVELS.length - 1; index >= 0; index -= 1) {
    if (score >= BOND_LEVELS[index].minimum) return BOND_LEVELS[index];
  }
  return BOND_LEVELS[0];
}

export function buildD20Slots(candidateWeights = {}, actionCatalog = ACTIONS) {
  const cacheable = actionCatalog === ACTIONS && candidateWeights && typeof candidateWeights === "object";
  const signature = cacheable ? ACTIONS.map((action) => Number(candidateWeights?.[action.id]) || 0).join("|") : null;
  const cached = cacheable ? d20SlotCache.get(candidateWeights) : null;
  if (cached?.signature === signature) return cached.slots;

  const entries = actionCatalog.map((action, index) => ({
    action,
    index,
    weight: Math.max(0, Number(candidateWeights?.[action.id]) || 0),
  }));
  let total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) {
    for (const entry of entries) entry.weight = 1;
    total = entries.length;
  }

  const allocations = entries.map((entry) => {
    const quota = (entry.weight / total) * 20;
    return { ...entry, count: Math.floor(quota), remainder: quota - Math.floor(quota) };
  });
  let remaining = 20 - allocations.reduce((sum, entry) => sum + entry.count, 0);
  allocations.sort((left, right) => right.remainder - left.remainder || right.weight - left.weight || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) allocations[index % allocations.length].count += 1;
  allocations.sort((left, right) => left.index - right.index);

  const slots = [];
  while (slots.length < 20) {
    let added = false;
    for (const allocation of allocations) {
      if (allocation.count <= 0) continue;
      slots.push(allocation.action.id);
      allocation.count -= 1;
      added = true;
      if (slots.length === 20) break;
    }
    if (!added) break;
  }
  const result = Object.freeze(slots);
  if (cacheable) d20SlotCache.set(candidateWeights, { signature, slots: result });
  return result;
}

export function resolveD20Action(rollTotal, weights, actionCatalog = ACTIONS) {
  const slots = buildD20Slots(weights, actionCatalog);
  const normalized = Math.round(clamp(rollTotal, 1, 20));
  const actionId = slots[normalized - 1];
  return (actionCatalog === ACTIONS ? ACTION_BY_ID[actionId] : actionCatalog.find((action) => action.id === actionId)) ?? actionCatalog[0];
}

export function normalizeState(candidate, config = DEFAULT_CONFIG) {
  const effective = normalizeConfig(config);
  if (candidate && typeof candidate === "object" && normalizedStateHistoryLimits.get(candidate) === effective.historyLimit) return candidate;
  const now = new Date().toISOString();
  const source = candidate && typeof candidate === "object" ? candidate : createEmptyState(now);
  const state = {
    schemaVersion: SCHEMA_VERSION,
    revision: Math.max(0, Math.round(Number(source.revision) || 0)),
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || now,
    pets: {},
    relationships: {},
    history: Array.isArray(source.history) ? source.history : [],
  };

  for (const [key, profile] of Object.entries(source.pets ?? {})) {
    if (!profile?.actorUuid) continue;
    const attitude = ATTITUDE_PRESETS[profile.attitude] ? profile.attitude : "docile";
    state.pets[key] = {
      ...createPetProfile({
        actorUuid: profile.actorUuid,
        actorId: profile.actorId,
        name: profile.nameSnapshot,
        attitude,
        tokenUuid: profile.preferredTokenUuid,
        now: profile.createdAt || now,
      }),
      ...profile,
      attitude,
      actionWeights: normalizeWeights(profile.actionWeights, attitude),
      targetPools: normalizeTargetPools(profile.targetPools),
      movementEnabled: profile.movementEnabled !== false,
      defaultAttackItemId: profile.defaultAttackItemId ? String(profile.defaultAttackItemId) : null,
      defaultAttackActivityId: profile.defaultAttackActivityId ? String(profile.defaultAttackActivityId) : null,
      updatedAt: profile.updatedAt || now,
    };
  }

  for (const [id, relationship] of Object.entries(source.relationships ?? {})) {
    if (!relationship?.petActorUuid || !relationship?.ownerActorUuid) continue;
    state.relationships[id] = {
      ...relationship,
      id,
      xp: roundTo(Math.max(0, Number(relationship.xp) || 0), 3),
      manualObedience:
        relationship.manualObedience === null || relationship.manualObedience === undefined || relationship.manualObedience === ""
          ? null
          : Math.round(clamp(relationship.manualObedience, 0, 100)),
      status: relationship.status === RELATIONSHIP_STATUS.TERMINATED ? RELATIONSHIP_STATUS.TERMINATED : RELATIONSHIP_STATUS.ACTIVE,
      playerBehaviourTargetsEnabled: Boolean(relationship.playerBehaviourTargetsEnabled),
      terminationReason: String(relationship.terminationReason ?? "").trim().slice(0, 240),
      terminatedAt: relationship.status === RELATIONSHIP_STATUS.TERMINATED ? relationship.terminatedAt || relationship.updatedAt || now : null,
      commandCount: Math.max(0, Math.round(Number(relationship.commandCount) || 0)),
      successCount: Math.max(0, Math.round(Number(relationship.successCount) || 0)),
      failureCount: Math.max(0, Math.round(Number(relationship.failureCount) || 0)),
      createdAt: relationship.createdAt || now,
      updatedAt: relationship.updatedAt || now,
    };
  }

  state.history = state.history.slice(-effective.historyLimit);
  normalizedStateHistoryLimits.set(state, effective.historyLimit);
  return state;
}

export function validateImportEnvelope(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new UserInputError(t("PETCOMMAND.Errors.ImportObjectRequired", {}, "The import must contain a JSON object."), { fieldName: "importFile" });
  }
  const state = candidate.state ?? candidate;
  if (!state || typeof state !== "object") {
    throw new UserInputError(t("PETCOMMAND.Errors.ImportStateMissing", {}, "The import does not contain module state."), { fieldName: "importFile" });
  }
  if (Number(state.schemaVersion ?? SCHEMA_VERSION) > SCHEMA_VERSION) {
    throw new UserInputError(
      t(
        "PETCOMMAND.Errors.ImportSchemaTooNew",
        { exportSchema: state.schemaVersion, supportedSchema: SCHEMA_VERSION },
        `This export uses schema ${state.schemaVersion}, but this module supports schema ${SCHEMA_VERSION}.`,
      ),
      { fieldName: "importFile" },
    );
  }
  return state;
}

export function mergeStates(current, imported, config = DEFAULT_CONFIG) {
  const left = normalizeState(current, config);
  const right = normalizeState(imported, config);
  return normalizeState(
    {
      ...left,
      pets: { ...left.pets, ...right.pets },
      relationships: { ...left.relationships, ...right.relationships },
      history: [...left.history, ...right.history],
      revision: Math.max(left.revision, right.revision) + 1,
      updatedAt: new Date().toISOString(),
    },
    config,
  );
}
