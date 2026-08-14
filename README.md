# Task Selector Widget

A Staffbase **custom widget** that surfaces tasks from the Staffbase **Tasks API**
(Backstage `tasks-api` plugin module) as an interactive **checklist inside News
content**. An admin configures *which* tasks appear using filter parameters in the
Studio content designer — no hand-pasting of task IDs.

Built following the [Staffbase Custom Widget framework](https://developers.staffbase.com/frameworks/customwidget-development/)
(`@staffbase/create-widget`, widget-sdk v3, `window.defineBlock`).

---

## What it does

- **Query-driven selection.** The admin sets filters in Studio — task list,
  category/type, one-off vs recurring, keyword search, sort, max items. The widget
  resolves them against the Tasks API **at render time**, so the checklist stays
  current as tasks are added, completed, or recur.
- **Interactive checklist.** Employees see the matching tasks as a checklist and can
  check them off; completion writes back to the Tasks API (`PATCH .../task/{id}`).
- **Configurable behavior.** Show/hide completed, read-only vs check-off, sort order.

## Why query-driven (not a visual picker)

Staffbase's Studio config panel is a static JSON-Schema form and **cannot host a
live, API-driven task picker** inside itself. So instead of hand-picking task IDs,
the admin defines a *query*; the widget runs it live. This auto-updates and needs no
second surface. (A hand-picked "companion picker" is parked in [docs/PRD.md](docs/PRD.md)
under Future.)

## Current status

| Phase | State |
|---|---|
| Mock-first interactive prototype | ✅ Done — see [`prototype/index.html`](prototype/index.html) |
| Real `@staffbase/create-widget` scaffold | ⏳ Next (needs Node 20+) |
| Live Tasks API wiring (behind the adapter seam) | ⏳ After scaffold (needs API token + installation) |
| Studio config schema + deploy (Vercel/CDN) | ⏳ |

## Prototype

`prototype/index.html` is a **zero-build** standalone file — open it in any browser.
It mocks the Tasks API so you can play with the query-driven behavior before the
real bundle exists. Every mock method is annotated with the real endpoint it maps to.

```
open prototype/index.html
```

## Architecture: the adapter seam

All data flows through one `dataSource` interface so mock → live is a swap, not a
rewrite. See [docs/api-mapping.md](docs/api-mapping.md) for the full mapping.

| `dataSource` method | Live endpoint |
|---|---|
| `getLists()` | `GET /tasks/{installationId}/lists` |
| `getCategories()` | derived from task types (or categories endpoint) |
| `searchTasks(query)` | `GET /tasks/{installationId}/task/search` (+ `?listId=`) |
| `completeTask(id, done)` | `PATCH /tasks/{installationId}/task/{taskId}` `{status}` |

## Repo layout

```
prototype/index.html   # mock-first interactive prototype (zero build)
docs/PRD.md            # scope, decisions, golden path, future ideas
docs/api-mapping.md    # Tasks API endpoints ↔ adapter methods ↔ config
```
