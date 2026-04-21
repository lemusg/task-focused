# Backend

This is the backend for the Task-Focused project. It is built with Node.js, Express, TypeScript, and MongoDB (via Mongoose).

See the root [README](../README.md) for setup instructions.

## Project Structure

- `src/` — Express app source code
  - `app.ts` — Main app entry point
  - `middleware/` — Express middleware
    - `requireGoogleAuth.ts` — Google OAuth authentication middleware
  - `routes/` — API route handlers
    - `ping.ts` — Health check endpoint
    - `ping-db.ts` — Database connectivity/sample user endpoint
    - `users.ts` — User management endpoints
    - `organizations.ts` — Organization management endpoints
    - `chat.ts` — Chat endpoints
- `db/` — Database utilities and models
  - `models/User.ts` — Mongoose User schema/model
  - `models/Organization.ts` — Mongoose Organization schema/model
  - `index.ts` — MongoDB connection logic
  - `mongoConfig.ts` — MongoDB URI utility
  - `seed.ts` — Database seeding script
- `.env` — Environment variables (not committed)
- `.env.example` — Example environment variables
- `package.json` — NPM scripts and dependencies

## Useful Scripts

- `npm run dev` — Start the backend in development mode
- `npm run seed` — Seed the database with sample data
- `npm run build` — Build the backend

## API Endpoints

- `GET /api/ping` — Health check
- `GET /api/ping-db` — Returns a sample user from the database

## Notes
- Make sure to keep your `.env` file private and never commit it to version control.
- For production, update the `MONGODB_URI` to point to your production database.


