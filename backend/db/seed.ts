import mongoose from "mongoose";
import { getMongoUri } from "./mongoConfig";
import User from "./models/User";
import Organization from "./models/Organization";


const seedUsers = async () => {
  await mongoose.connect(getMongoUri());

  const orgAId = new mongoose.Types.ObjectId().toString();
  const orgBId = new mongoose.Types.ObjectId().toString();

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

  const users = [
    { userId: "user1@example.com", role: "admin", organization: orgAId },
    { userId: "user2@example.com", role: "admin", organization: orgBId },
    { userId: "user3@example.com", role: "member", organization: orgAId },
  ];

  await Organization.deleteMany({});
  await User.deleteMany({});
  await Organization.insertMany(organizations);
  await User.insertMany(users);
  console.log("Seeded users and organizations!");
  await mongoose.disconnect();
};

seedUsers().catch(console.error);
