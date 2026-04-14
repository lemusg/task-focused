const params = new URLSearchParams(window.location.search);
const blockedUrl = params.get('url') || 'Unknown URL';
const hostname = params.get('hostname') || 'unknown host';
const source = params.get('source') || 'unknown source';

const blockedUrlEl = document.getElementById('blocked-url');
const blockedMetaEl = document.getElementById('blocked-meta');

if (blockedUrlEl) {
  blockedUrlEl.textContent = blockedUrl;
}

if (blockedMetaEl) {
  blockedMetaEl.textContent = `Blocked host: ${hostname} • Source: ${source}`;
}