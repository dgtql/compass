/*
 * Compass SPA — single-file vanilla JS.
 *
 * Three columns: tickers/memos list (left), memo viewer (center),
 * evidence panel (right). Memos are rendered via marked.js; the
 * `[ev#N]` tags in the markdown become clickable buttons that fetch
 * /api/evidence/N and pop the chunk into the right panel.
 */

const $ = (sel) => document.querySelector(sel);
const tickerList = $("#ticker-list");
const memoList = $("#memo-list");
const memoTitle = $("#memo-title");
const memoMeta = $("#memo-meta");
const memoBody = $("#memo-body");
const evidenceTitle = $("#evidence-title");
const evidenceBody = $("#evidence-body");

let state = {
  tickers: [],
  selectedTicker: null,
  memos: [],
  selectedMemo: null,
  activeEvidenceId: null,
};

const EV_RE = /\[ev#(\d+(?:\s*,\s*ev#\d+)*)\]/g;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

function setHTML(node, html) {
  node.innerHTML = html;
}

// --- ticker list ----------------------------------------------------------

async function loadTickers() {
  state.tickers = await jget("/api/tickers");
  tickerList.innerHTML = state.tickers
    .map(
      (t) => `
      <li>
        <button data-ticker="${t.ticker}"
                class="ticker-btn w-full text-left px-4 py-2 hover:bg-indigo-50 flex justify-between items-center">
          <span class="font-medium">${t.ticker}</span>
          <span class="text-xs text-gray-400">${t.memo_count} memo${t.memo_count === 1 ? "" : "s"}</span>
        </button>
      </li>`
    )
    .join("");
  tickerList.querySelectorAll(".ticker-btn").forEach((btn) =>
    btn.addEventListener("click", () => selectTicker(btn.dataset.ticker))
  );
  if (state.tickers.length && !state.selectedTicker) {
    selectTicker(state.tickers[0].ticker);
  }
}

// --- memo list ------------------------------------------------------------

async function selectTicker(ticker) {
  state.selectedTicker = ticker;
  tickerList.querySelectorAll(".ticker-btn").forEach((btn) => {
    btn.classList.toggle("bg-indigo-100", btn.dataset.ticker === ticker);
    btn.classList.toggle("text-indigo-700", btn.dataset.ticker === ticker);
  });
  state.memos = await jget(`/api/tickers/${ticker}/memos`);
  memoList.innerHTML = state.memos.length
    ? state.memos
        .map(
          (m) => `
          <li>
            <button data-type="${m.type}" data-date="${m.date}"
                    class="memo-btn w-full text-left px-4 py-2 hover:bg-indigo-50">
              <div class="font-medium capitalize">${m.type}</div>
              <div class="text-xs text-gray-400">${m.date}</div>
            </button>
          </li>`
        )
        .join("")
    : `<li class="px-4 py-3 text-xs text-gray-400 italic">No memos yet. Run <code>compass research ${ticker} --type pitch</code>.</li>`;
  memoList.querySelectorAll(".memo-btn").forEach((btn) =>
    btn.addEventListener("click", () => selectMemo(btn.dataset.type, btn.dataset.date))
  );
  if (state.memos.length) {
    selectMemo(state.memos[0].type, state.memos[0].date);
  } else {
    memoTitle.textContent = "No memos for this ticker yet";
    memoMeta.textContent = "";
    memoBody.innerHTML = "";
  }
}

// --- memo rendering -------------------------------------------------------

async function selectMemo(type, date) {
  state.selectedMemo = { type, date };
  memoList.querySelectorAll(".memo-btn").forEach((btn) => {
    btn.classList.toggle(
      "bg-indigo-100",
      btn.dataset.type === type && btn.dataset.date === date
    );
    btn.classList.toggle(
      "text-indigo-700",
      btn.dataset.type === type && btn.dataset.date === date
    );
  });
  const memo = await jget(
    `/api/memos/${state.selectedTicker}/${type}/${date}`
  );
  memoTitle.textContent = `${memo.ticker} · ${type} memo · ${date}`;
  memoMeta.textContent = `${memo.citations.length} evidence citation${memo.citations.length === 1 ? "" : "s"}`;

  // Convert [ev#N] tags into clickable buttons BEFORE markdown parsing.
  // We insert a sentinel HTML span; marked.js (with html enabled) preserves it.
  const replaced = memo.content.replace(EV_RE, (_match, ids) => {
    const numbers = ids.match(/\d+/g) || [];
    return numbers
      .map(
        (n) =>
          `<span class="ev-tag" data-ev-id="${n}" role="button" tabindex="0">ev#${n}</span>`
      )
      .join(" ");
  });
  memoBody.innerHTML = marked.parse(replaced, { breaks: false, mangle: false });

  // Wire click handlers for the tags
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

// --- evidence panel -------------------------------------------------------

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
    setHTML(
      evidenceBody,
      `
      <div class="text-xs text-gray-500 mb-3 space-y-1">
        <div><span class="font-medium">Source:</span> ${sourceLine}</div>
        <div><span class="font-medium">Lines:</span> ${ev.line_start}–${ev.line_end}</div>
        <div><span class="font-medium">Retrieved:</span> ${ev.retrieved_at}</div>
      </div>
      <pre class="whitespace-pre-wrap text-xs leading-relaxed bg-gray-50 p-3 rounded border border-gray-200">${escapeHtml(ev.content)}</pre>
      `
    );
  } catch (e) {
    evidenceTitle.textContent = `Failed to load ev#${id}`;
    evidenceBody.textContent = String(e);
  }
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

loadTickers().catch((e) => {
  tickerList.innerHTML = `<li class="px-4 py-3 text-xs text-red-500">${e.message}</li>`;
});
