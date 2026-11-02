import { MODULE_ID } from "./constants.mjs";

let actorCache = null;
let actorCacheLanguage = null;

export class UserInputError extends Error {
  constructor(message, { fieldName = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "UserInputError";
    this.fieldName = fieldName;
  }
}

export function isUserInputError(error) {
  return error instanceof UserInputError;
}

export function t(key, data = null, fallback = null) {
  const i18n = globalThis.game?.i18n;
  const hasData = data && Object.keys(data).length > 0;
  const localized = hasData ? i18n?.format?.(key, data) : i18n?.localize?.(key);
  return !localized || localized === key ? fallback ?? key.split(".").at(-1) : localized;
}

const HTML_ENTITIES = Object.freeze({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" });

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

export function randomId(prefix = "") {
  const id = globalThis.foundry?.utils?.randomID?.() ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}${id}`;
}

export function invalidateActorCache() {
  actorCache = null;
  actorCacheLanguage = null;
}

export function worldActors() {
  const language = game?.i18n?.lang ?? "en";
  if (actorCache && actorCacheLanguage === language) return actorCache;
  actorCache = Object.freeze([...(game?.actors?.contents ?? [])].sort((left, right) => left.name.localeCompare(right.name, language)));
  actorCacheLanguage = language;
  return actorCache;
}

export function actorReference(actor, tokenDocument = null) {
  const baseActor = tokenDocument?.baseActor ?? actor;
  return {
    actorUuid: baseActor?.uuid ?? actor?.uuid,
    actorId: baseActor?.id ?? actor?.id ?? tokenDocument?.actorId ?? null,
    name: actor?.name ?? baseActor?.name ?? tokenDocument?.name ?? t("PETCOMMAND.Fallback.UnnamedActor", {}, "Unnamed actor"),
    tokenUuid: tokenDocument?.uuid ?? null,
  };
}

export function controlledToken() {
  const controlled = canvas?.tokens?.controlled ?? [];
  return controlled.length === 1 ? controlled[0] : null;
}

export function actorIdFromContextElement(element) {
  const raw = element?.[0] ?? element;
  return raw?.dataset?.entryId ?? raw?.dataset?.documentId ?? raw?.dataset?.actorId ?? element?.data?.("entry-id") ?? null;
}

export function notify(level, message) {
  const method = ui?.notifications?.[level] ?? ui?.notifications?.info;
  method?.call(ui.notifications, message);
}

export function downloadJson(filename, data) {
  const json = JSON.stringify(data, null, 2);
  const saveFile = globalThis.foundry?.utils?.saveDataToFile;
  if (typeof saveFile === "function") {
    saveFile(json, "application/json", filename);
    return;
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body?.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout?.(() => URL.revokeObjectURL(url), 0);
}

export async function readJsonFile(file) {
  if (!file || typeof file.text !== "function") {
    throw new UserInputError(t("PETCOMMAND.Errors.ImportFileRequired"), { fieldName: "importFile" });
  }
  try {
    return JSON.parse(await file.text());
  } catch (error) {
    if (error instanceof UserInputError) throw error;
    throw new UserInputError(t("PETCOMMAND.Errors.InvalidJson"), { fieldName: "importFile", cause: error });
  }
}

export function moduleLog(...args) {
  console.log(`${MODULE_ID} |`, ...args);
}

export function moduleError(error, context = "") {
  console.error(`${MODULE_ID} | ${context}`, error);
}
