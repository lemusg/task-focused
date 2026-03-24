import { Router } from 'express';
import connectDB from '../../db';
import Organization from '../../db/models/Organization';
import User from '../../db/models/User';

const router = Router();

function normalizeUserId(input: string): string {
  return input.trim().toLowerCase();
}

function includesUser(list: string[], userId: string): boolean {
  return list.some((item) => item.toLowerCase() === userId);
}

function removeUser(list: string[], userId: string): string[] {
  return list.filter((item) => item.toLowerCase() !== userId);
}

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

router.post('/organizations', async (req, res) => {
  try {
    await connectDB();
    const userId = normalizeUserId(String(req.body.userId ?? ''));
    const organizationName = String(req.body.organizationName ?? '').trim();

    if (!userId || !organizationName) {
      res.status(400).json({ message: 'userId and organizationName are required.' });
      return;
    }

    const existingOrgWithName = await Organization.findOne({ name: organizationName });
    if (existingOrgWithName) {
      res.status(409).json({ message: 'Organization name already exists.' });
      return;
    }

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

router.get('/organizations/by-user/:userId', async (req, res) => {
  try {
    await connectDB();
    const userId = normalizeUserId(String(req.params.userId ?? ''));
    if (!userId) {
      res.status(400).json({ message: 'userId is required.' });
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

router.post('/organizations/:organizationId/blocklist', async (req, res) => {
  try {
    await connectDB();
    const organizationId = String(req.params.organizationId ?? '').trim();
    const userId = normalizeUserId(String(req.body.userId ?? ''));
    const websiteInput = String(req.body.website ?? '');

    if (!organizationId || !userId || !websiteInput) {
      res.status(400).json({ message: 'organizationId, userId, and website are required.' });
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

router.delete('/organizations/:organizationId/blocklist', async (req, res) => {
  try {
    await connectDB();
    const organizationId = String(req.params.organizationId ?? '').trim();
    const userId = normalizeUserId(String(req.body.userId ?? ''));
    const websiteInput = String(req.body.website ?? '');

    if (!organizationId || !userId || !websiteInput) {
      res.status(400).json({ message: 'organizationId, userId, and website are required.' });
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

router.post('/organizations/:organizationId/leave', async (req, res) => {
  try {
    await connectDB();
    const organizationId = String(req.params.organizationId ?? '').trim();
    const userId = normalizeUserId(String(req.body.userId ?? ''));

    if (!organizationId || !userId) {
      res.status(400).json({ message: 'organizationId and userId are required.' });
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

    organization.members = removeUser(organization.members, userId);
    organization.admins = removeUser(organization.admins, userId);

    const user = await User.findOne({ userId });
    if (user) {
      user.organization = null;
      user.role = 'member';
      await user.save();
    }

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