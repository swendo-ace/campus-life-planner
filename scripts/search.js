const TAG = /@tag:(?:"([^"]+)"|(\S+))/i;
// Heuristic: a group that repeats inside a repeat, like (a+)+, can freeze the page
const RISKY = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/;

// "@tag:Academics study" -> { tag: "Academics", pattern: "study" }
export function parseQuery(text) {
  const m = TAG.exec(text);
  return { tag: m ? m[1] ?? m[2] : "", pattern: (m ? text.replace(m[0], "") : text).trim() };
}

export function compile(pattern, ignoreCase = true) {
  if (!pattern) return { re: null, error: "" };
  if (pattern.length > 80) return { re: null, error: "Keep the pattern under 80 characters." };
  if (RISKY.test(pattern)) return { re: null, error: "That pattern could freeze the page. Avoid a repeated group inside a repeat, like (a+)+." };
  try {
    return { re: new RegExp(pattern, ignoreCase ? "i" : ""), error: "" };
  } catch (e) {
    return { re: null, error: `Not a valid pattern: ${e.message}` };
  }
}

// Tag filter first, then the pattern against title or tag. A bad pattern leaves the list unfiltered.
export function searchRecords(records, query, ignoreCase = true) {
  const { tag, pattern } = parseQuery(query);
  const { re, error } = compile(pattern, ignoreCase);
  const same = (a, b) => (ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b);
  const byTag = tag ? records.filter((r) => same(r.tag, tag)) : records;
  const hits = re ? byTag.filter((r) => re.test(r.title) || re.test(r.tag)) : byTag;
  return { records: hits, re, tag, error };
}

// Splits text into plain and matched pieces. The UI wraps matched pieces in <mark> using textContent, never HTML.
export function segments(text, re) {
  if (!re) return [{ text, match: false }];
  const out = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(re.source, re.flags + "g"))) {
    if (!m[0]) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index), match: false });
    out.push({ text: m[0], match: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), match: false });
  return out.length ? out : [{ text, match: false }];
}