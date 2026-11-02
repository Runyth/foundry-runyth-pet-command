// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { findPetToken } from "./movement.mjs";
import { t } from "./utilities.mjs";

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return [...collection.values()];
  if (typeof collection[Symbol.iterator] === "function") return [...collection];
  return Object.values(collection);
}

function resolvePetActor(profile, relationship) {
  const token = findPetToken(profile, relationship);
  return token?.actor ?? game.actors?.get(profile?.actorId ?? relationship?.petActorId) ?? null;
}

export function attackChoices(profile, relationship = null) {
  const actor = resolvePetActor(profile, relationship);
  if (!actor) return [];
  const choices = [];
  for (const item of collectionValues(actor.items)) {
    const activities = collectionValues(item.system?.activities).filter((activity) => activity?.type === "attack" && activity?.canUse !== false);
    for (const activity of activities) {
      choices.push({
        key: `${item.id}::${activity.id}`,
        itemId: item.id,
        activityId: activity.id,
        item,
        activity,
        label: activities.length > 1 ? `${item.name} · ${activity.name}` : item.name,
        sort: Number(item.sort ?? 0) * 1000 + Number(activity.sort ?? 0),
      });
    }
  }
  return choices.sort((left, right) => left.sort - right.sort || left.label.localeCompare(right.label, game.i18n?.lang));
}

export function selectedAttackKey(profile) {
  return profile?.defaultAttackItemId ? `${profile.defaultAttackItemId}::${profile.defaultAttackActivityId ?? ""}` : "";
}

export function parseAttackKey(value) {
  const [itemId = "", activityId = ""] = String(value ?? "").split("::", 2);
  return { itemId: itemId || null, activityId: activityId || null };
}

function resolveAttack(profile, relationship) {
  const actor = resolvePetActor(profile, relationship);
  if (!actor) return null;
  let first = null;
  for (const item of collectionValues(actor.items)) {
    for (const activity of collectionValues(item.system?.activities)) {
      if (activity?.type !== "attack" || activity?.canUse === false) continue;
      const choice = {
        key: `${item.id}::${activity.id}`,
        itemId: item.id,
        activityId: activity.id,
        item,
        activity,
        label: item.name,
      };
      first ??= choice;
      if (choice.itemId === profile?.defaultAttackItemId && choice.activityId === profile?.defaultAttackActivityId) return choice;
    }
  }
  return first;
}

function targetById(tokenId) {
  if (!tokenId) return null;
  const direct = canvas?.tokens?.get?.(tokenId);
  if (direct) return direct;
  return (canvas?.tokens?.placeables ?? []).find((token) => token.id === tokenId || token.document?.id === tokenId || token.document?.uuid === tokenId) ?? null;
}

export async function useDefaultAttack({ profile, relationship, targetTokenId }) {
  if (game.system?.id !== "dnd5e") return { used: false, reason: "unsupported-system" };
  const target = targetById(targetTokenId);
  if (!target) return { used: false, reason: "missing-target" };
  const attack = resolveAttack(profile, relationship);
  if (!attack) return { used: false, reason: "missing-attack" };
  if (!attack.item?.isOwner) return { used: false, reason: "attack-not-owned", attackLabel: attack.label };

  const previousTargets = [...(game.user?.targets ?? [])];
  try {
    target.setTarget(true, { releaseOthers: true });
    let result;
    if (typeof attack.activity?.rollAttack === "function") {
      // D&D 5e v5 exposes the real attack workflow on AttackActivity.
      result = await attack.activity.rollAttack({}, {}, {});
    } else if (typeof attack.activity?.use === "function") {
      // Forward-compatible fallback for activity implementations that expose only use().
      result = await attack.activity.use({}, {}, {});
    } else {
      return { used: false, reason: "attack-unusable", attackLabel: attack.label };
    }
    if (result === null) return { used: false, reason: "attack-cancelled", attackLabel: attack.label };
    return { used: true, reason: "used", attackLabel: attack.label, targetName: target.name };
  } catch (error) {
    console.error("runyth-pet-command | Default attack failed", error);
    return { used: false, reason: "attack-error", attackLabel: attack.label, error: error.message ?? String(error) };
  } finally {
    for (const current of [...(game.user?.targets ?? [])]) current.setTarget(false);
    for (const previous of previousTargets) previous.setTarget(true);
  }
}

export function attackReasonText(reason) {
  return t(`PETCOMMAND.AttackReasons.${reason}`);
}
