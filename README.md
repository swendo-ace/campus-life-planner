# Campus Life Planner

This is a small planner for students. It tracks tasks and deadlines, the minutes a week will take, and how long you need to walk between buildings, so a busy week stays manageable. Built with plain HTML, CSS and JavaScript (ES modules). No frameworks, no build step.

**Live site:** https://swendo-ace.github.io/campus-life-planner/
**Repository:** https://github.com/swendo-ace/campus-life-planner
**Developer:** Sarah Esther Wendo (swendo-ace), s.wendo@alustudent.com

## Theme

Campus Life Planner is built around three ideas: plan the week, protect your time, and stay aware of the walk between places.

## Features

- Add, edit and delete tasks (title, due date, duration, walk time, tag), with live validation
- Dashboard: open tasks, minutes planned, tasks due in 48 hours, weekly trend, burn-down text
- Weekly duration cap with a progress bar and screen reader announcements
- Stress Mode: shows only overdue tasks and tasks due soon
- Walk-Time Rush Indicator: for a title containing a time such as `09:15`, shows when to leave (due time minus walk time minus buffer)
- Live regex search with `@tag:` filter and a case toggle, with matches highlighted
- Sort by due date, title or duration, and filter by tag
- Focus timer that counts down the chosen task's duration
- Minutes to hours calculator and unit switch (minutes or hours)
- Light, dark or match-my-device theme
- Export to JSON or CSV, and import from JSON
- Data saved in the browser (localStorage). Nothing leaves your device.

## Regex catalog

All patterns live in `scripts/validators.js` (`PATTERNS`) and `scripts/search.js`. None uses the `g` or `y` flag, because those make `.test()` remember state between calls.

| Rule | Pattern | What it does |
| --- | --- | --- |
| Title | `/^\S(?:.*\S)?$/` | No spaces at the start or end |
| Title has substance | `/^(?=.*[\p{L}\p{N}])/u` | Lookahead: needs a letter or digit, so `!!!` fails |
| Duration | `/^(0\|[1-9]\d*)(\.\d{1,2})?$/` | Number with up to 2 decimals, no leading zeros |
| Due date | `/^(\d{4})-(0[1-9]\|1[0-2])-(0[1-9]\|[12]\d\|3[01])$/` | Shape of YYYY-MM-DD, then a calendar check rejects 2026-02-30 |
| Tag | `/^[A-Za-z]+(?:[ -][A-Za-z]+)*$/` | Letters, with single spaces or hyphens between words |
| Walk time | `/^(0\|[1-9]\d{0,2})$/` | Whole minutes, 0 to 120 |
| Duplicate word (advanced) | `/\b(\w+)\s+\1\b/i` | Back-reference. Warns on "the the", never blocks saving |
| Time token | `/\b([01]\d\|2[0-3]):([0-5]\d)\b/` | Finds a valid HH:MM in a title for the rush indicator |
| Tag query | `/@tag:(?:"([^"]+)"\|(\S+))/i` | Reads `@tag:Academics` or `@tag:"Lab work"` from the search box |

The search box compiles what you type with `new RegExp` inside a `try/catch`. A bad pattern shows a message and leaves the list unfiltered. Patterns over 80 characters, and nested repeats like `(a+)+`, are refused so the page cannot freeze.

### Search examples

- `study` finds titles or tags containing "study"
- `^Prepare` finds titles starting with "Prepare"
- `\d{2}:\d{2}` finds titles that contain a time
- `@tag:Academics` shows only the Academics tag
- `@tag:Health gym` combines a tag with a pattern

## Keyboard map

| Keys | Action |
| --- | --- |
| Tab / Shift+Tab | Move through controls. A "skip to content" link comes first |
| Alt+N | Jump to the Title field to add a record |
| Alt+S | Jump to the search box |
| Alt+T | Toggle Stress Mode |
| ? | Open the keyboard shortcuts list |
| Esc | Close any open dialog |
| Enter / Space | Activate buttons, including Edit and Delete |

## Accessibility notes

- Semantic landmarks (`header`, `nav`, `main`, `section`, `footer`) and one `h1`
- Every form field has a visible label and an error message linked with `aria-describedby`. Invalid fields get `aria-invalid`
- On a failed submit, an error summary appears and receives focus
- Weekly cap: going over speaks **assertively** (`aria-live="assertive"`). Coming back under or clearing the cap speaks **politely** (`aria-live="polite"`). Nothing is announced when the level has not changed
- Status messages (saved, deleted, records shown) go to a polite live region
- Delete uses a native `<dialog>` that traps focus and closes with Esc
- Search highlights are built with `<mark>` and `textContent`, never `innerHTML`
- Visible focus outlines, enough colour contrast in light and dark, and a `prefers-reduced-motion` rule
- Fully usable by keyboard alone

## Responsive layout

Mobile first, with breakpoints at 360px, 768px and 1024px.

- Under 768px: the menu collapses behind a toggle button and the table becomes stacked cards
- 768px and up: a real table, with the dashboard in two columns
- 1024px and up: the dashboard in three columns

## Data model

Each record: `id` (`plan_0001` style), `title`, `dueDate` (YYYY-MM-DD), `duration` (minutes), `walk` (minutes), `tag`, `createdAt`, `updatedAt` (ISO timestamps).

`seed.json` holds 16 starter records, used on first load, including overdue tasks and tricky titles (HTML characters, quotes, duplicate words, times). Import is strict and all-or-nothing: one bad record rejects the file and the message names the problem. CSV export guards against spreadsheet formula injection and adds a BOM so Excel reads accents correctly.

## Project structure

```
index.html
seed.json
tests.html
styles/main.css
scripts/app.js         start-up and event wiring
scripts/state.js       store, stats, weekly cap, rush indicator
scripts/storage.js     localStorage, import and export
scripts/validators.js  every regex rule
scripts/search.js      live regex search
scripts/ui.js          drawing the page
scripts/extras.js      menu, export buttons, shortcuts, calculator, timer
```

## Running it locally

The app uses ES modules and `fetch`, which browsers block on `file://`. Serve it over http:

```
python -m http.server 5500
```

Then open http://localhost:5500. After editing CSS or JS, hard refresh with Ctrl+Shift+R.

## Tests

Open `tests.html` through the same local server. It runs the validators, regex rules, storage, import and export, state logic and search, and shows each check as pass or fail. All checks should be green.

## Deploying to GitHub Pages

1. Push to the `main` branch.
2. On GitHub: Settings, Pages, Source "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Wait a minute. The site appears at https://swendo-ace.github.io/campus-life-planner/.

## AI use statement

I used Claude (an AI assistant) for planning, explaining concepts, reviewing and debugging. Much of the code was written by me, and AI helped fix the typing errors and bugs I found. I tested the result in the browser and on the live site. I am including this note so my use of AI is clear and honest.
