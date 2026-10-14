import { DEFAULT_SETTINGS, nextRecordId, validateSettings } from "./storage.js";
import { findTimeToken, validateRecord } from "./validators.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n) => String(n).padStart(2, "0");
const r2 = (n) => Number(n.toFixed(2));
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true});
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const clockTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Mondays to Sunday of the week containing 'now'
export function weekDays(now = new Date()) {
    const back = (now.getDay() + 6) % 7;
    return DAYS.map((name, i) => {
        const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - back + i));
        return { date: d.toISOString().slice(0, 10), label: `${name} ${d.getUTCDate()}` };
    });
}

// A time in the title (14:30) is the due time, otherwise the end of the due date
export function dueMoment(r) {
    const [y, m, d] = r.dueDate.split("-").map(Number);
    const t = findTimeToken(r.title);
    return t ? new Date(y, m -1, d, t.hours, t.minutes) : new Date(y, m - 1, d, 23, 59, 59);
    }

// Per day: minutes planned, and minutes still ahead at the start of the day (burn-down)
export function weekBreakdown(records, now = new Date()) {
    const days = weekDays(now);
    const planned = days.map((day) => records.filter((r) => r.dueDate === day.date).reduce((s, r) => s + r.duration, 0));
    let left = planned.reduce((a, b) => a + b, 0);
    return days.map((day, i) => {
        const row = { ...day, planned: r2(planned[i]), remaining: r2(left) };
        left -= planned[i];
        return row;
    });
}

export const minutesThisWeek = (records, now) => r2(weekBreakdown(records, now).reduce((s, d) => s + d.planned, 0));

export function capStatus(total, cap) {
    if (!(cap > 0)) return {level: "none", percent: 0, total, cap: 0, left: 0, over: 0 };
    return {
        level: total > cap ? "over" : "under",
        percent: Math.min(100, Math.round((total / cap) * 100)),
        total,
        cap,
        left: r2(Math.max(0, cap - total)),
        over: r2(Math.max(0, total - cap)),
    };
}

export const fmt = (min, s = DEFAULT_SETTINGS) => (s.units === "hours"? `${r2(min / s.rate)} h` : `${r2(min)} min`);

export function capText(c, s) {
    if (c.level ==="none") return "No cap set yet. Set one in Settings.";
    if (c.level ==="over") return `${fmt(c.total, s)} planned this week, over your ${fmt(c.cap, s)} cap by ${fmt(c.over, s)}.`;
    return `${fmt(c.total, s)} of ${fmt(c.cap, s)} planned this week (${c.percent}%). ${fmt(c.left, s)} left.`;
}

// Speaks only when the level changes. Start-up (prev undefined) is quiet unless already over.
export function capAnnouncement(prev, c, s) {
    if (c.level === prev) return null;
    if (c.level === "over") return { urgency: "assertive", message: `Over your weekly cap by ${fmt(c.over, s)}.` };
    if (prev === undefined) return null;
    return { urgency: "polite", message: c.level === "none" ? "Weekly cap cleared." : `Back within your weekly cap: ${fmt(c.left, s)} left.` };
}

const byDue = (a, b) => dueMoment(a) - dueMoment(b) || byId(a, b);
export const overdueRecords = (recs, now = new Date()) => recs.filter((r) => dueMoment(r) < now).sort(byDue);
export const urgentRecords = (recs, s = DEFAULT_SETTINGS, now = new Date()) =>
    recs.filter((r) => { const t = dueMoment(r) - now; return t >= 0 && t <= s.urgentHours * 36e5; }).sort(byDue);

// Next timed event within 24h. Leave-by = due time minus walk time minus buffer
export function nextRush(recs, s = DEFAULT_SETTINGS, now = new Date()) {
    let best = null;
    for (const r of recs) {
        if (!findTimeToken(r.title)) continue;
        const due = dueMoment(r), ahead = due - now;
        if (ahead < 0 || ahead > 864e5) continue;
        const leaveBy = new Date(due -(r.walk + s.buffer) * 6e4);
        if (!best || leaveBy < best.leaveBy) best = { record: r, leaveBy };
    }
    if (!best) return null;
    const spare = Math.round((best.leaveBy - now) / 6e4);
    return {...best, spare, level: spare < 0 ? "late" : spare < 10 ? "rush" : spare < 30 ? "tight" : "relaxed" };
}

export function rushText(x) {
    if (!x) return "Nothing with a time in the next 24 hours.";
    const label = x.level[0].toUpperCase() + x.level.slice(1);
    const gap = x.spare >= 0 ? `${x.spare} min to spare` : `${-x.spare} min behind`;
    return `${label}: leave by ${clockTime(x.leaveBy)} for ${x.record.title}. ${gap}.`;
}

export function stats(recs, s, now = new Date()) {
    const overdue = overdueRecords(recs, now).length;
    const minutes = minutesThisWeek(recs, now);
    return { open: recs.length - overdue, minutes, urgent: urgentRecords(recs, s, now,).length, overdue, cap: capStatus(minutes, s.capMinutes) };
}
export function sortRecords(recs, key = "due") {
    const cmp = { due: byDue, title: (a, b) => collator.compare(a.title, b.title), duration: (a, b) => b.duration - a.duration }[key] ?? byDue;
    return [...recs].sort((a, b) => cmp(a, b) || byId(a, b));
}
export const filterByTag = (recs, tag) => (tag ? recs.filter((r) => r.tag === tag) : recs);
export const tagsOf = (recs) => [...new Set(recs.map((r) => r.tag))].sort(collator.compare);

// The store: holds state, tells listeners about every change 
export function createStore({ records = [], settings = {}, clock = () => new Date() } = {}) {
    let state = { records, settings: validateSettings(settings), view: { query: "", ignoreCase: true, sortKey: "due", tagFilter: "" } };
    let lastLevel;
    const listeners = new Set();

    const capNow = () => capStatus(minutesThisWeek(state.records, clock()), state.settings.capMinutes);
    const refreshCap = () => {
        const status = capNow();
        const announcement = capAnnouncement(lastLevel, status, state.settings);
        lastLevel = status.level;
        return { status, announcement };
    };
    const emit = (type) => {
        const cap = type === "view" ? undefined : refreshCap();
        for (const fn of [...listeners]) {
            try { fn(state, { type, cap }); } catch (e) { console.error(e); }
        }
    };
    const fields = (c) => ({ title: c.title, duration: c.duration, tag: c.tag, dueDate: c.dueDate, walk: c.walk });

    return {
        getState: () => state,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        refreshCap,
        capNow,
        add(input) {
            const v = validateRecord(input);
            if (!v.ok) return v;
            const stamp = clock().toISOString();
            const record = { id: nextRecordId(state.records), ...fields(v.record), createdAt: stamp, updatedAt: stamp };
            state = { ...state, records: [...state.records, record] };
            emit("add")
            return { ...v, record };
        },
        update(id, input) {
            const old = state.records.find((r) => r.id === id);
            if (!old) return { ok: false, errors: {id: "That record no longer exists." }, warnings: {} };
            const v = validateRecord(input);
            if (!v.ok) return v;
            const stamp = clock().toISOString();
            const record = { id, ...fields(v.record), createdAt: old.createdAt, updatedAt: stamp < old.createdAt ? old.createdAt : stamp };
            state = { ...state, records: state.records.map((r) => (r.id === id ? record : r)) };
            emit("update");
            return { ...v, record };
        },
        remove(id) {
            const record = state.records.find((r) => r.id === id);
            if (!record) return { ok: false };
            state = { ...state, records: state.records.filter((r) => r.id !== id) };
            emit("delete");
            return { ok: true, record };
         },
         replace(records) { state = { ...state, records }; emit("replace"); },
        setSettings(partial) {state = { ...state, settings: validateSettings({ ...state.settings, ...partial }) }; emit("settings"); },
        setView(partial) {state = { ...state, view: { ...state.view, ...partial } }; emit("view"); },
    };
}
