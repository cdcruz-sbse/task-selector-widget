# PRD — Task Selector Widget

_Source of truth for scope. Keep the changelog at the bottom updated._

## Problem

Admins want to surface a curated, filtered set of operational tasks (from the
Staffbase Tasks API) as a checklist inside a News post — with the flexibility to
choose *which* tasks show, by list, category, recurrence, and keyword — without
manually pasting task IDs.

## Decisions (locked)

| # | Decision | Choice |
|---|---|---|
| D1 | Task data source | **Staffbase Tasks API** (Backstage `tasks-api`, production). Real, not mocked in prod. |
| D2 | Selection model | **Search-and-select (hand-picked)** — admin uses filters + keyword to *search*, then multi-selects specific tasks. Config output = `selectedTaskIds[]` (same `installationId/taskId` format the Simple Tasks widget renders from). Filters are a discovery tool, not a live query. |
| D3 | Checklist behavior | **Interactive with write-back, always on** — check-off `PATCH`es task status. Completed tasks stay visible (struck through). No "show completed"/"allow check-off" toggles (D9). |
| D4 | Framework | Official `@staffbase/create-widget` (React/TS, widget-sdk v3, `defineBlock`). |
| D5 | Repo | Public, `cdcruz-sbse/task-selector-widget`. |
| D6 | Build order | Mock-first (zero-build prototype) → scaffold → live wiring → deploy. |

## Studio input parameters (the query)

Stored config:

- **API token** (Basic auth) — `ui:widget: password` (demo); production proxies it
- **Base URL** — default `https://app.staffbase.com/api`
- **Installation ID** — which Tasks installation to read (required path param)
- **selectedTaskIds[]** — the hand-picked tasks (the core output)
- **Sort by** — due / priority / title / order-added (employee checklist order)

Discovery controls (used to *build* the selection; not necessarily persisted):

- **Keyword search**, **Task list**, **Category / type**, **Recurrence** — filter the
  admin's search results so they can find and multi-select the right tasks.

> **Real-Studio note:** the static config form can't host this live picker. In
> production the picker runs on the widget's own rendered surface (edit mode) or a
> companion page; it produces `selectedTaskIds`, which the config stores.

## Golden path (demo story)

1. Admin drops the widget into a News post in the content designer.
2. Admin searches (e.g. keyword "freezer", or list = "Store Opening Checklist") and
   taps `+` to hand-pick the specific tasks that should appear; sets sort order.
3. Employee opens the News post → sees the checklist of exactly those selected tasks.
4. Employee checks a task off → status writes back to the Tasks API; the item stays
   in the list, struck through, so progress is visible.

## Acceptance criteria (prototype phase — DONE)

- [x] Admin searches via filters + keyword; results update live.
- [x] Admin multi-selects specific tasks (`+`/`✓`, add-all, clear); selection
      persists across different searches; selection is the config output.
- [x] Employee checklist shows exactly the selected tasks, sorted per config.
- [x] Checklist renders task model faithfully (category color, recurring/one-off
      badge, priority, due/overdue).
- [x] Check-off toggles status via the adapter; completed items stay struck through.
- [x] All data flows through one `dataSource` seam (mock now, live later).

## Confirmed from spec (2026-08-13)

- `/task/search` server params: `status`, `startDate*`, `updateDate*`, `limit`,
  `cursor`. Response `{ tasks, cursor, hasMore }`. **No** server filter for list,
  category, recurrence, or keyword → those run **client-side** (two-phase query).
- Task schema has `taskListId`, `branchId`, `status`, `priority`, dates — but **no
  `taskType`/`isRecurring`**; category & recurrence are `[type:…]`/`[recur:…]` markers.
- **D7 — Store/installation targeting:** the admin surfaces tasks by **content**
  (list/category/recurrence/keyword), **independent of which store a task belongs to**.
  So store/branch is **not a filter** — the only store-related value is `installationId`,
  the required API path param (single installation for the demo; extend to a list of
  installation IDs if tasks span installations). Dynamic per-viewer resolution stays Future.
- **D8 — Token:** confirmed via SDK. Deployed widget uses `widgetApi.getServiceToken(installationId)`
  (no pasted secret). Companion page / standalone demo uses a masked Basic token (runs
  outside Staffbase where getServiceToken isn't available). Both behind the adapter seam.
- **D9 — No show-completed / allow-toggle options:** the widget is always a check-off
  checklist; completed items remain visible (struck through).
- **D10 — Deployment model = Option B (companion picker → config → widget).** SDK
  confirms `BlockAttributes` are flat `string|number|boolean` and there is **no config
  write-back API**, so the live picker can't live in the Studio config form. Flow:
  (1) companion **Task Picker** page (outside Staffbase) → copy `installationId/taskId`
  string; (2) admin **pastes** into the widget's `selectedTasks` config field in the
  News editor; (3) the deployed widget renders the checklist from that config field.

## Open questions (for live wiring)

- Token access level for the POC installation (gates write-back / PATCH).
- Real `branchId` values + whether installation is per-store in your environment.
- Where the widget bundle is hosted (Vercel vs CDN) and the plugin registration.

## Future (parked — do not build yet)

- Hand-picked **companion picker** page (search/browse → selection token) for
  admins who want an explicit curated set instead of a query.
- Pinned/excluded task overrides on top of the query (hybrid model).
- Detail panel (comments, attachments, photo proof) — reuse from Simple Tasks widget.
- Rollup / manager view.

## Changelog

- **2026-08-13** — Repo created. Mock-first prototype built and validated in-browser
  (query-driven filtering + write-back working). Decisions D1–D6 locked.
- **2026-08-13** — `/task/search` spec + Task schema confirmed. Prototype updated:
  two-phase (server/client) query, `[type:]`/`[recur:]` marker parsing, store/branch
  filter, masked API-token field. Decisions D7 (store targeting) & D8 (token) added.
- **2026-08-13** — Pivot to **search-and-select** (D2 revised): filters + keyword are a
  discovery tool; admin multi-selects tasks → `selectedTaskIds[]`. Removed store filter
  and the show-completed / allow-check-off toggles (D9). Prototype rebuilt & validated.
- **2026-08-13** — Verified widget-sdk v3 (`BlockAttributes` flat primitives; no config
  write-back; `getServiceToken`/`getBranchInformation` exist). Locked **Option B / D10**
  (companion picker → config → widget) and D8 auth. Prototype rebuilt as a 3-surface
  flow (picker → paste → published widget); published view reads the config field, not
  the picker. Handoff, decoupling, and check-off write-back validated in-browser.
