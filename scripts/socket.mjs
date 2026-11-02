import { COMMAND_BY_ID, MODULE_ID, RELATIONSHIP_STATUS } from "./constants.mjs";
import { normalizeTargetPools } from "./model.mjs";
import { randomId, t } from "./utilities.mjs";

const CHANNEL = `module.${MODULE_ID}`;
const pending = new Map();
const activeRelationshipSortCache = new WeakMap();

function sortedActiveRelationships(state) {
  const language = game.i18n?.lang ?? "en";
  const cached = activeRelationshipSortCache.get(state);
  if (cached?.language === language) return cached.relationships;
  const relationships = Object.values(state.relationships)
    .filter((relationship) => relationship.status === RELATIONSHIP_STATUS.ACTIVE)
    .sort((left, right) => `${left.petNameSnapshot} ${left.ownerNameSnapshot}`.localeCompare(`${right.petNameSnapshot} ${right.ownerNameSnapshot}`, language));
  const entry = { language, relationships: Object.freeze(relationships) };
  activeRelationshipSortCache.set(state, entry);
  return entry.relationships;
}

function designatedGm() {
  return game.users?.getDesignatedUser?.((user) => user.active && user.isGM)
    ?? (game.users?.contents ?? []).filter((user) => user.active && user.isGM).sort((left, right) => left.id.localeCompare(right.id))[0]
    ?? null;
}

function userOwnsRelationship(user, relationship) {
  if (user?.isGM) return true;
  const owner = game.actors?.get(relationship?.ownerActorId);
  return Boolean(owner?.testUserPermission?.(user, "OWNER"));
}

function relationshipBelongsToActor(relationship, actor) {
  if (!relationship || !actor) return false;
  return relationship.ownerActorId === actor.id || relationship.ownerActorUuid === actor.uuid;
}

function serializeResult(result) {
  return {
    obedience: {
      total: Number(result.obedience.roll.total),
      dc: result.obedience.dc,
      outcome: result.obedience.outcome,
      xpAward: result.obedience.xpAward,
      commandId: result.obedience.command.id,
    },
    behaviour: result.behaviour
      ? {
          slot: result.behaviour.slot,
          actionId: result.behaviour.action.id,
          targetName: result.behaviour.targetToken?.name ?? null,
        }
      : null,
    commandMovement: result.commandMovement
      ? {
          moved: Boolean(result.commandMovement.moved),
          reason: result.commandMovement.reason ?? null,
        }
      : null,
    attack: result.attack
      ? {
          used: result.attack.used,
          reason: result.attack.reason,
          attackLabel: result.attack.attackLabel ?? null,
          targetName: result.attack.targetName ?? null,
        }
      : null,
  };
}

function resolveToken(tokenId) {
  if (!tokenId) return null;
  return canvas?.tokens?.get?.(tokenId)
    ?? (canvas?.tokens?.placeables ?? []).find((token) => token.id === tokenId || token.document?.id === tokenId || token.document?.uuid === tokenId)
    ?? null;
}

function ownerSpeaker(actor, preferredTokenId = null) {
  const preferred = resolveToken(preferredTokenId);
  const token = preferred?.actor?.id === actor.id ? preferred : actor.getActiveTokens?.(false)?.[0] ?? null;
  return ChatMessage.getSpeaker({ actor, token: token?.document ?? token ?? null });
}


export function permittedPlayerTargetPools(relationship, candidate) {
  if (!relationship?.playerBehaviourTargetsEnabled || !candidate || typeof candidate !== "object") return null;
  return normalizeTargetPools(candidate);
}

export function accessibleRelationships(store, user = game.user) {
  return sortedActiveRelationships(store.state).filter((relationship) => userOwnsRelationship(user, relationship));
}

export function ownerPerspectiveRelationships(store, ownerActorId, user = game.user) {
  if (!user?.isGM || !ownerActorId) return [];
  const owner = game.actors?.get(ownerActorId);
  if (!owner) return [];
  return sortedActiveRelationships(store.state).filter((relationship) => relationshipBelongsToActor(relationship, owner));
}

export async function issueOwnerPerspectiveCommand({
  store,
  rollService,
  ownerActorId,
  ownerTokenId = null,
  relationshipId,
  commandId,
  targetTokenId = null,
  targetPools = null,
}) {
  if (!game.user?.isGM) throw new Error(t("PETCOMMAND.Errors.OwnerPerspectiveNotAllowed"));
  const owner = game.actors?.get(ownerActorId);
  if (!owner) throw new Error(t("PETCOMMAND.Errors.OwnerPerspectiveActorMissing"));
  const relationship = store.state.relationships[relationshipId];
  if (!relationship || !relationshipBelongsToActor(relationship, owner) || relationship.status !== RELATIONSHIP_STATUS.ACTIVE) {
    throw new Error(t("PETCOMMAND.Errors.OwnerPerspectiveRelationshipMismatch"));
  }
  if (!COMMAND_BY_ID[commandId]) throw new Error(t("PETCOMMAND.Errors.InvalidCommand"));
  const target = resolveToken(targetTokenId);
  const configuration = store.configuration;
  return serializeResult(await rollService.rollCommandSequence({
    relationshipId: relationship.id,
    commandId,
    targetTokenId: target?.id ?? null,
    targetPools: targetPools ? normalizeTargetPools(targetPools) : null,
    includeBehaviour: configuration.autoBehaviourOnFailure,
    postToChat: true,
    executeMovement: configuration.movementEnabled,
    speaker: ownerSpeaker(owner, ownerTokenId),
  }));
}

export function requestPlayerCommand(options) {
  const gm = designatedGm();
  if (!gm) return Promise.reject(new Error(t("PETCOMMAND.Errors.NoActiveGm")));
  const requestId = randomId("request-");
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(t("PETCOMMAND.Errors.CommandRequestTimeout")));
    }, 180000);
    pending.set(requestId, { resolve, reject, timeout });
    game.socket.emit(CHANNEL, {
      type: "command-request",
      requestId,
      requesterId: game.user.id,
      handlerId: gm.id,
      options: {
        relationshipId: String(options.relationshipId ?? ""),
        commandId: String(options.commandId ?? ""),
        targetTokenId: options.targetTokenId ? String(options.targetTokenId) : null,
        targetPools: options.targetPools && typeof options.targetPools === "object" ? normalizeTargetPools(options.targetPools) : null,
      },
    });
  });
}

export function registerSocketHandlers({ store, rollService }) {
  game.socket.on(CHANNEL, async (message) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "command-response" && message.recipientId === game.user.id) {
      const entry = pending.get(message.requestId);
      if (!entry) return;
      window.clearTimeout(entry.timeout);
      pending.delete(message.requestId);
      if (message.error) entry.reject(new Error(message.error));
      else entry.resolve(message.result);
      return;
    }

    if (message.type !== "command-request" || !game.user.isGM || message.handlerId !== game.user.id) return;
    let result = null;
    let error = null;
    try {
      const configuration = store.configuration;
      if (!configuration.playerCommandsEnabled) throw new Error(t("PETCOMMAND.Errors.PlayerCommandsDisabled"));
      const requester = game.users?.get(message.requesterId);
      if (!requester?.active) throw new Error(t("PETCOMMAND.Errors.RequesterUnavailable"));
      const relationship = store.state.relationships[message.options?.relationshipId];
      if (!relationship || !userOwnsRelationship(requester, relationship)) throw new Error(t("PETCOMMAND.Errors.RelationshipPermission"));
      if (!COMMAND_BY_ID[message.options?.commandId]) throw new Error(t("PETCOMMAND.Errors.InvalidCommand"));
      const target = resolveToken(message.options?.targetTokenId);
      if (target?.document?.hidden && !requester.isGM) throw new Error(t("PETCOMMAND.Errors.TargetUnavailable"));
      const targetPools = permittedPlayerTargetPools(relationship, message.options?.targetPools);
      result = serializeResult(await rollService.rollCommandSequence({
        relationshipId: relationship.id,
        commandId: message.options.commandId,
        targetTokenId: target?.id ?? null,
        targetPools,
        includeBehaviour: configuration.autoBehaviourOnFailure,
        postToChat: true,
        executeMovement: configuration.movementEnabled,
      }));
    } catch (exception) {
      console.error(`${MODULE_ID} | Player command request failed`, exception);
      error = exception.message ?? String(exception);
    }
    game.socket.emit(CHANNEL, {
      type: "command-response",
      requestId: message.requestId,
      recipientId: message.requesterId,
      result,
      error,
    });
  });
}
