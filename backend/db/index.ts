import mongoose from "mongoose";
import { getMongoUri } from "./mongoConfig";

// Open the shared MongoDB connection used by route handlers.
const connectDB = async () => {
  await mongoose.connect(getMongoUri());
  console.log("MongoDB connected");
};

export default connectDB;
