/* storage.js
 * Everything that touches localStorage, the starter file, and import/export.
 *
 * Every function that reads or writes takes the storage object as its last
 * argument and defaults to the browser's localStorage. tests.html passes an
 * in-memory fake instead, so running the tests never touches real user data.
 *
 * Nothing here trusts what it reads. Saved data, imported files and the seed
 * all go through the same strict parser, which uses the validators module.
 */

import { isIsoTimestamp, isRecordId, validateRecord } from "./validators.js";

export const KEYS = Object.freeze({
  records: "clp:records:v1",
  settings: "clp:settings:v1",
  // Unreadable saved data is copied here before anything can overwrite it.
  backup: "clp:records:v1:corrupt-backup",
});

export const FILE_LIMITS = Object.freeze({
  maxChars: 1_000_000,
  maxRecords: 2000,
  maxProblems: 20,
});

export const DEFAULT_SETTINGS = Object.freeze({
  capMinutes: 0, // 0 means no weekly cap
  units: "minutes",
  rate: 60, // minutes per hour for the unit converter
  urgentHours: 48,
  buffer: 5,
  theme: "system",
  stressMode: false,
});

const RECORD_FIELDS = ["id", "title", "duration", "tag", "dueDate", "walk", "createdAt", "updatedAt"];
const ENVELOPE_FIELDS = ["app", "version", "exportedAt", "records"];
const CSV_COLUMNS = RECORD_FIELDS;
const SEED_URL = new URL("../seed.json", import.meta.url);

/** Private mode and blocked cookies can make even touching localStorage throw. */
function getStore() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function tryWrite(store, key, text) {
  if (!store) {
    return { ok: false, message: "Browser storage is not available, so changes will not be kept." };
  }
  try {
    store.setItem(key, text);
    return { ok: true, message: "" };
  } catch (error) {
    const full = /quota/i.test(String(error && error.name));
    return {
      ok: false,
      message: full
        ? "Browser storage is full. Export your data, then delete some records."
        : "Could not save to browser storage.",
    };
  }
}

const shorten = (text) => JSON.stringify(String(text).slice(0, 30));

/* ---------- strict record checking ---------- */

function checkStoredRecord(item, index) {
  const label = `Record ${index + 1}`;
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return { record: null, problems: [`${label}: must be an object.`] };
  }
  const problems = [];
  for (const key of Object.keys(item)) {
    if (!RECORD_FIELDS.includes(key)) {
      problems.push(`${label}: unknown field ${shorten(key)}.`);
    }
  }
  if (!isRecordId(item.id)) problems.push(`${label}: id must look like plan_0001.`);
  if (!isIsoTimestamp(item.createdAt)) problems.push(`${label}: createdAt must be an ISO timestamp.`);
  if (!isIsoTimestamp(item.updatedAt)) problems.push(`${label}: updatedAt must be an ISO timestamp.`);
  if (
    isIsoTimestamp(item.createdAt) &&
    isIsoTimestamp(item.updatedAt) &&
    Date.parse(item.updatedAt) < Date.parse(item.createdAt)
  ) {
    problems.push(`${label}: updatedAt is earlier than createdAt.`);
  }
  const checked = validateRecord(item);
  for (const [field, message] of Object.entries(checked.errors)) {
    problems.push(`${label} (${field}): ${message}`);
  }
  if (problems.length > 0) return { record: null, problems };

  // Rebuild from validated pieces only, so nothing unexpected is carried along.
  return {
    record: {
      id: item.id,
      title: checked.record.title,
      duration: checked.record.duration,
      tag: checked.record.tag,
      dueDate: checked.record.dueDate,
      walk: checked.record.walk,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    },
    problems: [],
  };
}

const rejected = (problems) => ({ ok: false, records: [], problems });

/**
 * The one strict parser behind saved data, imports and the seed file.
 * Accepts a bare list of records or the export envelope. All or nothing:
 * a single bad record rejects the whole file.
 */
export function parseRecordList(text) {
  if (typeof text !== "string") return rejected(["There is no file content to read."]);
  if (text.length > FILE_LIMITS.maxChars) {
    return rejected([`That file is too large. The limit is ${FILE_LIMITS.maxChars} characters.`]);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return rejected(["That is not valid JSON."]);
  }

  let list = data;
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    const stray = Object.keys(data).find((key) => !ENVELOPE_FIELDS.includes(key));
    if (stray !== undefined) return rejected([`Unknown top-level field ${shorten(stray)}.`]);
    if (data.version !== 1) return rejected(["Unsupported file version. Expected version 1."]);
    list = data.records;
  }
  if (!Array.isArray(list)) return rejected(["Expected a list of records."]);
  if (list.length > FILE_LIMITS.maxRecords) {
    return rejected([`A file can hold at most ${FILE_LIMITS.maxRecords} records.`]);
  }

  const seen = new Set();
  const records = [];
  const problems = [];
  list.forEach((item, index) => {
    const result = checkStoredRecord(item, index);
    problems.push(...result.problems);
    if (!result.record) return;
    if (seen.has(result.record.id)) {
      problems.push(`Record ${index + 1}: id ${result.record.id} is used more than once.`);
      return;
    }
    seen.add(result.record.id);
    records.push(result.record);
  });

  if (problems.length > FILE_LIMITS.maxProblems) {
    const extra = problems.length - FILE_LIMITS.maxProblems;
    problems.length = FILE_LIMITS.maxProblems;
    problems.push(`...and ${extra} more problems.`);
  }
  return problems.length > 0 ? rejected(problems) : { ok: true, records, problems: [] };
}

/* ---------- records in localStorage ---------- */

/** status is "ok", "empty", "corrupt" or "unavailable". */
export function loadRecords(store = getStore()) {
  if (!store) return { status: "unavailable", records: [], problems: [] };
  let text;
  try {
    text = store.getItem(KEYS.records);
  } catch {
    return { status: "unavailable", records: [], problems: [] };
  }
  if (text === null) return { status: "empty", records: [], problems: [] };

  const parsed = parseRecordList(text);
  if (parsed.ok) return { status: "ok", records: parsed.records, problems: [] };

  // Keep the unreadable text so a later save cannot destroy it.
  try {
    store.setItem(KEYS.backup, text);
  } catch {
    /* nothing more we can do */
  }
  return { status: "corrupt", records: [], problems: parsed.problems };
}

export function saveRecords(records, store = getStore()) {
  if (!Array.isArray(records)) return { ok: false, message: "Nothing to save." };
  return tryWrite(store, KEYS.records, JSON.stringify(records));
}

export async function loadSeed(url = SEED_URL, fetchFn = globalThis.fetch) {
  try {
    const response = await fetchFn(url);
    if (!response.ok) {
      return rejected([`Could not load the starter records (HTTP ${response.status}).`]);
    }
    return parseRecordList(await response.text());
  } catch {
    return rejected(["Could not load the starter records."]);
  }
}

/**
 * Start-up: use saved records if they are readable, otherwise fall back to
 * the seed file. source is "storage", "seed" or "none".
 */
export async function bootRecords(store = getStore(), fetchFn = globalThis.fetch) {
  const stored = loadRecords(store);
  if (stored.status === "ok") {
    return { records: stored.records, source: "storage", saved: true, problems: [] };
  }
  const seed = await loadSeed(undefined, fetchFn);
  const problems = [...stored.problems, ...seed.problems];
  if (stored.status === "corrupt") {
    problems.unshift("Your saved records could not be read. A backup copy was kept and the starter records were loaded.");
  }
  if (!seed.ok) return { records: [], source: "none", saved: false, problems };
  const saved = saveRecords(seed.records, store).ok;
  return { records: seed.records, source: "seed", saved, problems };
}

/** Next id such as plan_0014. Reads the highest number in use, ignores junk ids. */
export function nextRecordId(records) {
  let highest = 0;
  for (const record of records) {
    const hit = /^plan_(\d+)$/.exec(record && record.id);
    if (hit) highest = Math.max(highest, Number(hit[1]));
  }
  return "plan_" + String(highest + 1).padStart(4, "0");
}

/* ---------- settings ---------- */

function asInt(value, min, max, fallback) {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^\d+$/.test(text)) return fallback;
  const number = Number(text);
  return number >= min && number <= max ? number : fallback;
}

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/** Always returns a complete, safe settings object. Bad fields fall back one by one. */
export function validateSettings(raw) {
  const s = raw !== null && typeof raw === "object" ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    capMinutes: asInt(s.capMinutes, 0, 10080, d.capMinutes),
    units: pick(s.units, ["minutes", "hours"], d.units),
    rate: asInt(s.rate, 1, 1440, d.rate),
    urgentHours: asInt(s.urgentHours, 1, 336, d.urgentHours),
    buffer: asInt(s.buffer, 0, 30, d.buffer),
    theme: pick(s.theme, ["system", "light", "dark"], d.theme),
    stressMode: s.stressMode === true,
  };
}

export function loadSettings(store = getStore()) {
  try {
    const text = store && store.getItem(KEYS.settings);
    return validateSettings(text ? JSON.parse(text) : {});
  } catch {
    return validateSettings({});
  }
}

export function saveSettings(settings, store = getStore()) {
  return tryWrite(store, KEYS.settings, JSON.stringify(validateSettings(settings)));
}

export function clearAllData(store = getStore()) {
  if (!store) return { ok: false, message: "Browser storage is not available." };
  try {
    store.removeItem(KEYS.records);
    store.removeItem(KEYS.settings);
    store.removeItem(KEYS.backup);
    return { ok: true, message: "" };
  } catch {
    return { ok: false, message: "Could not clear browser storage." };
  }
}

/* ---------- export ---------- */

export function exportFileName(extension, now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `campus-life-planner-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${extension}`;
}

export function exportJSON(records, now = new Date()) {
  return JSON.stringify(
    { app: "campus-life-planner", version: 1, exportedAt: now.toISOString(), records },
    null,
    2
  );
}

/**
 * One CSV cell. Quotes cells that contain a comma, quote or line break, and
 * doubles any quotes inside. A leading = + - @ tab or return would make
 * Excel and Sheets run the cell as a formula, so those get a leading apostrophe.
 */
export function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

/** CRLF line ends per RFC 4180, with a byte order mark so Excel reads accents correctly. */
export function exportCSV(records) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const record of records) {
    lines.push(CSV_COLUMNS.map((column) => csvCell(record[column])).join(","));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/** Browser only: hands a text file to the user as a download. */
export function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
