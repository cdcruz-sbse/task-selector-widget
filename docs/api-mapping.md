# Tasks API ↔ Adapter ↔ Config mapping

From the Backstage `tasks-api` (OAS 3.1, production). Base URL: `https://{domain}/api`
(e.g. `https://app.staffbase.com/api`). Auth: `Authorization: Basic {apiToken}`,
`credentials: "omit"` (matches the existing Simple Tasks widget).

## Endpoints we use

| Method | Path | Purpose |
|---|---|---|
| GET | `/tasks/{installationId}/lists` | All task lists for the installation |
| GET | `/tasks/{installationId}/task?listId=…` | Tasks in a list |
| GET | `/tasks/{installationId}/task/search` | **Search** — see server params below |
| GET | `/tasks/{installationId}/task/my-tasks` | Tasks assigned to current user |
| GET | `/tasks/{installationId}/task/{taskId}` | Single task |
| PATCH | `/tasks/{installationId}/task/{taskId}` | Update (e.g. `{status}`) |
| GET | `/tasks/{installationId}/groups` | Installation groups |

Other available (not used yet): create/delete/archive task, list CRUD, comments,
comment reactions, task attachments.

## `/task/search` — actual filtering surface (confirmed from spec)

The server only filters by these. **Everything else is client-side.**

| Param | Type | Notes |
|---|---|---|
| `installationId` | path, required | objectId |
| `status` | array<string> | `OPEN` / `CLOSED`, default `["OPEN"]` |
| `startDateFrom` / `startDateTo` | date-time | task start-date range |
| `updateDateFrom` / `updateDateTo` | date-time | update-date range |
| `limit` | integer | default 20 → maps to our "Max items" |
| `cursor` | string | pagination; response returns `cursor` + `hasMore` |

**Response:** `{ tasks: Task[], cursor: string, hasMore: boolean }`.

### Two-phase query (how the widget filters)

- **Server phase:** `status`, `limit`, date ranges, paginate via `cursor` while `hasMore`.
- **Client phase (over the returned tasks):** task list (`taskListId`), store (`branchId`),
  category (parsed from `[type:…]`), recurrence (parsed from `[recur:…]`), keyword
  (title + description). There is **no** server param for any of these.

> Category and recurrence are **not fields** on the task — they're markers in
> title/description, parsed client-side (same as the Simple Tasks widget).

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

## Task model (confirmed schema)

From the real search response `Task` object:

| Field | Notes |
|---|---|
| `id`, `installationId`, `branchId` | `branchId` = store/branch |
| `taskListId` | which list the task belongs to |
| `title`, `description` | carry `[type:…]` / `[recur:…]` markers (parsed client-side) |
| `status` | `OPEN` / `CLOSED` |
| `priority` | `Priority_1` (High) / `Priority_2` (Med) / `Priority_3` (Low) |
| `dueDate`, `startDate`, `createdAt`, `updatedAt` | ISO date-time |
| `assigneeIds`, `groupIds`, `attachmentIds` | targeting / attachments |
| `isArchived`, `version`, `creatorId`, `creatorType` | metadata |

> **No `taskType` / `isRecurring` fields** — category & recurrence are derived from
> `[type:…]` / `[recur:…]` markers in title/description.

## Auth & security

- Prototype/demo: Basic token as a config field (masked first-5 in the prototype;
  standard `password` field in real Studio). **The token is visible to anyone who
  inspects the widget** — demo-only.
- Production-secure: a **serverless proxy** (Vercel) holds the token and verifies the
  Staffbase SSO JWT; the browser never sees the token.

## Installation ↔ store/branch

A task carries both `installationId` (path param on every call) and `branchId`
(store). Two ways to target a store:
1. **Explicit config (recommended for demo):** admin sets Installation ID (+ optional
   store/branch filter). Simple, deterministic.
2. **Dynamic per-viewer (future):** resolve the viewer's store from their profile so
   one widget shows each employee their own store's tasks. Needs a user→store→installation
   mapping — parked in the PRD.

## Schemas referenced by the API

`TaskPayload`, `Task`, `TaskSearchResult`, `TaskListPayload`, `TaskList`,
`GroupDisplay`, `InstallationConfiguration`, `CommonLocalization`,
`TaskCommentListResponse`, `TaskCommentDto`, `ReactionCount`, `ReactionInternal`,
`PaginationResponse`.
