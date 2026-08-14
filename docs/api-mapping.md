# Tasks API ↔ Adapter ↔ Config mapping

From the Backstage `tasks-api` (OAS 3.1, production). Base URL: `https://{domain}/api`
(e.g. `https://app.staffbase.com/api`). Auth: `Authorization: Basic {apiToken}`,
`credentials: "omit"` (matches the existing Simple Tasks widget).

## Endpoints we use

| Method | Path | Purpose |
|---|---|---|
| GET | `/tasks/{installationId}/lists` | All task lists for the installation |
| GET | `/tasks/{installationId}/task?listId=…` | Tasks in a list |
| GET | `/tasks/{installationId}/task/search` | **Search tasks by filters** |
| GET | `/tasks/{installationId}/task/my-tasks` | Tasks assigned to current user |
| GET | `/tasks/{installationId}/task/{taskId}` | Single task |
| PATCH | `/tasks/{installationId}/task/{taskId}` | Update (e.g. `{status}`) |
| GET | `/tasks/{installationId}/groups` | Installation groups |

Other available (not used yet): create/delete/archive task, list CRUD, comments,
comment reactions, task attachments.

## Adapter seam (`dataSource`)

The prototype's `mockDataSource` and the future `liveDataSource` implement the same
interface. Components never call `fetch` directly.

| Method | Live implementation |
|---|---|
| `getLists()` | `GET /tasks/{id}/lists` → `TaskList[]` |
| `getCategories()` | derive from task `taskType`s, or a categories source if one exists |
| `searchTasks(query)` | `GET /tasks/{id}/task/search` with filter params (+ `?listId=`) |
| `completeTask(taskId, done)` | `PATCH /tasks/{id}/task/{taskId}` `{ status: done ? "CLOSED" : "OPEN" }` |
| `getUserContext()` | `widgetApi.getUserInformation()` + `GET /users/{id}` |

## Task model (fields we read)

Mirrors the existing Simple Tasks widget:

| Field | Notes |
|---|---|
| `id`, `title`, `description` | `title`/`description` may carry `[type:…]` / `[recur:…]` markers |
| `status` | `OPEN` / `CLOSED` / `DONE` (`CLOSED`/`DONE` = done) |
| `priority` | `Priority_1` (High) / `Priority_2` (Med) / `Priority_3` (Low) |
| `taskType` | category (storetask, compliance, safety, training, …) |
| `isRecurring` | from `[recur:…]` or `[type: recur-template]` |
| `dueDate`, `createDate` | ISO dates |
| `groupIds`, `assigneeIds`, `attachmentIds` | targeting / attachments |

## Schemas referenced by the API

`TaskPayload`, `Task`, `TaskSearchResult`, `TaskListPayload`, `TaskList`,
`GroupDisplay`, `InstallationConfiguration`, `CommonLocalization`,
`TaskCommentListResponse`, `TaskCommentDto`, `ReactionCount`, `ReactionInternal`,
`PaginationResponse`.

> **TODO:** pull the OpenAPI `Definition` (raw) for the exact query params of
> `/task/search` — needed to map the category / recurrence / keyword filters to real
> parameter names before live wiring.
