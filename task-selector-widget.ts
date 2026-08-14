// ============================================================================
// Task Selector Widget — deployable Staffbase custom widget
// ----------------------------------------------------------------------------
// Renders a checklist of specific tasks (chosen by the admin) inside a News post.
// The admin pastes task references — "installationId/taskId", one per line — into
// the "Selected tasks" config field (e.g. copied from the Task ID Finder widget).
// End users see the checklist and can check tasks off (writes back via PATCH).
//
// Framework: @staffbase/widget-sdk v3 — window.defineBlock, JSON-Schema config.
// Auth: Basic API token in config for now (deploy/demo). The deployed widget can
// later switch to widgetApi.getServiceToken(installationId) — no pasted secret.
// ============================================================================

import {
  BlockFactory,
  BlockDefinition,
  ExternalBlockDefinition,
  BaseBlock,
} from "@staffbase/widget-sdk";
import { JSONSchema7 } from "json-schema";
import { UiSchema } from "@rjsf/utils";

// ── Defaults ────────────────────────────────────────────────────────────────
const DEFAULT_BASE_URL = "https://app.staffbase.com/api";
const DEFAULT_PRIMARY = "#da2e32";

// ── Config schema (the Studio input parameters) ──────────────────────────────
const configurationSchema: JSONSchema7 = {
  properties: {
    apitoken:     { type: "string",  title: "API Token", default: "" },
    baseurl:      { type: "string",  title: "Base URL", default: DEFAULT_BASE_URL },
    tasklist:     { type: "string",  title: "Selected tasks (installationId/taskId, one per line)", default: "" },
    title:        { type: "string",  title: "Checklist Title", default: "Your checklist" },
    sortby:       { type: "string",  title: "Sort By", default: "picked",
                    enum: ["picked", "due", "priority", "title"] },
    primarycolor: { type: "string",  title: "Primary Color", default: DEFAULT_PRIMARY },
    backgroundcolor: { type: "string", title: "Background Color", default: "" },
    limitheight:  { type: "boolean", title: "Limit Height", default: false },
  },
  dependencies: {
    limitheight: {
      oneOf: [
        { properties: { limitheight: { const: false } } },
        { properties: { limitheight: { const: true }, maxheight: { type: "string", title: "Max Height (px)", default: "600" } } },
      ],
    },
  },
};

const uiSchema: UiSchema = {
  apitoken:  { "ui:widget": "password", "ui:help": "Staffbase Basic auth token (for the demo). Production can use getServiceToken()." },
  baseurl:   { "ui:help": "Staffbase API base URL, e.g. https://app.staffbase.com/api" },
  tasklist:  { "ui:widget": "textarea", "ui:help": "One task per line as installationId/taskId — copy these from the Task ID Finder widget." },
  sortby:    { "ui:help": "Order tasks by: order added, due date, priority, or title." },
  primarycolor: { "ui:widget": "color" },
  backgroundcolor: { "ui:widget": "color", "ui:help": "Leave blank for transparent." },
  maxheight: { "ui:help": "Maximum height in pixels before the list scrolls." },
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface TaskRef { installId: string; taskId: string; }
interface Task {
  id: string; installId: string; title: string; description: string;
  status: string; dueDate: string | null; priority: string;
  taskType: string | null; isRecurring: boolean; ok: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const esc = (s: string) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isDone = (s: string) => s === "DONE" || s === "done" || s === "CLOSED";

const TYPE_RE = /\[type:\s*([^\]]+)\]/i;
const RECUR_RE = /\[recur:\s*[^\]]*\]/i;
const parseType = (t: string) => { const m = TYPE_RE.exec(t || ""); return m ? m[1].trim().toLowerCase() : null; };
const stripMarkers = (t: string) => (t || "").replace(/\[[a-zA-Z]+:[^\]]*\]/g, "").replace(/\s{2,}/g, " ").trim();

const TYPE_COLORS: Record<string, string> = {
  storetask: "#da2e32", compliance: "#8B4513", maintenance: "#2E7D4A", training: "#4A90A4",
  safety: "#D97706", inventory: "#0369A1", merchandising: "#7C3AED", audit: "#7C3AED",
};
function typeColor(type: string): string {
  const k = type.toLowerCase();
  if (TYPE_COLORS[k]) return TYPE_COLORS[k];
  let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) & 0xffffff;
  return `hsl(${((h >> 16) & 0xff) % 360},55%,40%)`;
}
function hexToRgb(hex: string): string {
  const h = (hex.replace("#", "") + "000000").slice(0, 6);
  return `${parseInt(h.slice(0, 2), 16) || 0},${parseInt(h.slice(2, 4), 16) || 0},${parseInt(h.slice(4, 6), 16) || 0}`;
}
function contrastText(hex: string): string {
  const h = (hex.replace("#", "") + "000000").slice(0, 6);
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.45 ? "#1a1a1a" : "#ffffff";
}
function fmtDue(iso: string | null): { text: string; overdue: boolean } {
  if (!iso) return { text: "", overdue: false };
  const part = iso.split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return { text: "", overdue: false };
  const [y, m, d] = part.split("-").map(Number);
  const date = new Date(y, m - 1, d); if (isNaN(date.getTime())) return { text: "", overdue: false };
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let text: string; try { text = date.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch (_) { text = `${part}`; }
  return { text, overdue: date < now };
}
const PRIO_LABEL: Record<string, string> = { Priority_1: "High", Priority_2: "Med", Priority_3: "Low" };
const PRIO_COLOR: Record<string, string> = { Priority_1: "#C41E3A", Priority_2: "#D97706", Priority_3: "#6b7280" };
const SORTERS: Record<string, (a: Task, b: Task) => number> = {
  due:      (a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""),
  priority: (a, b) => a.priority.localeCompare(b.priority),
  title:    (a, b) => a.title.localeCompare(b.title),
};

const ICON_CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const ICON_RECUR = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';

// ── Widget factory ─────────────────────────────────────────────────────────────
const factory: BlockFactory = (BaseBlockClass, _widgetApi) => {
  return class TaskSelectorWidget extends BaseBlockClass {
    constructor() { super(); }

    async renderBlock(container: HTMLElement) {
      const apiToken = this.getAttribute("apitoken") || "";
      const baseUrl = (this.getAttribute("baseurl") || DEFAULT_BASE_URL).replace(/\/$/, "");
      const title = this.getAttribute("title") || "Your checklist";
      const sortBy = this.getAttribute("sortby") || "picked";
      const primary = this.getAttribute("primarycolor") || DEFAULT_PRIMARY;
      const bg = this.getAttribute("backgroundcolor") || "";
      const limitHeight = this.getAttribute("limitheight") === "true";
      let maxHeight = (this.getAttribute("maxheight") || "").trim();
      if (!maxHeight) maxHeight = "600px"; else if (/^\d+(\.\d+)?$/.test(maxHeight)) maxHeight += "px";

      const primaryRgb = hexToRgb(primary);
      const primaryText = contrastText(primary);
      const p = "tsw";

      // Parse "installationId/taskId" refs (also accept ':' as a separator).
      const refs: TaskRef[] = (this.getAttribute("tasklist") || "")
        .split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
        .map(line => { const m = line.split(/[\/:]/).map(x => x.trim()).filter(Boolean); return m.length >= 2 ? { installId: m[0], taskId: m[1] } : null; })
        .filter((x): x is TaskRef => !!x);

      const apiOpts = (): RequestInit => ({
        credentials: "omit",
        headers: { Authorization: `Basic ${apiToken}`, "Content-Type": "application/json" },
      });

      container.innerHTML = `
        <style>
          .${p}{--primary:${primary};--primary-rgb:${primaryRgb};--primary-text:${primaryText};
            --dark:#1A1A1A;--gray:#6b7280;--gray-lt:#9ca3af;--border:#e5e7eb;--success:#2E7D4A;--error:#C41E3A;
            --r-md:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--dark);
            background:${bg || "transparent"};padding:16px}
          .${p} *{box-sizing:border-box;margin:0;padding:0}
          .${p}-title{font-size:16px;font-weight:800;margin-bottom:2px}
          .${p}-count{font-size:12px;color:var(--gray-lt);font-weight:600;margin-bottom:12px}
          .${p}-list{display:flex;flex-direction:column;gap:8px${limitHeight ? `;max-height:${maxHeight};overflow-y:auto` : ""}}
          .${p}-row{display:flex;align-items:flex-start;gap:12px;padding:11px 13px;background:#fff;border:1px solid var(--border);
            border-radius:var(--r-md);box-shadow:0 1px 3px rgba(0,0,0,.05);transition:opacity .25s,box-shadow .15s;cursor:pointer}
          .${p}-row:hover{box-shadow:0 4px 14px rgba(0,0,0,.09)}
          .${p}-row.done{opacity:.62}
          .${p}-check{width:22px;height:22px;border-radius:50%;border:2px solid #d1d5db;background:#fff;cursor:pointer;
            display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;padding:0}
          .${p}-check:hover{border-color:var(--primary);background:rgba(var(--primary-rgb),.06)}
          .${p}-check.checked{background:var(--success);border-color:var(--success)}
          .${p}-check svg{display:none}.${p}-check.checked svg{display:block}
          .${p}-main{flex:1;min-width:0;padding-top:1px}
          .${p}-row-title{font-size:14px;font-weight:600;line-height:1.45;word-break:break-word}
          .${p}-row.done .${p}-row-title{color:var(--gray);text-decoration:line-through}
          .${p}-meta{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:6px}
          .${p}-b{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:4px;font-size:9.5px;
            font-weight:800;letter-spacing:.4px;text-transform:uppercase;line-height:1.5}
          .${p}-b-cat{color:#fff}.${p}-b-recur{background:rgba(var(--primary-rgb),.1);color:var(--primary)}
          .${p}-b-due{color:var(--gray-lt);font-weight:600;text-transform:none;letter-spacing:0;font-size:11px}
          .${p}-b-due.overdue{color:var(--error);font-weight:800}
          .${p}-b-prio{border:1.5px solid currentColor;font-size:9.5px}
          .${p}-state{padding:22px 8px;text-align:center;color:var(--gray-lt);font-size:13px}
          .${p}-spin{width:18px;height:18px;border-radius:50%;border:2.5px solid rgba(var(--primary-rgb),.2);
            border-top-color:var(--primary);animation:${p}-spin .7s linear infinite;display:inline-block;vertical-align:middle;margin-right:7px}
          @keyframes ${p}-spin{to{transform:rotate(360deg)}}
          .${p}-banner{display:none;margin-bottom:10px;padding:9px 12px;border-radius:var(--r-md);font-size:12.5px;font-weight:600;
            background:rgba(196,30,58,.08);color:var(--error);border:1px solid rgba(196,30,58,.2)}
        </style>
        <div class="${p}">
          <div class="${p}-title">${esc(title)}</div>
          <div class="${p}-count" id="${p}-count"></div>
          <div class="${p}-banner" id="${p}-banner"></div>
          <div class="${p}-list" id="${p}-list">
            <div class="${p}-state"><span class="${p}-spin"></span>Loading…</div>
          </div>
        </div>`;

      const listEl = container.querySelector(`#${p}-list`) as HTMLElement;
      const countEl = container.querySelector(`#${p}-count`) as HTMLElement;
      const bannerEl = container.querySelector(`#${p}-banner`) as HTMLElement;
      let bannerT: number | undefined;
      const showError = (msg: string) => {
        bannerEl.textContent = msg; bannerEl.style.display = "block";
        window.clearTimeout(bannerT); bannerT = window.setTimeout(() => { bannerEl.style.display = "none"; }, 4000);
      };

      let tasks: Task[] = [];

      function rowHtml(t: Task): string {
        const done = isDone(t.status);
        const cat = t.taskType; const catCol = cat ? typeColor(cat) : "";
        const due = fmtDue(t.dueDate);
        const meta: string[] = [];
        if (cat) meta.push(`<span class="${p}-b ${p}-b-cat" style="background:${catCol};color:${contrastText(catCol)}">${esc(cat)}</span>`);
        if (t.isRecurring) meta.push(`<span class="${p}-b ${p}-b-recur">${ICON_RECUR} Recurring</span>`);
        if (t.priority && t.priority !== "Priority_3") meta.push(`<span class="${p}-b ${p}-b-prio" style="color:${PRIO_COLOR[t.priority]}">${PRIO_LABEL[t.priority] || ""}</span>`);
        if (due.text) meta.push(`<span class="${p}-b ${p}-b-due ${due.overdue && !done ? "overdue" : ""}">${due.overdue && !done ? "Overdue · " : "Due "}${esc(due.text)}</span>`);
        return `<div class="${p}-row ${done ? "done" : ""}" data-id="${esc(t.id)}" data-inst="${esc(t.installId)}">
          <button class="${p}-check ${done ? "checked" : ""}" aria-label="Toggle task">${ICON_CHECK}</button>
          <div class="${p}-main">
            <span class="${p}-row-title">${esc(stripMarkers(t.title))}</span>
            ${meta.length ? `<div class="${p}-meta">${meta.join("")}</div>` : ""}
          </div>
        </div>`;
      }

      function render() {
        const visible = tasks.filter(t => t.ok);
        if (sortBy !== "picked") visible.sort(SORTERS[sortBy] || SORTERS.due);
        countEl.textContent = visible.length ? `${visible.length} task${visible.length !== 1 ? "s" : ""}` : "";
        if (!visible.length) {
          listEl.innerHTML = `<div class="${p}-state">${refs.length ? "No tasks found for the configured IDs." : "No tasks configured yet."}</div>`;
          return;
        }
        listEl.innerHTML = visible.map(rowHtml).join("");
        listEl.querySelectorAll(`.${p}-row`).forEach(row => {
          const check = row.querySelector(`.${p}-check`) as HTMLElement;
          check.addEventListener("click", e => { e.stopPropagation(); toggle(row as HTMLElement); });
        });
      }

      async function toggle(row: HTMLElement) {
        const id = row.dataset.id!, inst = row.dataset.inst!;
        const t = tasks.find(x => x.id === id && x.installId === inst);
        if (!t) return;
        const done = isDone(t.status);
        const next = done ? "OPEN" : "CLOSED";
        const check = row.querySelector(`.${p}-check`) as HTMLElement;
        check.classList.toggle("checked", !done); row.classList.toggle("done", !done);
        (check as HTMLButtonElement).disabled = true;
        try {
          const res = await fetch(`${baseUrl}/tasks/${t.installId}/task/${t.id}`,
            { method: "PATCH", ...apiOpts(), body: JSON.stringify({ status: next }) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          t.status = next;
        } catch (_) {
          check.classList.toggle("checked", done); row.classList.toggle("done", done);
          showError("Couldn't update the task. Please try again.");
        }
        (check as HTMLButtonElement).disabled = false;
      }

      async function load() {
        if (!refs.length) { render(); return; }
        tasks = await Promise.all(refs.map(async (r): Promise<Task> => {
          const base: Task = { id: r.taskId, installId: r.installId, title: "", description: "", status: "",
            dueDate: null, priority: "Priority_3", taskType: null, isRecurring: false, ok: false };
          try {
            const res = await fetch(`${baseUrl}/tasks/${r.installId}/task/${r.taskId}`, apiOpts());
            if (!res.ok) return base;
            const d = await res.json();
            const desc = d.description || "";
            return {
              id: d.id || r.taskId, installId: r.installId,
              title: stripMarkers(d.title || "") || "(untitled)", description: desc,
              status: d.status || "OPEN", dueDate: d.dueDate || null, priority: d.priority || "Priority_3",
              taskType: parseType(d.title || "") || parseType(desc), isRecurring: RECUR_RE.test(desc) || RECUR_RE.test(d.title || ""),
              ok: true,
            };
          } catch (_) { return base; }
        }));
        render();
      }

      load();
    }
  };
};

// ── Block registration ──────────────────────────────────────────────────────
const blockDefinition: BlockDefinition = {
  name: "task-selector-widget",
  label: "Task Selector",
  attributes: ["apitoken", "baseurl", "tasklist", "title", "sortby", "primarycolor", "backgroundcolor", "limitheight", "maxheight"],
  factory, configurationSchema, uiSchema, blockLevel: "block",
  iconUrl: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNzEgMTcxIj48Y2lyY2xlIGN4PSI4NS41IiBjeT0iODUuNSIgcj0iODUuNSIgZmlsbD0iI2RhMmUzMiIvPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQzLjUgNDMuNSkgc2NhbGUoMy41KSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIxIDEwLjVWMTlhMiAyIDAgMCAxLTIgMkg1YTIgMiAwIDAgMS0yLTJWNWEyIDIgMCAwIDEgMi0yaDEyLjUiLz48cGF0aCBkPSJtOSAxMSAzIDNMMjIgNCIvPjwvZz48L3N2Zz4=",
};

window.defineBlock({ blockDefinition, author: "cdcruz-sbse", version: "1.0.0" } as ExternalBlockDefinition);
