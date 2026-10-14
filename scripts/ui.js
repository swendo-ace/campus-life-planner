import { fmt, capText } from "./state.js";
import { segments } from "./search.js";

export const $ = (id) => document.getElementById(id);
const F = ["title", "tag", "dueDate", "duration", "walk"];
const L = {title: "Title", tag: "Tag", dueDate: "Due Date", duration: "Duration", walk: "Walk time" };
const set = (id, v) => ($(id).textContent = v);
const el = (tag, text, parent) => {
    const n = document.createElement(tag);
    n.textContent = text;
    parent?.append(n);
    return n;
};

export function say(msg, urgent) {
    const on = $(urgent ? "alert-region" : "status-region");
    set("alert-region", "");
    set("status-region", "");
    setTimeout(() => (on.textContent = msg), 50);
}   

const mark = (p, text, re) =>
    segments(text, re).forEach((s) => (s.match ? (el("mark", s.text, p).className = "search-highlight") : p.append(s.text)));

export function renderRecords(records, re, s) {
    $("records-body").replaceChildren(
        ...records.map((r) => {
            const row = $("record-row-template").content.firstElementChild.cloneNode(true);
            const [title, due, dur, walk, tag, acts] = row.children;
            mark(title, r.title, re);
            mark(tag, r.tag, re);
            due.textContent = r.dueDate;
            dur.textContent = fmt(r.duration, s);
            walk.textContent = r.walk ? `${r.walk} min` : "None";
            for (const b of acts.children) {
                b.dataset.id = r.id;
                b.querySelector("span").textContent = ` ${r.title}`;
            }
            return row;
        })
    );
    $("records-empty").hidden = records.length > 0;
}

export function renderTags(tags, selected) {
    const select = $("record-filter");
    select.replaceChildren(new Option("All tags", ""), ...tags.map((t) => new Option(t, t)));
    select.value = selected;
}

export function renderStats(st, s) {
    set("stat-open", st.open);
    set("stat-minutes", fmt(st.minutes, s));
    set("stat-urgent", st.urgent);
    $("stat-urgent").previousElementSibling.textContent = `Due in ${s.urgentHours} hours`;
    $("cap-progress").value = st.cap.percent;
    set("cap-progress", `${st.cap.percent}%`);
    set("cap-text", capText(st.cap, s));
}

// Polite under the cap, assertive over it; the other region is emptied
export function announceCap(a) {
    if (!a) return;
    const loud = a.urgency === "assertive";
    set("cap-status", loud ? '' : a.message);
    set("cap-alert", loud ? a.message : "");
}

// Burn-down and trend as real tables
export function renderWeek(rows, s) {
    const fill =(id, cells) =>
        $(id).replaceChildren(
            ...rows.map((r) => {
            const tr = document.createElement("tr");
            cells(r).forEach((t, i) => {
                const c = el(i ? "td" : "th", t, tr);
                if(!i) c.scope = "row";
            });
            return tr;
            })
        );
    fill("burndown-data", (r) => [r.label, fmt(r.planned, s), fmt(r.remaining, s)]);
    fill("trend-data", (r) => [r.label, fmt(r.planned, s)]);
    const top = rows.reduce((a, b) => (b.planned > a.planned ? b : a));
    const none = "No minutes planned this week.";
    set("burndown-summary", top.planned ? `${fmt(rows[0].remaining, s)} planned this week, ${fmt(rows[6].remaining, s)} still ahead on Sunday.` : none);
    set("trend-summary", top.planned ? `Busiest day: ${top.label} with ${fmt(top.planned, s)}.` : none);
}

export function fieldMessage(name, msg, warning = "") {
    set(`f-${name}-error`, msg);
    $(`f-${name}`).setAttribute("aria-invalid", msg ? "true" : "false");
    if (name === "title") set("f-title-warning", warning);
}

export function clearErrors() {
    F.forEach((f) => fieldMessage(f, ""));
    $("error-summary").replaceChildren();
}

// Inline messages plus a summary of links  to each bad field: focus goes to the summary
export function showErrors(errors) {
    F.forEach((f) => fieldMessage(f, errors[f] ?? ""));
    const ul = document.createElement("ul");
    for (const [f, m] of Object.entries(errors)) {
        el("a", `${L[f] ?? "Record"}: ${m}`, el("li", "", ul)).href = `#f-${f}`;
    }
    $("error-summary").replaceChildren(el("h3", `Fix ${Object.keys(errors).length} problem(s) to save`), ul);
    $("error-summary").focus();
}

// No Argument resets the form to 'Add a record"
export function fillForm(r = {}) {
    $("record-id").value = r.id ?? "";
    F.forEach((f) => ($(`f-${f}`).value = r[f] ?? (f === "walk" ? "0" : "")));
    set("record-form-heading", r.id ? "Edit record" : "Add a record");
    clearErrors();
}

export function fillSettings(s) {
    $("s-cap").value = s.capMinutes || "";
    $("s-rate").value = s.rate;
    $("s-urgent-hours").value = s.urgentHours;
    $("s-buffer").value = s.buffer;
    $("stress-toggle").checked = s.stressMode;
    for (const n of ["units", "theme"]) document.querySelector(`input[name="${n}"][value="${s[n]}"]`).checked = true;
}