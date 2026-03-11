import fs from 'node:fs';
import path from 'node:path';

const extensionDir = path.resolve(import.meta.dirname);
const manifestPath = path.join(extensionDir, 'manifest.json');
const frontendEnvPath = path.resolve(extensionDir, '../frontend/.env');
const shouldSkipKey = process.argv.includes('--no-key');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    env[key] = value;
  }

  return env;
}

const fileEnv = parseEnvFile(frontendEnvPath);
const mergedEnv = { ...process.env, ...fileEnv };

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const extensionKey = mergedEnv.EXTENSION_KEY;
if (!shouldSkipKey && extensionKey) {
  manifest.key = extensionKey;
} else {
  delete manifest.key;
}

const oauthClientId = mergedEnv.EXTENSION_OAUTH_CLIENT_ID;
if (oauthClientId) {
  manifest.oauth2 = manifest.oauth2 ?? {};
  manifest.oauth2.client_id = oauthClientId;
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(
  shouldSkipKey
    ? 'Synced extension manifest from environment variables (key omitted).'
    : 'Synced extension manifest from environment variables.'
);
