// ============================================================================
// Task Selector Widget — deployable Staffbase custom widget
// ----------------------------------------------------------------------------
// Renders a checklist of specific tasks (chosen by the admin) inside a News post.
// The admin pastes task references — "installationId/taskId", one per line — into
// the "Selected tasks" config field (e.g. copied from the Task ID Finder widget).
// End users see the checklist, can check tasks off (PATCH write-back), and can
// TAP a task to open a detail modal (badges, due/created/store/list, description,
// attachments, and a Mark-as-done button).
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
  status: string; dueDate: string | null; createDate: string | null; priority: string;
  taskType: string | null; isRecurring: boolean; auditSeverity: string;
  listId: string; listName: string; attachmentIds: string[]; ok: boolean;
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
function fmtDate(iso: string | null): { text: string; overdue: boolean } {
  if (!iso) return { text: "", overdue: false };
  const part = iso.split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return { text: "", overdue: false };
  const [y, m, d] = part.split("-").map(Number);
  const date = new Date(y, m - 1, d); if (isNaN(date.getTime())) return { text: "", overdue: false };
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let text: string; try { text = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  catch (_) { text = `${part}`; }
  return { text, overdue: date < now };
}
function humanSize(b: number): string {
  if (!b && b !== 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
const PRIO_LABEL: Record<string, string> = { Priority_1: "High", Priority_2: "Med", Priority_3: "Low" };
const PRIO_COLOR: Record<string, string> = { Priority_1: "#C41E3A", Priority_2: "#D97706", Priority_3: "#6b7280" };
const SORTERS: Record<string, (a: Task, b: Task) => number> = {
  due:      (a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""),
  priority: (a, b) => a.priority.localeCompare(b.priority),
  title:    (a, b) => a.title.localeCompare(b.title),
};

// Icons
const IC_CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const IC_RECUR = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
const IC_CAL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
const IC_CLOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
const IC_STORE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
const IC_LIST = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';
const IC_FILE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
const IC_X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const IC_DONE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const IC_UNDO = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>';

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
            --r-sm:6px;--r-md:10px;--r-lg:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--dark);
            background:${bg || "transparent"};padding:16px}
          .${p} *{box-sizing:border-box;margin:0;padding:0}
          .${p}-title{font-size:16px;font-weight:800;margin-bottom:2px}
          .${p}-count{font-size:12px;color:var(--gray-lt);font-weight:600;margin-bottom:12px}
          .${p}-list{display:flex;flex-direction:column;gap:8px${limitHeight ? `;max-height:${maxHeight};overflow-y:auto` : ""}}
          .${p}-row{display:flex;align-items:flex-start;gap:12px;padding:11px 13px;background:#fff;border:1px solid var(--border);
            border-radius:var(--r-md);box-shadow:0 1px 3px rgba(0,0,0,.05);transition:opacity .25s,box-shadow .15s,transform .15s;cursor:pointer}
          .${p}-row:hover{box-shadow:0 4px 14px rgba(0,0,0,.09);transform:translateY(-1px)}
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
          .${p}-b-list{color:var(--gray);font-weight:600;text-transform:none;letter-spacing:0;font-size:11px}
          .${p}-state{padding:22px 8px;text-align:center;color:var(--gray-lt);font-size:13px}
          .${p}-spin{width:18px;height:18px;border-radius:50%;border:2.5px solid rgba(var(--primary-rgb),.2);
            border-top-color:var(--primary);animation:${p}-spin .7s linear infinite;display:inline-block;vertical-align:middle;margin-right:7px}
          @keyframes ${p}-spin{to{transform:rotate(360deg)}}
          .${p}-banner{display:none;margin-bottom:10px;padding:9px 12px;border-radius:var(--r-md);font-size:12.5px;font-weight:600;
            background:rgba(196,30,58,.08);color:var(--error);border:1px solid rgba(196,30,58,.2)}

          /* ── Detail modal ── */
          .${p}-overlay{position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .25s}
          .${p}-overlay.open{opacity:1;pointer-events:auto}
          .${p}-detail{--primary:${primary};--primary-rgb:${primaryRgb};--primary-text:${primaryText};--dark:#1A1A1A;--gray:#6b7280;
            --gray-lt:#9ca3af;--border:#e5e7eb;--success:#2E7D4A;--error:#C41E3A;--r-sm:6px;--r-md:10px;--r-lg:14px;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;position:fixed;left:0;right:0;bottom:0;z-index:99999;
            background:#fff;border-radius:20px 20px 0 0;max-height:88vh;display:flex;flex-direction:column;
            transform:translateY(102%);transition:transform .32s cubic-bezier(.32,.72,0,1);overflow:hidden}
          .${p}-detail.open{transform:translateY(0)}
          .${p}-detail.side{left:50%;top:50%;right:auto;bottom:auto;width:min(460px,92vw);max-height:min(86vh,760px);border-radius:20px;
            transform:translate(-50%,-46%) scale(.97);opacity:0;pointer-events:none;box-shadow:0 24px 64px rgba(0,0,0,.28);
            transition:opacity .2s,transform .26s cubic-bezier(.32,.72,0,1)}
          .${p}-detail.side.open{transform:translate(-50%,-50%) scale(1);opacity:1;pointer-events:auto}
          .${p}-detail-handle{width:40px;height:5px;border-radius:3px;background:var(--border);margin:9px auto 2px;flex-shrink:0}
          .${p}-detail.side .${p}-detail-handle{display:none}
          .${p}-detail-head{display:flex;align-items:flex-start;gap:10px;padding:14px 20px 12px;flex-shrink:0}
          .${p}-detail-badges{display:flex;gap:6px;flex-wrap:wrap;flex:1;align-items:center}
          .${p}-detail-close{width:28px;height:28px;border-radius:50%;border:none;background:#f3f4f6;cursor:pointer;
            display:flex;align-items:center;justify-content:center;color:var(--gray);flex-shrink:0;transition:background .15s,color .15s}
          .${p}-detail-close:hover{background:var(--border);color:var(--dark)}
          .${p}-detail-body{flex:1;overflow-y:auto;padding:4px 20px 20px;min-height:0}
          .${p}-detail-title{font-size:19px;font-weight:800;line-height:1.3;margin-bottom:14px;word-break:break-word}
          .${p}-detail-title.done{text-decoration:line-through;color:var(--gray)}
          .${p}-detail-meta{display:flex;flex-direction:column;gap:9px;margin-bottom:18px}
          .${p}-mrow{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--gray)}
          .${p}-mrow svg{flex-shrink:0;color:var(--gray-lt)}
          .${p}-mrow.overdue{color:var(--error);font-weight:700}
          .${p}-mrow.overdue svg{color:var(--error)}
          .${p}-lbl{font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--gray-lt);margin-bottom:6px}
          .${p}-desc{font-size:13px;color:var(--gray);line-height:1.65;white-space:pre-wrap;word-break:break-word}
          .${p}-desc.empty{font-style:italic;color:var(--gray-lt)}
          .${p}-att{margin-top:18px}
          .${p}-att-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
          .${p}-att-tile{display:flex;align-items:center;gap:9px;padding:7px 10px;border:1px solid var(--border);border-radius:var(--r-md);
            background:#fafafa;font-size:12px;color:var(--dark);text-decoration:none;transition:border-color .15s,background .15s;max-width:100%}
          .${p}-att-tile:hover{border-color:var(--primary);background:#fff}
          .${p}-att-thumb{width:36px;height:36px;border-radius:var(--r-sm);object-fit:cover;flex-shrink:0;background:#f3f4f6}
          .${p}-att-ico{width:36px;height:36px;border-radius:var(--r-sm);background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:var(--gray-lt);flex-shrink:0}
          .${p}-att-meta{min-width:0;display:flex;flex-direction:column;gap:1px}
          .${p}-att-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;font-weight:600}
          .${p}-att-size{color:var(--gray-lt);font-size:11px}
          .${p}-att-empty{font-size:12px;color:var(--gray-lt)}
          .${p}-detail-foot{padding:14px 20px;border-top:1px solid var(--border);flex-shrink:0}
          .${p}-done-btn{width:100%;padding:13px;border-radius:var(--r-md);border:none;font-size:14px;font-weight:700;cursor:pointer;
            font-family:inherit;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:8px}
          .${p}-done-btn.mark{background:rgba(var(--primary-rgb),.08);border:1.5px solid rgba(var(--primary-rgb),.2);color:var(--primary)}
          .${p}-done-btn.mark:hover{background:var(--primary);color:var(--primary-text)}
          .${p}-done-btn.reopen{background:#f3f4f6;border:1.5px solid var(--border);color:var(--gray)}
          .${p}-done-btn.reopen:hover{background:var(--border);color:var(--dark)}
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

      // Detail modal (overlay + panel) — appended once, outside the list.
      const overlayEl = document.createElement("div");
      overlayEl.className = `${p}-overlay`;
      const detailEl = document.createElement("div");
      detailEl.className = `${p}-detail`;
      detailEl.innerHTML = `
        <div class="${p}-detail-handle"></div>
        <div class="${p}-detail-head">
          <div class="${p}-detail-badges" id="${p}-d-badges"></div>
          <button class="${p}-detail-close" id="${p}-d-close" aria-label="Close">${IC_X}</button>
        </div>
        <div class="${p}-detail-body" id="${p}-d-body"></div>
        <div class="${p}-detail-foot"><button class="${p}-done-btn" id="${p}-d-toggle"></button></div>`;
      container.appendChild(overlayEl);
      container.appendChild(detailEl);
      const dBadges = detailEl.querySelector(`#${p}-d-badges`) as HTMLElement;
      const dBody = detailEl.querySelector(`#${p}-d-body`) as HTMLElement;
      const dToggle = detailEl.querySelector(`#${p}-d-toggle`) as HTMLButtonElement;
      const dClose = detailEl.querySelector(`#${p}-d-close`) as HTMLButtonElement;

      let tasks: Task[] = [];
      let detailTask: Task | null = null;

      const mediaCache = new Map<string, any>();
      async function mediaMeta(id: string): Promise<any> {
        if (mediaCache.has(id)) return mediaCache.get(id);
        try {
          const r = await fetch(`${baseUrl}/media/medium/${id}/metadata`, apiOpts());
          const m = r.ok ? await r.json() : null; mediaCache.set(id, m); return m;
        } catch (_) { mediaCache.set(id, null); return null; }
      }

      function badgesHtml(t: Task): string {
        const cat = t.taskType; const out: string[] = [];
        if (cat) { const c = typeColor(cat); out.push(`<span class="${p}-b ${p}-b-cat" style="background:${c};color:${contrastText(c)}">${esc(cat)}</span>`); }
        if (t.isRecurring) out.push(`<span class="${p}-b ${p}-b-recur">${IC_RECUR} Recurring</span>`);
        const crit = (t.auditSeverity || "").toLowerCase() === "critical";
        if (crit) out.push(`<span class="${p}-b ${p}-b-prio" style="color:#9B1C2E">Critical</span>`);
        else if (t.priority && t.priority !== "Priority_3") out.push(`<span class="${p}-b ${p}-b-prio" style="color:${PRIO_COLOR[t.priority]}">${PRIO_LABEL[t.priority] || ""}</span>`);
        return out.join("");
      }

      function rowHtml(t: Task): string {
        const done = isDone(t.status);
        const due = fmtDate(t.dueDate);
        const meta: string[] = [badgesHtml(t)];
        if (due.text) meta.push(`<span class="${p}-b ${p}-b-due ${due.overdue && !done ? "overdue" : ""}">${due.overdue && !done ? "Overdue · " : "Due "}${esc(due.text)}</span>`);
        if (t.listName) meta.push(`<span class="${p}-b ${p}-b-list">${IC_LIST} ${esc(t.listName)}</span>`);
        return `<div class="${p}-row ${done ? "done" : ""}" data-id="${esc(t.id)}" data-inst="${esc(t.installId)}">
          <button class="${p}-check ${done ? "checked" : ""}" aria-label="Toggle task">${IC_CHECK}</button>
          <div class="${p}-main">
            <span class="${p}-row-title">${esc(stripMarkers(t.title))}</span>
            <div class="${p}-meta">${meta.join("")}</div>
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
          const el = row as HTMLElement;
          const id = el.dataset.id!, inst = el.dataset.inst!;
          const t = tasks.find(x => x.id === id && x.installId === inst);
          const check = el.querySelector(`.${p}-check`) as HTMLElement;
          check.addEventListener("click", e => { e.stopPropagation(); if (t) toggle(t); });
          el.addEventListener("click", () => { if (t) openDetail(t); });
        });
      }

      // ── Detail panel ──
      function openDetail(t: Task) {
        detailTask = t;
        detailEl.classList.toggle("side", window.innerWidth >= 720);
        renderDetail(t);
        overlayEl.classList.add("open");
        // commit the closed transform before animating open
        void detailEl.offsetWidth;
        requestAnimationFrame(() => detailEl.classList.add("open"));
      }
      function closeDetail() {
        overlayEl.classList.remove("open");
        detailEl.classList.remove("open");
        detailTask = null;
      }
      function renderDetail(t: Task) {
        const done = isDone(t.status);
        const due = fmtDate(t.dueDate);
        const created = fmtDate(t.createDate);
        const desc = t.description ? stripMarkers(t.description) : "";
        dBadges.innerHTML = badgesHtml(t) || `<span class="${p}-b ${p}-b-list">Task</span>`;
        dBody.innerHTML = `
          <div class="${p}-detail-title ${done ? "done" : ""}">${esc(stripMarkers(t.title))}</div>
          <div class="${p}-detail-meta">
            ${due.text ? `<div class="${p}-mrow ${due.overdue && !done ? "overdue" : ""}">${IC_CAL}${due.overdue && !done ? "Overdue · " : "Due "}${esc(due.text)}</div>` : ""}
            ${created.text ? `<div class="${p}-mrow">${IC_CLOCK}Created ${esc(created.text)}</div>` : ""}
            <div class="${p}-mrow">${IC_STORE}Store ${esc(t.installId)}</div>
            ${t.listName ? `<div class="${p}-mrow">${IC_LIST}${esc(t.listName)}</div>` : ""}
          </div>
          <div class="${p}-lbl">Description</div>
          ${desc ? `<div class="${p}-desc">${esc(desc)}</div>` : `<div class="${p}-desc empty">No description provided.</div>`}
          ${t.attachmentIds.length ? `<div class="${p}-att"><div class="${p}-lbl">Attachments</div><div class="${p}-att-grid" id="${p}-d-att"><span class="${p}-att-empty">Loading…</span></div></div>` : ""}`;
        if (done) { dToggle.className = `${p}-done-btn reopen`; dToggle.innerHTML = `${IC_UNDO} Reopen task`; }
        else { dToggle.className = `${p}-done-btn mark`; dToggle.innerHTML = `${IC_DONE} Mark as done`; }
        if (t.attachmentIds.length) renderAttachments(t);
      }
      async function renderAttachments(t: Task) {
        const grid = dBody.querySelector(`#${p}-d-att`) as HTMLElement | null;
        if (!grid) return;
        const metas = await Promise.all(t.attachmentIds.map(mediaMeta));
        if (detailTask !== t) return;
        grid.innerHTML = t.attachmentIds.map((id, i) => {
          const m = metas[i] || {};
          const name = esc(m.fileName || "attachment");
          const size = m.size ? `<span class="${p}-att-size">${humanSize(m.size)}</span>` : "";
          const turl = (m.thumbnail && m.thumbnail.url) ? String(m.thumbnail.url) : "";
          const thumb = turl ? `<img class="${p}-att-thumb" src="${esc(turl)}" alt="">` : `<span class="${p}-att-ico">${IC_FILE}</span>`;
          return `<a class="${p}-att-tile" href="${esc(turl || "#")}" target="_blank" rel="noopener">
            ${thumb}<span class="${p}-att-meta"><span class="${p}-att-name">${name}</span>${size}</span></a>`;
        }).join("");
      }

      async function toggle(t: Task) {
        const done = isDone(t.status);
        const next = done ? "OPEN" : "CLOSED";
        // optimistic UI
        t.status = next;
        syncRow(t); if (detailTask === t) renderDetail(t);
        try {
          const res = await fetch(`${baseUrl}/tasks/${t.installId}/task/${t.id}`,
            { method: "PATCH", ...apiOpts(), body: JSON.stringify({ status: next }) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (_) {
          t.status = done ? "OPEN" : "CLOSED"; // revert to previous
          syncRow(t); if (detailTask === t) renderDetail(t);
          showError("Couldn't update the task. Please try again.");
        }
      }
      function syncRow(t: Task) {
        const row = listEl.querySelector(`.${p}-row[data-id="${t.id}"][data-inst="${t.installId}"]`) as HTMLElement | null;
        if (!row) return;
        const done = isDone(t.status);
        row.classList.toggle("done", done);
        (row.querySelector(`.${p}-check`) as HTMLElement).classList.toggle("checked", done);
      }

      dClose.addEventListener("click", closeDetail);
      overlayEl.addEventListener("click", closeDetail);
      detailEl.addEventListener("click", e => e.stopPropagation());
      dToggle.addEventListener("click", () => { if (detailTask) toggle(detailTask); });
      document.addEventListener("keydown", e => { if (e.key === "Escape" && detailTask) closeDetail(); });

      async function load() {
        if (!refs.length) { render(); return; }
        // Resolve list names per unique installation (one call each).
        const listNameByInst = new Map<string, Map<string, string>>();
        const uniqInst = [...new Set(refs.map(r => r.installId))];
        await Promise.all(uniqInst.map(async inst => {
          try {
            const r = await fetch(`${baseUrl}/tasks/${inst}/lists`, apiOpts());
            if (!r.ok) return;
            const d = await r.json();
            const arr = Array.isArray(d) ? d : (d.data || []);
            const m = new Map<string, string>();
            for (const l of arr) { const id = l.id || l.listId; const t = l.title || l.name; if (id && t) m.set(id, t); }
            listNameByInst.set(inst, m);
          } catch (_) { /* names are optional */ }
        }));

        tasks = await Promise.all(refs.map(async (r): Promise<Task> => {
          const base: Task = { id: r.taskId, installId: r.installId, title: "", description: "", status: "",
            dueDate: null, createDate: null, priority: "Priority_3", taskType: null, isRecurring: false,
            auditSeverity: "", listId: "", listName: "", attachmentIds: [], ok: false };
          try {
            const res = await fetch(`${baseUrl}/tasks/${r.installId}/task/${r.taskId}`, apiOpts());
            if (!res.ok) return base;
            const d = await res.json();
            const desc = d.description || "";
            const listId = d.taskListId || d.listId || "";
            const listName = (listNameByInst.get(r.installId) || new Map()).get(listId) || "";
            return {
              id: d.id || r.taskId, installId: r.installId,
              title: stripMarkers(d.title || "") || "(untitled)", description: desc,
              status: d.status || "OPEN", dueDate: d.dueDate || null, createDate: d.createdAt || d.createDate || null,
              priority: d.priority || "Priority_3", taskType: parseType(d.title || "") || parseType(desc),
              isRecurring: RECUR_RE.test(desc) || RECUR_RE.test(d.title || ""), auditSeverity: d.auditSeverity || "",
              listId, listName, attachmentIds: Array.isArray(d.attachmentIds) ? d.attachmentIds : [], ok: true,
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

window.defineBlock({ blockDefinition, author: "cdcruz-sbse", version: "1.1.0" } as ExternalBlockDefinition);
