import { createStore, stats, weekBreakdown, nextRush, rushText, tagsOf, sortRecords, filterByTag, overdueRecords, urgentRecords } from "./state.js";
import {bootRecords, loadSettings, saveRecords, saveSettings } from "./storage.js";
import { searchRecords } from "./search.js";
import { validateTitle, validateTag, validateDate, validateDuration, validateWalk } from "./validators.js";
import * as ui from "./ui.js";
import { $ } from "./ui.js";

const boot = await bootRecords();
const store = createStore({ records: boot.records, settings: loadSettings() });
const on = (id, type, fn) => $(id).addEventListener(type, fn);
let deleting = null;

function render() {
    const { records, settings: s, view } = store.getState();
    const now = new Date();
    let list = sortRecords(filterByTag(records, view.tagFilter), view.sortKey);
    if (s.stressMode) {
        const keep = new Set([...overdueRecords(records, now), ...urgentRecords(records, s, now)].map((r) => r.id));
        list = list.filter((r) => keep.has(r.id));
    }
    const found = searchRecords(list, view.query, view.ignoreCase);
    document.documentElement.dataset.theme = s.theme;
    ui.renderRecords(found.records, found.re, s);
    ui.renderTags(tagsOf(records), view.tagFilter);
    $("search-error").textContent = found.error;
    ui.renderStats(stats(records, s, now), s);
    ui.renderWeek(weekBreakdown(records, now), s);
    $("rush-text").textContent = rushText(nextRush(records, s, now));
    $("stress-view").textContent = s.stressMode ? `Stress Mode: showing ${list.length} tasks that are overdue or due within ${s.urgentHours} hours.` : "";
}

// Every change: redraw, save, speak any cap announcements
store.subscribe((state, change) => {
    render();
    if (change.type !== "view") {
        const saved = saveRecords(state.records);
        saveSettings(state.settings);
        if (!saved.ok) ui.say(saved.message, true);
    }
    ui.announceCap(change.cap?.announcement);
});

// search, sort, filter
on("records-controls", "submit", (e) => e.preventDefault());
on("record-search", "input", (e) => {
    store.setView({ query: e.target.value });
    ui.say(`${$("records-body").children.length} records shown`);
});
on("search-ignore-case", "change", (e) => store.setView({ ignoreCase: e.target.checked }));
for (const [id, key] of [["record-sort", "sortKey"], ["record-filter", "tagFilter"]]) {
    on (id, "change", (e) => store.setView({ [key]: e.target.value }));
}

// Form: live feedback while typing, full check on submit
const rules = { title: validateTitle, tag: validateTag, dueDate: validateDate, duration: validateDuration, walk: validateWalk };
on("record-form", "input", ({ target: t}) => {
    const r = rules[t.name]?.(t.value);
    if (r) ui.fieldMessage(t.name, r.message, r.warnings[0] ?? "");
});
on("record-form", "submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const res = data.id ? store.update(data.id, data) : store.add(data);
    if (!res.ok) return ui.showErrors(res.errors);
    const warn = res.warnings.title?.[0];
    ui.fillForm();
    ui.say(`Record ${data.id ? "updated" : "saved"}: ${res.record.title}.${warn ? " " + warn : ""}`);
    $("records-heading").focus();
});
on("cancel-edit", "click", () => {
    ui.fillForm();
    $("f-title").focus();
});

// Edit and delete buttons in the table
on("records-body", "click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (!b) return;
    const rec = store.getState().records.find((r) => r.id === b.dataset.id);
    if (b.classList.contains("edit-btn")) {
        ui.fillForm(rec);
        $("record-form-heading").focus();
        return;
    }
    deleting = rec;
    $("confirm-text").textContent = `Delete "${rec.title}"? This cannot be undone.`;
    $("confirm-dialog").returnValue = "";
    $("confirm-dialog").showModal();
});
on("confirm-dialog", "close", (e) => {
    if (e.target.returnValue === "confirm" && deleting) {
        store.remove(deleting.id);
        ui.say(`Deleted ${deleting.title}.`);
        $("records-heading").focus();
    }
    deleting = null;
});

// Stress Mode and setting 
on("stress-toggle", "change", (e) => {
    store.setSettings({ stressMode: e.target.checked });
    ui.say(`Stress Mode ${e.target.checked ? "on" : "off"}.`);
});
on("settings-form", "change", ({ target: { name, value } }) => {
    const key = name ==="cap" ? "capMinutes" : name;
    if (["capMinutes", "units", "rate", "urgentHours", "buffer", "theme"].includes(key)) store.setSettings({ [key]: value });
});

// Start-up
ui.fillSettings(store.getState().settings);
ui.fillForm();
render();
ui.announceCap(store.refreshCap().announcement);
if (boot.problems.length) ui.say(boot.problems[0], true);
setInterval(render, 60000);