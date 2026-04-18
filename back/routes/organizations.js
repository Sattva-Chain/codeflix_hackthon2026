const express = require("express");
const authController = require("../controllers/auth");
const organizationController = require("../controllers/organizations");
const {
  authMiddleware,
  requireOrganizationMember,
  requireOrganizationOwner,
  requireRole,
} = require("../middleware/auth");

const router = express.Router();

router.post("/create", authMiddleware, requireRole("ORG_OWNER", "SOLO_DEVELOPER"), organizationController.createOrganization);
router.get("/:id", authMiddleware, requireOrganizationMember, organizationController.getOrganization);
router.get("/:id/members", authMiddleware, requireOrganizationMember, organizationController.getOrganizationMembers);
router.post("/:id/invite", authMiddleware, requireOrganizationOwner, authController.inviteEmployee);
router.get("/:id/invites", authMiddleware, requireOrganizationOwner, organizationController.getOrganizationInvites);
router.get("/:id/vulnerabilities", authMiddleware, requireOrganizationMember, organizationController.getOrganizationVulnerabilities);
router.get("/:id/vulnerabilities/summary", authMiddleware, requireOrganizationMember, organizationController.getOrganizationVulnerabilitySummary);
router.get("/:id/repos", authMiddleware, requireOrganizationMember, organizationController.getOrganizationRepos);
router.get("/:id/branches", authMiddleware, requireOrganizationMember, organizationController.getOrganizationBranches);
router.get("/:id/developers", authMiddleware, requireOrganizationMember, organizationController.getOrganizationDevelopers);

module.exports = router;
