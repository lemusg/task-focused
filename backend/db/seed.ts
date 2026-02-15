import mongoose from "mongoose";
import { getMongoUri } from "./mongoConfig";
import User from "./models/User";


const seedUsers = async () => {
  await mongoose.connect(getMongoUri());

  const users = [
    { clerkId: "clerk1", role: "admin", organization: "OrgA" },
    { clerkId: "clerk2", role: "member", organization: "OrgB" },
    { clerkId: "clerk3", role: "member", organization: "OrgA" },
  ];

  await User.deleteMany({});
  await User.insertMany(users);
  console.log("Seeded users!");
  await mongoose.disconnect();
};

seedUsers().catch(console.error);
