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

## Deployment model (Option B — companion picker → config → widget)

The Studio config form is a static JSON-Schema form (RJSF); the widget SDK confirms
config values are flat `string | number | boolean` and there is **no API for the
widget to write its own config**. So the live picker cannot live in the config form,
and the selection must flow *through* the config field. The chosen shape:

1. **Task Picker — a companion page** (hosted alongside the widget, runs outside
   Staffbase). Admin searches + multi-selects tasks, then **copies** the resulting
   `installationId/taskId` string.
2. **Widget config — Staffbase News editor.** Admin **pastes** that string into the
   widget's `selectedTasks` config field (a plain string attribute), plus sort/title.
3. **Published widget — employee view.** Renders the checklist from the **config
   field** (not the picker), with check-off write-back.

The prototype shows all three surfaces side by side and honestly wires the published
widget to the config field, so the real data path is visible.

## Auth

- **Companion page / demo:** Basic API token (masked) — it runs outside Staffbase.
- **Deployed widget:** `widgetApi.getServiceToken(installationId)` (SDK-provided,
  no pasted secret). Both sit behind the adapter seam.

## Current status

| Phase | State |
|---|---|
| Mock-first flow prototype (picker → config → widget) | ✅ Done — see [`prototype/index.html`](prototype/index.html) |
| Real `@staffbase/create-widget` scaffold (employee widget) | ⏳ Next (needs Node 20+) |
| Companion picker page | ⏳ |
| Live Tasks API wiring (`getServiceToken` / Basic behind adapter) | ⏳ (needs installation + token) |
| Deploy (Vercel/CDN) + plugin registration | ⏳ |

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
