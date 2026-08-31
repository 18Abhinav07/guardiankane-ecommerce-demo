cytoscape.use(cytoscapeFcose);

// Server-derived free text (task titles, AI verdict summaries, AC refs,
// activity-log/trace detail strings) is rendered via innerHTML in several
// panels below and must never be trusted raw.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

function dirColor(dir) {
  const hue = hashHue(dir || '(root)');
  return `hsl(${hue}, 62%, 45%)`;
}

// Keeps apparent screen size ~stable across zoom instead of scaling in lockstep
// with it (the "photograph" feel) — model-space size shrinks as zoom grows, so
// the renderer's modelSize*zoom stays close to `base`. `compensation` < 1
// lets a little real growth through so zooming in still feels rewarding.
function zoomInvariant(base, zoom, compensation) {
  const z = Math.min(Math.max(zoom, 0.05), 8);
  return base / Math.pow(z, compensation);
}

const ACCENT = '#ff5a1f';
const LABEL_ZOOM_THRESHOLD = 1.15;

// Memory/PRD graph node & edge detail used to render as an ad-hoc HTML dump
// into the small always-visible #focus sidebar box, which is both cramped
// for a full run-history/evidence view and adds to sidebar clutter. A
// centered modal gives that content real room without permanently occupying
// sidebar space.
function openDetailModal(html) {
  document.getElementById('detail-modal-body').innerHTML = html;
  document.getElementById('detail-modal-backdrop').classList.add('visible');
}
function closeDetailModal() {
  document.getElementById('detail-modal-backdrop').classList.remove('visible');
}
document.getElementById('detail-modal-backdrop').addEventListener('click', evt => {
  if (evt.target.id === 'detail-modal-backdrop') closeDetailModal();
});
document.getElementById('detail-modal-close').addEventListener('click', closeDetailModal);
window.addEventListener('keydown', evt => { if (evt.key === 'Escape') closeDetailModal(); });

// First-run orientation: a brand-new install shows an empty graph and a
// sidebar full of sections (Phases, Test quality, Gaps & drift, Stuck
// tasks...) with no explanation of what any of them mean or what to do
// next. This is the one thing that renders before any real content exists,
// so it doubles as the dashboard's "what is this" answer for a first-time
// visitor — reusing the same modal the graph/trace views already use rather
// than a separate onboarding component.
function guideHtml() {
  return `
    <div class="modal-title">What GuardianKane does</div>
    <div class="sub">GuardianKane sits between your coding agent and the word "done." When Claude tries
    to stop with a task claimed complete, a hook runs <b>kane-cli</b> against your real running app —
    a browser opens, a generated test replays, a defect sweep runs — and only a real pass lets Claude
    actually stop. A failure is denied back to the agent with the exact reason, so it fixes the real
    thing and the same check runs again next time it tries to stop.</div>

    <div class="modal-title" style="margin-top:16px;">The four tabs</div>
    <div class="guide-tab"><b>Code graph</b><span>Your codebase's files/functions and how they import, call, and get touched by tasks. Click any node to see its review and trace.</span></div>
    <div class="guide-tab"><b>Memory graph</b><span>Bugs GuardianKane has seen before, clustered by similarity — so a recurring defect gets flagged instead of re-discovered from scratch.</span></div>
    <div class="guide-tab"><b>PRD graph</b><span>Your requirements as claims/features, plus drift: gaps between what the PRD says and what the code actually proves.</span></div>
    <div class="guide-tab"><b>Kane activity</b><span>A live log of every verification attempt — pass, fail, and why — as it happens.</span></div>

    <div class="modal-title" style="margin-top:16px;">Getting started</div>
    <div class="guide-step">1. In Claude Code, run <b>/guardian-kane start ./PRD.md</b> to grill your PRD and seed the task tracker.</div>
    <div class="guide-step">2. Tell Claude to work through the tracker — the Stop hook enforces verification automatically, no need to invoke Kane yourself.</div>
    <div class="guide-step">3. Watch this dashboard: nodes populate the Code graph, drift/gaps surface on the PRD tab, and every attempt streams into Kane activity.</div>
    <div class="guide-step">4. A task stuck after 3 failed attempts surfaces in <b>Stuck tasks</b> for you to unblock by hand — that's the loop's deliberate escape hatch, not a bug.</div>
  `;
}
function showGuide() { openDetailModal(guideHtml()); }
document.getElementById('show-guide').addEventListener('click', showGuide);
try {
  if (!localStorage.getItem('gk-guide-seen')) {
    showGuide();
    localStorage.setItem('gk-guide-seen', '1');
  }
} catch {
  // localStorage unavailable (private mode, etc) — just skip the auto-open, the button still works.
}

// fcose (like the cose family generally) lays out each connected component
// separately, so a node with zero edges is its own 1-node component with no
// force acting on it — it gets dropped wherever the "combine components"
// step puts it (a bare row along one edge), instead of settling naturally
// among everything else the way an Obsidian-style graph view would show it.
// Anchoring every orphan to the graph's most-connected node with an
// invisible edge folds it into that node's component, so gravity/repulsion
// place it like any other node; the anchor is hidden and non-interactive so
// it never shows up as a real relationship.
function addOrphanAnchors(elements) {
  const degree = new Map();
  const nodeIds = [];
  for (const el of elements) {
    if (el.data.source !== undefined) {
      degree.set(el.data.source, (degree.get(el.data.source) || 0) + 1);
      degree.set(el.data.target, (degree.get(el.data.target) || 0) + 1);
    } else {
      nodeIds.push(el.data.id);
    }
  }
  let hub = null, hubDegree = -1;
  for (const id of nodeIds) {
    const d = degree.get(id) || 0;
    if (d > hubDegree) { hub = id; hubDegree = d; }
  }
  if (hub === null || hubDegree === 0) return elements;
  for (const id of nodeIds) {
    if ((degree.get(id) || 0) === 0 && id !== hub) {
      elements.push({ data: { id: `orphan-anchor:${id}`, source: hub, target: id }, classes: 'orphan-anchor' });
    }
  }
  return elements;
}

// Set once the graph loads; read by describeSelection() to turn a selection
// into a unit/integration/e2e recommendation informed by actual dependency
// structure, not just the selection count.
let currentGraph = null;

function describeSelection(ids) {
  if (!currentGraph || ids.length === 0) return '';
  if (ids.length === 1) {
    const node = currentGraph.nodes.find(n => n.id === ids[0]);
    const label = node ? (node.label || node.title || node.id.split('/').pop()) : ids[0];
    return `1 node selected — unit test candidate for ${label}.`;
  }
  const idSet = new Set(ids);
  const between = (currentGraph.edges || []).filter(e => idSet.has(e.from) && idSet.has(e.to));
  if (between.length > 0) {
    const typeCounts = {};
    for (const e of between) typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
    const summary = Object.entries(typeCounts).map(([t, c]) => `${c} ${t}`).join(', ');
    return `${ids.length} nodes selected, directly connected (${summary}) — integration test candidate.`;
  }
  // No direct edge between the selected nodes — check for a weaker signal
  // (a shared Kane claim) before concluding they're unrelated.
  const aboutTargets = new Map();
  for (const e of currentGraph.edges || []) {
    if (e.type === 'about' && idSet.has(e.to)) {
      if (!aboutTargets.has(e.from)) aboutTargets.set(e.from, new Set());
      aboutTargets.get(e.from).add(e.to);
    }
  }
  const sharedClaim = [...aboutTargets.entries()].find(([, targets]) => targets.size > 1);
  if (sharedClaim) {
    return `${ids.length} nodes selected, no direct import between them, but they share claim "${sharedClaim[0]}" — possible integration/e2e flow.`;
  }
  return `${ids.length} nodes selected, no dependency link found between them — separate unit tests may be more appropriate.`;
}

// Mutation-score data only exists for files Stryker has actually mutated
// (currently the vitest-scoped src/lib/** tree) — this prefix is where the
// "untested vs weakly-tested vs strongly-tested" distinction is a fair,
// evidence-backed signal. Outside it, "no test edge" just means no test
// harness exists yet at all, which is a different, noisier claim, so those
// nodes are left unbadged rather than lumped in as "untested".
const QUALITY_SCOPE_PREFIX = 'lib/';
const QUALITY_STRONG_THRESHOLD = 85;

// ---------- collapsible section headers (shared by every panel section) ----------
document.querySelectorAll('.section-header').forEach(header => {
  header.addEventListener('click', () => header.closest('.section').classList.toggle('collapsed'));
});

// ---------- side-panel collapse / reopen ----------
// A collapsed panel goes to width:0 (see CSS); the matching reopen-tab lives
// on the canvas itself rather than on the panel, since a width:0 panel can't
// host a click target of its own.
function wirePanelCollapse(panelId, collapseBtnId, reopenTabId) {
  const panel = document.getElementById(panelId);
  const collapseBtn = document.getElementById(collapseBtnId);
  const reopenTab = document.getElementById(reopenTabId);
  collapseBtn.addEventListener('click', () => {
    panel.classList.add('collapsed');
    reopenTab.classList.add('visible');
  });
  reopenTab.addEventListener('click', () => {
    panel.classList.remove('collapsed');
    reopenTab.classList.remove('visible');
  });
}
wirePanelCollapse('panel', 'collapse-panel', 'reopen-panel');
wirePanelCollapse('chat-panel', 'collapse-chat', 'reopen-chat');

// ---------- sidebar sections scoped to the active graph tab ----------
// Each section/control declares which tab(s) it's relevant to via
// data-tabs (space-separated tab names, or "all" for a global section like
// Stuck tasks). Switching tabs hides everything not scoped to it instead of
// showing all 13+ sections at once regardless of which graph is on screen.
function applySidebarScope(tab) {
  document.querySelectorAll('[data-tabs]').forEach(el => {
    const tabs = el.dataset.tabs.split(' ');
    el.classList.toggle('tab-hidden', !(tabs.includes('all') || tabs.includes(tab)));
  });
}

// ---------- scroll-active scrollbar reveal ----------
// Hover-reveal alone flickers mid-gesture: wheel/trackpad momentum keeps
// scrolling after the cursor drifts a pixel off the panel, so the scrollbar
// vanishes while content is still moving, then reappears on the next
// mouseover. Holding a "scroll-active" class for a short grace period after
// the last scroll event (independent of hover) removes that gap.
// 'scroll' alone isn't enough: once content hits a scroll boundary (common
// on short panels), the browser stops firing 'scroll' even while the user
// keeps spinning the wheel there, so the grace timer expires mid-gesture.
// 'wheel' fires regardless of whether the content can still move, so it
// keeps the reveal alive for as long as the user is actually interacting.
function wireScrollActive(el) {
  let timer = null;
  const refresh = () => {
    el.classList.add('scroll-active');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('scroll-active'), 700);
  };
  el.addEventListener('scroll', refresh, { passive: true });
  el.addEventListener('wheel', refresh, { passive: true });
}
wireScrollActive(document.getElementById('panel'));
wireScrollActive(document.getElementById('chat-panel'));
wireScrollActive(document.getElementById('chat-log'));

// ---------- legend row builder (isolate-mode filter semantics) ----------
// Default: isolatedSet is empty -> everything shown, no row dimmed.
// Click a row -> that type is added to the isolated set and ONLY isolated
// types are shown (opposite of the old "everything on, click removes" chips).
// Click an already-isolated row -> removes it from the set; an empty set
// falls back to "show everything" rather than "show nothing".
function buildLegendRow(glyphHtml, label, count, colorVar) {
  const row = document.createElement('div');
  row.className = 'legend-row';
  row.style.setProperty('--cg-color', colorVar);
  row.innerHTML = `${glyphHtml}<span class="legend-label">${label}</span><span class="legend-count">${count}</span>`;
  return row;
}
function glyph(kind, color, dashed) {
  if (kind === 'dot') return `<span class="legend-glyph dot" style="background:${color}"></span>`;
  if (kind === 'diamond') return `<span class="legend-glyph diamond" style="background:${color}"></span>`;
  if (kind === 'triangle') return `<span class="legend-glyph triangle" style="border-bottom-color:${color}"></span>`;
  if (kind === 'square') return `<span class="legend-glyph square" style="background:${color}"></span>`;
  if (kind === 'ring') return `<span class="legend-glyph ring" style="border-color:${color}; border-style:${dashed ? 'dashed' : 'solid'}"></span>`;
  return `<span class="legend-glyph line${dashed ? ' dashed' : ''}" style="border-top-color:${color}"></span>`;
}

let lastKnownGeneratedAt = null;
let lastKnownScopeFlag = null;
let lastKnownLockFlag = null;
let lastKnownGraphError = null;
let lastKnownStaleUpdate = false;
let fetchWarnings = [];

// graph-status, scope-status, and lock-status poll independently (own
// files, own cadence) but render into the same banner element. Each must
// re-render from ALL last-known state, not just its own slice — otherwise
// whichever poll's tick lands last wins and can silently clear another
// poll's still-active flag (e.g. a real graph-status error hidden the
// moment scope-status or lock-status happens to tick with nothing to show).
function refreshGraphStatusBanner() {
  const status = lastKnownGraphError ? { ok: false, error: lastKnownGraphError } : null;
  renderGraphStatusBanner(status, {
    scopeFlag: lastKnownScopeFlag,
    lockFlag: lastKnownLockFlag,
    staleUpdateAvailable: lastKnownStaleUpdate,
  });
}

// Renders /api/graph-status into a banner instead of leaving a failed or
// in-flight background rebuild invisible (goal: "no silent errors").
// `status` null/ok clears the banner; {ok:false} shows the real error;
// a newer generatedAt than what's currently rendered offers a reload
// rather than yanking the graph out from under an in-progress pan/zoom.
function renderGraphStatusBanner(status, opts = {}) {
  const banner = document.getElementById('graph-status-banner');
  if (!banner) return;
  banner.textContent = '';
  if (status && status.ok === false) {
    banner.className = 'error';
    banner.style.display = 'flex';
    const msg = document.createElement('span');
    msg.textContent = `graph auto-refresh failed: ${status.error || 'unknown error'}`;
    banner.appendChild(msg);
    return;
  }
  if (opts.lockFlag) {
    banner.className = 'stale';
    banner.style.display = 'flex';
    const msg = document.createElement('span');
    msg.textContent =
      `⚠ T-${opts.lockFlag.taskId} is touching ${opts.lockFlag.file}, already claimed by ` +
      `T-${opts.lockFlag.lockedBy.id} (${opts.lockFlag.lockedBy.state}) — two tasks may be racing on this file`;
    banner.appendChild(msg);
    return;
  }
  if (opts.scopeFlag) {
    banner.className = 'stale';
    banner.style.display = 'flex';
    const msg = document.createElement('span');
    msg.textContent =
      `⚠ ${opts.scopeFlag.taskId} (phase ${opts.scopeFlag.taskPhase}) just touched ` +
      `${opts.scopeFlag.file}, which already belongs to phase ` +
      `${opts.scopeFlag.conflictingPhases.join(', ')} — possible scope drift`;
    banner.appendChild(msg);
    return;
  }
  if (opts.staleUpdateAvailable) {
    banner.className = 'stale';
    banner.style.display = 'flex';
    const msg = document.createElement('span');
    msg.textContent = 'graph updated in the background — showing an older version';
    banner.appendChild(msg);
    const btn = document.createElement('button');
    btn.textContent = 'reload';
    btn.addEventListener('click', () => location.reload());
    banner.appendChild(btn);
    return;
  }
  if (fetchWarnings.length) {
    banner.className = 'error';
    banner.style.display = 'flex';
    const msg = document.createElement('span');
    msg.textContent = fetchWarnings.join(' · ');
    banner.appendChild(msg);
    return;
  }
  banner.style.display = 'none';
}

// Surfaces graph.drift (computed server-side by computeDrift in
// lib/graph-build.js) — the actual "unify the PRD graph and the code graph"
// output: where a PRD claim/tracked feature and the real code disagree.
// The section stays hidden on projects with no claim/feature nodes at all
// (nothing has been PRD-grilled here yet), since an empty drift list there
// would misleadingly read as "verified clean" rather than "not applicable".
// Surfaces graph.drift (computed server-side by computeDrift in
// lib/graph-build.js): a dedicated Gaps panel — kane-cli's own
// design-completeness/proven rollup plus its actionable pending[] gaps,
// each with a one-click Fix button — followed by the remaining
// task-tracker-specific drift categories (orphanFeatures, staleFeatureFiles,
// uncoveredCode) that have no kane-cli equivalent. The section stays hidden
// only when there's neither PRD/feature data nor any gaps data at all —
// a project with an active .context/ store but zero grilled use-cases yet
// should still see its (empty) Gaps panel appear.
// Shared by both /api/gaps/run call sites (the gap-fix button below and the
// reconcile-plan row action) — a 409 with requiresConfirm means the server
// refused a destructive-verb command pending human confirmation; show a
// native confirm dialog and resend with confirm:true only on acceptance.
async function runGapsCommand(cmd) {
  let res = await fetch('/api/gaps/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ready_command: cmd }),
  });
  if (res.status === 409) {
    const data = await res.json();
    if (!data.requiresConfirm) throw new Error(data.error || 'command failed');
    const proceed = window.confirm(`This command is destructive:\n\n${cmd}\n\nRun it anyway?`);
    if (!proceed) {
      const err = new Error('declined');
      err.declined = true;
      throw err;
    }
    res = await fetch('/api/gaps/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ready_command: cmd, confirm: true }),
    });
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'command failed');
  return data;
}

function renderDrift(graph) {
  const section = document.getElementById('section-drift');
  const body = document.getElementById('drift-body');
  const hasPrdData = (graph.nodes || []).some(n => n.type === 'claim' || n.type === 'feature');
  const drift = graph.drift || { orphanClaims: [], orphanFeatures: [], staleFeatureFiles: [], uncoveredCode: [], lowTrustClaims: [], gaps: [], coverage: null };
  if (!hasPrdData && !drift.gaps.length && !drift.coverage) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  const parts = [];

  if (drift.coverage) {
    const d = drift.coverage.design || {};
    const p = drift.coverage.proven || {};
    parts.push(
      `<div class="sub" style="margin-bottom:8px;">Design <b>${d.pct ?? '?'}%</b>${d.acs_designed ? ` (${d.acs_designed} ACs)` : ''} &middot; Proven <b>${p.pct ?? '?'}%</b>${p.acs_proven ? ` (${p.acs_proven} ACs)` : ''}</div>`
    );
  }

  if (drift.gaps.length) {
    const rows = drift.gaps.map(g => `
      <div class="gap-row">
        <div><b>${g.usecaseTitle || g.title || g.id}</b> <span class="sub">(${g.kind || g.tag || 'gap'})</span></div>
        <div class="sub" style="margin-top:2px;">${g.why || ''}</div>
        ${g.ready_command ? `<button class="gap-fix-btn" data-cmd="${g.ready_command.replace(/"/g, '&quot;')}">Fix: ${g.ready_command}</button>` : ''}
      </div>`).join('');
    parts.push(`<div><b>${drift.gaps.length}</b> pending gap(s)</div>${rows}`);
  } else if (drift.coverage) {
    parts.push(`<div class="sub" style="color:#1e8e5a; margin-top:4px;">no pending gaps — every use-case is fully designed and proven.</div>`);
  }

  const groups = [
    { label: 'PRD claims with no matching code', items: drift.orphanClaims.map(c => `${c.title || c.id}${typeof c.pct === 'number' ? ` — ${c.pct}% designed` : ''}`) },
    { label: 'tracked features never touched', items: drift.orphanFeatures.map(f => f.label || f.id) },
    { label: 'tracked files that no longer exist', items: drift.staleFeatureFiles.map(s => `${s.featureId} → ${s.file}`) },
    { label: 'code with no PRD claim or tracked feature', items: drift.uncoveredCode },
    { label: 'low-trust / stale PRD claims', items: drift.lowTrustClaims.map(c => `${c.title || c.id}${typeof c.pct === 'number' ? ` — ${c.pct}% proven` : (c.fresh === false ? ' (stale)' : '')}${typeof c.trust === 'number' ? ` — trust ${c.trust}` : ''}`) },
  ];
  const totalDrift = groups.reduce((sum, g) => sum + g.items.length, 0);

  if (totalDrift > 0) {
    let groupIdx = 0;
    parts.push(groups
      .filter(g => g.items.length)
      .map(g => {
        groupIdx++;
        const visible = g.items.slice(0, 8);
        const extra = g.items.slice(8);
        const visibleRows = visible.map(item => `<div class="sub" style="margin-top:2px; padding-left:8px;">&middot; ${item}</div>`).join('');
        let extraHtml = '';
        if (extra.length) {
          const extraId = `drift-extra-${groupIdx}`;
          const extraRows = extra.map(item => `<div class="sub" style="margin-top:2px; padding-left:8px;">&middot; ${item}</div>`).join('');
          extraHtml =
            `<div class="drift-extra-wrap" id="${extraId}" style="display:none;">${extraRows}</div>` +
            `<button class="drift-toggle-btn" data-target="${extraId}" data-count="${extra.length}">show ${extra.length} more</button>`;
        }
        return `<div style="margin-top:8px;"><b>${g.items.length}</b> ${g.label}</div>${visibleRows}${extraHtml}`;
      })
      .join(''));
  } else if (!drift.coverage) {
    parts.push(`<div class="sub" style="color:#1e8e5a;">no drift detected — PRD claims and tracked features line up with the current code graph.</div>`);
  }

  body.innerHTML = parts.join('');
  body.querySelectorAll('.drift-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrap = document.getElementById(btn.dataset.target);
      const isHidden = wrap.style.display === 'none';
      wrap.style.display = isHidden ? '' : 'none';
      btn.textContent = isHidden ? 'show fewer' : `show ${btn.dataset.count} more`;
    });
  });
  body.querySelectorAll('.gap-fix-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'running…';
      try {
        await runGapsCommand(btn.dataset.cmd);
        btn.textContent = 'done — refresh to see the update';
      } catch (err) {
        btn.disabled = false;
        btn.textContent = err.declined ? original : 'failed: ' + err.message;
      }
    });
  });
}

async function pollGraphStatus() {
  let status;
  try {
    status = await fetch('/api/graph-status').then(r => r.json());
  } catch {
    return; // status endpoint itself unreachable — leave banner as-is, don't flap it
  }
  if (status.ok === false) {
    lastKnownGraphError = status.error || 'unknown error';
    lastKnownStaleUpdate = false;
  } else if (status.ok && status.generatedAt && lastKnownGeneratedAt && status.generatedAt !== lastKnownGeneratedAt) {
    lastKnownGraphError = null;
    lastKnownStaleUpdate = true;
  } else {
    lastKnownGraphError = null;
    lastKnownStaleUpdate = false;
  }
  refreshGraphStatusBanner();
}

// Polled separately from graph-status (own file, own cadence) so a
// scope-drift flag written mid-edit by guardian-kane-post-tool-use-entry.js
// shows up within one poll tick instead of waiting on the next graph rebuild.
async function pollScopeStatus() {
  let status;
  try {
    status = await fetch('/api/scope-status').then(r => r.json());
  } catch {
    return;
  }
  lastKnownScopeFlag = status.flag || null;
  refreshGraphStatusBanner();
}

// Polled separately from scope-status (own file, own cadence) — mirrors
// pollScopeStatus exactly. A live two-task file collision outranks a
// scope-drift heads-up for the shared banner slot (see renderGraphStatusBanner).
async function pollLockStatus() {
  let status;
  try {
    status = await fetch('/api/lock-status').then(r => r.json());
  } catch {
    return;
  }
  lastKnownLockFlag = status.flag || null;
  refreshGraphStatusBanner();
}

async function pollStuckTasks() {
  let data;
  try {
    data = await fetch('/api/stuck-tasks').then(r => r.json());
  } catch {
    return;
  }
  const section = document.getElementById('section-stuck');
  const body = document.getElementById('stuck-body');
  const tasks = data.tasks || [];
  if (tasks.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  body.innerHTML = tasks.map(t => {
    const meta = `attempts ${t.attempts}/3` + (t.lastVerdict?.summary ? ` — ${escapeHtml(t.lastVerdict.summary)}` : '');
    const historyRows = t.history.length
      ? t.history.map(h => `<div class="stuck-history-row"><span class="ts">${new Date(h.ts).toLocaleTimeString()}</span> — ${escapeHtml(h.detail)}</div>`).join('')
      : '<div class="sub">(no history recorded)</div>';
    return `
      <div class="stuck-card">
        <div class="stuck-title">${escapeHtml(t.id)} — ${escapeHtml(t.title)}</div>
        <div class="stuck-meta">${meta}</div>
        <div class="stuck-history-title">History</div>
        <div class="stuck-history-list">${historyRows}</div>
      </div>`;
  }).join('');
}

async function loadReconcilePlan() {
  const body = document.getElementById('reconcile-body');
  let plan;
  try {
    plan = await fetch('/api/reconcile-plan').then(r => r.json());
  } catch (err) {
    body.innerHTML = `<div class="sub">failed to load: ${err.message}</div>`;
    return;
  }
  renderReconcilePlan(body, plan);
}

function renderReconcilePlan(body, plan) {
  if (!plan.rows || plan.rows.length === 0) {
    body.innerHTML = '<div class="sub">no sync has run yet</div>';
    return;
  }
  body.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'sub';
  header.textContent = `source: ${plan.sourceId} · ${plan.rows.length} row(s)`;
  body.appendChild(header);
  for (const row of plan.rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'reconcile-row';
    const title = document.createElement('div');
    title.textContent = `${row.kind} · ${row.ref}`;
    rowEl.appendChild(title);
    const reason = document.createElement('div');
    reason.className = 'reason';
    reason.textContent = row.reason;
    rowEl.appendChild(reason);
    if (row.runnable) {
      const btn = document.createElement('button');
      btn.className = 'reconcile-run-btn';
      btn.textContent = 'Run';
      btn.onclick = async () => {
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'running...';
        try {
          await runGapsCommand(row.action);
          btn.textContent = 'done';
        } catch (err) {
          btn.disabled = false;
          btn.textContent = err.declined ? original : 'failed: ' + err.message;
        }
      };
      rowEl.appendChild(btn);
    } else {
      const guidance = document.createElement('div');
      guidance.className = 'guidance';
      guidance.textContent = row.action;
      rowEl.appendChild(guidance);
    }
    body.appendChild(rowEl);
  }
}

// ---------- Kane activity feed (4th tab) ----------
// Polls /api/activity-feed (a live, newest-first read of kane-activity.log)
// on the same cadence as the other status polls — this is the dashboard's
// answer to "what is Kane actually doing," using the Stop hook's own
// append-only log rather than anything self-reported.
const kaneFeedWrap = document.getElementById('kane-feed');
const kaneFeedEmpty = document.getElementById('kane-feed-empty');
let lastKaneEvents = [];
let currentTabForKane = 'code';

function refreshKaneFeedVisibility() {
  if (currentTabForKane !== 'kane') {
    kaneFeedWrap.style.display = 'none';
    kaneFeedEmpty.style.display = 'none';
    return;
  }
  if (!lastKaneEvents.length) {
    kaneFeedWrap.style.display = 'none';
    kaneFeedEmpty.style.display = 'flex';
  } else {
    kaneFeedEmpty.style.display = 'none';
    kaneFeedWrap.style.display = 'block';
  }
}

function classifyKaneDetail(detail) {
  const d = (detail || '').toLowerCase();
  if (d.includes('blocked_needs_human')) return 'k-blocked';
  if (d.includes('failed')) return 'k-fail';
  if (d.includes('kane_verified') || d.includes('passed')) return 'k-ok';
  return '';
}

function renderKaneFeed(events) {
  lastKaneEvents = events;
  kaneFeedWrap.innerHTML = events.map(e => {
    const cls = classifyKaneDetail(e.detail);
    const ts = new Date(e.ts).toLocaleString();
    return `<div class="kane-event ${cls}"><span class="kts">${ts}</span><span class="ktask">${escapeHtml(e.taskId)}</span><span class="kdetail">${escapeHtml(e.detail)}</span></div>`;
  }).join('');
  refreshKaneFeedVisibility();
}

async function pollKaneFeed() {
  let data;
  try {
    data = await fetch('/api/activity-feed').then(r => r.json());
  } catch {
    return;
  }
  renderKaneFeed(data.events || []);
}

async function main() {
  fetchWarnings = [];
  const [graph, memory, quality] = await Promise.all([
    fetch('/api/graph').then(r => r.json()),
    fetch('/api/memory').then(r => r.json()).catch(err => {
      fetchWarnings.push(`memory graph unavailable: ${err.message}`);
      return { entries: {} };
    }),
    fetch('/api/quality').then(r => r.json()).catch(err => {
      fetchWarnings.push(`quality data unavailable: ${err.message}`);
      return { files: {} };
    }),
  ]);

  document.getElementById('target-path').textContent = graph.target || '(no graph.json found yet)';
  currentGraph = graph;
  lastKnownGeneratedAt = graph.generatedAt || null;
  renderGraphStatusBanner(null);
  setInterval(pollGraphStatus, 5000);
  pollGraphStatus();
  setInterval(pollScopeStatus, 5000);
  pollScopeStatus();
  setInterval(pollStuckTasks, 5000);
  pollStuckTasks();
  setInterval(pollLockStatus, 5000);
  pollLockStatus();
  setInterval(pollKaneFeed, 5000);
  pollKaneFeed();
  loadReconcilePlan();

  const byType = { code: 0, feature: 0, claim: 0, test: 0, external: 0 };
  for (const n of graph.nodes || []) byType[n.type] = (byType[n.type] || 0) + 1;
  const byEdgeType = {};
  for (const e of graph.edges || []) byEdgeType[e.type] = (byEdgeType[e.type] || 0) + 1;

  document.getElementById('counts').innerHTML = `
    <div><b>${graph.nodes.length}</b> nodes total</div>
    <div>&nbsp;&nbsp;${byType.code || 0} code · ${byType.test || 0} test · ${byType.feature || 0} feature · ${byType.claim || 0} claim · ${byType.external || 0} external</div>
    <div style="margin-top:8px;"><b>${graph.edges.length}</b> edges total</div>
    <div>&nbsp;&nbsp;${byEdgeType.imports || 0} imports · ${byEdgeType.tests || 0} tests · ${byEdgeType.touches || 0} touches · ${byEdgeType.calls || 0} calls · ${byEdgeType.about || 0} about · ${byEdgeType.external || 0} external</div>
    <div style="margin-top:8px; color:#8f8b7c;">generated ${graph.generatedAt || 'unknown'}</div>
  `;

  renderDrift(graph);

  const memoryStatusByFile = {};
  for (const entry of Object.values(memory.entries || {})) {
    for (const id of entry.nodeIds || []) memoryStatusByFile[id] = entry.status;
  }

  const testedFileIds = new Set(
    (graph.edges || []).filter(e => e.type === 'tests').map(e => e.to)
  );
  function qualityClass(node, qualityData) {
    if (node.type !== 'code' || !node.id.startsWith(QUALITY_SCOPE_PREFIX)) return '';
    if (!testedFileIds.has(node.id)) return 'quality-untested';
    const score = (qualityData.files || {})[node.id];
    if (!score) return ''; // has a test file but no mutation run yet — unknown, not "bad"
    return score.mutationScore >= QUALITY_STRONG_THRESHOLD ? 'quality-strong' : 'quality-weak';
  }

  const scopedCodeNodes = (graph.nodes || []).filter(n => n.type === 'code' && n.id.startsWith(QUALITY_SCOPE_PREFIX));
  function renderQualitySummary(qualityData) {
    let strongCount = 0, weakCount = 0, untestedCount = 0;
    for (const n of scopedCodeNodes) {
      const cls = qualityClass(n, qualityData);
      if (cls === 'quality-strong') strongCount++;
      else if (cls === 'quality-weak') weakCount++;
      else if (cls === 'quality-untested') untestedCount++;
    }
    const el = document.getElementById('quality-summary');
    el.innerHTML = `<b style="color:#16150f">${strongCount + weakCount}</b>/${scopedCodeNodes.length} tested (${strongCount} strong, ${weakCount} weak) · <b style="color:#d33f3f">${untestedCount}</b> untested`;
  }
  if (scopedCodeNodes.length > 0) {
    document.getElementById('section-mutation').style.display = '';
    document.getElementById('section-quality').style.display = '';
    renderQualitySummary(quality);
  }
  document.getElementById('section-review').style.display = '';
  document.getElementById('section-trace').style.display = '';

  const elements = [];
  for (const n of graph.nodes || []) {
    const status = memoryStatusByFile[n.id];
    elements.push({
      data: { id: n.id, label: n.type === 'code' ? n.id.split('/').pop() : (n.label || n.title || n.id), type: n.type, dir: n.dir || '', phases: n.phases || [] },
      classes: [n.type, status ? `status-${status}` : '', qualityClass(n, quality)].join(' ').trim(),
    });
  }
  const nodeIds = new Set((graph.nodes || []).map(n => n.id));
  for (const e of graph.edges || []) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue; // e.g. touches -> a directory, not a scanned file
    elements.push({
      data: { id: `${e.from}->${e.to}:${e.type}`, source: e.from, target: e.to, type: e.type, confidence: e.confidence },
      classes: [e.type, e.confidence].join(' '),
    });
  }

  addOrphanAnchors(elements);

  let zoom = 1;
  const BASE_SIZE = { code: 15, feature: 19, claim: 9, test: 13, external: 11 };
  const BASE_FONT = 8.5;

  const cy = cytoscape({
    container: document.getElementById('cy'),
    elements,
    minZoom: 0.08,
    maxZoom: 6,
    wheelSensitivity: 0.25,
    selectionType: 'single', // shift-click adds to selection, plain click replaces it — standard diagram-tool convention
    style: [
      { selector: 'node', style: {
          'label': 'data(label)',
          'font-family': 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          'font-size': ele => zoomInvariant(BASE_FONT, zoom, 0.88),
          'color': '#4a473c',
          'text-valign': 'bottom', 'text-margin-y': 4,
          // A hub node can have dozens of edges converging near/through the
          // space its label sits in — an opaque plate behind the text (matching
          // the page background) keeps it readable regardless of how many
          // lines cross behind it. z-index above edge:selected's 999 means a
          // selected edge can never draw over a label either.
          'text-background-color': '#f3f1ec', 'text-background-opacity': ele => (zoom >= LABEL_ZOOM_THRESHOLD || ele.hasClass('spotlight')) ? 0.92 : 0,
          'text-background-shape': 'roundrectangle', 'text-background-padding': 2,
          'z-index': 1000,
          'text-opacity': ele => (zoom >= LABEL_ZOOM_THRESHOLD || ele.hasClass('spotlight')) ? 1 : 0,
          'width': ele => zoomInvariant(BASE_SIZE[ele.data('type')] || 14, zoom, 0.62),
          'height': ele => zoomInvariant(BASE_SIZE[ele.data('type')] || 14, zoom, 0.62),
          'border-width': 0,
          'overlay-opacity': 0,
          'transition-property': 'opacity, background-color, border-width, border-color, overlay-opacity',
          'transition-duration': 180,
          'transition-timing-function': 'ease-out',
      }},
      { selector: 'node.code', style: { 'background-color': ele => dirColor(ele.data('dir')), 'shape': 'ellipse' } },
      { selector: 'node.test', style: { 'background-color': '#1e8e5a', 'shape': 'round-triangle' } },
      { selector: 'node.feature', style: { 'background-color': '#c9821a', 'shape': 'diamond' } },
      { selector: 'node.claim', style: { 'background-color': '#7c4ddb', 'shape': 'ellipse' } },
      { selector: 'node.external', style: { 'background-color': '#3d5a80', 'shape': 'rectangle' } },
      { selector: 'node.status-fixed', style: { 'border-width': ele => zoomInvariant(2.5, zoom, 0.62), 'border-color': '#1e8e5a' } },
      { selector: 'node.status-failing', style: { 'border-width': ele => zoomInvariant(2.5, zoom, 0.62), 'border-color': '#d33f3f' } },
      { selector: 'node.status-regressed', style: { 'border-width': ele => zoomInvariant(2.5, zoom, 0.62), 'border-color': '#b4790a' } },
      { selector: 'node.quality-strong', style: { 'border-width': ele => zoomInvariant(2.5, zoom, 0.62), 'border-color': '#1e8e5a', 'border-style': 'solid' } },
      { selector: 'node.quality-weak', style: { 'border-width': ele => zoomInvariant(2.5, zoom, 0.62), 'border-color': '#b4790a', 'border-style': 'solid' } },
      { selector: 'node.quality-untested', style: { 'border-width': ele => zoomInvariant(1.6, zoom, 0.62), 'border-color': 'rgba(211,63,63,0.6)', 'border-style': 'dashed', 'opacity': 0.72 } },
      { selector: 'node:selected', style: {
          'overlay-color': ACCENT, 'overlay-opacity': 0.28,
          'overlay-padding': ele => zoomInvariant(6, zoom, 0.62),
          'text-opacity': 1,
      }},
      { selector: 'node.spotlight', style: { 'text-opacity': 1 } },
      { selector: 'edge', style: {
          'width': ele => zoomInvariant(1.4, zoom, 0.5),
          'line-color': '#c2bda9', 'target-arrow-shape': 'none', 'curve-style': 'straight',
          'transition-property': 'opacity, line-color, width',
          'transition-duration': 180,
      }},
      { selector: 'edge.inferred', style: { 'line-style': 'dashed' } },
      // imports/calls are the bulk of the graph's edges (structural, not a
      // finding) — kept thin and pale so they read as texture rather than
      // drowning out the edges that actually carry a demo-worthy signal
      // (tests/touches/about/external), which stay bold and saturated.
      { selector: 'edge.imports', style: { 'line-color': 'rgba(150,145,125,0.28)', 'width': ele => zoomInvariant(0.9, zoom, 0.5) } },
      { selector: 'edge.calls', style: { 'line-color': 'rgba(150,145,125,0.28)', 'width': ele => zoomInvariant(0.9, zoom, 0.5) } },
      { selector: 'edge.touches', style: { 'line-color': 'rgba(201,130,26,0.65)', 'width': ele => zoomInvariant(1.8, zoom, 0.5) } },
      { selector: 'edge.about', style: { 'line-color': 'rgba(124,77,219,0.6)', 'width': ele => zoomInvariant(1.8, zoom, 0.5) } },
      { selector: 'edge.tests', style: { 'line-color': 'rgba(30,142,90,0.7)', 'width': ele => zoomInvariant(2, zoom, 0.5) } },
      { selector: 'edge.external', style: { 'line-color': 'rgba(61,90,128,0.55)', 'width': ele => zoomInvariant(1.8, zoom, 0.5) } },
      { selector: 'edge:selected', style: {
          'line-color': ACCENT,
          'width': ele => zoomInvariant(2.4, zoom, 0.5),
          'z-index': 999,
      }},
      { selector: '.faded', style: { 'opacity': 0.08 } },
      { selector: '.orphan-anchor', style: { 'opacity': 0, 'events': 'no' } },
    ],
    layout: {
      // Tuned for an Obsidian-style rounded cloud: a stronger, tighter
      // central gravity pulls the whole graph toward one shared center
      // instead of letting repulsion win and sprawl outward, and turning
      // off leaf/isolate tiling lets every node settle by physics alone
      // (grid-tiling isolated nodes is what produced the boxy, "placed
      // anywhere" look reported against the previous config).
      name: 'fcose', animate: false, quality: 'proof', randomize: true,
      nodeRepulsion: 65000, idealEdgeLength: 230, nodeSeparation: 220,
      edgeElasticity: 0.25, gravity: 0.6, gravityRange: 3.4,
      numIter: 8000, tile: false,
      packComponents: false,
    },
  });

  // cy.ready() (not layoutstop) — the constructor's non-animated fcose layout
  // can finish, and fire layoutstop, synchronously before a listener attached
  // after the constructor call would ever get registered. cy.ready() fires
  // immediately if the graph is already ready, so it can't be missed.
  cy.ready(() => {
    document.getElementById('cy').classList.add('ready');
  });

  function refreshZoomStyle() {
    zoom = cy.zoom();
    cy.style().update();
  }
  let rafPending = false;
  cy.on('zoom', () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { refreshZoomStyle(); rafPending = false; });
  });

  // Examining a node/edge is a persistent pin, not a hover: click locks the
  // spotlight so you can zoom/pan around it without losing the highlight;
  // hovering something else previews it temporarily, but mouseout falls back
  // to the pin (not to a fully-cleared graph) rather than fighting it.
  let pinnedKey = null;
  let pinnedEles = null;

  function showHighlight(keep) {
    cy.batch(() => {
      cy.elements().addClass('faded').removeClass('spotlight');
      keep.removeClass('faded').addClass('spotlight');
    });
  }
  function clearHighlight() {
    cy.batch(() => cy.elements().removeClass('faded').removeClass('spotlight'));
  }
  function refreshPinnedView() {
    if (pinnedEles) showHighlight(pinnedEles); else clearHighlight();
  }
  function pin(key, eles) {
    pinnedKey = key;
    pinnedEles = eles;
    showHighlight(eles);
  }
  function unpin() {
    pinnedKey = null;
    pinnedEles = null;
    clearHighlight();
  }
  function updateFocusLabel() {
    const box = document.getElementById('focus');
    if (!pinnedKey) { box.innerHTML = '<div class="sub">click a node or edge to examine its connections</div>'; return; }
    box.innerHTML = `<div class="sub">examining <b>${pinnedKey}</b> · click it again (or the canvas) to clear</div>`;
  }

  // Nodes preview on hover (cheap, single element, doesn't fight for
  // attention in a dense graph). Edges deliberately do NOT preview on
  // hover — a dense edge bundle made hover-highlight flicker distractingly
  // as the cursor merely passed nearby; edges only highlight on click (the
  // 'tap' handler below), a level of deliberateness that matches how much
  // more expensive it is to compute "what does this edge connect."
  cy.on('mouseover', 'node', evt => showHighlight(evt.target.closedNeighborhood()));
  cy.on('mouseout', 'node', refreshPinnedView);

  cy.on('tap', 'node', evt => {
    const node = evt.target;
    const key = 'node:' + node.id();
    if (pinnedKey === key) { unpin(); setTimeout(() => node.unselect(), 0); } else { pin(key, node.closedNeighborhood()); }
    updateFocusLabel();
  });
  cy.on('tap', 'edge:not(.orphan-anchor)', evt => {
    const edge = evt.target;
    const key = 'edge:' + edge.id();
    if (pinnedKey === key) { unpin(); setTimeout(() => edge.unselect(), 0); } else { pin(key, edge.connectedNodes().closedNeighborhood()); }
    updateFocusLabel();
  });
  cy.on('tap', evt => {
    if (evt.target === cy) { unpin(); updateFocusLabel(); }
  });
  updateFocusLabel();

  // Double-click a node to frame its neighborhood — makes the thing you're
  // zooming into fill the canvas, rather than just magnifying wherever the
  // viewport already happened to be pointed.
  cy.on('dbltap', 'node', evt => {
    const target = evt.target.closedNeighborhood();
    cy.animate({ fit: { eles: target, padding: 60 }, duration: 420, easing: 'ease-out-cubic' });
  });
  cy.on('dbltap', evt => {
    if (evt.target === cy) cy.animate({ fit: { eles: cy.elements(), padding: 40 }, duration: 420, easing: 'ease-out-cubic' });
  });

  function updateSelectionPanel() {
    const selected = cy.nodes(':selected');
    const box = document.getElementById('selection');
    if (selected.length === 0) {
      box.innerHTML = '<div class="sub">click a node to select it · shift-click for more · double-click to focus</div>';
    } else {
      const rows = selected.map(n => `<div class="sel-row"><span class="sel-dot type-${n.data('type')}"></span>${n.data('label')}</div>`).join('');
      box.innerHTML = `<div class="sub">${selected.length} selected</div>${rows}`;
    }
    const hint = document.getElementById('selection-hint');
    const text = describeSelection(selected.map(n => n.id()));
    hint.textContent = text;
    hint.classList.toggle('visible', !!text);
    document.getElementById('selection-actions').classList.toggle('visible', selected.length > 0);
  }
  let reviewRequestSeq = 0;
  async function updateReviewPanel() {
    const seq = ++reviewRequestSeq;
    const body = document.getElementById('review-body');
    const selected = cy.nodes(':selected');
    if (selected.length !== 1) {
      body.innerHTML = '<div class="sub">select a single verified task node to review it</div>';
      return;
    }
    const node = selected[0];
    const graphNode = currentGraph && currentGraph.nodes.find(n => n.id === node.id());
    if (!graphNode || graphNode.type !== 'feature' || graphNode.state !== 'KANE_VERIFIED') {
      body.innerHTML = '<div class="sub">select a verified task node to review it</div>';
      return;
    }
    body.innerHTML = '<div class="sub">loading review card…</div>';
    let card;
    try {
      const res = await fetch('/api/review-card?taskId=' + encodeURIComponent(node.id()));
      if (seq !== reviewRequestSeq) return;
      if (!res.ok) { body.innerHTML = '<div class="sub">failed: ' + (await res.json()).error + '</div>'; return; }
      card = await res.json();
    } catch (err) {
      if (seq !== reviewRequestSeq) return;
      body.innerHTML = '<div class="sub">failed: ' + err.message + '</div>';
      return;
    }
    // Starts collapsed to keep the sidebar tidy when nothing is selected —
    // pop it open now that there's an actual card to show, rather than
    // leaving the user to notice/expand a section that looked empty.
    document.getElementById('section-review').classList.remove('collapsed');
    renderReviewCard(body, card);
  }

  function renderReviewCard(body, card) {
    const parts = [`<div class="sub">${escapeHtml(card.title)}</div>`];
    if (card.verdictSummary) parts.push(`<div class="review-explain">${escapeHtml(card.verdictSummary)}</div>`);
    if (card.diff) parts.push(`<div class="review-diff">${escapeHtml(card.diff)}</div>`);
    if (!card.evidenceAvailable) {
      parts.push('<div class="sub">no evidence pack recorded for this task</div>');
    } else if (card.acs.length === 0) {
      parts.push('<div class="sub">this task has no per-AC evidence to review</div>');
    } else {
      for (const ac of card.acs) {
        const ackedLabel = ac.acked ? `acked ${new Date(ac.acked.ackedAt).toLocaleString()}` : 'acknowledge';
        const evidenceLink = ac.pack
          ? `<button class="review-ack-btn evidence-view-btn" data-task="${escapeHtml(card.taskId)}" data-pack="${encodeURIComponent(ac.pack)}">view evidence</button>`
          : '';
        parts.push(
          `<div class="review-ac-row ${ac.verified ? 'verified' : ''}">` +
          `<span>${escapeHtml(ac.ref)} — ${ac.verified ? 'verified' : 'NOT verified'}</span>` +
          `<div class="action-row" style="flex-direction:row; padding:0;">${evidenceLink}<button class="review-ack-btn" data-ac="${escapeHtml(ac.ref)}" data-task="${escapeHtml(card.taskId)}" ${ac.acked ? 'disabled' : ''}>${ackedLabel}</button></div>` +
          `</div>`
        );
      }
    }
    if (card.coverage) {
      parts.push(`<div class="review-explain">design ${card.coverage.design?.pct ?? '?'}% · proven ${card.coverage.proven?.pct ?? '?'}%</div>`);
    }
    if (card.explanations?.useCase?.length) {
      const lines = card.explanations.useCase.map(e => `[${escapeHtml(e.kind)}] ${escapeHtml(e.detail)}`).join('\n');
      parts.push(`<div class="review-explain">${lines}</div>`);
    }
    if (card.testFile) {
      parts.push(
        `<div class="action-row">` +
        `<button class="action-btn export-test-btn" data-lang="python" data-file="${escapeHtml(card.testFile)}">Export as Python</button>` +
        `<button class="action-btn export-test-btn" data-lang="javascript" data-file="${escapeHtml(card.testFile)}">Export as JavaScript</button>` +
        `</div>`
      );
    }
    body.innerHTML = parts.join('');
    body.querySelectorAll('.review-ack-btn:not(.evidence-view-btn)').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'acking…';
        try {
          const res = await fetch('/api/review-card/ack', {
            method: 'POST',
            body: JSON.stringify({ taskId: btn.dataset.task, acRef: btn.dataset.ac }),
          });
          if (!res.ok) throw new Error((await res.json()).error || 'ack failed');
          btn.textContent = 'acked just now';
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'failed: ' + err.message;
        }
      });
    });
    body.querySelectorAll('.evidence-view-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'loading…';
        try {
          const res = await fetch(`/api/evidence-view?taskId=${encodeURIComponent(btn.dataset.task)}&pack=${btn.dataset.pack}`);
          const data = await res.json();
          if (data.ok) {
            const json = JSON.stringify({ coverage: data.coverage, results: data.results }, null, 2).replace(/</g, '&lt;');
            openDetailModal(`<div class="modal-title">Evidence</div><div class="review-diff">${json}</div>`);
          } else {
            openDetailModal(`<div class="modal-title">Evidence unavailable</div><div class="sub">${escapeHtml(data.error)}</div>`);
          }
        } catch (err) {
          openDetailModal(`<div class="modal-title">Evidence load failed</div><div class="sub">${escapeHtml(err.message)}</div>`);
        } finally {
          btn.disabled = false;
          btn.textContent = original;
        }
      });
    });
    body.querySelectorAll('.export-test-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'exporting…';
        try {
          const res = await fetch('/api/export-test', {
            method: 'POST',
            body: JSON.stringify({ testFilePath: btn.dataset.file, language: btn.dataset.lang }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'export failed');
          btn.textContent = `exported to ${data.exportedTo}`;
        } catch (err) {
          btn.textContent = 'failed: ' + err.message;
          btn.disabled = false;
        }
      });
    });
  }

  let traceRequestSeq = 0;
  async function updateTracePanel() {
    const seq = ++traceRequestSeq;
    const body = document.getElementById('trace-body');
    const selected = cy.nodes(':selected');
    if (selected.length !== 1) {
      body.innerHTML = '<div class="sub">select a single task node to see its trace</div>';
      return;
    }
    const node = selected[0];
    const graphNode = currentGraph && currentGraph.nodes.find(n => n.id === node.id());
    if (!graphNode || graphNode.type !== 'feature') {
      body.innerHTML = '<div class="sub">select a task node to see its trace</div>';
      return;
    }
    body.innerHTML = '<div class="sub">loading trace…</div>';
    let trace;
    try {
      const res = await fetch('/api/trace?taskId=' + encodeURIComponent(node.id()));
      if (seq !== traceRequestSeq) return;
      if (!res.ok) { body.innerHTML = '<div class="sub">failed: ' + (await res.json()).error + '</div>'; return; }
      trace = await res.json();
    } catch (err) {
      if (seq !== traceRequestSeq) return;
      body.innerHTML = '<div class="sub">failed: ' + err.message + '</div>';
      return;
    }
    document.getElementById('section-trace').classList.remove('collapsed');
    renderTracePanel(body, trace);
  }

  function renderTracePanel(body, trace) {
    const sections = [
      ['Inspected', trace.inspected],
      ['Changed', trace.changed],
      ['Proved', trace.proved],
    ];
    const parts = [];
    for (const [label, events] of sections) {
      parts.push(`<div class="trace-bucket-title">${label}</div>`);
      if (!events || events.length === 0) {
        parts.push('<div class="sub">(none)</div>');
        continue;
      }
      for (const e of events) {
        parts.push(`<div class="trace-row"><span class="ts">${new Date(e.ts).toLocaleTimeString()}</span> — ${escapeHtml(e.detail)}</div>`);
      }
    }
    body.innerHTML = parts.join('');
  }

  cy.on('select unselect', updateSelectionPanel);
  cy.on('select unselect', updateReviewPanel);
  cy.on('select unselect', updateTracePanel);
  updateSelectionPanel();

  // Read by chat.js so "send to agent" can attach whatever's currently
  // selected, and the recommendation that selection produced, without the
  // chat panel needing its own reference into cy.
  window.getSelectedNodeIds = () => cy.nodes(':selected').map(n => n.id());
  // e2e-test-only hook — select nodes programmatically without needing
  // pixel-accurate canvas clicks against a nondeterministic force layout.
  window.__cyForTests = cy;
  window.getSelectionRecommendation = () => describeSelection(cy.nodes(':selected').map(n => n.id()));
  // Read by chat.js when a clickable node-id mention in a chat message is
  // clicked, so the mention can jump to + select that node on the graph.
  window.focusNodeById = (id) => {
    const node = cy.getElementById(id);
    if (node.empty()) return false;
    cy.elements().unselect();
    node.select();
    cy.animate({ fit: { eles: node.closedNeighborhood(), padding: 80 }, duration: 420, easing: 'ease-out-cubic' });
    return true;
  };
  window.allNodeIds = () => [...nodeIds];

  document.getElementById('search').addEventListener('input', e => {
    const term = e.target.value.toLowerCase();
    if (activeCy !== cy) return;
    cy.nodes().forEach(n => {
      const match = !term || n.data('label').toLowerCase().includes(term) || n.data('id').toLowerCase().includes(term);
      n.animate({ style: { opacity: match ? 1 : 0.06 } }, { duration: 150 });
    });
  });

  document.getElementById('fit-btn').addEventListener('click', () => {
    activeCy.animate({ fit: { eles: activeCy.elements(), padding: 40 }, duration: 420, easing: 'ease-out-cubic' });
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'f' && !e.metaKey && !e.ctrlKey && document.activeElement.id !== 'search' && document.activeElement.id !== 'chat-input') {
      activeCy.animate({ fit: { eles: activeCy.elements(), padding: 40 }, duration: 420, easing: 'ease-out-cubic' });
    }
  });

  // ---------- left-panel legend: isolate-mode filters ----------
  const NODE_TYPE_META = {
    code: { label: 'code', glyph: 'dot', color: '#2f6fe0' },
    test: { label: 'test', glyph: 'triangle', color: '#1e8e5a' },
    feature: { label: 'feature', glyph: 'diamond', color: '#c9821a' },
    claim: { label: 'claim', glyph: 'dot', color: '#7c4ddb' },
    external: { label: 'external', glyph: 'square', color: '#3d5a80' },
  };
  const EDGE_TYPE_META = {
    imports: { label: 'imports', color: '#8f8b7c' },
    tests: { label: 'tests', color: '#1e8e5a' },
    touches: { label: 'touches', color: '#c9821a' },
    calls: { label: 'calls', color: '#8f8b7c' },
    about: { label: 'about', color: '#7c4ddb' },
    external: { label: 'external call', color: '#3d5a80' },
  };
  const QUALITY_META = {
    'quality-strong': { label: 'strong', color: '#1e8e5a' },
    'quality-weak': { label: 'weak', color: '#b4790a' },
    'quality-untested': { label: 'untested', color: '#d33f3f' },
  };

  const isolatedNodeTypes = new Set();
  const isolatedEdgeTypes = new Set();
  const isolatedQuality = new Set();
  const isolatedPhases = new Set();

  function applyFilters() {
    cy.batch(() => {
      cy.nodes().forEach(n => {
        const typeOk = isolatedNodeTypes.size === 0 || isolatedNodeTypes.has(n.data('type'));
        const cls = qualityClass({ id: n.id(), type: n.data('type') }, quality);
        const qualityOk = isolatedQuality.size === 0 || (cls && isolatedQuality.has(cls));
        const nodePhases = n.data('phases') || [];
        const phaseOk = isolatedPhases.size === 0 || nodePhases.some(p => isolatedPhases.has(p));
        n.style('display', (typeOk && qualityOk && phaseOk) ? 'element' : 'none');
      });
      cy.edges().forEach(e => {
        const src = cy.getElementById(e.data('source'));
        const tgt = cy.getElementById(e.data('target'));
        const endsVisible = src.style('display') !== 'none' && tgt.style('display') !== 'none';
        const typeOk = isolatedEdgeTypes.size === 0 || isolatedEdgeTypes.has(e.data('type'));
        e.style('display', (endsVisible && typeOk) ? 'element' : 'none');
      });
    });
    if (isolatedQuality.size > 0 || isolatedNodeTypes.size > 0) {
      const visible = cy.nodes().filter(n => n.style('display') !== 'none');
      if (visible.length) cy.animate({ fit: { eles: visible, padding: 80 }, duration: 350, easing: 'ease-out-cubic' });
    }
  }

  function wireIsolateRow(row, set, key, refreshFn) {
    row.addEventListener('click', () => {
      if (set.has(key)) set.delete(key); else set.add(key);
      refreshFn();
      applyFilters();
    });
  }

  const legendNodes = document.getElementById('legend-nodes');
  function refreshNodeLegend() {
    legendNodes.querySelectorAll('.legend-row').forEach(row => {
      const type = row.dataset.type;
      row.classList.toggle('isolated', isolatedNodeTypes.has(type));
      row.classList.toggle('dimmed', isolatedNodeTypes.size > 0 && !isolatedNodeTypes.has(type));
    });
  }
  for (const [type, meta] of Object.entries(NODE_TYPE_META)) {
    if (!byType[type]) continue;
    const row = buildLegendRow(glyph(meta.glyph, meta.color), meta.label, byType[type], meta.color);
    row.dataset.type = type;
    wireIsolateRow(row, isolatedNodeTypes, type, refreshNodeLegend);
    legendNodes.appendChild(row);
  }

  const legendEdges = document.getElementById('legend-edges');
  function refreshEdgeLegend() {
    legendEdges.querySelectorAll('.legend-row').forEach(row => {
      const type = row.dataset.type;
      row.classList.toggle('isolated', isolatedEdgeTypes.has(type));
      row.classList.toggle('dimmed', isolatedEdgeTypes.size > 0 && !isolatedEdgeTypes.has(type));
    });
  }
  for (const [type, meta] of Object.entries(EDGE_TYPE_META)) {
    if (!byEdgeType[type]) continue;
    const row = buildLegendRow(glyph('line', meta.color), meta.label, byEdgeType[type], meta.color);
    row.dataset.type = type;
    wireIsolateRow(row, isolatedEdgeTypes, type, refreshEdgeLegend);
    legendEdges.appendChild(row);
  }

  const legendPhases = document.getElementById('legend-phases');
  const byPhase = {};
  for (const n of graph.nodes || []) {
    for (const p of n.phases || []) byPhase[p] = (byPhase[p] || 0) + 1;
  }
  function refreshPhaseLegend() {
    legendPhases.querySelectorAll('.legend-row').forEach(row => {
      const phase = row.dataset.phase;
      row.classList.toggle('isolated', isolatedPhases.has(phase));
      row.classList.toggle('dimmed', isolatedPhases.size > 0 && !isolatedPhases.has(phase));
    });
  }
  const phaseIds = Object.keys(byPhase).sort();
  if (phaseIds.length > 0) {
    document.getElementById('section-phases').style.display = '';
    for (const phaseId of phaseIds) {
      const row = buildLegendRow(glyph('dot', '#8f8b7c'), phaseId, byPhase[phaseId], '#8f8b7c');
      row.dataset.phase = phaseId;
      wireIsolateRow(row, isolatedPhases, phaseId, refreshPhaseLegend);
      legendPhases.appendChild(row);
    }
  }
  // imports/calls are pure structural noise at overview scale (186 of this
  // repo's 241 edges) — start with only the edges that carry an actual
  // finding (tests/touches/about/external) isolated on, so the first paint
  // reads as a legible signal graph rather than an import hairball. Node
  // *positions* still reflect every edge (the layout above ran on the full
  // element set); this only suppresses which lines are drawn. One click on
  // the "imports" row (same isolate mechanism as any other legend row)
  // brings the full dependency web back.
  for (const type of ['tests', 'touches', 'about', 'external']) {
    if (byEdgeType[type]) isolatedEdgeTypes.add(type);
  }
  refreshEdgeLegend();
  legendEdges.appendChild(Object.assign(document.createElement('div'), {
    className: 'legend-hint', textContent: 'imports/calls hidden by default — click a row to toggle',
  }));
  applyFilters();

  if (scopedCodeNodes.length > 0) {
    const legendQuality = document.getElementById('legend-quality');
    function refreshQualityLegend() {
      legendQuality.querySelectorAll('.legend-row').forEach(row => {
        const cls = row.dataset.type;
        row.classList.toggle('isolated', isolatedQuality.has(cls));
        row.classList.toggle('dimmed', isolatedQuality.size > 0 && !isolatedQuality.has(cls));
      });
    }
    for (const [cls, meta] of Object.entries(QUALITY_META)) {
      const dashed = cls === 'quality-untested';
      const row = buildLegendRow(glyph('ring', meta.color, dashed), meta.label, '', meta.color);
      row.dataset.type = cls;
      wireIsolateRow(row, isolatedQuality, cls, refreshQualityLegend);
      legendQuality.appendChild(row);
    }
    legendQuality.appendChild(Object.assign(document.createElement('div'), {
      className: 'legend-hint', textContent: 'click one or more to isolate',
    }));
  }

  document.getElementById('reset-filters').addEventListener('click', () => {
    isolatedNodeTypes.clear();
    isolatedEdgeTypes.clear();
    isolatedQuality.clear();
    isolatedPhases.clear();
    document.querySelectorAll('.legend-row').forEach(el => el.classList.remove('isolated', 'dimmed'));
    applyFilters();
    activeCy.animate({ fit: { eles: activeCy.elements(), padding: 40 }, duration: 350, easing: 'ease-out-cubic' });
  });

  // ---------- mutation scan button ----------
  const scanBtn = document.getElementById('run-mutation-btn');
  const scanStatus = document.getElementById('mutation-status');
  scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    scanStatus.textContent = 'running stryker mutation suite…';
    try {
      const res = await fetch('/api/quality/scan', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'scan failed');
      quality = data.quality;
      cy.batch(() => {
        for (const n of scopedCodeNodes) {
          const node = cy.getElementById(n.id);
          if (node.empty()) continue;
          node.removeClass('quality-strong quality-weak quality-untested');
          const cls = qualityClass(n, quality);
          if (cls) node.addClass(cls);
        }
      });
      renderQualitySummary(quality);
      applyFilters();
      scanStatus.textContent = `done — updated ${Object.keys(quality.files || {}).length} file score(s) at ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      scanStatus.textContent = 'failed: ' + err.message;
    } finally {
      scanBtn.disabled = false;
    }
  });

  // ---------- browser review button ----------
  const browserReviewBtn = document.getElementById('run-browser-review-btn');
  const browserReviewStatus = document.getElementById('browser-review-status');
  const browserReviewResult = document.getElementById('browser-review-result');
  const browserReviewWs = document.getElementById('browser-review-ws');
  browserReviewBtn.addEventListener('click', async () => {
    browserReviewBtn.disabled = true;
    browserReviewStatus.textContent = 'running browser review…';
    browserReviewResult.textContent = '';
    try {
      const res = await fetch('/api/browser-review', {
        method: 'POST',
        body: JSON.stringify({ wsEndpoint: browserReviewWs.value.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'browser review failed');
      browserReviewStatus.textContent = `done at ${new Date().toLocaleTimeString()}`;
      browserReviewResult.textContent = data.issueFound
        ? `issue found: ${data.reason || data.summary || '(no detail)'}`
        : `no issues found${data.summary ? ' — ' + data.summary : ''}`;
    } catch (err) {
      browserReviewStatus.textContent = 'failed: ' + err.message;
    } finally {
      browserReviewBtn.disabled = false;
    }
  });

  // ---------- quick generate button ----------
  const quickGenBtn = document.getElementById('run-quick-generate-btn');
  const quickGenStatus = document.getElementById('quick-generate-status');
  const quickGenObjective = document.getElementById('quick-generate-objective');
  quickGenBtn.addEventListener('click', async () => {
    const objective = quickGenObjective.value.trim();
    if (!objective) { quickGenStatus.textContent = 'enter an objective first'; return; }
    quickGenBtn.disabled = true;
    quickGenStatus.textContent = 'generating…';
    try {
      const res = await fetch('/api/quick-generate', { method: 'POST', body: JSON.stringify({ objective }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'generate failed');
      quickGenStatus.textContent = `saved ${data.caseCount} case(s) to ${data.savedTo}`;
    } catch (err) {
      quickGenStatus.textContent = 'failed: ' + err.message;
    } finally {
      quickGenBtn.disabled = false;
    }
  });

  // ---------- cheap explain (ask-tests-btn's first, zero-fresh-AI attempt) ----------
  function getSelectedExplainRef() {
    const selected = activeCy.nodes(':selected');
    if (selected.length !== 1) return null;
    const n = selected[0];
    if (activeCy === cyPrd) {
      const kind = n.data('kind');
      if (kind === 'usecase') return { kind: 'usecase', ref: n.data('slug') };
      if (kind === 'ac') return { kind: 'ac', ref: n.data('slug') };
      return null;
    }
    // Code graph: a claim node's cytoscape id IS the real use-case slug.
    if (n.data('type') === 'claim') return { kind: 'usecase', ref: n.id() };
    return null;
  }

  // ---------- selection action buttons -> inline chat section ----------
  document.getElementById('ask-tests-btn').addEventListener('click', async () => {
    const explainRef = getSelectedExplainRef();
    if (explainRef) {
      const box = document.getElementById('focus');
      box.innerHTML = '<div class="sub">loading explanation…</div>';
      try {
        const res = await fetch(`/api/explain?ref=${encodeURIComponent(explainRef.ref)}&kind=${explainRef.kind}`);
        const data = await res.json();
        if (data.ok) {
          const text = explainRef.kind === 'usecase'
            ? (data.data || []).map(e => `[${e.kind}] ${e.detail}`).join('\n')
            : data.data;
          box.innerHTML = `<div class="sub"><b>${explainRef.ref}</b></div><div class="review-explain">${String(text || '(no recorded reasoning)').replace(/</g, '&lt;')}</div>`;
          return;
        }
      } catch { /* fall through to chat push below */ }
    }
    const ids = window.getSelectedNodeIds();
    const label = ids.length === 1 ? ids[0] : `${ids.length} selected nodes`;
    window.openChat(`What test coverage exists for ${label}, and what's missing?`, true);
  });
  document.getElementById('generate-tests-btn').addEventListener('click', () => {
    const ids = window.getSelectedNodeIds();
    const label = ids.length === 1 ? ids[0] : `${ids.length} selected nodes`;
    window.openChat(`Generate test cases for ${label}, including edge cases and any missing external-dependency coverage.`, true);
  });

  // ================= Memory graph (second tab) =================
  const memEntries = Object.entries(memory.entries || {});
  const memWrap = document.getElementById('cy-mem');
  const memEmpty = document.getElementById('cy-mem-empty');
  let cyMem = null;
  let memBuilt = false;

  function statusColor(status) {
    if (status === 'fixed') return '#1e8e5a';
    if (status === 'failing') return '#d33f3f';
    if (status === 'regressed') return '#b4790a';
    return '#8f8b7c';
  }

  function buildMemoryGraph() {
    if (memBuilt) return;
    memBuilt = true;
    if (memEntries.length === 0) {
      memEmpty.style.display = 'flex';
      return;
    }
    const fileStatus = new Map();   // fileId -> latest status
    const fileRuns = new Map();     // fileId -> [{...run, sig}]
    const coEdges = new Map();      // "a|b" -> count
    for (const [sig, entry] of memEntries) {
      for (const id of entry.nodeIds || []) {
        fileStatus.set(id, entry.status);
        if (!fileRuns.has(id)) fileRuns.set(id, []);
        for (const run of entry.runs || []) fileRuns.get(id).push({ ...run, sig });
      }
      const ids = entry.nodeIds || [];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = [ids[i], ids[j]].sort().join('|');
          coEdges.set(key, (coEdges.get(key) || 0) + 1);
        }
      }
    }

    const memElements = [];
    for (const [id, status] of fileStatus.entries()) {
      const runs = (fileRuns.get(id) || []).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      memElements.push({
        data: { id, label: id.split('/').pop(), status, runCount: runs.length },
        classes: `mem-${status}`,
      });
    }
    for (const [key, weight] of coEdges.entries()) {
      const [a, b] = key.split('|');
      memElements.push({ data: { id: `mem:${key}`, source: a, target: b, weight } });
    }

    addOrphanAnchors(memElements);

    cyMem = cytoscape({
      container: memWrap,
      elements: memElements,
      minZoom: 0.1,
      maxZoom: 6,
      wheelSensitivity: 0.25,
      style: [
        { selector: 'node', style: {
            'label': 'data(label)',
            'font-family': 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            'font-size': 9.5, 'color': '#4a473c',
            'text-valign': 'bottom', 'text-margin-y': 4, 'text-opacity': 1,
            'text-background-color': '#f3f1ec', 'text-background-opacity': 0.92,
            'text-background-shape': 'roundrectangle', 'text-background-padding': 2,
            'z-index': 1000,
            'width': ele => 14 + Math.min(ele.data('runCount') || 1, 6) * 3,
            'height': ele => 14 + Math.min(ele.data('runCount') || 1, 6) * 3,
            'background-color': ele => statusColor(ele.data('status')),
            'border-width': 2, 'border-color': ele => statusColor(ele.data('status')),
            'shape': 'ellipse',
        }},
        { selector: 'node.mem-regressed', style: { 'border-style': 'dashed' } },
        { selector: 'node:selected', style: { 'overlay-color': ACCENT, 'overlay-opacity': 0.3, 'overlay-padding': 6 } },
        { selector: 'edge', style: {
            'width': ele => 1 + Math.min(ele.data('weight') || 1, 4),
            'line-color': '#c2bda9', 'curve-style': 'straight', 'line-style': 'dashed',
        }},
        { selector: '.orphan-anchor', style: { 'opacity': 0, 'events': 'no' } },
      ],
      layout: {
        name: 'fcose', animate: false, quality: 'proof', randomize: true,
        nodeRepulsion: 16000, idealEdgeLength: 130, nodeSeparation: 110,
        gravity: 0.6, gravityRange: 3.4, tile: false,
        packComponents: false,
      },
    });
    cyMem.ready(() => memWrap.classList.add('ready'));
    // e2e-test-only hook, mirrors window.__cyForTests for the code graph.
    window.__cyMemForTests = cyMem;

    cyMem.on('tap', 'node', evt => {
      const n = evt.target;
      const runs = (fileRuns.get(n.id()) || []).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const rows = runs.map(r => {
        const dt = new Date(r.timestamp).toLocaleString();
        const bug = r.bugTitle ? ` — ${r.bugTitle}` : '';
        const label = r.label ? ` [${r.label}]` : '';
        const detailBits = [];
        if (r.family) detailBits.push(`family: ${r.family}`);
        if (r.confidence !== undefined && r.confidence !== null) detailBits.push(`confidence: ${r.confidence}`);
        if (r.fixCommit) detailBits.push(`fix: ${r.fixCommit}`);
        const detail = detailBits.length ? `<div class="sub" style="margin-top:1px; opacity:0.75;">${detailBits.join(' · ')}</div>` : '';
        const rootCause = r.rootCause ? `<div class="sub" style="margin-top:1px; opacity:0.75;">${r.rootCause}</div>` : '';
        return `<div class="sub" style="margin-top:4px;"><b style="color:${r.status === 'pass' ? '#1e8e5a' : '#d33f3f'}">${r.status}</b>${label} · ${dt}${bug}</div>${rootCause}${detail}`;
      }).join('');
      openDetailModal(
        `<div class="modal-title">${escapeHtml(n.id())}</div>` +
        `<div class="modal-kind">${runs.length} run(s), currently ${escapeHtml(n.data('status'))}</div>${rows}`
      );
    });

    cyMem.on('tap', 'edge:not(.orphan-anchor)', evt => {
      const e = evt.target;
      openDetailModal(
        `<div class="modal-title">${escapeHtml(e.data('source'))} &harr; ${escapeHtml(e.data('target'))}</div>` +
        `<div class="sub">verified together in ${e.data('weight')} run(s) — same task's declared file set touched both.</div>`
      );
    });
  }

  // ================= PRD graph (third tab) =================
  const prdWrap = document.getElementById('cy-prd');
  const prdEmpty = document.getElementById('cy-prd-empty');
  let cyPrd = null;
  let prdBuilt = false;

  function prdNodeTitle(n) {
    // A gap-type node's title field is a live-confirmed literal
    // "[object Object]" from kane-cli's own JSON output — fall back to
    // its slug for a readable label.
    if (n.label === 'gap' || n.title === '[object Object]') return n.slug || n.cid;
    return n.title || n.slug || n.cid;
  }

  async function buildPrdGraph() {
    if (prdBuilt) return;
    prdBuilt = true;
    let data;
    try {
      const res = await fetch('/api/prd-graph');
      data = await res.json();
    } catch (err) {
      prdEmpty.textContent = 'failed to load PRD graph: ' + err.message;
      prdEmpty.style.display = 'flex';
      return;
    }
    if (!data.ok || !(data.view?.nodes || []).length) {
      prdEmpty.textContent = data.ok === false ? ('PRD graph unavailable: ' + data.error) : 'no PRD context recorded yet';
      prdEmpty.style.display = 'flex';
      return;
    }
    const view = data.view;
    const elements = [];
    for (const n of view.nodes) {
      elements.push({ data: { id: n.cid, label: prdNodeTitle(n), kind: n.label, slug: n.slug }, classes: `prd-${n.label}` });
    }
    for (const e of view.edges || []) {
      elements.push({ data: { id: `prd:${e.src}->${e.dst}:${e.type}`, source: e.src, target: e.dst, kind: e.type } });
    }
    addOrphanAnchors(elements);

    // kane-cli's own n.x/n.y are laid out for its own standalone renderer at
    // a different scale/spacing than this canvas — reusing them verbatim
    // (the previous 'preset' layout) packed nodes on top of each other with
    // no collision avoidance. Running fcose here instead, same as the code
    // and memory graphs, gives real spacing; zoom-invariant sizing plus
    // text-wrap (both absent before) keep labels legible instead of
    // overlapping single-line text at low zoom.
    let zoomPrd = 1;
    const BASE_FONT_PRD = 9.5;
    const BASE_SIZE_PRD = 16;
    cyPrd = cytoscape({
      container: prdWrap,
      elements,
      minZoom: 0.1,
      maxZoom: 6,
      wheelSensitivity: 0.25,
      style: [
        { selector: 'node', style: {
            'label': 'data(label)',
            'font-family': 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            'font-size': ele => zoomInvariant(BASE_FONT_PRD, zoomPrd, 0.88),
            'color': '#4a473c',
            'text-valign': 'bottom', 'text-margin-y': 4,
            'text-wrap': 'wrap', 'text-max-width': '90px',
            'text-background-color': '#f3f1ec', 'text-background-opacity': ele => (zoomPrd >= LABEL_ZOOM_THRESHOLD || ele.hasClass('spotlight')) ? 0.92 : 0,
            'text-background-shape': 'roundrectangle', 'text-background-padding': 2,
            'z-index': 1000,
            'text-opacity': ele => (zoomPrd >= LABEL_ZOOM_THRESHOLD || ele.hasClass('spotlight')) ? 1 : 0,
            'width': ele => zoomInvariant(BASE_SIZE_PRD, zoomPrd, 0.62),
            'height': ele => zoomInvariant(BASE_SIZE_PRD, zoomPrd, 0.62),
            'background-color': '#7c4ddb', 'shape': 'ellipse',
        }},
        { selector: 'node.prd-usecase', style: { 'background-color': '#c9821a', 'shape': 'diamond' } },
        { selector: 'node.prd-ac', style: { 'background-color': '#7c4ddb', 'shape': 'ellipse' } },
        { selector: 'node.prd-gap', style: { 'background-color': '#d33f3f', 'shape': 'triangle' } },
        { selector: 'node.prd-source', style: { 'background-color': '#3d5a80', 'shape': 'square' } },
        { selector: 'node:selected', style: { 'overlay-color': ACCENT, 'overlay-opacity': 0.3, 'overlay-padding': 6 } },
        { selector: 'edge', style: {
            'width': ele => zoomInvariant(1.4, zoomPrd, 0.5), 'line-color': '#c2bda9', 'curve-style': 'straight',
            'target-arrow-shape': 'triangle', 'target-arrow-color': '#c2bda9', 'arrow-scale': 0.7,
        }},
        { selector: '.orphan-anchor', style: { 'opacity': 0, 'events': 'no' } },
      ],
      layout: {
        name: 'fcose', animate: false, quality: 'proof', randomize: true,
        nodeRepulsion: 24000, idealEdgeLength: 170, nodeSeparation: 140,
        edgeElasticity: 0.25, gravity: 0.6, gravityRange: 3.4,
        numIter: 6000, tile: false,
        packComponents: false,
      },
    });
    cyPrd.ready(() => prdWrap.classList.add('ready'));
    window.__cyPrdForTests = cyPrd;

    let rafPendingPrd = false;
    cyPrd.on('zoom', () => {
      if (rafPendingPrd) return;
      rafPendingPrd = true;
      requestAnimationFrame(() => { zoomPrd = cyPrd.zoom(); cyPrd.style().update(); rafPendingPrd = false; });
    });

    cyPrd.on('tap', 'node', evt => {
      const n = evt.target;
      openDetailModal(
        `<div class="modal-title">${escapeHtml(n.data('label'))}</div>` +
        `<div class="modal-kind">${escapeHtml(n.data('kind'))}${n.data('slug') ? ' · ' + escapeHtml(n.data('slug')) : ''}</div>`
      );
    });
    cyPrd.on('tap', 'edge:not(.orphan-anchor)', evt => {
      const e = evt.target;
      openDetailModal(
        `<div class="modal-title">${escapeHtml(e.source().data('label'))} &rarr; ${escapeHtml(e.target().data('label'))}</div>` +
        `<div class="modal-kind">${escapeHtml(e.data('kind'))}</div>`
      );
    });

    if (currentTab === 'prd') { activeCy = cyPrd; setTimeout(() => cyPrd.resize(), 0); }
  }

  // ---------- tab switching ----------
  let currentTab = 'code';
  let activeCy = cy;
  document.getElementById('tab-code').addEventListener('click', () => switchTab('code'));
  document.getElementById('tab-memory').addEventListener('click', () => switchTab('memory'));
  document.getElementById('tab-prd').addEventListener('click', () => switchTab('prd'));
  document.getElementById('tab-kane').addEventListener('click', () => switchTab('kane'));
  function switchTab(name) {
    currentTab = name;
    currentTabForKane = name;
    document.getElementById('tab-code').classList.toggle('active', name === 'code');
    document.getElementById('tab-memory').classList.toggle('active', name === 'memory');
    document.getElementById('tab-prd').classList.toggle('active', name === 'prd');
    document.getElementById('tab-kane').classList.toggle('active', name === 'kane');
    document.getElementById('cy').style.display = name === 'code' ? '' : 'none';
    memWrap.style.display = name === 'memory' ? 'block' : 'none';
    prdWrap.style.display = name === 'prd' ? 'block' : 'none';
    document.getElementById('hint').style.display = name === 'kane' ? 'none' : '';
    document.getElementById('fit-btn').style.display = name === 'kane' ? 'none' : '';
    applySidebarScope(name);
    refreshKaneFeedVisibility();
    if (name === 'memory') {
      buildMemoryGraph();
      activeCy = cyMem || cy;
      if (cyMem) setTimeout(() => cyMem.resize(), 0);
    } else if (name === 'prd') {
      buildPrdGraph();
      activeCy = cyPrd || cy;
      if (cyPrd) setTimeout(() => cyPrd.resize(), 0);
    } else if (name === 'kane') {
      // no cytoscape instance for this tab — activeCy stays whatever it was
    } else {
      activeCy = cy;
      cy.resize();
    }
  }
  applySidebarScope('code');
}

main().catch(err => {
  document.getElementById('counts').textContent = 'failed to load graph: ' + err.message;
  console.error(err);
  renderGraphStatusBanner({ ok: false, error: err.message });
  setInterval(pollGraphStatus, 5000);
});
