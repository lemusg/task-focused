import mongoose from "mongoose";

// Keep the signed-in user's org membership and effective role.
const userSchema = new mongoose.Schema({
  // userId is the Google account email normalized by auth middleware.
  userId: { type: String, required: true, unique: true },

  // Role reflects the user's current permission level inside an org.
  role: { type: String, enum: ["admin", "member"], required: true },

  // organization holds the org document id as a string when attached.
  organization: { type: String, default: null },
});

const User = mongoose.model("User", userSchema);
export default User;
