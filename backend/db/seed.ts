import mongoose from "mongoose";
import { getMongoUri } from "./mongoConfig";
import User from "./models/User";
import Organization from "./models/Organization";

// Populate a small sample dataset for local development.
const seedUsers = async () => {
  await mongoose.connect(getMongoUri());

  // Pre-generate org ids so related user records can point at them.
  const orgAId = new mongoose.Types.ObjectId().toString();
  const orgBId = new mongoose.Types.ObjectId().toString();

  // Seed organizations first so membership data is available immediately.
  const organizations = [
    {
      _id: orgAId,
      name: "OrgA",
      admins: ["user1"],
      members: ["user1", "user3"],
      blockedWebsites: ["facebook.com", "youtube.com"],
    },
    {
      _id: orgBId,
      name: "OrgB",
      admins: ["user2"],
      members: ["user2"],
      blockedWebsites: ["reddit.com"],
    },
  ];

  // Seed users with roles that match the org arrays above.
  const users = [
    { userId: "user1@example.com", role: "admin", organization: orgAId },
    { userId: "user2@example.com", role: "admin", organization: orgBId },
    { userId: "user3@example.com", role: "member", organization: orgAId },
  ];

  // Replace existing sample data so the script stays repeatable.
  await Organization.deleteMany({});
  await User.deleteMany({});
  await Organization.insertMany(organizations);
  await User.insertMany(users);

  console.log("Seeded users and organizations!");
  await mongoose.disconnect();
};

seedUsers().catch(console.error);
