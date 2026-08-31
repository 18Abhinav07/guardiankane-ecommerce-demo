import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

// Closes the loop opened by dashboard/server.js's /api/chat/send: when a
// dashboard-chat message gets pushed into the live Claude Code session via
// notifyAgent, the dashboard chat panel has no way to know the agent ever
// saw it unless something posts back to /api/chat/reply. Without this, a
// new project's dashboard looks broken — messages go in, nothing comes
// back — because nothing in the agent's own workflow is required to reply.
// This makes the reply happen from the Stop hook itself, which runs on
// every turn regardless of what the agent did or remembered to do.
const PENDING_PATH = path.join('.testmuai', 'chat-pending.json');
const INFO_PATH = path.join('.testmuai', 'dashboard-info.json');
const DEFAULT_PORT = 4173;

export function consumeDashboardPending() {
  if (!fs.existsSync(PENDING_PATH)) return false;
  try {
    fs.rmSync(PENDING_PATH, { force: true });
  } catch {
    // best-effort — a failed cleanup shouldn't block the reply itself
  }
  return true;
}

function readDashboardPort() {
  try {
    const info = JSON.parse(fs.readFileSync(INFO_PATH, 'utf8'));
    if (Number.isFinite(info.port)) return info.port;
  } catch {
    // dashboard-info.json missing/unreadable — fall back to the default port
  }
  return DEFAULT_PORT;
}

// Fire-and-forget from the caller's point of view (never throws, never
// rejects) — a dashboard that isn't running, or a stale port, must never
// break the Stop hook's actual gating decision.
export function postDashboardReply(text) {
  const port = readDashboardPort();
  const body = JSON.stringify({ text });
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path: '/api/chat/reply',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 2000,
      },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}
