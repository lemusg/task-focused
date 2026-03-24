import mongoose from "mongoose";
import { getMongoUri } from "./mongoConfig";
import User from "./models/User";


const seedUsers = async () => {
  await mongoose.connect(getMongoUri());

  const users = [
    { clerkId: "user1", role: "admin", organization: "OrgA" },
    { clerkId: "user2", role: "member", organization: "OrgB" },
    { clerkId: "user3", role: "member", organization: "OrgA" },
  ];

  await User.deleteMany({});
  await User.insertMany(users);
  console.log("Seeded users!");
  await mongoose.disconnect();
};

seedUsers().catch(console.error);
