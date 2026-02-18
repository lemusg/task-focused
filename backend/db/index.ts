import mongoose from "mongoose";
import { getMongoUri } from "./mongoConfig";

const connectDB = async () => {
  await mongoose.connect(getMongoUri());
  console.log("MongoDB connected");
};

export default connectDB;