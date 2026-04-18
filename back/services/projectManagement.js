const ASANA_BASE_URL = "https://app.asana.com/api/1.0";
const nodemailer = require("nodemailer");

function getGoogleOAuthConfig() {
  return {
    user: sanitizeText(process.env.GOOGLE_OAUTH_USER) || sanitizeText(process.env.SMTP_USER),
    clientId: sanitizeText(process.env.GOOGLE_OAUTH_CLIENT_ID),
    clientSecret: sanitizeText(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    refreshToken: sanitizeText(process.env.GOOGLE_OAUTH_REFRESH_TOKEN),
    accessToken: sanitizeText(process.env.GOOGLE_OAUTH_ACCESS_TOKEN),
  };
}

function hasGoogleOAuthConfig(config) {
  return !!(config.user && config.clientId && config.clientSecret && config.refreshToken);
}

function sanitizeText(value) {
  return String(value || "").trim();
}

function buildDueDate(explicitDate) {
  const parsed = sanitizeText(explicitDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return parsed;

  const dueDays = Number.parseInt(process.env.REMEDIATION_TASK_DUE_DAYS || "2", 10);
  const safeDays = Number.isFinite(dueDays) && dueDays > 0 ? dueDays : 2;

  const date = new Date();
  date.setDate(date.getDate() + safeDays);
  return date.toISOString().slice(0, 10);
}

async function asanaRequest(path, { token, method = "GET", body } = {}) {
  if (typeof fetch !== "function") {
    const error = new Error("Global fetch is unavailable in this Node runtime.");
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch(`${ASANA_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const reason = payload?.errors?.[0]?.message || payload?.message || `Asana API request failed (${response.status})`;
    const error = new Error(reason);
    error.statusCode = response.status;
    throw error;
  }

  return payload || {};
}

async function resolveWorkspaceId(token, explicitWorkspaceId) {
  if (sanitizeText(explicitWorkspaceId)) return sanitizeText(explicitWorkspaceId);

  const workspaces = await asanaRequest("/workspaces?opt_fields=gid,name", { token });
  const firstWorkspace = Array.isArray(workspaces?.data) ? workspaces.data[0] : null;
  return firstWorkspace?.gid || null;
}

async function resolveAssignee(token, workspaceId, contributorEmail) {
  if (!workspaceId || !sanitizeText(contributorEmail)) return null;

  const response = await asanaRequest(
    `/workspaces/${workspaceId}/users?opt_fields=gid,name,email`,
    { token }
  );

  const users = Array.isArray(response?.data) ? response.data : [];
  const targetEmail = sanitizeText(contributorEmail).toLowerCase();

  return users.find((user) => sanitizeText(user?.email).toLowerCase() === targetEmail) || null;
}

function buildTaskNotes({
  contributorName,
  contributorEmail,
  repoUrl,
  branch,
  dueOn,
  findings,
  summary,
  requestedBy,
}) {
  const topFindings = (Array.isArray(findings) ? findings : []).slice(0, 8);
  const findingLines = topFindings.length
    ? topFindings
        .map((item, index) => {
          const file = sanitizeText(item?.file) || "unknown file";
          const line = sanitizeText(item?.line) || "N/A";
          const type = sanitizeText(item?.type || item?.secretType) || "Secret";
          return `${index + 1}. ${type} at ${file}:${line}`;
        })
        .join("\n")
    : "1. Review all flagged secrets from the latest SecureScan report.";

  const requestedByLabel = requestedBy?.email || requestedBy?.name
    ? `${sanitizeText(requestedBy?.name) || "Unknown"} (${sanitizeText(requestedBy?.email) || "no-email"})`
    : "SecureScan system";

  const totalFindings = Number(summary?.secretsFound || topFindings.length || 0);

  return [
    "SecureScan detected leaked secrets that need immediate remediation.",
    `This task was auto-created because ${totalFindings} finding(s) were linked to your recent repository activity.`,
    "",
    `Assignee: ${sanitizeText(contributorName) || "Unknown contributor"}`,
    `Email: ${sanitizeText(contributorEmail) || "Unavailable"}`,
    `Repository: ${sanitizeText(repoUrl) || "Unknown repo"}`,
    `Branch: ${sanitizeText(branch) || "Unknown branch"}`,
    `Deadline: ${dueOn}`,
    `Total findings: ${Number(summary?.secretsFound || 0)}`,
    `Files impacted: ${Number(summary?.filesWithSecrets || 0)}`,
    `Requested by: ${requestedByLabel}`,
    "",
    "Remediation Steps:",
    "1. Revoke and rotate the exposed key(s) immediately.",
    "2. Remove hardcoded secrets and load values from secure environment variables.",
    "3. Update repository history if needed to eliminate leaked credentials from old commits.",
    "4. Add/verify secret scanning and pre-commit checks.",
    "5. Push fixes and re-run SecureScan verification.",
    "",
    "Priority Findings:",
    findingLines,
  ].join("\n");
}

function getNotificationTransporter() {
  const host = sanitizeText(process.env.SMTP_HOST);
  const port = Number.parseInt(String(process.env.SMTP_PORT || "587"), 10);
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = sanitizeText(process.env.SMTP_USER);
  const pass = sanitizeText(process.env.SMTP_PASS);

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth: { user, pass },
  });
}

async function fetchGoogleAccessToken(config) {
  if (config.accessToken) return config.accessToken;

  const payload = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const reason = data?.error_description || data?.error || "Unable to refresh Google access token.";
    throw new Error(reason);
  }

  return String(data.access_token);
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sendViaGmailApi({ config, recipient, subject, text, html, fromAddress }) {
  const accessToken = await fetchGoogleAccessToken(config);
  const mimeMessage = [
    `From: SecureScan <${fromAddress}>`,
    `To: ${recipient}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    html || String(text || "").replace(/\n/g, "<br/>")
  ].join("\r\n");

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: toBase64Url(mimeMessage) }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = data?.error?.message || "Gmail API send failed.";
    throw new Error(reason);
  }

  return {
    delivered: true,
    skipped: false,
    messageId: data?.id || null,
    recipient,
    provider: "gmail-api",
  };
}

async function sendRemediationTaskEmail({
  contributorName,
  contributorEmail,
  taskUrl,
  dueOn,
  repoUrl,
  branch,
  findings,
  summary,
}) {
  const recipient = sanitizeText(contributorEmail).toLowerCase();
  if (!recipient) {
    return { delivered: false, skipped: true, reason: "Contributor email is missing." };
  }

  const googleConfig = getGoogleOAuthConfig();
  const transporter = getNotificationTransporter();
  if (!hasGoogleOAuthConfig(googleConfig) && !transporter) {
    return { delivered: false, skipped: true, reason: "Neither Google OAuth2 nor SMTP is configured." };
  }

  const topFindings = (Array.isArray(findings) ? findings : []).slice(0, 6);
  const totalFindings = Number(summary?.secretsFound || topFindings.length || 0);
  const findingLines = topFindings.length
    ? topFindings
        .map((item, idx) => {
          const file = sanitizeText(item?.file) || "unknown file";
          const line = sanitizeText(item?.line) || "N/A";
          const type = sanitizeText(item?.type || item?.secretType) || "Secret";
          return `${idx + 1}. ${type} at ${file}:${line}`;
        })
        .join("\n")
    : "1. Review the SecureScan report and resolve all exposed credentials.";

  const fromAddress = sanitizeText(process.env.SMTP_FROM) || googleConfig.user || sanitizeText(process.env.SMTP_USER);
  const subject = `[SecureScan] Remediation task assigned for ${sanitizeText(repoUrl) || "repository"}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin:0 0 8px;">New Remediation Task Assigned</h2>
      <p>Hello ${sanitizeText(contributorName) || "Developer"},</p>
      <p>
        A SecureScan remediation task has been assigned to you because ${totalFindings} finding(s)
        were linked to your commits.
      </p>
      <p><strong>Repository:</strong> ${sanitizeText(repoUrl) || "Unknown"}<br/>
      <strong>Branch:</strong> ${sanitizeText(branch) || "Unknown"}<br/>
      <strong>Deadline:</strong> ${sanitizeText(dueOn) || "Not set"}</p>
      <p>Please complete this task by clicking the link below:</p>
      <p style="margin:16px 0;">
        <a href="${sanitizeText(taskUrl)}" style="display:inline-block;padding:10px 14px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;">
          Open Asana Task
        </a>
      </p>
      <p><strong>Steps to resolve:</strong></p>
      <ol>
        <li>Revoke and rotate exposed keys immediately.</li>
        <li>Move secrets to environment variables/secret manager.</li>
        <li>Remove leaked values from code and history if required.</li>
        <li>Run SecureScan again and verify zero remaining leaks.</li>
      </ol>
      <p><strong>Priority findings:</strong></p>
      <pre style="white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0;">${findingLines}</pre>
    </div>
  `;

  const text = [
    `Hello ${sanitizeText(contributorName) || "Developer"},`,
    "",
    `A SecureScan remediation task has been assigned to you because ${totalFindings} finding(s) were linked to your commits.`,
    `Repository: ${sanitizeText(repoUrl) || "Unknown"}`,
    `Branch: ${sanitizeText(branch) || "Unknown"}`,
    `Deadline: ${sanitizeText(dueOn) || "Not set"}`,
    `Asana Task: ${sanitizeText(taskUrl) || "Not available"}`,
    "Please complete this task by opening the Asana link above.",
    "",
    "Steps to resolve:",
    "1. Revoke and rotate exposed keys immediately.",
    "2. Move secrets to environment variables/secret manager.",
    "3. Remove leaked values from code and history if required.",
    "4. Run SecureScan again and verify zero remaining leaks.",
    "",
    "Priority findings:",
    findingLines,
  ].join("\n");

  try {
    if (hasGoogleOAuthConfig(googleConfig)) {
      return await sendViaGmailApi({
        config: googleConfig,
        recipient,
        subject,
        text,
        html,
        fromAddress,
      });
    }

    const info = await transporter.sendMail({
      from: fromAddress,
      to: recipient,
      subject,
      text,
      html,
    });

    return {
      delivered: true,
      skipped: false,
      messageId: info.messageId,
      recipient,
      provider: "smtp",
    };
  } catch (error) {
    return {
      delivered: false,
      skipped: false,
      reason: error.message,
      recipient,
    };
  }
}

async function createAsanaTask(options) {
  const asanaToken = sanitizeText(options?.asanaToken) || sanitizeText(process.env.ASANA_ACCESS_TOKEN);
  if (!asanaToken) {
    const error = new Error("Asana access token is not configured.");
    error.statusCode = 400;
    throw error;
  }

  const workspaceId =
    sanitizeText(options?.workspaceId) ||
    sanitizeText(process.env.ASANA_WORKSPACE_GID) ||
    (await resolveWorkspaceId(asanaToken, null));

  const projectId =
    sanitizeText(options?.projectId) ||
    sanitizeText(process.env.ASANA_PROJECT_GID) ||
    null;

  if (!workspaceId && !projectId) {
    const error = new Error("Unable to resolve an Asana workspace/project for task creation.");
    error.statusCode = 400;
    throw error;
  }

  const dueOn = buildDueDate(options?.dueDate);
  const assignee = await resolveAssignee(asanaToken, workspaceId, options?.contributorEmail);

  const taskName = `[SecureScan] Remediate leaked secrets: ${sanitizeText(options?.contributorName) || sanitizeText(options?.contributorEmail) || "unknown contributor"}`;
  const taskNotes = buildTaskNotes({
    contributorName: options?.contributorName,
    contributorEmail: options?.contributorEmail,
    repoUrl: options?.repoUrl,
    branch: options?.branch,
    dueOn,
    findings: options?.findings,
    summary: options?.summary,
    requestedBy: options?.requestedBy,
  });

  const taskPayload = {
    name: taskName,
    notes: taskNotes,
    due_on: dueOn,
  };

  if (workspaceId) taskPayload.workspace = workspaceId;
  if (projectId) taskPayload.projects = [projectId];
  if (assignee?.gid) taskPayload.assignee = assignee.gid;

  const response = await asanaRequest("/tasks", {
    token: asanaToken,
    method: "POST",
    body: { data: taskPayload },
  });

  const task = response?.data || {};
  const taskUrl = task.permalink_url || (task.gid ? `https://app.asana.com/0/0/${task.gid}` : null);
  const notification = await sendRemediationTaskEmail({
    contributorName: options?.contributorName,
    contributorEmail: options?.contributorEmail,
    taskUrl,
    dueOn,
    repoUrl: options?.repoUrl,
    branch: options?.branch,
    findings: options?.findings,
    summary: options?.summary,
  });

  return {
    provider: "asana",
    taskId: task.gid || null,
    taskUrl,
    dueOn,
    assigneeMatched: !!assignee?.gid,
    assigneeName: assignee?.name || null,
    assigneeEmail: assignee?.email || sanitizeText(options?.contributorEmail) || null,
    workspaceId: workspaceId || null,
    projectId: projectId || null,
    notification,
  };
}

async function createProjectManagementTask(options = {}) {
  const provider = sanitizeText(options.provider || "asana").toLowerCase();

  if (provider === "jira") {
    const error = new Error("Jira integration hook is ready, but Jira API flow is not configured in this build yet.");
    error.statusCode = 501;
    throw error;
  }

  if (provider !== "asana") {
    const error = new Error(`Unsupported provider: ${provider}`);
    error.statusCode = 400;
    throw error;
  }

  return createAsanaTask(options);
}

module.exports = {
  createProjectManagementTask,
};
