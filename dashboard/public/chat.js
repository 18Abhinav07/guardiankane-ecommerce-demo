const POLL_MS = 1500;

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let seenLogLength = null; // null until the first poll establishes a baseline
let lastRenderedLength = -1; // skip re-rendering the log DOM when nothing changed (fixes scrollbar flicker on poll)

const QUICK_PROMPTS = [
  'What tests are missing here?',
  'Explain the risk if this breaks',
  'Suggest an integration test',
];

const quickPromptsBox = document.getElementById('quick-prompts');
for (const prompt of QUICK_PROMPTS) {
  const btn = document.createElement('button');
  btn.className = 'quick-prompt-btn';
  btn.textContent = prompt;
  btn.addEventListener('click', () => {
    document.getElementById('chat-input').value = prompt;
    document.getElementById('chat-input').focus();
  });
  quickPromptsBox.appendChild(btn);
}

// Called by graph.js's "Ask about tests" / "Generate tests" buttons: scrolls
// the always-visible chat section into view, expands it if collapsed,
// optionally drops prefilled text in the input, optionally sends immediately
// (Generate tests skips the extra "now press send" step).
window.openChat = (prefillText, autoSend) => {
  const section = document.getElementById('chat-section');
  section.classList.remove('collapsed');
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (prefillText) {
    document.getElementById('chat-input').value = prefillText;
    if (autoSend) sendMessage();
    else document.getElementById('chat-input').focus();
  }
};

// Makes any word in a chat message that matches a real graph node id
// clickable — clicking it jumps to + selects that node on the code graph.
function linkifyNodeMentions(text) {
  const ids = typeof window.allNodeIds === 'function' ? window.allNodeIds() : [];
  if (ids.length === 0) return escapeHtml(text);
  let out = escapeHtml(text);
  for (const id of ids) {
    const esc = escapeHtml(id);
    if (!out.includes(esc)) continue;
    out = out.split(esc).join(`<span class="chat-node-tag" data-node-id="${esc}">${esc}</span>`);
  }
  return out;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function renderLog(log) {
  const box = document.getElementById('chat-log');
  const wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
  box.innerHTML = log.map(entry => {
    const isAgent = entry.role === 'agent';
    const nodeTags = entry.nodeIds && entry.nodeIds.length
      ? `<div class="chat-node-tags">${entry.nodeIds.map(id => `<span class="chat-node-tag" data-node-id="${escapeHtml(id)}">${escapeHtml(id)}</span>`).join('')}</div>`
      : '';
    const recoLine = entry.recommendation
      ? `<span class="chat-reco">${escapeHtml(entry.recommendation)}</span>`
      : '';
    const time = formatTime(entry.ts);
    return `<div class="chat-msg-row role-${entry.role}">
      <div class="chat-avatar ${isAgent ? 'agent' : 'user'}">${isAgent ? 'GK' : 'Yo'}</div>
      <div class="chat-bubble">
        ${nodeTags}${recoLine}<span class="chat-text">${linkifyNodeMentions(entry.text)}</span>
        ${time ? `<span class="chat-time">${time}</span>` : ''}
      </div>
    </div>`;
  }).join('');
  if (wasAtBottom) box.scrollTop = box.scrollHeight;
  box.querySelectorAll('.chat-node-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      if (typeof window.focusNodeById === 'function') window.focusNodeById(tag.dataset.nodeId);
    });
  });
}

async function pollLog() {
  try {
    const log = await fetch('/api/chat/log').then(r => r.json());
    if (log.length !== lastRenderedLength) {
      renderLog(log);
      lastRenderedLength = log.length;
    }
    if (seenLogLength !== null && log.length > seenLogLength && log[log.length - 1]?.role === 'agent') {
      document.getElementById('chat-status').textContent = 'agent replied';
      document.getElementById('chat-status').classList.remove('pending');
    }
    seenLogLength = log.length;
  } catch {
    // transient — next poll will retry
  }
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const status = document.getElementById('chat-status');
  const text = input.value.trim();
  if (!text) return;

  const nodeIds = typeof window.getSelectedNodeIds === 'function' ? window.getSelectedNodeIds() : [];
  const recommendation = typeof window.getSelectionRecommendation === 'function' ? window.getSelectionRecommendation() : '';
  sendBtn.disabled = true;
  status.textContent = 'sending to agent…';
  status.classList.add('pending');
  try {
    const res = await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, nodeIds, recommendation }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    renderLog(body.log);
    lastRenderedLength = body.log.length;
    seenLogLength = body.log.length;
    input.value = '';
    status.textContent = 'delivered — waiting for a reply';
  } catch (err) {
    status.textContent = 'failed: ' + err.message;
    status.classList.remove('pending');
  } finally {
    sendBtn.disabled = false;
  }
}

document.getElementById('chat-send').addEventListener('click', sendMessage);
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

pollLog();
setInterval(pollLog, POLL_MS);
