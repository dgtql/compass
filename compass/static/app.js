/*
 * Compass SPA — interactive workbench (slice 9).
 *
 * Three columns: workspace sidebar (tickers / memos / tasks), memo viewer,
 * evidence panel. Tickers can be added live; tasks (fetch / snapshot /
 * research) run on the backend and stream tool-call events into a
 * collapsible task entry the user can expand to watch progress.
 *
 * Polling, not WebSockets — once the live UI matures we can swap to push.
 */

const $ = (sel) => document.querySelector(sel);
const tickerList   = $("#ticker-list");
const memoList     = $("#memo-list");
const memoTitle    = $("#memo-title");
const memoMeta     = $("#memo-meta");
const memoBody     = $("#memo-body");
const evidenceTitle= $("#evidence-title");
const evidenceBody = $("#evidence-body");
const taskList     = $("#task-list");
const runTaskTarget = $("#run-task-target");
const addTickerForm  = $("#add-ticker-form");
const addTickerInput = $("#add-ticker-input");

const state = {
  tickers: [],
  selectedTicker: null,
  memos: [],
  selectedMemo: null,
  activeEvidenceId: null,
  tasks: [],
  expandedTaskId: null,
  pollInflight: false,
};

const EV_RE = /\[ev#(\d+(?:\s*,\s*ev#\d+)*)\]/g;
const POLL_INTERVAL_MS = 1500;

// --- helpers ---------------------------------------------------------------

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

async function jpost(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`${url} → ${r.status}: ${detail}`);
  }
  return r.json();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtElapsed(seconds) {
  if (seconds == null) return "";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function taskDuration(t) {
  const start = t.started_at ?? t.created_at;
  const end   = t.finished_at ?? Date.now() / 1000;
  if (start == null) return null;
  return end - start;
}

// --- ticker list -----------------------------------------------------------

async function loadTickers() {
  state.tickers = await jget("/api/tickers");
  renderTickers();
  if (state.tickers.length && !state.selectedTicker) {
    selectTicker(state.tickers[0].ticker);
  } else if (!state.tickers.length) {
    state.selectedTicker = null;
    runTaskTarget.textContent = "(pick a ticker — or add one above)";
  }
}

function renderTickers() {
  tickerList.innerHTML = state.tickers
    .map(
      (t) => `
      <li>
        <button data-ticker="${t.ticker}"
                class="ticker-btn w-full text-left px-4 py-2 hover:bg-indigo-50 flex justify-between items-center ${state.selectedTicker === t.ticker ? "bg-indigo-100 text-indigo-700" : ""}">
          <span class="font-medium">${escapeHtml(t.ticker)}</span>
          <span class="text-xs text-gray-400">${t.memo_count} memo${t.memo_count === 1 ? "" : "s"}</span>
        </button>
      </li>`
    )
    .join("");
  tickerList.querySelectorAll(".ticker-btn").forEach((btn) =>
    btn.addEventListener("click", () => selectTicker(btn.dataset.ticker))
  );
}

addTickerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = addTickerInput.value.trim();
  if (!raw) return;
  addTickerInput.disabled = true;
  try {
    await jpost("/api/tickers", { ticker: raw });
    addTickerInput.value = "";
    await loadTickers();
    selectTicker(raw.toUpperCase());
  } catch (err) {
    alert("Add ticker failed: " + err.message);
  } finally {
    addTickerInput.disabled = false;
    addTickerInput.focus();
  }
});

// --- memo list -------------------------------------------------------------

async function selectTicker(ticker) {
  state.selectedTicker = ticker;
  renderTickers();
  runTaskTarget.innerHTML = `Running on <span class="font-semibold text-gray-700">${escapeHtml(ticker)}</span>`;
  state.memos = await jget(`/api/tickers/${ticker}/memos`);
  renderMemos();
  if (state.memos.length) {
    selectMemo(state.memos[0].type, state.memos[0].date);
  } else {
    state.selectedMemo = null;
    memoTitle.textContent = `${ticker} — no memos yet`;
    memoMeta.textContent = "Run “Fetch 10-K” and “Generate pitch memo” to create one.";
    memoBody.innerHTML = "";
  }
}

function renderMemos() {
  if (!state.memos.length) {
    memoList.innerHTML = `<li class="px-4 py-2 text-xs text-gray-400 italic">No memos yet.</li>`;
    return;
  }
  memoList.innerHTML = state.memos
    .map((m) => {
      const isActive = state.selectedMemo
        && state.selectedMemo.type === m.type
        && state.selectedMemo.date === m.date;
      return `
        <li>
          <button data-type="${m.type}" data-date="${m.date}"
                  class="memo-btn w-full text-left px-4 py-2 hover:bg-indigo-50 ${isActive ? "bg-indigo-100 text-indigo-700" : ""}">
            <div class="font-medium capitalize">${escapeHtml(m.type)}</div>
            <div class="text-xs text-gray-400">${escapeHtml(m.date)}</div>
          </button>
        </li>`;
    })
    .join("");
  memoList.querySelectorAll(".memo-btn").forEach((btn) =>
    btn.addEventListener("click", () => selectMemo(btn.dataset.type, btn.dataset.date))
  );
}

// --- memo rendering --------------------------------------------------------

async function selectMemo(type, date) {
  state.selectedMemo = { type, date };
  renderMemos();
  const memo = await jget(`/api/memos/${state.selectedTicker}/${type}/${date}`);
  memoTitle.textContent = `${memo.ticker} · ${type} memo · ${date}`;
  memoMeta.textContent = `${memo.citations.length} evidence citation${memo.citations.length === 1 ? "" : "s"}`;

  const replaced = memo.content.replace(EV_RE, (_match, ids) => {
    const numbers = ids.match(/\d+/g) || [];
    return numbers
      .map(
        (n) => `<span class="ev-tag" data-ev-id="${n}" role="button" tabindex="0">ev#${n}</span>`
      )
      .join(" ");
  });
  memoBody.innerHTML = marked.parse(replaced, { breaks: false, mangle: false });

  memoBody.querySelectorAll(".ev-tag").forEach((el) => {
    el.addEventListener("click", () => showEvidence(parseInt(el.dataset.evId, 10)));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showEvidence(parseInt(el.dataset.evId, 10));
      }
    });
  });
}

// --- evidence panel --------------------------------------------------------

async function showEvidence(id) {
  state.activeEvidenceId = id;
  memoBody.querySelectorAll(".ev-tag").forEach((el) => {
    el.classList.toggle("is-active", parseInt(el.dataset.evId, 10) === id);
  });
  evidenceTitle.textContent = `Loading ev#${id}...`;
  evidenceBody.innerHTML = "";
  try {
    const ev = await jget(`/api/evidence/${id}`);
    const sourceLine = ev.source_url
      ? `<a href="${ev.source_url}" target="_blank" rel="noopener" class="text-indigo-600 hover:underline">${ev.source} · ${ev.form_type || "?"}</a>`
      : `${ev.source} · ${ev.form_type || "?"}`;
    evidenceTitle.innerHTML = `ev#${ev.id} <span class="text-xs text-gray-400">${ev.ticker} · ${ev.doc_id}</span>`;
    evidenceBody.innerHTML = `
      <div class="text-xs text-gray-500 mb-3 space-y-1">
        <div><span class="font-medium">Source:</span> ${sourceLine}</div>
        <div><span class="font-medium">Lines:</span> ${ev.line_start}–${ev.line_end}</div>
        <div><span class="font-medium">Retrieved:</span> ${escapeHtml(ev.retrieved_at)}</div>
      </div>
      <pre class="whitespace-pre-wrap text-xs leading-relaxed bg-gray-50 p-3 rounded border border-gray-200">${escapeHtml(ev.content)}</pre>
    `;
  } catch (e) {
    evidenceTitle.textContent = `Failed to load ev#${id}`;
    evidenceBody.textContent = String(e);
  }
}

// --- task panel ------------------------------------------------------------

document.querySelectorAll(".run-task-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    if (!state.selectedTicker) {
      alert("Pick a ticker first (or add one).");
      return;
    }
    const type = btn.dataset.taskType;
    const params = {};
    if (type === "fetch_filing")  params.form = btn.dataset.form || "10-K";
    if (type === "research")      params.memo_type = btn.dataset.memoType || "pitch";
    startTask(type, params);
  })
);

async function startTask(type, params) {
  try {
    const task = await jpost("/api/tasks", {
      ticker: state.selectedTicker,
      type,
      params,
    });
    state.expandedTaskId = task.id;
    await refreshTasks();
    schedulePoll();
  } catch (err) {
    alert("Start task failed: " + err.message);
  }
}

async function refreshTasks() {
  state.tasks = await jget("/api/tasks?limit=20");
  renderTasks();
  return state.tasks;
}

function renderTasks() {
  if (!state.tasks.length) {
    taskList.innerHTML = `<li class="px-4 py-2 text-xs text-gray-400 italic">No tasks yet.</li>`;
    return;
  }
  taskList.innerHTML = state.tasks.map(renderTask).join("");
  // Wire expand toggles
  taskList.querySelectorAll(".task-row").forEach((row) =>
    row.addEventListener("click", () => {
      state.expandedTaskId = state.expandedTaskId === row.dataset.id ? null : row.dataset.id;
      renderTasks();
    })
  );
}

function taskLabel(t) {
  const tt = t.type;
  if (tt === "fetch_filing") return `Fetch ${escapeHtml(t.params.form || "10-K")} · ${escapeHtml(t.ticker)}`;
  if (tt === "snapshot")     return `Snapshot · ${escapeHtml(t.ticker)}`;
  if (tt === "research")     return `${escapeHtml((t.params.memo_type || "pitch")).replace(/^\w/, (c) => c.toUpperCase())} memo · ${escapeHtml(t.ticker)}`;
  return `${escapeHtml(tt)} · ${escapeHtml(t.ticker)}`;
}

function renderTask(t) {
  const expanded = state.expandedTaskId === t.id;
  const dur = taskDuration(t);
  const durStr = dur != null ? ` · ${fmtElapsed(dur)}` : "";
  const spinner = t.status === "running" ? '<span class="spinner"></span>' : "";
  const events = (t.events || []).slice(-50)
    .map((e) => {
      const cls = `task-event t-${escapeHtml(e.type || "info")}`;
      const elapsed = e.elapsed != null ? `[${e.elapsed.toFixed(1)}s] ` : "";
      const msg = e.preview || e.message || (e.tool_name ? e.tool_name : "");
      return `<div class="${cls}">${escapeHtml(elapsed)}${escapeHtml(msg)}</div>`;
    })
    .join("");
  const errBlock = t.error
    ? `<div class="task-event t-error mt-1">${escapeHtml(t.error)}</div>`
    : "";
  const resultBlock = t.result && !t.error
    ? `<div class="text-xs text-gray-500 mt-1">${escapeHtml(JSON.stringify(t.result).slice(0, 240))}</div>`
    : "";
  return `
    <li class="border-b border-gray-100">
      <div class="task-row px-4 py-2 cursor-pointer hover:bg-gray-50" data-id="${t.id}">
        <div class="flex items-center justify-between text-sm">
          <span class="truncate">${spinner}${taskLabel(t)}</span>
          <span class="badge badge-${escapeHtml(t.status)}">${escapeHtml(t.status)}</span>
        </div>
        <div class="text-xs text-gray-400">${durStr.trim() || "(queued)"}</div>
      </div>
      ${expanded ? `
        <div class="px-4 pb-3 space-y-1">
          <div class="scrollable-events">${events || '<div class="text-xs text-gray-400 italic">No events yet…</div>'}</div>
          ${errBlock}
          ${resultBlock}
        </div>
      ` : ""}
    </li>
  `;
}

function schedulePoll() {
  if (state.pollInflight) return;
  state.pollInflight = true;
  setTimeout(pollLoop, POLL_INTERVAL_MS);
}

async function pollLoop() {
  try {
    await refreshTasks();
    const hadActive = state.tasks.some((t) => t.status === "queued" || t.status === "running");
    const lastFinished = state.tasks.find((t) => t.status === "done" || t.status === "error");
    // If anything just finished, refresh tickers + (if matching selected ticker) memos
    await loadTickers();
    if (state.selectedTicker) {
      const fresh = await jget(`/api/tickers/${state.selectedTicker}/memos`);
      if (fresh.length !== state.memos.length) {
        state.memos = fresh;
        renderMemos();
        if (state.memos.length && (!state.selectedMemo
            || !fresh.find((m) => m.type === state.selectedMemo.type && m.date === state.selectedMemo.date))) {
          selectMemo(state.memos[0].type, state.memos[0].date);
        }
      }
    }
    if (hadActive) {
      setTimeout(pollLoop, POLL_INTERVAL_MS);
    } else {
      state.pollInflight = false;
    }
  } catch (err) {
    console.error("poll failed", err);
    state.pollInflight = false;
  }
}

// --- boot ------------------------------------------------------------------

(async function boot() {
  await loadTickers();
  await refreshTasks();
  // If any task is still running on load (server kept state across page reload), keep polling.
  if (state.tasks.some((t) => t.status === "queued" || t.status === "running")) {
    schedulePoll();
  }
})().catch((e) => {
  tickerList.innerHTML = `<li class="px-4 py-3 text-xs text-red-500">${escapeHtml(e.message)}</li>`;
});
