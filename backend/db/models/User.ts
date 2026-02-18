import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  clerkId: { type: String, required: true, unique: true }, // Link to Clerk user
  role: { type: String, enum: ["admin", "member"], required: true },
  organization: { type: String, required: true },
});

const User = mongoose.model("User", userSchema);
export default User;