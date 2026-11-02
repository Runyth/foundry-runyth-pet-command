// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { clamp } from "./model.mjs";

function sceneBounds(tokenDocument) {
  const dimensions = canvas?.dimensions ?? canvas?.scene?.dimensions ?? {};
  const rectangle = dimensions.sceneRect ?? {
    x: dimensions.sceneX ?? 0,
    y: dimensions.sceneY ?? 0,
    width: dimensions.sceneWidth ?? canvas?.scene?.width ?? 0,
    height: dimensions.sceneHeight ?? canvas?.scene?.height ?? 0,
  };
  const grid = canvas?.grid?.size ?? canvas?.scene?.grid?.size ?? 100;
  const size = tokenDocument.getSize?.() ?? {
    width: Number(tokenDocument.width ?? 1) * grid,
    height: Number(tokenDocument.height ?? 1) * grid,
  };
  return {
    minimumX: rectangle.x,
    minimumY: rectangle.y,
    maximumX: rectangle.x + rectangle.width - Number(size.width ?? grid),
    maximumY: rectangle.y + rectangle.height - Number(size.height ?? grid),
    grid,
  };
}

function clampPoint(point, tokenDocument) {
  const bounds = sceneBounds(tokenDocument);
  return {
    x: Math.round(clamp(point.x, bounds.minimumX, bounds.maximumX)),
    y: Math.round(clamp(point.y, bounds.minimumY, bounds.maximumY)),
  };
}

function tokenCenter(token) {
  const document = token?.document ?? token;
  const nativeCenter = document?.getCenterPoint?.();
  if (nativeCenter && Number.isFinite(nativeCenter.x) && Number.isFinite(nativeCenter.y)) {
    return { x: Number(nativeCenter.x), y: Number(nativeCenter.y) };
  }
  const grid = canvas?.grid?.size ?? 100;
  return {
    x: Number(document?.x ?? 0) + (Number(document?.width ?? 1) * grid) / 2,
    y: Number(document?.y ?? 0) + (Number(document?.height ?? 1) * grid) / 2,
  };
}

function tokenPixelSize(token) {
  const document = token?.document ?? token;
  const grid = canvas?.grid?.size ?? 100;
  const nativeSize = document?.getSize?.();
  return {
    width: Number(nativeSize?.width ?? Number(document?.width ?? 1) * grid),
    height: Number(nativeSize?.height ?? Number(document?.height ?? 1) * grid),
  };
}

function projectedHalfExtent(token, unitX, unitY) {
  const size = tokenPixelSize(token);
  return (Math.abs(unitX) * size.width + Math.abs(unitY) * size.height) / 2;
}

function topLeftForCenter(center, tokenDocument) {
  const size = tokenPixelSize(tokenDocument);
  return clampPoint(
    {
      x: center.x - size.width / 2,
      y: center.y - size.height / 2,
    },
    tokenDocument,
  );
}

function currentPoint(petToken) {
  return {
    x: Math.round(Number(petToken.document.x ?? 0)),
    y: Math.round(Number(petToken.document.y ?? 0)),
  };
}

function pointToward(petToken, targetToken, distancePixels, stopAdjacent = true) {
  const from = tokenCenter(petToken);
  const to = tokenCenter(targetToken);
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length < 0.5) return currentPoint(petToken);

  const unitX = deltaX / length;
  const unitY = deltaY / length;
  const adjacencyGap = 2;
  const desiredCenterDistance = stopAdjacent
    ? projectedHalfExtent(petToken, unitX, unitY) + projectedHalfExtent(targetToken, unitX, unitY) + adjacencyGap
    : 0;
  const availableTravel = Math.max(0, length - desiredCenterDistance);
  const travel = Math.min(Math.max(0, Number(distancePixels) || 0), availableTravel);
  if (travel < 0.5) return currentPoint(petToken);

  return topLeftForCenter(
    {
      x: from.x + unitX * travel,
      y: from.y + unitY * travel,
    },
    petToken.document,
  );
}

function pointAway(petToken, targetToken, distancePixels) {
  const from = tokenCenter(petToken);
  const target = targetToken ? tokenCenter(targetToken) : { x: from.x - 1, y: from.y - 1 };
  const deltaX = from.x - target.x;
  const deltaY = from.y - target.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  return topLeftForCenter(
    {
      x: from.x + (deltaX / length) * distancePixels,
      y: from.y + (deltaY / length) * distancePixels,
    },
    petToken.document,
  );
}

function randomPoint(petToken, distancePixels) {
  const angle = Math.random() * Math.PI * 2;
  return clampPoint(
    {
      x: Number(petToken.document.x ?? 0) + Math.cos(angle) * distancePixels,
      y: Number(petToken.document.y ?? 0) + Math.sin(angle) * distancePixels,
    },
    petToken.document,
  );
}

function circlePoints(petToken, radiusPixels) {
  const center = tokenCenter(petToken);
  const points = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI * 2 * index) / 8;
    points.push(
      topLeftForCenter(
        {
          x: center.x + Math.cos(angle) * radiusPixels,
          y: center.y + Math.sin(angle) * radiusPixels,
        },
        petToken.document,
      ),
    );
  }
  points.push(currentPoint(petToken));
  return points;
}

function behindOwnerPoint(petToken, ownerToken, targetToken, grid) {
  const ownerCenter = tokenCenter(ownerToken);
  const threatCenter = tokenCenter(targetToken ?? petToken);
  const dx = ownerCenter.x - threatCenter.x;
  const dy = ownerCenter.y - threatCenter.y;
  const length = Math.hypot(dx, dy) || 1;
  return topLeftForCenter(
    {
      x: ownerCenter.x + (dx / length) * grid,
      y: ownerCenter.y + (dy / length) * grid,
    },
    petToken.document,
  );
}

function movementWaypoints({ movement, petToken, ownerToken, targetToken, configuration }) {
  const grid = canvas?.grid?.size ?? 100;
  const distance = Number(configuration.movementDistanceSquares ?? 4) * grid;

  switch (movement) {
    case "none":
      return [];
    case "random-short":
      return [randomPoint(petToken, Math.max(grid, distance / 2))];
    case "random-medium":
      return [randomPoint(petToken, distance)];
    case "circle":
      return circlePoints(petToken, Number(configuration.circleRadiusSquares ?? 2) * grid);
    case "toward-owner":
      return ownerToken ? [pointToward(petToken, ownerToken, distance)] : null;
    case "behind-owner":
      return ownerToken ? [behindOwnerPoint(petToken, ownerToken, targetToken, grid)] : null;
    case "toward-target":
      return targetToken ? [pointToward(petToken, targetToken, distance)] : null;
    case "toward-target-short":
      return targetToken ? [pointToward(petToken, targetToken, Math.max(grid, distance / 2))] : null;
    case "away-from-target":
      return [pointAway(petToken, targetToken ?? ownerToken, distance)];
    default:
      return undefined;
  }
}

function pointsDiffer(left, right) {
  return Math.abs(Number(left?.x ?? 0) - Number(right?.x ?? 0)) >= 0.5
    || Math.abs(Number(left?.y ?? 0) - Number(right?.y ?? 0)) >= 0.5;
}

async function pathfindWaypoints(petToken, waypoints) {
  if (!petToken?.findMovementPath || waypoints.length === 0) return { waypoints, pathfound: false };
  const origin = currentPoint(petToken);
  const requested = [origin, ...waypoints.filter((point, index) => index > 0 || pointsDiffer(point, origin))];
  if (requested.length < 2) return { waypoints: [], pathfound: false };

  try {
    const job = petToken.findMovementPath(requested, {
      preview: false,
      delay: 0,
      constrainOptions: { ignoreWalls: false, ignoreCost: false },
    });
    const path = await job?.promise;
    if (!Array.isArray(path) || path.length < 2) return { waypoints, pathfound: false };
    return { waypoints: path.slice(1), pathfound: true };
  } catch {
    return { waypoints, pathfound: false };
  }
}

async function waitForMovementAnimation(petToken) {
  try {
    const animation = petToken?.movementAnimationPromise;
    if (animation && typeof animation.then === "function") await animation;
  } catch {
    // Movement persistence is authoritative; an animation failure must not undo it.
  }
}

async function executeMovement(petToken, waypoints) {
  const document = petToken?.document;
  if (!document) return { moved: false, reason: "pet-token-missing" };
  const before = currentPoint(petToken);
  const destination = waypoints.at(-1) ?? before;
  if (!pointsDiffer(before, destination)) return { moved: false, reason: "already-positioned", destination: before };

  try {
    const routed = await pathfindWaypoints(petToken, waypoints);
    if (!routed.waypoints.length) return { moved: false, reason: "already-positioned", destination: before };

    if (typeof document.move === "function") {
      const completed = await document.move(routed.waypoints, {
        method: "api",
        autoRotate: true,
        showRuler: false,
        constrainOptions: { ignoreWalls: false, ignoreCost: false },
      });
      await waitForMovementAnimation(petToken);
      const after = currentPoint(petToken);
      const moved = pointsDiffer(before, after);
      return {
        moved,
        reason: completed ? "moved" : moved ? "partial" : "rejected",
        pathfound: routed.pathfound,
        destination: after,
      };
    }

    const final = routed.waypoints.at(-1);
    await document.update(final, { animate: true });
    await waitForMovementAnimation(petToken);
    const after = currentPoint(petToken);
    return {
      moved: pointsDiffer(before, after),
      reason: pointsDiffer(before, after) ? "moved-fallback" : "rejected",
      pathfound: routed.pathfound,
      destination: after,
    };
  } catch (error) {
    const after = currentPoint(petToken);
    return {
      moved: pointsDiffer(before, after),
      reason: pointsDiffer(before, after) ? "partial" : "error",
      error,
      destination: after,
    };
  }
}

export function findRelationshipTokens(profile, relationship) {
  const tokens = canvas?.tokens?.placeables ?? [];
  const preferredTokenUuid = profile?.preferredTokenUuid;
  const petActorId = profile?.actorId ?? relationship?.petActorId;
  const ownerActorId = relationship?.ownerActorId;
  let preferredPet = null;
  let actorPet = null;
  let ownerToken = null;
  for (const token of tokens) {
    if (!preferredPet && preferredTokenUuid && token.document?.uuid === preferredTokenUuid) preferredPet = token;
    if (!actorPet && petActorId && (token.actor?.id === petActorId || token.document?.actorId === petActorId)) actorPet = token;
    if (!ownerToken && ownerActorId && (token.actor?.id === ownerActorId || token.document?.actorId === ownerActorId)) ownerToken = token;
    if (preferredPet && ownerToken) break;
  }
  return { petToken: preferredPet ?? actorPet, ownerToken };
}

export function findPetToken(profile, relationship = null) {
  const tokens = canvas?.tokens?.placeables ?? [];
  if (profile?.preferredTokenUuid) {
    const exact = tokens.find((token) => token.document.uuid === profile.preferredTokenUuid);
    if (exact) return exact;
  }
  const actorId = profile?.actorId ?? relationship?.petActorId;
  if (actorId) {
    const matching = tokens.find((token) => token.actor?.id === actorId || token.document.actorId === actorId);
    if (matching) return matching;
  }
  return null;
}

export function findActorToken(actorId) {
  if (!actorId) return null;
  return (canvas?.tokens?.placeables ?? []).find((token) => token.actor?.id === actorId || token.document.actorId === actorId) ?? null;
}

export async function movePetForAction({ action, petToken, ownerToken = null, targetToken = null, configuration }) {
  if (!petToken?.document || action.movement === "none") return { moved: false, reason: "no-movement" };
  const waypoints = movementWaypoints({ movement: action.movement, petToken, ownerToken, targetToken, configuration });
  if (waypoints === undefined) return { moved: false, reason: "unsupported-movement" };
  if (waypoints === null) return { moved: false, reason: "missing-target" };
  return executeMovement(petToken, waypoints);
}

export async function movePetForCommand({ command, petToken, ownerToken = null, targetToken = null, configuration }) {
  const movement = command?.movement ?? "none";
  if (!petToken?.document || movement === "none") return { moved: false, reason: "no-movement" };
  const effectiveTarget = targetToken ?? (command?.targetMode === "optional-owner" ? ownerToken : null);
  const waypoints = movementWaypoints({ movement, petToken, ownerToken, targetToken: effectiveTarget, configuration });
  if (waypoints === undefined) return { moved: false, reason: "unsupported-movement" };
  if (waypoints === null) return { moved: false, reason: "missing-target" };
  return executeMovement(petToken, waypoints);
}
