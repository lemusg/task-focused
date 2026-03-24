import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    admins: [{ type: String, required: true }],
    members: [{ type: String, required: true }],
    blockedWebsites: [{ type: String, default: [] }],
  },
  { timestamps: true }
);

const Organization = mongoose.model('Organization', organizationSchema);
export default Organization;