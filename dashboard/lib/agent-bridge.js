import net from 'node:net';

// Pushes a nudge into the Claude Code session that spawned this dashboard
// process. Verified working 2026-08-26 by direct spike against a live
// session (see docs/superpowers/specs/2026-08-26-agent-loop-and-test-intelligence-design.md
// §4.1) — this exact wire protocol was reverse-engineered from strings
// embedded in the `claude` CLI binary itself; it is not documented anywhere
// public. The dashboard server must be launched as a child of the target
// session so it inherits CLAUDE_CODE_MESSAGING_SOCKET / _TOKEN.
export function notifyAgent(text) {
  const sockPath = process.env.CLAUDE_CODE_MESSAGING_SOCKET;
  const token = process.env.CLAUDE_CODE_MESSAGING_TOKEN;
  if (!sockPath) return Promise.reject(new Error('CLAUDE_CODE_MESSAGING_SOCKET not set — dashboard was not launched as a child of a Claude Code session'));

  return new Promise((resolve, reject) => {
    const client = net.createConnection(sockPath, () => {
      client.write(JSON.stringify({ type: 'auth', token }) + '\n');
      client.write(JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n');
      setTimeout(() => client.end(), 100);
    });
    client.on('error', reject);
    client.on('close', resolve);
  });
}
