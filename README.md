# TaskFocused
An app to help keep you focused on what's important.

# Setup Instructions

Steps to get this running on your machine:
- git clone
- git pull
- from frontend, npm install
- from backend, npm install

To connect the backend server, make a `frontend/.env` file and set `VITE_BACKEND_URL=http://localhost:8000` for local development.

You can also define extension auth env vars in `frontend/.env`:
- `EXTENSION_KEY` for a stable extension ID across teammates
- `EXTENSION_OAUTH_CLIENT_ID` to inject `oauth2.client_id` at build time

- from the backend, `run npm run dev`
- from the frontend, `run npm run build`

Open up chrome://extensions and turn on developer mode. Select load unpacked, and select the extensions directory. Keep in mind that since extension/dist is what is being loaded, and it is built from the frontend React code. This means that when changing the frontend, to see changes you must run npm run build and reload the extension.

Keep backend server on to see changes to backend.

# Stable Extension ID

Add your shared extension key to `frontend/.env`:

```env
EXTENSION_KEY=<your-extension-public-key>
```

During `npm run build`, `extension/manifest.json` is automatically synced from env values.

For a commit-safe build that omits `manifest.key`, run:

```bash
cd frontend
npm run build:ci
```

# GitHub Safety Check

This repo includes a GitHub Action at `.github/workflows/block-extension-keys.yml` that fails pushes/PRs if:
- `extension/manifest.json` contains a committed `key` field