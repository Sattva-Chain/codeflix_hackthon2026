const remediationTaskModel = require("../models/remediationTask");
const vulnerabilityModel = require("../models/vulnerability");
const userModule = require("../models/user");
const organizationModel = require("../models/organization");
const {
  computeDefaultTaskDueDate,
  createAsanaRemediationTask,
} = require("../services/asana");
const { sendTaskAssignmentEmail } = require("../services/taskEmail");

const RemediationTask = remediationTaskModel.default || remediationTaskModel;
const Vulnerability = vulnerabilityModel.default || vulnerabilityModel;
const User = userModule.default || userModule;
const Organization = organizationModel.default || organizationModel;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function toDateOnlyInput(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function buildDefaultTitle(vulnerability) {
  const repoName = vulnerability.repoName || vulnerability.repoUrl || "repository";
  const secretType = vulnerability.secretType || "secret";
  return `[SecureScan] Remediate exposed ${secretType} in ${repoName}`;
}

function buildDefaultRecommendation(vulnerability) {
  const secretType = vulnerability.secretType || "secret";
  const filePath = vulnerability.file || "the affected file";
  return `Rotate the exposed ${secretType}, remove it from ${filePath}, and replace it with a secure environment variable or vault reference.`;
}

function buildTaskDescription({
  vulnerability,
  assignedByName,
  assignedByEmail,
  assignedToEmail,
  organizationName,
  note,
  recommendation,
}) {
  return [
    "Remediation task created from SecureScan.",
    "",
    organizationName ? `Organization: ${organizationName}` : null,
    `Secret Type: ${vulnerability.secretType || "Secret exposure"}`,
    `Repository: ${vulnerability.repoName || vulnerability.repoUrl || "N/A"}`,
    vulnerability.repoUrl ? `Repository URL: ${vulnerability.repoUrl}` : null,
    `Branch: ${vulnerability.branch || "N/A"}`,
    `File: ${vulnerability.file || "N/A"}`,
    `Line: ${vulnerability.line ?? "N/A"}`,
    `Found By: ${vulnerability.author || vulnerability.authorEmail || "SecureScan"}`,
    vulnerability.authorEmail ? `Author Email: ${vulnerability.authorEmail}` : null,
    vulnerability.commitHash ? `Commit Hash: ${vulnerability.commitHash}` : null,
    vulnerability.commitTime ? `Commit Time: ${new Date(vulnerability.commitTime).toISOString()}` : null,
    `Current Vulnerability Status: ${vulnerability.status || "OPEN"}`,
    `Assigned By: ${assignedByName || "SecureScan"}`,
    assignedByEmail ? `Assigned By Email: ${assignedByEmail}` : null,
    `Assignee Email: ${assignedToEmail || vulnerability.authorEmail || vulnerability.assignedTo || "Not provided"}`,
    `Severity: ${vulnerability.severity || "MEDIUM"}`,
    `Internal vulnerability ID: ${vulnerability._id}`,
    "",
    "Recommended Fix:",
    recommendation,
    note ? "" : null,
    note ? "Additional Note:" : null,
    note || null,
  ]
    .filter(Boolean)
    .join("\n");
}

function deriveTaskStatus(task) {
  const currentStatus = String(task.status || "OPEN").toUpperCase();
  if (!task.dueDate) return currentStatus;
  if (!["OPEN", "IN_PROGRESS"].includes(currentStatus)) return currentStatus;

  const dueDate = new Date(task.dueDate);
  if (Number.isNaN(dueDate.getTime())) return currentStatus;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate < today ? "OVERDUE" : currentStatus;
}

function buildTaskScope(req) {
  const base = {};

  if (req.authUser.role === "ORG_OWNER") {
    if (req.authUser.organizationId) {
      base.organizationId = req.authUser.organizationId;
    } else {
      base.assignedByUserId = req.authUser._id;
    }
  } else if (req.authUser.role === "EMPLOYEE") {
    base.$or = [
      { assignedToUserId: req.authUser._id },
      { assignedToEmail: normalizeEmail(req.authUser.email) },
      { assignedByUserId: req.authUser._id },
    ];
    if (req.authUser.organizationId) {
      base.organizationId = req.authUser.organizationId;
    }
  } else {
    base.$or = [
      { assignedByUserId: req.authUser._id },
      { assignedToUserId: req.authUser._id },
      { assignedToEmail: normalizeEmail(req.authUser.email) },
    ];
    base.organizationId = null;
  }

  if (req.query.repo) base.repoName = String(req.query.repo);
  if (req.query.branch) base.branch = String(req.query.branch);
  if (req.query.status) base.status = String(req.query.status).toUpperCase();
  if (req.query.severity) base.severity = String(req.query.severity).toUpperCase();
  if (req.query.assignee) base.assignedToEmail = normalizeEmail(req.query.assignee);

  if (req.query.search) {
    const search = String(req.query.search).trim();
    if (search) {
      base.$and = [
        ...(base.$and || []),
        {
          $or: [
            { title: { $regex: search, $options: "i" } },
            { repoName: { $regex: search, $options: "i" } },
            { filePath: { $regex: search, $options: "i" } },
            { assignedToEmail: { $regex: search, $options: "i" } },
          ],
        },
      ];
    }
  }

  return base;
}

async function ensureVulnerabilityAccess(vulnerability, authUser) {
  if (!vulnerability) return false;

  if (authUser.role === "ORG_OWNER") {
    return String(vulnerability.organizationId || "") === String(authUser.organizationId || "");
  }

  if (authUser.role === "SOLO_DEVELOPER") {
    return String(vulnerability.createdBy || "") === String(authUser._id);
  }

  if (authUser.role === "EMPLOYEE") {
    return (
      String(vulnerability.organizationId || "") === String(authUser.organizationId || "") &&
      [
        normalizeEmail(vulnerability.authorEmail),
        normalizeEmail(vulnerability.assignedTo),
        String(vulnerability.createdBy || ""),
      ].includes(normalizeEmail(authUser.email)) || String(vulnerability.createdBy || "") === String(authUser._id)
    );
  }

  return false;
}

async function createTask(req, res) {
  try {
    const vulnerabilityId = String(req.body.vulnerabilityId || "").trim();
    if (!vulnerabilityId) {
      return res.status(400).json({ success: false, message: "Vulnerability id is required." });
    }

    const vulnerability = await Vulnerability.findById(vulnerabilityId).lean();
    if (!(await ensureVulnerabilityAccess(vulnerability, req.authUser))) {
      return res.status(404).json({ success: false, message: "Vulnerability not found." });
    }

    if (req.authUser.role === "ORG_OWNER" && !req.authUser.organizationId) {
      return res.status(400).json({ success: false, message: "Organization owner is missing an organization context." });
    }

    const title = String(req.body.title || "").trim() || buildDefaultTitle(vulnerability);
    const recommendation =
      String(req.body.remediationRecommendation || "").trim() || buildDefaultRecommendation(vulnerability);
    const note = String(req.body.note || req.body.notes || "").trim();
    const dueDateInput = String(req.body.dueDate || "").trim();
    const dueDate = dueDateInput ? new Date(dueDateInput) : computeDefaultTaskDueDate();
    const assignedToEmail =
      normalizeEmail(req.body.assignedToEmail) ||
      normalizeEmail(vulnerability.authorEmail) ||
      normalizeEmail(vulnerability.assignedTo) ||
      null;
    const shouldCreateAsana = req.body.createInAsana !== false;
    const shouldSendEmail = req.body.sendEmail !== false;

    if (Number.isNaN(dueDate.getTime())) {
      return res.status(400).json({ success: false, message: "Due date is invalid." });
    }

    let assignedToUser = null;
    if (assignedToEmail) {
      const userFilter = { email: assignedToEmail };
      if (req.authUser.organizationId) {
        userFilter.organizationId = req.authUser.organizationId;
      }
      assignedToUser = await User.findOne(userFilter).select("_id name email");
    }

    let organizationName = null;
    if (req.authUser.organizationId) {
      const org = await Organization.findById(req.authUser.organizationId).select("name");
      organizationName = org?.name || null;
    }

    const description =
      String(req.body.description || "").trim() ||
      buildTaskDescription({
        vulnerability,
        assignedByName: req.authUser.name || req.authUser.email,
        assignedByEmail: req.authUser.email || null,
        assignedToEmail,
        organizationName,
        note,
        recommendation,
      });

    const asanaResult = shouldCreateAsana
      ? await createAsanaRemediationTask({
          name: title,
          notes: description,
          dueDate,
          assigneeEmail: assignedToEmail,
        })
      : {
          created: false,
          skipped: true,
          syncStatus: "SKIPPED",
          message: "Asana sync was skipped by the user.",
          gid: null,
          url: null,
        };

    const task = await RemediationTask.create({
      title,
      description,
      remediationRecommendation: recommendation,
      vulnerabilityId: vulnerability._id,
      organizationId: vulnerability.organizationId || req.authUser.organizationId || null,
      repoName: vulnerability.repoName || vulnerability.repoUrl || null,
      repoUrl: vulnerability.repoUrl || null,
      branch: vulnerability.branch || null,
      filePath: vulnerability.file || null,
      lineNumber: vulnerability.line ?? null,
      secretType: vulnerability.secretType || "Secret",
      severity: vulnerability.severity || "MEDIUM",
      assignedToEmail,
      assignedToUserId: assignedToUser?._id || null,
      assignedByUserId: req.authUser._id,
      assignedByName: req.authUser.name || req.authUser.email || null,
      asanaTaskGid: asanaResult.gid,
      asanaTaskUrl: asanaResult.url,
      asanaAssignmentResolved: Boolean(asanaResult.assigneeResolved),
      asanaAssignmentMessage: asanaResult.assignmentMessage || asanaResult.message || null,
      asanaSyncStatus: asanaResult.syncStatus,
      dueDate,
      status: "OPEN",
    });

    let emailResult = {
      delivered: false,
      skipped: true,
      message: "Email notification was skipped.",
    };

    if (shouldSendEmail) {
      emailResult = await sendTaskAssignmentEmail({
        to: assignedToEmail,
        title,
        repoName: vulnerability.repoName || vulnerability.repoUrl || "Repository",
        branch: vulnerability.branch || null,
        filePath: vulnerability.file || null,
        lineNumber: vulnerability.line ?? null,
        secretType: vulnerability.secretType || "Secret",
        severity: vulnerability.severity || "MEDIUM",
        repoUrl: vulnerability.repoUrl || null,
        author: vulnerability.author || null,
        authorEmail: vulnerability.authorEmail || null,
        commitHash: vulnerability.commitHash || null,
        commitTime: vulnerability.commitTime || null,
        vulnerabilityStatus: vulnerability.status || "OPEN",
        dueDateLabel: toDateOnlyInput(dueDate),
        assignedBy: req.authUser.name || req.authUser.email || "SecureScan",
        assignedByEmail: req.authUser.email || null,
        adminNote: note || null,
        recommendation,
        asanaTaskUrl: asanaResult.url,
        asanaAssignedLabel: asanaResult.assigneeResolved
          ? asanaResult.assigneeName || asanaResult.assigneeEmail || "Assigned in Asana"
          : null,
        asanaAssignmentMessage: asanaResult.assignmentMessage || asanaResult.message || null,
        asanaSyncStatus: asanaResult.syncStatus || null,
        asanaWorkspaceName: asanaResult.workspaceName || null,
        asanaProjectName: asanaResult.projectName || null,
        internalReference: String(task._id),
        organizationName,
      });
    }

    if (emailResult.delivered || emailResult.message) {
      task.emailNotificationSent = Boolean(emailResult.delivered);
      task.emailNotificationError = emailResult.delivered ? null : emailResult.message || null;
      await task.save();
    }

    const warnings = [];
    if (!assignedToEmail) {
      warnings.push("Developer email was not available. The task was created without an email assignee.");
    }
    if (!asanaResult.created) {
      warnings.push(asanaResult.message);
    } else if (asanaResult.assignmentMessage) {
      warnings.push(asanaResult.assignmentMessage);
    }
    if (!emailResult.delivered) {
      warnings.push(emailResult.message);
    }

    const populatedTask = await RemediationTask.findById(task._id)
      .populate("assignedByUserId", "name email")
      .populate("assignedToUserId", "name email")
      .populate("vulnerabilityId")
      .lean();

    return res.status(201).json({
      success: true,
      message: "Remediation task created successfully.",
      task: {
        ...populatedTask,
        computedStatus: deriveTaskStatus(populatedTask),
      },
      asana: asanaResult,
      email: emailResult,
      warnings: warnings.filter(Boolean),
    });
  } catch (error) {
    console.error("Create task failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create remediation task." });
  }
}

async function listTasks(req, res) {
  try {
    const tasks = await RemediationTask.find(buildTaskScope(req))
      .populate("assignedByUserId", "name email")
      .populate("assignedToUserId", "name email")
      .populate("vulnerabilityId", "repoName repoUrl branch file line secretType severity status author authorEmail")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      tasks: tasks.map((task) => ({
        ...task,
        computedStatus: deriveTaskStatus(task),
      })),
    });
  } catch (error) {
    console.error("List tasks failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load remediation tasks." });
  }
}

async function getTask(req, res) {
  try {
    const task = await RemediationTask.findOne({
      _id: req.params.id,
      ...buildTaskScope(req),
    })
      .populate("assignedByUserId", "name email")
      .populate("assignedToUserId", "name email")
      .populate("vulnerabilityId")
      .lean();

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found." });
    }

    return res.json({
      success: true,
      task: {
        ...task,
        computedStatus: deriveTaskStatus(task),
      },
    });
  } catch (error) {
    console.error("Get task failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load remediation task." });
  }
}

async function updateTaskStatus(req, res) {
  try {
    const nextStatus = String(req.body.status || "").trim().toUpperCase();
    if (!["OPEN", "IN_PROGRESS", "DONE", "FAILED", "OVERDUE"].includes(nextStatus)) {
      return res.status(400).json({ success: false, message: "Invalid task status." });
    }

    const task = await RemediationTask.findOne({
      _id: req.params.id,
      ...buildTaskScope(req),
    });

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found." });
    }

    task.status = nextStatus;
    await task.save();

    const populatedTask = await RemediationTask.findById(task._id)
      .populate("assignedByUserId", "name email")
      .populate("assignedToUserId", "name email")
      .populate("vulnerabilityId")
      .lean();

    return res.json({
      success: true,
      message: "Task status updated.",
      task: {
        ...populatedTask,
        computedStatus: deriveTaskStatus(populatedTask),
      },
    });
  } catch (error) {
    console.error("Update task status failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update task status." });
  }
}

module.exports = {
  createTask,
  listTasks,
  getTask,
  updateTaskStatus,
};
