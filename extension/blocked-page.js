// Read the blocked site context from the query string added by background.js.
const params = new URLSearchParams(location.search);
const blockedUrl = params.get('url') || '';
const blockedHostname = params.get('hostname') || params.get('site') || 'this site';

document.getElementById('blocked-hostname').textContent = blockedHostname;
document.title = `Blocked: ${blockedHostname} – TaskFocused`;

// Show the original URL when it adds more detail than the hostname alone.
const urlEl = document.getElementById('blocked-url');
if (blockedUrl && blockedUrl !== blockedHostname) {
  urlEl.textContent = blockedUrl;
} else {
  urlEl.style.display = 'none';
}

// The back button uses browser history instead of hardcoding a destination.
document.getElementById('back-btn').addEventListener('click', () => history.back());

// Cache the main UI nodes used by the chat flow.
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');

// Keep local chat history so every request includes prior turns.
const conversationHistory = [];

async function loadSystemPrompt() {
  try {
    const url = chrome.runtime.getURL('system-prompt.md');
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load system prompt (${res.status})`);
    }
    return await res.text();
  } catch (error) {
    console.warn('Falling back to built-in system prompt:', error);
    return `You are TaskFocused AI, a productivity gatekeeper for a browser extension that blocks distracting websites.

The user is requesting temporary access to a blocked website. Decide whether their reason is task-critical and time-bounded.

Be direct and concise (1–3 sentences). If you approve, end your response with the exact token on its own line:
ALLOW_ACCESS`;
  }
}

const SITE_CONTEXT_PROMPT = `\n\nBlocked site context:\n- Hostname: "${blockedHostname}"\n- URL: "${blockedUrl || blockedHostname}"\n`;

// Keep the most recent message visible inside the chat log.
function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Render one chat bubble and optionally attach the temporary allow button.
function appendMessage(role, text, allowThrough = false) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;

  const avatar = document.createElement('div');
  avatar.className = `avatar ${role}`;
  avatar.textContent = role === 'ai' ? 'AI' : 'You';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  // Only AI approvals get the button that grants temporary access.
  if (allowThrough) {
    const btn = document.createElement('button');
    btn.className = 'allow-btn';
    btn.textContent = `Visit ${blockedHostname}`;
    btn.addEventListener('click', () => void grantAccessAndNavigate(btn));
    bubble.appendChild(document.createElement('br'));
    bubble.appendChild(btn);
  }

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  scrollToBottom();
}

// Show a temporary typing indicator while the backend request is running.
function showTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg ai typing';
  wrap.id = 'typing-indicator';

  const avatar = document.createElement('div');
  avatar.className = 'avatar ai';
  avatar.textContent = 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  scrollToBottom();
}

// Remove the typing indicator once a request finishes.
function removeTyping() {
  document.getElementById('typing-indicator')?.remove();
}

// Ask the background worker for a temporary allow, then continue to the site.
async function grantAccessAndNavigate(btn) {
  btn.disabled = true;
  btn.textContent = 'Allowing…';

  try {
    await chrome.runtime.sendMessage({
      type: 'ALLOW_TEMPORARILY',
      hostname: blockedHostname,
    });
  } catch {
    // If the background worker is unavailable, still try the navigation.
  }

  const target =
    blockedUrl || (blockedHostname.includes('://') ? blockedHostname : `https://${blockedHostname}`);
  location.href = target;
}

const BACKEND_URL = 'http://localhost:8000';

// Send the current transcript to the backend AI endpoint.
async function callLLM(history) {
  const { authToken } = await chrome.storage.local.get('authToken');
  if (!authToken) {
    throw new Error('Not signed in. Sign in via the extension popup first.');
  }

  const system = `${await loadSystemPrompt()}${SITE_CONTEXT_PROMPT}`;

  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ system, messages: history }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message ?? `Request failed (${res.status})`);
  }

  return data.content;
}

// Read the current textbox value, send it, and render the response.
async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;

  appendMessage('user', text);
  conversationHistory.push({ role: 'user', content: text });

  showTyping();

  let reply;
  try {
    reply = await callLLM(conversationHistory);
  } catch {
    removeTyping();
    appendMessage('ai', 'Something went wrong reaching the AI. Try again.');
    sendBtn.disabled = false;
    return;
  }

  removeTyping();

  // The model appends ALLOW_ACCESS when the visit should be approved.
  const allowAccess = reply.includes('ALLOW_ACCESS');
  const cleanReply = reply.replace('ALLOW_ACCESS', '').trim();

  conversationHistory.push({ role: 'assistant', content: cleanReply });
  appendMessage('ai', cleanReply, allowAccess);

  sendBtn.disabled = false;
  inputEl.focus();
}

// Click-to-send wiring.
sendBtn.addEventListener('click', () => void sendMessage());

// Enter submits, while Shift+Enter stays available for a newline.
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void sendMessage();
  }
});

// Grow the textarea with content up to a reasonable max height.
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});

// Seed the conversation with the initial prompt shown to the user.
appendMessage(
  'ai',
  `You're trying to visit ${blockedHostname}, which is on your blocked list. What's your reason for needing access right now?`
);

inputEl.focus();
