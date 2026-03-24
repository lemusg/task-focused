import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  role: { type: String, enum: ["admin", "member"], required: true },
  organization: { type: String, default: null },
});

const User = mongoose.model("User", userSchema);
export default User;