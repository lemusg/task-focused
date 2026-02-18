import dotenv from "dotenv";
dotenv.config();

export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not defined in environment variables.");
  }
  return uri;
}
