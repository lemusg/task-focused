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
   - ZAI_API_KEY is the API key for the ZAI API. You can get one by signing up for a free account at https://www.zai.com/.

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
   - Copy `.env.example` to `.env` and update the values as needed.
   - Example:
     ```env
     VITE_BACKEND_URL=http://localhost:8000
     EXTENSION_KEY=
     EXTENSION_OAUTH_CLIENT_ID=
     ```
   - For EXTENSION_KEY, you can generate a new one by looking up an RSA private key generator online.
   - Make sure to set this value before building the frontend.

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

## Back to the Front

1. In Chrome, you should see and ID underneath the extension name. This is the extension ID.
2. Go to https://console.cloud.google.com and create a new project.
3. Return to the project dashboard, and select "APIs and Services", then select "OAuth Consent Screen", and select "Clients".
4. Select "Create Client", select "Chrome Extension", and enter the extension ID as the "Item ID".
5. This will create a new client ID. Copy the client ID, and paste it into the `frontend/.env` file as the `EXTENSION_OAUTH_CLIENT_ID` value.
6. Rerun 'npm run build' in the frontend directory to update the extension.
7. Reload the extension, and it should now be working.

IF YOU DO NOT FOLLOW THESE STEPS, YOU WILL NOT BE ABLE TO LOG IN TO THE EXTENSION.

## Important Notes

- Make sure to keep your `.env` file private and never commit it to version control.
- For production, update the `MONGODB_URI` to point to your production database.
- Since `extension/dist` is what is loaded, changes to the frontend require running `npm run build` and reloading the extension.

During `npm run build`, `extension/manifest.json` is automatically synced from env values.

For a commit-safe build that omits `manifest.key`, run:

```bash
cd frontend
npm run build:ci
```

# GitHub Safety Check

This repo includes a GitHub Action at `.github/workflows/block-extension-keys.yml` that fails pushes/PRs if:
- `extension/manifest.json` contains a committed `key` field