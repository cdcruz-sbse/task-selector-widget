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
| D2 | Selection model | **Query-driven** — admin sets filters; widget resolves live via `/task/search`. |
| D3 | Checklist behavior | **Interactive with write-back** — check-off `PATCH`es task status. |
| D4 | Framework | Official `@staffbase/create-widget` (React/TS, widget-sdk v3, `defineBlock`). |
| D5 | Repo | Public, `cdcruz-sbse/task-selector-widget`. |
| D6 | Build order | Mock-first (zero-build prototype) → scaffold → live wiring → deploy. |

## Studio input parameters (the query)

These become the widget's `configurationSchema` / `uiSchema` fields:

- **API token** (Basic auth) — `ui:widget: password`
- **Base URL** — default `https://app.staffbase.com/api`
- **Installation ID** (store) — which Tasks installation to read
- **Task list** — filter to one list (or all)
- **Category / type** — filter by task type
- **Recurrence** — all / one-off / recurring
- **Keyword search** — free-text filter
- **Max items**, **Sort by**, **Show completed**, **Allow check-off (write-back)**

## Golden path (demo story)

1. Admin drops the widget into a News post in the content designer.
2. Admin configures: list = "Store Opening Checklist", recurrence = recurring,
   sort = due date, allow check-off = on.
3. Employee opens the News post → sees the live checklist of matching tasks.
4. Employee checks a task off → status writes back to the Tasks API → task drops
   from the "open" view.

## Acceptance criteria (prototype phase — DONE)

- [x] Admin filters (list/category/recurrence/keyword/sort/max) re-query live.
- [x] Checklist renders task model faithfully (category color, recurring badge,
      priority, due/overdue).
- [x] Check-off toggles status via the adapter and updates the view.
- [x] Show-completed and read-only (allow-toggle off) modes behave.
- [x] All data flows through one `dataSource` seam (mock now, live later).

## Confirmed from spec (2026-08-13)

- `/task/search` server params: `status`, `startDate*`, `updateDate*`, `limit`,
  `cursor`. Response `{ tasks, cursor, hasMore }`. **No** server filter for list,
  category, recurrence, or keyword → those run **client-side** (two-phase query).
- Task schema has `taskListId`, `branchId`, `status`, `priority`, dates — but **no
  `taskType`/`isRecurring`**; category & recurrence are `[type:…]`/`[recur:…]` markers.
- **D7 — Store/installation targeting:** explicit config for the demo (Installation
  ID + optional store/branch filter); dynamic per-viewer resolution parked in Future.
- **D8 — Token:** config field for demo (masked); production = serverless proxy + SSO JWT.

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
