import { Router } from 'express';
import connectDB from '../../db';
import Organization from '../../db/models/Organization';
import User from '../../db/models/User';
import { getAuthenticatedUserId, requireGoogleAuth } from '../middleware/requireGoogleAuth';

const router = Router();

// Every organization route requires a verified Google user.
router.use(requireGoogleAuth);

// Normalize app-level user ids so comparisons stay case-insensitive.
function normalizeUserId(input: string): string {
  return input.trim().toLowerCase();
}

// Check membership/admin arrays using normalized email values.
function includesUser(list: string[], userId: string): boolean {
  return list.some((item) => item.toLowerCase() === userId);
}

// Remove one user from a stored membership list.
function removeUser(list: string[], userId: string): string[] {
  return list.filter((item) => item.toLowerCase() !== userId);
}

// Store org blocklist entries as bare hostnames.
function normalizeWebsite(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new Error('Website is required.');
  }

  const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (!parsed.hostname) {
    throw new Error('Website is invalid.');
  }

  return parsed.hostname;
}

// Create an organization and make the current user its first admin.
router.post('/organizations', async (req, res) => {
  try {
    await connectDB();
    const userId = getAuthenticatedUserId(req);
    const organizationName = String(req.body.organizationName ?? '').trim();

    // A blank org name is not useful to store or return.
    if (!organizationName) {
      res.status(400).json({ message: 'organizationName is required.' });
      return;
    }

    // Keep names unique so users can distinguish orgs clearly.
    const existingOrgWithName = await Organization.findOne({ name: organizationName });
    if (existingOrgWithName) {
      res.status(409).json({ message: 'Organization name already exists.' });
      return;
    }

    // Users can only belong to one organization at a time.
    let user = await User.findOne({ userId });
    if (user?.organization) {
      res.status(400).json({ message: 'User already belongs to an organization.' });
      return;
    }

    const organization = await Organization.create({
      name: organizationName,
      admins: [userId],
      members: [userId],
      blockedWebsites: [],
    });

    // Update an existing user document when possible, otherwise create one.
    if (user) {
      user.role = 'admin';
      user.organization = String(organization._id);
      await user.save();
    } else {
      user = await User.create({
        userId,
        role: 'admin',
        organization: String(organization._id),
      });
    }

    res.status(201).json({
      message: 'Organization created.',
      organization: {
        id: String(organization._id),
        name: organization.name,
        admins: organization.admins,
        members: organization.members,
        blockedWebsites: organization.blockedWebsites,
      },
      user: {
        userId: user.userId,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create organization.', error });
  }
});

// Load the organization tied to the authenticated user.
router.get('/organizations/by-user/:userId', async (req, res) => {
  try {
    await connectDB();
    const userId = getAuthenticatedUserId(req);
    const requestedUserId = normalizeUserId(String(req.params.userId ?? ''));

    // Prevent a signed-in user from querying someone else's org record.
    if (requestedUserId && requestedUserId !== userId) {
      res.status(403).json({ message: 'Forbidden for requested user.' });
      return;
    }

    const user = await User.findOne({ userId });
    if (!user?.organization) {
      res.status(404).json({ message: 'User organization not found.' });
      return;
    }

    const organization = await Organization.findById(user.organization);
    if (!organization) {
      res.status(404).json({ message: 'Organization not found.' });
      return;
    }

    res.json({
      organization: {
        id: String(organization._id),
        name: organization.name,
        blockedWebsites: organization.blockedWebsites,
      },
      isAdmin: includesUser(organization.admins, userId),
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch organization.', error });
  }
});

// Attach the authenticated user to an existing organization.
router.post('/organizations/join', async (req, res) => {
  try {
    await connectDB();
    const userId = getAuthenticatedUserId(req);
    const organizationId = String(req.body.organizationId ?? '').trim();

    if (!organizationId) {
      res.status(400).json({ message: 'organizationId is required.' });
      return;
    }

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      res.status(404).json({ message: 'Organization not found.' });
      return;
    }

    const existingUser = await User.findOne({ userId });
    if (existingUser?.organization) {
      res.status(400).json({ message: 'User already belongs to an organization.' });
      return;
    }

    // Add the user to the org record only once.
    if (!includesUser(organization.members, userId)) {
      organization.members.push(userId);
      await organization.save();
    }

    // Persist the user's new org membership locally.
    if (existingUser) {
      existingUser.organization = String(organization._id);
      existingUser.role = 'member';
      await existingUser.save();
    } else {
      await User.create({
        userId,
        role: 'member',
        organization: String(organization._id),
      });
    }

    res.json({
      message: 'Joined organization.',
      organization: {
        id: String(organization._id),
        name: organization.name,
        blockedWebsites: organization.blockedWebsites,
      },
      isAdmin: false,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to join organization.', error });
  }
});

// Add a hostname to the org-wide blocklist.
router.post('/organizations/:organizationId/blocklist', async (req, res) => {
  try {
    await connectDB();
    const organizationId = String(req.params.organizationId ?? '').trim();
    const userId = getAuthenticatedUserId(req);
    const websiteInput = String(req.body.website ?? '');

    if (!organizationId || !websiteInput) {
      res.status(400).json({ message: 'organizationId and website are required.' });
      return;
    }

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      res.status(404).json({ message: 'Organization not found.' });
      return;
    }

    // Only admins are allowed to edit the shared org blocklist.
    if (!includesUser(organization.admins, userId)) {
      res.status(403).json({ message: 'Only organization admins can update blocklist.' });
      return;
    }

    const website = normalizeWebsite(websiteInput);
    if (!organization.blockedWebsites.includes(website)) {
      organization.blockedWebsites.push(website);
      organization.blockedWebsites.sort((a: string, b: string) => a.localeCompare(b));
      await organization.save();
    }

    res.json({
      message: 'Website added to blocklist.',
      blockedWebsites: organization.blockedWebsites,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add website.';
    res.status(500).json({ message, error });
  }
});

// Remove a hostname from the org-wide blocklist.
router.delete('/organizations/:organizationId/blocklist', async (req, res) => {
  try {
    await connectDB();
    const organizationId = String(req.params.organizationId ?? '').trim();
    const userId = getAuthenticatedUserId(req);
    const websiteInput = String(req.body.website ?? '');

    if (!organizationId || !websiteInput) {
      res.status(400).json({ message: 'organizationId and website are required.' });
      return;
    }

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      res.status(404).json({ message: 'Organization not found.' });
      return;
    }

    if (!includesUser(organization.admins, userId)) {
      res.status(403).json({ message: 'Only organization admins can update blocklist.' });
      return;
    }

    const website = normalizeWebsite(websiteInput);
    organization.blockedWebsites = organization.blockedWebsites.filter(
      (item: string) => item !== website
    );
    await organization.save();

    res.json({
      message: 'Website removed from blocklist.',
      blockedWebsites: organization.blockedWebsites,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove website.';
    res.status(500).json({ message, error });
  }
});

// Detach the current user from the organization they belong to.
router.post('/organizations/:organizationId/leave', async (req, res) => {
  try {
    await connectDB();
    const organizationId = String(req.params.organizationId ?? '').trim();
    const userId = getAuthenticatedUserId(req);

    if (!organizationId) {
      res.status(400).json({ message: 'organizationId is required.' });
      return;
    }

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      res.status(404).json({ message: 'Organization not found.' });
      return;
    }

    const isMember = includesUser(organization.members, userId);
    const isAdmin = includesUser(organization.admins, userId);
    if (!isMember && !isAdmin) {
      res.status(400).json({ message: 'User is not part of this organization.' });
      return;
    }

    // Remove the user from both membership lists before saving.
    organization.members = removeUser(organization.members, userId);
    organization.admins = removeUser(organization.admins, userId);

    // Reset the user's local org reference in the users collection.
    const user = await User.findOne({ userId });
    if (user) {
      user.organization = null;
      user.role = 'member';
      await user.save();
    }

    // Delete the org when it no longer has viable membership/admin coverage.
    if (organization.members.length === 0 || organization.admins.length === 0) {
      await User.updateMany(
        { organization: organizationId },
        { $set: { organization: null, role: 'member' } }
      );
      await Organization.findByIdAndDelete(organizationId);
      res.json({ message: 'Left organization. Organization was deleted.' });
      return;
    }

    await organization.save();
    res.json({ message: 'Left organization.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to leave organization.', error });
  }
});

export default router;
