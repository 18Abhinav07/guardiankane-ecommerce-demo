import { findOpenClaimOnFile } from '../../lib/tracker.js';

export function recordFileTouch(tasks, filePath) {
  const active = tasks.find(t => t.state === 'IN_PROGRESS');
  if (!active) return;
  if (!active.files.includes(filePath)) active.files.push(filePath);
  if (!active.file_touches) active.file_touches = {};
  active.file_touches[filePath] = new Date().toISOString();
}

// Flags the active task's first touch of a file that a graph rebuild has
// already attributed (via `touches` or an `about` edge to a claim) to a
// phase other than the task's own. Compares against whatever graph.json
// last had on disk — this hook must stay synchronous/fast, so it never
// triggers or waits on a rebuild itself (see guardian-kane-post-tool-use-
// entry.js's existing fire-and-forget triggerGraphRefresh).
//
// alreadyTouchedByTask exists specifically so a file legitimately shared
// across phases (Phase 2 allows this — no forced single-owner constraint)
// only flags once, on the task's first touch, not on every subsequent
// edit — otherwise a shared file would re-flag on every keystroke and
// train the human to ignore the banner.
export function detectScopeDrift(activeTask, normalizedFilePath, graph, { alreadyTouchedByTask } = {}) {
  if (!activeTask || !activeTask.phase || !graph) return null;
  if (alreadyTouchedByTask) return null;

  const node = (graph.nodes || []).find(
    n => (n.type === 'code' || n.type === 'test') && n.id === normalizedFilePath
  );
  if (!node) return null;

  const claimPhases = (graph.edges || [])
    .filter(e => e.type === 'about' && e.to === normalizedFilePath)
    .flatMap(e => {
      const claim = (graph.nodes || []).find(n => n.type === 'claim' && n.id === e.from);
      return claim ? claim.phases || [] : [];
    });

  // Membership, not "anything left after removing my own phase" — a file
  // already co-owned by the active task's own phase (Phase 2's explicit
  // multi-phase allowance: a shared file can legitimately belong to more
  // than one phase) is not drift just because some other phase also owns
  // it. Only an active task whose own phase is entirely absent from the
  // file's known phase set is actually touching something unexpected.
  const allPhases = new Set([...(node.phases || []), ...claimPhases]);
  if (allPhases.size === 0) return null;
  if (allPhases.has(activeTask.phase)) return null;

  return {
    taskId: activeTask.id,
    taskPhase: activeTask.phase,
    file: normalizedFilePath,
    conflictingPhases: [...allPhases],
  };
}

// Warn-only (see docs/superpowers/specs/2026-08-28-phase-10-file-lock-
// design.md's "Deliberate scope call") — this is a post-hoc flag, not a
// pre-edit block, since no PreToolUse hook exists in this codebase.
export function detectFileLock(tasks, filePath, activeTaskId) {
  if (!activeTaskId) return null;
  const lockedBy = findOpenClaimOnFile(tasks, filePath, activeTaskId);
  if (!lockedBy) return null;
  return {
    taskId: activeTaskId,
    file: filePath,
    lockedBy: { id: lockedBy.id, title: lockedBy.title, state: lockedBy.state },
  };
}
