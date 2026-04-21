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
const orgPolicyLineEl = document.getElementById('org-policy-line');

// Keep local chat history so every request includes prior turns.
const conversationHistory = [];

const ORG_ID_KEY = 'organizationId';
const ORG_IS_ADMIN_KEY = 'organizationIsAdmin';
const ALLOW_DURATION_MINUTES_KEY = 'allowDurationMinutes';
const ORG_ALLOW_DURATION_MINUTES_KEY = 'organizationAllowDurationMinutes';

/** Dropdown options for personal (non-org) temporary allow; used for UI and chat parsing. */
const PERSONAL_DURATION_OPTIONS = [5, 10, 15, 30, 60];

const LLM_MAX_REQUESTS = 3;
const LLM_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const LLM_REQUEST_COUNT_KEY = 'llmRequestCount';
const LLM_COOLDOWN_UNTIL_KEY = 'llmCooldownUntil';

// Persist the blocked-page chat for a short window so refreshes don't erase context.
const LLM_CHAT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const LLM_CHAT_STATES_KEY = 'llmChatStates';
const LLM_SESSION_UPDATED_AT_KEY = 'llmSessionUpdatedAt';
const LLM_EXPIRY_POLL_MS = 15 * 1000; // 15s

function canonicalizeSiteKey(hostname) {
  return String(hostname ?? '').trim().toLowerCase();
}

async function clearLlmSessionState({ clearAllChats } = { clearAllChats: false }) {
  const updates = {
    [LLM_REQUEST_COUNT_KEY]: 0,
    [LLM_COOLDOWN_UNTIL_KEY]: 0,
    [LLM_SESSION_UPDATED_AT_KEY]: 0,
  };

  if (clearAllChats) {
    updates[LLM_CHAT_STATES_KEY] = {};
  } else {
    const siteKey = canonicalizeSiteKey(blockedHostname);
    const data = await chrome.storage.local.get([LLM_CHAT_STATES_KEY]);
    const states = data[LLM_CHAT_STATES_KEY] && typeof data[LLM_CHAT_STATES_KEY] === 'object'
      ? data[LLM_CHAT_STATES_KEY]
      : {};
    if (states && typeof states === 'object') {
      delete states[siteKey];
      updates[LLM_CHAT_STATES_KEY] = states;
    }
  }

  await chrome.storage.local.set(updates);
}

async function saveChatState() {
  const now = Date.now();
  const siteKey = canonicalizeSiteKey(blockedHostname);
  const data = await chrome.storage.local.get([LLM_CHAT_STATES_KEY]);
  const states =
    data[LLM_CHAT_STATES_KEY] && typeof data[LLM_CHAT_STATES_KEY] === 'object'
      ? data[LLM_CHAT_STATES_KEY]
      : {};

  states[siteKey] = {
    updatedAt: now,
    turns: conversationHistory.slice(),
  };

  await chrome.storage.local.set({
    [LLM_CHAT_STATES_KEY]: states,
    [LLM_SESSION_UPDATED_AT_KEY]: now,
  });
}

async function pruneExpiredChatStates() {
  const data = await chrome.storage.local.get([LLM_CHAT_STATES_KEY]);
  const states =
    data[LLM_CHAT_STATES_KEY] && typeof data[LLM_CHAT_STATES_KEY] === 'object'
      ? data[LLM_CHAT_STATES_KEY]
      : {};

  const now = Date.now();
  let didChange = false;
  for (const [key, value] of Object.entries(states)) {
    const updatedAt = typeof value?.updatedAt === 'number' ? value.updatedAt : 0;
    if (!updatedAt || now - updatedAt > LLM_CHAT_TTL_MS) {
      delete states[key];
      didChange = true;
    }
  }

  if (didChange) {
    await chrome.storage.local.set({ [LLM_CHAT_STATES_KEY]: states });
  }
}

async function loadChatStateIfFresh() {
  const siteKey = canonicalizeSiteKey(blockedHostname);
  const data = await chrome.storage.local.get([LLM_CHAT_STATES_KEY]);
  const states =
    data[LLM_CHAT_STATES_KEY] && typeof data[LLM_CHAT_STATES_KEY] === 'object'
      ? data[LLM_CHAT_STATES_KEY]
      : {};

  const state = states?.[siteKey];
  if (!state || typeof state !== 'object') {
    return null;
  }

  const updatedAt = typeof state.updatedAt === 'number' ? state.updatedAt : 0;
  const turns = Array.isArray(state.turns) ? state.turns : null;
  if (!updatedAt || !turns) {
    return null;
  }

  if (Date.now() - updatedAt > LLM_CHAT_TTL_MS) {
    // Expired for this site: clear this site's chat and reset attempts.
    await clearLlmSessionState({ clearAllChats: false });
    return null;
  }

  return { updatedAt, turns };
}

async function expireSessionIfNeeded() {
  const data = await chrome.storage.local.get([LLM_SESSION_UPDATED_AT_KEY]);
  const updatedAt = typeof data[LLM_SESSION_UPDATED_AT_KEY] === 'number' ? data[LLM_SESSION_UPDATED_AT_KEY] : 0;
  if (!updatedAt) {
    return false;
  }

  if (Date.now() - updatedAt > LLM_CHAT_TTL_MS) {
    await clearLlmSessionState({ clearAllChats: true });
    return true;
  }

  return false;
}

async function resetUiToFreshSession() {
  messagesEl.innerHTML = '';
  conversationHistory.length = 0;
  const initialAiMessage = `You're trying to visit ${blockedHostname}, which is on your blocked list. What's your reason for needing access right now?`;
  await appendMessage('ai', initialAiMessage);
  conversationHistory.push({ role: 'assistant', content: initialAiMessage });
  void saveChatState();
}

function formatCooldown(msRemaining) {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

async function getLlmLimitState() {
  const data = await chrome.storage.local.get([LLM_REQUEST_COUNT_KEY, LLM_COOLDOWN_UNTIL_KEY]);
  const count = typeof data[LLM_REQUEST_COUNT_KEY] === 'number' ? data[LLM_REQUEST_COUNT_KEY] : 0;
  const cooldownUntil =
    typeof data[LLM_COOLDOWN_UNTIL_KEY] === 'number' ? data[LLM_COOLDOWN_UNTIL_KEY] : 0;
  return { count, cooldownUntil };
}

async function setLlmLimitState(next) {
  await chrome.storage.local.set(next);
}

async function enforceLlmCooldownUi() {
  // If the overall session TTL elapsed, clear and reset attempts even if user didn't use all attempts.
  const didExpire = await expireSessionIfNeeded();
  if (didExpire) {
    void resetUiToFreshSession();
  }

  const { count, cooldownUntil } = await getLlmLimitState();
  const now = Date.now();
  const remaining = cooldownUntil > now ? cooldownUntil - now : 0;

  if (remaining > 0) {
    inputEl.disabled = true;
    sendBtn.disabled = true;
    inputEl.placeholder = `Cooldown active. Try again in ${formatCooldown(remaining)}…`;
    return true;
  }

  // Cooldown ended: reset back to 3 fresh attempts.
  if (cooldownUntil && cooldownUntil <= now) {
    await setLlmLimitState({ [LLM_REQUEST_COUNT_KEY]: 0, [LLM_COOLDOWN_UNTIL_KEY]: 0 });
  }

  // Not in cooldown.
  inputEl.disabled = false;
  sendBtn.disabled = false;
  const refreshed = cooldownUntil && cooldownUntil <= now ? 0 : count;
  const attemptsLeft = Math.max(0, LLM_MAX_REQUESTS - refreshed);
  inputEl.placeholder =
    attemptsLeft <= 1
      ? 'Explain why you need to visit this site… (last attempt)'
      : `Explain why you need to visit this site… (${attemptsLeft} attempts left)`;
  return false;
}

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
async function appendMessage(role, text, allowThrough = false) {
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
    const row = document.createElement('div');
    row.className = 'allow-row';

    const btn = document.createElement('button');
    btn.className = 'allow-btn';
    btn.textContent = `Visit ${blockedHostname}`;

    // Only org admins and users without an org can choose a custom duration.
    await hydrateAllowControls(row, btn);

    btn.addEventListener('click', () => void grantAccessAndNavigate(btn));
    row.appendChild(btn);
    bubble.appendChild(row);
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

async function canCustomizeAllowDuration() {
  try {
    const data = await chrome.storage.local.get([ORG_ID_KEY, ORG_IS_ADMIN_KEY]);
    const orgId = typeof data[ORG_ID_KEY] === 'string' ? data[ORG_ID_KEY] : '';
    const isAdmin = Boolean(data[ORG_IS_ADMIN_KEY]);
    // Only users without an org can choose a per-visit duration.
    // Org admins define the org duration in the popup; members inherit it.
    return !orgId;
  } catch {
    return false;
  }
}

async function getOrgAllowDurationMinutes() {
  const data = await chrome.storage.local.get([ORG_ALLOW_DURATION_MINUTES_KEY]);
  const value = data[ORG_ALLOW_DURATION_MINUTES_KEY];
  return typeof value === 'number' && Number.isFinite(value) ? value : 5;
}

async function hydrateOrgPolicyLine() {
  if (!orgPolicyLineEl) return;

  try {
    const data = await chrome.storage.local.get([ORG_ID_KEY]);
    const orgId = typeof data[ORG_ID_KEY] === 'string' ? data[ORG_ID_KEY] : '';
    if (!orgId) {
      orgPolicyLineEl.style.display = 'none';
      return;
    }

    const minutes = await getOrgAllowDurationMinutes();
    orgPolicyLineEl.textContent = `Org policy: temporary access is ${minutes} minutes.`;
    orgPolicyLineEl.style.display = '';
  } catch {
    orgPolicyLineEl.style.display = 'none';
  }
}

async function getSavedAllowDurationMinutes() {
  const data = await chrome.storage.local.get([ALLOW_DURATION_MINUTES_KEY]);
  const value = data[ALLOW_DURATION_MINUTES_KEY];
  return typeof value === 'number' && Number.isFinite(value) ? value : 5;
}

/** Last explicit duration mention in `text` that matches a dropdown option (5/10/15/30/60). */
function parsePersonalDurationMinutes(text) {
  if (!text) return null;
  const s = String(text);
  const explicit = [...s.matchAll(/\b(\d+)\s*(?:minute|minutes|min|mins)\b/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => PERSONAL_DURATION_OPTIONS.includes(n));
  if (explicit.length) return explicit[explicit.length - 1];
  const short = [...s.matchAll(/\b(?:for|in|about|around)\s+(\d+)\b/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => PERSONAL_DURATION_OPTIONS.includes(n));
  if (short.length) return short[short.length - 1];
  return null;
}

async function isPersonalPolicyUser() {
  const data = await chrome.storage.local.get([ORG_ID_KEY]);
  const orgId = typeof data[ORG_ID_KEY] === 'string' ? data[ORG_ID_KEY] : '';
  return !orgId;
}

/** Persist preference and sync every personal allow-row dropdown + button label. */
async function applyPersonalDurationFromChat(text) {
  if (!(await isPersonalPolicyUser())) return;
  const minutes = parsePersonalDurationMinutes(text);
  if (minutes == null) return;
  await chrome.storage.local.set({ [ALLOW_DURATION_MINUTES_KEY]: minutes });
  syncPersonalDurationDropdowns(minutes);
}

function syncPersonalDurationDropdowns(minutes) {
  if (!PERSONAL_DURATION_OPTIONS.includes(minutes)) return;
  document.querySelectorAll('.allow-row').forEach((row) => {
    const select = row.querySelector('.duration-select');
    const btn = row.querySelector('.allow-btn');
    if (!select || !btn) return;
    if (![...select.options].some((o) => o.value === String(minutes))) return;
    select.value = String(minutes);
    btn.dataset.durationMinutes = String(minutes);
    btn.textContent = `Visit ${blockedHostname} (${minutes} min)`;
  });
}

async function hydrateAllowControls(row, btn) {
  // If the user is in an org, always use the org-wide duration (no selector).
  const orgData = await chrome.storage.local.get([ORG_ID_KEY]);
  const orgId = typeof orgData[ORG_ID_KEY] === 'string' ? orgData[ORG_ID_KEY] : '';
  if (orgId) {
    const minutes = await getOrgAllowDurationMinutes();
    btn.dataset.durationMinutes = String(minutes);
    btn.textContent = `Visit ${blockedHostname} (${minutes} min)`;
    return;
  }

  if (!(await canCustomizeAllowDuration())) {
    btn.dataset.durationMinutes = '5';
    return;
  }

  const select = document.createElement('select');
  select.className = 'duration-select';
  const options = PERSONAL_DURATION_OPTIONS;
  for (const minutes of options) {
    const opt = document.createElement('option');
    opt.value = String(minutes);
    opt.textContent = `Allow for ${minutes} min`;
    select.appendChild(opt);
  }

  const saved = await getSavedAllowDurationMinutes();
  if (options.includes(saved)) {
    select.value = String(saved);
  }

  btn.dataset.durationMinutes = select.value;
  btn.textContent = `Visit ${blockedHostname} (${select.value} min)`;
  select.addEventListener('change', () => {
    btn.dataset.durationMinutes = select.value;
    btn.textContent = `Visit ${blockedHostname} (${select.value} min)`;
    void chrome.storage.local.set({ [ALLOW_DURATION_MINUTES_KEY]: Number(select.value) });
  });

  row.appendChild(select);
}

// Ask the background worker for a temporary allow, then continue to the site.
async function grantAccessAndNavigate(btn) {
  btn.disabled = true;
  btn.textContent = 'Allowing…';

  const minutes = Number(btn.dataset.durationMinutes ?? '5');
  const durationMs = Number.isFinite(minutes) ? minutes * 60 * 1000 : undefined;

  try {
    await chrome.runtime.sendMessage({
      type: 'ALLOW_TEMPORARILY',
      hostname: blockedHostname,
      ...(typeof durationMs === 'number' ? { durationMs } : {}),
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

  const orgData = await chrome.storage.local.get([ORG_ID_KEY]);
  const orgId = typeof orgData[ORG_ID_KEY] === 'string' ? orgData[ORG_ID_KEY] : '';
  const isOrgUser = Boolean(orgId);

  const personalDurationOptions = PERSONAL_DURATION_OPTIONS;
  const orgAllowDurationMinutes = isOrgUser ? await getOrgAllowDurationMinutes() : null;

  // Tell the model which attempt this is (1..3) and whether it's the final attempt.
  // Count tracks successful responses so far; the next request is count+1.
  const state = await getLlmLimitState();
  const attemptNumber = Math.min(LLM_MAX_REQUESTS, Math.max(1, (state.count ?? 0) + 1));
  const isFinalAttempt = attemptNumber >= LLM_MAX_REQUESTS;
  const attemptContext = `\n\nAttempt context:\n- attempt: ${attemptNumber}/${LLM_MAX_REQUESTS}\n- final_attempt: ${isFinalAttempt ? 'yes' : 'no'}\n`;

  const accessTimeContext = isOrgUser
    ? `\n\nTemporary access time policy:\n- policy: organization\n- allow_duration_minutes: ${orgAllowDurationMinutes}\n- instruction: Do NOT ask the user how long they need; the duration is fixed by the organization.\n`
    : `\n\nTemporary access time policy:\n- policy: personal\n- allowed_options_minutes: ${personalDurationOptions.join(', ')}\n- instruction: If you need a time-box, ask the user to pick ONE of the allowed options.\n`;

  const system = `${await loadSystemPrompt()}${SITE_CONTEXT_PROMPT}${accessTimeContext}${attemptContext}`;

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
  if (await enforceLlmCooldownUi()) {
    const { cooldownUntil } = await getLlmLimitState();
    const remaining = Math.max(0, cooldownUntil - Date.now());
    void appendMessage(
      'ai',
      `You’ve hit the limit of ${LLM_MAX_REQUESTS} requests. Please wait ${formatCooldown(
        remaining
      )} before trying again.`
    );
    return;
  }

  const text = inputEl.value.trim();
  if (!text) return;

  // Enforce the "3 chances" rule across all blocked sites (persisted in storage).
  // IMPORTANT: attempts are only consumed after the AI successfully responds.
  const stateBeforeCall = await getLlmLimitState();
  if (stateBeforeCall.count >= LLM_MAX_REQUESTS) {
    const remaining = Math.max(0, stateBeforeCall.cooldownUntil - Date.now());
    void appendMessage(
      'ai',
      `You’ve hit the limit of ${LLM_MAX_REQUESTS} requests. Please wait ${formatCooldown(
        remaining
      )} before trying again.`
    );
    await enforceLlmCooldownUi();
    return;
  }

  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;

  await appendMessage('user', text);
  await applyPersonalDurationFromChat(text);
  conversationHistory.push({ role: 'user', content: text });
  await saveChatState();

  showTyping();

  let reply;
  try {
    reply = await callLLM(conversationHistory);
  } catch {
    removeTyping();
    void appendMessage('ai', 'Something went wrong reaching the AI. Try again.');
    sendBtn.disabled = false;
    // Do not consume an attempt if the AI request failed.
    await enforceLlmCooldownUi();
    return;
  }

  removeTyping();

  // Consume one attempt only after a successful AI response.
  const stateAfterCall = await getLlmLimitState();
  const nextCount = Math.min(LLM_MAX_REQUESTS, (stateAfterCall.count ?? 0) + 1);
  const updates = { [LLM_REQUEST_COUNT_KEY]: nextCount };
  if (nextCount >= LLM_MAX_REQUESTS) {
    updates[LLM_COOLDOWN_UNTIL_KEY] = Date.now() + LLM_COOLDOWN_MS;
  }
  await setLlmLimitState(updates);
  await enforceLlmCooldownUi();

  // The model appends ALLOW_ACCESS when the visit should be approved.
  const allowAccess = reply.includes('ALLOW_ACCESS');
  const cleanReply = reply.replace('ALLOW_ACCESS', '').trim();

  conversationHistory.push({ role: 'assistant', content: cleanReply });
  await appendMessage('ai', cleanReply, allowAccess);
  await applyPersonalDurationFromChat(cleanReply);
  await saveChatState();

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

// Restore chat if it's still within the TTL; otherwise start fresh.
void (async () => {
  await pruneExpiredChatStates();
  if (await expireSessionIfNeeded()) {
    await resetUiToFreshSession();
    return;
  }

  const restored = await loadChatStateIfFresh();
  if (restored?.turns?.length) {
    // Replay prior turns into the UI + in-memory history.
    for (const turn of restored.turns) {
      const role = turn?.role === 'assistant' ? 'ai' : 'user';
      const content = typeof turn?.content === 'string' ? turn.content : '';
      if (!content) continue;
      conversationHistory.push({ role: turn.role, content });
      // Only show the allow button when the text contains approval token (historical)
      const allowThrough = role === 'ai' && content.includes('ALLOW_ACCESS');
      const display = content.replace('ALLOW_ACCESS', '').trim();
      await appendMessage(role, display, allowThrough);
      await applyPersonalDurationFromChat(display);
    }
    return;
  }

  await resetUiToFreshSession();
})();

void enforceLlmCooldownUi();
void hydrateOrgPolicyLine();
inputEl.focus();

// Keep expiring/resetting even if the tab stays open.
setInterval(() => {
  void enforceLlmCooldownUi();
}, LLM_EXPIRY_POLL_MS);
