const crypto = require("crypto");
const bcrypt = require("bcrypt");
const userModule = require("../models/user");
const organizationModel = require("../models/organization");
const repoModule = require("../models/repo");
const vulnerabilityModel = require("../models/vulnerability");
const authService = require("../services/authentication");
const { sendOrganizationInviteEmail } = require("../services/inviteEmail");

const User = userModule.default || userModule;
const Organization = organizationModel.default || organizationModel;
const Repository = repoModule.default || repoModule;
const Vulnerability = vulnerabilityModel.default || vulnerabilityModel;
const { createTokenForUser, buildSafeUser } = authService;

const SALT_ROUNDS = 10;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildResolvedInviteEmailSet(memberList, invites = []) {
  const resolvedEmails = new Set(
    memberList
      .map((member) => normalizeEmail(member.email))
      .filter(Boolean)
  );

  (invites || []).forEach((invite) => {
    if (invite.status === "ACCEPTED") {
      const inviteEmail = normalizeEmail(invite.email);
      if (inviteEmail) resolvedEmails.add(inviteEmail);
    }
  });

  return resolvedEmails;
}

function pushPendingInvites(memberList, invites = []) {
  const resolvedEmails = buildResolvedInviteEmailSet(memberList, invites);

  (invites || [])
    .filter((invite) => invite.status === "PENDING")
    .forEach((invite) => {
      const inviteEmail = normalizeEmail(invite.email);
      if (!inviteEmail || resolvedEmails.has(inviteEmail)) {
        return;
      }

      memberList.push({
        _id: `invite:${invite._id}`,
        name: null,
        email: invite.email,
        role: invite.role,
        status: "INVITED",
        invitedAt: invite.invitedAt || null,
      });
    });
}

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(inputPassword, storedValue) {
  if (!storedValue) return false;
  if (/^\$2[aby]\$/i.test(String(storedValue))) {
    return bcrypt.compare(inputPassword, storedValue);
  }
  return String(inputPassword) === String(storedValue);
}

async function resolveOrganizationMembers(organization) {
  const dbUsers = await User.find({ organizationId: organization._id })
    .select("name email role isActive createdAt updatedAt")
    .lean();

  const sourceMembers =
    dbUsers.length > 0
      ? dbUsers
      : (organization.members || []).map((member) => ({
          _id: member._id,
          name: member.name || null,
          email: member.email,
          role: member.role,
          isActive: member.isActive,
          createdAt: member.createdAt,
          updatedAt: member.updatedAt,
        }));

  const memberList = sourceMembers.map((member) => ({
    _id: member._id,
    name: member.name || null,
    email: member.email,
    role: member.role,
    status: member.isActive === false ? "INACTIVE" : "ACTIVE",
    invitedAt: member.createdAt || null,
  }));

  const activeEmails = new Set(memberList.map((member) => normalizeEmail(member.email)).filter(Boolean));

  return { memberList, activeEmails };
}

async function buildOrganizationSummary(organizationId, authUser) {
  if (!organizationId) return null;
  const organization = await Organization.findById(organizationId)
    .populate("owner", "name email role")
    .populate("members", "name email role isActive createdAt updatedAt");
  if (!organization) return null;

  const baseFilter =
    authUser?.role === "EMPLOYEE"
      ? {
          organizationId: organization._id,
          $or: [
            { authorEmail: authUser.email },
            { assignedTo: authUser.email },
            { createdBy: authUser._id },
          ],
        }
      : { organizationId: organization._id };

  const [vulnerabilitySummary, repoCount] = await Promise.all([
    Vulnerability.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),
    Vulnerability.distinct("repoUrl", { organizationId: organization._id }),
  ]);

  const summaryMap = Object.fromEntries(vulnerabilitySummary.map((row) => [row._id, row.count]));
  const { memberList } = await resolveOrganizationMembers(organization);
  pushPendingInvites(memberList, organization.invites || []);

  return {
    _id: organization._id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt || null,
    updatedAt: organization.updatedAt || null,
    owner: organization.owner
      ? {
          _id: organization.owner._id,
          name: organization.owner.name || null,
          email: organization.owner.email || null,
          role: organization.owner.role || null,
        }
      : null,
    members: memberList,
    invites: organization.invites || [],
    totalMembers: memberList.length,
    summary: {
      totalVulnerabilities: Object.values(summaryMap).reduce((sum, value) => sum + value, 0),
      open: summaryMap.OPEN || 0,
      fixed: summaryMap.FIXED || 0,
      ignored: summaryMap.IGNORED || 0,
      repos: repoCount.length,
      activeMembers: memberList.filter((member) => member.status === "ACTIVE").length,
      pendingInvites: (organization.invites || []).filter((invite) => invite.status === "PENDING").length,
      developers: memberList.filter((member) => member.role === "EMPLOYEE").length,
    },
  };
}

async function buildAuthResponse(user) {
  const safeUser = buildSafeUser(user);
  const [organization, repositories] = await Promise.all([
    buildOrganizationSummary(user.organizationId, user),
    Repository.find({ userId: user._id }).lean(),
  ]);

  return {
    user: safeUser,
    organization,
    repositories,
  };
}

async function acceptPendingInviteForEmail(email, password) {
  const organization = await Organization.findOne({
    invites: {
      $elemMatch: {
        email,
        status: "PENDING",
      },
    },
  });

  if (!organization) {
    return null;
  }

  const pendingInvites = (organization.invites || []).filter(
    (invite) => normalizeEmail(invite.email) === email && invite.status === "PENDING"
  );

  if (pendingInvites.length > 1) {
    throw new Error("MULTIPLE_PENDING_INVITES");
  }

  const invite = pendingInvites[0];
  if (!invite) {
    return null;
  }

  let user = await User.findOne({ email });
  if (user && user.organizationId && String(user.organizationId) !== String(organization._id)) {
    throw new Error("INVITE_EMAIL_ALREADY_USED");
  }

  if (!user) {
    user = await User.create({
      name: null,
      email,
      password: await hashPassword(password),
      role: "EMPLOYEE",
      organizationId: organization._id,
      invitedBy: invite.invitedBy || organization.owner,
      userType: "developer",
      isActive: true,
    });
  } else {
    user.password = await hashPassword(password);
    user.role = "EMPLOYEE";
    user.organizationId = organization._id;
    user.invitedBy = invite.invitedBy || organization.owner;
    user.userType = "developer";
    user.isActive = true;
    await user.save();
  }

  const acceptedAt = new Date();
  await Organization.updateOne(
    { _id: organization._id },
    {
      $addToSet: { members: user._id },
      $set: {
        "invites.$[invite].status": "ACCEPTED",
        "invites.$[invite].acceptedAt": acceptedAt,
      },
    },
    {
      arrayFilters: [{ "invite.email": email }],
    }
  );

  return User.findById(user._id);
}

async function register(req, res) {
  try {
    const name = String(req.body.name || "").trim() || null;
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const role = String(req.body.role || "SOLO_DEVELOPER").trim();
    const organizationName = String(req.body.organizationName || "").trim();

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    if (!["SOLO_DEVELOPER", "ORG_OWNER"].includes(role)) {
      return res.status(400).json({ success: false, message: "Only solo developers and organization owners can self-register." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }

    const user = await User.create({
      name,
      email,
      password: await hashPassword(password),
      role,
      userType: role === "SOLO_DEVELOPER" ? "developer" : "organization",
      isActive: true,
    });

    let organization = null;
    if (role === "ORG_OWNER") {
      const baseName = organizationName || `${name || email.split("@")[0]}'s Organization`;
      let slug = slugify(baseName) || `org-${crypto.randomBytes(3).toString("hex")}`;

      while (await Organization.findOne({ slug })) {
        slug = `${slugify(baseName)}-${crypto.randomBytes(2).toString("hex")}`;
      }

      organization = await Organization.create({
        name: baseName,
        slug,
        owner: user._id,
        members: [user._id],
        invites: [],
      });

      user.organizationId = organization._id;
      await user.save();
    }

    const token = createTokenForUser(user);
    const payload = await buildAuthResponse(user);
    return res.status(201).json({
      success: true,
      token,
      ...payload,
    });
  } catch (error) {
    console.error("Register failed:", error);
    return res.status(500).json({ success: false, message: "Unable to register account." });
  }
}

async function login(req, res) {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const requestedRole = String(req.body.role || "").trim().toUpperCase();

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    let user = await User.findOne({ email });
    if ((!user || user.isActive === false) && requestedRole === "EMPLOYEE") {
      try {
        user = await acceptPendingInviteForEmail(email, password);
      } catch (inviteError) {
        if (inviteError.message === "MULTIPLE_PENDING_INVITES") {
          return res.status(409).json({
            success: false,
            message: "Multiple pending invites were found for this email. Please use the latest invite link or ask the organization owner to resend the invite.",
          });
        }
        if (inviteError.message === "INVITE_EMAIL_ALREADY_USED") {
          return res.status(409).json({
            success: false,
            message: "This invited email is already attached to another organization.",
          });
        }
        throw inviteError;
      }
    }

    if (!user || user.isActive === false) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    if (!/^\$2[aby]\$/i.test(String(user.password || ""))) {
      user.password = await hashPassword(password);
      await user.save();
    }

    const token = createTokenForUser(user);
    const payload = await buildAuthResponse(user);
    return res.json({
      success: true,
      token,
      ...payload,
    });
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(500).json({ success: false, message: "Unable to log in." });
  }
}

async function logout(_req, res) {
  return res.json({ success: true, message: "Logged out." });
}

async function getCurrentUser(req, res) {
  try {
    const payload = await buildAuthResponse(req.authUser);
    return res.json({
      success: true,
      ...payload,
    });
  } catch (error) {
    console.error("Failed to load current user:", error);
    return res.status(500).json({ success: false, message: "Unable to load the current user." });
  }
}

async function getInviteDetails(req, res) {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) {
      return res.status(400).json({ success: false, message: "Invite token is required." });
    }

    const organization = await Organization.findOne({ "invites.token": token }).select("name invites");
    if (!organization) {
      return res.status(404).json({ success: false, message: "Invite not found." });
    }

    const invite = (organization.invites || []).find((item) => item.token === token);
    if (!invite || invite.status !== "PENDING") {
      return res.status(410).json({ success: false, message: "This invite is no longer active." });
    }

    return res.json({
      success: true,
      invite: {
        email: invite.email,
        role: invite.role,
        organizationName: organization.name,
        invitedAt: invite.invitedAt,
      },
    });
  } catch (error) {
    console.error("Failed to load invite:", error);
    return res.status(500).json({ success: false, message: "Unable to load invite details." });
  }
}

async function acceptInvite(req, res) {
  try {
    const token = String(req.body.token || "").trim();
    const password = String(req.body.password || "");
    const name = String(req.body.name || "").trim() || null;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: "Invite token and password are required." });
    }

    const organization = await Organization.findOne({ "invites.token": token });
    if (!organization) {
      return res.status(404).json({ success: false, message: "Invite not found." });
    }

    const invite = (organization.invites || []).find((item) => item.token === token);
    if (!invite || invite.status !== "PENDING") {
      return res.status(410).json({ success: false, message: "This invite is no longer active." });
    }

    const email = normalizeEmail(invite.email);
    let user = await User.findOne({ email });

    if (user && user.organizationId && String(user.organizationId) !== String(organization._id)) {
      return res.status(409).json({ success: false, message: "This email already belongs to another organization." });
    }

    if (!user) {
      user = await User.create({
        name,
        email,
        password: await hashPassword(password),
        role: "EMPLOYEE",
        organizationId: organization._id,
        invitedBy: invite.invitedBy || organization.owner,
        userType: "developer",
        isActive: true,
      });
    } else {
      user.name = user.name || name;
      user.password = await hashPassword(password);
      user.role = "EMPLOYEE";
      user.organizationId = organization._id;
      user.invitedBy = invite.invitedBy || organization.owner;
      user.isActive = true;
      await user.save();
    }

    const acceptedAt = new Date();
    await Organization.updateOne(
      { _id: organization._id },
      {
        $addToSet: { members: user._id },
        $set: {
          "invites.$[invite].status": "ACCEPTED",
          "invites.$[invite].acceptedAt": acceptedAt,
        },
      },
      {
        arrayFilters: [{ "invite.email": email }],
      }
    );

    const tokenValue = createTokenForUser(user);
    const payload = await buildAuthResponse(user);

    return res.json({
      success: true,
      token: tokenValue,
      ...payload,
    });
  } catch (error) {
    console.error("Accept invite failed:", error);
    return res.status(500).json({ success: false, message: "Unable to accept invite." });
  }
}

async function setPassword(req, res) {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Current password and new password are required." });
    }

    const valid = await verifyPassword(currentPassword, req.authUser.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: "Current password is incorrect." });
    }

    req.authUser.password = await hashPassword(newPassword);
    await req.authUser.save();

    return res.json({ success: true, message: "Password updated." });
  } catch (error) {
    console.error("Set password failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update password." });
  }
}

async function inviteEmployee(req, res) {
  try {
    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({ success: false, message: "Organization not found." });
    }

    if (String(req.authUser.organizationId || "") !== String(organization._id)) {
      return res.status(403).json({ success: false, message: "You can only invite members to your own organization." });
    }

    const email = normalizeEmail(req.body.email);
    const role = "EMPLOYEE";
    if (!email) {
      return res.status(400).json({ success: false, message: "Invite email is required." });
    }

    const existingInvite = (organization.invites || []).find(
      (invite) => invite.email === email && invite.status === "PENDING"
    );
    if (existingInvite) {
      return res.status(409).json({ success: false, message: "A pending invite already exists for this email." });
    }

    const existingMember = await User.findOne({ email, organizationId: organization._id });
    if (existingMember) {
      return res.status(409).json({ success: false, message: "This user is already a member of the organization." });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const inviteLinkBase = process.env.LEAKSHIELD_INVITE_BASE_URL || "http://localhost:5173/invite/accept";
    const inviteLink = `${inviteLinkBase}?token=${encodeURIComponent(token)}`;

    organization.invites.push({
      email,
      role,
      token,
      status: "PENDING",
      invitedAt: new Date(),
      invitedBy: req.authUser._id,
    });
    await organization.save();

    const delivery = await sendOrganizationInviteEmail({
      to: email,
      organizationName: organization.name,
      inviteLink,
      role,
    });

    const message = delivery.delivered
      ? "Invite sent successfully."
      : delivery.skipped
        ? "Invite created, but email delivery is not configured. Share the invite link manually or configure SMTP."
        : "Invite created, but email delivery failed. Share the invite link manually and verify SMTP credentials.";

    return res.status(201).json({
      success: true,
      invite: {
        email,
        role,
        status: "PENDING",
        inviteLink,
      },
      delivery,
      message,
    });
  } catch (error) {
    console.error("Invite employee failed:", error);
    return res.status(500).json({ success: false, message: "Unable to send organization invite." });
  }
}

async function listMyVulnerabilities(req, res) {
  try {
    const query = { createdBy: req.authUser._id };
    if (req.authUser.organizationId) {
      query.organizationId = req.authUser.organizationId;
    }
    if (req.authUser.role === "EMPLOYEE") {
      query.$or = [
        { authorEmail: req.authUser.email },
        { assignedTo: req.authUser.email },
        { createdBy: req.authUser._id },
      ];
    }

    if (req.query.repo) query.repoUrl = String(req.query.repo);
    if (req.query.branch) query.branch = String(req.query.branch);
    if (req.query.status) query.status = String(req.query.status);
    if (req.query.severity) query.severity = String(req.query.severity).toUpperCase();
    if (req.query.developerEmail) query.authorEmail = String(req.query.developerEmail).toLowerCase();

    const vulnerabilities = await Vulnerability.find(query)
      .populate("createdBy", "name email")
      .sort({ scannedAt: -1, createdAt: -1 })
      .lean();
    return res.json({ success: true, vulnerabilities });
  } catch (error) {
    console.error("Failed to list vulnerabilities:", error);
    return res.status(500).json({ success: false, message: "Unable to load vulnerabilities." });
  }
}

async function getMyVulnerabilitySummary(req, res) {
  try {
    const query = { createdBy: req.authUser._id };
    if (req.authUser.organizationId) {
      query.organizationId = req.authUser.organizationId;
    }
    if (req.authUser.role === "EMPLOYEE") {
      query.$or = [
        { authorEmail: req.authUser.email },
        { assignedTo: req.authUser.email },
        { createdBy: req.authUser._id },
      ];
    }

    const [statusSummary, repos, developers] = await Promise.all([
      Vulnerability.aggregate([
        { $match: query },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Vulnerability.distinct("repoUrl", query),
      Vulnerability.distinct("authorEmail", query),
    ]);

    const summaryMap = Object.fromEntries(statusSummary.map((row) => [row._id, row.count]));
    return res.json({
      success: true,
      summary: {
        total: Object.values(summaryMap).reduce((sum, value) => sum + value, 0),
        open: summaryMap.OPEN || 0,
        fixed: summaryMap.FIXED || 0,
        ignored: summaryMap.IGNORED || 0,
        repos: repos.filter(Boolean).length,
        developers: developers.filter(Boolean).length,
      },
    });
  } catch (error) {
    console.error("Failed to load vulnerability summary:", error);
    return res.status(500).json({ success: false, message: "Unable to load vulnerability summary." });
  }
}

module.exports = {
  register,
  login,
  logout,
  getCurrentUser,
  getInviteDetails,
  acceptInvite,
  setPassword,
  inviteEmployee,
  listMyVulnerabilities,
  getMyVulnerabilitySummary,
  buildOrganizationSummary,
};
