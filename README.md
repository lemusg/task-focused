# TaskFocused
An app to help keep you focused on what's important.

# Setup Instructions

## Prerequisites
- Node.js (v18+ recommended)
- npm
- MongoDB (local or remote)

## Backend Setup

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Configure environment variables:**
   - Copy `.env.example` to `.env` and update the values as needed.
   - Example:
     ```env
     MONGODB_URI=mongodb://localhost:27017/task-focused
     ```

3. **Start MongoDB:**
   - Make sure your MongoDB server is running locally or update the URI for a remote server.

4. **Seed the database (optional):**
   - To populate the database with sample users:
     ```bash
     npm run seed
     ```

5. **Run the development server:**
   ```bash
   cd backend
   npm run dev
   ```

## Frontend Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Configure environment variables:**
   - Create a `frontend/.env` file and add:
     ```env
     VITE_BACKEND_URL=http://localhost:8000
     ```
   - Optional extension auth env vars:
     - `EXTENSION_KEY` for a stable extension ID across teammates
     - `EXTENSION_OAUTH_CLIENT_ID` to inject `oauth2.client_id` at build time

3. **Build the frontend:**
   ```bash
   cd frontend
   npm run build
   ```

## Extension Setup

1. Open `chrome://extensions` and turn on developer mode
2. Select "Load unpacked" and select the `extension` directory
3. Note: The extension is built from the frontend React code, so `extension/dist` is what is being loaded
   - When changing the frontend, run `npm run build` and reload the extension to see changes
   - Keep the backend server running to see changes to backend API

## Important Notes

- Make sure to keep your `.env` file private and never commit it to version control.
- For production, update the `MONGODB_URI` to point to your production database.
- Since `extension/dist` is what is loaded, changes to the frontend require running `npm run build` and reloading the extension.

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