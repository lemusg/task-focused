import dotenv from "dotenv";
dotenv.config();

// Read the MongoDB connection string from the current environment.
export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;

  // Fail fast so startup does not proceed with an invalid config.
  if (!uri) {
    throw new Error("MONGODB_URI is not defined in environment variables.");
  }

  return uri;
}
