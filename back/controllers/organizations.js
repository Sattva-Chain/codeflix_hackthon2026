const organizationModel = require("../models/organization");
const vulnerabilityModel = require("../models/vulnerability");
const userModule = require("../models/user");
const { buildOrganizationSummary } = require("./auth");

const Organization = organizationModel.default || organizationModel;
const Vulnerability = vulnerabilityModel.default || vulnerabilityModel;
const User = userModule.default || userModule;

function buildOrgScope(req) {
  const base = { organizationId: req.params.id };

  if (req.authUser?.role === "EMPLOYEE") {
    base.$or = [
      { authorEmail: req.authUser.email },
      { assignedTo: req.authUser.email },
      { createdBy: req.authUser._id },
    ];
  }

  if (req.query.repo) base.repoUrl = String(req.query.repo);
  if (req.query.branch) base.branch = String(req.query.branch);
  if (req.query.status) base.status = String(req.query.status);
  if (req.query.severity) base.severity = String(req.query.severity).toUpperCase();
  if (req.query.developerEmail) base.authorEmail = String(req.query.developerEmail).toLowerCase();

  return base;
}

async function createOrganization(req, res) {
  try {
    if (req.authUser.organizationId) {
      return res.status(409).json({ success: false, message: "This user already belongs to an organization." });
    }

    const name = String(req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Organization name is required." });
    }

    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
    let slug = slugBase || `org-${Date.now()}`;
    let suffix = 1;
    while (await Organization.findOne({ slug })) {
      suffix += 1;
      slug = `${slugBase}-${suffix}`;
    }

    const organization = await Organization.create({
      name,
      slug,
      owner: req.authUser._id,
      members: [req.authUser._id],
      invites: [],
    });

    req.authUser.organizationId = organization._id;
    req.authUser.role = "ORG_OWNER";
    req.authUser.userType = "organization";
    await req.authUser.save();

    const summary = await buildOrganizationSummary(organization._id, req.authUser);
    return res.status(201).json({ success: true, organization: summary });
  } catch (error) {
    console.error("Create organization failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create organization." });
  }
}

async function getOrganization(req, res) {
  try {
    const organization = await buildOrganizationSummary(req.params.id, req.authUser);
    if (!organization) {
      return res.status(404).json({ success: false, message: "Organization not found." });
    }
    return res.json({ success: true, organization });
  } catch (error) {
    console.error("Get organization failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load organization." });
  }
}

async function getOrganizationMembers(req, res) {
  try {
    const organization = await Organization.findById(req.params.id)
      .populate("owner", "name email role")
      .populate("members", "name email role isActive createdAt updatedAt");
    if (!organization) {
      return res.status(404).json({ success: false, message: "Organization not found." });
    }

    const members = (organization.members || []).map((member) => ({
      _id: member._id,
      name: member.name || null,
      email: member.email,
      role: member.role,
      status: member.isActive === false ? "INACTIVE" : "ACTIVE",
      joinedAt: member.createdAt || null,
    }));

    (organization.invites || [])
      .filter((invite) => invite.status === "PENDING")
      .forEach((invite) => {
        members.push({
          _id: `invite:${invite._id}`,
          name: null,
          email: invite.email,
          role: invite.role,
          status: "INVITED",
          joinedAt: invite.invitedAt || null,
        });
      });

    return res.json({
      success: true,
      owner: organization.owner
        ? {
            _id: organization.owner._id,
            name: organization.owner.name || null,
            email: organization.owner.email || null,
            role: organization.owner.role || null,
          }
        : null,
      members,
    });
  } catch (error) {
    console.error("Get organization members failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load organization members." });
  }
}

async function getOrganizationInvites(req, res) {
  try {
    const organization = await Organization.findById(req.params.id).select("invites");
    if (!organization) {
      return res.status(404).json({ success: false, message: "Organization not found." });
    }

    return res.json({
      success: true,
      invites: organization.invites || [],
    });
  } catch (error) {
    console.error("Get organization invites failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load invites." });
  }
}

async function getOrganizationVulnerabilities(req, res) {
  try {
    const query = buildOrgScope(req);
    const vulnerabilities = await Vulnerability.find(query).sort({ scannedAt: -1, createdAt: -1 }).lean();
    return res.json({ success: true, vulnerabilities });
  } catch (error) {
    console.error("Get organization vulnerabilities failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load vulnerabilities." });
  }
}

async function getOrganizationVulnerabilitySummary(req, res) {
  try {
    const query = buildOrgScope(req);
    const [statusSummary, severitySummary, repoUrls, developers] = await Promise.all([
      Vulnerability.aggregate([
        { $match: query },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Vulnerability.aggregate([
        { $match: query },
        { $group: { _id: "$severity", count: { $sum: 1 } } },
      ]),
      Vulnerability.distinct("repoUrl", query),
      Vulnerability.distinct("authorEmail", query),
    ]);

    const statusMap = Object.fromEntries(statusSummary.map((row) => [row._id, row.count]));
    const severityMap = Object.fromEntries(severitySummary.map((row) => [row._id, row.count]));

    return res.json({
      success: true,
      summary: {
        total: Object.values(statusMap).reduce((sum, value) => sum + value, 0),
        open: statusMap.OPEN || 0,
        fixed: statusMap.FIXED || 0,
        ignored: statusMap.IGNORED || 0,
        highSeverity: severityMap.HIGH || 0,
        mediumSeverity: severityMap.MEDIUM || 0,
        lowSeverity: severityMap.LOW || 0,
        repos: repoUrls.filter(Boolean).length,
        developers: developers.filter(Boolean).length,
      },
    });
  } catch (error) {
    console.error("Get organization vulnerability summary failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load organization summary." });
  }
}

async function getOrganizationRepos(req, res) {
  try {
    const query = buildOrgScope(req);
    const repos = await Vulnerability.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$repoUrl",
          repoName: { $first: "$repoName" },
          total: { $sum: 1 },
          open: {
            $sum: {
              $cond: [{ $eq: ["$status", "OPEN"] }, 1, 0],
            },
          },
        },
      },
      { $sort: { total: -1, repoName: 1 } },
    ]);
    return res.json({ success: true, repos });
  } catch (error) {
    console.error("Get organization repos failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load organization repos." });
  }
}

async function getOrganizationBranches(req, res) {
  try {
    const query = buildOrgScope(req);
    const branches = await Vulnerability.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$branch",
          total: { $sum: 1 },
          open: {
            $sum: {
              $cond: [{ $eq: ["$status", "OPEN"] }, 1, 0],
            },
          },
        },
      },
      { $sort: { total: -1 } },
    ]);
    return res.json({ success: true, branches });
  } catch (error) {
    console.error("Get organization branches failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load branches." });
  }
}

async function getOrganizationDevelopers(req, res) {
  try {
    const query = buildOrgScope(req);
    const developers = await Vulnerability.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$authorEmail",
          author: { $first: "$author" },
          total: { $sum: 1 },
          open: {
            $sum: {
              $cond: [{ $eq: ["$status", "OPEN"] }, 1, 0],
            },
          },
        },
      },
      { $sort: { total: -1 } },
    ]);
    return res.json({ success: true, developers });
  } catch (error) {
    console.error("Get organization developers failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load developers." });
  }
}

module.exports = {
  createOrganization,
  getOrganization,
  getOrganizationMembers,
  getOrganizationInvites,
  getOrganizationVulnerabilities,
  getOrganizationVulnerabilitySummary,
  getOrganizationRepos,
  getOrganizationBranches,
  getOrganizationDevelopers,
};
