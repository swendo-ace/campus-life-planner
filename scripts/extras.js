import { exportJSON, exportCSV, exportFileName, downloadText, parseRecordList, clearAllData } from "./storage.js";
import { $, say } from "./ui.js";

export function setupExtras(store) {
  const on = (id, type, fn) => $(id).addEventListener(type, fn);
  const records = () => store.getState().records;

  // Menu button on small screens
  on("nav-toggle", "click", (e) => {
    const open = e.target.getAttribute("aria-expanded") !== "true";
    e.target.setAttribute("aria-expanded", open);
    $("nav-list").classList.toggle("open", open);
  });

  // Export, import, clear
  on("export-json-btn", "click", () => {
    downloadText(exportFileName("json"), exportJSON(records()), "application/json");
    say("JSON file downloaded.");
  });
  on("export-csv-btn", "click", () => {
    downloadText(exportFileName("csv"), exportCSV(records()), "text/csv");
    say("CSV file downloaded.");
  });
  on("import-file", "change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const res = parseRecordList(await file.text());
    e.target.value = "";
    if (!res.ok) return say(`Import failed. ${res.problems[0]}`, true);
    store.replace(res.records);
    say(`Imported ${res.records.length} records.`);
  });
  on("clear-btn", "click", () => {
    if (!confirm("Delete all records and settings? This cannot be undone.")) return;
    clearAllData();
    store.replace([]);
    say("All data cleared.");
  });

  // Keyboard shortcuts
  const dialog = $("shortcuts-dialog");
  const list = document.createElement("ul");
  for (const text of ["Alt + N: add a new record", "Alt + S: search records", "Alt + T: toggle Stress Mode", "?: open this list"]) {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
  }
  dialog.querySelector("h2").after(list);
  const openKeys = () => dialog.open || dialog.showModal();
  on("shortcuts-btn", "click", openKeys);
  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.altKey && key === "n") { e.preventDefault(); $("f-title").focus(); }
    else if (e.altKey && key === "s") { e.preventDefault(); $("record-search").focus(); }
    else if (e.altKey && key === "t") { e.preventDefault(); $("stress-toggle").click(); }
    else if (e.key === "?" && !typing) openKeys();
  });

  // Unit calculator
  const calc = () => {
    const rate = Number($("s-rate").value) || 60;
    $("calc-result").textContent = Math.round((Number($("calc-minutes").value) / rate) * 100) / 100;
  };
  on("calc-minutes", "input", calc);
  on("s-rate", "input", calc);

  // Focus timer: counts down the length of the chosen task
  let left = 0;
  let tick = null;
  const show = () => ($("timer-display").textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`);
  const stop = () => { clearInterval(tick); tick = null; };
  const reset = () => { stop(); left = 0; show(); };
  const fillTasks = () => {
    const select = $("timer-task");
    const keep = select.value;
    select.replaceChildren(new Option("Choose a task", ""), ...records().map((r) => new Option(r.title, r.id)));
    select.value = keep;
  };
  on("timer-task", "change", reset);
  on("timer-pause", "click", stop);
  on("timer-reset", "click", reset);
  on("timer-start", "click", () => {
    if (tick) return;
    if (!left) {
      const task = records().find((r) => r.id === $("timer-task").value);
      if (!task) return say("Choose a task first.");
      left = Math.round(task.duration * 60);
    }
    show();
    tick = setInterval(() => {
      left -= 1;
      show();
      if (left <= 0) { stop(); say("Focus time is up."); }
    }, 1000);
  });
  fillTasks();
  store.subscribe(fillTasks);
}