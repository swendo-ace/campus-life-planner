/* validators.js
 * Every rule that decides whether text is allowed into the Campus Life Planner.
 * Pure functions only: no DOM, no storage, so tests.html can call them directly.
 *
 * Every validator returns the same shape:
 *   { ok: boolean, value: cleaned value or null, message: string, warnings: string[] }
 * A warning never blocks saving. An error (ok: false) always does.
 */

export const LIMITS = Object.freeze({
  titleMax: 80,
  tagMax: 40,
  durationMaxChars: 8,
  durationMaxMinutes: 10080, // one full week of minutes
  walkMaxMinutes: 120,
  yearMin: 1900,
  yearMax: 2100,
});

// Every pattern lives here, compiled once. None uses the g or y flag: a global
// regex remembers lastIndex between .test() calls and can answer differently
// for the same input. tests.html checks this on purpose.
export const PATTERNS = Object.freeze({
  // First and last character are non-whitespace. The optional group lets a
  // one-character title pass.
  title: /^\S(?:.*\S)?$/,
  // Lookahead: somewhere ahead there must be a letter or digit, so "!!!" fails.
  titleSubstance: /^(?=.*[\p{L}\p{N}])/u,
  // Integer or decimal with up to 2 places, no leading zeros ("007" fails).
  duration: /^(0|[1-9]\d*)(\.\d{1,2})?$/,
  // Three capture groups (year, month, day). Shape only: the calendar check
  // below is what rejects 2026-02-30.
  date: /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  // Words of letters, joined by one space or one hyphen. A separator is
  // required between repeats, which keeps the pattern safe from catastrophic
  // backtracking.
  tag: /^[A-Za-z]+(?:[ -][A-Za-z]+)*$/,
  walk: /^(0|[1-9]\d{0,2})$/,
  // Back-reference: group 1 captures a word, \1 demands the same word again.
  // The closing \b stops "the then" from matching.
  duplicateWord: /\b(\w+)\s+\1\b/i,
  // Hours 00-23, minutes 00-59, so "99:99" is not treated as a time.
  timeToken: /\b([01]\d|2[0-3]):([0-5]\d)\b/,
  recordId: /^plan_\d{4,}$/,
  isoTimestamp: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
});

const ok = (value, warnings = []) => ({ ok: true, value, message: "", warnings });
const bad = (message) => ({ ok: false, value: null, message, warnings: [] });

/** Title: no edge whitespace (error), inner runs of whitespace collapse to one space. */
export function validateTitle(raw) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return bad("Give the task a title.");
  }
  if (!PATTERNS.title.test(raw)) {
    return bad("Remove the spaces at the start or end of the title.");
  }
  const cleaned = raw.replace(/\s{2,}/g, " ");
  if (cleaned.length > LIMITS.titleMax) {
    return bad(`Keep the title to ${LIMITS.titleMax} characters or fewer.`);
  }
  if (!PATTERNS.titleSubstance.test(cleaned)) {
    return bad("Add at least one letter or number to the title.");
  }
  const warnings = [];
  const repeat = cleaned.match(PATTERNS.duplicateWord);
  if (repeat) {
    warnings.push(`"${repeat[1]}" appears twice in a row. Is that a typo?`);
  }
  return ok(cleaned, warnings);
}

/** Finds the first valid HH:MM inside a string, or returns null. */
export function findTimeToken(text) {
  if (typeof text !== "string") return null;
  const hit = text.match(PATTERNS.timeToken);
  if (!hit) return null;
  return { text: hit[0], hours: Number(hit[1]), minutes: Number(hit[2]) };
}

/** Duration in minutes. Text input on purpose, so the regex sees what was typed. */
export function validateDuration(raw) {
  const text = typeof raw === "number" ? String(raw) : raw;
  if (typeof text !== "string" || text === "") {
    return bad("Enter how many minutes the task takes.");
  }
  if (text.length > LIMITS.durationMaxChars || !PATTERNS.duration.test(text)) {
    return bad("Use a plain number such as 90 or 7.5, with at most 2 decimals.");
  }
  const minutes = Number(text);
  if (minutes <= 0) {
    return bad("A task needs more than 0 minutes.");
  }
  if (minutes > LIMITS.durationMaxMinutes) {
    return bad(`Keep it to ${LIMITS.durationMaxMinutes} minutes (one week) or less.`);
  }
  return ok(minutes);
}

/** Walk time in whole minutes. Blank means no walk. */
export function validateWalk(raw) {
  const text = typeof raw === "number" ? String(raw) : (raw ?? "");
  if (text === "") return ok(0);
  if (typeof text !== "string" || !PATTERNS.walk.test(text)) {
    return bad("Walk time must be a whole number of minutes, from 0 to 120.");
  }
  const minutes = Number(text);
  if (minutes > LIMITS.walkMaxMinutes) {
    return bad("Walk time must be a whole number of minutes, from 0 to 120.");
  }
  return ok(minutes);
}

/** Due date: YYYY-MM-DD shape first, then a real-calendar check. */
export function validateDate(raw) {
  if (typeof raw !== "string" || raw === "") {
    return bad("Enter a due date.");
  }
  const parts = raw.match(PATTERNS.date);
  if (!parts) {
    return bad("Use the format YYYY-MM-DD, for example 2026-10-15.");
  }
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (year < LIMITS.yearMin || year > LIMITS.yearMax) {
    return bad(`Pick a year between ${LIMITS.yearMin} and ${LIMITS.yearMax}.`);
  }
  // Build the date in UTC, then read it back. If the day rolled over into the
  // next month, the original date never existed.
  const probe = new Date(Date.UTC(year, month - 1, day));
  const real =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  if (!real) {
    return bad("That date does not exist on the calendar.");
  }
  return ok(raw);
}

/** Tag: letters, with single spaces or hyphens between words. */
export function validateTag(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return bad("Add a tag, for example Academics.");
  }
  if (raw.length > LIMITS.tagMax) {
    return bad(`Keep the tag to ${LIMITS.tagMax} characters or fewer.`);
  }
  if (!PATTERNS.tag.test(raw)) {
    return bad("Use letters only, with single spaces or hyphens between words.");
  }
  return ok(raw);
}

/**
 * Checks a whole record. Fields are checked in form order so the error
 * summary reads top to bottom. Used by the form and by strict import.
 */
export function validateRecord(input) {
  const source = input && typeof input === "object" ? input : {};
  const checks = {
    title: validateTitle(source.title),
    tag: validateTag(source.tag),
    dueDate: validateDate(source.dueDate),
    duration: validateDuration(source.duration),
    walk: validateWalk(source.walk),
  };
  const errors = {};
  const warnings = {};
  const record = {};
  for (const [field, result] of Object.entries(checks)) {
    if (result.ok) {
      record[field] = result.value;
      if (result.warnings.length > 0) warnings[field] = result.warnings;
    } else {
      errors[field] = result.message;
    }
  }
  return { ok: Object.keys(errors).length === 0, errors, warnings, record };
}

export const isRecordId = (value) =>
  typeof value === "string" && PATTERNS.recordId.test(value);

export const isIsoTimestamp = (value) =>
  typeof value === "string" &&
  PATTERNS.isoTimestamp.test(value) &&
  !Number.isNaN(Date.parse(value));
