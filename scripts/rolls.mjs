import { ACTIONS, COMMAND_BY_ID, MODULE_ID, RELATIONSHIP_STATUS } from "./constants.mjs";
import { useDefaultAttack } from "./attacks.mjs";
import {
  awardForOutcome,
  bondLevel,
  commandDifficulty,
  commandTargetRequirement,
  effectiveObedience,
  obedienceDc,
  resolveD20Action,
  roundTo,
} from "./model.mjs";
import { findRelationshipTokens, movePetForAction, movePetForCommand } from "./movement.mjs";
import { escapeHtml, moduleError, randomId, t } from "./utilities.mjs";

function messageVisibility(rollMode) {
  const gmIds = (game.users?.contents ?? []).filter((user) => user.isGM).map((user) => user.id);
  if (rollMode === "gmroll") return { whisper: gmIds };
  if (rollMode === "blindroll") return { whisper: gmIds, blind: true };
  if (rollMode === "selfroll") return { whisper: [game.user.id] };
  return {};
}

async function evaluateRoll(formula) {
  const roll = new Roll(formula);
  await roll.evaluate();
  return roll;
}

async function postRoll(roll, flavor, rollMode, speaker = null) {
  return roll.toMessage(
    {
      speaker: speaker ?? ChatMessage.getSpeaker(),
      flavor,
    },
    { rollMode },
  );
}

function selectedTargetById(tokenId) {
  if (!tokenId) return null;
  const direct = canvas?.tokens?.get?.(tokenId);
  if (direct) return direct;
  return (canvas?.tokens?.placeables ?? []).find((token) => token.id === tokenId || token.document?.id === tokenId || token.document?.uuid === tokenId) ?? null;
}

function targetCandidates({ targetPools, petToken, ownerToken }) {
  const enabled = targetPools ?? {};
  const candidates = new Map();
  if (enabled.owner && ownerToken) candidates.set("owner", [ownerToken]);

  const tokens = canvas?.tokens?.placeables ?? [];
  const party = [];
  const npc = [];
  const hostile = [];
  const petId = petToken?.id;
  const ownerId = ownerToken?.id;
  const hostileDisposition = globalThis.CONST?.TOKEN_DISPOSITIONS?.HOSTILE ?? -1;

  for (const token of tokens) {
    if (token.id === petId || token.id === ownerId) continue;
    if (enabled.party && (token.actor?.hasPlayerOwner || token.actor?.type === "character")) party.push(token);
    if (enabled.npc && !token.actor?.hasPlayerOwner) npc.push(token);
    if (enabled.hostile && Number(token.document?.disposition) === hostileDisposition) hostile.push(token);
  }

  if (party.length) candidates.set("party", party);
  if (npc.length) candidates.set("npc", npc);
  if (hostile.length) candidates.set("hostile", hostile);
  if (enabled.targeted) {
    const targeted = [...(game.user?.targets ?? [])].filter((token) => token.id !== petId);
    if (targeted.length) candidates.set("targeted", targeted);
  }
  return [...candidates.values()];
}

function chooseRandomTarget({ targetPools, petToken, ownerToken, explicitTarget = null }) {
  if (explicitTarget) return explicitTarget;
  const populatedPools = targetCandidates({ targetPools, petToken, ownerToken });
  if (!populatedPools.length) return null;
  const selectedPool = populatedPools[Math.floor(Math.random() * populatedPools.length)];
  return selectedPool[Math.floor(Math.random() * selectedPool.length)] ?? null;
}

function actionSlot(total) {
  const numeric = Math.max(1, Math.floor(Number(total) || 1));
  return ((numeric - 1) % 20) + 1;
}

function relationshipFlavor({ relationship, command, dc, obedience, outcome, xpAward }) {
  const label = t(command.labelKey);
  const result = outcome === "success" ? t("PETCOMMAND.Results.Success") : t("PETCOMMAND.Results.Failure");
  return [
    `<strong>${escapeHtml(relationship.petNameSnapshot)}</strong> — ${escapeHtml(label)}`,
    `${escapeHtml(relationship.ownerNameSnapshot)} · ${escapeHtml(t("PETCOMMAND.Labels.Obedience"))} ${obedience}% · ${escapeHtml(t("PETCOMMAND.Labels.DC"))} ${dc}`,
    `${escapeHtml(result)} · +${xpAward} XP`,
  ].join("<br>");
}

function behaviourFlavor(result) {
  const movementText = result.action.movement === "none"
    ? t("PETCOMMAND.Movement.NotApplicable")
    : result.movement.moved && result.movement.reason === "partial"
      ? t("PETCOMMAND.Movement.Partial")
      : result.movement.moved
        ? t("PETCOMMAND.Movement.Executed")
        : t(`PETCOMMAND.MovementReasons.${result.movement.reason}`);
  return [
    `<strong>${escapeHtml(result.relationship.petNameSnapshot)}</strong> — ${escapeHtml(t("PETCOMMAND.Results.RandomBehaviour"))}`,
    `${escapeHtml(t("PETCOMMAND.Labels.ResultSlot"))}: ${result.slot} · ${escapeHtml(t(result.action.labelKey))}`,
    result.targetToken ? `${escapeHtml(t("PETCOMMAND.Labels.Target"))}: ${escapeHtml(result.targetToken.name)}` : escapeHtml(t("PETCOMMAND.Labels.NoTarget")),
    `${escapeHtml(t("PETCOMMAND.Labels.Movement"))}: ${escapeHtml(movementText)}`,
  ].join("<br>");
}

async function safelyPostRoll(roll, flavor, rollMode, speaker = null) {
  try {
    await postRoll(roll, flavor, rollMode, speaker);
  } catch (error) {
    moduleError(error, "Chat roll posting failed");
  }
}

export class PetCommandRollService {
  constructor(store) {
    this.store = store;
  }

  async rollObedience({ relationshipId, commandId, targetTokenId = null, postToChat = true, speaker = null }) {
    const configuration = this.store.configuration;
    const result = await this.#evaluateObedience({
      state: this.store.state,
      configuration,
      relationshipId,
      commandId,
      targetTokenId,
    });
    const mutation = await this.store.mutate((draft) => this.#applyObedience(draft, result), { reason: "obedience-roll" });
    if (postToChat) await safelyPostRoll(result.roll, relationshipFlavor(result), configuration.chatMode, speaker);
    const updated = mutation.state.relationships[relationshipId];
    return {
      ...result,
      relationship: updated,
      bondLevel: bondLevel(effectiveObedience(updated, configuration)),
    };
  }

  async rollBehaviour({ relationshipId, targetPools = null, targetTokenId = null, postToChat = true, executeMovement = true, speaker = null }) {
    const configuration = this.store.configuration;
    const result = await this.#evaluateBehaviour({
      state: this.store.state,
      configuration,
      relationshipId,
      targetPools,
      targetTokenId,
      executeMovement,
    });
    await this.store.mutate((draft) => this.#applyBehaviour(draft, result), { reason: "behaviour-roll" });
    if (postToChat) await safelyPostRoll(result.roll, behaviourFlavor(result), configuration.chatMode, speaker);
    return result;
  }

  async rollCommandSequence(options) {
    const configuration = this.store.configuration;
    const state = this.store.state;
    const obedience = await this.#evaluateObedience({
      state,
      configuration,
      relationshipId: options.relationshipId,
      commandId: options.commandId,
      targetTokenId: options.targetTokenId ?? null,
    });

    const includeBehaviour = options.includeBehaviour ?? configuration.autoBehaviourOnFailure;
    const executeMovement = options.executeMovement ?? true;
    let behaviour = null;
    let commandMovement = null;
    let attack = null;
    if (obedience.outcome === "failure" && includeBehaviour) {
      behaviour = await this.#evaluateBehaviour({
        state,
        configuration,
        relationshipId: options.relationshipId,
        targetPools: options.targetPools ?? null,
        targetTokenId: options.behaviourTargetTokenId ?? null,
        executeMovement,
      });
    } else if (obedience.outcome === "success") {
      const { petToken, ownerToken } = findRelationshipTokens(obedience.profile, obedience.relationship);
      const targetToken = selectedTargetById(options.targetTokenId);
      if (executeMovement && configuration.movementEnabled && obedience.profile.movementEnabled) {
        commandMovement = petToken
          ? await movePetForCommand({
              command: obedience.command,
              petToken,
              ownerToken,
              targetToken,
              configuration,
            })
          : obedience.command.movement === "none"
            ? { moved: false, reason: "no-movement" }
            : { moved: false, reason: "pet-token-missing" };
      } else {
        commandMovement = { moved: false, reason: obedience.command.movement === "none" ? "no-movement" : "disabled" };
      }
      obedience.commandMovement = commandMovement;

      if (obedience.command.id === "attack" && configuration.successfulAttackUsesDefault) {
        attack = await useDefaultAttack({
          profile: obedience.profile,
          relationship: obedience.relationship,
          targetTokenId: options.targetTokenId,
        });
      }
    }

    const mutation = await this.store.mutate(
      (draft) => {
        this.#applyObedience(draft, obedience);
        if (behaviour) this.#applyBehaviour(draft, behaviour);
        if (attack) this.#applyAttack(draft, options, attack);
      },
      { reason: "command-sequence" },
    );

    const updatedRelationship = mutation.state.relationships[options.relationshipId];
    obedience.relationship = updatedRelationship;
    obedience.bondLevel = bondLevel(effectiveObedience(updatedRelationship, configuration));

    if (options.postToChat !== false) {
      await safelyPostRoll(obedience.roll, relationshipFlavor(obedience), configuration.chatMode, options.speaker ?? null);
      if (behaviour) await safelyPostRoll(behaviour.roll, behaviourFlavor(behaviour), configuration.chatMode, options.speaker ?? null);
    }
    return { obedience, behaviour, commandMovement, attack };
  }

  async postSummary(content) {
    const configuration = this.store.configuration;
    return ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker(),
      ...messageVisibility(configuration.chatMode),
      flags: { [MODULE_ID]: { generated: true } },
    });
  }

  async #evaluateObedience({ state, configuration, relationshipId, commandId, targetTokenId }) {
    const relationship = state.relationships[relationshipId];
    if (!relationship) throw new Error(t("PETCOMMAND.Errors.RelationshipMissing"));
    if (relationship.status !== RELATIONSHIP_STATUS.ACTIVE) throw new Error(t("PETCOMMAND.Errors.RelationshipTerminated"));
    const command = COMMAND_BY_ID[commandId] ?? COMMAND_BY_ID.come;
    const profile = state.pets[relationship.petActorUuid];
    if (!profile) throw new Error(t("PETCOMMAND.Errors.PetProfileMissing"));
    const targetRequirement = commandTargetRequirement(command);
    if (targetRequirement.required && !targetTokenId) throw new Error(t("PETCOMMAND.Errors.CommandTargetRequired"));
    const obedience = effectiveObedience(relationship, configuration);
    const difficulty = commandDifficulty(command, profile.attitude);
    const dc = obedienceDc(relationship, difficulty.total, configuration);
    const roll = await evaluateRoll(configuration.obedienceFormula);
    const outcome = Number(roll.total) >= dc ? "success" : "failure";
    return {
      relationship,
      command,
      profile,
      difficulty,
      roll,
      dc,
      obedience,
      outcome,
      xpAward: awardForOutcome(outcome, configuration),
      relationshipId,
      targetTokenId,
    };
  }

  async #evaluateBehaviour({ state, configuration, relationshipId, targetPools, targetTokenId, executeMovement }) {
    const relationship = state.relationships[relationshipId];
    if (!relationship) throw new Error(t("PETCOMMAND.Errors.RelationshipMissing"));
    if (relationship.status !== RELATIONSHIP_STATUS.ACTIVE) throw new Error(t("PETCOMMAND.Errors.RelationshipTerminated"));
    const profile = state.pets[relationship.petActorUuid];
    if (!profile) throw new Error(t("PETCOMMAND.Errors.PetProfileMissing"));
    const roll = await evaluateRoll(configuration.behaviourFormula);
    const slot = actionSlot(roll.total);
    const action = resolveD20Action(slot, profile.actionWeights, ACTIONS);
    const { petToken, ownerToken } = findRelationshipTokens(profile, relationship);
    const explicitTarget = selectedTargetById(targetTokenId);
    const targetToken = chooseRandomTarget({
      targetPools: targetPools ?? profile.targetPools,
      petToken,
      ownerToken,
      explicitTarget,
    });

    let movement = { moved: false, reason: "disabled" };
    if (executeMovement && configuration.movementEnabled && profile.movementEnabled && petToken) {
      movement = await movePetForAction({ action, petToken, ownerToken, targetToken, configuration });
    } else if (!petToken && action.movement !== "none") {
      movement = { moved: false, reason: "pet-token-missing" };
    }
    return { relationship, profile, roll, slot, action, petToken, ownerToken, targetToken, movement, relationshipId };
  }

  #applyObedience(draft, result) {
    const record = draft.relationships[result.relationshipId];
    const createdAt = new Date().toISOString();
    record.xp = roundTo(record.xp + result.xpAward, 3);
    record.commandCount += 1;
    record.successCount += result.outcome === "success" ? 1 : 0;
    record.failureCount += result.outcome === "failure" ? 1 : 0;
    record.updatedAt = createdAt;
    draft.history.push({
      id: randomId("history-"),
      type: "obedience",
      relationshipId: result.relationshipId,
      commandId: result.command.id,
      commandDifficulty: result.difficulty,
      commandTargetTokenId: result.targetTokenId || null,
      rollFormula: result.roll.formula,
      rollTotal: Number(result.roll.total),
      dc: result.dc,
      outcome: result.outcome,
      xpAward: result.xpAward,
      commandMovement: result.commandMovement
        ? { moved: Boolean(result.commandMovement.moved), reason: result.commandMovement.reason ?? null }
        : null,
      createdAt,
    });
  }

  #applyBehaviour(draft, result) {
    draft.history.push({
      id: randomId("history-"),
      type: "behaviour",
      relationshipId: result.relationshipId,
      rollFormula: result.roll.formula,
      rollTotal: Number(result.roll.total),
      d20Slot: result.slot,
      actionId: result.action.id,
      targetTokenUuid: result.targetToken?.document?.uuid ?? null,
      targetNameSnapshot: result.targetToken?.name ?? null,
      movement: { moved: result.movement.moved, reason: result.movement.reason },
      createdAt: new Date().toISOString(),
    });
  }

  #applyAttack(draft, options, attack) {
    draft.history.push({
      id: randomId("history-"),
      type: "default-attack",
      relationshipId: options.relationshipId,
      commandId: "attack",
      targetTokenId: options.targetTokenId || null,
      used: attack.used,
      reason: attack.reason,
      attackLabel: attack.attackLabel ?? null,
      createdAt: new Date().toISOString(),
    });
  }
}
