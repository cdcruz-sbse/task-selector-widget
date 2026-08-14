# Task Selector Widget

A Staffbase **custom widget** that surfaces tasks from the Staffbase **Tasks API**
(Backstage `tasks-api` plugin module) as an interactive **checklist inside News
content**. An admin configures *which* tasks appear using filter parameters in the
Studio content designer — no hand-pasting of task IDs.

Built following the [Staffbase Custom Widget framework](https://developers.staffbase.com/frameworks/customwidget-development/)
(`@staffbase/create-widget`, widget-sdk v3, `window.defineBlock`).

---

## What it does

- **Search-and-select.** The admin uses filters + keyword search (task list,
  category/type, one-off vs recurring) to *browse* the Tasks API, then **hand-picks**
  the specific tasks (multi-select) that should appear. The config output is a set of
  `selectedTaskIds` — the same `installationId/taskId` format the Simple Tasks widget
  renders from.
- **Interactive checklist.** Employees see exactly the selected tasks and check them
  off; completion writes back to the Tasks API (`PATCH .../task/{id}`). Completed items
  stay visible, struck through.

## Picker vs. the Studio config form

Staffbase's Studio config panel is a static JSON-Schema form and **cannot host a
live, API-driven task picker** inside itself. In production the picker runs on the
widget's own rendered surface (edit mode) or a companion page, and produces the
`selectedTaskIds` the config stores. The prototype demonstrates that picker inline.

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
| `getCategories()` | derived from `[type:…]` markers |
| `searchTasks(query)` | `GET /tasks/{installationId}/task/search` + client-side filters (picker) |
| `getTasksByIds(ids)` | `GET /tasks/{installationId}/task/{taskId}` per selected id (employee view) |
| `completeTask(id, done)` | `PATCH /tasks/{installationId}/task/{taskId}` `{status}` |

## Repo layout

```
prototype/index.html   # mock-first interactive prototype (zero build)
docs/PRD.md            # scope, decisions, golden path, future ideas
docs/api-mapping.md    # Tasks API endpoints ↔ adapter methods ↔ config
```
