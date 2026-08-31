import fs from 'node:fs';
import { load, dump } from 'js-yaml';

const FENCE_START = '```yaml\n';
const FENCE_END = '\n```';
const HEADER = '# GuardianKane Task Tracker\n\n';

// Backward compatible with pre-Phase-2 trackers, whose YAML body is a bare
// top-level array of tasks with no `phases` key at all.
export function readTracker(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const start = raw.indexOf(FENCE_START) + FENCE_START.length;
  const end = raw.indexOf(FENCE_END, start);
  const yamlBody = raw.slice(start, end);
  const parsed = load(yamlBody) || [];
  if (Array.isArray(parsed)) return { tasks: parsed, phases: [] };
  return { tasks: parsed.tasks || [], phases: parsed.phases || [] };
}

export function writeTracker(filePath, { tasks, phases }) {
  const yamlBody = dump({ tasks, phases: phases || [] }, { lineWidth: 100 });
  const content = HEADER + FENCE_START + yamlBody + FENCE_END + '\n';
  fs.writeFileSync(filePath, content, 'utf8');
}

export function findTask(tasks, id) {
  return tasks.find(t => t.id === id);
}

const TERMINAL_STATES = new Set(['KANE_VERIFIED', 'BLOCKED_NEEDS_HUMAN']);

export function activeTask(tasks) {
  return tasks.find(t => !TERMINAL_STATES.has(t.state));
}

export function nextPlannedTask(tasks) {
  const verifiedIds = new Set(tasks.filter(t => t.state === 'KANE_VERIFIED').map(t => t.id));
  return tasks.find(t =>
    t.state === 'PLANNED' &&
    (t.depends_on || []).every(dep => verifiedIds.has(dep))
  );
}

export function getPhases(tracker) {
  return tracker.phases || [];
}

export function tasksInPhase(tracker, phaseId) {
  return (tracker.tasks || []).filter(t => t.phase === phaseId);
}

export function isPhaseComplete(tracker, phaseId) {
  const tasks = tasksInPhase(tracker, phaseId);
  return tasks.length > 0 && tasks.every(t => t.state === 'KANE_VERIFIED');
}

// Distinct from TERMINAL_STATES above: that set answers "is there workflow
// left to do," this answers "does this task still hold a claim on its
// files" — a BLOCKED_NEEDS_HUMAN task is workflow-terminal but still owns
// whatever it touched, so it stays in-flight for lock purposes.
const NOT_IN_FLIGHT = new Set(['PLANNED', 'KANE_VERIFIED']);

export function findOpenClaimOnFile(tasks, filePath, excludeTaskId) {
  return tasks.find(t =>
    t.id !== excludeTaskId &&
    !NOT_IN_FLIGHT.has(t.state) &&
    (t.files || []).includes(filePath)
  );
}
