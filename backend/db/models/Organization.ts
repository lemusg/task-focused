import mongoose from 'mongoose';

// Store org-level data used for membership and shared blocklists.
const organizationSchema = new mongoose.Schema(
  {
    // Human-readable org name shown in the UI.
    name: { type: String, required: true, unique: true, trim: true },

    // Admins can manage the org blocklist.
    admins: [{ type: String, required: true }],

    // Members include every user currently attached to the org.
    members: [{ type: String, required: true }],

    // The backend stores blocked sites as normalized hostnames.
    blockedWebsites: [{ type: String, default: [] }],

    // How long (in minutes) a temporary allow lasts for org members.
    allowDurationMinutes: { type: Number, default: 5, min: 1, max: 60 },
  },
  { timestamps: true }
);

const Organization = mongoose.model('Organization', organizationSchema);
export default Organization;
