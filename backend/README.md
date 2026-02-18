# Backend

This is the backend for the Task-Focused project. It is built with Node.js, Express, TypeScript, and MongoDB (via Mongoose).

## Prerequisites
- Node.js (v18+ recommended)
- npm
- MongoDB (local or remote)

## Setup

1. **Install dependencies:**
   ```bash
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
   npm run dev
   ```

## Project Structure

- `src/` — Express app source code
  - `app.ts` — Main app entry point
  - `routes/` — API route handlers
    - `ping.ts` — Health check endpoint
    - `ping-db.ts` — Database connectivity/sample user endpoint
- `db/` — Database utilities and models
  - `models/User.ts` — Mongoose User schema/model
  - `index.ts` — MongoDB connection logic
  - `mongoConfig.ts` — MongoDB URI utility
  - `seed.ts` — Database seeding script
- `.env` — Environment variables (not committed)
- `.env.example` — Example environment variables
- `package.json` — NPM scripts and dependencies

## Useful Scripts

- `npm run dev` — Start the backend in development mode
- `npm run seed` — Seed the database with sample data

## API Endpoints

- `GET /api/ping` — Health check
- `GET /api/ping-db` — Returns a sample user from the database

## Notes
- Make sure to keep your `.env` file private and never commit it to version control.
- For production, update the `MONGODB_URI` to point to your production database.


